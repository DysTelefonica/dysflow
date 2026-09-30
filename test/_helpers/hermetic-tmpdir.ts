/**
 * Hermetic OS temp directory for fixtures that must NOT sit inside a Git
 * worktree or a dysflow project.
 *
 * Production discovery deliberately walks UP from a cwd looking for `.git`
 * (`git rev-parse --show-toplevel` with a filesystem-walk fallback) and for
 * `.dysflow/` project configs. That behavior is correct, but it makes any
 * fixture created under `os.tmpdir()` inherit whatever repository or project
 * happens to own the temp directory. On a developer machine whose home is
 * itself a Git repository (`~/.git`) or carries a `~/.dysflow`, the default
 * Windows temp dir (`%USERPROFILE%\AppData\Local\Temp`) is "inside" both, so
 * a "not in any worktree" fixture silently becomes part of the home repo.
 *
 * `useHermeticTmpdir()` points the process temp environment (`TEMP`, `TMP`,
 * `TMPDIR`) at a dedicated `dysflow-hermetic-tests` directory that has no
 * `.git` / `.dysflow` ancestor, for the duration of the calling test file.
 * `os.tmpdir()` reads that environment on every call, so both the fixtures
 * (`mkdtempSync(join(tmpdir(), ...))`) and the product's own OS-temp seam
 * (`ConfigFileSystemPort.tmpdir`, which skips sibling scans under the OS temp)
 * agree on the same hermetic root. Production discovery is left untouched.
 *
 * The base prefers the real `os.tmpdir()` and only falls back to another
 * system location when the real one is inside a repository or project. It
 * fails loudly when no clean base exists instead of letting an ambient
 * ancestor leak into the assertions.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll } from "vitest";

const AMBIENT_MARKERS = [".git", ".dysflow"] as const;
const HERMETIC_DIR_NAME = "dysflow-hermetic-tests";
const TEMP_ENV_KEYS = ["TEMP", "TMP", "TMPDIR"] as const;

/** First ancestor (inclusive) of `path` that owns a `.git` or `.dysflow` entry. */
export function findAmbientAncestor(path: string): string | null {
  let cursor = resolve(path);
  while (true) {
    for (const marker of AMBIENT_MARKERS) {
      const candidate = join(cursor, marker);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
}

function candidateBases(): string[] {
  const candidates: Array<string | undefined> = [tmpdir()];
  if (process.platform === "win32") {
    if (process.env.SystemRoot) candidates.push(join(process.env.SystemRoot, "Temp"));
    candidates.push(process.env.ProgramData, process.env.PUBLIC);
  } else {
    candidates.push("/tmp", "/var/tmp");
  }
  return candidates.filter((value): value is string => typeof value === "string" && value !== "");
}

/** Create (or reuse) the dedicated directory under `base`; prove it is writable and listable. */
function prepareDedicatedDir(base: string): string | null {
  try {
    if (!existsSync(base)) return null;
    const dir = join(base, HERMETIC_DIR_NAME);
    mkdirSync(dir, { recursive: true });
    rmSync(mkdtempSync(join(dir, "probe-")), { recursive: true, force: true });
    readdirSync(dir);
    return dir;
  } catch {
    return null;
  }
}

let cached: string | undefined;

/** A writable, listable directory with no `.git` / `.dysflow` ancestor. */
export function hermeticTmpdir(): string {
  if (cached !== undefined) return cached;
  const rejected: string[] = [];
  for (const base of candidateBases()) {
    const ancestor = findAmbientAncestor(join(base, HERMETIC_DIR_NAME));
    if (ancestor !== null) {
      rejected.push(`${base} (inside ${ancestor})`);
      continue;
    }
    const dir = prepareDedicatedDir(base);
    if (dir === null) {
      rejected.push(`${base} (not writable or not listable)`);
      continue;
    }
    cached = dir;
    return dir;
  }
  throw new Error(
    "No hermetic temp base is available: every candidate is inside a Git repository or dysflow " +
      `project, or is not writable. Rejected: ${rejected.join("; ")}`,
  );
}

/**
 * Register file-scoped hooks that make `os.tmpdir()` return `hermeticTmpdir()`
 * and restore the original temp environment afterwards. Call it once at the
 * top level of a test file.
 */
export function useHermeticTmpdir(): void {
  const saved = new Map<string, string | undefined>();
  beforeAll(() => {
    const dir = hermeticTmpdir();
    for (const key of TEMP_ENV_KEYS) {
      saved.set(key, process.env[key]);
      process.env[key] = dir;
    }
  });
  afterAll(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    saved.clear();
  });
}
