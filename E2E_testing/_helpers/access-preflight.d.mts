export declare const ALLOW_FOREIGN_ACCESS_ENV: string;

export interface AccessProcess {
  pid: number;
  parentPid: number | null;
  creationMs: number | null;
  commandLine: string | null;
}

export interface AccessSnapshot {
  available: boolean;
  processes: AccessProcess[];
  reason: string | null;
}

export interface AccessLeakResult {
  verified: boolean;
  startCount: number | null;
  endCount: number | null;
  leakDelta: number;
  leaked: AccessProcess[];
  unattributed: AccessProcess[];
  newInteractive: AccessProcess[];
  summary: string;
}

export interface AccessPreflightResult {
  kind: "access-preflight";
  status: "clean" | "observed" | "probe-unavailable";
  pass: boolean;
  foreignHeadless: AccessProcess[];
  foreignInteractive: AccessProcess[];
  snapshot: AccessSnapshot;
  summary: string;
}

export declare function parseAccessProcessTable(json: string): AccessProcess[];
export declare function runAccessPreflight(input?: {
  probe?: () => string;
  ownPid?: number;
  env?: Record<string, string | undefined>;
}): AccessPreflightResult;
export declare function snapshotAccessProcesses(input?: { probe?: () => string }): AccessSnapshot;
export declare function computeAccessLeak(input: {
  start: AccessSnapshot;
  end: AccessSnapshot;
  ownership?: AccessOwnership;
}): AccessLeakResult;

export interface AccessOwnership {
  available: boolean;
  identities: Array<{ pid: number; creationMs: number }>;
  reason?: string | null;
}
export declare function readSuiteAccessOwnership(input: {
  projectRoot: string;
  accessPath: string;
  read?: (path: string, encoding: string) => Promise<string>;
}): Promise<AccessOwnership>;
