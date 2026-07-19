# Codegraph supplement drift detector

> **Status:** Shipped in `DysTelefonica/dysflow` PR for issue #961 (B component).
> The proper fix belongs in `DysTelefonica/workflow`'s `dysflow-codegraph-update`
> skill (ARN chain); this is the **local safety net** until that fix lands or
> the workflow repo is unarchived.

## What it detects

A user-supplement block (e.g. `<!-- user-supplement:ardelperal:codegraph-extra-tools -->`)
in any of the 10 well-known user-global instruction files that pins itself to
a `codegraph-vba` runtime version in prose.

## Detection patterns

The detector scans for two patterns **inside** `<!-- user-supplement:* --> ... <!-- /user-supplement:* -->` blocks:

1. **Strict:** literal `codegraph-vba vX.Y.Z` or `codegraph-vba vX.Y`
2. **Loose:** bare `vX.Y[.Z]` followed by a keyword like `semantics`, `runtime`, `spec`, `behaviour`, `behavior`, `contract`, `version`

The strict pattern is the high-confidence signal; the loose pattern catches
the real-world case where the author wrote "v1.10.0 semantics" without the
`codegraph-vba` prefix.

## Files scanned

The detector walks the canonical `~/.config/opencode/` instruction file list:

```
.config/opencode/AGENTS.md
.config/opencode/CLAUDE.md
.config/opencode/GEMINI.md
.config/opencode/CODEX.md
.config/opencode/.opencode/agent.md
.config/opencode/.claude/CLAUDE.md
.config/opencode/.gemini/GEMINI.md
.config/opencode/.codex/AGENTS.md
.config/opencode/.qwen/AGENTS.md
.config/opencode/.aider/AGENTS.md
```

## Out of scope

- `<!-- gentle-ai:* -->` managed blocks are excluded — `gentle-ai sync`
  regenerates them as a unit.
- Code outside `<!-- user-supplement:* -->` blocks — the user owns that
  prose directly.
- `codegraph-usage v1.2` (skill versions) — only the runtime version is
  flagged.

## Integration point

Wired into `dysflow doctor` as a warn-only diagnostic line. A drift finding
renders ⚠ but never flips the doctor exit code (drift is a remediation hint,
not a hard failure). Missing files are recorded as `errors[]` for visibility
but also do not flip `ok`.

## Architecture

- **Pure kernel** — `src/core/services/codegraph-supplement-drift-detector.ts`
  has no `node:fs` imports; it takes a caller-supplied
  `InstructionFileReadPort`. Exposes:
  - `scanSupplementDriftInContent(content, filePath)` — pure
  - `countSupplementBlocks(content)` — pure helper
  - `detectSupplementDrift({ filePaths, port })` — async, port-injected
  - `DEFAULT_INSTRUCTION_FILE_PATHS` — the canonical 10-file list

- **CLI composition root** — `src/cli/commands/codegraph-supplement-drift-check.ts`
  supplies the Node `readFile` adapter and exports:
  - `runSupplementDriftCheck({ home, readFile?, relativePaths? })`
  - `runSupplementDriftCheckFromEnv(env, readFile?)`
  - `formatSupplementDriftDiagnostic(result)` — pure formatter

- **Doctor wiring** — `src/cli/commands/doctor.ts` calls
  `runSupplementDriftCheck` after the core diagnostics and renders the
  resulting `SupplementDriftDiagnostic` as a warn-only line. The check is
  best-effort: a thrown error becomes a silent skip so the doctor never
  blocks on a filesystem hiccup.

## Test surface

- `test/core/services/codegraph-supplement-drift-detector.test.ts` — 17 unit
  tests covering the pure kernel (pattern detection, block scope, gentle-ai
  exclusion, malformed closing markers, port-based multi-file scan, default
  file list contract).
- `test/cli/commands/codegraph-supplement-drift-check.test.ts` — 10
  composition-root tests (home resolution, port injection, missing-file
  handling, formatter output).
- `test/cli/commands.test.ts` — 1 doctor-wiring test that pins the
  `⚠ codegraph-supplement-drift: ...` line in the doctor output.

## Result envelope

```typescript
type SupplementDriftScanResult = {
  ok: boolean;                  // true iff driftDetected is empty
  filesScanned: number;         // files successfully read
  blocksScanned: number;        // <!-- user-supplement:* --> markers seen
  driftDetected: SupplementDriftFinding[];
  errors: SupplementDriftError[]; // FILE_READ_FAILED entries
};

type SupplementDriftFinding = {
  filePath: string;
  blockId: string;              // the user-supplement block id (between markers)
  line: number;                 // 1-indexed
  snippet: string;              // the offending line, trimmed
  matchedVersion: string;       // e.g. "v1.10.0" or "<malformed-closing-marker>"
  remediation: string;          // copy/pasteable hint
  malformedClosing?: boolean;   // set when a block had no closing marker
};
```

## Operator remediation

When the doctor emits a drift finding, the fastest path is the auto-fix
command (A component, issue #961):

```
dysflow codegraph-drift          # read-only dry-run: lists the rewrites, exits 1 on drift
dysflow codegraph-drift --apply  # rewrites the stale references in place
```

The rewrite replaces each stale reference with runtime-neutral phrasing that
points at `codegraph --version` as the single source of the runtime version:

- strict: `codegraph-vba v1.10.0` → ``codegraph-vba (installed runtime — see `codegraph --version`)``
- loose: `for v1.10.0 semantics` → ``for the installed runtime (see `codegraph --version`) semantics``

Guarantees:

- Only prose inside `<!-- user-supplement:* -->` blocks is touched; gentle-ai
  managed blocks and surrounding markdown stay verbatim.
- A file whose supplement block never closes is skipped fail-closed — restore
  the `<!-- /user-supplement:... -->` marker first, then re-run.
- The rewrite is idempotent and detector-clean: a second run makes zero
  changes, and the doctor scan reports zero findings afterwards.
- CRLF/LF line endings are preserved.

Manual fallback:

1. Open the file at the line number reported.
2. Replace the literal version with a `codegraph --version` pointer, e.g.
   - `codegraph-vba v1.10.0 semantics` → `live runtime version: codegraph --version`
3. Skill-version references (`codegraph-usage v1.2`) do NOT need to change —
   only the runtime version is flagged.
4. If the finding has `malformedClosing: true`, also add the missing
   `<!-- /user-supplement:... -->` closing marker.

## Future work

Once the canonical fix lands in `DysTelefonica/workflow`'s ARN chain, this
detector should keep running as a guard rail. Its job is to surface drift
fast (no remote sync needed) so the user knows to refresh inline — and the
`codegraph-drift --apply` fix keeps working as the local remediation either
way.
