import { rm } from "node:fs/promises";
import { basename } from "node:path";

const RECOVERY_TOKEN_TRIO_SUFFIX = "-recovery-token-trio";
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_INITIAL_DELAY_MS = 100;
const WINDOWS_TRANSIENT_REMOVE_CODES = new Set(["EBUSY", "EPERM", "ENOTEMPTY"]);

const defaultSleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

function errorCode(error) {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

/**
 * Removes only the recovery-token-trio fixture owned by the release suite.
 * Windows can briefly retain a handle to its nested competing worktree after
 * git exits, so transient handle-release errors receive a bounded backoff.
 */
export async function removeRecoveryTokenTrioFixtureWithRetry(fixtureRoot, options = {}) {
  if (!basename(fixtureRoot).endsWith(RECOVERY_TOKEN_TRIO_SUFFIX)) {
    throw new Error(
      `Refusing recovery-token-trio cleanup outside a suite-owned fixture: ${fixtureRoot}`,
    );
  }

  const remove = options.remove ?? rm;
  const sleep = options.sleep ?? defaultSleep;
  const platform = options.platform ?? process.platform;
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const initialDelayMs = Math.max(0, options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await remove(fixtureRoot, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = errorCode(error);
      const lockedPath =
        typeof error === "object" && error !== null && "path" in error
          ? String(error.path)
          : fixtureRoot;
      const retryable =
        platform === "win32" && code !== undefined && WINDOWS_TRANSIENT_REMOVE_CODES.has(code);
      if (!retryable || attempt === maxAttempts) {
        throw new Error(
          `recovery-token-trio cleanup failed after ${attempt} ${attempt === 1 ? "attempt" : "attempts"} ` +
            `(${code ?? "UNKNOWN"}) while removing ${lockedPath}; ` +
            "ensure no process still holds the suite-owned competing worktree, then rerun release E2E",
          { cause: error },
        );
      }
      await sleep(initialDelayMs * 2 ** (attempt - 1));
    }
  }
}
