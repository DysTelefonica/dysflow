# VBA missing-callees lint

`dysflow lint callees` scans `.bas` and `.cls` files recursively and fails when a function-style
call does not resolve to a procedure declared anywhere in the source tree or to a known VBA,
Access, or DAO runtime member.

```powershell
dysflow lint callees src
dysflow lint callees src --json
```

The source root defaults to `src`. Exit code `0` means no missing callees, `1` means the lint found
one or more missing callees, and `2` means the invocation or source root was invalid.

Human output is directly actionable:

```text
src/forms/Orders.cls:42:7  missing callee: Orders.SaveOrder (call)
```

JSON output has this stable top-level contract:

```json
{
  "ok": false,
  "elapsedMs": 12.4,
  "totals": { "declarations": 58, "missing": 1, "unused": 3 },
  "missing": [
    {
      "file": "src/forms/Orders.cls",
      "line": 42,
      "column": 7,
      "name": "SaveOrder",
      "module": "Orders",
      "kind": "call"
    }
  ],
  "unused": ["LegacyHelper"]
}
```

## Exclusions

The built-in exclusions come from three runtime surfaces:

- VBA keywords and intrinsic functions: [VBA language reference](https://learn.microsoft.com/office/vba/language/reference/user-interface-help/visual-basic-language-reference).
- DAO members such as `Database.OpenRecordset`: [DAO object model reference](https://learn.microsoft.com/office/client-developer/access/desktop-database-reference/data-access-objects-dao-reference).
- Implicit Access members and standard collection members: [Access object model reference](https://learn.microsoft.com/office/vba/api/overview/access/object-model).

Add consumer-specific names without forking Dysflow by setting `DYSFLOW_LINT_EXTRAS` to a JSON
object whose values are string arrays. Group names are descriptive only; every value is merged into
the exclusion set.

```powershell
$env:DYSFLOW_LINT_EXTRAS='{"keywords":["CompanyRuntimeCall"],"members":["ProviderMethod"]}'
dysflow lint callees src
```

Suppress one intentional site with an inline comment:

```vb
LateBoundProviderCall (payload) ' dysflow:lint-ignore-line
```

## CI and pre-commit

GitHub Actions:

```yaml
- run: pnpm exec dysflow lint callees src --json
```

Pre-commit hook:

```sh
pnpm exec dysflow lint callees src
```

The lint is intentionally a fast source guard, not a VBA compiler or full type-inference engine.
Use CodeGraph-VBA when receiver-aware call analysis is required.
