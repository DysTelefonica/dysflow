/**
 * Issue #1073 — enforce one coherent write-intent contract across the
 * write registry, advertised schemas, and access classification.
 *
 * Today the three surfaces disagree:
 *   - `get_capabilities` reports `canonicalCommitFlag:"apply"` for tools
 *     whose input schema rejects `apply` (generate_erd, link_tables,
 *     cleanup_access_operation, access_force_cleanup_orphaned,
 *     clean_stale_markers).
 *   - `form_serialize` is absent from `writeClassToolsPermitted` yet
 *     exposes `apply`/`dryRun` in its schema — read-only tools must NOT
 *     advertise write-intent flags that the handler ignores.
 *   - `link_tables.dryRun` references `apply:true` although `apply` is
 *     rejected by the schema.
 *
 * The fix reconciles every tool so:
 *   1. `commit-flag-registry.ts` `commitFlag` matches the canonical flag
 *      the schema accepts (or `null`/not-applicable for read-only).
 *   2. Read-only tools expose neither `apply` nor `dryRun`.
 *   3. Write-class tools that claim `commitFlag:"apply"` actually accept
 *      `apply` in their input schema.
 *
 * The acceptance test walks every advertised tool, inspects each layer
 * (schema, registry, dispatch route risk classification), and reports
 * any disagreement with the tool name.
 */
import { describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";
import {
  COMMIT_FLAG_REGISTRY,
  type CommitFlagMetadata,
  commitFlagFor,
  legacyAliasesFor,
} from "../../../src/core/runtime/commit-flag-registry.js";

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

const TOOLS = createDysflowMcpTools({
  services: {
    vbaService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
  },
});

const TOOL_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

function inputSchema(name: string): { properties?: Record<string, unknown> } {
  const tool = TOOL_BY_NAME.get(name);
  if (tool === undefined) return {};
  const raw = tool.inputSchema;
  if (typeof raw !== "object" || raw === null) return {};
  return raw as { properties?: Record<string, unknown> };
}

function schemaAccepts(name: string, flag: string): boolean {
  return Object.hasOwn(inputSchema(name).properties ?? {}, flag);
}

function registryEntry(name: string): CommitFlagMetadata {
  const entry = COMMIT_FLAG_REGISTRY[name];
  // commitFlagMetadataForOrNoop returns the same shape for unknown
  // tools (commitFlag:"apply", noWriteAlias:null, defaultBehavior:"noop").
  // We mirror it here so parity assertions stay uniform across
  // recognised / unrecognised tool names without losing readability.
  return entry ?? { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" };
}

describe("write-intent contract coherence (#1073)", () => {
  it("generate_erd resolves to a read-only classification", () => {
    // Issue acceptance criterion: "Resolve and document the intended
    // classifications of generate_erd and form_serialize." After the
    // fix generate_erd must be unambiguous read-only — its dispatch
    // route is `read-only` AND its registry commitFlag must not imply
    // a write path.
    const meta = registryEntry("generate_erd");
    expect(
      meta.defaultBehavior,
      "generate_erd is a pure schema-document tool; defaultBehavior should be 'noop'",
    ).toBe("noop");
    // The schema must not advertise apply or dryRun — they are write
    // signals and the handler ignores them. Pin both are absent.
    expect(schemaAccepts("generate_erd", "apply")).toBe(false);
    expect(schemaAccepts("generate_erd", "dryRun")).toBe(false);
  });

  it("form_serialize does not expose apply or dryRun (read-only by dispatch classification)", () => {
    // The dispatch route classifies form_serialize as read-only; the
    // schema MUST agree. Adding a flag the handler ignores breaks the
    // accept-criterion "No read-only tool exposes write-intent
    // parameters that are ignored."
    expect(schemaAccepts("form_serialize", "apply")).toBe(false);
    expect(schemaAccepts("form_serialize", "dryRun")).toBe(false);
    expect(registryEntry("form_serialize").defaultBehavior).toBe("noop");
  });

  it("link_tables schema accepts apply when the registry claims commitFlag:apply", () => {
    // Issue quote: "link_tables.dryRun even tells consumers to use
    // apply:true, although apply is rejected by its schema." After the
    // fix the schema must accept apply OR the registry must claim a
    // different commitFlag. We pin they agree via schema acceptance.
    const meta = registryEntry("link_tables");
    if (meta.commitFlag === "apply") {
      expect(
        schemaAccepts("link_tables", "apply"),
        "link_tables advertises apply as canonical commitFlag — schema must accept it",
      ).toBe(true);
    }
    if (meta.commitFlag === "dryRun") {
      expect(
        schemaAccepts("link_tables", "dryRun"),
        "link_tables advertises dryRun as canonical commitFlag — schema must accept it",
      ).toBe(true);
    }
  });

  it("write-class tools accept the canonical commit flag the registry advertises", () => {
    // Per the commit-flag-registry contract: every tool whose registry
    // entry signals an actual write path (`defaultBehavior` !== "noop"
    // OR a non-null `noWriteAlias`) MUST accept the corresponding
    // commit flag (`apply` or `dryRun`) in its input schema. Tools
    // classified as `defaultBehavior:"noop"` with `noWriteAlias:null`
    // use `commitFlag:"apply"` as a uniform sentinel — the absence is
    // expected and the writing-readonly check below catches the
    // schema-vs-intent mismatch.
    const failures: string[] = [];
    for (const tool of TOOLS) {
      const meta = registryEntry(tool.name);
      const isRealWriteClass = meta.defaultBehavior !== "noop" || meta.noWriteAlias !== null;
      if (!isRealWriteClass) continue;
      if (meta.commitFlag === "apply" && !schemaAccepts(tool.name, "apply")) {
        failures.push(
          `${tool.name}: write-class contract declares commitFlag:apply but input schema rejects apply`,
        );
      }
      if (meta.commitFlag === "dryRun" && !schemaAccepts(tool.name, "dryRun")) {
        failures.push(
          `${tool.name}: write-class contract declares commitFlag:dryRun but input schema rejects dryRun`,
        );
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("read-only tools expose neither apply nor dryRun", () => {
    // Per the dispatch-routes.ts risk classification, every
    // `defaultBehavior:"noop"` + `noWriteAlias:null` tool is read-only.
    // The contract says read-only tools MUST NOT expose write-intent
    // flags that the handler ignores (issue #1073 acceptance criterion
    // #2). The schema must agree.
    const failures: string[] = [];
    for (const tool of TOOLS) {
      const meta = registryEntry(tool.name);
      const isReadOnlyContract = meta.defaultBehavior === "noop" && meta.noWriteAlias === null;
      if (!isReadOnlyContract) continue;
      if (schemaAccepts(tool.name, "apply") || schemaAccepts(tool.name, "dryRun")) {
        failures.push(
          `${tool.name}: read-class contract (defaultBehavior:noop, noWriteAlias:null) but schema exposes apply/dryRun`,
        );
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("commitFlagFor()/legacyAliasesFor() return values align with the registry entry", () => {
    // Pin the helper surface — these are documented to derive from
    // COMMIT_FLAG_REGISTRY, so a registration slip should surface here
    // before reaching an MCP caller.
    const failures: string[] = [];
    for (const name of Object.keys(COMMIT_FLAG_REGISTRY)) {
      const entry = registryEntry(name);
      if (commitFlagFor(name) !== entry.commitFlag) {
        failures.push(`${name}: commitFlagFor() mismatch`);
      }
      const aliases = legacyAliasesFor(name);
      if (entry.noWriteAlias === null && aliases.length !== 0) {
        failures.push(
          `${name}: legacyAliasesFor() returns [${aliases.join(",")}] for a null noWriteAlias`,
        );
      }
      if (entry.noWriteAlias !== null && !aliases.includes(entry.noWriteAlias)) {
        failures.push(
          `${name}: legacyAliasesFor()=${aliases.join(",")} must include noWriteAlias=${entry.noWriteAlias}`,
        );
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
});
