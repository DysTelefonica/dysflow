import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

export interface GitOwnedE2eWorkspace {
  root: string;
  gitRoot: string;
  /**
   * A dysflow project id unique to this workspace.
   *
   * Every workspace is created as a sibling under the shared `.dysflow-e2e`
   * directory, and product discovery scans those siblings for `.dysflow`
   * configs. A fixed id collides (`PROJECT_ID_COLLISION`) with any sibling a
   * previous run failed to remove, for example when Access still held the
   * frontend lock during cleanup. Deriving the id from the unique directory
   * name keeps each run independent of whatever an aborted run left behind.
   */
  projectId: string;
  cleanup(): void;
}

function isInside(candidate: string, parent: string): boolean {
  const path = relative(parent, candidate);
  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

export function createGitOwnedE2eWorkspace(cwd: string, prefix: string): GitOwnedE2eWorkspace {
  let sourceGitRoot: string;
  try {
    sourceGitRoot = resolve(
      execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd,
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim(),
    );
  } catch {
    throw new Error(`Intended-write E2E workspace requires a real Git worktree: ${cwd}`);
  }

  const safePrefix = prefix.replace(/[^a-z0-9._-]/gi, "-");
  const root = resolve(
    dirname(sourceGitRoot),
    ".dysflow-e2e",
    `${safePrefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const sandboxParent = dirname(root);
  mkdirSync(sandboxParent, { recursive: true });
  execFileSync("git", ["worktree", "add", "--detach", "--no-checkout", root, "HEAD"], {
    cwd: sourceGitRoot,
    windowsHide: true,
    stdio: "ignore",
  });
  const sandboxGitRoot = resolve(
    execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim(),
  );
  if (sandboxGitRoot !== root || !isInside(root, sandboxParent)) {
    throw new Error(`Refusing E2E sandbox without isolated Git worktree ownership: ${root}`);
  }

  return {
    root,
    gitRoot: sandboxGitRoot,
    projectId: `dysflow-${basename(root)}`,
    cleanup: () => {
      // Drop the project config first. It is never held open by Access, so even
      // when a locked frontend defeats the removal below, the leftover directory
      // no longer advertises a project to sibling discovery in later runs.
      try {
        rmSync(join(root, ".dysflow"), {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 200,
        });
      } catch {
        /* The full removal below still runs and reports its own failure. */
      }
      try {
        execFileSync("git", ["worktree", "remove", "--force", root], {
          cwd: sourceGitRoot,
          windowsHide: true,
          stdio: "ignore",
        });
      } finally {
        rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
        try {
          execFileSync("git", ["worktree", "prune"], {
            cwd: sourceGitRoot,
            windowsHide: true,
            stdio: "ignore",
          });
        } catch {
          /* The sandbox bytes are already gone; stale metadata is non-fatal. */
        }
      }
    },
  };
}
