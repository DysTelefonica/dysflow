import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
// Resolved out of the package root, not out of `src`. `outDir: dist` and
// `rootDir: src` sit at the same depth, so this specifier points at
// `<packageRoot>/scripts/` identically before and after compilation, and
// `scripts/` ships inside the release archive.
import { tarForceLocalArgsFromVersion } from "../../../../scripts/tar-force-local.mjs";
import { CHANNEL_ERROR_CODES, type InstallChannel, TRUST_MODEL_DOC } from "./channel.js";
import { runCommand, runCommandOutput } from "./command-runner.js";
import {
  isPrereleaseTagName,
  isValidReleaseTagName,
  normalizeReleaseVersion,
  validateReleaseTagName,
} from "./validate-tag-name.js";

const GITHUB_REPO_SLUG = "DysTelefonica/dysflow";
const GITHUB_LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO_SLUG}/releases/latest`;
const GITHUB_RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO_SLUG}/releases?per_page=50`;
const GITHUB_MAIN_COMMIT_API = `https://api.github.com/repos/${GITHUB_REPO_SLUG}/commits/main`;
const GITHUB_MAIN_ARCHIVE_URL = `https://github.com/${GITHUB_REPO_SLUG}/archive/refs/heads/main.tar.gz`;

function releaseAssetUrl(tagName: string, assetName: string): string {
  return `https://github.com/${GITHUB_REPO_SLUG}/releases/download/${tagName}/${assetName}`;
}

const FETCH_TIMEOUT_MS = 30_000;
const TAR_TIMEOUT_MS = 60_000;
/** A cold `pnpm install` over the full dev graph is minutes, not seconds. */
const SOURCE_INSTALL_TIMEOUT_MS = 900_000;
/** `tsc -p tsconfig.json` over the whole tree. */
const SOURCE_BUILD_TIMEOUT_MS = 600_000;

// `validateReleaseTagName` moved to ./validate-tag-name.ts (#1521). Re-exported
// here because it is part of the published `src/cli/commands/install.ts` surface.
export {
  isPrereleaseTagName,
  isStableReleaseTagName,
  isValidReleaseTagName,
  RELEASE_TAG_PATTERN,
  validateReleaseTagName,
} from "./validate-tag-name.js";

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
  commitSha?: string;
};

export type PreparedReleasePackage = {
  packageRoot: string;
  commitSha?: string;
  cleanup?: () => Promise<void>;
};

