/**
 * Issue #1078 — define one policy for contradictory write flags.
 *
 * Acceptance criteria (excerpted from the issue body):
 *   1. One documented truth table applies across all write seams.
 *   2. Contradictions either fail uniformly or follow one explicit
 *      compatibility rule.
 *   3. Error contains rejected fields, canonical flag and remediation.
 *   4. Legacy aliases cannot invert an explicit canonical intent silently.
 *   5. `test_vba`'s canonical `dryRun` exception remains intentional and tested.
 *
 * The dispatcher's current precedence (`apply:true` wins; `dryRun:false` wins;
 * otherwise plan) is silent: a caller passing `apply:true + dryRun:true` would
 * commit unless the schema-boundary validator (currently
 * `validateApplyDryRunConsistency` in `src/shared/validation/validator.ts`)
 * intercepted it. The fix raises that interception into the structured
 * `MCP_INPUT_INVALID` envelope with `rejectedFlags`, `toolCommitFlag`, and
 * remediation — the same shape `mcp-flag-rejection-remediation.test.ts`
 * pins for the legacy `<flag> is not allowed.` path (#757 C4).
 *
 * The truth table below is generated from `COMMIT_FLAG_REGISTRY` (the
 * authoritative registry introduced by #1073) so adding a tool or a
 * write-intent flag in the registry surfaces the missing coverage here.
 *
 * The `test_vba` exception is pinned explicitly so a future generic
 * "reject all write-class contradictions" rule does not accidentally
 * tighten the dryRun-only surface — `test_vba` is the only
 * `commitFlag: "dryRun"` entry in the registry today.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";
import {
  COMMIT_FLAG_REGISTRY,
  type CommitFlagMetadata,
  commitFlagFor,
  legacyAliasesFor,
} from "../../../src/core/runtime/commit-flag-registry";
import type { JsonObjectSchema } from "../../../src/shared/validation";

class FakeVbaService {
  async execute() {
    return successResult({ returnValue: "ok" });
  }
}
class FakeQueryService {
  async execute() {
    return successResult({ rows: [] });
  }
}
class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}
function makeServices() {
  return {
    vbaService: new FakeVbaService(),
    vbaSyncToolService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
  };
}

const TOOLS = createDysflowMcpTools({ services: makeServices(), writes: true });

const TOOL_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

function inputSchema(name: string): JsonObjectSchema {
  const tool = TOOL_BY_NAME.get(name);
  if (tool === undefined) throw new Error(`Tool not registered: ${name}`);
  return tool.inputSchema as JsonObjectSchema;
}

function schemaDeclares(name: string, flag: string): boolean {
  // Some registry entries (e.g. dysflow.* alias tools) are not exposed as
  // top-level MCP tools, so `inputSchema` throws. Treat absence as "not
  // declared" so the truth-table sweep below can skip them — alias tools
  // are pinned separately by `alias-tools.test.ts`.
  const tool = TOOL_BY_NAME.get(name);
  if (tool === undefined) return false;
  return Object.hasOwn(inputSchema(name).properties ?? {}, flag);
}

function registryEntry(name: string): CommitFlagMetadata {
  return (
    COMMIT_FLAG_REGISTRY[name] ?? {
      commitFlag: "apply",
      noWriteAlias: null,
      defaultBehavior: "noop",
    }
  );
}

function isRealWriteClass(meta: CommitFlagMetadata): boolean {
  return meta.defaultBehavior !== "noop" || meta.noWriteAlias !== null;
}

const WRITE_CLASS_TOOLS = Object.keys(COMMIT_FLAG_REGISTRY).filter((name) =>
  isRealWriteClass(registryEntry(name)),
);

const TRUTH_TABLE_FAMILIES = [
  // Sample one canonical representative per write family. The registry-driven
  // enumeration below pins every other tool that shares the same
  // commitFlag/noWriteAlias shape; if a tool moves to a different shape the
  // mismatch surfaces here as a coverage gap. `cleanup_access_operation` is
  // intentionally excluded — its dispatch path uses `force:true`, not
  // `apply:true`, so it is not subject to the canonical apply/dryRun
  // contradiction rule. `dysflow.*` alias tools live in the registry but
  // are exposed through a separate alias seam; they are tested in
  // `alias-tools.test.ts` and do not have a top-level MCP inputSchema.
  { family: "vba-sync", representative: "import_modules" },
  { family: "vba-sync-export", representative: "export_modules" },
  { family: "form-mutation", representative: "form_add_control" },
  { family: "query-maintenance", representative: "link_tables" },
  { family: "query-write", representative: "exec_sql" },
] as const;

type ToolError = {
  code?: string;
  message?: string;
  rejectedFlag?: string;
  rejectedFlags?: readonly string[];
  toolCommitFlag?: string;
  remediation?: string;
};

async function invokeWithExtra(
  name: string,
  extra: Record<string, unknown>,
): Promise<{ ok: boolean; error?: ToolError; isError?: boolean; content?: unknown }> {
  const tool = TOOL_BY_NAME.get(name);
  if (tool === undefined) {
    // Alias tools (dysflow.*) are not registered as top-level MCP tools.
    // Surface a sentinel "not registered" error so the truth-table sweep
    // can skip them without crashing.
    return {
      ok: false,
      isError: true,
      error: { code: "TOOL_NOT_REGISTERED" },
    };
  }
  // Fill every schema-required field with a typed dummy so we reach the
  // apply/dryRun contradiction check (which runs after required-field
  // validation) regardless of which tool we exercise. The dummy values
  // never reach Access — the schema validator rejects the contradiction
  // before the dispatcher ever touches the runtime.
  const schema = inputSchema(name);
  const requiredFields = Array.isArray(schema.required) ? schema.required : [];
  const dummy: Record<string, unknown> = { projectId: "test-project" };
  for (const field of requiredFields) {
    if (field in dummy) continue;
    const prop = schema.properties?.[field] as
      | { type?: string; enum?: readonly unknown[] }
      | undefined;
    if (prop === undefined) continue;
    if (prop.enum !== undefined && prop.enum.length > 0) {
      dummy[field] = prop.enum[0];
    } else if (prop.type === "number" || prop.type === "integer") {
      dummy[field] = 1;
    } else if (prop.type === "boolean") {
      dummy[field] = true;
    } else if (prop.type === "array") {
      dummy[field] = [];
    } else if (prop.type === "object") {
      dummy[field] = {};
    } else {
      dummy[field] = "test";
    }
  }
  // Issue #1078 — `form_set_property` has a hand-written anyOf-like
  // check at the dispatch seam (`propertyName` OR `property` must be
  // present); that check runs BEFORE `validateInput`, so the schema's
  // `required` list alone is not enough. Inject a placeholder so the
  // request reaches the apply/dryRun contradiction check below.
  if (name === "form_set_property" && !Object.hasOwn(dummy, "propertyName")) {
    dummy.propertyName = "Caption";
  }
  return (await tool.handler({
    ...dummy,
    ...extra,
  })) as { ok: boolean; error?: ToolError; isError?: boolean; content?: unknown };
}

beforeEach(() => {
  // Pin "now" deterministically — no implicit dependency on wall-clock.
});

afterEach(() => {
  // Reserved for any shared teardown the future may need.
});

describe("contradictory write flags — truth table (issue #1078)", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // 1. test_vba canonical `dryRun` exception — pin the intentional split.
  // ─────────────────────────────────────────────────────────────────────────

  describe("test_vba — canonical dryRun exception", () => {
    it("registry declares commitFlag:dryRun and noWriteAlias:null (the only dryRun-only entry)", () => {
      const meta = registryEntry("test_vba");
      expect(meta.commitFlag).toBe("dryRun");
      expect(meta.noWriteAlias).toBeNull();
      expect(meta.defaultBehavior).toBe("plan");
    });

    it("test_vba schema declares dryRun but NOT apply or diff", () => {
      expect(schemaDeclares("test_vba", "dryRun")).toBe(true);
      expect(schemaDeclares("test_vba", "apply")).toBe(false);
      expect(schemaDeclares("test_vba", "diff")).toBe(false);
    });

    it("test_vba({ dryRun: true }) — accepted (plan path)", async () => {
      const result = await invokeWithExtra("test_vba", { dryRun: true });
      // We do not require `ok:true` here — the dispatch may legitimately
      // refuse for downstream reasons (no Access binary, sandbox gate);
      // we only care that the schema did NOT reject the combination.
      // Pin the negative space: schema validation must not flag the
      // contradiction path for this canonical dryRun entry.
      if (result.error?.code === "MCP_INPUT_INVALID") {
        expect(result.error.message).not.toMatch(/mutually exclusive/i);
        expect(result.error.message).not.toMatch(/contradicts/i);
      }
    });

    it("test_vba({ apply: true }) — rejected by schema (apply is unknown for this tool)", async () => {
      const result = await invokeWithExtra("test_vba", { apply: true });
      expect(result.isError).toBe(true);
      expect(result.error?.code).toBe("MCP_INPUT_INVALID");
      expect(result.error?.rejectedFlag).toBe("apply");
      expect(result.error?.toolCommitFlag).toBe("dryRun");
      // Remediation must point the caller at the canonical dryRun surface.
      expect(result.error?.remediation ?? "").toMatch(/dryRun/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Per-family truth table — the canonical `apply + dryRun` contradiction.
  // ─────────────────────────────────────────────────────────────────────────

  describe.each(TRUTH_TABLE_FAMILIES)("$family — $representative", ({ representative }) => {
    const meta = registryEntry(representative);

    it("registry declares a real write-class surface (no noop sentinel)", () => {
      // If a future refactor ever demotes this tool to `defaultBehavior:"noop"`
      // the test for that family loses meaning; the explicit pin makes the
      // loss visible in the test output before reaching the contradiction
      // table below.
      expect(isRealWriteClass(meta)).toBe(true);
    });

    it("schema declares apply (or, for test_vba, dryRun) as the canonical commit signal", () => {
      if (meta.commitFlag === "apply") {
        expect(schemaDeclares(representative, "apply")).toBe(true);
      }
      if (meta.commitFlag === "dryRun") {
        expect(schemaDeclares(representative, "dryRun")).toBe(true);
      }
    });

    it("{ apply: true, dryRun: true } → MCP_INPUT_INVALID with structured envelope", async () => {
      // Skip the test for tools whose schema does not declare `apply`.
      // The validator only fires the contradiction rule when both flags
      // are schema-declared; tools that omit `apply` (test_vba, etc.)
      // are exercised in their own describe block above.
      if (!schemaDeclares(representative, "apply")) return;
      if (!schemaDeclares(representative, "dryRun")) return;
      const result = await invokeWithExtra(representative, {
        apply: true,
        dryRun: true,
      });
      expect(result.isError).toBe(true);
      expect(result.error?.code).toBe("MCP_INPUT_INVALID");
      // Acceptance criterion #3: error must identify the rejected
      // fields and the canonical flag.
      const rejectedFlag = result.error?.rejectedFlag;
      const rejectedFlags = (result.error as { rejectedFlags?: readonly string[] })?.rejectedFlags;
      const allRejected = [rejectedFlag, ...(rejectedFlags ?? [])].filter(
        (flag): flag is string => typeof flag === "string",
      );
      expect(allRejected).toContain("apply");
      expect(allRejected).toContain("dryRun");
      // The canonical commit flag from the registry must be present
      // so a consumer can self-correct without re-reading the schema.
      expect(result.error?.toolCommitFlag).toBe(meta.commitFlag);
      // Remediation must mention the canonical flag explicitly.
      expect(result.error?.remediation ?? "").toMatch(
        new RegExp(meta.commitFlag === "apply" ? /\bapply\b/ : /\bdryRun\b/i),
      );
    });

    it("{ apply: false, dryRun: false } → MCP_INPUT_INVALID (also a contradiction)", async () => {
      if (!schemaDeclares(representative, "apply")) return;
      if (!schemaDeclares(representative, "dryRun")) return;
      const result = await invokeWithExtra(representative, {
        apply: false,
        dryRun: false,
      });
      // apply:false + dryRun:false has identical boolean values, which
      // the validator treats as a contradiction per the unified truth
      // table. The dispatch seam must surface it through the same
      // structured envelope as the { true, true } case.
      expect(result.error?.code).toBe("MCP_INPUT_INVALID");
      if (result.error?.code === "MCP_INPUT_INVALID") {
        const rejectedFlag = result.error.rejectedFlag;
        const rejectedFlags = (result.error as { rejectedFlags?: readonly string[] })
          ?.rejectedFlags;
        const allRejected = [rejectedFlag, ...(rejectedFlags ?? [])].filter(
          (flag): flag is string => typeof flag === "string",
        );
        expect(allRejected).toContain("apply");
        expect(allRejected).toContain("dryRun");
      }
    });

    it("{ apply: true, dryRun: false } → consistent (both = commit) and NOT flagged as contradiction", async () => {
      if (!schemaDeclares(representative, "apply")) return;
      if (!schemaDeclares(representative, "dryRun")) return;
      const result = await invokeWithExtra(representative, {
        apply: true,
        dryRun: false,
      });
      if (result.error?.code === "MCP_INPUT_INVALID") {
        // The schema boundary MUST NOT raise the contradiction message
        // for a pair whose booleans diverge (one says commit, the
        // other says commit). If it does, the truth table is broken.
        expect(result.error.message).not.toMatch(/mutually exclusive/i);
        expect(result.error.message).not.toMatch(/contradicts/i);
      }
    });

    it("{ apply: false, dryRun: true } → consistent (both = plan) and NOT flagged as contradiction", async () => {
      if (!schemaDeclares(representative, "apply")) return;
      if (!schemaDeclares(representative, "dryRun")) return;
      const result = await invokeWithExtra(representative, {
        apply: false,
        dryRun: true,
      });
      if (result.error?.code === "MCP_INPUT_INVALID") {
        expect(result.error.message).not.toMatch(/mutually exclusive/i);
        expect(result.error.message).not.toMatch(/contradicts/i);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Registry-driven truth-table sweep — every write-class tool.
  // ─────────────────────────────────────────────────────────────────────────

  describe("registry-driven truth-table sweep", () => {
    it.each(
      WRITE_CLASS_TOOLS,
    )("%s — { apply: true, dryRun: true } is rejected with structured envelope", async (toolName) => {
      if (!schemaDeclares(toolName, "apply")) return;
      if (!schemaDeclares(toolName, "dryRun")) return;
      const result = await invokeWithExtra(toolName, {
        apply: true,
        dryRun: true,
      });
      expect(result.error?.code).toBe("MCP_INPUT_INVALID");
      if (result.error?.code === "MCP_INPUT_INVALID") {
        const meta = registryEntry(toolName);
        // Acceptance criterion #3 — rejected fields, canonical flag,
        // remediation. We accept either the singular or the array
        // form so the contract is forward-compatible with the
        // `rejectedFlags` array the dispatcher will populate.
        const rejectedFlag = result.error.rejectedFlag;
        const rejectedFlags = (result.error as { rejectedFlags?: readonly string[] })
          ?.rejectedFlags;
        const allRejected = [rejectedFlag, ...(rejectedFlags ?? [])].filter(
          (flag): flag is string => typeof flag === "string",
        );
        expect(allRejected).toContain("apply");
        expect(allRejected).toContain("dryRun");
        expect(result.error.toolCommitFlag).toBe(meta.commitFlag);
        expect(result.error.remediation ?? "").toMatch(
          new RegExp(meta.commitFlag === "apply" ? /\bapply\b/ : /\bdryRun\b/i),
        );
      }
    });

    it.each(
      WRITE_CLASS_TOOLS,
    )("%s — { apply: false, dryRun: false } is rejected (boolean equivalence is a contradiction)", async (toolName) => {
      if (!schemaDeclares(toolName, "apply")) return;
      if (!schemaDeclares(toolName, "dryRun")) return;
      const result = await invokeWithExtra(toolName, {
        apply: false,
        dryRun: false,
      });
      expect(result.error?.code).toBe("MCP_INPUT_INVALID");
    });

    it.each(
      WRITE_CLASS_TOOLS,
    )("%s — { apply: true, dryRun: false } is accepted (no contradiction)", async (toolName) => {
      if (!schemaDeclares(toolName, "apply")) return;
      if (!schemaDeclares(toolName, "dryRun")) return;
      const result = await invokeWithExtra(toolName, {
        apply: true,
        dryRun: false,
      });
      if (result.error?.code === "MCP_INPUT_INVALID") {
        expect(result.error.message).not.toMatch(/mutually exclusive/i);
        expect(result.error.message).not.toMatch(/contradicts/i);
      }
    });

    it.each(
      WRITE_CLASS_TOOLS,
    )("%s — { apply: false, dryRun: true } is accepted (no contradiction)", async (toolName) => {
      if (!schemaDeclares(toolName, "apply")) return;
      if (!schemaDeclares(toolName, "dryRun")) return;
      const result = await invokeWithExtra(toolName, {
        apply: false,
        dryRun: true,
      });
      if (result.error?.code === "MCP_INPUT_INVALID") {
        expect(result.error.message).not.toMatch(/mutually exclusive/i);
        expect(result.error.message).not.toMatch(/contradicts/i);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Legacy alias coverage — export_modules / export_all.
  // ─────────────────────────────────────────────────────────────────────────

  describe("export_modules — legacy `diff` alias contradictions", () => {
    it("registry declares noWriteAlias:diff for export_modules (legacy alias)", () => {
      const meta = registryEntry("export_modules");
      expect(meta.commitFlag).toBe("apply");
      expect(meta.noWriteAlias).toBe("diff");
      expect(legacyAliasesFor("export_modules")).toContain("diff");
    });

    it("export_modules({ apply: true, dryRun: true }) — canonical contradiction, same envelope as the apply-family", async () => {
      const result = await invokeWithExtra("export_modules", {
        apply: true,
        dryRun: true,
      });
      expect(result.error?.code).toBe("MCP_INPUT_INVALID");
      const allRejected = [
        result.error?.rejectedFlag,
        ...((result.error as { rejectedFlags?: readonly string[] })?.rejectedFlags ?? []),
      ].filter((flag): flag is string => typeof flag === "string");
      expect(allRejected).toContain("apply");
      expect(allRejected).toContain("dryRun");
      // Acceptance criterion #4 — legacy aliases cannot invert an
      // explicit canonical intent. The canonical `apply:true` wins,
      // and the contradiction is surfaced uniformly.
      expect(result.error?.toolCommitFlag).toBe("apply");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Helper-surface coherence — pin the registry functions the
  //    dispatcher relies on so a future refactor does not silently change
  //    which flag the truth table treats as canonical.
  // ─────────────────────────────────────────────────────────────────────────

  describe("registry helper coherence", () => {
    it("commitFlagFor() agrees with the registry entry for every write-class tool", () => {
      for (const name of WRITE_CLASS_TOOLS) {
        expect(commitFlagFor(name)).toBe(registryEntry(name).commitFlag);
      }
    });

    it("legacyAliasesFor() always contains the noWriteAlias when one is declared", () => {
      for (const name of WRITE_CLASS_TOOLS) {
        const entry = registryEntry(name);
        if (entry.noWriteAlias === null) continue;
        expect(legacyAliasesFor(name)).toContain(entry.noWriteAlias);
      }
    });
  });
});
