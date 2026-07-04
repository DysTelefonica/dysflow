import { describe, expect, it } from "vitest";
import {
  detectDeadCode,
  findVbaReferences,
  getVbaProcedure,
  listVbaProcedures,
} from "../../../src/core/services/vba-procedure-service";

/**
 * Regression tests for the pure VBA procedure parser.
 *
 * The parser is the authoritative source for both the MCP `dysflow_list_procedures`
 * and `dysflow_get_procedure` tools (issue #701) and for any future consumer that
 * wants to introspect VBA source text. It lives in `src/core/services/` so it is
 * free of filesystem and Access concerns — every test here is purely string-in,
 * string-out.
 */
describe("vba-procedure-service — listVbaProcedures", () => {
  it("returns procedures ordered by declaration line with canonical casing", () => {
    const source = [
      "Option Explicit",
      "",
      "Public Sub DoWork()",
      "    Dim x As Long",
      "End Sub",
      "",
      "Private Function GetValue() As Long",
      "    GetValue = 42",
      "End Function",
    ].join("\r\n");

    const procedures = listVbaProcedures(source);

    expect(procedures.map((p) => p.name)).toEqual(["DoWork", "GetValue"]);
    expect(procedures[0]).toMatchObject({
      name: "DoWork",
      kind: "Sub",
      visibility: "Public",
      line: 3,
    });
    expect(procedures[1]).toMatchObject({
      name: "GetValue",
      kind: "Function",
      visibility: "Private",
      line: 7,
    });
  });

  it("treats comments and Rem statements as non-declarations", () => {
    const source = [
      "'Public Sub CommentedOut()",
      "Rem Public Sub RemStatement()",
      "",
      "Public Sub RealProcedure()",
      "End Sub",
    ].join("\r\n");

    const procedures = listVbaProcedures(source);

    expect(procedures.map((p) => p.name)).toEqual(["RealProcedure"]);
  });

  it("does not detect a declaration that lives inside a string literal", () => {
    const source = [
      'Public Const SAMPLE As String = "Public Sub FakeOut()"',
      "",
      "Public Sub RealProcedure()",
      "End Sub",
    ].join("\r\n");

    const procedures = listVbaProcedures(source);

    expect(procedures.map((p) => p.name)).toEqual(["RealProcedure"]);
  });

  it("honours the kind filter (Sub/Function/Property)", () => {
    const source = [
      "Public Sub DoWork()",
      "End Sub",
      "",
      "Public Function GetValue() As Long",
      "    GetValue = 1",
      "End Function",
      "",
      "Public Property Get NameOnly() As String",
      '    NameOnly = "x"',
      "End Property",
    ].join("\r\n");

    expect(listVbaProcedures(source, "both").map((p) => p.name)).toEqual([
      "DoWork",
      "GetValue",
      "NameOnly",
    ]);
    expect(listVbaProcedures(source, "Sub").map((p) => p.name)).toEqual(["DoWork"]);
    expect(listVbaProcedures(source, "Function").map((p) => p.name)).toEqual(["GetValue"]);
    expect(listVbaProcedures(source, "Property").map((p) => p.name)).toEqual(["NameOnly"]);
  });
});

