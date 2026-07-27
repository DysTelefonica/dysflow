/**
 * Issue #1179 — auto-detect the active git worktree from a process cwd.
 *
 * The MCP process is spawned from a fixed cwd; the consumer's OpenCode session
 * may operate from a sibling worktree inside the same repo. Per the #1092
 * contract, the current Git worktree is the implicit/default context — the
 * resolver must therefore walk up from the cwd to the worktree toplevel
 * before deciding which `.dysflow/project.json` to consult.
 *
 * The resolver uses `git rev-parse --show-toplevel` when git is available and
 * the cwd is inside a real worktree. When git is unavailable (or the cwd is
 * not inside a worktree), it falls back to a filesystem walk that looks for
 * a `.git` entry (file or directory) — the same shape `git worktree` writes
 * for both linked worktrees and the main worktree. The two answers are
 * equivalent for the worktree-of-cwd case; the fallback is just friendlier
 * to test fixtures and minimal Windows containers without a git binary.
 *
 * The port-injection seam lets tests swap the git invocation for a fixture
 * without spawning a real process. The default port uses
 * `execFileSync("git", ["rev-parse", "--show-toplevel"], ...)`; if any layer
 * needs to re-implement the heuristic later (e.g. honour
 * `GIT_DIR`/`GIT_WORK_TREE` env vars), only the port changes.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface WorktreeResolverPort {
  /**
   * Return the worktree toplevel for `cwd`, or `null` when `cwd` is not
   * inside a git worktree. The default port uses `git rev-parse
   * --show-toplevel` with a filesystem-walk fallback.
   */
  resolveToplevel(cwd: string): string | null;
}

/**
 * Default port: spawn `git rev-parse --show-toplevel` for the cwd, falling
 * back to a filesystem walk that looks for `.git` (entry-point + linked
 * worktrees). The fallback is async-safe and never throws.
 */
export const defaultWorktreeResolver: WorktreeResolverPort = {
  resolveToplevel(cwd: string): string | null {
    const resolved = resolve(cwd);
    try {
      const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd: resolved,
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const trimmed = out.trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch {
      return walkUpForGit(resolved);
    }
  },
};

function walkUpForGit(cwd: string): string | null {
  let cursor = resolve(cwd);
  while (true) {
    if (existsSync(join(cursor, ".git"))) return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
}

/**
 * Resolve the active worktree toplevel for `cwd`. Returns the absolute path
 * of the worktree the cwd sits inside, or `null` when the cwd is not inside
 * any git worktree. Per #1179, every project-target resolver uses this
 * helper so the implicit context is the worktree, not the spawn cwd.
 */
export function resolveActiveWorktreeRoot(
  cwd: string,
  port: WorktreeResolverPort = defaultWorktreeResolver,
): string | null {
  return port.resolveToplevel(cwd);
}
