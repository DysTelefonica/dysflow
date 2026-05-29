import { writeFile } from "node:fs/promises";
import path from "node:path";

function escapeCmdSetValue(value: string): string {
  return value.replaceAll("%", "%%").replaceAll('"', '^"');
}

function escapePowerShellDoubleQuotedString(value: string): string {
  return value.replaceAll("`", "``").replaceAll("$", "`$").replaceAll('"', '`"');
}

export async function writeRuntimeLaunchers(binDir: string, runtimeDir: string): Promise<void> {
  const normalizedRuntimeDir = runtimeDir.replaceAll("\\", "\\\\");
  const cmdRuntimeDir = escapeCmdSetValue(normalizedRuntimeDir);
  const psRuntimeDir = escapePowerShellDoubleQuotedString(normalizedRuntimeDir);
  const cmdContent = [
    "@echo off",
    "setlocal",
    `set "DYSFLOW_HOME=${cmdRuntimeDir}"`,
    // Prepend Node pnpm/npm path so child processes (pnpm install during update)
    // can find the package manager even when launched without a full PATH.
    `set "PATH=%ProgramFiles%\\nodejs;%PATH%"`,
    `node "%DYSFLOW_HOME%\\app\\dist\\cli\\index.js" %*`,
    "exit /b %ERRORLEVEL%",
    "",
  ].join("\r\n");

  const ps1Content = [
    '$ErrorActionPreference = "Stop"',
    `$env:DYSFLOW_HOME = "${psRuntimeDir}"`,
    `$env:PATH = "$env:ProgramFiles\\nodejs;$env:PATH"`,
    `& node (Join-Path $env:DYSFLOW_HOME "app\\dist\\cli\\index.js") @args`,
    "exit $LASTEXITCODE",
    "",
  ].join("\r\n");

  await writeFile(path.join(binDir, "dysflow.cmd"), cmdContent, "utf8");
  await writeFile(path.join(binDir, "dysflow.ps1"), ps1Content, "utf8");
}
