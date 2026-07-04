# Design: Form IR Bugs — rpt prefix, FormatConditions token collision, corrupt catalog overwrite

## Technical Approach

Three pure-IR / pure-port fixes, no I/O schema changes, no new ports. Each PR is a single behavior change with RED-first tests. #A widens a prefix set in a pure function. #B swaps a `startsWith` predicate for `includes` and replaces an `Object.hasOwn`-based tally with a post-IR serialization diff. #C splits a catch arm on `isMissingPathError(err)` and reorders the dryRun short-circuit to occur AFTER the read so corruption is visible in dryRun. All three ride the existing `FormFileSystemPort` and pure-IR `applyTokenMap` boundaries; no test infrastructure changes.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| #A — prefix set shape | `REPORT_PREFIXES = ["report_", "rpt", "rpt_"] as const` + `some(startsWith)` | (a) Three separate `startsWith` calls mirroring the `frm` form pattern at line 24; (b) regex `/^report_\|^rpt_?/` | The spec mandates the set be documented and testable. A named `as const` array matches the existing `PRESERVED_METADATA_KEYS` style at `form-ir-service.ts:432` and is one source of truth. |
| #A — ordering guarantee | Insert the widened prefix check at the same position as the current single-prefix check (lines 23-29), BEFORE the `vbaType === 100` fallback at line 31. | Move the prefix check below the fallback | The spec scenario "type-100 fallback overridden by rpt prefix" (`rptDaily, 100 → reports`) ONLY holds if the prefix check runs first. The current order is already correct; do not move the block. |
| #B — predicate fix | `PRESERVED_METADATA_KEYS.includes(key)` at `form-ir-service.ts:751` | Keep `startsWith` and rename `FormatConditions` keys; whitelist `Format` only and treat the rest as ordinary | Exact-match is the spec's contract (`format` ≠ `FormatConditions`). The `PRESERVED_METADATA_KEYS` constant is `as const` typed; `Array.includes` keeps the literal type. |
| #B — appliedTokens algorithm | Derive from surviving `{{...}}` patterns in `serializeFormTxt(next)`. A token whose pattern remains in the post-IR serialized output is "missing" (not applied). | Diff pre/post serialized text line-by-line; walk the IR a second time to compare | The post-IR serialized text is the same source the `metadataSnapshot` invariant guarantees. A token's presence in that text = token was NOT rewritten = "missing". A `Set` of surviving tokens (computed once) gives O(n) partitioning without a second IR walk. |
| #B — strict-policy impact | Surviving tokens now count as `missingTokens` and trigger `FORM_MUTATION_INVALID` under strict policy. | Exempt preserved-key tokens from strict | The spec is explicit: "A token whose `{{Token}}` pattern still appears anywhere in the serialized result… MUST appear in `missingTokens`." Strict policy rejects any non-empty `missingTokens`. This is a behavior change — call it out in the CHANGELOG. |
| #C — error code | `VBA_CATALOG_CORRUPT` (per proposal + spec) | `VBA_CATALOG_READ_FAILED`, `VBA_CATALOG_PARSE_ERROR` | Matches the existing `VBA_CATALOG_WRITE_FAILED` UPPER_SNAKE convention (`vba-form-service.ts:215`). `_CORRUPT` is what the user-visible message says; `_READ_FAILED` would also fire on `EACCES` (permission denied) where the real problem is not corruption. |
| #C — dryRun reorder | Move the `dryRun` short-circuit (lines 182-191) to AFTER the catalog read so corruption is visible in dryRun. | Keep the current "dryRun skips read" order; require `apply:true` to surface corruption | The spec mandates it: "corruption check precedes the dry-run branch, matching generateForm dryRun/apply parity" (scenario: "corrupt catalog in dry-run also refuses"). Note: `generateForm` itself does NOT do a read in dryRun — the "parity" claim is aspirational, not empirical. The intent is intra-method parity (read always, then write-or-skip). |

## Data Flow

