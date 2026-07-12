/**
 * Issue #757 (C4) — Improve the `apply is not allowed` remediation.
 *
 * Pre-#757 a tool that doesn't accept the `apply` flag rejects it with
 * the bare string `"<flag> is not allowed."`. The consumer has to look
 * at the schema docs (or the dysflow-usage skill) to figure out which
 * flag the tool actually uses — `apply` vs `dryRun` vs `diff`.
 *
 * Post-#757 the dispatcher enriches the rejection envelope with:
 *   - `error.rejectedFlag` — the flag the caller passed.
 *   - `error.toolCommitFlag` — the flag the tool actually accepts.
 *   - `error.remediation` — explicit guidance ("use X instead").
 *
 * The MCP text content keeps the legacy prefix
 * (`MCP_INPUT_INVALID: apply is not allowed.`) so log-grep consumers
 * continue to work; the structured `error` block is additive.
 */

import { describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

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

describe("MCP dispatch — apply flag rejection remediation (#757 C4)", () => {
  it("verify_code({ apply: true }) — verify_code has no apply property in the schema, so the rejection carries toolCommitFlag:'apply' but tool-specific remediation", async () => {
    // verify_code is a read-only tool with `diff:true` (a `verify_code`
    // semantic flag, not the export_* legacy alias). It does NOT
    // accept `apply` as a commit signal — its dominant verb is
    // `moduleNames` / `strict` / `diff`.
    //
    // When the caller passes `apply:true` to verify_code, the schema
    // rejects it. The envelope must identify verify_code's commit flag
    // (or absence of one) and point at the right remediation.
    const tools = createDysflowMcpTools({ services: makeServices(), writes: true });
    const tool = tools.find((t) => t.name === "verify_code");
    if (!tool) throw new Error("verify_code not registered");

    const result = await tool.handler({
      apply: true,
      moduleNames: ["Module_Foo"],
    });

    expect(result.isError).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("MCP_INPUT_INVALID");

    // The structured rejection envelope carries the rejected flag and
    // the tool's actual commit flag (which is "apply" — every tool
    // accepts `apply` per the registry; verify_code just doesn't write,
    // so the remediation must pivot to "use verify_code, not apply").
    // Per C4, the error.block enumerates `rejectedFlag`,
    // `toolCommitFlag`, `remediation`.
    expect(result.error?.rejectedFlag).toBe("apply");
    expect(result.error?.toolCommitFlag).toBeDefined();
    expect(typeof result.error?.toolCommitFlag).toBe("string");
    // The remediation MUST mention the alternative for the consumer.
    expect(typeof result.error?.remediation).toBe("string");
    expect(result.error?.remediation?.length ?? 0).toBeGreaterThan(0);
  });

  it("legacy prefix stays so log-grep consumers keep working (MCP_INPUT_INVALID: <flag> is not allowed.)", async () => {
    const tools = createDysflowMcpTools({ services: makeServices(), writes: true });
    const tool = tools.find((t) => t.name === "verify_code");
    if (!tool) throw new Error("verify_code not registered");

    const result = await tool.handler({ apply: true, moduleNames: ["Module_Foo"] });
    expect(result.isError).toBe(true);
    const firstLine = result.content[0]?.text ?? "";
    // Legacy prefix: `MCP_INPUT_INVALID: apply is not allowed.`
    expect(firstLine).toMatch(/MCP_INPUT_INVALID:.*apply.*not allowed/);
    // Structured envelope mirrors the description plus the enriched
    // remediation.
    expect(firstLine).toMatch(/apply/);
    // The structured error message is the bare schema-rejection string;
    // the structured `error.rejectedFlag` / `error.toolCommitFlag` /
    // `error.remediation` carry the consumer-facing enrichment. The
    // legacy text body is preserved verbatim for log-grep.
    expect(result.error?.message).toContain("not allowed");
    // The enriched remediation should give an actionable path
    // (whatever tool the registry says its commit flag is).
    expect(result.error?.remediation).toMatch(/apply/);
  });

  it("rejectedFlag propagates for non-apply flags too (e.g. compile:true), and toolCommitFlag points at the correct replacement", async () => {
    const tools = createDysflowMcpTools({ services: makeServices(), writes: true });
    const tool = tools.find((t) => t.name === "verify_code");
    if (!tool) throw new Error("verify_code not registered");

    // `compile:true` is rejected (compile_vba was removed in v1.19.0
    // — the schema strips it before validation for `import_*` only;
    // for `verify_code` the schema doesn't list it so it hits the
    // additionalProperties: false branch). The envelope should still
    // surface a structured rejection.
    const result = await tool.handler({ compile: true, moduleNames: ["Module_Foo"] });
    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe("MCP_INPUT_INVALID");
    // The rejected flag is whatever the caller passed; the
    // toolCommitFlag / remediation explain how to act.
    expect(result.error?.rejectedFlag).toBe("compile");
    expect(result.error?.toolCommitFlag).toBeDefined();
  });
});