describe("vba-procedure-service — getVbaProcedure", () => {
  it("returns module/procedure/startLine/endLine/body for a single procedure", () => {
    const source = [
      "Option Explicit",
      "",
      "Public Function Add(a As Long, b As Long) As Long",
      "    Add = a + b",
      "End Function",
    ].join("\r\n");

    const detail = getVbaProcedure(source, "Add");

    expect(detail).toBeDefined();
    expect(detail?.name).toBe("Add");
    expect(detail?.kind).toBe("Function");
    expect(detail?.visibility).toBe("Public");
    expect(detail?.startLine).toBe(3);
    expect(detail?.endLine).toBe(5);
    expect(detail?.body).toContain("Add = a + b");
  });

  it("returns undefined when the procedure is not present", () => {
    const source = ["Public Sub DoWork()", "End Sub"].join("\r\n");

    expect(getVbaProcedure(source, "NonExistent")).toBeUndefined();
  });

  // Regression for issue #701 review blocker: VBA identifiers are case-insensitive
  // at the language level (VBA re-cases them on import). A consumer reaching the
  // service with `add`, `ADD`, or `Add` must get the same record, and the returned
  // name must carry the canonical casing from the source so downstream consumers
  // (binary diff, git blame, source-vs-binary verification) can compare it
  // verbatim without re-normalising.
  it("matches procedure names case-insensitively while preserving canonical casing in the response", () => {
    const source = [
      "Option Explicit",
      "",
      "Public Function Add(a As Long, b As Long) As Long",
      "    Add = a + b",
      "End Function",
    ].join("\r\n");

    const lower = getVbaProcedure(source, "add");
    const upper = getVbaProcedure(source, "ADD");
    const mixed = getVbaProcedure(source, "Add");
    const scrambled = getVbaProcedure(source, "aDD");

    // All four lookups return the same record (case-insensitive match).
    expect(lower).toBeDefined();
    expect(upper).toBeDefined();
    expect(mixed).toBeDefined();
    expect(scrambled).toBeDefined();
    expect(lower?.name).toBe("Add");
    expect(upper?.name).toBe("Add");
    expect(mixed?.name).toBe("Add");
    expect(scrambled?.name).toBe("Add");

    // And the structural fields are identical (only the lookup key differs).
    expect(lower?.startLine).toBe(3);
    expect(upper?.startLine).toBe(3);
    expect(lower?.endLine).toBe(5);
    expect(upper?.body).toBe(mixed?.body);
  });

  it("returns an empty body when the procedure is a single-line shell with no statements", () => {
    const source = ["Public Sub DoNothing()", "End Sub"].join("\r\n");

    const detail = getVbaProcedure(source, "DoNothing");

    expect(detail).toBeDefined();
    expect(detail?.startLine).toBe(1);
    expect(detail?.endLine).toBe(2);
    expect(detail?.body).toBe("");
  });

  it("handles Property Get/Let/Set variants under the same procedure name", () => {
    const source = [
      "Public Property Get Name() As String",
      "    Name = m_Name",
      "End Property",
      "",
      "Public Property Let Name(ByVal v As String)",
      "    m_Name = v",
      "End Property",
    ].join("\r\n");

    const getter = getVbaProcedure(source, "Name");

    // Both Property Get and Property Let collapse to the same identifier "Name".
    // The parser reports the first declaration; the body spans its single block.
    expect(getter?.name).toBe("Name");
    expect(getter?.kind).toBe("Property");
    expect(getter?.startLine).toBe(1);
    expect(getter?.body).toContain("Name = m_Name");
  });
});

describe("vba-procedure-service — findVbaReferences", () => {
  it("finds references to a defined procedure while ignoring its definition", () => {
    const modules = {
      modHelper: [
        "Public Sub TargetSub()",
        "End Sub",
        "",
        "Public Sub Caller()",
        "    Call TargetSub",
        "    TargetSub",
        "End Sub",
      ].join("\r\n"),
    };

    const result = findVbaReferences(modules, "TargetSub");
    expect(result).toBeDefined();
    expect(result?.symbol).toBe("TargetSub");
    expect(result?.references).toHaveLength(2);
    expect(result?.references?.[0]).toMatchObject({
      module: "modHelper",
      kind: "Sub",
      line: 5,
      context: "Call TargetSub",
    });
    expect(result?.references?.[1]).toMatchObject({
      module: "modHelper",
      kind: "Sub",
      line: 6,
      context: "TargetSub",
    });
  });

  it("returns undefined when the symbol is not defined in any module", () => {
    const modules = {
      modHelper: ["Public Sub Caller()", "    Call SomeSub", "End Sub"].join("\r\n"),
    };

    const result = findVbaReferences(modules, "SomeSub");
    expect(result).toBeUndefined();
  });

  it("ignores references inside comments", () => {
    const modules = {
      modHelper: [
        "Public Sub TargetSub()",
        "End Sub",
        "",
        "Public Sub Caller()",
        "    ' Call TargetSub",
        "    TargetSub ' comment on line",
        "End Sub",
      ].join("\r\n"),
    };

    const result = findVbaReferences(modules, "TargetSub");
    expect(result).toBeDefined();
    expect(result?.references).toHaveLength(1);
    expect(result?.references?.[0]?.line).toBe(6);
  });
});

