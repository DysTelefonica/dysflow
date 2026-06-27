import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT_PATH = join(REPO_ROOT, "scripts", "dysflow-vba-manager.ps1");
const ACCESS_PATH = join(REPO_ROOT, "E2E_testing", "NoConformidades.accdb");

const HAS_PWSH = platform() === "win32";

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runPwsh(
  args: readonly string[],
  env: Record<string, string | undefined> = {},
): Promise<SpawnResult> {
  return await new Promise((resolvePromise) => {
    const child = spawn("pwsh", ["-NoProfile", "-NonInteractive", "-File", SCRIPT_PATH, ...args], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (code) => {
      resolvePromise({ stdout, stderr, exitCode: code ?? -1 });
    });
  });
}

interface DysflowResultPayload {
  ok?: boolean;
  exported?: string[];
  warnings?: Array<Record<string, unknown>>;
  error?: string;
}

function parseDysflowResult(stdout: string): DysflowResultPayload | null {
  const lines = stdout.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("DYSFLOW_RESULT ")) {
      try {
        return JSON.parse(trimmed.slice("DYSFLOW_RESULT ".length)) as DysflowResultPayload;
      } catch {
        return null;
      }
    }
  }
  return null;
}

const skipReason = HAS_PWSH ? undefined : "pwsh is not available on this platform";

