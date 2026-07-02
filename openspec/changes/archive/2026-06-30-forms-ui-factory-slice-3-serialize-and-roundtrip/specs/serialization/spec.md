# Specification: form-ir serialize and round-trip

## Goal

Public MCP tools (`dysflow_form_serialize`, `dysflow_form_deserialize`) that operate on the FormIR pipeline with byte-equivalent round-trip semantics and a LoadFromText integration gate.

## Scope (predecessor and consumer)

- **Predecessor**: slice 1 (`parse`), slice 2 (`loadFromText gate` / adapter foundation). Slice 1 + 2 already shipped (per `openspec/changes/2026-06-29-forms-ui-factory-slice-1/` and `openspec/changes/2026-06-29-forms-ui-factory-slice-2/`).

- **Successor / consumer**: slice 4 (mutation primitives, shipped as `v1.12.0`) must be re-verified against slice 3's serializer before close; slice 5 (`create_from_template`) depends on this round-trip primitive for clone fidelity.

## Input / Output Contracts

### `dysflow_form_serialize`

Input:
```json
{
  "sourcePath": "C:/.../src/forms/Form_FormRiesgosGestionRiesgo.form.txt",
  "formName": "Form_FormRiesgosGestionRiesgo"
}
```
(Or optional `ir: FormIR` for cross-tool invocations — defer until slice 5.)

Output:
```json
{
  "serialized": "...full .form.txt content...",
  "metadataReport": {
    "preservedKeys": ["PrtDevMode", "Checksum", "Format", ...],
    "byteDiff": 0,
    "opaqueCount": 14
  },
  "roundTripOk": true
}
```

Errors:
- `SERDE_PARSE_FAILED` (e.g., the file isn't readable or isn't a valid form layout)
- `SERDE_ROUND_TRIP_FAILED` (round-trip not byte-equal)
- `SERDE_METADATA_LOSS` (opaque keys dropped during serialize)

### `dysflow_form_deserialize`

Input:
```json
{
  "sourcePath": "C:/.../src/forms/Form_FormRiesgosGestionRiesgo.form.txt",
  "formName": "Form_FormRiesgosGestionRiesgo",
  "ir": { ... FormIR ... },
  "apply": false,
  "dryRun": true
}
```

Output:
```json
{
  "written": false,
  "appliedChecksumBefore": null,
  "appliedChecksumAfter": null,
  "loadFromTextGate": "skipped",
  "writtenPath": "C:/.../src/forms/...form.txt"
}
```

For `apply:true` and `dryRun:false`, write the deserialized `.form.txt`, then invoke `dysflow_import_modules(apply:true)`, then return:
```json
{
  "written": true,
  "appliedChecksumBefore": "sha256:abc...",
  "appliedChecksumAfter": "sha256:def...",
  "loadFromTextGate": "passed",
  "importErrorCode": null
}
```

Errors:
- `LOADFROMTEXT_FAILED` (Access rejected the deserialized form)
- `ACCESS_DATABASE_LOCKED`
- All errors from serialize (the round-trip check runs on parse first)

## Acceptance Criteria

- Round-trip equivalence: `serialize(parse(s)) === s` byte-equal on canonical `Form_FormRiesgosGestionRiesgo.form.txt`.
- Round-trip equivalence IR: `deserialize(serialize(ir)) === ir` for pure FormIR fixtures.
- Opaque metadata preservation: `PrtDevMode`, `Checksum`, `Format`, layout scalars, and `[Event Procedure]` control names present in serialized output AND value-equal to source.
- LoadFromText gate: `deserialize(apply:true)` returns `loadFromTextGate: 'passed'` on `Form_FormRiesgosGestionRiesgo`.
- Slice 4 regression: existing mutation primitives still green against slice 3's serializer.
- Tools discoverable: `dysflow_form_serialize` and `dysflow_form_deserialize` appear in `dysflow_list_objects` output.
- Documentation: `README.md` MCP tools list includes both tools with behavior summary.

## RED Tests

Each test is a Vitest case in `src/core/services/form-ir-service.test.ts` (core layer) or `test/integration/**` (integration layer).

