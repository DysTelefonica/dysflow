/**
 * Issue #970 — Structured remediation contract.
 *
 * Diagnostics emit a `Remediation` object that carries BOTH a human-readable
 * `description` AND a machine-executable `command` an AI agent can copy-paste.
 * Cross-platform `alternatives` let the same remediation drive Windows +
 * macOS/Linux consumers without translation. `safeToAutoExecute` lets the
 * consumer decide whether to prompt the user before running the command.
 *
 * Backward compatibility: when a caller or legacy code passes a plain string,
 * `structureRemediation` wraps it as `{description: <string>, ...}` so the
 * emitted envelope always carries the structured shape. Consumers reading the
 * field can branch on `typeof remediation === "string"` to detect legacy
 * producers (older dysflow binaries) and the structured shape for new ones.
 */

export type RemediationPlatform = "cross-platform" | "posix" | "windows";

export type RemediationAlternatives = {
  "windows-cmd"?: string;
  "windows-powershell"?: string;
  bash?: string;
  zsh?: string;
};

export type Remediation = {
  /** Human-readable one-line fix instruction. Always non-empty. */
  description: string;
  /**
   * Bash-style command line an AI agent can copy-paste and execute.
   * Concrete commands (e.g. `mkdir -p '.../classes'`) MUST be runnable as-is
   * against a typical POSIX shell. Document-style placeholders (e.g. editing
   * a JSON config) are accepted but should never be auto-executed.
   */
  command: string;
  /** The shell family the `command` was authored against. */
  platform: RemediationPlatform;
  /** Optional cross-platform variants for consumers running non-POSIX shells. */
  alternatives?: RemediationAlternatives;
  /**
   * True when running `command` repeatedly is safe and idempotent (e.g.
   * `mkdir -p`, `dysflow doctor`). False when the command mutates state
   * irreversibly (e.g. `git rm -r`, `git reset --hard`, killing a process,
   * editing a JSON config). Consumers MUST prompt the user before running
   * any remediation where this is `false` or absent.
   */
  safeToAutoExecute?: boolean;
};

/**
 * Backward-compat shim — when a caller or legacy code passes a plain string,
 * normalize it into a `Remediation` shape so downstream consumers always see
 * the structured form. The `description` preserves the original text so
 * existing log-grep and test-substring assertions still match. The `command`
 * is set to the original text (treated as a generic hint); callers that need
 * a richer structure should emit one directly.
 */
export function structureRemediation(input: string | Remediation): Remediation {
  if (typeof input === "object" && input !== null) return input;
  return {
    description: input,
    command: input,
    platform: "cross-platform",
    // String remediations are treated as documentation-only — never auto-execute.
    safeToAutoExecute: false,
  };
}

/**
 * Build the structured remediation for `DESTINATION_ROOT_NOT_FOUND`.
 * The command is a real, runnable `mkdir -p` so an AI agent can copy-paste
 * it without translation.
 */
export function remediationForDestinationRootNotFound(destinationRoot: string): Remediation {
  return {
    description: `Configured destinationRoot directory does not exist: ${destinationRoot}. Run \`mkdir -p '<destinationRoot>/{classes,modules,forms,reports}'\`, then retry the write operation.`,
    command: `mkdir -p '${destinationRoot}/classes' '${destinationRoot}/modules' '${destinationRoot}/forms' '${destinationRoot}/reports'`,
    platform: "posix",
    alternatives: {
      "windows-powershell": `New-Item -ItemType Directory -Force -Path '${destinationRoot}\\classes','${destinationRoot}\\modules','${destinationRoot}\\forms','${destinationRoot}\\reports'`,
      "windows-cmd": `if not exist "${destinationRoot}\\classes" mkdir "${destinationRoot}\\classes" & if not exist "${destinationRoot}\\modules" mkdir "${destinationRoot}\\modules" & if not exist "${destinationRoot}\\forms" mkdir "${destinationRoot}\\forms" & if not exist "${destinationRoot}\\reports" mkdir "${destinationRoot}\\reports"`,
    },
    // mkdir -p is idempotent — safe to auto-execute.
    safeToAutoExecute: true,
  };
}

