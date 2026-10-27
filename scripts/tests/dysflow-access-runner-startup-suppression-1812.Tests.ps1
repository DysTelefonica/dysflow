#requires -Version 5.1

BeforeAll {
    # Only DAO/Access I/O is replaced. Execute the production helpers and the
    # actual main try/finally; omit its process exit to retain the test host.
    $runnerPath = if ($env:DYSFLOW_STARTUP_TEST_RUNNER) { $env:DYSFLOW_STARTUP_TEST_RUNNER }
        else { Join-Path $PSScriptRoot '../dysflow-access-runner.ps1' }
    $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($runnerPath, [ref]$null, [ref]$errors)
    if ($errors.Count) { throw $errors[0] }
    foreach ($name in @('Disable-StartupFeatures', 'Restore-StartupFeatures', 'Invoke-WithDaoDatabase',
            'Open-DatabaseWithPassword', 'ConvertFrom-JsonCompat', 'Resolve-QueryActionTargetPath')) {
        $definition = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name }, $true)
        # DAO COM accepts a parameterized property; the managed I/O fake uses
        # the equivalent explicit Item indexer, with identical lookup failures.
        $text = $definition.Extent.Text.Replace('$db.Properties("StartupForm")', '$db.Properties.Item("StartupForm")')
        Invoke-Expression ($text -replace "^function\s+$name", "function script:$name")
    }
    # The runner dot-sources the shared Application.Run marshaling (#1940); it
    # defines functions only and never creates a COM object.
    . (Join-Path (Split-Path -Parent $runnerPath) 'lib/dysflow-access-run.ps1')
    $main = @($ast.EndBlock.Statements | Where-Object { $_ -is [System.Management.Automation.Language.TryStatementAst] })[-1]
    $script:RunnerMain = [scriptblock]::Create(($main.Extent.Text -replace 'exit \$script:exitCode', '$null = $script:exitCode'))
    if (-not ('Startup1812.Database' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Collections;
using System.Collections.Generic;
namespace Startup1812 {
    public class Document {
        private string name;
        public string Failure;
        public Document(string name, string failure) { this.name = name; Failure = failure; }
        public string Name {
            get { return name; }
            set {
                if (value == "AutoExec_TraeBackup" && Failure == "rename") throw new Exception("injected AutoExec rename failure");
                if (value == "AutoExec_TraeBackup" && Failure == "rename-noop") return;
                name = value;
            }
        }
    }
    public class Documents : List<Document> { public void Refresh() {} }
    public class Container { public Documents Documents = new Documents(); }
    public class Property { public string Name; public object Value; public Property(string name, object value) { Name = name; Value = value; } }
    public class Properties : IEnumerable {
        public string Failure;
        public List<Property> Items = new List<Property>();
        public Property this[string name] {
            get { var p = Items.Find(x => x.Name == name); if (p == null) throw new Exception("property absent"); return p; }
        }
        public void Refresh() {}
        public void Delete(string name) {
            if (Failure == "delete") throw new Exception("injected StartupForm deletion failure");
            if (Failure == "delete-noop") return;
            Items.RemoveAll(x => x.Name == name);
        }
        public void Append(Property property) { Items.RemoveAll(x => x.Name == property.Name); Items.Add(property); }
        public IEnumerator GetEnumerator() { return Items.GetEnumerator(); }
    }
    public class Database {
        public Container Scripts = new Container();
        public Properties Properties { get; private set; } = new Properties();
        public int CloseCount;
        public Database(string failure, bool macro, bool form) {
            if (macro) Scripts.Documents.Add(new Document("AutoExec", failure));
            Properties.Failure = failure;
            if (form) Properties.Items.Add(new Property("StartupForm", "BusinessStartup"));
        }
        public Container Containers(string name) { return Scripts; }
        public Property CreateProperty(string name, int type, object value) { return new Property(name, value); }
        public void Close() { CloseCount++; }
    }
}
'@
    }
    $script:Scratch = Join-Path ([IO.Path]::GetTempPath()) ('dysflow-startup-1812-' + [guid]::NewGuid().ToString('N'))
    [void][IO.Directory]::CreateDirectory($script:Scratch)
    Write-Host "Startup suppression scratch: $script:Scratch"
    function script:Get-MsAccessProcesses { return @() }
    function script:New-DaoDbEngine {
        $engine = [pscustomobject]@{}
        $engine | Add-Member ScriptMethod OpenDatabase { param($path, $exclusive, $readOnly, $password) return $script:FakeDb }
        return $engine
    }
    function script:Open-CanonicalAccess {
        param($DbPath, $Password, $OpenDatabase)
        $script:OpenCount++
        $script:SuppressedAtOpen = @($script:FakeDb.Scripts.Documents | Where-Object Name -eq AutoExec).Count -eq 0 -and
            @($script:FakeDb.Properties | Where-Object Name -eq StartupForm).Count -eq 0
        # Run is a method on Access.Application; the vba operation calls it as one (#1940).
        $app = [pscustomobject]@{}
        $app | Add-Member -MemberType ScriptMethod -Name Run -Value { $script:BusinessCount++; return 'done' }
        return [pscustomobject]@{ AccessApplication = $app; OwnedPid = $null }
    }
    function script:Close-CanonicalAccess { param($Session, $DbPath, $RotCloseAction) $script:CleanupCount++ }
    function script:Write-AccessProcessMarker { param($Before, $AccessDbPath) }
    function script:Write-DysflowProgress { param($Percent, $Message) }
    function script:Write-DysflowResult { param($Result, $Depth) $script:Result = $Result }
    function script:Invoke-StartupRunner {
        $AccessDbPath = Join-Path $script:Scratch 'owned-disposable.accdb'
        [IO.File]::WriteAllText($AccessDbPath, 'DAO fake only; never opened by Access')
        $AccessPassword = ''
        $Operation = 'vba'
        $PayloadJson = '{"procedureName":"BusinessProcedure"}'
        $startupInfo = $null
        $db = $null
        $script:canonicalSession = $null
        $script:exitCode = 0
        & $script:RunnerMain
    }
}

