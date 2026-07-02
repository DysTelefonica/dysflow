/**
 * form-noise-keys.ts — single source of truth for Access form/report
 * serialization-noise scalar keys.
 *
 * Both `src/core/services/form-ir-compare-service.ts` (typed-IR diff) and
 * `src/core/services/vba-semantic-classifier.ts` (text-based diff) classify
 * the same Access-export noise floor. Before #hexagonal-tech-debt PR 2 each
 * module declared its own copy of the set — a latent-future-bug if one added
 * a key the other did not. This module is the SINGLE owner; both consumers
 * re-export from here so `Object.is(consumer.FORM_NOISE_KEYS, shared.FORM_NOISE_KEYS)`
 * holds for every consumer.
 *
 * ## Why these keys
 *
 * Access writes a small set of bookkeeping scalars (and Begin..End blocks for
 * some) every time it exports a form/report. These are runtime-irrelevant:
 * - `Checksum` / `PrtDevMode*` / `PrtDevNames*` / `PrtMip` — printer-driver
 *   boilerplate that changes between machines and Access versions.
 * - `RecSrcDt` — record-source timestamp regenerated on Save.
 * - `LayoutCached*` — IDE layout cache; round-trips identically between
 *   consecutive exports but differs between machines.
 * - `PublishOption`, `NoSaveCTIWhenDisabled` — IDE/runtime toggles.
 * - `NameMap` — binary name table Access omits/recreates between exports;
 *   real control/name changes still survive through the property/control
 *   lines themselves.
 *
 * Anything not in this list is preserved by the diff (bias-to-functional).
 * GUID is FUNCTIONAL and must NOT be added here.
 *
 * ## Invariants (LOCKED)
 *
 * - The list is closed: additions require updating this file, the consumer
 *   re-exports, AND the membership snapshot test in
 *   `test/core/services/form-ir-compare.test.ts`.
 * - `ReadonlySet` prevents accidental `.add` from consumers.
 * - Any unknown key is retained by the consumers — they fail closed, never
 *   open, on drift.
 */

/**
 * Canonical set of Access form/report serialization-noise keys.
 *
 * Adding a key here removes it from the actionable-diff surface. Any addition
 * MUST be paired with the membership snapshot test that fails fast on silent
 * drops.
 */
export const FORM_NOISE_KEYS: ReadonlySet<string> = new Set([
  "Checksum",
  "PrtDevMode",
  "PrtDevModeW",
  "PrtDevNames",
  "PrtDevNamesW",
  "PrtMip",
  "RecSrcDt",
  "LayoutCachedLeft",
  "LayoutCachedTop",
  "LayoutCachedWidth",
  "LayoutCachedHeight",
  "PublishOption",
  "NoSaveCTIWhenDisabled",
  "NameMap",
]);
