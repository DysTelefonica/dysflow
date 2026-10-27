export declare const ALLOW_FOREIGN_ACCESS_ENV: string;

export interface AccessProcess {
  pid: number;
  parentPid: number | null;
  creationMs: number | null;
  commandLine: string | null;
}

export interface AccessPreflightResult {
  kind: "access-preflight";
  status: "clean" | "refused" | "allowed" | "probe-unavailable";
  pass: boolean;
  foreignHeadless: AccessProcess[];
  foreignInteractive: AccessProcess[];
  summary: string;
}

export declare function parseAccessProcessTable(json: string): AccessProcess[];
export declare function runAccessPreflight(input?: {
  probe?: () => string;
  ownPid?: number;
  env?: Record<string, string | undefined>;
}): AccessPreflightResult;
