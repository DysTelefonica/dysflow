export declare const DEFAULT_EDIT_TIMEOUT_MS: number;
export declare const DEFAULT_EDIT_ATTEMPTS: number;
export declare const CREATE_ATTEMPTS: number;
export declare const EDIT_TIMEOUT_ENV: string;
export declare const FIXTURE_MARKER_FILE: string;
export declare const FIXTURE_DATABASE_FILES: string[];

export interface EditSpawnResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
  /** Set when `create` still timed out: names the hung start and the elapsed time (#1974). */
  diagnosis?: string;
}

export interface RunAccessEditOptions {
  spawn: (command: string, args: string[], options: { encoding: "utf8"; windowsHide: boolean; timeout: number }) => EditSpawnResult;
  args: string[];
  env: Record<string, string | undefined>;
  command?: string;
  attempts?: number;
  action?: string;
  /** Removes the partial fixture database so a timed-out `create` can be retried once (#1974). */
  resetCreate?: () => void;
  now?: () => number;
}

export interface RemovePartialFixtureDatabaseOptions {
  root: string;
  tmpDir: string;
  exists: (path: string) => boolean;
  remove: (path: string) => void;
}

export declare function resolveEditTimeoutMs(env: Record<string, string | undefined>): number;
export declare function runAccessEdit(options: RunAccessEditOptions): EditSpawnResult;
export declare function removePartialFixtureDatabase(options: RemovePartialFixtureDatabaseOptions): void;
