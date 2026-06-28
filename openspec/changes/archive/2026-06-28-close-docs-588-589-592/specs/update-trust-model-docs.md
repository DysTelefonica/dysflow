# Update Trust Model Docs Spec

## Requirement

README update guidance and security docs MUST describe the supported update path as GitHub Release tarball download plus SHA-256 verification, with no git-clone or source-build fallback.

## Scenarios

### Scenario: README update path matches the trust model

Given a user reads the README update section
When they need to understand how `dysflow update` works
Then the section MUST mention the release archive, SHA-256 verification, hard failures, and no source-build/git-clone fallback.

### Scenario: troubleshooting explains verification failures

Given a release asset or checksum is missing or invalid
When a user reads the troubleshooting guidance
Then the docs MUST say the update aborts and the user should retry later or report the release asset/checksum problem rather than build from source.
