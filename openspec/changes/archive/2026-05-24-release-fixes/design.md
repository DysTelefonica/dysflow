# Design: Release Fixes

## Component Changes

### 1. PowerShell Runner (`scripts/dysflow-access-runner.ps1`)

#### Open-DatabaseWithPassword
Define a new helper function at the top of the script:
```powershell
function Open-DatabaseWithPassword {
  param(
    [Parameter(Mandatory = $true)] $DbEngine,
    [Parameter(Mandatory = $true)] [string] $DatabasePath,
    [Parameter(Mandatory = $false)] [bool] $Exclusive = $false,
    [Parameter(Mandatory = $false)] [bool] $ReadOnly = $false,
    [Parameter(Mandatory = $false)] [string] $Password = ""
  )
  if ([string]::IsNullOrWhiteSpace($Password)) {
    return $DbEngine.OpenDatabase($DatabasePath, $Exclusive, $ReadOnly)
  }
  return $DbEngine.OpenDatabase($DatabasePath, $Exclusive, $ReadOnly, ";PWD=$Password")
}
```

#### Open-DatabaseWithBackendPassword
Update `Open-DatabaseWithBackendPassword` to use the helper:
```powershell
function Open-DatabaseWithBackendPassword {
  param(
    [Parameter(Mandatory = $true)] $DbEngine,
    [Parameter(Mandatory = $true)] [string] $DatabasePath
  )
  return Open-DatabaseWithPassword -DbEngine $DbEngine -DatabasePath $DatabasePath -ReadOnly $false -Password $BackendPassword
}
```

#### Invoke-RelinkDirectory Database Open
Change:
```powershell
$db = $dbEngine.OpenDatabase($file.FullName, $false, $true)
```
to:
```powershell
$db = Open-DatabaseWithPassword -DbEngine $dbEngine -DatabasePath $file.FullName -ReadOnly $true -Password $AccessPassword
```
And change:
```powershell
$dbWrite = $dbEngine.OpenDatabase($file.FullName, $false, $false)
```
to:
```powershell
$dbWrite = Open-DatabaseWithPassword -DbEngine $dbEngine -DatabasePath $file.FullName -ReadOnly $false -Password $AccessPassword
```

#### Resolve-LinkChain Database Open
Change:
```powershell
$nextDb = $DbEngine.OpenDatabase($localPath, $false, $true)
```
to:
```powershell
$nextDb = $null
try {
  $nextDb = Open-DatabaseWithPassword -DbEngine $DbEngine -DatabasePath $localPath -ReadOnly $true -Password $BackendPassword
} catch {
  if (-not [string]::IsNullOrWhiteSpace($AccessPassword)) {
    $nextDb = Open-DatabaseWithPassword -DbEngine $DbEngine -DatabasePath $localPath -ReadOnly $true -Password $AccessPassword
  } else {
    throw $_
  }
}
```

#### Connect String Password Append
In `Invoke-RelinkDirectory` when remapping table links:
```powershell
$tdW.Connect = if ([string]::IsNullOrWhiteSpace($BackendPassword)) { ";DATABASE=$targetPath" } else { ";DATABASE=$targetPath;PWD=$BackendPassword" }
```
And only assign `SourceTableName` if it is different from the resolved table:
```powershell
if ($chain.resolvedTable -and $tdW.SourceTableName -ne $chain.resolvedTable) {
  $tdW.SourceTableName = $chain.resolvedTable
}
```

### 2. E2E Test Files (`test/e2e/access-relink-directory.test.ts` and `test/e2e/access-relink-directory-apply.test.ts`)

Modify the `chain A→B→C` test cases so that:
1. Create native `C_backend.accdb` with a native table `Products`.
2. Create native `B_middle.accdb` with a native table `Products`.
3. Create `frontend.accdb` linking `Products` to `B_middle.accdb` (this succeeds because `B_middle.accdb` currently has a native table).
4. Re-link `B_middle.accdb` to point to `C_backend.accdb`. To do this:
   - Open `B_middle.accdb`.
   - Delete the native table `Products`.
   - Create a linked table `Products` in `B_middle.accdb` pointing to `C_backend.accdb`.
5. Run the E2E relink directory command, which will successfully trace A → B → C and remap A to point to C directly.

### 3. CLI Install Handler (`src/cli/commands/install.ts`)

Change `runCommand` and `runCommandOutput` to route `.cmd` command execution via `cmd.exe` on Windows with `shell: false`.
```typescript
const isCmd = process.platform === "win32" && (command === "pnpm" || command === "npm");
const execCmd = isCmd ? (process.env.ComSpec || "cmd.exe") : command;
const execArgs = isCmd ? ["/d", "/s", "/c", `${command}.cmd`, ...args] : [...args];
```
This is fully compatible, safer, and does not raise DEP0190 warnings.
