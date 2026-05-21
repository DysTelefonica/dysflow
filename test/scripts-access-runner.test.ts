import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/dysflow-access-runner.ps1", "utf8");

describe("dysflow-access-runner.ps1", () => {
  it("serializes seed_fixture numeric, boolean, and null values without quoting them as strings", () => {
    expect(script).toContain("Format-SqlLiteral");
    expect(script).toContain("if ($null -eq $Value) { return \"NULL\" }");
    expect(script).toContain("if ($Value -is [bool]) { if ($Value) { return \"True\" } else { return \"False\" } }");
    expect(script).toContain("if ($Value -is [byte] -or $Value -is [int16] -or $Value -is [int] -or $Value -is [int64] -or $Value -is [single] -or $Value -is [double] -or $Value -is [decimal]) { return ([string]$Value) }");
    expect(script).toContain("$values += Format-SqlLiteral $value");
    expect(script).not.toContain("$values += '\" + ($value.ToString().Replace(\"'\", \"''\")) + \"'");
  });

  it("splits run_script SQL without treating semicolons inside single-quoted strings as statement separators", () => {
    expect(script).toContain("Split-SqlStatements");
    expect(script).toContain("$inSingleQuote = -not $inSingleQuote");
    expect(script).toContain("if ($char -eq \"'\" -and $inSingleQuote -and $nextChar -eq \"'\")");
    expect(script).toContain("if ($char -eq \";\" -and -not $inSingleQuote)");
    expect(script).toContain("$statements = @(Split-SqlStatements (Get-Content -LiteralPath $scriptPath -Raw))");
    expect(script).not.toContain(".Split([char]\";\")");
  });

  it("reads Access passwords from environment variables and constrains query export paths", () => {
    expect(script).toContain("$AccessPassword = $env:DYSFLOW_ACCESS_PASSWORD");
    expect(script).toContain("$AccessPassword = $env:ACCESS_VBA_PASSWORD");
    expect(script).toContain("$BackendPassword = $env:DYSFLOW_BACKEND_PASSWORD");
    expect(script).not.toContain("$BackendPassword = $env:ACCESS_VBA_PASSWORD");
    expect(script).toContain("Open-DatabaseWithBackendPassword -DbEngine $dbEngine -DatabasePath $backendPath");
    expect(script).toContain("Open-DatabaseWithBackendPassword -DbEngine $dbEngine -DatabasePath $BackendPath");
    expect(script).toContain("if ([string]::IsNullOrWhiteSpace($BackendPassword)) {");
    expect(script).toContain('$linked.Connect = ";DATABASE=$backendPath;PWD=$BackendPassword"');
    expect(script).toContain('Resolve-SandboxedPath -RawPath $exportPath -RootPath $basePath -Label "exportPath"');
    expect(script).toContain('Resolve-SandboxedPath -RawPath ([string]$Payload.importPath) -RootPath $basePath -Label "importPath"');
    expect(script).toContain("importPath extension must be .json.");
    expect(script).toContain('Resolve-SandboxedPath -RawPath $targetPath -RootPath $folder -Label "targetPath"');
    expect(script).toContain('Resolve-SandboxedPath -RawPath ([string]$Payload.scriptPath) -RootPath $rootPath');
    expect(script).toContain('Resolve-SandboxedPath -RawPath $targetPath -RootPath $folder -Label "targetPath"');
    expect(script).toContain("Export-QueryDefinitions -Database $db -Payload $payload -AccessDbPath $AccessDbPath");
  });
});