/**
 * Phase 1 (issue #705 — `detect-dead-code`): RED-first tests for
 * `detectDeadCode` plus regression pins for `findVbaReferences`. The
 * detection function is the modern dead-code analysis surface: it walks
 * every module's procedures and module-level declarations, runs the
 * patched `findVbaReferences` (which now strips strings before search)
 * once per symbol, and emits a structured finding for each unreferenced
 * symbol that is not in the special-name allowlist.
 *
 * All tests here are pure string-in / string-out — no filesystem, no
 * Access, no PowerShell. The same parser module is the unit-under-test.
 */
function expectDeadCodeReport(report: ReturnType<typeof detectDeadCode>) {
  expect(report).toBeDefined();
  if (report === undefined) {
    throw new Error("Expected detectDeadCode to return a report");
  }
  return report;
}

describe("vba-procedure-service — detectDeadCode", () => {
  // 1.1 — definition-only dead procedure is reported with Low risk / sub kind.
  it("detectDeadCode_unreferenced_procedure_returns_dead", () => {
    const modules = {
      ModA: ["Option Explicit", "", "Private Sub UnusedProc()", "End Sub"].join("\r\n"),
    };

    const report = expectDeadCodeReport(detectDeadCode(modules, { scope: "binary" }));

    const finding = report.findings.find((f) => f.symbol === "UnusedProc");
    expect(finding, "UnusedProc must be reported as dead").toBeDefined();
    expect(finding?.kind).toBe("sub");
    expect(finding?.risk).toBe("Low");
    expect(finding?.module).toBe("ModA");
    expect(finding?.line).toBe(3);
  });

  // 1.2 — a string literal is NOT a real reference. Even when `UnusedProc`
  // appears inside `Application.Run "UnusedProc"`, the dead-code analyser
  // must still surface it as dead. This is the core fix that motivates the
  // `stripStrings` patch in `findVbaReferences`.
  it("detectDeadCode_string_literal_does_not_count", () => {
    const modules = {
      ModA: ["Option Explicit", "", "Private Sub UnusedProc()", "End Sub"].join("\r\n"),
      ModB: ["Public Sub Caller()", '    Application.Run "UnusedProc"', "End Sub"].join("\r\n"),
    };

    const report = expectDeadCodeReport(detectDeadCode(modules, { scope: "binary" }));

    expect(report.findings.find((f) => f.symbol === "UnusedProc")).toBeDefined();
  });

  // 1.3 — comment-only mentions do not count as references.
  it("detectDeadCode_comment_does_not_count", () => {
    const modules = {
      ModA: ["Option Explicit", "", "Private Sub UnusedProc()", "End Sub"].join("\r\n"),
      ModB: ["Public Sub Caller()", "    ' TODO refactor UnusedProc", "End Sub"].join("\r\n"),
    };

    const report = expectDeadCodeReport(detectDeadCode(modules, { scope: "binary" }));

    expect(report.findings.find((f) => f.symbol === "UnusedProc")).toBeDefined();
  });

  // 1.4 — a longer name that contains the symbol as a substring (e.g.
  // `MyUnusedProcCaller` containing `UnusedProc`) does NOT count as a
  // reference to the shorter symbol. The analyser must rely on word-boundary
  // matching, not plain `indexOf`.
  it("detectDeadCode_substring_does_not_count", () => {
    const modules = {
      ModA: ["Option Explicit", "", "Private Sub UnusedProc()", "End Sub"].join("\r\n"),
      ModB: ["Public Sub MyUnusedProcCaller()", "End Sub"].join("\r\n"),
    };

    const report = expectDeadCodeReport(detectDeadCode(modules, { scope: "binary" }));

    expect(report.findings.find((f) => f.symbol === "UnusedProc")).toBeDefined();
  });

  // 1.5 — cross-module references count. When ModA.Producer calls
  // ModB.Consumer, `Consumer` is alive and must be omitted from findings.
  it("detectDeadCode_cross_module_reference_omits_live", () => {
    const modules = {
      ModA: ["Option Explicit", "", "Public Sub Producer()", "    Call Consumer", "End Sub"].join(
        "\r\n",
      ),
      ModB: ["Option Explicit", "", "Public Sub Consumer()", "End Sub"].join("\r\n"),
    };

    const report = expectDeadCodeReport(detectDeadCode(modules, { scope: "binary" }));

    expect(report.findings.find((f) => f.symbol === "Consumer")).toBeUndefined();
  });

  // 1.6 — `AutoExec` (and any of its variants) is part of the Access
  // lifecycle allowlist and must NEVER show up as dead, even when defined
  // in a module with zero references.
  it("detectDeadCode_autoexec_excluded", () => {
    const modules = {
      ModA: ["Option Explicit", "", "Public Sub AutoExec()", "End Sub"].join("\r\n"),
    };

    const report = expectDeadCodeReport(detectDeadCode(modules, { scope: "binary" }));

    expect(report.findings.find((f) => f.symbol === "AutoExec")).toBeUndefined();
  });

  // 1.7 — form/report lifecycle names match the `^(Form|Report|Class)_X`
  // pattern and are excluded.
  it("detectDeadCode_form_load_excluded", () => {
    const modules = {
      Form_Main: ["Option Explicit", "", "Private Sub Form_Load()", "End Sub"].join("\r\n"),
    };

    const report = expectDeadCodeReport(detectDeadCode(modules, { scope: "binary" }));

    expect(report.findings.find((f) => f.symbol === "Form_Load")).toBeUndefined();
  });

  // 1.8 — control event handlers match the `_<Event>` allowlist suffix and
  // are excluded even when defined standalone.
  it("detectDeadCode_control_event_handler_excluded", () => {
    const modules = {
      Form_Main: ["Option Explicit", "", "Private Sub cmdSave_Click()", "End Sub"].join("\r\n"),
    };

    const report = expectDeadCodeReport(detectDeadCode(modules, { scope: "binary" }));

    expect(report.findings.find((f) => f.symbol === "cmdSave_Click")).toBeUndefined();
  });

  // 1.9 — a Public module-level Const declaration with zero references is
  // reported as dead with risk `High` because the analyser cannot prove
  // the constant is not consumed by an unparsed source (form layout,
  // expression service, external binding, etc.).
  it("detectDeadCode_public_const_high_risk", () => {
    const modules = {
      ModA: ["Option Explicit", "", "Public Const MY_CONST As Long = 42"].join("\r\n"),
    };

    const report = expectDeadCodeReport(detectDeadCode(modules, { scope: "binary" }));

    const finding = report.findings.find((f) => f.symbol === "MY_CONST");
    expect(finding, "MY_CONST must be reported as dead").toBeDefined();
    expect(finding?.kind).toBe("declaration");
    expect(finding?.risk).toBe("High");
    expect(finding?.module).toBe("ModA");
  });

  // 1.10 — narrowing to a single module restricts the analysis to that
  // module. `UnusedA` lives in ModA so the narrowing drops it; `UnusedB`
  // lives in ModB and has zero references inside ModB, so it is reported;
  // `UsedProc` lives in ModB and references itself recursively inside
  // ModB, so it is alive and dropped. Risk for the surviving finding is
  // Med because the scope was narrowed (private procedure elevations).
  it("detectDeadCode_module_narrow_scope", () => {
    const modules = {
      ModA: ["Option Explicit", "", "Private Sub UnusedA()", "End Sub"].join("\r\n"),
      ModB: [
        "Option Explicit",
        "",
        "Private Sub UnusedB()",
        "End Sub",
        "",
        "Private Sub UsedProc()",
        "    Call UsedProc",
        "End Sub",
      ].join("\r\n"),
    };

    const report = expectDeadCodeReport(
      detectDeadCode(modules, { scope: "binary", module: "ModB" }),
    );

    expect(report.findings.map((f) => f.symbol)).toEqual(["UnusedB"]);
    expect(report.findings[0]?.risk).toBe("Med");
    expect(report.findings[0]?.module).toBe("ModB");
    expect(report.module).toBe("ModB");
  });

  // 1.11 — every finding carries `evidence.scannedModules` (sorted list of
  // every module in the input map) and a non-empty `evidence.definitionSnippet`
  // taken verbatim from the source line where the symbol was defined.
  it("detectDeadCode_evidence_includes_scanned_modules_and_snippet", () => {
    const modules = {
      Zebra: ["Option Explicit", "", "Private Sub Z_Proc()", "End Sub"].join("\r\n"),
      Alpha: ["Option Explicit", "", "Private Sub A_Proc()", "End Sub"].join("\r\n"),
    };

    const report = expectDeadCodeReport(detectDeadCode(modules, { scope: "binary" }));

    const zFinding = report.findings.find((f) => f.symbol === "Z_Proc");
    expect(zFinding, "Z_Proc must be reported as dead").toBeDefined();
    expect(zFinding?.evidence.scannedModules).toEqual(["Alpha", "Zebra"]);
    expect(zFinding?.evidence.definitionSnippet).toBeTruthy();
    expect((zFinding?.evidence.definitionSnippet ?? "").length).toBeGreaterThan(0);
  });

  // Fix #1 — `MODULE_LEVEL_DECL_RE` must recognise Public/Private/Global
  // variable declarations (in addition to the existing Const/Dim coverage)
  // and multi-line Type/Enum block declarations. The first review of #705
  // flagged that the original regex only matched `Const|Dim` and silently
  // dropped every `Public Foo As Long` / `Type Point` / `Enum Color`
  // declaration, leaving them invisible to the analyser.
  it("detectDeadCode_public_variable_declaration_is_reported_with_high_risk", () => {
    const modules = {
      ModA: ["Option Explicit", "", "Public Foo As Long"].join("\r\n"),
    };

    const report = expectDeadCodeReport(detectDeadCode(modules, { scope: "binary" }));

    const finding = report.findings.find((f) => f.symbol === "Foo");
    expect(finding, "Public Foo As Long must surface as a dead declaration").toBeDefined();
    expect(finding?.kind).toBe("declaration");
    expect(finding?.risk).toBe("High");
    expect(finding?.module).toBe("ModA");
    expect(finding?.line).toBe(3);
  });

  it("detectDeadCode_private_variable_declaration_is_reported_with_low_risk", () => {
    const modules = {
      ModA: ["Option Explicit", "", "Private Bar As String"].join("\r\n"),
    };

    const report = expectDeadCodeReport(detectDeadCode(modules, { scope: "binary" }));

    const finding = report.findings.find((f) => f.symbol === "Bar");
    expect(finding, "Private Bar As String must surface as a dead declaration").toBeDefined();
    expect(finding?.kind).toBe("declaration");
    expect(finding?.risk).toBe("Low");
    expect(finding?.module).toBe("ModA");
  });

  it("detectDeadCode_global_variable_declaration_is_reported_with_high_risk", () => {
    const modules = {
      ModA: ["Option Explicit", "", "Global AppVersion As String"].join("\r\n"),
    };

    const report = expectDeadCodeReport(detectDeadCode(modules, { scope: "binary" }));

    const finding = report.findings.find((f) => f.symbol === "AppVersion");
    expect(finding, "Global AppVersion must surface as a dead declaration").toBeDefined();
    expect(finding?.kind).toBe("declaration");
    expect(finding?.risk).toBe("High");
    expect(finding?.module).toBe("ModA");
  });

  it("detectDeadCode_type_block_first_line_is_reported_as_declaration", () => {
    const modules = {
      ModA: [
        "Option Explicit",
        "",
        "Public Type Point",
        "    X As Long",
        "    Y As Long",
        "End Type",
      ].join("\r\n"),
    };

    const report = expectDeadCodeReport(detectDeadCode(modules, { scope: "binary" }));

    // Only the Type name `Point` should be reported — the body members
    // (X, Y) live inside a Type block and must NOT be treated as
    // standalone module-level declarations.
    const symbols = report.findings.map((f) => f.symbol);
    expect(symbols).toContain("Point");
    expect(symbols).not.toContain("X");
    expect(symbols).not.toContain("Y");

    const finding = report.findings.find((f) => f.symbol === "Point");
    expect(finding?.kind).toBe("declaration");
    expect(finding?.risk).toBe("High");
    expect(finding?.line).toBe(3);
    expect(finding?.module).toBe("ModA");
  });

  it("detectDeadCode_private_type_block_reports_low_risk", () => {
    const modules = {
      ModA: ["Option Explicit", "", "Private Type InnerPoint", "    A As Long", "End Type"].join(
        "\r\n",
      ),
    };

    const report = expectDeadCodeReport(detectDeadCode(modules, { scope: "binary" }));

    const finding = report.findings.find((f) => f.symbol === "InnerPoint");
    expect(finding, "Private Type InnerPoint must surface as a dead declaration").toBeDefined();
    expect(finding?.kind).toBe("declaration");
    expect(finding?.risk).toBe("Low");
  });

  it("detectDeadCode_type_without_visibility_reports_med_risk", () => {
    const modules = {
      ModA: ["Option Explicit", "", "Type NoVisibility", "    X As Long", "End Type"].join("\r\n"),
    };

    const report = expectDeadCodeReport(detectDeadCode(modules, { scope: "binary" }));

    const finding = report.findings.find((f) => f.symbol === "NoVisibility");
    expect(finding, "Default-visibility Type must surface as a dead declaration").toBeDefined();
    expect(finding?.kind).toBe("declaration");
    expect(finding?.risk).toBe("Med");
  });

  it("detectDeadCode_public_enum_block_is_reported_with_high_risk", () => {
    const modules = {
      ModA: [
        "Option Explicit",
        "",
        "Public Enum Color",
        "    Red = 1",
        "    Green = 2",
        "End Enum",
      ].join("\r\n"),
    };

    const report = expectDeadCodeReport(detectDeadCode(modules, { scope: "binary" }));

    const symbols = report.findings.map((f) => f.symbol);
    expect(symbols).toContain("Color");
    expect(symbols).not.toContain("Red");
    expect(symbols).not.toContain("Green");

    const finding = report.findings.find((f) => f.symbol === "Color");
    expect(finding?.kind).toBe("declaration");
    expect(finding?.risk).toBe("High");
    expect(finding?.line).toBe(3);
  });

  it("detectDeadCode_private_enum_block_reports_low_risk", () => {
    const modules = {
      ModA: ["Option Explicit", "", "Private Enum Days", "    Mon = 1", "End Enum"].join("\r\n"),
    };

    const report = expectDeadCodeReport(detectDeadCode(modules, { scope: "binary" }));

    const finding = report.findings.find((f) => f.symbol === "Days");
    expect(finding, "Private Enum Days must surface as a dead declaration").toBeDefined();
    expect(finding?.kind).toBe("declaration");
    expect(finding?.risk).toBe("Low");
  });

  it("detectDeadCode_typeof_expression_is_not_a_type_declaration", () => {
    // `TypeOf obj Is Class1` is a runtime check, NOT a Type declaration.
    // The regex must not capture `Is` or `Class1` from this line as if
    // they were module-level declarations. The `obj` and `Point` tokens
    // on the TypeOf line are valid runtime references, so they keep
    // `Point` (defined in ModB) alive.
    const modules = {
      ModA: [
        "Option Explicit",
        "",
        "Public Function IsPoint(ByVal obj As Object) As Boolean",
        "    IsPoint = TypeOf obj Is Point",
        "End Function",
      ].join("\r\n"),
      ModB: ["Option Explicit", "", "Public Type Point", "    X As Long", "End Type"].join("\r\n"),
    };

    const report = expectDeadCodeReport(detectDeadCode(modules, { scope: "binary" }));

    // The TypeOf body line must not produce phantom findings for `Is` /
    // `Class1` / `obj` — they live inside a runtime expression, not at
    // module scope.
    const symbols = report.findings.map((f) => f.symbol);
    expect(symbols).not.toContain("Is");
    expect(symbols).not.toContain("Class1");
    expect(symbols).not.toContain("obj");

    // The body member `X` of `Type Point` must also stay silent (it is
    // an inline member declaration, not a module-level declaration).
    expect(symbols).not.toContain("X");
  });

  // Fix #3 — when `opts.module` is supplied but no module in the map
  // matches (case-insensitive), `detectDeadCode` MUST return `undefined`
  // rather than an empty report. The empty report is indistinguishable
  // from "we ran the analysis and found nothing dead" today; the typed
  // signal lets the MCP handler translate the failure to a
  // `MODULE_NOT_FOUND` envelope instead of silently reporting success.
  it("detectDeadCode_narrow_to_missing_module_returns_undefined", () => {
    const modules = {
      ModA: ["Option Explicit", "", "Public Sub Live()", "End Sub"].join("\r\n"),
    };

    const report = detectDeadCode(modules, { scope: "binary", module: "NonExistent" });

    expect(report).toBeUndefined();
  });

  it("detectDeadCode_narrow_to_missing_module_is_case_insensitive", () => {
    // A caller narrowing with mixed casing that genuinely matches no
    // module (even case-insensitively) must surface as undefined. The
    // case-insensitive match for "modb" against the real "ModA" must
    // NOT be promoted to a hit.
    const modules = {
      ModA: ["Option Explicit", "", "Public Sub Live()", "End Sub"].join("\r\n"),
    };

    const report = detectDeadCode(modules, { scope: "binary", module: "MODB" });

    expect(report).toBeUndefined();
  });

  it("detectDeadCode_narrow_to_existing_module_still_returns_report", () => {
    // Regression pin: legitimate narrowing still returns a real report.
    const modules = {
      ModA: ["Option Explicit", "", "Public Sub Live()", "End Sub"].join("\r\n"),
    };

    const report = detectDeadCode(modules, { scope: "binary", module: "ModA" });

    expect(report).toBeDefined();
    expect(report?.module).toBe("ModA");
  });

  // Fix #4 — `evidence.scannedModules` MUST reflect the modules actually
  // searched, NOT every module in the input map. When the caller narrows
  // to ModB, every other input module (ModA, ModC) is invisible to the
  // analysis and must NOT appear on the report. The first review of #705
  // flagged this as misleading — the analyst cannot trust `scannedModules`
  // to tell them what was actually scanned.
  it("detectDeadCode_narrow_scanned_modules_reflects_searched_set", () => {
    const modules = {
      ModA: ["Option Explicit", "", "Public Sub LiveA()", "End Sub"].join("\r\n"),
      ModB: ["Option Explicit", "", "Public Sub UnusedB()", "End Sub"].join("\r\n"),
      ModC: ["Option Explicit", "", "Public Sub LiveC()", "End Sub"].join("\r\n"),
    };

    const report = expectDeadCodeReport(
      detectDeadCode(modules, { scope: "binary", module: "ModB" }),
    );

    // Only ModB was searched — ModA and ModC must NOT appear.
    expect(report.scannedModules).toEqual(["ModB"]);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.evidence.scannedModules).toEqual(["ModB"]);
  });
});

