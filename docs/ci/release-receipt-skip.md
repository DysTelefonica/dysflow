# Release validation receipts

The release workflow may reuse a recent CI quality result instead of repeating
lint and unit tests for identical source bytes. This is an optimization, not a
weaker release gate: uncertainty always selects the full validation path.

## Fast path

The `quality-authority` job skips duplicate lint, unit-test, and coverage runs
only when GitHub reports one
unambiguous `Quality gates (20)` job that:

- belongs to the `CI` workflow at `.github/workflows/ci.yml` in this repository;
- ran as a `push` on `main` for the exact commit named by the release tag;
- completed successfully less than 24 hours ago; and
- reports the same run ID and commit SHA through the workflow-run and job APIs.

The job exports the accepted run and job IDs, exact commit, decision reason, and
authority URL. The final publication job validates the authority SHA against
its checkout and renders those references in the workflow summary.
The expected SHA is resolved from the checked-out commit, so annotated tag
objects cannot be mistaken for the commit that CI tested.
The release build, archive checksum, Ed25519 signature, signature self-check,
publication, and release-title guard still run on every release.

## Full-validation fallback

Linux installs dependencies and runs `pnpm lint`, `pnpm test`, and
`pnpm coverage` whenever a receipt is missing, stale, failed, incomplete, for a
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

`.github/workflows/verify-receipt-skip.yml` checks out `main` weekly and runs
`test/ci/release-receipt-skip.test.ts`. The suite covers the fast path, stale
and foreign evidence, API-shape failures, ambiguous receipts, and preservation
of the release integrity guards.
