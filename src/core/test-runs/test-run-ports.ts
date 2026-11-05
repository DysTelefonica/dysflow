/**
 * Issue #1993 — the I/O a detached test run needs, as ports so the run store
 * stays free of `node:fs` and process probing. Production adapters live in
 * `src/adapters/test-runs/`; tests drive the store through a real temporary
 * directory and a fake process probe.
 */
export interface TestRunFileSystemPort {
  mkdir(path: string): Promise<void>;
  /** The file's text, or `null` when it does not exist. */
  readText(path: string): Promise<string | null>;
  /** The last `maxBytes` of the file, or `null` when it does not exist. */
  readTextTail(path: string, maxBytes: number): Promise<string | null>;
  /** Write through a temporary file and a rename, so a reader never sees a partial file. */
  writeAtomic(path: string, text: string): Promise<void>;
  /**
   * Create `path` with `text` only when it does not exist yet, atomically:
   * the file appears complete or not at all. `false` when it already exists.
   */
  createExclusive(path: string, text: string): Promise<boolean>;
  /** Rename `from` to `to`; `false` when `from` no longer exists. */
  rename(from: string, to: string): Promise<boolean>;
  /** Remove a file; a missing file is not an error. */
  removeFile(path: string): Promise<void>;
  /** Remove a directory tree; a missing directory is not an error. */
  removeTree(path: string): Promise<void>;
  /** Names of the directories directly under `path`; empty when it does not exist. */
  listDirectories(path: string): Promise<string[]>;
}

export type ProcessProbeResult = { alive: false } | { alive: true; startTime: string | null };

/** Tells whether a PID is running, and since when, so a recycled PID is never mistaken for it. */
export interface RunnerProcessProbe {
  inspect(pid: number): Promise<ProcessProbeResult>;
}
