#!/usr/bin/env bash
#
# Generates an Ed25519 release-signing keypair for Dysflow update authenticity.
#
#   dysflow-release.key  PRIVATE key (PEM). Keep OFFLINE. Store as the GitHub
#                        Actions secret `RELEASE_SIGNING_KEY` (repo or org level).
#                        NEVER commit it.
#   dysflow-release.pub  PUBLIC key (SPKI PEM). Paste its contents into
#                        `RELEASE_SIGNING_PUBLIC_KEY_PEM` in
#                        src/cli/commands/install/downloader.ts.
#
# Once the secret is set AND the public key is embedded, every release signs
# SHA256SUMS -> SHA256SUMS.sig (see .github/workflows/release.yml) and the
# self-updater verifies it fail-closed. See docs/security/update-trust-model.md.
#
# Usage: .github/scripts/generate-release-signing-key.sh [output-dir]
#
# Without [output-dir], the keypair is written to a new temp directory instead of
# the repository root. This makes the safe path the default: the private key is
# generated outside git, then installed into GitHub Secrets and deleted locally.
set -euo pipefail

if [ "${1:-}" = "" ]; then
  OUT_DIR="$(mktemp -d)"
else
  OUT_DIR="$1"
  mkdir -p "$OUT_DIR"
fi
KEY="$OUT_DIR/dysflow-release.key"
PUB="$OUT_DIR/dysflow-release.pub"

if ! command -v openssl >/dev/null 2>&1; then
  echo "error: openssl is required but was not found on PATH." >&2
  exit 1
fi

if [ -e "$KEY" ] || [ -e "$PUB" ]; then
  echo "error: refusing to overwrite existing $KEY / $PUB." >&2
  exit 1
fi

umask 077
openssl genpkey -algorithm ed25519 -out "$KEY"
chmod 600 "$KEY"
openssl pkey -in "$KEY" -pubout -out "$PUB"

# Sanity check: sign a probe and verify it against the derived public key.
PROBE="$(mktemp)"
SIG="$(mktemp)"
trap 'rm -f "$PROBE" "$SIG"' EXIT
printf 'dysflow-release-key-selftest' > "$PROBE"
openssl pkeyutl -sign -inkey "$KEY" -rawin -in "$PROBE" -out "$SIG"
openssl pkeyutl -verify -pubin -inkey "$PUB" -rawin -in "$PROBE" -sigfile "$SIG" >/dev/null

cat <<EOF
Generated Ed25519 release-signing keypair:
  private : $KEY   (keep offline; store as GitHub secret RELEASE_SIGNING_KEY)
  public  : $PUB   (paste into RELEASE_SIGNING_PUBLIC_KEY_PEM in downloader.ts)

Next steps:
  1. gh secret set RELEASE_SIGNING_KEY < "$KEY"
  2. Paste the contents of "$PUB" into RELEASE_SIGNING_PUBLIC_KEY_PEM
     (src/cli/commands/install/downloader.ts), commit, and cut a release.
  3. Delete the private key from this machine once it is stored as a secret.
EOF
