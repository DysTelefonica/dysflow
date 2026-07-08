/**
 * Issue #779 — Windows-aware source-overlap detection.
 *
 * Export tools (`export_modules`, `export_all`) can overwrite the project's
 * managed source folders if a caller resolves `exportPath` or `destinationRoot`
 * to a directory inside the active source tree. Without an explicit
 * confirmation, the export would silently overwrite the source of truth —
 * a class of accidents the run loop never recovers from.
 *
 * This helper answers "does path `destination` overlap the project's source
 * root or any of its managed source subfolders?" with platform-correct
 * semantics:
 *
 * - **Case-insensitive on Windows.** `C:/project/FORMS/Form_X.frm` and
 *   `c:/project/forms/Form_X.frm` resolve the same directory.
 * - **Normalized slashes.** `C:\project\forms\` and `C:/project/forms/` are
 *   equivalent; the comparator strips trailing separators before comparing.
 * - **Nested-path aware.** If `destination === project / project / forms/...`,
 *   the comparator returns `true` because the destination is INSIDE the
 *   source root.
 * - **POSIX vs Windows roots are never mixed.** A destination `/project/src`
 *   never overlaps a Windows-style source root `C:/project/src`, and vice-versa
 *   — different roots describe different hosts. The lexical comparator
 *   refuses to fold across platform shape.
 * - **No node:path.resolve() inside the comparator.** Resolving paths against
 *   `cwd` would silently coerce a Windows-style relative path under Linux
 *   CI. We normalize lexically instead, mirroring `path-utils.ts`.
 *
 * Pure, dependency-free module — lives in `core/utils` so both
 * `write-execution-policy.ts` (resolution at the MCP boundary) and any
 * future vba-modules-adapter check can share the same primitive.
 */

import { relative, resolve as resolvePosix, win32 } from "node:path";

function isWindowsPath(path: string): boolean {
  // Drive letter (`C:/...`, `c:\...`) is the explicit Windows marker.
  // UNC paths (`\\server\share`) are also Windows — they start with `\\`
  // which `win32.isAbsolute` recognizes and the regex doesn't.
  // NOTE: on a Windows host, `win32.isAbsolute("/project/src")` returns
  // `true` because Node treats forward-slash-rooted paths as Windows
  // absolute too. We deliberately do NOT rely on that — POSIX layouts
  // passed through to a Windows comparator should refuse to fold with a
  // POSIX-shaped source root. Drive letter OR UNC, nothing else.
  if (/^[A-Za-z]:[\\/]/.test(path)) return true;
  if (path.startsWith("\\\\") || path.startsWith("//")) return true;
  return false;
}

function isPosixShape(path: string): boolean {
  // Anything that is NOT a Windows-style absolute path. UNC (`\\host\share`)
  // and Windows drive letters (`C:`) belong to Windows; anything else
  // (POSIX absolute, POSIX relative) is treated as POSIX layout.
  return !isWindowsPath(path);
}

function trimTrailingSeparators(value: string): string {
  let trimmed = value;
  while (trimmed.length > 1 && (trimmed.endsWith("/") || trimmed.endsWith("\\"))) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}

/**
 * Normalize a path string for lexically-comparing equality. Strips trailing
 * separators, collapses the empty string to `"."`, and on Windows lowercases
 * the result so `C:/Project/FORMS` ≡ `c:/project/forms`. Returns the
 * input verbatim for empty values so callers can short-circuit.
 *
 * Returns `undefined` when the input is empty or whitespace-only so the
 * caller can treat "nothing to compare" as a graceful no-overlap rather than
 * a `path.relative(".")` quirk.
 */
