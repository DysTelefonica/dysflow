import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const step = workflow
  .split("      - name: Run PowerShell Pester tests")[1]
  ?.split(/\r?\n {6}- name:/)[0];
const command = step?.split(/run: \|\r?\n/)[1];

describe("repository-controlled Pester selection (#1835)", () => {
  it.each(["none", "wrong", "required"])(
    "selects the same version when ambient state is %s",
    (ambient) => {
      expect(command).toBeDefined();
      const result = spawnSync(
        "pwsh",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `
      $ErrorActionPreference = 'Stop'
      $script:installed = $false
      function Get-Module {
        param([switch]$ListAvailable, [string]$Name)
        if ('${ambient}' -eq 'wrong') { [pscustomobject]@{Version=[version]'3.4.0'} }
        if ('${ambient}' -eq 'required') { [pscustomobject]@{Version=[version]'5.7.1'} }
      }
      function Install-Module {
        param([string]$Name, [string]$RequiredVersion, [switch]$Force, [string]$Scope)
        if ($RequiredVersion -ne '5.7.1') { throw 'installation is not pinned' }
        $script:installed = $true
      }
      function Import-Module {
        param([string]$Name, [string]$RequiredVersion, [switch]$Force, [switch]$PassThru)
        if ($RequiredVersion -ne '5.7.1') { throw 'import is not pinned' }
        if ('${ambient}' -ne 'required' -and -not $script:installed) { throw 'required module was not installed' }
        if ($PassThru) { [pscustomobject]@{Version=[version]'5.7.1'} }
      }
      function Invoke-Pester { param($Path, [switch]$PassThru, $Output); [pscustomobject]@{FailedCount=0} }
      ${command ?? "throw 'step missing'"}
      if ($script:installed -ne ('${ambient}' -ne 'required')) { throw 'wrong installation decision' }
    `,
        ],
        { encoding: "utf8" },
      );
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("5.7.1");
    },
  );
});
