/**
 * Filesystem port for `FileAccessOperationRegistry`.
 *
 * Owns the surface of filesystem calls the registry is allowed to make.
 * Lives in `src/core` so the registry code does not need to import
 * `node:fs` directly. The production adapter is
 * `src/adapters/operations/node-registry-file-system.ts` and is wired by
 * default; tests inject a fake to drive the happy / sad / adversarial
 * branches without touching the host filesystem.
 *
 * # Why `writeFile` accepts `{ flag: "wx" }`
 *
 * The atomic lock acquisition in
 * `acquireRegistryMutationLock` uses `writeFile(ownerPath, ownerToken,
 * "utf8", { flag: "wx" })` — the `wx` flag makes the write exclusive
 * (fails with `EEXIST` when the file already exists). That flag is the
 * primitive that gives the registry its mutual-exclusion guarantees on
 * POSIX and Windows. Removing the flag, or only allowing the default
 * `writeFile(path, data, encoding)`, silently breaks the lock — so the
 * port surface keeps `flag?: "wx"` and the Node adapter rejects any
 * other flag value as a `TypeError`.
 */
export interface RegistryFileSystemPort {
  mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  writeFile(path: string, data: string, encoding: "utf8", options?: { flag?: "wx" }): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  rm(path: string, options?: { force?: boolean; recursive?: boolean }): Promise<void>;
  rmdir(path: string): Promise<void>;
  /**
   * Returns `undefined` when the path does not exist — the registry treats
   * missing paths as the "no lock held yet" signal. Any other error surfaces
   * unchanged so the registry can map it to its own error contract.
   */
  stat(path: string): Promise<{ mtimeMs: number } | undefined>;
}
