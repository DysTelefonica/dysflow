import { describe, expect, it } from "vitest";
import { lintVbaModule } from "../../../src/core/services/vba-module-lint-service.js";

// Issue #1863 — error-propagation rules. They only fire for methods that
// already declare `p_Error`, so legacy methods without it stay clean.

const ERROR_RULES = [
  "error-param-last",
  "error-propagation-check",
  "error-handler-writes-perror",
  "test-ignores-perror",
] as const;

async function lint(source: string) {
  const report = await lintVbaModule({ module: "Probe", source });
  const findings = ERROR_RULES.flatMap((rule) => report.diagnostics[rule] ?? []);
  return { report, findings };
}

describe("error-propagation lint rules (#1863)", () => {
  it("runs the four rules by default", async () => {
    const { report } = await lint("Public Sub Demo()\nEnd Sub\n");
    for (const rule of ERROR_RULES) expect(report.rules).toContain(rule);
  });

  it("error-param-last: flags a p_Error that is not the last parameter", async () => {
    const { findings } = await lint(
      ["Public Sub Demo(Optional ByRef p_Error As String, ByVal x As Long)", "End Sub"].join("\n"),
    );
    const hits = findings.filter((f) => f.rule === "error-param-last");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.severity).toBe("error");
    expect(hits[0]?.line).toBe(1);
  });

  it("error-param-last: flags a last p_Error that is not Optional ByRef As String", async () => {
    const { findings } = await lint(
      ["Public Function Load(ByVal x As Long, ByRef p_Error As String) As String", "End Function"].join(
        "\n",
      ),
    );
    expect(findings.some((f) => f.rule === "error-param-last")).toBe(true);
  });

  it("error-param-last: accepts the canonical last Optional ByRef p_Error As String", async () => {
    const { findings } = await lint(
      ["Public Sub Demo(ByVal x As Long, Optional ByRef p_Error As String)", "End Sub"].join("\n"),
    );
    expect(findings.filter((f) => f.rule === "error-param-last")).toEqual([]);
  });

  it("error-propagation-check: flags a call to a p_Error method that is never checked", async () => {
    const source = [
      "Private Sub Inner(Optional ByRef p_Error As String)",
      "End Sub",
      "",
      "Public Sub Outer(Optional ByRef p_Error As String)",
      '    Dim e As String',
      "    Inner e",
      '    Debug.Print "after"',
      "End Sub",
    ].join("\n");
    const { findings } = await lint(source);
    const hits = findings.filter((f) => f.rule === "error-propagation-check");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.severity).toBe("error");
    expect(hits[0]?.line).toBe(6);
  });

  it("error-propagation-check: a checked call is clean", async () => {
    const source = [
      "Private Sub Inner(Optional ByRef p_Error As String)",
      "End Sub",
      "",
      "Public Sub Outer(Optional ByRef p_Error As String)",
      "    Dim e As String",
      "    Inner e",
      '    If e <> "" Then',
      '        p_Error = "Outer: " & e',
      "        Exit Sub",
      "    End If",
      "End Sub",
    ].join("\n");
    const { findings } = await lint(source);
    expect(findings.filter((f) => f.rule === "error-propagation-check")).toEqual([]);
  });

  it("error-propagation-check: omitting the error argument is a warning", async () => {
    const source = [
      "Private Sub Inner(Optional ByRef p_Error As String)",
      "End Sub",
      "",
      "Public Sub Outer(Optional ByRef p_Error As String)",
      "    Inner",
      "End Sub",
    ].join("\n");
    const { findings } = await lint(source);
    const hits = findings.filter((f) => f.rule === "error-propagation-check");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.severity).toBe("warning");
  });

  it("error-handler-writes-perror: flags a handler that never assigns p_Error", async () => {
    const source = [
      "Public Sub Handler(Optional ByRef p_Error As String)",
      "    On Error GoTo Fail",
      "    Exit Sub",
      "Fail:",
      "    MsgBox Err.Description",
      "End Sub",
    ].join("\n");
    const { findings } = await lint(source);
    expect(findings.some((f) => f.rule === "error-handler-writes-perror")).toBe(true);
  });

  it("error-handler-writes-perror: a handler that assigns p_Error is clean", async () => {
    const source = [
      "Public Sub Handler(Optional ByRef p_Error As String)",
      "    On Error GoTo Fail",
      "    Exit Sub",
      "Fail:",
      '    p_Error = "Handler: " & Err.Description',
      "End Sub",
    ].join("\n");
    const { findings } = await lint(source);
    expect(findings.filter((f) => f.rule === "error-handler-writes-perror")).toEqual([]);
  });

  it("test-ignores-perror: flags a Test_ function that discards a returned p_Error", async () => {
    const source = [
      "Private Sub Inner(Optional ByRef p_Error As String)",
      "End Sub",
      "",
      "Public Function Test_Demo() As String",
      "    Dim e As String",
      "    Inner e",
      '    Test_Demo = "{}"',
      "End Function",
    ].join("\n");
    const { findings } = await lint(source);
    const hits = findings.filter((f) => f.rule === "test-ignores-perror");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.line).toBe(6);
  });

  it("legacy methods without p_Error produce no error-propagation findings", async () => {
    const source = [
      "Private Sub Inner2()",
      "End Sub",
      "",
      "Public Sub Legacy()",
      "    Dim e As String",
      "    Inner2",
      "    Inner2",
      "End Sub",
    ].join("\n");
    const { findings } = await lint(source);
    expect(findings).toEqual([]);
  });
});
