/**
 * PR-3 (issue #658) — default-scan `src/` for the `allowedProcedures` prefix
 * list, with a per-module `@dysflow: dangerous` opt-out.
 *
 * The CORE side of this module is pure: no Node I/O imports, no default
 * ports, no builtins beyond the language core. The Node-backed adapter
 * lives in `src/adapters/discovery/allowed-procedures-adapter.ts` and is
 * the only place that touches `node:fs` / `node:fs/promises`. This keeps
 * the architectural ratchet `test/architecture/core-boundary.test.ts`
 * honest (no new direct `node:fs` imports enter `src/core`).
 *
 * The pure kernel (`scanDiscoveredModules`, `procedureMatchesPrefixes`,
 * `moduleIsDangerouslyOptedOut`, `procedureNamesFromSource`) is the same
 * for sync and async callers; both entry points reduce a `textByModule`
 * map through the same function.
 *
 * Default prefixes matched:
 *   - `Test_*`     — TDD atoms (the dysflow green gate)
 *   - `*_Operaciones` — business-logic wrappers that front ORM operations
 */

import { basename, extname, join } from "node:path";

// `node:path` is pure path manipulation (no filesystem access); it is
// explicitly excluded from the architectural ratchet. We use it here so
// the walker produces platform-correct absolute paths regardless of host.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Opt-out directive: a VBA module whose FIRST non-empty source line equals
 * this marker is skipped entirely. The marker must be the literal first
 * non-blank line — comments later in the module file do not opt the module
 * out.
 */
export const DANGEROUS_OPT_OUT_MARKER = "'!** @dysflow: dangerous";

/**
 * Default prefix list scanned when the project config does not supply one.
 * Order matters for diagnostics only — the result is sorted alphabetically
 * downstream. The single-`*` glob pattern is the only shape supported in
 * PR-3 (prefix-or-suffix match). Internal wildcards or full globs are out
 * of scope.
 */
export const DEFAULT_ALLOWED_PROCEDURE_PREFIXES: readonly string[] = ["Test_*", "*_Operaciones"];

// ---------------------------------------------------------------------------
// Ports (interfaces only — adapters supply Node implementations)
// ---------------------------------------------------------------------------

/** A directory entry used to recurse the source tree. */
export interface DiscoveryDirent {
  name: string;
  isFile(): boolean;
  isDirectory(): boolean;
}

/** Minimal async I/O surface needed by the async discovery entry point. */
export interface AllowedProceduresDiscoveryPort {
  readdir(path: string): Promise<readonly DiscoveryDirent[]>;
  readFile(path: string): Promise<string>;
}

/** Minimal sync I/O surface used by `buildProjectConfig` (and tests). */
export interface AllowedProceduresDiscoverySyncPort {
  readdirSync(path: string): readonly DiscoveryDirent[];
  readFileSync(path: string): string;
}

/** Caller-supplied options for the discovery entry points. */
export type DiscoverAllowedProceduresOptions = {
  /** Injected async port (caller-supplied; no default in core). */
  fileSystem: AllowedProceduresDiscoveryPort;
  /**
   * Override the default prefix list. Empty array means "match nothing".
   * Each entry is a single-`*` glob pattern: `Prefix*`, `*Suffix`, or
   * `*`. Internal wildcards are rejected (treated as a literal — never a
   * match) so a misconfigured project fails loudly instead of silently
   * expanding.
   */
  prefixes?: readonly string[];
};

export type DiscoverAllowedProceduresSyncOptions = {
  /** Injected sync port (caller-supplied; no default in core). */
  syncFileSystem: AllowedProceduresDiscoverySyncPort;
  prefixes?: readonly string[];
};

export type AllowedProceduresDiscoveryResult = {
  ok: true;
  /** Matched procedure names, sorted alphabetically, deduplicated. */
  procedures: string[];
  /** Module files (.bas / .cls) that were actually read (basenames). */
  scannedModules: string[];
  /** Module files skipped because they declared the dangerous opt-out (basenames). */
  skippedDangerous: string[];
};

