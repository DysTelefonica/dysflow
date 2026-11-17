# v4.5.10

## Summary

- Safer installation: stage both dependency graphs before replacing a working runtime; support pnpm 10 and 12 without changing the frozen security pins.
- Product fixes: preserve useful, redacted Pi diagnostics and correct semantic comparison of legacy forms and large diffs.
- New functionality: detached `test_vba` runs with persisted structured results and the read-only `get_test_run` tool.
- Release engineering: isolate test installations and allow other projects to keep using Access during the release battery.
- No Access database migration or project-configuration migration is introduced. Restart MCP clients to discover the new server/tools; installation does not require forcibly closing Access.

These notes cover the complete published-release range, not only the latest preparation commit. They were added after publication; the tag and signed assets have not changed.

## Provenance

| Item | Verified value |
| --- | --- |
| Previous published release | `v4.5.7`, `15c1b86891175deb392744f7dd64bda4c2982646` |
| This release | `v4.5.10`, `fcf7007a621931740899a8e48e23046608dda039` |
| Distributed artifact | `dysflow-v4.5.10.tar.gz`, 2,101,713 bytes |
| Archive SHA-256 | `2d23d8455a739a453a1f3845ced58f9e359ff49d3f64b5acfd4def72b1fbaea6` |
| Authenticity | Ed25519-verified `SHA256SUMS.sig` over `SHA256SUMS`, then archive SHA-256 verified |
| Release authority | [Workflow 44043946634](https://github.com/DysTelefonica/dysflow/actions/runs/44043946634), all jobs successful |
| Rollback artifact | Signed `dysflow-v4.5.7.tar.gz`, SHA-256 `2f3dc72f92a544010e9631587b4c114710a6a5345f3cbfd75be872d5fa2abfd6` |
| Complete source comparison | [v4.5.7...v4.5.10](https://github.com/DysTelefonica/dysflow/compare/v4.5.7...v4.5.10) |

The unsuccessful `v4.5.8` and `v4.5.9` tags remain immutable. Neither is a published stable release or the user-facing comparison baseline.

## Security and safety

### Preserve a working installation on dependency failure — PR #2006, closes #1999

- **Before:** dependency or frozen-lockfile failures could leave installation/update partially promoted; pnpm defaults and pnpm 12 override handling disagreed with the locked graphs.
- **Now:** prepare the runtime and Pi production graphs before promotion. A preparation failure preserves the previous app and install state. Explicit peer/linker settings and a staged workspace preserve the existing override pins; Pi has its own workspace boundary.
- **Where:** `dysflow install`, `dysflow update`, and the runtime/Pi dependency installer in `src/cli/commands/install/extractor.ts`.

### Keep Pi failure details useful without exposing sensitive values — PR #2004, closes #2000

- **Before:** typed error handling lost useful diagnostic context; printing unrestricted diagnostics was not an acceptable replacement.
- **Now:** preserve bounded typed error details while redacting tested credential and absolute-path patterns. Success output and untyped legacy errors retain their previous behavior.
- **Where:** the Pi integration's tool-error renderer.

## Product fixes

### Recognize legacy form code-behind serialization — PR #2003, closes #2002

- **Before:** a legacy bare `CodeBehind` marker could make serialized code look like a form-layout difference.
- **Now:** recognize that exact legacy marker alongside `CodeBehindForm`/`CodeBehindReport`. Code remains owned by its sibling `.cls`; real layout changes stay actionable and strict comparison remains exact.
- **Where:** semantic `verify_code` comparison of form/report layout sources.

### Count large functional diffs accurately — PR #2005, closes #2001

- **Before:** exhausting the LCS comparison budget could inflate the reported change count for a small edit in a large module/form.
- **Now:** preserve the ordered common prefix and suffix before applying the budget to the remaining middle. Large unresolved reorders remain conservatively actionable. A missing or renamed `VB_Name` remains actionable, not serialization noise.
- **Where:** `verify_code` semantic comparison and its direction/count diagnostics.

### Refresh the runtime MCP SDK — PR #1985

- **Before:** the root runtime used `@modelcontextprotocol/sdk` 1.32.1.
- **Now:** its locked dependency is 1.32.2. The Pi facade retains its independently locked graph; the installation check verified both graphs resolve successfully.
- **Where:** root MCP transport dependencies. No additional tool-contract change is inferred from this dependency update alone.

## New and expanded functionality

### Detached VBA test runs with retained results — PR #2007, closes #1993

- **Before:** long test execution depended on the lifetime of the requesting client call, despite the progress improvements already present in v4.5.7.
- **Now:** `test_vba` can detach, return an operation identifier, and retain structured progress/results. The read-only `get_test_run` tool supports bounded polling without restarting the test. Per-target serialization and process-identity safeguards remain in place; synchronous behavior remains available.
- **Where:** MCP `test_vba` / `get_test_run`, the test-run CLI and the core test-run store/runner.

The advertised core surface grows from 71 to 72 tools; the complete callable inventory grows from 94 to 95. The newly installed server was checked against both inventories.

## Repository, tests, and release engineering

These changes do not alter the Access application's VBA or data.

- **Isolated workflow setup — PR #2008:** both official Access workflows exclude all five profile adapters and use a private runtime marker when installing their throwaway runtime.
- **Isolated nested setup — PR #2010:** the release harness's own second installation is independently contained. It clones the child environment, overrides inherited marker paths, excludes profile propagation and keeps candidate-identity checks.
- **Cross-project coexistence — PR #2011:** foreign Access instances are observed, not treated as automatic orphans. Only positively attributed sandbox PID/start-time survivors affect the Access ownership verdict; unmatched process changes remain explicitly unattributed/unverified. Canonical runtime cleanup and owned-child/descendant failures remain unchanged.
- **Development dependencies:** TypeBox 1.4.3 (#1983), Vite 8.3.5 (#1984), and Biome 2.6.7 with its matching configuration schema (#1986).
- **CI actions:** CodeQL analyze/init 4.39.3 (#1995, #1997), release action 3.0.4 (#1996), and pnpm setup 6.1.1 (#1998).
- **Release preparation — PRs #2009 and #2012:** synchronize package/plugin/skill versions. The latter accounts for four precisely measured bootstrap/compact-capability byte increases caused by the extra version digit. Other ceilings and comparison logic are unchanged.
- **Historical integration — PR #1994:** merge the already published v4.5.7 work back into main. Its fixes and closures are accounted for below, not presented as new v4.5.10 functionality.

## Integrated pull requests

Coverage inventory: **19 PRs, zero commits without a PR, eight linked closing issues**, with no exclusions.

| PR | Included change |
| --- | --- |
| #1983 | TypeBox 1.4.3 |
| #1984 | Vite 8.3.5 |
| #1985 | Runtime MCP SDK 1.32.2 |
| #1986 | Biome 2.6.7 and schema alignment |
| #1994 | Integration of already published v4.5.7 |
| #1995 | CodeQL analyze 4.39.3 |
| #1996 | Release action 3.0.4 |
| #1997 | CodeQL init 4.39.3 |
| #1998 | pnpm setup 6.1.1 |
| #2003 | Legacy code-behind markers |
| #2004 | Bounded, redacted Pi diagnostics |
| #2005 | Ordered-edge large-diff counts |
| #2006 | Transactional dependency staging |
| #2007 | Detached test runs and structured results |
| #2008 | Workflow install containment |
| #2009 | Unpublished intermediate release preparation |
| #2010 | Nested harness install containment |
| #2011 | Owned-process leak attribution |
| #2012 | v4.5.10 preparation and measured metadata budgets |

## Verification evidence

- Exact-main CI, release build, exact-SHA quality authority, Windows/Access E2E and artifact publication all passed for the tagged commit.
- The real Access release battery passed in **1h26m9s** while a foreign Access instance was present. It reported zero positively owned survivors and zero unattributed fresh headless processes. Retained operation records are partial history, not a claim of complete DCOM attribution.
- Installer regression verification included actual pnpm 10/12 installs and forced updates, plus failure-path preservation of the prior runtime.
- After publication, the signed release upgraded a real stable installation from 4.5.7 to 4.5.10. Node/PowerShell/CMD launchers, production dependencies and a fresh writes-disabled MCP process passed; 290 installed distribution files matched the published distribution byte-for-byte.
- The fresh installed MCP reported version 4.5.10, 95 callable tools and 72 advertised tools. No user database operation or client restart was needed for this installation acceptance.
- The archive signature, SHA-256 and safe member paths were checked independently after download. The previous release's rollback checksum manifest signature was also verified.

## Compatibility and configuration

- Existing project configuration and synchronous test calls remain supported; no Access data/schema migration is part of this release.
- Reload MCP clients to load the new server version and tool inventory. Already running clients can continue showing their cached older server version until reconnected.
- Cleanup remains operation-owned. Another project's Access process must not be closed merely to run a release test.
- Older bootstrap executables do not acquire the installer fix until replaced. If affected by #1999, bootstrap the verified new release CLI rather than patching managed dependencies by hand.

## Upgrade and rollback

1. Preserve your existing project/database backups and, for a direct rollback, a complete copy of the managed runtime including dependencies and install state. Installation itself does not migrate the Access database.
2. Download the release archive, `SHA256SUMS` and `SHA256SUMS.sig`. Verify the Ed25519 signature with the trusted embedded public key, then verify the matching archive hash. Do not bypass checksums.
3. Use the signed stable installer. For an existing usable CLI, the command is `dysflow update --channel stable`; require exit 0 and `dysflow --version` equal to `4.5.10`.
4. The independently tested bootstrap used the verified archive's prebuilt CLI with Node 26 and its pinned pnpm 10.17.1. Install frozen production dependencies in that extracted directory first, then run its `node dist/cli/index.js update --runtime-dir <managed-runtime> --channel stable`. No TypeScript source build or manual repair inside the managed runtime is required.
5. Reconnect the MCP client when convenient, then check fresh `bootstrap`/schema metadata read-only. Do not force-close unrelated Access sessions or restart another project's clients automatically.
6. If rollback is needed, finish only the affected Dysflow operations and disconnect their clients. Restore the complete pre-upgrade runtime backup, or bootstrap the verified signed v4.5.7 archive with its own frozen manifest, then verify version and reconnect. There is no invented `--version` downgrade flag; never delete project configuration, source or Access data as an installer repair.

## Closure register

| Issue | Disposition in this published range |
| --- | --- |
| #1990 | Closed by #1994; per-test progress/partial-result work was already shipped in v4.5.7. |
| #1991 | Closed by #1994; project/process-attributed orphan cleanup was already shipped in v4.5.7. |
| #1992 | Closed by #1994; `lint_form_code` cwd source resolution was already shipped in v4.5.7. |
| #1993 | Closed by #2007; detached test execution and retained structured results. |
| #1999 | Closed by #2006; frozen dependency staging before promotion. |
| #2000 | Closed by #2004; useful bounded/redacted typed Pi errors. |
| #2001 | Closed by #2005; ordered common-edge diff counts. |
| #2002 | Closed by #2003; legacy bare code-behind markers. |

### Remaining work

- **#1918 remains open:** intermittent COM/combase crash causality is not established. The owner explicitly accepted it as non-blocking; this successful battery does not close or explain it.
- **No issue, measurement limitation:** full-capabilities budget measurements on the local Windows repository already exceeded the stored ceiling before this change because of project-discovery path forms. That ceiling was not raised; required Linux CI passed. Unmatched process attribution likewise remains explicitly unverified rather than a fabricated clean verdict.
