import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runCommand, runCommandOutput } from "./command-runner.js";

const GITHUB_LATEST_RELEASE_API =
  "https://api.github.com/repos/DysTelefonica/dysflow/releases/latest";

const FETCH_TIMEOUT_MS = 30_000;

/**
 * Trusted Ed25519 public key (SPKI PEM) used to verify the detached `SHA256SUMS.sig`
 * signature published alongside a release. This is the supply-chain trust anchor that
 * raises the update model from "integrity vs transport" to "authenticity vs publisher".
 *
 * The matching private key is stored only as the GitHub Actions secret
 * `RELEASE_SIGNING_KEY`. It must never be committed. A missing or invalid
 * `SHA256SUMS.sig` is a hard failure before checksum entries are trusted.
 * See docs/security/update-trust-model.md.
 */
export const RELEASE_SIGNING_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAG2eAN4jw+x3t90a3ct/spwyMkc3q59M9AvBGtylLO/U=
-----END PUBLIC KEY-----`;

export type ReleaseInfo = {
  version: string;
  tagName?: string;
};

export type PreparedReleasePackage = {
  packageRoot: string;
  commitSha?: string;
  cleanup?: () => Promise<void>;
};

export type ReleaseUpdateProvider = {
  resolveLatestRelease(): Promise<ReleaseInfo>;
  preparePackage(
    release: ReleaseInfo,
    options?: { skipChecksum?: boolean; env?: NodeJS.ProcessEnv },
  ): Promise<PreparedReleasePackage>;
};

type GitHubLatestReleaseResponse = {
  tag_name?: unknown;
  name?: unknown;
};

function normalizeReleaseVersion(value: string): string {
  return value.startsWith("v") ? value.slice(1) : value;
}

export function validateReleaseTagName(tagName: string): string {
  if (!/^v\d+\.\d+\.\d+$/.test(tagName)) {
    throw new Error(`Invalid Dysflow release tag: ${tagName}`);
  }
  return tagName;
}

/**
 * Verifies a detached Ed25519 signature over the SHA256SUMS text against a trusted
 * SPKI-PEM public key. Returns false (never throws) on any malformed input so the
 * caller can treat verification failure as a single hard error.
 */
export function verifyChecksumsSignature(
  checksums: string,
  signatureBase64: string,
  publicKeyPem: string,
): boolean {
  try {
    const publicKey = createPublicKey(publicKeyPem);
    const signature = Buffer.from(signatureBase64, "base64");
    if (signature.length === 0) return false;
    // Ed25519 uses a null algorithm digest with the raw message.
    return cryptoVerify(null, Buffer.from(checksums, "utf8"), publicKey, signature);
  } catch {
    return false;
  }
}

/**
 * Returns true when an archive entry path would escape the extraction root —
 * an absolute path (POSIX, Windows drive-letter, or UNC) or any `..` parent
 * segment. Backslashes are normalized so Windows-style separators are caught
 * regardless of the tar implementation that produced the listing.
 */
function isUnsafeArchiveEntry(entry: string): boolean {
  const normalized = entry.replace(/\\/g, "/");
  if (normalized.startsWith("/")) return true; // absolute POSIX path or UNC (//server/...)
  if (/^[a-zA-Z]:/.test(normalized)) return true; // Windows drive-letter absolute path
  return normalized.split("/").some((segment) => segment === ".."); // parent traversal
}

/**
 * Defense-in-depth against tar path traversal (zip/tar-slip). The release tar.gz
 * is already SHA-256 verified, but a release published from a compromised account
 * could carry traversal entries. We validate the `tar -tzf` listing and refuse to
 * extract if any entry would escape the extraction root, instead of trusting the
 * system tar to reject it.
 *
 * @throws when any entry is an absolute path or contains a `..` segment.
 */
export function assertSafeArchiveEntries(listing: string): void {
  const entries = listing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  for (const entry of entries) {
    if (isUnsafeArchiveEntry(entry)) {
      throw new Error(
        `Refusing to extract release archive: unsafe path entry "${entry}". ` +
          "The archive contains an absolute path or a '..' traversal segment.",
      );
    }
  }
}

export function createGitHubReleaseRequestHeaders(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const token = env.GH_TOKEN ?? env.GITHUB_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    ...(token !== undefined && token.length > 0 ? { Authorization: `Bearer ${token}` } : {}),
    "User-Agent": "dysflow-updater",
  };
}

async function tryResolveGitCommitSha(cwd: string): Promise<string | undefined> {
  try {
    const sha = await runCommandOutput("git", ["rev-parse", "HEAD"], cwd);
    return /^[0-9a-f]{40}$/i.test(sha) ? sha : undefined;
  } catch {
    return undefined;
  }
}

export function createGitHubReleaseUpdateProvider(
  options: { signingPublicKeyPem?: string } = {},
): ReleaseUpdateProvider {
  const signingPublicKeyPem = options.signingPublicKeyPem ?? RELEASE_SIGNING_PUBLIC_KEY_PEM;
  return {
    async resolveLatestRelease(): Promise<ReleaseInfo> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(GITHUB_LATEST_RELEASE_API, {
          headers: createGitHubReleaseRequestHeaders(),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) {
        throw new Error(
          `GitHub latest release lookup failed with HTTP ${response.status}. ` +
            "Verify your GH_TOKEN / GITHUB_TOKEN is valid for private releases, or use unauthenticated requests for public releases.",
        );
      }

      const body = (await response.json()) as GitHubLatestReleaseResponse;
      if (typeof body.tag_name !== "string" || body.tag_name.length === 0) {
        throw new Error("GitHub latest release response did not include tag_name.");
      }
      validateReleaseTagName(body.tag_name);

      return {
        tagName: body.tag_name,
        version: normalizeReleaseVersion(body.tag_name),
      };
    },

    async preparePackage(
      release: ReleaseInfo,
      options?: { skipChecksum?: boolean; env?: NodeJS.ProcessEnv },
    ): Promise<PreparedReleasePackage> {
      const tagName = validateReleaseTagName(release.tagName ?? `v${release.version}`);
      const tempRoot = await mkdtemp(path.join(tmpdir(), "dysflow-update-"));
      const packageRoot = path.join(tempRoot, "source");
      const cleanup = async (): Promise<void> => {
        await rm(tempRoot, { recursive: true, force: true });
      };

      const environment = options?.env ?? process.env;

      try {
        const archiveName = `dysflow-${tagName}.tar.gz`;
        const archiveUrl = `https://github.com/DysTelefonica/dysflow/releases/download/${tagName}/${archiveName}`;
        const checksumsUrl = `https://github.com/DysTelefonica/dysflow/releases/download/${tagName}/SHA256SUMS`;

        // 1. Download archive
        const archiveController = new AbortController();
        const archiveTimeout = setTimeout(() => archiveController.abort(), FETCH_TIMEOUT_MS);
        let archiveResponse: Response;
        try {
          archiveResponse = await fetch(archiveUrl, {
            headers: createGitHubReleaseRequestHeaders(environment),
            signal: archiveController.signal,
          });
        } finally {
          clearTimeout(archiveTimeout);
        }

        if (archiveResponse.status === 404) {
          throw new Error(`Release archive not available for version ${tagName} (HTTP 404).`);
        }

        if (!archiveResponse.ok) {
          throw new Error(
            `Failed to download release archive from ${archiveUrl}: HTTP ${archiveResponse.status}`,
          );
        }

        const archiveBuffer = Buffer.from(await archiveResponse.arrayBuffer());

        // 2. Verification
        if (!options?.skipChecksum) {
          const checksumController = new AbortController();
          const checksumTimeout = setTimeout(() => checksumController.abort(), FETCH_TIMEOUT_MS);
          let checksumsResponse: Response;
          try {
            checksumsResponse = await fetch(checksumsUrl, {
              headers: createGitHubReleaseRequestHeaders(environment),
              signal: checksumController.signal,
            });
          } finally {
            clearTimeout(checksumTimeout);
          }
          if (!checksumsResponse.ok) {
            throw new Error(
              `Failed to download checksums file from ${checksumsUrl}: HTTP ${checksumsResponse.status}. ` +
                "Use --skip-checksum if you want to bypass verification.",
            );
          }
          const checksumsText = await checksumsResponse.text();

          // Authenticity gate: when a signing key is configured, the SHA256SUMS file must
          // carry a valid detached Ed25519 signature from the trusted publisher key. This
          // fails closed — a missing or invalid signature aborts the update. Without it the
          // checksum only proves the archive matches whatever SHA256SUMS was served, which a
          // compromised publisher controls. See docs/security/update-trust-model.md.
          if (signingPublicKeyPem.trim().length > 0) {
            const signatureUrl = `https://github.com/DysTelefonica/dysflow/releases/download/${tagName}/SHA256SUMS.sig`;
            const sigController = new AbortController();
            const sigTimeout = setTimeout(() => sigController.abort(), FETCH_TIMEOUT_MS);
            let sigResponse: Response;
            try {
              sigResponse = await fetch(signatureUrl, {
                headers: createGitHubReleaseRequestHeaders(environment),
                signal: sigController.signal,
              });
            } finally {
              clearTimeout(sigTimeout);
            }
            if (!sigResponse.ok) {
              throw new Error(
                `Failed to download release signature from ${signatureUrl}: HTTP ${sigResponse.status}. ` +
                  "This release is required to be signed; refusing to proceed.",
              );
            }
            const signatureBase64 = (await sigResponse.text()).trim();
            if (!verifyChecksumsSignature(checksumsText, signatureBase64, signingPublicKeyPem)) {
              throw new Error(
                "Release signature verification failed: SHA256SUMS does not match the trusted Dysflow signing key.",
              );
            }
          }

          const lines = checksumsText.split(/\r?\n/);
          let expectedHash: string | undefined;
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const part0 = parts[0];
            const part1 = parts[1];
            if (
              part0 !== undefined &&
              part1 !== undefined &&
              part1.replace(/^\*/, "") === archiveName
            ) {
              expectedHash = part0;
              break;
            }
          }

          if (expectedHash === undefined) {
            throw new Error(`Expected hash for ${archiveName} not found in SHA256SUMS.`);
          }

          const actualHash = createHash("sha256").update(archiveBuffer).digest("hex");
          if (actualHash !== expectedHash) {
            throw new Error(
              `Checksum mismatch for downloaded artifact.\n` +
                `Expected: ${expectedHash}\n` +
                `Got:      ${actualHash}`,
            );
          }
        }

        // 3. Write archive to temp folder
        const archivePath = path.join(tempRoot, archiveName);
        await writeFile(archivePath, archiveBuffer);

        // 4. Inspect archive entries and refuse traversal before extracting (zip/tar-slip).
        const listing = await runCommandOutput("tar", ["-tzf", archivePath], tempRoot, {
          timeoutMs: 60_000,
        });
        assertSafeArchiveEntries(listing);

        // 5. Extract archive
        await mkdir(packageRoot, { recursive: true });
        await runCommand("tar", ["-xzf", archivePath, "-C", packageRoot], tempRoot, {
          timeoutMs: 60_000,
        });

        const commitSha = await tryResolveGitCommitSha(packageRoot);
        return { packageRoot, commitSha, cleanup };
      } catch (error) {
        await cleanup();
        throw error;
      }
    },
  };
}