/**
 * Build the structured remediation for `OUTSIDE_PROJECT_ROOT`. The
 * `command` is the dysflow doctor CLI invocation, which is cross-platform.
 */
export function remediationForOutsideProjectRoot(projectRoot: string): Remediation {
  return {
    description: `The requested target is outside this worktree. Run \`dysflow doctor --cwd ${projectRoot}\` and call that worktree's MCP process.`,
    command: `dysflow doctor --cwd '${projectRoot}'`,
    platform: "cross-platform",
    alternatives: {
      "windows-powershell": `dysflow doctor --cwd '${projectRoot}'`,
      "windows-cmd": `dysflow doctor --cwd "${projectRoot}"`,
    },
    // doctor is read-only — safe to auto-execute.
    safeToAutoExecute: true,
  };
}

/**
 * Build the structured remediation for `WRITE_LOCKED_BY_RUNNING_OP`. The
 * command inspects first (read-only list) before any destructive kill —
 * safeToAutoExecute=false because the second call mutates running processes.
 */
export function remediationForWriteLockedByRunningOp(blockingOps: readonly string[]): Remediation {
  const opsList = blockingOps.join(", ");
  return {
    description: `Running Access operations block this write: ${opsList}. Call \`access_force_cleanup_orphaned({})\` to list candidates, verify process ownership, then call \`access_force_cleanup_orphaned({ confirmPid: <pid> })\` for the confirmed orphan and retry.`,
    command: `dysflow.access_force_cleanup_orphaned({ projectId: '<id>' })`,
    platform: "cross-platform",
    // Killing processes is destructive — never auto-execute.
    safeToAutoExecute: false,
  };
}

/**
 * Build the structured remediation for `CAPABILITIES_DISALLOW_WRITE`. The
 * command is a documentation hint (the user must edit JSON), so
 * safeToAutoExecute=false.
 */
export function remediationForCapabilitiesDisallowWrite(configPath: string): Remediation {
  return {
    description: `Project has capabilities.allowWrites = false. Set capabilities.allowWrites to true in ${configPath}, then run \`dysflow doctor --cwd <cwd>\`.`,
    command: `# Edit ${configPath}: set capabilities.allowWrites=true`,
    platform: "cross-platform",
    alternatives: {
      "windows-powershell": `# Open ${configPath} in your editor and set capabilities.allowWrites=true`,
      "windows-cmd": `# Edit ${configPath} and set capabilities.allowWrites=true`,
    },
    // Editing a JSON config is a state change — never auto-execute.
    safeToAutoExecute: false,
  };
}

/**
 * Build the structured remediation for `PROJECT_ID_MISMATCH`.
 */
export function remediationForProjectIdMismatch(configuredId: string | null): Remediation {
  return {
    description: `Requested project identity does not match '${configuredId ?? "(missing)"}'. Run \`dysflow doctor --cwd <cwd>\`, then retry with projectId '${configuredId ?? "<configured-id>"}' or update .dysflow/project.json.`,
    command: `dysflow doctor --cwd '<cwd>'`,
    platform: "cross-platform",
    // doctor is read-only — safe to auto-execute.
    safeToAutoExecute: true,
  };
}

/**
 * Build the structured remediation for the "missing .dysflow/project.json" case.
 * Setup is a write operation that creates the config — safeToAutoExecute=false.
 */
export function remediationForMissingProjectConfig(cwd: string): Remediation {
  return {
    description: `No per-worktree .dysflow/project.json was found. Run \`dysflow setup --cwd ${cwd} --apply --access-path <path>\` to bootstrap a per-worktree .dysflow/project.json. No write operation was performed.`,
    command: `dysflow setup --cwd '${cwd}' --apply --access-path '<path>'`,
    platform: "cross-platform",
    // Setup writes the config — not safe to auto-execute without user confirmation.
    safeToAutoExecute: false,
  };
}
