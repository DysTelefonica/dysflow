import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runCommand, runCommandOutput } from "./command-runner.js";

const GITHUB_REPO_URL = "https://github.com/DysTelefonica/dysflow.git";
const GITHUB_LATEST_RELEASE_API =
  "https://api.github.com/repos/DysTelefonica/dysflow/releases/latest";

const FETCH_TIMEOUT_MS = 30_000;

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

async function resolveLatestReleaseWithGh(): Promise<ReleaseInfo> {
  const tagName = await runCommandOutput(
    "gh",
    ["release", "view", "--repo", "DysTelefonica/dysflow", "--json", "tagName", "--jq", ".tagName"],
    process.cwd(),
    { timeoutMs: 30_000 },
  );
  if (tagName.length === 0) {
    throw new Error("gh release view did not return a tagName.");
  }
  validateReleaseTagName(tagName);
  return {
    tagName,
    version: normalizeReleaseVersion(tagName),
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

export function createGitHubReleaseUpdateProvider(): ReleaseUpdateProvider {
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
        try {
          return await resolveLatestReleaseWithGh();
        } catch {
          throw new Error(`GitHub latest release lookup failed with HTTP ${response.status}.`);
        }
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
          const lines = checksumsText.split(/\r?\n/);
          let expectedHash: string | undefined;
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2 && parts[1].replace(/^\*/, "") === archiveName) {
              expectedHash = parts[0];
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

        // 4. Extract archive
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