### #A (resolveComponent)

    name="rptDaily", vbaType=100
        │
        ▼
    nameLower = "rptdaily"
        │
        ├── vbaType === 1/2/3?  ── no
        ▼
    startsWith("form_")? startsWith("frm")?  ── no
        │
        ▼
    REPORT_PREFIXES.some(startsWith)?  ── yes (rpt)
        │
        ▼
    { folder: "reports", extension: ".report.txt", type: "report" }   ◀── prefix wins
        │
        ▼
    (vbaType === 100 fallback never reached for rptDaily)

### #B (applyTokenMap)

    ir (source)          tokenMap
        │                    │
        ▼                    │
    serializeFormTxt(ir)     │
        │                    │
        ▼                    │
    sourceTokens (set)       │
                             │
    cloneIr(ir)              │
        │                    │
        ▼                    │
    applyTokensToNode(next, tokenMap)   ◀── preserved-key predicate now exact-match
        │                    │
        ▼                    │
    serializeFormTxt(next)   │
        │                    │
        ▼                    │
    survivingTokens (set)    │
        │                    │
        ▼                    │
    appliedTokens = sourceTokens − survivingTokens
    missingTokens = sourceTokens ∩ (tokenMap has nothing for it OR survivingTokens)

### #C (catalogAddControl)

    params
        │
        ▼
    resolveFormSpec
        │
        ▼
    validate controlName/controlType
        │
        ▼
    readJson(catalogPath)        ◀── NOW runs in dryRun too
        │   ├─ ENOENT         ── swallow, catalog = {}
        │   ├─ parse error    ── return failureResult(VBA_CATALOG_CORRUPT), NO write
        │   └─ success        ── catalog = parsed JSON
        ▼
    compute updated catalog (formName, control)
        │
        ├── dryRun: true  ── return successResult({dryRun: true, written: false, ...})
        │                  (no writeFile)
        ▼
    mkdir + writeFile
        │   ├─ write error  ── return failureResult(VBA_CATALOG_WRITE_FAILED)
        │   └─ success      ── return successResult({controlCount, ...})

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/core/mapping/component-resolver.ts` | Modify | #A: add `REPORT_PREFIXES` const; widen the prefix check at line 27 to a `some` over the set. |
| `src/core/services/form-ir-service.ts` | Modify | #B (1/2): change `isPreservedMetadataKey` at line 750-752 to use `includes`. Update JSDoc above (lines 741-749). |
| `src/core/services/form-ir-service.ts` | Modify | #B (2/2): replace `appliedTokens`/`missingTokens` derivation at lines 829-841 with post-IR serialization diff. |
| `src/core/services/vba-form-service.ts` | Modify | #C: branch catch arm on `isMissingPathError`; return `VBA_CATALOG_CORRUPT` for non-ENOENT. Move the `dryRun` short-circuit (lines 178-191) to AFTER the catalog read. |
| `test/core/mapping/component-resolver.test.ts` | Modify | #A: add 4 RED cases. |
| `test/core/services/form-ir-clone-template.test.ts` | Modify | #B: add 2 RED cases (`FormatConditions` scalar replaced; `appliedTokens` excludes surviving tokens). |
| `test/core/services/vba-form-service.test.ts` | Modify | #C: split the pinning test at line 814. Add `Object.assign(new Error("ENOENT"), { code: "ENOENT" })` to the kept mock. Add new RED parse-error test. |
| `CHANGELOG.md` | Modify | Three entries, one per PR. |
| `AGENTS.md` | Modify | Document the `rpt` prefix convention in the component-resolver section (if any). Currently AGENTS.md does not list prefixes; consider whether to add a "report prefix" note. |

## Exact Diffs (reviewable without re-reading files)

### #A — `src/core/mapping/component-resolver.ts`

Insert (after line 9, before the existing `// If type is explicitly provided` comment):

```ts
// Report prefixes recognized by Access: legacy `Report_` plus the
// `rpt` / `rpt_` shorthand used in older project templates. Mirror
// the `frm`/`form_` form-prefix pattern at line 24. Issue #622 (#A).
const REPORT_PREFIXES = ["report_", "rpt", "rpt_"] as const;
```

Replace lines 23-29:

```diff
-  // Name-based prefix checks override type 100/generic types
-  if (nameLower.startsWith("form_") || nameLower.startsWith("frm")) {
-    return { folder: "forms", extension: ".form.txt", type: "form" };
-  }
-  if (nameLower.startsWith("report_")) {
-    return { folder: "reports", extension: ".report.txt", type: "report" };
-  }
+  // Name-based prefix checks override type 100/generic types. The form
+  // and report prefix checks MUST run BEFORE the vbaType === 100 fallback
+  // so that names like `rptDaily, 100` resolve to reports (not the form
+  // default). Issue #622 (#A).
+  if (nameLower.startsWith("form_") || nameLower.startsWith("frm")) {
+    return { folder: "forms", extension: ".form.txt", type: "form" };
+  }
+  if (REPORT_PREFIXES.some((prefix) => nameLower.startsWith(prefix))) {
+    return { folder: "reports", extension: ".report.txt", type: "report" };
+  }
```

### #B — `src/core/services/form-ir-service.ts`

Predicate (lines 750-752):

```diff
-/**
- * Returns true when a property key belongs to the Access opaque metadata
- * reserved set: any key equal to or starting with `Checksum`, `Format`,
- * or `PrtDevMode`. Matches the slice 4 invariant — the metadata guard
- * (`metadataSnapshot`) uses the same prefix rules.
- *
- * Single source of truth for the "is this a reserved Access metadata key"
- * predicate: both `metadataSnapshot` and `applyTokenMap` walk it.
- */
-function isPreservedMetadataKey(key: string): boolean {
-  return PRESERVED_METADATA_KEYS.some((prefix) => key === prefix || key.startsWith(prefix));
-}
+/**
+ * Returns true when a property key belongs to the Access opaque metadata
+ * reserved set. MUST be byte-equal (exact-match) to one of `Checksum`,
+ * `Format`, or `PrtDevMode` — keys that share a prefix with a preserved
+ * key (e.g. `FormatConditions`, `FormatHeader`) are NOT preserved and
+ * flow through token replacement. Issue #622 (#B).
+ */
+function isPreservedMetadataKey(key: string): boolean {
+  return PRESERVED_METADATA_KEYS.includes(key);
+}
```

`appliedTokens` derivation (lines 826-841, inside `applyTokenMap`):

```diff
-  const sourceText = serializeFormTxt(ir);
-  const sourceTokens = collectSourceTokens(sourceText);
-
-  const appliedTokens: string[] = [];
-  const missingTokens: string[] = [];
-  const warnings: string[] = [];
-  for (const token of sourceTokens) {
-    if (Object.hasOwn(tokenMap, token)) {
-      appliedTokens.push(token);
-    } else {
-      missingTokens.push(token);
-      warnings.push(
-        `Token "{{${token}}}" is present in the source but missing from the token map; leaving verbatim under warn-pass-through policy.`,
-      );
-    }
-  }
+  const sourceText = serializeFormTxt(ir);
+  const nextText = serializeFormTxt(next);
+  const sourceTokens = collectSourceTokens(sourceText);
+  const survivingTokens = new Set(collectSourceTokens(nextText));
+
+  // `appliedTokens` MUST reflect ACTUAL replacement, not source-AND-map
+  // membership. A token whose `{{...}}` pattern still appears in the
+  // post-IR serialized text (e.g. its only occurrence lives inside a
+  // preserved metadata key) was NOT replaced; it is `missing`. Issue #622
+  // (#B). Under `strict` policy, surviving source tokens now trigger
+  // `FORM_MUTATION_INVALID` (CHANGELOG: behavior change).
+  const appliedTokens: string[] = [];
+  const missingTokens: string[] = [];
+  const warnings: string[] = [];
+  for (const token of sourceTokens) {
+    if (survivingTokens.has(token)) {
+      missingTokens.push(token);
+      warnings.push(
+        `Token "{{${token}}}" is present in the source but not replaced in the serialized IR (likely lives inside a preserved metadata key); leaving verbatim under warn-pass-through policy.`,
+      );
+    } else {
+      appliedTokens.push(token);
+    }
+  }
```