describe.skipIf(skipReason !== undefined)(
  "dysflow-vba-manager.ps1 export and import improvements",
  { timeout: 240_000 },
  () => {
    it("exports all forms/reports (with and without code) and queries successfully", async () => {
      // Ensure the fixture database exists
      await expect(access(ACCESS_PATH)).resolves.toBeUndefined();

      const tempExportDir = await mkdtemp(join(tmpdir(), "dysflow-export-test-"));

      const result = await runPwsh([
        "-Action",
        "Export",
        "-AccessPath",
        ACCESS_PATH,
        "-DestinationRoot",
        tempExportDir,
        "-Json",
      ]);

      expect(result.exitCode).toBe(0);

      const payload = parseDysflowResult(result.stdout);
      expect(payload).toBeDefined();
      expect(payload?.ok).toBe(true);

      // Verify forms/ folder exists and contains form files
      const formsFolder = join(tempExportDir, "forms");
      await expect(access(formsFolder)).resolves.toBeUndefined();

      // Verify reports/ folder exists
      const reportsFolder = join(tempExportDir, "reports");
      await expect(access(reportsFolder)).resolves.toBeUndefined();

      // Verify queries/ folder and queries.json exist
      const queriesFolder = join(tempExportDir, "queries");
      const queriesJsonPath = join(queriesFolder, "queries.json");
      await expect(access(queriesJsonPath)).resolves.toBeUndefined();

      const queriesJsonContent = await readFile(queriesJsonPath, "utf8");
      const queriesIndex = JSON.parse(queriesJsonContent);
      expect(Array.isArray(queriesIndex)).toBe(true);
      expect(queriesIndex.length).gt(0);

      for (const q of queriesIndex) {
        expect(q.name).toBeDefined();
        expect(q.file).toBeDefined();
        const sqlPath = join(tempExportDir, q.file);
        await expect(access(sqlPath)).resolves.toBeUndefined();
        const sqlContent = await readFile(sqlPath, "utf8");
        expect(sqlContent.toLowerCase()).toContain("select");
      }

      // Cleanup temp export directory
      await rm(tempExportDir, { recursive: true, force: true });
    });

    it("captures SaveAsText failures as warnings in export", async () => {
      const tempExportDir = await mkdtemp(join(tmpdir(), "dysflow-export-warn-test-"));

      // We pass a non-existent Form name. But wait, if we request an export of an object
      // that doesn't exist anywhere, Invoke-ExportAction throws VBA_MODULE_NOT_FOUND.
      // To trigger a SaveAsText failure inside Export-VbaModule, we can pass a name that is in the targets list,
      // but when SaveAsText is called, it fails.
      // Wait, how can we do this?
      // Let's modify E2E_testing/NoConformidades.accdb or write a test database?
      // Alternatively, we can test that if we mock a SaveAsText failure, it's captured in warnings.
      // Wait, is there a simple way to invoke Export with a name that is a class module but starts with Form_ ?
      // In NoConformidades.accdb, there are no class modules named Form_X that are not forms.
      // But what if we try to export a specific form that we know will fail? E.g., if we run the export,
      // but the form is open in design mode in another process, or if we pass a name that does not exist to Export-VbaModule.
      // Wait, we can test the error handling by writing a unit/integration test in TS, OR we can test the warning capture
      // by calling Export-VbaModule directly in a short PowerShell script!
      // Let's write the test using a small custom PowerShell wrapper or assert that if any module fails it writes warnings.
      // Yes! Let's do a runPwsh executing a script block that dot-sources dysflow-vba-manager.ps1 and calls Export-VbaModule.
      // But since the requirement is "failures in SaveAsText return warnings in the result",
      // let's verify if the warnings field is populated in the returned result.
      // Let's write a test that verifies this by calling Invoke-ExportAction with a mocked session.
      // Since we are running the actual PowerShell script, we can run a custom PowerShell command that loads the script
      // and tests the Invoke-ExportAction warning logic.
      const testScript = `
      $ErrorActionPreference = 'Stop'
      $content = Get-Content -Path '${SCRIPT_PATH.replace(/'/g, "''")}' -Raw
      $index = $content.IndexOf('$session = $null')
      if ($index -lt 0) { throw "Could not find routing block start" }
      $functions = $content.Substring(0, $index)
      $libPath = '${join(REPO_ROOT, "scripts", "lib", "dysflow-access-com.ps1").replace(/\\/g, "/")}'
      $functions = $functions -replace 'Join-Path \\$PSScriptRoot ''lib/dysflow-access-com.ps1''', "'$libPath'"
      $sb = [scriptblock]::Create($functions)
      
      # Dot-source the functions script block to define functions in this session
      . $sb -Action "List-Objects" -AccessPath "dummy" -DestinationRoot "dummy"
      
      # Mock a minimal session object
      $allForms = [pscustomobject]@{ Count = 1 }
      $allForms | Add-Member -MemberType ScriptMethod -Name Item -Value {
          param($idx)
          return [pscustomobject]@{ Name = "MockForm" }
      }
      
      $allReports = [pscustomobject]@{ Count = 0 }
      $allReports | Add-Member -MemberType ScriptMethod -Name Item -Value {
          param($idx)
          return $null
      }
      
      $accessApp = [pscustomobject]@{
          CurrentProject = [pscustomobject]@{
              AllForms = $allForms
              AllReports = $allReports
          }
      }
      $accessApp | Add-Member -MemberType ScriptMethod -Name SaveAsText -Value {
          param($type, $name, $path)
          throw "Mock SaveAsText COM error"
      }
      
      $session = [pscustomobject]@{
          VbProject = [pscustomobject]@{
              VBComponents = [pscustomobject]@{
                  Item = {
                      throw "Mock VBComponents Item error"
                  }
              }
          }
          AccessApplication = $accessApp
      }
      
      # Call Invoke-ExportAction on our mocked session
      Invoke-ExportAction -Session $session -NormalizedModules @("Form_MockForm") -ModulesPath '${tempExportDir.replace(/'/g, "''")}' -Json
    `;

      const child = spawn("pwsh", ["-NoProfile", "-NonInteractive", "-Command", testScript], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      await new Promise((res) => child.on("close", res));

      const payload = parseDysflowResult(stdout);
      if (!payload?.ok) {
        console.log("TEST STDOUT:", stdout);
        console.log("TEST STDERR:", stderr);
      }
      expect(payload).toBeDefined();
      expect(payload?.ok).toBe(true);
      expect(payload?.warnings).toBeDefined();
      expect(payload?.warnings?.length).toBe(1);
      expect(payload?.warnings?.[0]?.module).toBe("Form_MockForm");
      expect(payload?.warnings?.[0]?.error).toContain("Mock SaveAsText COM error");

      await rm(tempExportDir, { recursive: true, force: true });
    });

    it("Remove-AccessObjectOrComponent throws active lock error if component persists after Remove call", async () => {
      const testScript = `
        $ErrorActionPreference = 'Stop'
        $content = Get-Content -Path '${SCRIPT_PATH.replace(/'/g, "''")}' -Raw
        $index = $content.IndexOf('$session = $null')
        if ($index -lt 0) { throw "Could not find routing block start" }
        $functions = $content.Substring(0, $index)
        $libPath = '${join(REPO_ROOT, "scripts", "lib", "dysflow-access-com.ps1").replace(/\\/g, "/")}'
        $functions = $functions -replace 'Join-Path \\$PSScriptRoot ''lib/dysflow-access-com.ps1''', "'$libPath'"
        $sb = [scriptblock]::Create($functions)
        . $sb -Action "List-Objects" -AccessPath "dummy" -DestinationRoot "dummy"
        
        $mockVbProject = [pscustomobject]@{
            VBComponents = [pscustomobject]@{}
        }
        $mockVbProject.VBComponents | Add-Member -MemberType ScriptMethod -Name Item -Value {
            param($name)
            return [pscustomobject]@{
                Name = "LockedModule"
                Type = 1
            }
        }
        $mockVbProject.VBComponents | Add-Member -MemberType ScriptMethod -Name Remove -Value {
            param($comp)
        }
        
        $env:TEMP_RESOLVE = "LockedModule"
        function Resolve-ExistingComponentName { return $env:TEMP_RESOLVE }
        
        $mockAccessApp = [pscustomobject]@{
            # Mock Resolve-AccessObjectInfo
        }
        $mockAccessApp | Add-Member -MemberType ScriptMethod -Name RunCommand -Value {
            param($cmd)
        }
        
        try {
            $r = Remove-AccessObjectOrComponent -AccessApplication $mockAccessApp -VbProject $mockVbProject -ModuleName "LockedModule"
            Write-DysflowResult -Result $r -Depth 2
        } catch {
            Write-DysflowResult -Result ([ordered]@{ ok = $false; error = $_.Exception.Message }) -Depth 2
        }
      `;

      const child = spawn("pwsh", ["-NoProfile", "-NonInteractive", "-Command", testScript], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      await new Promise((res) => child.on("close", res));

      const payload = parseDysflowResult(stdout);
      expect(payload?.ok).toBe(false);
      expect(payload?.error).toContain("Active lock detected");
    });

    it("Invoke-AccessProcedure executes arity 0 procedure directly", async () => {
      const testScript = `
        $ErrorActionPreference = 'Stop'
        $content = Get-Content -Path '${SCRIPT_PATH.replace(/'/g, "''")}' -Raw
        $index = $content.IndexOf('$session = $null')
        if ($index -lt 0) { throw "Could not find routing block start" }
        $functions = $content.Substring(0, $index)
        $libPath = '${join(REPO_ROOT, "scripts", "lib", "dysflow-access-com.ps1").replace(/\\/g, "/")}'
        $functions = $functions -replace 'Join-Path \\$PSScriptRoot ''lib/dysflow-access-com.ps1''', "'$libPath'"
        $sb = [scriptblock]::Create($functions)
        . $sb -Action "List-Objects" -AccessPath "dummy" -DestinationRoot "dummy"
        
        $runCalled = $false
        $mockAccessApp = [pscustomobject]@{}
        $mockAccessApp | Add-Member -MemberType ScriptMethod -Name Run -Value {
            param($procName)
            $script:runCalled = $true
            return "arity-0-success"
        }
        
        function Get-VbaProcedureParameterMetadata {
            return @()
        }
        
        $result = Invoke-AccessProcedure -AccessApplication $mockAccessApp -ProcedureName "Arity0Proc" -ProcedureArgs @() -VbProject $null
        
        Write-DysflowResult -Result ([ordered]@{
            ok = $result.ok
            runCalled = $script:runCalled
            returnValue = $result.returnValue
        }) -Depth 2
      `;

      const child = spawn("pwsh", ["-NoProfile", "-NonInteractive", "-Command", testScript], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      await new Promise((res) => child.on("close", res));

      const payload = parseDysflowResult(stdout) as Record<string, unknown>;
      expect(payload?.ok).toBe(true);
      expect(payload?.runCalled).toBe(true);
      expect(payload?.returnValue).toBe("arity-0-success");
    });
  },
);
