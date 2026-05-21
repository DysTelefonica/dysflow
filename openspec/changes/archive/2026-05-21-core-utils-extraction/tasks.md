# Tasks: Core Utils Extraction

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 150–200 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception (not needed — within budget) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | All tasks below | PR 1 | Single PR, Closes #64 |

---

## Phase 1: Foundation — Create shared utils module

- [ ] 1.1 Create `src/core/utils/index.ts` exporting exactly: `REDACTED_SECRET` (string const), `isRecord` (type guard with `!Array.isArray` check), `stringValue` (trims, returns undefined on blank/non-string), `sanitizeSecrets` (loops secrets with `secret.length === 0` guard, uses `split/join`), `readJsonFileSync<T>` (uses `node:fs` `readFileSync`), `readJsonFileAsync<T>` (uses `node:fs/promises` `readFile`). No imports from adapters or HTTP.
- [ ] 1.2 Create `test/core/utils/utils.test.ts` with at least one test per export: `REDACTED_SECRET` value assertion; `isRecord` true on plain object, false on null/number/array; `stringValue` trims non-blank, returns undefined on blank/whitespace/non-string; `sanitizeSecrets` replaces secrets, skips empty string; `readJsonFileSync` reads tmp file; `readJsonFileAsync` reads tmp file (real tmp via `node:fs.mkdtempSync`).
- [ ] 1.3 Run `pnpm test` — all tests must pass including `test/architecture/core-boundary.test.ts`.

## Phase 2: Core Migration — File by file (sequential, gate after each)

- [ ] 2.1 Migrate `src/core/config/dysflow-config.ts`: remove local `normalizeNameValue`, `normalizePathValue`, `isRecord`, `readJsonFileSync`, `REDACTED_SECRET`; add `import { isRecord, stringValue, readJsonFileSync, REDACTED_SECRET } from "../utils/index.js"`. Update call-sites: `normalizeNameValue(x)` → `stringValue(x)`, `normalizePathValue(x)` → `stringValue(x)`. Run `pnpm build && pnpm test`.
- [ ] 2.2 Migrate `src/core/runner/access-runner.ts`: remove local `REDACTED_SECRET` definition and local `sanitize`/`sanitizePowerShellOutput` implementation; add `import { sanitizeSecrets, REDACTED_SECRET } from "../utils/index.js"`; keep back-compat re-export `export { sanitizeSecrets as sanitizePowerShellOutput } from "../utils/index.js"`. Run `pnpm build && pnpm test`.
- [ ] 2.3 Migrate `src/core/services/vba-sync-legacy-service.ts`: remove local `stringValue`, `isRecord`, `readJsonFileAsync`, `sanitize`; add `import { stringValue, isRecord, sanitizeSecrets, readJsonFileAsync } from "../utils/index.js"`. Update internal `sanitize(...)` call-sites to `sanitizeSecrets(...)`. Run `pnpm build && pnpm test`.
- [ ] 2.4 Migrate `src/adapters/mcp/tools.ts`: remove local `stringValue`, `isRecord`; add `import { stringValue, isRecord } from "../../core/utils/index.js"`. Run `pnpm build && pnpm test`.
- [ ] 2.5 Migrate `src/adapters/mcp/stdio.ts`: remove local `isRecord`; add `import { isRecord } from "../../core/utils/index.js"`. Run `pnpm build && pnpm test`.

## Phase 3: Verification

- [ ] 3.1 Run `pnpm build` — `tsc --noEmit` must report zero errors; no `unknown`-widening regressions.
- [ ] 3.2 Run `pnpm test` — Vitest must discover `test/core/utils/utils.test.ts`; all tests pass including `test/architecture/core-boundary.test.ts`; `sanitizePowerShellOutput` import from `access-runner.ts` resolves without error.
- [ ] 3.3 Grep `src/core/**` for `const REDACTED_SECRET`, `function isRecord`, `function stringValue`, `function readJsonFile` — zero matches expected (spec: No Duplicate Definitions in src/core).