### Test 1: Round-trip byte-equal on canonical fixture
```ts
it('serialize(parse(canonicalFixture)) === canonicalFixture', () => {
  const source = readFixture('Form_FormRiesgosGestionRiesgo.form.txt');
  const ir = parse(source);
  const serialized = serialize(ir);
  expect(Buffer.compare(Buffer.from(source), Buffer.from(serialized))).toBe(0);
});
```

### Test 2: Round-trip IR-equal
```ts
it('deserialize(serialize(ir)) deep-equals ir for pure IR fixtures', () => {
  const ir = buildPureIrFixture();
  const serialized = serialize(ir);
  const roundTripped = parse(serialized);
  expect(roundTripped).toEqual(ir); // deep equality
});
```

### Test 3: Opaque metadata preservation (PrtDevMode)
```ts
it('preserves PrtDevMode byte-for-byte', () => {
  const source = `...\nPrtDevMode = XPGAAAB\n...`;
  const ir = parse(source);
  const serialized = serialize(ir);
  expect(serialized).toContain('PrtDevMode = XPGAAAB');
});
```

### Test 4: Round-trip guard fires on forced mutation
```ts
it('serialize refuses to emit diff vs source, returns SERDE_ROUND_TRIP_FAILED', () => {
  // Mock a path where the IR was post-mutated to skip an opaque key
  const source = `...\nPrtDevMode = XPGAAAB\n...`;
  const irMutated = parse(source);
  (irMutated as any).prtDevMode = undefined;
  const result = serialize(irMutated); // throws via guard
  expect(result).toThrow('SERDE_ROUND_TRIP_FAILED');
});
```

### Test 5: LoadFromText integration gate
```ts
it('deserialize+apply:true runs LoadFromText and reports passed when binary doesn't drift', async () => {
  const result = await callDysflow('dysflow_form_deserialize', {
    sourcePath: canonicalFixturePath,
    formName: 'Form_FormRiesgosGestionRiesgo',
    ir: roundTrippedIrFromSerialize,
    apply: true,
    dryRun: false,
  });
  expect(result.loadFromTextGate).toBe('passed');
  expect(result.loadFromTextDriftChecksum).toBe(false);
});
```

### Test 6: Event-bound procedure names preserved
```ts
it('preserves [Event Procedure] control names without renaming', () => {
  const source = `cmdSave_Click [Event Procedure]\n...`;
  const ir = parse(source);
  const serialized = serialize(ir);
  expect(serialized).toContain('cmdSave_Click [Event Procedure]');
});
```

### Test 7: Slice 4 regression
```ts
it('slice-4 mutation primitives still green against slice-3 serializer', async () => {
  const result = await callDysflow('dysflow_form_add_control', {
    sourcePath: canonicalFixturePath,
    formName: 'Form_FormRiesgosGestionRiesgo',
    control: { name: 'txtTest', type: 'TextBox' },
    apply: true,
    dryRun: false,
  });
  expect(result.importGate).toBe('passed');
  expect(result.written).toBe(true);
});
```

## Failure Modes

- Source file absent or unreadable → `SERDE_PARSE_FAILED`
- Source has non-Access-format bytes that map to opaque keys IR doesn't know about → serializer requires them byte-preserved; if not present in IR but in source, serializer may emit them from source map.
- Binary locked → `ACCESS_DATABASE_LOCKED`; recommend `dysflow_access_force_cleanup_orphaned`.
- Access rejects deserialized form on LoadFromText → `LOADFROMTEXT_FAILED`; rollback writes the original `.form.txt` back (best-effort).
- ir structure mismatches formName (different controls, different sections) → adapter pre-flight hard-fail.

## Notes

- Live canonical fixture: `ardelperal/VBA_TOOLKIT_BENCH/Gestion_Riesgos.accdb` (Access project) with form source `src/forms/Form_FormRiesgosGestionRiesgo.form.txt` (per the slice 4 verify-report.md).
- Slice 5 (`create_from_template`) integration is out of scope here; this spec ships the round-trip primitive that slice 5 will consume.
- Slice 4 regression test (`test-7` above) is required because slice 4 was tested with an internal serializer; switching to slice 3's serializer must not change slice 4's behavior.
