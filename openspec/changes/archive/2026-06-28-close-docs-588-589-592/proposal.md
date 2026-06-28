# close-docs-588-589-592 Proposal

## Intent

Close documentation/security documentation issues #588, #589, and #592 by aligning user-facing docs with the current release and authentication safety contracts.

## Scope

- Replace stale or fixed-version README install guidance with current GitHub Release guidance.
- Align README update/troubleshooting language with the release tarball + SHA-256 trust model.
- Document env-first HTTP authentication with `httpTokenEnv` and `DYSFLOW_HTTP_TOKEN`.
- Add docs quality gates that fail if stale guidance returns.

## Non-goals

- No runtime installer, release workflow, or HTTP API behavior changes.
- No changes to prior OpenSpec archives.

## Approach

Use strict docs TDD: add focused Vitest documentation gates first, confirm they fail against the current docs, then make the smallest README/API/security-doc edits required for each issue.

## Affected docs and capabilities

- `README.md` installation, project config, HTTP auth, and update sections.
- `docs/api/http-api.md` authentication and examples.
- `docs/security/update-trust-model.md` update failure/troubleshooting contract.
- `test/docs/*` docs quality gates.
