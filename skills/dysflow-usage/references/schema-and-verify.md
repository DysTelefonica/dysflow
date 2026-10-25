# Schema and verify_code

The committed ERD and the `verify_code` decision fields. The gating rule is HR-15 in `dysflow-arnes`.

## Schema questions — read the committed ERD first

1. Read `docs/erd/ERD.md` before writing SQL or fixtures. It lists every
   table, field, type, size, required flag, primary key, foreign key, and
   relation.
2. Regenerate it with `generate_erd({})` only when the file is missing or
   stale. The header stamp `Generado: YYYY-MM-DD` plus
   `Fingerprint: sha256:<hex>` tells you which schema it describes.
3. Call `get_schema` only for a property the ERD does not carry.

`generate_erd` is a documentation export: with the output inside the project
root it runs with writes disabled. See `assets/examples/generate-erd.md`.

## `verify_code` decision contract

Use `actionableOk` and `recommendedAction` as the sync gate. Raw `ok` means
byte/source parity and can be false for non-actionable `caseOnly`,
`whitespaceOnly`, `attributeOnly`, `formSerializationOnly`, `encodingOnly`,
`commentOnly`, `continuationOnly`, `statementBoundaryOnly`, or
`nonActionableMixed` noise.

`summaryByCategory` and `nonActionableByCategory` are aggregate counts. They do
not identify module membership. Never align those totals with names from a
different array or report. When membership matters, make one whole-scope
`verify_code({diagnostic:true})` call and read `actionableDifferent[]` and
`nonActionableDifferent[]`.

One logical Access form or report can emit separate `.cls` and `.form.txt`
entries for code-behind and layout. Dysflow classifies the two artifacts
independently, so both may contribute to aggregate counts under the same module
name. See `assets/examples/verify-code.md` for the complete result contract.
