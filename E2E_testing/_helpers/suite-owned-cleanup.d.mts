type RemoveDirectory = (
  path: string,
  options: { recursive: true; force: true },
) => Promise<void>;

type RecoveryTokenTrioCleanupOptions = {
  remove?: RemoveDirectory;
  sleep?: (delayMs: number) => Promise<void>;
  platform?: NodeJS.Platform;
  maxAttempts?: number;
  initialDelayMs?: number;
};

export function removeRecoveryTokenTrioFixtureWithRetry(
  fixtureRoot: string,
  options?: RecoveryTokenTrioCleanupOptions,
): Promise<void>;
