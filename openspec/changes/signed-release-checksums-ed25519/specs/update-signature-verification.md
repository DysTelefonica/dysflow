# Delta Spec: update-signature-verification

## ADDED Requirements

### Requirement: Signed release checksum manifests

The updater MUST verify a detached Ed25519 signature over `SHA256SUMS` before it trusts any checksum entry from the manifest.

The release process MUST support a secure bootstrap path for a new Ed25519 release-signing keypair when no previous keypair exists. The private key MUST be stored only outside git, preferably as the GitHub Actions secret `RELEASE_SIGNING_KEY`; the public key MAY be stored in repo/config as the updater trust anchor.

#### Scenario: Valid checksum and valid Ed25519 signature passes

- **GIVEN** a release archive `dysflow-<tag>.tar.gz`
- **AND** `SHA256SUMS` contains the archive's SHA-256 digest
- **AND** `SHA256SUMS.sig` is a valid Ed25519 signature over the exact `SHA256SUMS` bytes
- **AND** the updater is configured with the matching trusted Ed25519 public key
- **WHEN** the updater prepares the release package
- **THEN** signature verification MUST pass
- **AND** the updater MAY trust the checksum manifest
- **AND** the archive SHA-256 verification MUST still run before extraction.

#### Scenario: Missing signature fails safely

- **GIVEN** a release archive and checksum manifest are available
- **AND** the updater is configured with a trusted Ed25519 public key
- **AND** `SHA256SUMS.sig` is missing or cannot be downloaded successfully
- **WHEN** the updater prepares the release package
- **THEN** the update MUST abort before checksum entries are trusted
- **AND** the archive MUST NOT be extracted or installed.

#### Scenario: Missing or invalid public key fails safely

- **GIVEN** a release archive, checksum manifest, and signature asset are available
- **AND** the updater has no valid trusted Ed25519 public key configured
- **WHEN** the updater prepares the release package
- **THEN** the update MUST abort before checksum entries are trusted
- **AND** the archive MUST NOT be extracted or installed.

#### Scenario: Invalid signature fails safely

- **GIVEN** a release archive and checksum manifest are available
- **AND** the updater is configured with a trusted Ed25519 public key
- **AND** `SHA256SUMS.sig` is malformed, signed by a different key, or does not match the exact checksum manifest bytes
- **WHEN** the updater prepares the release package
- **THEN** the update MUST abort before checksum entries are trusted
- **AND** the archive MUST NOT be extracted or installed.

#### Scenario: Signature verification precedes checksum trust

- **GIVEN** a release archive, checksum manifest, and signature asset are available
- **AND** the updater is configured with a trusted Ed25519 public key
- **WHEN** the updater prepares the release package
- **THEN** it MUST verify `SHA256SUMS.sig` against the raw `SHA256SUMS` text before searching the manifest for the archive checksum
- **AND** a signature failure MUST prevent checksum parsing from authorizing the archive.

#### Scenario: No git/source fallback is introduced

- **GIVEN** any failure in release archive download, checksum download, signature download, signature validation, checksum lookup, or SHA-256 comparison
- **WHEN** the updater prepares the release package
- **THEN** the update MUST fail closed
- **AND** it MUST NOT invoke `git clone`, build from source, or use any source fallback as a substitute for a verified release archive.

#### Scenario: New keypair bootstrap does not expose the private key

- **GIVEN** an operator needs to bootstrap release signing for the first time
- **WHEN** they run the documented key-generation flow
- **THEN** the private key MUST be generated outside the repository by default
- **AND** the private key MUST be installed as a GitHub Actions secret, not committed
- **AND** only the public key MAY be committed for updater verification.