/**
 * Convenience signature used by `buildProjectConfig`: synchronous
 * `(srcRoot) -> readonly string[]`. The composition root (the Node
 * adapter) supplies the implementation; core defaults to a no-op so the
 * function remains unit-testable without filesystem access.
 */
export type DiscoverFromSrcRootSync = (srcRoot: string) => readonly string[];

export const NO_DISCOVERY: DiscoverFromSrcRootSync = () => [];

// ---------------------------------------------------------------------------
// Pure kernel
// ---------------------------------------------------------------------------

const VBA_FILE_EXTENSIONS = new Set([".bas", ".cls"]);

/**
 * `prefix*` / `*suffix` / `*` matching only — wildcards at the start, end,
 * or covering the whole pattern, with exactly one `*`. Anything else
 * (multiple `*`s OR a `*` in the middle of the pattern) is treated as a
 * literal exact match (the prefix list in
 * {@link DEFAULT_ALLOWED_PROCEDURE_PREFIXES} is the only shape we support
 * in PR-3). Internal wildcards would silently expand intent; failing
 * loudly keeps the operator honest.
 */
export function procedureMatchesPrefixes(name: string, prefixes: readonly string[]): boolean {
  for (const raw of prefixes) {
    if (raw === "*") return true;
    const star = raw.indexOf("*");
    if (star === -1) {
      if (name === raw) return true;
      continue;
    }
    if (countOccurrences(raw, "*") !== 1) {
      // Multiple stars (or whatever the case) — out of scope.
      if (name === raw) return true;
      continue;
    }
    // Reject internal wildcards: `prefix*suffix` is treated as a literal
    // exact match. Only leading or trailing single-`*` patterns proceed.
    if (star !== 0 && star !== raw.length - 1) {
      if (name === raw) return true;
      continue;
    }
    const head = raw.slice(0, star);
    const tail = raw.slice(star + 1);
    if (!name.startsWith(head)) continue;
    if (!name.endsWith(tail)) continue;
    return true;
  }
  return false;
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let cursor = 0;
  while (cursor <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, cursor);
    if (index < 0) break;
    count += 1;
    cursor = index + needle.length;
  }
  return count;
}

export function moduleIsDangerouslyOptedOut(source: string): boolean {
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    return trimmed === DANGEROUS_OPT_OUT_MARKER;
  }
  return false;
}

/**
 * Enumerate the public Sub / Function names declared in a single VBA source
 * file. Lines starting with `'` (full-line comment) are skipped; `Rem`
 * comments are skipped; string literals are blanked before matching so
 * `Dim s = "Public Sub Test_X()"` is NOT detected as a declaration. The
 * captured identifier is the procedure name (without parentheses or `As`).
 */
export function procedureNamesFromSource(source: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trimStart();
    if (line.length === 0) continue;
    if (line.startsWith("'")) continue;
    if (/^Rem\b/i.test(line)) continue;
    const withoutStrings = line.replace(/"([^"]|"")*"/g, "''");
    const match = withoutStrings.match(
      /^(?:(?:Public|Private|Friend|Static)[ \t]+)*?(?:Sub|Function)[ \t]+([A-Za-z_][A-Za-z0-9_]*)/i,
    );
    if (match === null) continue;
    const name = match[1];
    if (name === undefined) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    ordered.push(name);
  }
  return ordered;
}

/**
 * Pure reducer: given `{ moduleName -> sourceText }` and a prefix list,
 * yield the discovery result. Lives here so the sync and async entry
 * points share the same scan logic and the same edge-case behaviour.
 */
