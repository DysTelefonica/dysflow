# Install Release Guidance Spec

## Requirement

The README MUST avoid hardcoding a release tag as the "latest" install path and MUST direct production/runtime installs to current GitHub Release assets.

## Scenarios

### Scenario: README points to current release guidance

Given a maintainer opens the README installation section
When they look for the recommended production/runtime install path
Then the docs MUST point to GitHub Releases or the latest release page instead of a fixed version tag.

### Scenario: stale fixed versions do not return

Given a future release changes the package version
When the docs quality gate reads the README
Then it MUST fail if the installation section again claims a fixed tag such as `v1.2.15` or `v1.10.0` is the latest version.
