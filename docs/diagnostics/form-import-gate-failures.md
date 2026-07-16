# Recover from form import-gate failures

Branch on the typed error chain, import phase, and rollback outcome. **Do not retry blindly**:
an import can fail after Access has removed or replaced binary state, while the source-file rollback
is a separate best-effort operation.

## Quick path

1. Preserve the complete error envelope. Inspect `details.cause` and `details.rollback` on
   `FORM_IMPORT_GATE_FAILED`.
2. Run `sync_binary({ direction: "both", dryRun: true })` to inspect source/binary drift without
   changing either side.
3. Choose recovery from the typed cause and phase below. Re-run a write only after the source,
   binary, and rollback state are understood.

## Error chain

| Code | Meaning | Consumer action |
| --- | --- | --- |
| `FORM_IMPORT_GATE_FAILED` | A form mutation wrote its proposed source, but the guarded `import_modules` call failed. The envelope preserves the import error in `details.cause` and the best-effort source restoration result in `details.rollback`. | Check rollback first, then diagnose the nested code and phase. |
| `VBA_IMPORT_FAILED` | The import operation failed at its outer boundary. More specific per-module data may be nested below it. | Read the nested module result; do not branch on the message. |
| `VBA_IMPORT_PHASE_FAILED` | One module failed during a named import phase. | Branch on `phase`; retain the raw message only as diagnostic evidence. |

`FORM_IMPORT_GATE_FAILED` does not mean that every layer rolled back. The form-write seam attempts
to restore the disk source and reports that attempt in `details.rollback`; Access binary changes
made before the failing phase may still require inspection or repair.

## Phase semantics

| Phase | What failed | Safe next check |
| --- | --- | --- |
| `locate-source` | The runtime could not resolve or read the source module. | Confirm the managed source path and module identity before retrying. |
| `remove-existing` | Access failed while removing or preparing the existing binary object. | Inspect object existence and binary health; use `list_objects`, then the plan-only sync above. |
| `import` | Access failed while loading the source into the binary. | Validate the source and inspect binary drift. Restore from a known-good source or binary only after reviewing the plan. |
| `compile` | A compile-stage failure was reported by a compatible/legacy import path. | Preserve the diagnostic, open Access, and compile manually before any test run. Current dysflow persistence is save-only and does not request compilation. |

## Rollback decision

- If `details.rollback` confirms restoration, the disk source is back to its pre-apply content;
  still inspect the binary because the Access-side operation may have progressed farther.
- If rollback reports failure or manual cleanup, stop writes. Restore the source deliberately from
  version control or another reviewed copy, then run the plan-only sync again.
- If the rollback shape is absent, treat state as unknown and escalate rather than assuming either
  side is authoritative.

## Raw Access messages

The raw Access text is useful evidence for a human, logs, and support. It is **not a stable branching contract**:
wording can vary by Access version, locale, object state, and the underlying COM
exception. In particular, Spanish strings such as “La clave de búsqueda no se encontró en ningún
registro” do not deterministically prove one root cause or one remediation.

Consumers must branch on typed codes, `phase`, and rollback state. Preserve raw Access text without
translating it into a new machine code or automatically choosing destructive recovery. If the typed
fields and plan-only drift report do not identify a safe action, ask the user to inspect/save the
form in Access or restore a known-good binary instead of retrying.
