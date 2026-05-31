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
});
