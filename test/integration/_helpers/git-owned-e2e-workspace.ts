import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export interface GitOwnedE2eWorkspace {
  root: string;
  gitRoot: string;
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
    cleanup: () => {
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
