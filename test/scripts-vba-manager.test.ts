import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/dysflow-vba-manager.ps1", "utf8");

describe("dysflow-vba-manager.ps1", () => {
  it("Goal B: defines a bounded WMI helper function", () => {
    expect(script).toContain("function Get-MsAccessProcessesBounded");
    // After the injectable-seam refactor the job is started via Start-Job -ScriptBlock $WmiScriptBlock;
    // the literal CIM query is the default value of the $WmiScriptBlock param.
    expect(script).toContain("Start-Job -ScriptBlock $WmiScriptBlock");
    // The default WmiScriptBlock param must still query MSACCESS.EXE
    expect(script).toContain("Get-CimInstance Win32_Process");
    expect(script).toContain("Wait-Job");
  });

  it("Goal B: Close-TargetAccessDbIfOpen delegates to the bounded helper", () => {
    // The bounded helper must be called from within the function
    const lines = script.split("\n");
    const funcStart = lines.findIndex((l) => l.includes("function Close-TargetAccessDbIfOpen"));
    const funcEnd = (() => {
      let depth = 0;
      for (let i = funcStart; i < lines.length; i++) {
        for (const ch of lines[i]) {
          if (ch === "{") depth++;
          else if (ch === "}") depth--;
        }
        if (depth === 0 && i > funcStart) return i;
      }
      return lines.length;
    })();
    const funcBody = lines.slice(funcStart, funcEnd + 1).join("\n");
    expect(funcBody).toContain("Get-MsAccessProcessesBounded");
  });

  it("Goal B: Find-AccessPidByDatabase uses the bounded helper, not bare Get-CimInstance", () => {
    const lines = script.split("\n");
    const funcStart = lines.findIndex((l) => l.includes("function Find-AccessPidByDatabase"));
    const funcEnd = (() => {
      let depth = 0;
      for (let i = funcStart; i < lines.length; i++) {
        for (const ch of lines[i]) {
          if (ch === "{") depth++;
          else if (ch === "}") depth--;
        }
        if (depth === 0 && i > funcStart) return i;
      }
      return lines.length;
    })();
    const funcBody = lines.slice(funcStart, funcEnd + 1).join("\n");
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
    expect(script).toContain("Invoke-ExportAction");
  });

  it("S2: List-Objects arm in dispatcher calls Invoke-ListObjectsAction (wiring change-detector)", () => {
    expect(script).toContain("Invoke-ListObjectsAction");
  });

  it("S2: Exists arm in dispatcher calls Invoke-ExistsAction (wiring change-detector)", () => {
    expect(script).toContain("Invoke-ExistsAction");
  });

  it("Goal E: Write-DysflowOperationMarker uses millisecond ISO format for processStartTime", () => {
    const lines = script.split("\n");
    const funcStart = lines.findIndex((l) => l.includes("function Write-DysflowOperationMarker"));
    const funcEnd = (() => {
      let depth = 0;
      for (let i = funcStart; i < lines.length; i++) {
        for (const ch of lines[i]) {
          if (ch === "{") depth++;
          else if (ch === "}") depth--;
        }
        if (depth === 0 && i > funcStart) return i;
      }
      return lines.length;
    })();
    const funcBody = lines.slice(funcStart, funcEnd + 1).join("\n");
    // Must use 3-digit ms format for the startTime (processStartTime)
    expect(funcBody).toContain('"yyyy-MM-ddTHH:mm:ss.fffZ"');
    // The startTime line specifically must NOT use round-trip format — check the assignment line
    const startTimeLine = lines
      .slice(funcStart, funcEnd + 1)
      .find((l) => l.includes("$startTime =") && l.includes(".ToString("));
    expect(startTimeLine).toBeDefined();
    expect(startTimeLine).not.toContain('.ToString("o")');
    expect(startTimeLine).toContain('"yyyy-MM-ddTHH:mm:ss.fffZ"');
  });
});
