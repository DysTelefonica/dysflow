import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/dysflow-vba-manager.ps1", "utf8");
const sharedModule = readFileSync("scripts/lib/dysflow-access-com.ps1", "utf8");

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getActionArmBody(action: string): string {
  const escaped = escapeRegExp(action);
  const match = script.match(
    new RegExp(
      `(?:if|elseif) \\(\\$Action -eq "${escaped}"\\) \\{([\\s\\S]*?)(?=\\n\\s*\\} elseif \\(\\$Action -eq "|\\n\\s*\\} else \\{|\\n\\s*\\} finally \\{)`,
    ),
  );
  expect(match, `dispatcher arm for ${action}`).not.toBeNull();
  return match?.[1] ?? "";
}

function getFinalElseArmBody(): string {
  const match = script.match(
    /\n\s*\} else \{([\s\S]*?Invoke-FixEncodingAction[\s\S]*?)\n\s*\}\s*finally \{/,
  );
  expect(match, "dispatcher final else arm before finally").not.toBeNull();
  return match?.[1] ?? "";
}

function extractFunctionBody(source: string, name: string): string {
  const startMatch = source.match(new RegExp(`function\\s+${escapeRegExp(name)}\\b`));
  expect(startMatch, `function ${name}`).not.toBeNull();
  if (!startMatch || startMatch.index === undefined) return "";

  const openBrace = source.indexOf("{", startMatch.index);
  expect(openBrace, `opening brace for ${name}`).toBeGreaterThanOrEqual(0);
  let depth = 1;
  for (let i = openBrace + 1; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    if (depth === 0) return source.slice(startMatch.index, i + 1);
  }
  return source.slice(startMatch.index);
}

