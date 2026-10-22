import { type PiProfile, resolvePiProfiles } from "./agent-config.js";
import {
  capturePiIntegration,
  hasPiIntegration,
  reconcilePiIntegration,
  restorePiIntegration,
} from "./mcp-configurator.js";
import {
  hasOwnedPiPackage,
  hasUnownedPiPackage,
  type PiPackageCommandRunner,
  reconcilePiPackage,
} from "./pi-package-manager.js";
import {
  discoverPointerRolloutTargets,
  formatPointerRolloutReport,
  installBundledPointerBlocks,
} from "./pointer-rollout.js";
import {
  discoverSkillTargets,
  formatSkillInstallReport,
  installBundledSkills,
  type SkillAgentId,
} from "./skills-installer.js";

/**
 * Additional Pi profiles (issue #1822): every discovered agent directory after
 * the selected one. The selected profile keeps its pre-#1822 code path, so a
 * single-profile install or update behaves exactly as before.
 */
export function resolveAdditionalPiProfiles(home: string, env: NodeJS.ProcessEnv): PiProfile[] {
  return resolvePiProfiles(home, env).slice(1);
}

export type AdditionalPiProfileReport = {
  profile: PiProfile;
  outcome:
    | { kind: "reconciled"; status: "added" | "changed" | "unchanged"; active: boolean }
    | { kind: "refused"; reason: string }
    | { kind: "skipped" };
  skills?: string;
  pointer?: string;
};

type ReconcileInput = {
  profiles: readonly PiProfile[];
  runtimeDir: string;
  commandPath: string;
  packageVersion: string;
  /** `install`: the user selected Pi. `update`: only profiles already wired to Dysflow. */
  mode: "install" | "update";
  runPiCommand?: PiPackageCommandRunner;
  bundleRoot: string;
  home: string;
  skillFilters: { only: readonly SkillAgentId[]; exclude: readonly SkillAgentId[] };
};

async function hasDysflowWiring(profile: PiProfile, runtimeDir: string, commandPath: string) {
  return (
    (await hasPiIntegration(profile.mcpConfigPath, commandPath)) ||
    (await hasOwnedPiPackage(profile.settingsPath, runtimeDir)) ||
    (await hasUnownedPiPackage(profile.settingsPath, runtimeDir))
  );
}

/**
 * The same MCP + package transaction the selected profile runs: the MCP file
 * is restored byte-for-byte when the package step fails.
 */
async function reconcileProfileWiring(
  profile: PiProfile,
  input: ReconcileInput,
): Promise<{ status: "added" | "changed" | "unchanged"; active: boolean }> {
  const snapshot = await capturePiIntegration(profile.mcpConfigPath);
  const result = await reconcilePiIntegration({
    mcpConfigPath: profile.mcpConfigPath,
    commandPath: input.commandPath,
  });
  let packageStatus: "added" | "changed" | "unchanged";
  try {
    ({ status: packageStatus } = await reconcilePiPackage({
      settingsPath: profile.settingsPath,
      runtimeDir: input.runtimeDir,
      packageVersion: input.packageVersion,
      env: profile.env,
      runPiCommand: input.runPiCommand,
    }));
  } catch (error) {
    try {
      await restorePiIntegration(profile.mcpConfigPath, snapshot);
    } catch {
      throw new Error(
        "Pi package installation failed and Pi configuration rollback was incomplete.",
      );
    }
    throw error;
  }
  // Either half changing means the profile changed; MCP wins when both did.
  return { ...result, status: result.status === "unchanged" ? packageStatus : result.status };
}

function piSkillsSelected(filters: ReconcileInput["skillFilters"]): boolean {
  if (filters.exclude.includes("pi")) return false;
  return filters.only.length === 0 || filters.only.includes("pi");
}

/**
 * Reconcile every additional Pi profile. A profile that cannot be reconciled
 * safely (an unowned Dysflow facade, a foreign `dysflow` MCP entry) is left
 * untouched and reported as refused; it never fails the selected profile.
 */
export async function reconcileAdditionalPiProfiles(
  input: ReconcileInput,
): Promise<AdditionalPiProfileReport[]> {
  const reports: AdditionalPiProfileReport[] = [];
  for (const profile of input.profiles) {
    const report: AdditionalPiProfileReport = { profile, outcome: { kind: "skipped" } };
    reports.push(report);
    if (
      input.mode === "update" &&
      !(await hasDysflowWiring(profile, input.runtimeDir, input.commandPath))
    ) {
      continue;
    }
    try {
      const result = await reconcileProfileWiring(profile, input);
      report.outcome = { kind: "reconciled", ...result };
    } catch (error) {
      report.outcome = {
        kind: "refused",
        reason: error instanceof Error ? error.message : String(error),
      };
      continue;
    }
    if (!piSkillsSelected(input.skillFilters)) continue;
    const skillTargets = discoverSkillTargets(input.home, { only: ["pi"] }, profile.env);
    const skillInstall = await installBundledSkills({
      bundleRoot: input.bundleRoot,
      targets: skillTargets,
    });
    const pointerRollout = await installBundledPointerBlocks({
      bundleRoot: input.bundleRoot,
      home: input.home,
      env: profile.env,
      targets: discoverPointerRolloutTargets({
        home: input.home,
        installedSkillTargets: skillTargets,
        only: ["pi"],
        env: profile.env,
      }),
    });
    report.skills = formatSkillInstallReport(skillInstall);
    report.pointer = formatPointerRolloutReport(pointerRollout);
  }
  return reports;
}

/** Human-readable section; empty when no additional profile was discovered. */
export function formatAdditionalPiProfilesReport(
  reports: readonly AdditionalPiProfileReport[],
): string {
  const visible = reports.filter((report) => report.outcome.kind !== "skipped");
  if (visible.length === 0) return "";
  const lines = ["Additional Pi profiles:"];
  for (const report of visible) {
    const label = `${report.profile.origin} ${report.profile.agentDir}`;
    if (report.outcome.kind === "refused") {
      lines.push(`- ${label}: NOT reconciled. ${report.outcome.reason}`);
      continue;
    }
    if (report.outcome.kind !== "reconciled") continue;
    lines.push(
      `- ${label}: ${report.outcome.active ? "active" : "inactive"} (${report.outcome.status})`,
    );
    for (const section of [report.skills, report.pointer]) {
      if (section !== undefined) lines.push(...section.split("\n").map((line) => `  ${line}`));
    }
  }
  return lines.join("\n");
}

/** Refusals, for stderr: a refused profile must never read as a silent success. */
export function formatAdditionalPiProfileWarnings(
  reports: readonly AdditionalPiProfileReport[],
): string {
  return reports
    .flatMap((report) =>
      report.outcome.kind === "refused"
        ? [
            `Warning: Pi profile ${report.profile.agentDir} (${report.profile.origin}) was not reconciled: ${report.outcome.reason}`,
          ]
        : [],
    )
    .join("\n");
}