### #C — `src/core/services/vba-form-service.ts`

Replace lines 178-219 (the dryRun block, the readJson try/catch, and the control-push block). New control flow:

```ts
const dryRun = params.apply === true ? false : params.dryRun !== false;

// Read the catalog BEFORE the dryRun short-circuit so corruption is
// visible in dryRun (matches the spec's "corruption check precedes the
// dry-run branch" contract). Issue #622 (#C).
let catalog: Record<string, unknown> = {};
try {
  catalog = (await this.fileSystem.readJson<Record<string, unknown>>(catalogPath)) as Record<
    string,
    unknown
  >;
} catch (err) {
  if (isMissingPathError(err)) {
    // ENOENT — proceed with an empty catalog. Existing behavior.
    logSwallowedIoError("vba-form-service:catalog-read", err);
  } else {
    // JSON parse error or any other read failure — refuse. The catalog
    // on disk is NOT modified. Caller must restore or rebuild.
    return failureResult(
      createDysflowError(
        "VBA_CATALOG_CORRUPT",
        `Catalog at ${catalogPath} is corrupt and cannot be parsed: ${err instanceof Error ? err.message : String(err)}. Refusing to overwrite; inspect and restore the catalog manually.`,
      ),
    );
  }
}

const forms = isRecord(catalog.forms) ? (catalog.forms as Record<string, unknown>) : {};
const controls = Array.isArray(forms[spec.data.name])
  ? (forms[spec.data.name] as unknown[])
  : [];
controls.push({ name: controlName, type: controlType });
forms[spec.data.name] = controls;
const updated = { ...catalog, forms };

if (dryRun) {
  return successResult({
    dryRun: true,
    written: false,
    catalogPath,
    formName: spec.data.name,
    controlName,
    controlType,
  });
}

try {
  await this.fileSystem.mkdir(resolve(catalogPath, ".."), { recursive: true });
  await this.fileSystem.writeFile(catalogPath, JSON.stringify(updated, null, 2), "utf8");
} catch (err) {
  return failureResult(
    createDysflowError(
      "VBA_CATALOG_WRITE_FAILED",
      err instanceof Error ? err.message : String(err),
    ),
  );
}

return successResult({
  catalogPath,
  formName: spec.data.name,
  controlCount: controls.length,
});
```

## Test File Changes

### #A — `test/core/mapping/component-resolver.test.ts`

Add inside the existing `describe("resolveComponent", ...)` block (after the `should resolve type 100 with Report_ prefix` test, before the `should resolve type 100 with Form_ prefix` test — keeps the type-100 tests grouped):

```ts
it("should resolve rpt prefixed components as reports (issue #622 #A)", () => {
  const result = resolveComponent("rptFoo");
  expect(result).toEqual({ folder: "reports", extension: ".report.txt", type: "report" });
});

it("should resolve rpt_ underscored form as reports (issue #622 #A)", () => {
  const result = resolveComponent("rpt_Foo");
  expect(result).toEqual({ folder: "reports", extension: ".report.txt", type: "report" });
});

it("should resolve uppercase Rpt prefix as reports (issue #622 #A)", () => {
  expect(resolveComponent("Rpt_X")).toEqual({ folder: "reports", extension: ".report.txt", type: "report" });
  expect(resolveComponent("rptAudit")).toEqual({ folder: "reports", extension: ".report.txt", type: "report" });
});

it("should resolve type 100 with rpt prefix as reports — prefix wins over fallback (issue #622 #A)", () => {
  // REGRESSION GUARD: prefix check MUST run before the vbaType === 100
  // form-default fallback. If someone reorders the function, this test
  // goes red.
  const result = resolveComponent("rptDaily", 100);
  expect(result).toEqual({ folder: "reports", extension: ".report.txt", type: "report" });
});
```

The 10 existing tests stay green — they assert `Report_`, `frm`, `Form_`, and type-1/2/3/100 cases, all of which the widened prefix set still satisfies.

### #B — `test/core/services/form-ir-clone-template.test.ts`