/**
 * Regression pins for `findVbaReferences` (#701 callers). Three rules that
 * the dead-code-introduced `stripStrings` patch must NOT break:
 *
 *   1.12 — comments are still stripped before search (already works before
 *          the patch).
 *   1.13 — the ONLY mention of a symbol is inside a string literal, so
 *          after the patch the symbol has zero references. This is the
 *          RED → GREEN signal for the patch itself.
 *   1.14 — the existing two-reference case from the #701 catalog still
 *          returns two references after the patch (i.e. the patch is
 *          strictly string-strip — it does not regress comments or
 *          word-boundary matching).
 */
describe("vba-procedure-service — findVbaReferences regression pins (#705)", () => {
  // 1.12
  it("findVbaReferences_call_syntax_zero_refs (comment-only mention is not a reference)", () => {
    const modules = {
      ModA: [
        "Option Explicit",
        "",
        "Private Sub UnusedProc()",
        "End Sub",
        "",
        "Private Sub Caller()",
        "    ' Call UnusedProc",
        "End Sub",
      ].join("\r\n"),
    };

    const result = findVbaReferences(modules, "UnusedProc");

    expect(result).toBeDefined();
    expect(result?.totalCount).toBe(0);
    expect(result?.references).toHaveLength(0);
  });

  // 1.13 — this is the RED that motivates the `stripStrings` patch.
  it("findVbaReferences_application_run_zero_refs (symbol inside string literal is not a reference)", () => {
    const modules = {
      ModA: [
        "Option Explicit",
        "",
        "Private Sub ProcName()",
        "End Sub",
        "",
        "Private Sub Caller()",
        '    Application.Run "ProcName"',
        "End Sub",
      ].join("\r\n"),
    };

    const result = findVbaReferences(modules, "ProcName");

    expect(result).toBeDefined();
    expect(result?.totalCount).toBe(0);
    expect(result?.references).toHaveLength(0);
  });

  // 1.14
  it("findVbaReferences_existing_2ref_case_unchanged after the stripStrings patch", () => {
    const modules = {
      modHelper: [
        "Public Sub TargetSub()",
        "End Sub",
        "",
        "Public Sub Caller()",
        "    Call TargetSub",
        "    TargetSub",
        "End Sub",
      ].join("\r\n"),
    };

    const result = findVbaReferences(modules, "TargetSub");

    expect(result).toBeDefined();
    expect(result?.totalCount).toBe(2);
    expect(result?.references).toHaveLength(2);
  });
});