describe("dysflow-vba-manager.ps1", () => {
  it("Goal B: defines a bounded WMI helper function (in shared module, dot-sourced by this script)", () => {
    // After the Slice 1 dedup, Get-MsAccessProcessesBounded lives in
    // scripts/lib/dysflow-access-com.ps1 and is dot-sourced by both scripts.
    // The behavioral contract (bounded WMI, injectable seam) is preserved in the module.
    expect(sharedModule).toContain("function Get-MsAccessProcessesBounded");
    // Dot-source line must be present in the script so the function is available at runtime.
    expect(script).toContain(". (Join-Path $PSScriptRoot 'lib/dysflow-access-com.ps1')");
    // After the injectable-seam refactor the job is started via Start-Job -ScriptBlock $WmiScriptBlock;
    // the literal CIM query is the default value of the $WmiScriptBlock param.
    expect(sharedModule).toContain("Start-Job -ScriptBlock $WmiScriptBlock");
    // The default WmiScriptBlock param must still query MSACCESS.EXE
    expect(sharedModule).toContain("Get-CimInstance Win32_Process");
    expect(sharedModule).toContain("Wait-Job");
  });

  it("Goal B: Close-TargetAccessDbIfOpen delegates to the bounded helper", () => {
    // Slice 5: Close-TargetAccessDbIfOpen was moved to the shared module (single source of truth).
    // The bounded helper must be called from within the function in the shared module.
    const funcBody = extractFunctionBody(sharedModule, "Close-TargetAccessDbIfOpen");
    expect(funcBody).toContain("Get-MsAccessProcessesBounded");
  });

  it("Goal B: Find-AccessPidByDatabase uses the bounded helper, not bare Get-CimInstance", () => {
    const funcBody = extractFunctionBody(script, "Find-AccessPidByDatabase");
    // Must use bounded helper
    expect(funcBody).toContain("Get-MsAccessProcessesBounded");
    // Must NOT use bare Get-CimInstance directly
    const bareLines = funcBody
      .split("\n")
      .filter(
        (line) =>
          line.includes("Get-CimInstance Win32_Process") &&
          !line.trimStart().startsWith("#") &&
          !line.includes("Start-Job"),
      );
    expect(bareLines).toHaveLength(0);
  });

  it("Goal B: no bare Get-CimInstance Win32_Process outside scriptblocks in the entire script", () => {
    // Lines containing the CIM call that are acceptable:
    //   - commented lines (trimStart starts with #)
    //   - Start-Job lines (legacy exclusion — not present after injectable-seam refactor)
    //   - scriptblock default param assignments (contain $WmiScriptBlock =)
    const linesWithBareCim = script
      .split("\n")
      .filter(
        (line) =>
          line.includes("Get-CimInstance Win32_Process") &&
          !line.trimStart().startsWith("#") &&
          !line.includes("Start-Job") &&
          !line.includes("$WmiScriptBlock ="),
      );
    expect(linesWithBareCim).toHaveLength(0);
  });

  it("S1: Export arm in dispatcher calls Invoke-ExportAction (wiring change-detector)", () => {
    // Wiring check: the Export if-arm must delegate to the extracted function.
    // This test is RED until Invoke-ExportAction is extracted and the arm replaced.
    expect(getActionArmBody("Export")).toContain("Invoke-ExportAction");
  });

  it("S2: List-Objects arm in dispatcher calls Invoke-ListObjectsAction (wiring change-detector)", () => {
    expect(getActionArmBody("List-Objects")).toContain("Invoke-ListObjectsAction");
  });

  it("S2: Exists arm in dispatcher calls Invoke-ExistsAction (wiring change-detector)", () => {
    expect(getActionArmBody("Exists")).toContain("Invoke-ExistsAction");
  });

  it("S3: Generate-ERD arm in dispatcher calls Invoke-GenerateErdAction (wiring change-detector)", () => {
    expect(getActionArmBody("Generate-ERD")).toContain("Invoke-GenerateErdAction");
  });

  it("S4: Delete arm in dispatcher calls Invoke-DeleteAction (wiring change-detector)", () => {
    expect(getActionArmBody("Delete")).toContain("Invoke-DeleteAction");
  });

  it("S5: Compile arm in dispatcher calls Invoke-CompileAction (wiring change-detector)", () => {
    expect(getActionArmBody("Compile")).toContain("Invoke-CompileAction");
  });

  it("S5: Run-Procedure arm in dispatcher calls Invoke-RunProcedureAction (wiring change-detector)", () => {
    expect(getActionArmBody("Run-Procedure")).toContain("Invoke-RunProcedureAction");
  });

  it("S6: Run-Tests arm in dispatcher calls Invoke-RunTestsAction (wiring change-detector)", () => {
    expect(getActionArmBody("Run-Tests")).toContain("Invoke-RunTestsAction");
  });

  it("S6: Fix-Encoding arm in dispatcher calls Invoke-FixEncodingAction (wiring change-detector)", () => {
    expect(getFinalElseArmBody()).toContain("Invoke-FixEncodingAction");
  });

  it("S7: Import arm delegates to Invoke-ImportAction and reads CreatedComponentNames", () => {
    const importArm = getActionArmBody("Import");
    expect(importArm).toContain("Invoke-ImportAction");
    expect(importArm).toContain("CreatedComponentNames");
    expect(importArm).toContain("Save-VbaProjectModules");
  });

  it("S7: Import arm saves created components before emitting final OK", () => {
    const importArm = getActionArmBody("Import");
    const saveIndex = importArm.indexOf("Save-VbaProjectModules");
    const okIndex = importArm.indexOf("OK Import completado");

    expect(saveIndex).toBeGreaterThanOrEqual(0);
    expect(okIndex).toBeGreaterThanOrEqual(0);
    expect(saveIndex).toBeLessThan(okIndex);
    expect(extractFunctionBody(script, "Invoke-ImportAction")).not.toContain(
      "OK Import completado",
    );
  });

  it("Goal E: Write-DysflowOperationMarker uses millisecond ISO format for processStartTime", () => {
    const funcBody = extractFunctionBody(script, "Write-DysflowOperationMarker");
    // Must use 3-digit ms format for the startTime (processStartTime)
    expect(funcBody).toContain('"yyyy-MM-ddTHH:mm:ss.fffZ"');
    // The startTime line specifically must NOT use round-trip format — check the assignment line
    const startTimeLine = funcBody
      .split("\n")
      .find((l) => l.includes("$startTime =") && l.includes(".ToString("));
    expect(startTimeLine).toBeDefined();
    expect(startTimeLine).not.toContain('.ToString("o")');
    expect(startTimeLine).toContain('"yyyy-MM-ddTHH:mm:ss.fffZ"');
  });
});