function normalizeLexical(path: string): string | undefined {
  const trimmed = trimTrailingSeparators(path.trim());
  if (trimmed.length === 0) return undefined;

  if (isWindowsPath(trimmed)) {
    // Lowercase drive letter + the rest so the comparison is case-insensitive
    // on Windows. Replace backslashes with forward slashes for a stable key.
    let normalized = trimmed.replace(/\\/g, "/").toLowerCase();
    if (normalized.length > 2 && normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  }
  return trimmed;
}

/**
 * The project's standard managed source folders (see
 * `vba-modules-adapter.ts` managedFolders, `tools.ts` resolveModuleSource).
 * Used to detect when a destination falls inside a subfolder that owns the
 * canonical VBA source layout.
 */
export const DEFAULT_MANAGED_SOURCE_FOLDERS = ["modules", "classes", "forms", "reports"] as const;

/**
 * Compute the candidate directory set the comparator checks against the
 * destination. Returns:
 *
 * - `activeSourceRoot` normalized lexically.
 * - Each `activeSourceRoot/<managedFolder>` normalized lexically.
 *
 * Returns an empty array when the source root is empty/whitespace (the
 * caller then short-circuits and reports "no overlap"). Order matters only
 * for error messages — overlap detection is symmetric.
 */
export function buildOverlapCandidates(
  activeSourceRoot: string,
  managedFolders: readonly string[] = DEFAULT_MANAGED_SOURCE_FOLDERS,
): readonly string[] {
  const root = normalizeLexical(activeSourceRoot);
  if (root === undefined) return [];
  const out: string[] = [root];
  for (const folder of managedFolders) {
    out.push(`${root}/${folder}`);
  }
  return out;
}

/**
 * Returns `true` if `destination` resolves to a directory that is the
 * `activeSourceRoot`, a subfolder of it (including a managed source folder),
 * or EQUAL to a managed source folder under it.
 *
 * Rules:
 *
 * 1. Empty/whitespace destination or source root → `false`.
 * 2. POSIX destination vs Windows source root (or vice-versa) → `false`
 *    (different host). The comparator refuses to fold across shapes.
 * 3. Same shape (both Windows or both POSIX) → lexical comparison with the
 *    rule "child equal or nested under parent". Case-insensitive on Windows.
 *
 * ## Behavior table (representative)
 *
 * | destination                | sourceRoot        | overlap? | reason                                |
 * | -------------------------- | ----------------- | -------- | ------------------------------------- |
 * | `c:/project/src`           | `C:/project/src`  | yes      | equal                                 |
 * | `c:/project/src/forms`     | `C:/project/src`  | yes      | managed folder                        |
 * | `C:/PROJECT/SRC/FORMS/x`   | `c:/project/src`  | yes      | nested, case-insensitive              |
 * | `c:/project/src/nested/a`  | `c:/project/src`  | yes      | nested under source root              |
 * | `c:/otherproject/forms`    | `c:/project/src`  | no       | sibling project                       |
 * | `/project/src/forms`       | `C:/project/src`  | no       | POSIX vs Windows — different hosts    |
 * | empty / whitespace         | `c:/project/src`  | no       | empty destination cannot overlap      |
 */
export function pathOverlapsSourceRoot(
  destination: string,
  activeSourceRoot: string,
  managedFolders: readonly string[] = DEFAULT_MANAGED_SOURCE_FOLDERS,
): boolean {
  const trimmedDestination = destination.trim();
  const trimmedRoot = activeSourceRoot.trim();
  if (trimmedDestination.length === 0 || trimmedRoot.length === 0) return false;
  const candidates = buildOverlapCandidates(trimmedRoot, managedFolders);
  if (candidates.length === 0) return false;
  const destinationNormalized = normalizeLexical(trimmedDestination);
  if (destinationNormalized === undefined) return false;

  // POSIX vs Windows layout refuse to fold. Both inputs must already be in
  // matching shape so the lexical traversal below produces a sane relative.
  const destinationIsWindows = isWindowsPath(destinationNormalized);
  const firstCandidate = candidates[0];
  if (firstCandidate === undefined) return false;
  const sourceIsWindows = isWindowsPath(firstCandidate);
  if (destinationIsWindows !== sourceIsWindows) return false;

  return candidates.some((candidate) =>
    isPathEqualOrNested(destinationNormalized, candidate, sourceIsWindows),
  );
}

/**
 * Returns true when `child` is equal to `parent` or a path nested under
 * `parent`. Both arguments MUST already be lexically normalized (see
 * `normalizeLexical`). The comparison uses `path.relative` so cross-platform
 * lexical traversal is correct (`a/b/c` is a child of `a`, `a/b` is a child
 * of `a`, and `b/c` is NOT a child of `a`).
 *
 * `windowsMode` selects the path backend; passing the wrong one would
 * silently swap `\` semantics.
 */
function isPathEqualOrNested(child: string, parent: string, windowsMode: boolean): boolean {
  if (child === parent) return true;
  const rel = computeRelative(child, parent, windowsMode);
  if (rel === "") return true;
  if (rel.startsWith("..")) return false;
  if (isAbsoluteStyle(rel, windowsMode)) return false;
  return rel.length > 0;
}

function computeRelative(child: string, parent: string, windowsMode: boolean): string {
  if (windowsMode) {
    return win32.relative(parent, child);
  }
  return relative(parent, child);
}

function isAbsoluteStyle(value: string, windowsMode: boolean): boolean {
  return windowsMode
    ? win32.isAbsolute(value)
    : resolvePosix(value) === value && value.startsWith("/");
}

// Internal helpers — kept module-local for tests; export a tiny `__testing`
// surface so the test suite can pin the normalization contract without
// depending on private state.
export const __testing = {
  normalizeLexical,
  isPathEqualOrNested,
  computeRelative,
  isWindowsPath,
  isPosixShape,
};

// `node:path` re-exports kept narrow so callers building candidate paths can
// rely on the same normalization the comparator uses. The `path-containment.ts`
// style stays consistent across the codebase.
export { resolvePosix as resolvePosixStyle, win32 as resolveWin32Style };
