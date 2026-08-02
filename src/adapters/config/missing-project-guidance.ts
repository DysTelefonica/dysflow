import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { WorktreeConfigRemediation } from "../../core/contracts/remediation.js";

const FIELD_DESCRIPTIONS = {
  frontendFile: "Basename of the Access frontend in this worktree.",
  backendPath: "Path to the linked Access backend, when the project uses one.",
  destinationRoot: "Root directory where Dysflow reads and writes exported sources.",
  "capabilities.allowWrites": "Whether write-class tools may modify project assets.",
  "capabilities.writeExecutionPolicy": "Default write intent policy for omitted apply flags.",
  projectId: "Stable project identity stored as the config's id field.",
} as const;

export type WorktreeConfigCandidate = { root: string; branch: string };

export function buildMissingProjectConfigRemediation(
  cwdInput: string,
  candidates?: readonly WorktreeConfigCandidate[],
): WorktreeConfigRemediation {
  const cwd = resolve(cwdInput);
  const displayCwd = cwd.replaceAll("\\", "/");
  const setup = `dysflow setup --cwd '${cwd}' --apply --project-id '<id>' --access-path '<path>'`;
  const recoveryCommands: string[] = [];

  if (existsSync(join(cwd, ".dysflow.bak"))) {
    recoveryCommands.push("mv .dysflow.bak .dysflow");
  }

  const originReference = findSiblingConfigReference(cwd, candidates);
  if (originReference !== null) recoveryCommands.push(originReference);

  return {
    kind: "worktree-config",
    description:
      `No per-worktree .dysflow/project.json was found. Run \`dysflow setup --cwd ${displayCwd} --apply --project-id <id> --access-path <path>\` ` +
      "or restore the config, then fill the required project fields.",
    command: { value: setup, cwd },
    mcpTool: {
      name: "setup_project",
      input: { cwd, projectId: "<id>", frontendFile: "<basename.accdb>", apply: false },
    },
    platform: "cross-platform",
    safeToAutoExecute: false,
    fieldChecklist: Object.keys(FIELD_DESCRIPTIONS),
    fieldDescriptions: FIELD_DESCRIPTIONS,
    recoveryCommands,
    ...(originReference === null ? {} : { originReference }),
  };
}

function findSiblingConfigReference(
  cwd: string,
  candidates?: readonly WorktreeConfigCandidate[],
): string | null {
  try {
    const available =
      candidates ??
      parseWorktreeList(
        execFileSync("git", ["worktree", "list", "--porcelain"], {
          cwd,
          encoding: "utf8",
          windowsHide: true,
          stdio: ["ignore", "pipe", "ignore"],
        }),
      );
    for (const candidate of available) {
      if (resolve(candidate.root) === cwd) continue;
      const configPath = join(candidate.root, ".dysflow", "project.json");
      if (!existsSync(configPath)) continue;
      // Ensure an unreadable sibling config never becomes actionable guidance.
      JSON.parse(readFileSync(configPath, "utf8"));
      return `mkdir -p .dysflow && git show ${candidate.branch}:.dysflow/project.json > .dysflow/project.json`;
    }
  } catch {
    // Missing git, a detached worktree, or invalid sibling JSON simply means
    // the deterministic setup command remains the only recovery path.
  }
  return null;
}

function parseWorktreeList(output: string): WorktreeConfigCandidate[] {
  return output.split(/\r?\n\r?\n/).flatMap((block) => {
    const root = block.match(/^worktree (.+)$/m)?.[1];
    const branch = block.match(/^branch refs\/heads\/(.+)$/m)?.[1];
    return root === undefined || branch === undefined ? [] : [{ root, branch }];
  });
}