export function scanDiscoveredModules(
  textByModule: ReadonlyMap<string, string>,
  prefixes: readonly string[],
): AllowedProceduresDiscoveryResult {
  const scannedModules: string[] = [];
  const skippedDangerous: string[] = [];
  const procedureSet = new Set<string>();
  const moduleNames = Array.from(textByModule.keys()).sort((a, b) => a.localeCompare(b));
  for (const moduleName of moduleNames) {
    const source = textByModule.get(moduleName) ?? "";
    if (moduleIsDangerouslyOptedOut(source)) {
      skippedDangerous.push(moduleName);
      continue;
    }
    scannedModules.push(moduleName);
    for (const name of procedureNamesFromSource(source)) {
      if (procedureMatchesPrefixes(name, prefixes)) {
        procedureSet.add(name);
      }
    }
  }
  return {
    ok: true,
    procedures: Array.from(procedureSet).sort((a, b) => a.localeCompare(b)),
    scannedModules,
    skippedDangerous,
  };
}

/**
 * Returns true if the given file name has one of the recognised VBA
 * source extensions. Pure (string check).
 */
export function isVbaSourceFile(fileName: string): boolean {
  return VBA_FILE_EXTENSIONS.has(extname(fileName).toLowerCase());
}

// ---------------------------------------------------------------------------
// Public entry points — ports are caller-supplied; no I/O defaults here.
// The adapter in `src/adapters/discovery/...` provides Node bindings
// PLUS a convenience `DiscoverFromSrcRootSync` implementation that the
// config composition root (the Node adapter) hands to `buildProjectConfig`.
// ---------------------------------------------------------------------------

/**
 * Async discovery. Pure w.r.t. side effects beyond the caller-supplied
 * `fileSystem` port. A missing `srcRoot` returns `ok: true` with empty
 * lists (the caller decides whether an empty default is acceptable).
 */
export async function discoverAllowedProcedures(
  srcRoot: string,
  options: DiscoverAllowedProceduresOptions,
): Promise<AllowedProceduresDiscoveryResult> {
  const prefixes = options.prefixes ?? DEFAULT_ALLOWED_PROCEDURE_PREFIXES;
  const gathered: Array<{ absolutePath: string; moduleName: string }> = [];

  async function visit(dir: string): Promise<void> {
    let entries: readonly DiscoveryDirent[];
    try {
      entries = await options.fileSystem.readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(child);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!isVbaSourceFile(entry.name)) continue;
      gathered.push({ absolutePath: child, moduleName: basename(entry.name) });
    }
  }

  await visit(srcRoot);

  const textByModule = new Map<string, string>();
  for (const entry of gathered) {
    const source = await options.fileSystem.readFile(entry.absolutePath);
    textByModule.set(entry.moduleName, source);
  }
  return scanDiscoveredModules(textByModule, prefixes);
}

/**
 * Sync discovery. Pure w.r.t. side effects beyond the caller-supplied
 * `syncFileSystem` port. A missing `srcRoot` returns `ok: true` with
 * empty lists. `buildProjectConfig` (sync) consumes this entry point via
 * the `DiscoverFromSrcRootSync` injected by the Node adapter.
 */
export function discoverAllowedProceduresSync(
  srcRoot: string,
  options: DiscoverAllowedProceduresSyncOptions,
): AllowedProceduresDiscoveryResult {
  const prefixes = options.prefixes ?? DEFAULT_ALLOWED_PROCEDURE_PREFIXES;
  const gathered: Array<{ absolutePath: string; moduleName: string }> = [];

  function visit(dir: string): void {
    let entries: readonly DiscoveryDirent[];
    try {
      entries = options.syncFileSystem.readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(child);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!isVbaSourceFile(entry.name)) continue;
      gathered.push({ absolutePath: child, moduleName: basename(entry.name) });
    }
  }

  visit(srcRoot);

  const textByModule = new Map<string, string>();
  for (const entry of gathered) {
    const source = options.syncFileSystem.readFileSync(entry.absolutePath);
    textByModule.set(entry.moduleName, source);
  }
  return scanDiscoveredModules(textByModule, prefixes);
}

// `basename` is exposed for downstream helpers that need to derive the
// module name from an absolute path in their own walker implementation.
// Keeps the kernel self-sufficient.
export { basename };
