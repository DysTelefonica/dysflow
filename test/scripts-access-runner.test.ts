import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/dysflow-access-runner.ps1", "utf8");

describe("dysflow-access-runner.ps1", () => {
  it("serializes seed_fixture numeric, boolean, and null values without quoting them as strings", () => {
    expect(script).toContain("Format-SqlLiteral");
    expect(script).toContain('if ($null -eq $Value) { return "NULL" }');
    expect(script).toContain(
      'if ($Value -is [bool]) { if ($Value) { return "True" } else { return "False" } }',
    );
    expect(script).toContain(
      "if ($Value -is [byte] -or $Value -is [int16] -or $Value -is [int] -or $Value -is [int64] -or $Value -is [single] -or $Value -is [double] -or $Value -is [decimal]) { return ([string]$Value) }",
    );
    expect(script).toContain("$values += Format-SqlLiteral $value");
    expect(script).not.toContain(
      '$values += \'" + ($value.ToString().Replace("\'", "\'\'")) + "\'',
    );
  });

  it("splits run_script SQL without treating semicolons inside single-quoted strings as statement separators", () => {
    expect(script).toContain("Split-SqlStatements");
    expect(script).toContain("$inSingleQuote = -not $inSingleQuote");
    expect(script).toContain('if ($char -eq "\'" -and $inSingleQuote -and $nextChar -eq "\'")');
    expect(script).toContain('if ($char -eq ";" -and -not $inSingleQuote)');
    expect(script).toContain(
      "$statements = @(Split-SqlStatements (Get-Content -LiteralPath $scriptPath -Raw))",
    );
    expect(script).not.toContain('.Split([char]";")');
  });

  it("reads Access passwords from environment variables and constrains query export paths", () => {
    expect(script).toContain("$AccessPassword = $env:DYSFLOW_ACCESS_PASSWORD");
    expect(script).toContain("$AccessPassword = $env:ACCESS_VBA_PASSWORD");
    expect(script).toContain("$BackendPassword = $env:DYSFLOW_BACKEND_PASSWORD");
    expect(script).not.toContain("$BackendPassword = $env:ACCESS_VBA_PASSWORD");
    expect(script).toContain("[Parameter(Mandatory = $false)] [bool] $ReadOnly = $false");
    expect(script).toContain(
      'return $DbEngine.OpenDatabase($DatabasePath, $Exclusive, $ReadOnly, ";PWD=$Password")',
    );
    expect(script).toContain(
      "Open-DatabaseWithBackendPassword -DbEngine $dbEngine -DatabasePath $backendPath",
    );
    expect(script).toContain(
      "Open-DatabaseWithBackendPassword -DbEngine $dbEngine -DatabasePath $BackendPath",
    );
    expect(script).toContain(
      "Open-DatabaseWithPassword -DbEngine $dbEngine -DatabasePath $file.FullName -ReadOnly $true -Password $AccessPassword",
    );
    expect(script).toContain(
      "Open-DatabaseWithPassword -DbEngine $dbEngine -DatabasePath $file.FullName -ReadOnly $false -Password $AccessPassword",
    );
    expect(script).toContain(
      "Open-DatabaseWithPassword -DbEngine $DbEngine -DatabasePath $localPath -ReadOnly $true -Password $BackendPassword",
    );
    expect(script).toContain("if ([string]::IsNullOrWhiteSpace($BackendPassword)) {");
    expect(script).toContain('$linked.Connect = ";DATABASE=$backendPath;PWD=$BackendPassword"');
    expect(script).toContain("$tdW.Connect = $newConnect");
    expect(script).not.toContain("$tdW.SourceTableName = $chain.resolvedTable");
    expect(script).toContain("[regex]::Match($connectStr, '(?i)(?:^|;)DATABASE=([^;]+)')");
    expect(script).not.toContain("[regex]::Match($connectStr, '(?i)(?:^|;)DATABASE=(.+)$')");
    expect(script).toContain(
      'Resolve-SandboxedPath -RawPath $exportPath -RootPath $basePath -Label "exportPath"',
    );
    expect(script).toContain(
      'Resolve-SandboxedPath -RawPath ([string]$Payload.importPath) -RootPath $basePath -Label "importPath"',
    );
    expect(script).toContain("importPath extension must be .json.");
    expect(script).toContain(
      'Resolve-SandboxedPath -RawPath $targetPath -RootPath $folder -Label "targetPath"',
    );
    expect(script).toContain(
      "Resolve-SandboxedPath -RawPath ([string]$Payload.scriptPath) -RootPath $rootPath",
    );
    expect(script).toContain(
      'Resolve-SandboxedPath -RawPath $targetPath -RootPath $folder -Label "targetPath"',
    );
    expect(script).toContain(
      "Export-QueryDefinitions -Database $db -Payload $payload -AccessDbPath $AccessDbPath",
    );
  });

  it("does not contain invalid PowerShell variable references followed by colons inside double-quoted strings", () => {
    expect(script).not.toContain("Delete $linkName:");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: asserting literal PowerShell variable reference syntax
    expect(script).toContain("Delete ${linkName}:");
  });

  it("routes generic SQL reads and writes through selected database helpers", () => {
    expect(script).toContain(
      "$readDb = Resolve-ReadActionDatabase -DbEngine $access.DBEngine -CurrentDb $db -Payload $payload",
    );
    expect(script).toContain(
      "Invoke-QuerySqlReadAction -Database $readDb.Database -Sql ([string]$payload.sql)",
    );
    expect(script).toContain("$rs = $Database.OpenRecordset([string]$Sql)");
    expect(script).toContain(
      "$writeDb = Resolve-WriteActionDatabase -DbEngine $access.DBEngine -CurrentDb $db -Payload $payload",
    );
    expect(script).toContain("$writeDb.Database.Execute([string]$payload.sql, 128)");
    expect(script).not.toContain("$rs = $db.OpenRecordset([string]$payload.sql)");
    expect(script).not.toContain("$db.Execute([string]$payload.sql, 128)");
  });

  it("Goal B: defines a bounded WMI helper and uses it instead of bare Get-CimInstance in cleanup/fallback paths", () => {
    // The bounded helper function must be defined
    expect(script).toContain("function Get-MsAccessProcessesBounded");
    // It must use Start-Job + Wait-Job inside a scriptblock
    expect(script).toContain("Start-Job -ScriptBlock { Get-CimInstance Win32_Process");
    expect(script).toContain("Wait-Job");
    // Get-MsAccessProcesses (WMI-fallback snapshot) must delegate to the bounded helper
    expect(script).toContain("Get-MsAccessProcessesBounded");
    // finally-block fallback DB lookup must go through the bounded helper too
    // (no bare Get-CimInstance Win32_Process outside a Start-Job scriptblock)
    const linesWithBareCim = script
      .split("\n")
      .filter(
        (line) =>
          line.includes("Get-CimInstance Win32_Process") &&
          !line.trimStart().startsWith("#") &&
          !line.includes("Start-Job"),
      );
    expect(linesWithBareCim).toHaveLength(0);
    // hWnd primary path and Get-ProcessIdFromHwnd must still be present
    expect(script).toContain("hWndAccessApp");
    expect(script).toContain("Get-ProcessIdFromHwnd");
    // DYSFLOW_ACCESS_PROCESS marker must still be emitted
    expect(script).toContain("DYSFLOW_ACCESS_PROCESS");
  });

  it("Goal B: emits DYSFLOW_ACCESS_PROCESS marker from the hWnd primary PID capture path", () => {
    // The marker should be emitted right after the hWnd primary capture succeeds,
    // not only inside the WMI fallback Write-AccessProcessMarker function.
    // We verify this by checking that the marker emission (Console.Error.WriteLine)
    // appears outside the Write-AccessProcessMarker function body.
    const lines = script.split("\n");
    const markerEmitLineIdx = lines.findIndex(
      (l) => l.includes("DYSFLOW_ACCESS_PROCESS") && l.includes("Console]::Error.WriteLine"),
    );
    expect(markerEmitLineIdx).toBeGreaterThan(-1);
    // Find the function boundary for Write-AccessProcessMarker
    const funcStart = lines.findIndex((l) => l.includes("function Write-AccessProcessMarker"));
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
    // There must be a marker emission outside (after) Write-AccessProcessMarker
    const outsideEmissions = lines
      .map((l, i) => ({ line: l, idx: i }))
      .filter(
        ({ line, idx }) =>
          line.includes("DYSFLOW_ACCESS_PROCESS") &&
          line.includes("Console]::Error.WriteLine") &&
          (idx < funcStart || idx > funcEnd),
      );
    expect(outsideEmissions.length).toBeGreaterThan(0);
  });

  it("Goal E: ConvertTo-IsoStartTime uses millisecond ISO format, not round-trip format", () => {
    // Must use 3-digit ms format with trailing Z
    expect(script).toContain('"yyyy-MM-ddTHH:mm:ss.fffZ"');
    // Must NOT use .ToString('o') in ConvertTo-IsoStartTime (round-trip gives 7 fractional digits)
    // Check by extracting the function body
    const lines = script.split("\n");
    const funcStart = lines.findIndex((l) => l.includes("function ConvertTo-IsoStartTime"));
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
    expect(funcBody).not.toContain(".ToString('o')");
    expect(funcBody).toContain('"yyyy-MM-ddTHH:mm:ss.fffZ"');
  });
});