Add inside the existing `describe("applyTokenMap (low-level IR transformation)")` block (after the `does NOT walk scalar values of preserved metadata keys` test):

```ts
it("replaces a {{Token}} occurrence in a FormatConditions scalar when mapped (issue #622 #B)", () => {
  // FormatConditions starts with `Format` but is NOT a preserved key.
  // The exact-match predicate MUST treat it as an ordinary layout key.
  const ir = loadIr(
    `Version =21
Begin Form
    FormatConditions ="{{X}}_foo"
End
`,
    "SourceForm",
  );

  const result = applyTokenMap(ir, { X: "BAR" });

  expect(serializeFormTxt(result.ir)).toContain('FormatConditions ="BAR_foo"');
  expect(serializeFormTxt(result.ir)).not.toContain("{{X}}");
  expect(result.appliedTokens).toContain("X");
  expect(result.missingTokens).not.toContain("X");
});

it("appliedTokens excludes a token whose only occurrence was inside a preserved-metadata key (issue #622 #B)", () => {
  // The token only appears inside Checksum (preserved). The post-IR
  // serialized text still contains `{{X}}`. The token MUST go into
  // missingTokens, NOT appliedTokens.
  const ir = loadIr(
    `Version =21
Checksum ="{{X}}_checksum_value"
Begin Form
    Caption ="hello"
End
`,
    "SourceForm",
  );

  const result = applyTokenMap(ir, { X: "BAR" });

  // Token survives in the serialized output (Checksum is preserved).
  expect(serializeFormTxt(result.ir)).toContain("{{X}}");
  // Truthfulness contract: it is NOT applied.
  expect(result.appliedTokens).not.toContain("X");
  // It IS reported as missing.
  expect(result.missingTokens).toContain("X");
});

it("appliedTokens includes only tokens whose {{...}} pattern was actually replaced in the serialized IR (issue #622 #B)", () => {
  // Source: token appears once in a layout Caption. Map has the token.
  const ir = loadIr(
    `Version =21
Begin Form
    Caption ="Hello {{X}}"
End
`,
    "SourceForm",
  );

  const result = applyTokenMap(ir, { X: "World" });

  expect(result.appliedTokens).toContain("X");
  expect(serializeFormTxt(result.ir)).toContain('Caption ="Hello World"');
  expect(serializeFormTxt(result.ir)).not.toContain("{{X}}");
});
```

The existing test at line 106 ("does NOT walk scalar values of preserved metadata keys") stays green — the fixture only uses `Checksum` and `Format` (exact-match preserves them; their tokens remain verbatim; with the new algorithm those tokens go to `missingTokens`, but the test does not assert on `appliedTokens`/`missingTokens`).

### #C — `test/core/services/vba-form-service.test.ts`

REPLACE the pinning test at line 814-839 with two tests:

```ts
it("catalogAddControl uses empty catalog when readJson rejects with ENOENT (issue #622 #C)", async () => {
  const writtenFiles: Array<{ path: string; data: string }> = [];
  const fs = makeFs({
    readJson: vi.fn().mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    ),
    writeFile: vi.fn().mockImplementation(async (p: string, d: string) => {
      writtenFiles.push({ path: p, data: d });
    }),
  });

  const service = new VbaFormService({ fileSystem: fs });

  const result = await service.catalogAddControl({
    spec: { name: "Form_New", kind: "Form", controls: [] },
    controlName: "btn",
    controlType: "Button",
    catalogPath: "/fake/forms/catalog.json",
    apply: true,
  });

  expect(result.ok).toBe(true);
  // writeFile MUST be called exactly once with the new JSON.
  expect(writtenFiles).toHaveLength(1);
  if (!writtenFiles[0]) throw new Error("Expected written file");
  const written = JSON.parse(writtenFiles[0].data);
  expect(written.forms.Form_New).toEqual([{ name: "btn", type: "Button" }]);
});

it("catalogAddControl returns VBA_CATALOG_CORRUPT when readJson rejects with a non-ENOENT error and does not write (issue #622 #C)", async () => {
  const writeFileSpy = vi.fn().mockResolvedValue(undefined);
  const fs = makeFs({
    // Simulates the JSON parse-error message that nodeFileSystem.readJson
    // produces when the catalog file is present but unparseable.
    readJson: vi.fn().mockRejectedValue(new Error("Invalid JSON file: /fake/forms/catalog.json")),
    writeFile: writeFileSpy,
  });

  const service = new VbaFormService({ fileSystem: fs });

  const result = await service.catalogAddControl({
    spec: { name: "Form_Corrupt", kind: "Form", controls: [] },
    controlName: "ctrl",
    controlType: "Label",
    catalogPath: "/fake/forms/catalog.json",
    apply: true,
  });

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe("VBA_CATALOG_CORRUPT");
  }
  // The on-disk catalog is NOT modified.
  expect(writeFileSpy).not.toHaveBeenCalled();
});

it("catalogAddControl returns success in dryRun with ENOENT and does not write (issue #622 #C)", async () => {
  const writeFileSpy = vi.fn().mockResolvedValue(undefined);
  const fs = makeFs({
    readJson: vi.fn().mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    ),
    writeFile: writeFileSpy,
  });

  const service = new VbaFormService({ fileSystem: fs });

  const result = await service.catalogAddControl({
    spec: { name: "Form_DryRunMissing", kind: "Form", controls: [] },
    controlName: "btn",
    controlType: "Button",
    catalogPath: "/fake/forms/catalog.json",
    // dryRun defaults to true; explicit for clarity.
    dryRun: true,
  });

  expect(result.ok).toBe(true);
  if (result.ok) {
    const data = result.data as { dryRun: boolean; written: boolean };
    expect(data.dryRun).toBe(true);
    expect(data.written).toBe(false);
  }
  expect(writeFileSpy).not.toHaveBeenCalled();
});

it("catalogAddControl returns VBA_CATALOG_CORRUPT in dryRun with parse error and does not write (issue #622 #C)", async () => {
  const writeFileSpy = vi.fn().mockResolvedValue(undefined);
  const fs = makeFs({
    readJson: vi.fn().mockRejectedValue(new Error("Invalid JSON file: /fake/forms/catalog.json")),
    writeFile: writeFileSpy,
  });

  const service = new VbaFormService({ fileSystem: fs });

  const result = await service.catalogAddControl({
    spec: { name: "Form_DryRunCorrupt", kind: "Form", controls: [] },
    controlName: "btn",
    controlType: "Button",
    catalogPath: "/fake/forms/catalog.json",
    dryRun: true,
  });

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe("VBA_CATALOG_CORRUPT");
  }
  expect(writeFileSpy).not.toHaveBeenCalled();
});
```

The existing test at line 841 (`VBA_CATALOG_WRITE_FAILED` when `writeFile` rejects) MUST stay green — the read arm now runs first, but its ENOENT branch is a `try/catch` swallow that does not return, so the write arm still runs. Use `Object.assign(new Error("ENOENT"), { code: "ENOENT" })` in the existing writeFile test's readJson mock too, otherwise it will start failing under the new code.

## Critical Contracts From `sdd-spec` (do not violate)

1. **#A ordering** — the `REPORT_PREFIXES` check at the new lines 30-32 MUST run BEFORE the `vbaType === 100` fallback at the (still-present) lines 34-36. The "type-100 fallback overridden by rpt prefix" test guards this.
2. **#B appliedTokens algorithm** — derive from surviving `{{...}}` patterns in `serializeFormTxt(next)`, NOT from `Object.hasOwn(tokenMap, sourceToken)`. The new tests at `form-ir-clone-template.test.ts` pin both the truth and the algorithm.
3. **#C test split** — the existing pinning test at line 814 is SPLIT (kept + new), not just augmented. The new RED test fails under current code (which silently overwrites) and passes after the fix (which returns `VBA_CATALOG_CORRUPT`).

## Backward Compatibility

