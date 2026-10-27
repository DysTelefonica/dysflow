// Declarations for the exports the quality-gate tests import from mcp-e2e-record.mjs (#1899).
export declare function walkDescendantsPids(
  rootPid: number,
  probeFn?: () => string,
  options?: { spawnedAtMs?: number },
): number[];

export declare function isPidOrDescendantAlive(
  pid: number,
  walkDescendantsFn?: (
    rootPid: number,
    probeFn?: () => string,
    options?: { spawnedAtMs?: number },
  ) => number[],
  options?: { spawnedAtMs?: number; verifyIdentity?: boolean; probeFn?: () => string },
): boolean;

export declare function resetProcessTableSnapshot(): void;
