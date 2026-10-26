// Declarations for the exports the quality-gate tests import from mcp-e2e-record.mjs (#1899).
export declare function walkDescendantsPids(
  rootPid: number,
  probeFn?: () => string,
): number[];

export declare function resetProcessTableSnapshot(): void;
