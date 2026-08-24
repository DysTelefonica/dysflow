# Release validation receipts

The release workflow may reuse a recent CI quality result instead of repeating
lint and unit tests for identical source bytes. This is an optimization, not a
weaker release gate: uncertainty always selects the full validation path.

## Fast path

The `quality-authority` job skips duplicate lint, unit-test, and coverage runs
only when GitHub reports one
unambiguous `CI result` job that:

- belongs to the `CI` workflow at `.github/workflows/ci.yml` in this repository;
- ran as a `push` on `main` for the exact commit named by the release tag;
- completed successfully less than 24 hours ago; and
- reports the same run ID and commit SHA through the workflow-run and job APIs.

`CI result` is the stable aggregate job in `.github/workflows/ci.yml`; unlike
the matrix-expanded `Quality gates (26)` display name, it does not embed the
supported Node major. A structural test pins the verifier identity to that
workflow declaration so changing either side alone fails CI.

The job exports the accepted run and job IDs, exact commit, decision reason, and
authority URL. The final publication job validates the authority SHA against
its checkout and renders those references in the workflow summary.
The expected SHA is resolved from the checked-out commit, so annotated tag
objects cannot be mistaken for the commit that CI tested.
The release build, archive checksum, Ed25519 signature, signature self-check,
publication, and release-title guard still run on every release.

## Full-validation fallback

Linux uses the package-supported Node 26 runtime, installs dependencies, and
runs `pnpm lint`, `pnpm build`, `pnpm test`, and `pnpm coverage` in that order
whenever a receipt is missing, stale, failed, incomplete, for a
different SHA, workflow, branch, event, or repository, or when the GitHub API
is unavailable or returns malformed/ambiguous data. Verification errors
deliberately exit successfully from the receipt probe so the guarded validation
steps run; they never grant a skip. The direct-gate run becomes the auditable
authority only after every command succeeds.

To force the slow path for one release, dispatch the `Release` workflow on the
existing version tag and enable **Ignore a fresh CI receipt and run all quality
gates again**. Manual dispatches from non-version refs are rejected by every
job.

## Other CI optimizations

- The Windows PowerShell/Access smoke job runs on pull requests, before merge.
- The fail-closed dependency audit runs on pushes to `main`, where it gates the
  authoritative receipt.
- The release build job uploads `dist-<tag SHA>` once as a tar archive, which
  preserves executable modes and symlinks. The publishing job downloads that
  run-scoped artifact and verifies it against the build job's independent
  SHA-256 output before extraction, archive creation, and signing.

## Drift detection

`.github/workflows/verify-receipt-skip.yml` checks out `main` weekly on Node 26
and executes the same lint, build, test, and coverage sequence from that clean
checkout.

`test/ci/release-receipt-skip.test.ts` covers the fast path, stale and
foreign evidence, API-shape failures, and ambiguous receipts.

It also pins workflow identity, Node-engine parity, direct-gate order, and
preservation of the release integrity guards.

## v3.0.0 recovery

The failed v3.0.0 workflow published no GitHub Release. Its remote tag remains
immutable and the old workflow snapshot must not be rerun for publication.

After this fix reaches `main`, CI is green, and the fresh release E2E passes,
the supported recovery is v3.0.1 through
`scripts/release-prepare.ps1 -Bump patch`.