| PR | Compat impact | CHANGELOG |
|---|---|---|
| #A | Zero — `resolveComponent` has no production callers today (latent fix). | Note that `rpt`/`rpt_` are now recognized as report prefixes. |
| #B | Behavior change in strict policy: a source token whose only occurrence lives inside a preserved metadata key now triggers `FORM_MUTATION_INVALID` (previously it was reported as `applied` and the operation succeeded). Warn-pass-through (default) is unchanged for the IR text — preserved keys still keep their tokens verbatim. | Note: strict policy now treats preserved-key tokens as missing. |
| #C | Behavior change on corrupt catalog: `catalogAddControl` now returns `VBA_CATALOG_CORRUPT` instead of silently overwriting with a one-control stub. ENOENT keeps existing behavior. | Note the new error code; recommend inspecting the catalog manually to recover. |

## Testing Strategy

| Layer | What | How |
|-------|------|-----|
| Unit | `resolveComponent` (#A) — 4 new cases + 10 existing stay green | `test/core/mapping/component-resolver.test.ts` (pure function, no I/O). |
| Unit | `applyTokenMap` (#B) — `FormatConditions` scalar replaced; `appliedTokens` truth; `missingTokens` for surviving tokens | `test/core/services/form-ir-clone-template.test.ts` (pure IR, no I/O). |
| Unit | `catalogAddControl` (#C) — ENOENT + parse-error in apply AND dryRun | `test/core/services/vba-form-service.test.ts` (fake-port, no real filesystem). |
| E2E | None. NO E2E this cycle (per campaign rule). | — |
| Lint/build | `pnpm test`, `pnpm lint`, `pnpm build` after each PR. | — |

## Migration / Rollout

- **#A**: no migration. Latent fix.
- **#B**: no migration. Strict policy users (very few today) may see a new throw if their source has tokens inside preserved keys. CHANGELOG entry tells them to either widen the token map or remove the tokens from the preserved-key scalars.
- **#C**: any existing `catalogAddControl` caller that previously got silent overwrites on corrupt catalog will now get a `VBA_CATALOG_CORRUPT` error. Document the manual recovery in CHANGELOG. A future `--force-rebuild` escape hatch is mentioned in the proposal as out-of-scope; design reserves `VBA_CATALOG_FORCE_REBUILD` as a future code (do not preempt).
- **Rollback per PR**: PR1 restores the single-prefix check. PR2 restores the `startsWith` predicate and `Object.hasOwn` derivation (bug returns). PR3 merges the catch arms back and re-inserts the dryRun short-circuit before the read (bug returns). No data loss in any rollback.

## Open Questions

- None that block the design. The "matching `generateForm` dryRun/apply parity" claim in the spec is aspirational — `generateForm` does not do a read in dryRun. The `catalogAddControl` reorder achieves intra-method parity (read always → write-or-skip), which is the spec's actual intent. The "parity with `generateForm`" wording may be tightened in the spec at archive time; the design does not depend on it.

## PR Commit Plan

3 PRs, 1 commit each (each is a single logical change — split the test split, NOT the fix):

| PR | Commit | Body |
|---|---|---|
| 1 — #A | `fix(form-ir-bugs): resolveComponent recognizes rpt/rpt_ prefixes (#622)` | `SDD: form-ir-bugs`; `Issue: #622`; `Tests: 4 new RED cases in test/core/mapping/component-resolver.test.ts`; explicit note that `resolveComponent` has no current caller (latent fix). |
| 2 — #B | `fix(form-ir-bugs): exact-match preserved-key predicate + appliedTokens truth (#622)` | `SDD: form-ir-bugs`; `Issue: #622`; `Tests: 3 new RED cases in test/core/services/form-ir-clone-template.test.ts`; note the strict-policy behavior change. |
| 3 — #C | `fix(form-ir-bugs): catalogAddControl refuses corrupt catalog with VBA_CATALOG_CORRUPT (#622)` | `SDD: form-ir-bugs`; `Issue: #622`; `Tests: split pinning test 814; 3 new RED cases for apply/dryRun × ENOENT/parse-error`; note the dryRun reorder. |

Each PR independently reverts to bug-state. No inter-PR dependencies.
