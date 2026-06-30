## Verification Report

**Change**: forms-ui-factory-slice-4-mutation-primitives
**Version**: v1.12.0 candidate
**Mode**: Strict TDD
**Artifact Store**: Hybrid
**Verified at**: 2026-06-30

### Verdict

**PASS**

Issue #617 is implemented and verified. Public MCP tools `dysflow_form_add_control`, `dysflow_form_move_control`, and `dysflow_form_rename_control` are registered, write-gated, documented, and covered by strict-TDD unit/adapter/integration tests. The canonical live Access gate passed on a temporary copy of the bench database.

### Evidence

| Gate | Result |
|------|--------|
| `git diff --check` | PASS |
| Focused mutation/adapter/MCP tests | PASS — 21 tests |
| Canonical text preservation test | PASS — 2 tests |
| Full `pnpm test` | PASS — 154 files, 1849 tests |
| `pnpm build` | PASS |
| `pnpm lint` | PASS |
| Live canonical MCP LoadFromText gate | PASS — add/move/rename all returned `importGate:"passed"` |

### Live Canonical Gate

Executed against a temporary copy of:

- Source bench: `C:\00repos\codigo\00_VBA_TOOLKIT_BENCH`
- Access database: `Gestion_Riesgos.accdb`
- Form source: `src/forms/Form_FormRiesgosGestionRiesgo.form.txt`
- Temp workspace: `C:\Users\adm1\AppData\Local\Temp\dysflow-form-mutation-live-fixed-25256-1782820785859`

Commands exercised through real MCP (`node dist/cli/index.js mcp --enable-writes`):

1. `dysflow_form_add_control` with `apply:true` → `importGate:"passed"`
2. `dysflow_form_move_control` with `apply:true` → `importGate:"passed"`
3. `dysflow_form_rename_control` with `apply:true` → `importGate:"passed"`

The original bench was not modified; all writes happened in the temp copy.

### Compliance Matrix

| Requirement / Scenario | Result | Evidence |
|------------------------|--------|----------|
| Public tools discoverable | COMPLIANT | MCP registry/schema/parity tests |
| Add control preserves form data | COMPLIANT | Core tests + canonical live add gate |
| Move control changes position only | COMPLIANT | Core tests + canonical live move gate |
| Rename control changes name only | COMPLIANT | Core tests + canonical live rename gate |
| Event-bound rename safety | COMPLIANT | `renameControl` rejects `[Event Procedure]` controls |
| Metadata-loss rejection | COMPLIANT | `FORM_METADATA_LOSS` regression test |
| PrtDevMode / Checksum / Format preservation | COMPLIANT | Integration preservation test + live gate preserved keys |
| LoadFromText/import gate | COMPLIANT | Real MCP apply gate passed for all three tools |

### Notes

- `addControl` originally inserted controls as direct children of a `Section`; Access rejected this with `Expected: 'End'. Found: Begin`. The fix inserts into the section's unlabeled child control container.
- `renameControl` intentionally rejects controls with `[Event Procedure]` bindings rather than silently breaking convention-bound VBA event procedure names.
- `create_from_template` / issue #618 remains out of scope.

### Final Verdict

**PASS** — ready for release tagging after CI on the release commit is green.
