/**
 * Issue #1077 — every advertised MCP tool must publish its tool-specific
 * result contract, not just the generic `{ content, isError, ok?, error? }`
 * envelope. The catalog (`schema` / `describe_tool`) is the surface where
 * an AI consumer learns what shape the response payload actually has —
 * today every entry exposes the same generic envelope and the agent has
 * to either grep handler source or remember skill docs to consume the
 * result.
 *
 * RED scope (this slice):
 *
 *   1. Every advertised tool carries a non-empty `resultContract`. Either
 *      a `dataSchema` (the primary payload schema) or an explicit
 *      `envelope-only` justification that names WHY the generic envelope
 *      is sufficient (read-only passthrough, JSON pass-through, etc.).
 *   2. Representative families have explicit typed data schemas so a
 *      consumer can branch on them programmatically:
 *        - `verify_code`, `sync_binary`, `diagnose`, `logs` — named in the
 *          issue body.
 *        - `query_execute`, `export_modules` — discriminated success / error
 *          payload shapes.
 *   3. Write-class tools distinguish `plan` vs `apply` outcomes so a
 *      consumer can refuse a `apply:true` call that silently produced a
 *      plan-shaped result. The contract carries a `modes` enum plus the
 *      discriminated shape per mode.
 *   4. Tools with large responses document `outputModes` (`summary`,
 *      `file`, `full`) so an agent knows where to find the bytes.
 *   5. Error envelopes retain typed `error.code` + `remediation` — this
 *      was already done in P0 (#659, #962), so this slice pins the
 *      invariant against the new contract surface.
 *
 * The test walks the live advertised tool list, so a future tool that
 * ships without a contract fails here rather than silently degrading the
 * catalog.
 */
import { describe, expect, it } from "vitest";
import { buildToolSchemaCatalog } from "../../../src/adapters/mcp/schema-tool.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

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
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
  };
}

const TOOLS = createDysflowMcpTools({ services: makeServices() });
const ADVERTISED_NAMES = new Set(TOOLS.map((tool) => tool.name));

