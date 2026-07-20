/**
 * Slice 2 (#1006) — `lint_module` MCP wiring for the
 * `openargs-contract-mismatch` rule.
 *
 * The slice 1 engine (`src/core/services/vba-project-openargs-lint-service.ts`)
 * is a third "project-lint" — it scans the whole `.cls` tree of a project and
 * pairs producer `DoCmd.OpenForm` calls against `Me.OpenArgs` consumers. Slice 2
 * extends the existing `lint_module` MCP tool to dispatch to that engine when
 * `rules` includes `"openargs-contract-mismatch"`, without adding a new MCP
 * tool (the `EXPECTED_ADVERTISED_TOOL_COUNT` pin stays at 89).
 *
 * RED→GREEN contract:
 *   - schema enum at `LINT_MODULE_SCHEMA` accepts `"openargs-contract-mismatch"`
 *     alongside the existing module-lint rules;
 *   - the handler dispatches the engine when the rule is requested, gathering
 *     every `.cls` file under the configured `destinationRoot` (forms/ +
 *     classes/ + reports/);
 *   - existing module-lint rules keep their previous behavior, including the
 *     `forbidden-name` regression suite from slice 0;
 *   - unknown rule IDs continue to be rejected by schema validation;
 *   - when both project-lint and module-lint rules are requested, the report
 *     carries both sets of diagnostics under `diagnostics[<rule>]` plus the
 *     flat `flatDiagnostics` array.
 */

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

function makeBaseServices(): DysflowMcpServices {
  return {
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
  };
}

const PRODUCER_HEAD = [
  "VERSION 1.0 CLASS",
  "BEGIN",
  "  MultiUse = -1  'True",
  "END",
  'Attribute VB_Name = "Form_FormIndicador"',
  "Option Compare Database",
  "Option Explicit",
].join("\r\n");

const CONSUMER_HEAD = [
  "VERSION 1.0 CLASS",
  "BEGIN",
  "  MultiUse = -1  'True",
  "END",
  'Attribute VB_Name = "Form_formIndicadorProyectos"',
  "Option Compare Database",
  "Option Explicit",
].join("\r\n");

function buildDivergentProducer(): string {
  return [
    PRODUCER_HEAD,
    "Private Sub cmdAbrir_Click()",
    "    Dim openArgs As String",
    '    openArgs = "ANIO=" & CStr(anio) & ";SEM=" & sem',
    '    DoCmd.OpenForm "FormIndicadorProyectos", acNormal, , , acFormEdit, acDialog, openArgs',
    "End Sub",
  ].join("\r\n");
}

function buildDivergentConsumer(): string {
  return [
    CONSUMER_HEAD,
    "Private Sub Form_Load()",
    "    Dim s As String",
    '    s = Nz(Me.OpenArgs, "")',
    '    If InStr(1, s, "|") > 0 Then',
    '        A = Split(s, "|")',
    "    End If",
    "    If m_Anio = 0 Then m_Anio = CLng(Year(Date))",
    "End Sub",
  ].join("\r\n");
}