Describe 'Startup suppression pre-open boundary (#1812)' {
    BeforeEach {
        $script:OpenCount = 0
        $script:BusinessCount = 0
        $script:CleanupCount = 0
        $script:SuppressedAtOpen = $false
        $script:Result = $null
    }

    It 'rejects <Failure> before frontend opening and restores partial changes' -ForEach @(
        @{ Failure = 'rename' }, @{ Failure = 'delete' },
        @{ Failure = 'rename-noop' }, @{ Failure = 'delete-noop' }
    ) {
        $script:FakeDb = [Startup1812.Database]::new($Failure, $true, $true)
        $stderr = [IO.StringWriter]::new()
        $previousStderr = [Console]::Error
        try {
            [Console]::SetError($stderr)
            Invoke-StartupRunner
        } finally { [Console]::SetError($previousStderr) }
        $script:exitCode | Should -Be 1
        $stderr.ToString() | Should -Match 'AutoExec|StartupForm'
        $script:OpenCount | Should -Be 0
        $script:BusinessCount | Should -Be 0
        @($script:FakeDb.Scripts.Documents | Where-Object Name -eq AutoExec).Count | Should -Be 1
        @($script:FakeDb.Properties | Where-Object Name -eq StartupForm)[0].Value | Should -Be 'BusinessStartup'
        $script:FakeDb.CloseCount | Should -BeGreaterThan 0
        Test-Path (Join-Path $script:Scratch 'owned-disposable.accdb.dysflow-restore.json') | Should -BeFalse
    }

    It 'supports AutoExec=<Macro>, StartupForm=<Form> and preserves restoration and owned cleanup' -ForEach @(
        @{ Macro = $true; Form = $true }, @{ Macro = $false; Form = $false },
        @{ Macro = $true; Form = $false }, @{ Macro = $false; Form = $true }
    ) {
        $script:FakeDb = [Startup1812.Database]::new('', $Macro, $Form)
        Invoke-StartupRunner
        $script:exitCode | Should -Be 0
        $script:OpenCount | Should -Be 1
        $script:BusinessCount | Should -Be 1
        $script:SuppressedAtOpen | Should -BeTrue
        $script:CleanupCount | Should -Be 1
        $script:Result.returnValue | Should -Be 'done'
        @($script:FakeDb.Scripts.Documents | Where-Object Name -eq AutoExec).Count | Should -Be ([int]$Macro)
        @($script:FakeDb.Properties | Where-Object Name -eq StartupForm).Count | Should -Be ([int]$Form)
    }
}