describe("Tool-specific result contracts — #1077", () => {
  it("every advertised tool exposes a non-empty `resultContract` on the schema catalog", () => {
    const catalog = buildToolSchemaCatalog({});
    for (const tool of catalog.tools) {
      const resultContract = (tool as Record<string, unknown>).resultContract;
      expect(
        resultContract,
        `tool '${tool.name}' must publish a resultContract`,
      ).toBeDefined();
      expect(resultContract).not.toBeNull();
      if (typeof resultContract !== "object") {
        throw new Error(
          `tool '${tool.name}': resultContract must be an object (got ${typeof resultContract})`,
        );
      }
      const contract = resultContract as Record<string, unknown>;
      // Either a dataSchema path (non-empty shape) OR an envelope-only
      // justification that names WHY the generic envelope is enough.
      const hasDataSchema = contract.kind === "dataSchema";
      const hasEnvelopeOnly = contract.kind === "envelope-only";
      expect(
        hasDataSchema || hasEnvelopeOnly,
        `tool '${tool.name}': resultContract.kind must be 'dataSchema' or 'envelope-only'`,
      ).toBe(true);
      if (hasEnvelopeOnly) {
        expect(
          typeof contract.justification === "string" && contract.justification.length > 0,
          `tool '${tool.name}': envelope-only contracts must carry a non-empty justification`,
        ).toBe(true);
      }
      if (hasDataSchema) {
        expect(
          contract.dataSchema !== undefined && contract.dataSchema !== null,
          `tool '${tool.name}': dataSchema contracts must carry a dataSchema payload`,
        ).toBe(true);
      }
    }
  });

  it("representative families (issue body) expose typed data schemas", () => {
    const required = [
      "verify_code",
      "sync_binary",
      "diagnose",
      "logs",
      "query_execute",
      "export_modules",
    ];
    for (const name of required) {
      expect(ADVERTISED_NAMES.has(name), `${name} must be advertised`).toBe(true);
      const entry = buildToolSchemaCatalog({ toolName: name }).tools[0];
      expect(entry, `catalog must include ${name}`).toBeDefined();
      const contract = (entry as Record<string, unknown>).resultContract as
        | Record<string, unknown>
        | undefined;
      expect(
        contract?.kind === "dataSchema",
        `${name} must declare a dataSchema contract (got kind=${contract?.kind ?? "<missing>"})`,
      ).toBe(true);
      // The dataSchema must be an object (the typed payload the consumer
      // can introspect). It can be a JSON-Schema fragment or a typed
      // shape; both qualify as long as the field is non-null.
      expect(contract?.dataSchema).toBeDefined();
      expect(typeof contract?.dataSchema).toBe("object");
    }
  });

  it("write-class tools expose discriminated plan / apply result variants", () => {
    const writeTools = [
      "export_modules",
      "import_modules",
      "delete_module",
      "sync_binary",
      "query_execute",
      "run_vba",
    ];
    for (const name of writeTools) {
      expect(ADVERTISED_NAMES.has(name), `${name} must be advertised`).toBe(true);
      const entry = buildToolSchemaCatalog({ toolName: name }).tools[0];
      expect(entry, `catalog must include ${name}`).toBeDefined();
      const contract = (entry as Record<string, unknown>).resultContract as
        | Record<string, unknown>
        | undefined;
      // Write-class contracts MUST declare a modes array containing
      // 'plan' AND 'apply' so a consumer can refuse a result that
      // claims `apply:true` but returned a plan-shaped payload.
      expect(contract?.kind, `${name} must be a dataSchema contract`).toBe("dataSchema");
      const modes = (contract as { modes?: unknown }).modes;
      expect(
        Array.isArray(modes) && (modes as readonly unknown[]).includes("plan"),
        `${name}: modes must include 'plan'`,
      ).toBe(true);
      expect(
        Array.isArray(modes) && (modes as readonly unknown[]).includes("apply"),
        `${name}: modes must include 'apply'`,
      ).toBe(true);
    }
  });

  it("tools with large outputs declare supported outputModes (summary | file | full)", () => {
    // `export_modules` may write a whole directory to disk and `render_form_preview`
    // can produce either an SVG string or ASCII. Both ship a multi-mode
    // output contract.
    const largeOutputTools = ["export_modules", "render_form_preview"];
    for (const name of largeOutputTools) {
      expect(ADVERTISED_NAMES.has(name), `${name} must be advertised`).toBe(true);
      const entry = buildToolSchemaCatalog({ toolName: name }).tools[0];
      const contract = (entry as Record<string, unknown>).resultContract as
        | Record<string, unknown>
        | undefined;
      const outputModes = (contract as { outputModes?: unknown }).outputModes;
      expect(
        Array.isArray(outputModes) && (outputModes as readonly unknown[]).length > 0,
        `${name}: contract must declare at least one outputMode`,
      ).toBe(true);
      const known = new Set(["summary", "file", "full"]);
      for (const mode of outputModes as readonly unknown[]) {
        expect(
          typeof mode === "string" && known.has(mode),
          `${name}: outputMode '${String(mode)}' must be one of summary|file|full`,
        ).toBe(true);
      }
    }
  });

  it("every contract keeps the typed error.code + remediation invariant (carried from #659 / #962)", () => {
    const catalog = buildToolSchemaCatalog({});
    for (const tool of catalog.tools) {
      const contract = (tool as Record<string, unknown>).resultContract as
        | Record<string, unknown>
        | undefined;
      // The error envelope shape (error.code + remediation) was wired
      // in #659 / #962. Pin it as part of the contract so a future
      // envelope simplification can't silently drop the remediation
      // field that `describe_tool` consumers rely on.
      const errorEnvelope = (contract as { errorEnvelope?: unknown }).errorEnvelope;
      expect(errorEnvelope, `${tool.name}: contract must declare errorEnvelope shape`).toBeDefined();
      const errorShape = (errorEnvelope as Record<string, unknown> | undefined)?.shape;
      expect(errorShape, `${tool.name}: errorEnvelope.shape is required`).toBeDefined();
      expect(
        typeof errorShape === "object" &&
          (errorShape as Record<string, unknown>).code === { type: "string" },
        `${tool.name}: errorEnvelope.shape.code must declare a typed string field`,
      ).toBe(true);
      expect(
        typeof errorShape === "object" &&
          (errorShape as Record<string, unknown>).remediation === { type: "string", optional: true },
        `${tool.name}: errorEnvelope.shape.remediation must be a typed string (optional)`,
      ).toBe(true);
    }
  });

  it("the registry covering every advertised tool is total — no tool falls back to envelope-only without justification", () => {
    const catalog = buildToolSchemaCatalog({});
    // Hard policy from issue: every advertised tool must declare its
    // primary payload schema OR carry an envelope-only justification.
    // A tool that lands in the catalog without EITHER signals a
    // contract gap and fails this test.
    const withoutJustification: string[] = [];
    for (const tool of catalog.tools) {
      const contract = (tool as Record<string, unknown>).resultContract as
        | Record<string, unknown>
        | undefined;
      if (contract === undefined) {
        withoutJustification.push(tool.name);
        continue;
      }
      if (contract.kind === "envelope-only") {
        const justification = contract.justification;
        if (typeof justification !== "string" || justification.length === 0) {
          withoutJustification.push(tool.name);
        }
      }
    }
    expect(
      withoutJustification,
      `tools missing resultContract or envelope-only justification: ${withoutJustification.join(", ")}`,
    ).toEqual([]);
  });

  it("describe_tool surfaces the same resultContract as the full catalog (no divergence)", () => {
    // `describe_tool` is the on-demand single-entry surface. The
    // acceptance criterion is that describe_tool is sufficient for a
    // consumer to consume a result — meaning it MUST carry the same
    // resultContract as the full catalog entry.
    const sampleTools = ["verify_code", "sync_binary", "diagnose", "logs"];
    for (const name of sampleTools) {
      const full = buildToolSchemaCatalog({}).tools.find((t) => t.name === name);
      const filtered = buildToolSchemaCatalog({ toolName: name }).tools[0];
      expect(full).toBeDefined();
      expect(filtered).toBeDefined();
      const fullContract = (full as Record<string, unknown>).resultContract;
      const filteredContract = (filtered as Record<string, unknown>).resultContract;
      expect(
        JSON.stringify(fullContract) === JSON.stringify(filteredContract),
        `describe_tool resultContract for '${name}' must match the full catalog entry`,
      ).toBe(true);
    }
  });
});