describe("lint_module — openargs-contract-mismatch wiring (#1006 slice 2)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "dysflow-openargs-mcp-"));
    await mkdir(join(tempDir, "forms"), { recursive: true });
    await writeFile(
      join(tempDir, "forms", "Form_FormIndicador.cls"),
      buildDivergentProducer(),
      "utf8",
    );
    await writeFile(
      join(tempDir, "forms", "Form_formIndicadorProyectos.cls"),
      buildDivergentConsumer(),
      "utf8",
    );
  });

  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(tempDir, { recursive: true, force: true });
  });

  function getTool() {
    const tools = createDysflowMcpTools({
      services: makeBaseServices(),
      accessContextResolver: async () =>
        successResult({
          accessPath: join(tempDir, "frontend.accdb"),
          projectRoot: tempDir,
          destinationRoot: tempDir,
        }),
    });
    const tool = tools.find((t) => t.name === "lint_module");
    if (tool === undefined) throw new Error("lint_module tool not found");
    return tool;
  }

  it("dispatches to the project-lint engine and emits OPENARGS_CONTRACT_MISMATCH under the rule key", async () => {
    const result = await getTool().handler({
      module: "Form_FormIndicador",
      destinationRoot: tempDir,
      rules: ["openargs-contract-mismatch"],
    });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed.rules).toEqual(["openargs-contract-mismatch"]);
    expect(parsed.isClean).toBe(false);
    expect(parsed.summary.errors).toBe(1);

    const openargsDiags = parsed.diagnostics["openargs-contract-mismatch"] as Array<{
      readonly rule: string;
      readonly code: string;
      readonly severity: string;
      readonly line: number;
      readonly message: string;
    }>;
    expect(openargsDiags).toHaveLength(1);
    const diag = openargsDiags[0];
    expect(diag?.rule).toBe("openargs-contract-mismatch");
    expect(diag?.code).toBe("OPENARGS_CONTRACT_MISMATCH");
    expect(diag?.severity).toBe("error");
    // Diagnostic carries the producer site as the primary `line` and
    // embeds both producer + consumer grammar in the message so consumers
    // do not need a wider type to read the cross-form contract details.
    expect(diag?.message).toContain("Form_FormIndicador.cls");
    expect(diag?.message).toContain("Form_formIndicadorProyectos.cls");
    expect(diag?.message.toLowerCase()).toContain(";");
    expect(diag?.message).toContain("|");
    expect(diag?.message).toMatch(/fallback reachable|silent fallback/i);

    expect(parsed.flatDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "openargs-contract-mismatch",
          code: "OPENARGS_CONTRACT_MISMATCH",
        }),
      ]),
    );
  });

  it("runs both engines when the request mixes openargs-contract-mismatch with module-lint rules", async () => {
    const result = await getTool().handler({
      module: "Form_FormIndicador",
      destinationRoot: tempDir,
      rules: ["openargs-contract-mismatch", "forbidden-name"],
      source: [
        "Option Compare Database",
        "Option Explicit",
        "",
        "Public Sub SaveRecord(ByVal name As String, ByVal err As Long)",
        "End Sub",
      ].join("\r\n"),
    });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    // Module-lint rules first, then the project-lint rule — the merge
    // order matches the "project-lint first, then module-lint" dispatch
    // rule called out in the slice 2 spec while preserving the public
    // shape (module-lint rules before project-lint in the array).
    expect(parsed.rules).toEqual(["forbidden-name", "openargs-contract-mismatch"]);

    const openargsDiags = parsed.diagnostics["openargs-contract-mismatch"] as unknown[];
    expect(Array.isArray(openargsDiags)).toBe(true);
    expect((openargsDiags as unknown[]).length).toBe(1);

    const forbiddenDiags = parsed.diagnostics["forbidden-name"] as Array<{
      readonly code: string;
    }>;
    expect(forbiddenDiags).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "FORBIDDEN_NAME" })]),
    );

    expect(
      parsed.flatDiagnostics.some((d: { rule: string }) => d.rule === "openargs-contract-mismatch"),
    ).toBe(true);
    expect(parsed.flatDiagnostics.some((d: { rule: string }) => d.rule === "forbidden-name")).toBe(
      true,
    );
    expect(parsed.isClean).toBe(false);
  });

  it("does NOT run the project-lint engine when the rule list is empty", async () => {
    const result = await getTool().handler({
      module: "Form_FormIndicador",
      destinationRoot: tempDir,
      rules: [],
    });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed.rules).toEqual([]);
    expect(parsed.isClean).toBe(true);
    expect(parsed.flatDiagnostics).toEqual([]);
    // The project-lint rule key is intentionally absent — the engine was
    // never asked to run, so the envelope does not pretend it produced
    // any findings.
    expect(parsed.diagnostics["openargs-contract-mismatch"]).toBeUndefined();
  });

  it("does NOT regress the F22 forbidden-name rule when called alone", async () => {
    const result = await getTool().handler({
      module: "Form_FormIndicador",
      destinationRoot: tempDir,
      rules: ["forbidden-name"],
      source: [
        "Option Compare Database",
        "Option Explicit",
        "",
        "Public Sub SaveRecord(ByVal name As String, ByVal err As Long)",
        "End Sub",
      ].join("\r\n"),
    });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed.rules).toEqual(["forbidden-name"]);
    expect(parsed.diagnostics["openargs-contract-mismatch"]).toBeUndefined();
    const forbidden = parsed.flatDiagnostics.filter(
      (d: { code?: string }) => d.code === "FORBIDDEN_NAME",
    );
    expect(forbidden.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects unknown rule IDs at the schema level", async () => {
    const result = await getTool().handler({
      module: "Form_FormIndicador",
      destinationRoot: tempDir,
      rules: ["openargs-contract-mismatch", "not-a-real-rule"],
    });

    expect(result.isError).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("reports a clean lint when only matching producer/consumer pairs are present", async () => {
    const { rm } = await import("node:fs/promises");
    await rm(join(tempDir, "forms"), { recursive: true, force: true });
    await mkdir(join(tempDir, "forms"), { recursive: true });

    const matchingProducer = [
      PRODUCER_HEAD,
      "Private Sub cmdAbrir_Click()",
      "    Dim openArgs As String",
      '    openArgs = "2025|2"',
      '    DoCmd.OpenForm "FormIndicadorProyectos", acNormal, , , acFormEdit, acDialog, openArgs',
      "End Sub",
    ].join("\r\n");
    const matchingConsumer = [
      CONSUMER_HEAD,
      "Private Sub Form_Load()",
      "    Dim s As String",
      '    s = Nz(Me.OpenArgs, "")',
      '    If InStr(1, s, "|") > 0 Then',
      '        A = Split(s, "|")',
      "    End If",
      "End Sub",
    ].join("\r\n");
    await writeFile(join(tempDir, "forms", "Form_FormIndicador.cls"), matchingProducer, "utf8");
    await writeFile(
      join(tempDir, "forms", "Form_formIndicadorProyectos.cls"),
      matchingConsumer,
      "utf8",
    );

    const result = await getTool().handler({
      module: "Form_FormIndicador",
      destinationRoot: tempDir,
      rules: ["openargs-contract-mismatch"],
    });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed.isClean).toBe(true);
    const openargsDiags = parsed.diagnostics["openargs-contract-mismatch"] as unknown[];
    expect(openargsDiags).toEqual([]);
  });
});