export type ReleaseUpdateProvider = {
  /** Which channel this provider speaks for; absent on legacy/test doubles. */
  channel?: InstallChannel;
  /**
   * True when the channel tracks a moving ref (`main`) whose `version` is a
   * moniker rather than a comparable semver, so the caller must always overlay
   * instead of comparing versions.
   */
  isRolling?: boolean;
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

type GitHubReleaseListEntry = {
  tag_name?: unknown;
  prerelease?: unknown;
  draft?: unknown;
};

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
 * Every channel runs this guard, including the unverified `main` branch archive —
 * that archive has no checksum at all, so the listing check is its only structural
 * defense.
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

async function fetchWithTimeout(url: string, env: NodeJS.ProcessEnv): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: createGitHubReleaseRequestHeaders(env),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function tryResolveGitCommitSha(cwd: string): Promise<string | undefined> {
  try {
    const sha = await runCommandOutput("git", ["rev-parse", "HEAD"], cwd);
    return /^[0-9a-f]{40}$/i.test(sha) ? sha : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `tar --version` probed through the same command-runner seam as every other
 * subprocess here, so tests that stub the process boundary keep stubbing one
 * thing. GNU tar needs `--force-local` for Windows drive-letter paths (#1390).
 */
async function resolveForceLocalArgs(cwd: string): Promise<string[]> {
  return tarForceLocalArgsFromVersion(
    await runCommandOutput("tar", ["--version"], cwd, { timeoutMs: 10_000 }).catch(() => ""),
  );
}

/**
 * Writes an already-downloaded archive to disk, refuses traversal entries, and
 * extracts it. Shared by every channel so the archive-traversal guard and the
 * GNU-tar `--force-local` handling (#1390) can never diverge per channel.
 *
 * Extraction runs with `destination` as the child's cwd instead of passing
 * `-C destination`: under `--force-local` GNU tar escapes the drive colon in a
 * `-C` argument too, so at most one absolute path may be passed.
 */
async function extractArchiveGuarded(input: {
  archiveBuffer: Buffer;
  archivePath: string;
  workingDir: string;
  destination: string;
}): Promise<void> {
  await writeFile(input.archivePath, input.archiveBuffer);
  const forceLocal = await resolveForceLocalArgs(input.workingDir);
  const listing = await runCommandOutput(
    "tar",
    [...forceLocal, "-tzf", input.archivePath],
    input.workingDir,
    { timeoutMs: TAR_TIMEOUT_MS },
  );
  assertSafeArchiveEntries(listing);

  await mkdir(input.destination, { recursive: true });
  await runCommand("tar", [...forceLocal, "-xzf", input.archivePath], input.destination, {
    timeoutMs: TAR_TIMEOUT_MS,
  });
}

/**
 * Downloads a published release tarball and verifies it.
 *
 * `requireSignature` is what separates `stable` from `beta`: the stable channel
 * demands a valid detached Ed25519 signature over SHA256SUMS before a single
 * checksum entry is trusted, while `beta` verifies SHA-256 against the published
 * SHA256SUMS only, because prereleases are not covered by the trust anchor.
 */
async function prepareReleaseTarball(input: {
  tagName: string;
  requireSignature: boolean;
  signingPublicKeyPem: string;
  skipChecksum: boolean;
  env: NodeJS.ProcessEnv;
}): Promise<PreparedReleasePackage> {
  const tagName = validateReleaseTagName(input.tagName);
  const tempRoot = await mkdtemp(path.join(tmpdir(), "dysflow-update-"));
  const packageRoot = path.join(tempRoot, "source");
  const cleanup = async (): Promise<void> => {
    await rm(tempRoot, { recursive: true, force: true });
  };

  try {
    const archiveName = `dysflow-${tagName}.tar.gz`;
    const archiveUrl = releaseAssetUrl(tagName, archiveName);
    const checksumsUrl = releaseAssetUrl(tagName, "SHA256SUMS");

    // 1. Download archive
    const archiveResponse = await fetchWithTimeout(archiveUrl, input.env);
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
    if (!input.skipChecksum) {
      const checksumsResponse = await fetchWithTimeout(checksumsUrl, input.env);
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
      if (input.requireSignature && input.signingPublicKeyPem.trim().length > 0) {
        const signatureUrl = releaseAssetUrl(tagName, "SHA256SUMS.sig");
        const sigResponse = await fetchWithTimeout(signatureUrl, input.env);
        if (!sigResponse.ok) {
          throw new Error(
            `Failed to download release signature from ${signatureUrl}: HTTP ${sigResponse.status}. ` +
              "This release is required to be signed; refusing to proceed.",
          );
        }
        const signatureBase64 = (await sigResponse.text()).trim();
        if (!verifyChecksumsSignature(checksumsText, signatureBase64, input.signingPublicKeyPem)) {
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

    // 3-5. Write, refuse traversal entries, extract.
    await extractArchiveGuarded({
      archiveBuffer,
      archivePath: path.join(tempRoot, archiveName),
      workingDir: tempRoot,
      destination: packageRoot,
    });

    const commitSha = await tryResolveGitCommitSha(packageRoot);
    return { packageRoot, commitSha, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/**
 * The `stable` channel: `releases/latest`, Ed25519-signed SHA256SUMS, then
 * SHA-256. This is the pre-#1521 behavior, unchanged.
 */
export function createStableGitHubReleaseProvider(
  options: { signingPublicKeyPem?: string } = {},
): ReleaseUpdateProvider {
  const signingPublicKeyPem = options.signingPublicKeyPem ?? RELEASE_SIGNING_PUBLIC_KEY_PEM;
  return {
    channel: "stable",
    async resolveLatestRelease(): Promise<ReleaseInfo> {
      const response = await fetchWithTimeout(GITHUB_LATEST_RELEASE_API, process.env);
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
      preparationOptions?: { skipChecksum?: boolean; env?: NodeJS.ProcessEnv },
    ): Promise<PreparedReleasePackage> {
      return prepareReleaseTarball({
        tagName: release.tagName ?? `v${release.version}`,
        requireSignature: true,
        signingPublicKeyPem,
        skipChecksum: preparationOptions?.skipChecksum === true,
        env: preparationOptions?.env ?? process.env,
      });
    },
  };
}

/**
 * Back-compat alias. `createGitHubReleaseUpdateProvider()` has always meant the
 * signed stable channel and keeps meaning exactly that.
 */
export function createGitHubReleaseUpdateProvider(
  options: { signingPublicKeyPem?: string } = {},
): ReleaseUpdateProvider {
  return createStableGitHubReleaseProvider(options);
}

/**
 * The `beta` channel: the newest published prerelease tag matching the relaxed
 * tag grammar. Its assets carry a SHA256SUMS but are NOT covered by the Ed25519
 * trust anchor, so verification stops at SHA-256 and the caller must have passed
 * the `DYSFLOW_ALLOW_INSECURE_UPDATE` gate to get here.
 */
export function createPrereleaseGitHubReleaseProvider(): ReleaseUpdateProvider {
  return {
    channel: "beta",
    async resolveLatestRelease(): Promise<ReleaseInfo> {
      const response = await fetchWithTimeout(GITHUB_RELEASES_API, process.env);
      if (!response.ok) {
        throw new Error(
          `GitHub release listing failed with HTTP ${response.status}. ` +
            "Verify your GH_TOKEN / GITHUB_TOKEN is valid for private releases, or use unauthenticated requests for public releases.",
        );
      }

      const body = (await response.json()) as unknown;
      const entries: GitHubReleaseListEntry[] = Array.isArray(body)
        ? (body as GitHubReleaseListEntry[])
        : [];

      // GitHub returns releases newest-first; take the first published entry
      // whose tag is a well-formed prerelease tag.
      for (const entry of entries) {
        if (entry.draft === true) continue;
        const tagName = entry.tag_name;
        if (typeof tagName !== "string") continue;
        if (!isValidReleaseTagName(tagName) || !isPrereleaseTagName(tagName)) continue;
        return { tagName, version: normalizeReleaseVersion(tagName) };
      }

      throw new Error(
        `${CHANNEL_ERROR_CODES.prereleaseTagNotFound}: no published prerelease tag matched ` +
          `the Dysflow tag grammar (vX.Y.Z-{rc,beta,alpha,prerelease}.N). ` +
          `Use --channel stable, or wait for a prerelease to be published. See ${TRUST_MODEL_DOC}.`,
      );
    },

    async preparePackage(
      release: ReleaseInfo,
      preparationOptions?: { skipChecksum?: boolean; env?: NodeJS.ProcessEnv },
    ): Promise<PreparedReleasePackage> {
      return prepareReleaseTarball({
        tagName: release.tagName ?? `v${release.version}`,
        // Prereleases are published without the release trust anchor. Requiring
        // a signature here would make the channel permanently unusable rather
        // than merely unsigned; the insecure gate is what covers this risk.
        requireSignature: false,
        signingPublicKeyPem: "",
        // The gate rejects --skip-checksum on this channel, so SHA-256 always runs.
        skipChecksum: preparationOptions?.skipChecksum === true,
        env: preparationOptions?.env ?? process.env,
      });
    },
  };
}

/** Locates the single top-level directory a GitHub branch archive extracts into. */
async function resolveSingleExtractedRoot(extractionDir: string): Promise<string> {
  const entries = await readdir(extractionDir, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());
  const only = directories[0];
  if (directories.length !== 1 || only === undefined) {
    throw new Error(
      `Unexpected branch archive layout: expected exactly one top-level directory, found ${directories.length}.`,
    );
  }
  return path.join(extractionDir, only.name);
}

/**
 * The `main` channel: the repository source at `refs/heads/main`.
 *
 * GitHub publishes NO SHA256SUMS for a branch archive and its bytes are not
 * reproducible, so there is nothing to verify against — this channel is
 * unverified by design and is unreachable without
 * `DYSFLOW_ALLOW_INSECURE_UPDATE=1`. See docs/security/update-trust-model.md.
 *
 * The archive carries source, not the built package `installRuntime` expects,
 * so the provider reproduces the release-tarball shape locally: `pnpm install`
 * then `pnpm build`, leaving `dist/`, `scripts/`, `skills/`, `package.json`,
 * and `pnpm-lock.yaml` in the returned package root — the same entries
 * `.github/scripts/create-release-archive.mjs` packs for a release.
 */
export function createMainBranchArchiveProvider(): ReleaseUpdateProvider {
  return {
    channel: "main",
    isRolling: true,
    async resolveLatestRelease(): Promise<ReleaseInfo> {
      // Best-effort: the commit sha is recorded in install state so an operator
      // can tell which HEAD they are running. A lookup failure must not block a
      // channel whose whole point is tracking an unpublished ref.
      const commitSha = await fetchWithTimeout(GITHUB_MAIN_COMMIT_API, process.env)
        .then(async (response) => {
          if (!response.ok) return undefined;
          const body = (await response.json()) as { sha?: unknown };
          return typeof body.sha === "string" && /^[0-9a-f]{7,40}$/i.test(body.sha)
            ? body.sha
            : undefined;
        })
        .catch(() => undefined);

      // `version` is a moniker, not semver: `isRolling` tells the caller to
      // overlay unconditionally instead of comparing it against the installed
      // version.
      return { version: "main", ...(commitSha === undefined ? {} : { commitSha }) };
    },

    async preparePackage(
      release: ReleaseInfo,
      preparationOptions?: { skipChecksum?: boolean; env?: NodeJS.ProcessEnv },
    ): Promise<PreparedReleasePackage> {
      const env = preparationOptions?.env ?? process.env;
      const tempRoot = await mkdtemp(path.join(tmpdir(), "dysflow-main-"));
      const extractionDir = path.join(tempRoot, "source");
      const cleanup = async (): Promise<void> => {
        await rm(tempRoot, { recursive: true, force: true });
      };

      try {
        const response = await fetchWithTimeout(GITHUB_MAIN_ARCHIVE_URL, env);
        if (!response.ok) {
          throw new Error(
            `Failed to download main branch archive from ${GITHUB_MAIN_ARCHIVE_URL}: HTTP ${response.status}`,
          );
        }
        const archiveBuffer = Buffer.from(await response.arrayBuffer());

        await extractArchiveGuarded({
          archiveBuffer,
          archivePath: path.join(tempRoot, "dysflow-main.tar.gz"),
          workingDir: tempRoot,
          destination: extractionDir,
        });

        const packageRoot = await resolveSingleExtractedRoot(extractionDir);

        // Reproduce the release-tarball shape locally. `--ignore-scripts` keeps
        // lifecycle hooks from the downloaded source out of the install, and
        // `--frozen-lockfile` pins the dev graph to the lockfile that shipped
        // with the branch.
        await runCommand(
          "pnpm",
          ["install", "--ignore-scripts", "--frozen-lockfile"],
          packageRoot,
          {
            timeoutMs: SOURCE_INSTALL_TIMEOUT_MS,
          },
        );
        await runCommand("pnpm", ["run", "build"], packageRoot, {
          timeoutMs: SOURCE_BUILD_TIMEOUT_MS,
        });

        const commitSha = release.commitSha ?? (await tryResolveGitCommitSha(packageRoot));
        return { packageRoot, ...(commitSha === undefined ? {} : { commitSha }), cleanup };
      } catch (error) {
        await cleanup();
        throw error;
      }
    },
  };
}

/** Maps a resolved channel to the provider that speaks for it. */
export function createReleaseUpdateProviderForChannel(
  channel: InstallChannel,
  options: { signingPublicKeyPem?: string } = {},
): ReleaseUpdateProvider {
  switch (channel) {
    case "beta":
      return createPrereleaseGitHubReleaseProvider();
    case "main":
      return createMainBranchArchiveProvider();
    default:
      return createStableGitHubReleaseProvider(options);
  }
}
