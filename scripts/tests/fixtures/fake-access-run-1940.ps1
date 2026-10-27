# Shared by the #1940 Pester suites. Defines FakeAccessApplication1940, whose
# Run overloads take every argument as `ref object` like Access's typelib
# ([in,out] VARIANT* Arg1..Arg30), and a New-Object guard that refuses to
# create a real Access.Application. Dot-source it inside BeforeAll.

# Guard: these tests must never launch a real Access instance.
function script:New-Object {
    param([Parameter(Position = 0)][string]$TypeName, [string]$ComObject, [object[]]$ArgumentList)
    if ($ComObject -match "Access\.Application") { throw "TEST GUARD: real Access.Application must not be created (#1940)." }
    if ($ComObject) { return Microsoft.PowerShell.Utility\New-Object -ComObject $ComObject }
    if ($ArgumentList) { return Microsoft.PowerShell.Utility\New-Object -TypeName $TypeName -ArgumentList $ArgumentList }
    return Microsoft.PowerShell.Utility\New-Object -TypeName $TypeName
}

if (-not ("FakeAccessApplication1940" -as [type])) {
    $overloads = New-Object System.Text.StringBuilder
    for ($n = 0; $n -le 30; $n++) {
        $params = @("string procedure")
        $names = @()
        for ($i = 1; $i -le $n; $i++) { $params += "ref object a$i"; $names += "a$i" }
        $arrayInit = if ($n -eq 0) { "new object[0]" } else { "new object[] { " + ($names -join ", ") + " }" }
        $copyBack = ""
        for ($i = 1; $i -le $n; $i++) { $copyBack += " a$i = args[$($i - 1)];" }
        [void]$overloads.AppendLine("    public object Run($($params -join ', ')) { object[] args = $arrayInit; object r = Dispatch(procedure, args);$copyBack return r; }")
    }
    Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
public class FakeAccessApplication1940 {
    public List<string> Calls = new List<string>();
    static string Show(object v) { return v == System.Reflection.Missing.Value ? "<missing>" : (v == null ? "<null>" : v.GetType().Name + ":" + v.ToString()); }
    object Dispatch(string procedure, object[] args) {
string[] shown = new string[args.Length];
for (int i = 0; i < args.Length; i++) shown[i] = Show(args[i]);
Calls.Add(procedure + "(" + string.Join(", ", shown) + ")");
if (procedure == "Concat") {
    List<string> parts = new List<string>();
    foreach (object a in args) parts.Add(a == System.Reflection.Missing.Value ? "<missing>" : Convert.ToString(a));
    return string.Join("|", parts.ToArray());
}
if (procedure == "Mutate") {
    // Access copies every VARIANT* back; a ByVal VBA parameter simply
    // leaves it untouched. Mutating all of them is the stricter fake.
    for (int i = 0; i < args.Length; i++) args[i] = "out" + i;
    return "mutated";
}
return null;
    }
$($overloads.ToString())
}
"@
}
