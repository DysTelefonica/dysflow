export declare const DEFAULT_EDIT_TIMEOUT_MS: number;
export declare const DEFAULT_EDIT_ATTEMPTS: number;
export declare const EDIT_TIMEOUT_ENV: string;

export interface EditSpawnResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
}

export interface RunAccessEditOptions {
  spawn: (command: string, args: string[], options: { encoding: "utf8"; windowsHide: boolean; timeout: number }) => EditSpawnResult;
  args: string[];
  env: Record<string, string | undefined>;
  command?: string;
  attempts?: number;
}

export declare function resolveEditTimeoutMs(env: Record<string, string | undefined>): number;
export declare function runAccessEdit(options: RunAccessEditOptions): EditSpawnResult;
