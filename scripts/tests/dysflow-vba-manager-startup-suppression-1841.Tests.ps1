#requires -Version 5.1

# #1841 — Open-AccessDatabase must abort before opening the frontend when any
# startup neutralization (AutoExec rename, StartupForm / AppIcon deletion) fails
# or cannot be verified by readback, and must restore partial changes. Only the
# DAO and Access COM I/O boundaries are faked; Access is never launched.
BeforeAll {
    $managerPath = if ($env:DYSFLOW_STARTUP_TEST_MANAGER) { $env:DYSFLOW_STARTUP_TEST_MANAGER }
        else { Join-Path $PSScriptRoot '../dysflow-vba-manager.ps1' }
    $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($managerPath, [ref]$null, [ref]$errors)
    if ($errors.Count) { throw $errors[0] }
    foreach ($name in @('Open-AccessDatabase', 'Disable-StartupFeatures', 'Restore-StartupFeatures',
            'Open-DaoDatabaseForMaintenance')) {
        $definition = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name }, $true)
        if (-not $definition) { throw "missing $name" }
        # DAO COM accepts a parameterized Properties("X") lookup; the managed fake
        # exposes the equivalent Item indexer with identical absent-lookup failures.
        $text = $definition.Extent.Text -replace '\$(\w+)\.Properties\(("\w+")\)', '$$$1.Properties.Item($2)'
        Invoke-Expression ($text -replace "^function\s+$name", "function script:$name")
    }
    if (-not ('Startup1841b.Database' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Collections;
using System.Collections.Generic;
namespace Startup1841b {
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
            if (Failure == "delete:" + name) throw new Exception("injected " + name + " deletion failure");
            if (Failure == "delete-noop:" + name) return;
            Items.RemoveAll(x => x.Name == name);
        }
        public void Append(Property property) { Items.RemoveAll(x => x.Name == property.Name); Items.Add(property); }
        public IEnumerator GetEnumerator() { return Items.GetEnumerator(); }
    }
    public class Database {
        public Container Scripts = new Container();
        public Properties Properties { get; private set; }
        public int CloseCount;
        public Database(string failure, bool macro, bool form, bool icon) {
            Properties = new Properties();
            if (macro) Scripts.Documents.Add(new Document("AutoExec", failure));
            Properties.Failure = failure;
            if (form) Properties.Items.Add(new Property("StartupForm", "BusinessStartup"));
            if (icon) Properties.Items.Add(new Property("AppIcon", "C:\\icons\\app.ico"));
        }
        public Container Containers(string name) { return Scripts; }
        public Property CreateProperty(string name, int type, object value) { return new Property(name, value); }
        public void Close() { CloseCount++; }
    }
}
'@
    }
    function script:New-DaoDbEngine {
        $engine = [pscustomobject]@{}
        $engine | Add-Member ScriptMethod OpenDatabase { param($path, $exclusive, $readOnly, $connect) return $script:FakeDb }
        return $engine
    }
    function script:Close-TargetAccessDbIfOpen { param($AccessPath) }
    function script:Get-AllowBypassKeyState { param($AccessPath, $Password) return $null }
    function script:Enable-AllowBypassKey { param($AccessPath, $Password) return $true }
    function script:Restore-AllowBypassKey { param($AccessPath, $Password, $OriginalState) }
    function script:Write-Status { param($Message, $Color) }
    function script:Write-DysflowOperationMarker { param($Status, $AccessPid) }
    function script:Close-CanonicalAccess { param($Session, $DbPath, $RotCloseAction) $script:CleanupCount++ }
    function script:Open-CanonicalAccess {
        param($DbPath, $Password)
        $script:OpenCount++
        $script:SuppressedAtOpen =
            @($script:FakeDb.Scripts.Documents | Where-Object Name -eq AutoExec).Count -eq 0 -and
            @($script:FakeDb.Properties | Where-Object { $_.Name -in @('StartupForm', 'AppIcon') }).Count -eq 0
        $doCmd = [pscustomobject]@{}
        $doCmd | Add-Member ScriptMethod SetWarnings { param($on) }
        $app = [pscustomobject]@{ DoCmd = $doCmd; VBE = [pscustomobject]@{ ActiveVBProject = 'project' } }
        return [pscustomobject]@{ AccessApplication = $app; OwnedPid = 4242 }
    }
    function script:Get-FakeProperty { param($Name) @($script:FakeDb.Properties | Where-Object Name -eq $Name) }
}

Describe 'vba-manager startup suppression pre-open boundary (#1841)' {
    BeforeEach {
        $script:OpenCount = 0
        $script:CleanupCount = 0
        $script:SuppressedAtOpen = $false
    }

    It 'aborts on <Failure> before opening the frontend and restores partial changes' -ForEach @(
        @{ Failure = 'rename' }, @{ Failure = 'rename-noop' },
        @{ Failure = 'delete:StartupForm' }, @{ Failure = 'delete-noop:StartupForm' },
        @{ Failure = 'delete:AppIcon' }, @{ Failure = 'delete-noop:AppIcon' }
    ) {
        $script:FakeDb = [Startup1841b.Database]::new($Failure, $true, $true, $true)
        { Open-AccessDatabase -AccessPath 'C:\owned-disposable.accdb' -Password '' } |
            Should -Throw -ExpectedMessage '*CRITICAL*'
        $script:OpenCount | Should -Be 0
        @($script:FakeDb.Scripts.Documents | Where-Object Name -eq AutoExec).Count | Should -Be 1
        (Get-FakeProperty StartupForm)[0].Value | Should -Be 'BusinessStartup'
        (Get-FakeProperty AppIcon)[0].Value | Should -Be 'C:\icons\app.ico'
        $script:FakeDb.CloseCount | Should -BeGreaterThan 0
    }

    It 'suppresses AutoExec=<Macro>, StartupForm=<Form>, AppIcon=<Icon> and opens once' -ForEach @(
        @{ Macro = $true; Form = $true; Icon = $true }, @{ Macro = $false; Form = $false; Icon = $false },
        @{ Macro = $true; Form = $false; Icon = $false }, @{ Macro = $false; Form = $true; Icon = $true }
    ) {
        $script:FakeDb = [Startup1841b.Database]::new('', $Macro, $Form, $Icon)
        $session = Open-AccessDatabase -AccessPath 'C:\owned-disposable.accdb' -Password ''
        $script:OpenCount | Should -Be 1
        $script:SuppressedAtOpen | Should -BeTrue
        $session.ProcessId | Should -Be 4242
        $session.StartupInfo.RenamedAutoExec | Should -Be $Macro
        $session.StartupInfo.HasStartupForm | Should -Be $Form
        $session.StartupInfo.HasAppIcon | Should -Be $Icon
        if ($Form) { $session.StartupInfo.OriginalStartupForm | Should -Be 'BusinessStartup' }
        if ($Icon) { $session.StartupInfo.OriginalAppIcon | Should -Be 'C:\icons\app.ico' }
    }

    It 'keeps --allow-startup-execution opening without touching startup entries' {
        $script:FakeDb = [Startup1841b.Database]::new('rename', $true, $true, $true)
        $session = Open-AccessDatabase -AccessPath 'C:\owned-disposable.accdb' -Password '' -AllowStartupExecution
        $script:OpenCount | Should -Be 1
        $session.StartupInfo.RenamedAutoExec | Should -BeFalse
        @($script:FakeDb.Scripts.Documents | Where-Object Name -eq AutoExec).Count | Should -Be 1
        (Get-FakeProperty StartupForm).Count | Should -Be 1
    }
}
