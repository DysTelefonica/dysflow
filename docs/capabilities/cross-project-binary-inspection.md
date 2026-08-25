# Cross-project Access binary inspection

Dysflow can inspect an archived `.accdb` or `.mdb` without copying it into the active worktree.

This is an explicit read-only escape hatch: pass the absolute `accessPath` together with `allowExternalAccessPath: true`.

## Supported read paths

`list_vba_modules`, `list_objects`, `verify_code`, and `export_modules` honor the external-source opt-in.

`list_procedures` and `get_procedure` additionally accept `source: "binary"`. They read the requested VBComponent directly and never create an export directory.

`lint_module` accepts the same `source: "binary"` selector. `detect_dead_code`
and `find_references` load the external binary's real module bytes when their
scope is `"binary"`; an inline `modules` map remains process-free.

`vba_orphan_audit` forwards the opt-in to its binary/source inventory adapter.

The schemas live in `src/adapters/mcp/schemas/`. Procedure behavior is covered by `test/adapters/mcp/external-binary-procedure-inspection-1541.test.ts`.

```json
{
  "module": "ControlCambios",
  "procedure": "ControlCambios_CalcularFilasEdicion",
  "source": "binary",
  "accessPath": "C:/archives/Gestion_Riesgos.accdb",
  "allowExternalAccessPath": true
}
```

The binary path must be explicit and end in `.accdb` or `.mdb`. Omitting the opt-in fails before Access or PowerShell is invoked.

Results come from the external binary's live module code and do not populate the managed source tree.

## Write boundaries remain closed

The flag never authorizes binary mutation. `import_modules`, `import_all`, and source-to-binary `sync_binary` continue to reject an external target.

`run_vba`, `test_vba`, and `delete_module` reject it as well. The boundary lives in `src/adapters/config/project-config-diagnostic.ts`.

`test/adapters/mcp/readonly-external-access.test.ts` covers the rejection contract.

Unknown `allowExternalAccessPath` input on write tools is rejected by their
closed schemas as `MCP_INPUT_INVALID`; it is never silently ignored.

`export_modules` is read-only on the Access binary but writes source files. Supply an explicit `destinationRoot` or `exportPath`.

For a review-only export outside the worktree, pass
`allowExternalDestinationRoot:true` together with explicit `apply:false`.

`apply:true`, omitted intent, and destinations whose canonical path differs
from their lexical path all fail closed. Existing overwrite guards still apply.
