# Proposal: signed-release-checksums-ed25519

## Intent

Close issue #572 by strengthening the Dysflow self-update trust model: the updater must verify a detached Ed25519 signature over `SHA256SUMS` before it trusts the checksum manifest for a GitHub Release archive.

## Problem

The updater already verifies the downloaded release tarball against `SHA256SUMS`, but a checksum file served from the same compromised release source only proves integrity against that source. It does not prove publisher authenticity.

The codebase contained an Ed25519 verification helper and release-workflow signing support, but the embedded trusted public key was empty. There is no pre-existing release signing keypair to reuse, so the secure path is to generate a new Ed25519 keypair, store the private key only as a GitHub Actions secret, and version the matching public key as the updater trust anchor.

## Scope

- Generate a new release Ed25519 keypair through a safe operator flow.
- Configure the trusted Ed25519 public key in updater code/config documentation.
- Store the matching private key only as the GitHub Actions secret `RELEASE_SIGNING_KEY`.
- Fail closed when `SHA256SUMS.sig` is missing or invalid while signature verification is enabled.
- Verify the detached signature before parsing or trusting checksum entries.
- Preserve the existing SHA-256 archive verification and tar-slip protections.
- Preserve the no git-clone/source-build fallback rule.
- Document the release signing trust model and key handling: public key may be committed; private key must remain outside the repository.

## Out of scope

- Adding any git-clone or source-build update fallback.
- Committing the private release signing key.
- Installing or building into `%LOCALAPPDATA%\dysflow`.

## Keypair decision

The user approved generating and using a new Ed25519 release signing keypair because no prior key exists. The private key is operator-generated, installed as the GitHub Actions secret `RELEASE_SIGNING_KEY`, and then removed from local disk. The public key is stored in `RELEASE_SIGNING_PUBLIC_KEY_PEM` for updater verification.

## Compatibility

Once the public key is configured, releases without `SHA256SUMS.sig` fail closed unless the caller explicitly opts into the existing insecure checksum bypass flow for development/testing. Existing release archives remain installed only through the GitHub Release tarball + signed checksum + SHA-256 path; no fallback is introduced.
