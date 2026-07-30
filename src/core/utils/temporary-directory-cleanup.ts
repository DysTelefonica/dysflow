type RemoveDirectory = (path: string, options: { recursive: true; force: true }) => Promise<void>;

type TemporaryDirectoryCleanupOptions = {
  remove: RemoveDirectory;
  sleep?: (delayMs: number) => Promise<void>;
  maxAttempts?: number;
  initialDelayMs?: number;
};

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_INITIAL_DELAY_MS = 25;
const RETRYABLE_CODES = new Set(["EBUSY", "EPERM"]);

export class TemporaryDirectoryCleanupError extends Error {
  readonly code = "TEMP_CLEANUP_FAILED";

  constructor(
    readonly causeCode: string | undefined,
    readonly attempts: number,
  ) {
    super(
      `TEMP_CLEANUP_FAILED: unable to remove the temporary directory after ${attempts} attempt(s).`,
    );
    this.name = "TemporaryDirectoryCleanupError";
  }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

const defaultSleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

/**
 * Removes a disposable directory with bounded exponential backoff for the
 * delayed handle-release errors Windows reports as EBUSY or EPERM.
 */
export async function removeTemporaryDirectoryWithRetry(
  path: string,
  options: TemporaryDirectoryCleanupOptions,
): Promise<void> {
  const remove = options.remove;
  const sleep = options.sleep ?? defaultSleep;
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const initialDelayMs = Math.max(0, options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await remove(path, { recursive: true, force: true });
      return;
    } catch (error) {
      const causeCode = errorCode(error);
      const retryable = causeCode !== undefined && RETRYABLE_CODES.has(causeCode);
      if (!retryable || attempt === maxAttempts) {
        throw new TemporaryDirectoryCleanupError(causeCode, attempt);
      }
      await sleep(initialDelayMs * 2 ** (attempt - 1));
    }
  }
}
