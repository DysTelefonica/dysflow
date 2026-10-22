import { readFileSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { runCommand } from "./command-runner.js";
import { readJson, writeJson } from "./file-utils.js";

export const PI_PACKAGE_NAME = "@aroman22/dysflow-pi";
const PI_PACKAGE_OWNERSHIP_FILE = ".dysflow-pi-package.json";

type PiPackageOwnershipEntry = { spec: string; version: string };

/**
 * The ownership record at `<runtimeDir>/.dysflow-pi-package.json`. The
 * top-level `spec`/`version` mirror the latest write. `profiles` (issue #1822)
 * holds one entry per Pi settings file Dysflow reconciled, keyed by its
 * normalized absolute path. `legacy` keeps a pre-#1822 record that had no
 * `profiles` map, so the evidence it carried for a not-yet-recorded profile
 * survives the first per-profile write.
 */
type PiPackageOwnership = {
  packageName: typeof PI_PACKAGE_NAME;
  spec: string;
  version: string;
  owned: true;
  profiles?: Record<string, PiPackageOwnershipEntry>;
  legacy?: PiPackageOwnershipEntry;
};

/**
 * Raised when a Pi profile already references a Dysflow facade that Dysflow
 * cannot prove it owns. The reference is preserved; the message names the
 * profile and the exact recovery.
 */
export class PiPackageOwnershipError extends Error {
  readonly settingsPath: string;
  readonly source: string;

  constructor(settingsPath: string, source: string) {
    const agentDir = path.dirname(path.resolve(settingsPath));
    super(
      `Pi already has a pre-existing Pi package for ${PI_PACKAGE_NAME} (${source}) in ${settingsPath}; Dysflow left it unchanged. ` +
        `To let Dysflow manage it, run \`pi remove ${source}\` with PI_CODING_AGENT_DIR=${agentDir}, then re-run \`dysflow update\`.`,
    );
    this.name = "PiPackageOwnershipError";
    this.settingsPath = settingsPath;
    this.source = source;
  }
}

export type PiPackageCommandRunner = (
  args: readonly string[],
  context: { cwd: string; env: NodeJS.ProcessEnv },
) => Promise<void>;

type PiPackageInput = {
  settingsPath: string;
  runtimeDir: string;
  packageVersion?: string;
  env: NodeJS.ProcessEnv;
  cwd?: string;
  mode?: "install" | "remove";
  runPiCommand?: PiPackageCommandRunner;
  writeOwnershipFile?: typeof writeJson;
};

type PiPackageResult = {
  status: "added" | "changed" | "unchanged";
  active: boolean;
  owned: boolean;
  spec: string;
};

const LEGACY_NPM_SPEC = `npm:${PI_PACKAGE_NAME}`;

/**
 * The Pi facade Dysflow activates: the runtime's own copy, by absolute path
 * (issue #1754). Pi loads a local-path package in place, so the facade always
 * matches the installed runtime and no package registry is involved.
 */
export function resolvePiFacadeDir(runtimeDir: string): string {
  return path.join(runtimeDir, "app", "plugin", "pi");
}

function samePath(left: string, right: string): boolean {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

export function resolvePiPackageOwnershipPath(runtimeDir: string): string {
  return path.join(runtimeDir, PI_PACKAGE_OWNERSHIP_FILE);
}

function packageSource(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry;
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return undefined;
  const source = (entry as Record<string, unknown>).source;
  return typeof source === "string" ? source : undefined;
}

function isLegacyNpmSource(source: string): boolean {
  return source === LEGACY_NPM_SPEC || source.startsWith(`${LEGACY_NPM_SPEC}@`);
}

/**
 * True when a local-path package is a Dysflow Pi facade: its `package.json`
 * names the Dysflow Pi package. A development checkout or an older runtime
 * referenced this way is a Dysflow facade, but not one this runtime can prove
 * it owns (issue #1822).
 */
function isDysflowFacadeDir(dir: string): boolean {
  try {
    const manifest = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as {
      name?: unknown;
    };
    return manifest.name === PI_PACKAGE_NAME;
  } catch {
    return false;
  }
}

/**
 * The Dysflow facade entry in Pi settings, as a comparable identity: the npm
 * spec an earlier release wrote, or the absolute facade path. Pi stores a
 * local path relative to the settings directory, so entries are resolved
 * against it before comparing.
 */
async function currentPiPackageSource(
  settingsPath: string,
  runtimeDir: string,
): Promise<string | undefined> {
  const settings = await readJson(settingsPath);
  if (!Array.isArray(settings.packages)) return undefined;
  const facadeDir = resolvePiFacadeDir(runtimeDir);
  let foreignFacade: string | undefined;
  for (const source of settings.packages.map(packageSource)) {
    if (source === undefined) continue;
    if (isLegacyNpmSource(source)) return source;
    if (!source.includes(":") || path.isAbsolute(source)) {
      const resolved = path.resolve(path.dirname(settingsPath), source);
      if (samePath(resolved, facadeDir)) return facadeDir;
      if (foreignFacade === undefined && isDysflowFacadeDir(resolved)) foreignFacade = resolved;
    }
  }
  return foreignFacade;
}

function sameSource(left: string | undefined, right: string | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  if (isLegacyNpmSource(left) || isLegacyNpmSource(right)) return left === right;
  return samePath(left, right);
}

/** The argument `pi remove` needs to drop an entry with this identity. */
function removeArgument(source: string): string {
  return isLegacyNpmSource(source) ? LEGACY_NPM_SPEC : source;
}

function profileKey(settingsPath: string): string {
  const resolved = path.resolve(settingsPath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/** The ownership evidence a record carries for one Pi settings file. */
function ownershipFor(
  record: PiPackageOwnership | undefined,
  settingsPath: string,
): PiPackageOwnershipEntry | undefined {
  if (record === undefined) return undefined;
  const entry = record.profiles?.[profileKey(settingsPath)];
  if (entry !== undefined) return entry;
  if (record.profiles === undefined) return { spec: record.spec, version: record.version };
  return record.legacy;
}

function isOwnershipEntry(value: unknown): value is PiPackageOwnershipEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.spec === "string" && typeof entry.version === "string";
}

function recordWith(
  record: PiPackageOwnership | undefined,
  settingsPath: string,
  entry: PiPackageOwnershipEntry,
): PiPackageOwnership {
  const legacy =
    record === undefined
      ? undefined
      : record.profiles === undefined
        ? { spec: record.spec, version: record.version }
        : record.legacy;
  return {
    packageName: PI_PACKAGE_NAME,
    spec: entry.spec,
    version: entry.version,
    owned: true,
    profiles: { ...record?.profiles, [profileKey(settingsPath)]: entry },
    ...(legacy === undefined ? {} : { legacy }),
  };
}

/**
 * Drops one profile's ownership. The record file goes away once no recorded
 * profile remains, which keeps a single-profile removal identical to the
 * pre-#1822 behavior.
 */
async function releaseOwnership(
  record: PiPackageOwnership,
  settingsPath: string,
  ownershipPath: string,
  writeOwnership: typeof writeJson,
): Promise<void> {
  const remaining = { ...record.profiles };
  delete remaining[profileKey(settingsPath)];
  const latest = Object.values(remaining).at(-1);
  if (latest === undefined) {
    await rm(ownershipPath, { force: true });
    return;
  }
  await writeOwnership(ownershipPath, {
    ...record,
    spec: latest.spec,
    version: latest.version,
    profiles: remaining,
  });
}

async function readOwnership(runtimeDir: string): Promise<PiPackageOwnership | undefined> {
  const ownershipPath = resolvePiPackageOwnershipPath(runtimeDir);
  const raw = await readFile(ownershipPath, "utf8").catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  });
  if (raw === undefined) return undefined;
  let parsed: Partial<PiPackageOwnership>;
  try {
    parsed = JSON.parse(raw) as Partial<PiPackageOwnership>;
  } catch {
    throw new Error(`Invalid Dysflow Pi package ownership record at ${ownershipPath}.`);
  }
  if (
    parsed.packageName !== PI_PACKAGE_NAME ||
    parsed.owned !== true ||
    typeof parsed.spec !== "string" ||
    typeof parsed.version !== "string" ||
    (parsed.profiles !== undefined &&
      (typeof parsed.profiles !== "object" ||
        parsed.profiles === null ||
        !Object.values(parsed.profiles).every(isOwnershipEntry))) ||
    (parsed.legacy !== undefined && !isOwnershipEntry(parsed.legacy))
  ) {
    throw new Error(`Invalid Dysflow Pi package ownership record at ${ownershipPath}.`);
  }
  return parsed as PiPackageOwnership;
}

const defaultPiPackageCommandRunner: PiPackageCommandRunner = async (args, context) => {
  await runCommand("pi", args, context.cwd, { timeoutMs: 120_000, env: context.env });
};

export async function hasOwnedPiPackage(
  settingsPath: string,
  runtimeDir: string,
): Promise<boolean> {
  const ownership = ownershipFor(await readOwnership(runtimeDir), settingsPath);
  if (!ownership) return false;
  return sameSource(await currentPiPackageSource(settingsPath, runtimeDir), ownership.spec);
}

/**
 * True when the profile references a Dysflow facade this runtime cannot prove
 * it owns: the case install and update must report instead of overwrite.
 */
export async function hasUnownedPiPackage(
  settingsPath: string,
  runtimeDir: string,
): Promise<boolean> {
  const current = await currentPiPackageSource(settingsPath, runtimeDir);
  if (current === undefined || sameSource(current, resolvePiFacadeDir(runtimeDir))) return false;
  return !(await hasOwnedPiPackage(settingsPath, runtimeDir));
}

async function assertPackageSource(
  settingsPath: string,
  runtimeDir: string,
  expected: string | undefined,
): Promise<void> {
  const actual = await currentPiPackageSource(settingsPath, runtimeDir);
  if (!sameSource(actual, expected)) {
    throw new Error(
      expected === undefined
        ? "Pi reported package removal but the Dysflow package remains installed."
        : `Pi did not activate the required package spec ${expected}.`,
    );
  }
}

export async function reconcilePiPackage(input: PiPackageInput): Promise<PiPackageResult> {
  const mode = input.mode ?? "install";
  const runPiCommand = input.runPiCommand ?? defaultPiPackageCommandRunner;
  const commandContext = {
    cwd: input.cwd ?? path.dirname(input.runtimeDir),
    env: input.env,
  };
  const ownershipPath = resolvePiPackageOwnershipPath(input.runtimeDir);
  const record = await readOwnership(input.runtimeDir);
  const ownership = ownershipFor(record, input.settingsPath);
  const writeOwnership = input.writeOwnershipFile ?? writeJson;
  const current = await currentPiPackageSource(input.settingsPath, input.runtimeDir);
  const packageVersion = input.packageVersion;
  let spec: string;
  let releaseVersion = "";
  if (mode === "remove") {
    spec = ownership?.spec ?? current ?? resolvePiFacadeDir(input.runtimeDir);
  } else {
    if (packageVersion === undefined) {
      throw new Error("A Dysflow release version is required to install the Pi package.");
    }
    releaseVersion = packageVersion;
    spec = resolvePiFacadeDir(input.runtimeDir);
  }
  const ownsCurrent = ownership !== undefined && sameSource(ownership.spec, current);

  if (mode === "remove") {
    if (!ownsCurrent || current === undefined) {
      if (record && ownership) {
        await releaseOwnership(record, input.settingsPath, ownershipPath, writeOwnership);
      }
      return { status: "unchanged", active: current !== undefined, owned: false, spec };
    }
    await runPiCommand(["remove", removeArgument(current)], commandContext);
    await assertPackageSource(input.settingsPath, input.runtimeDir, undefined);
    if (record) await releaseOwnership(record, input.settingsPath, ownershipPath, writeOwnership);
    return { status: "changed", active: false, owned: false, spec };
  }

  if (current !== undefined && !ownsCurrent) {
    if (sameSource(current, spec)) {
      return { status: "unchanged", active: true, owned: false, spec };
    }
    throw new PiPackageOwnershipError(input.settingsPath, current);
  }

  if (ownsCurrent && sameSource(current, spec)) {
    // The facade path survives an in-place runtime update, so only the
    // ownership metadata records the release now behind it (issue #1822).
    const recorded = record?.profiles?.[profileKey(input.settingsPath)];
    if (recorded === undefined || recorded.spec !== spec || recorded.version !== releaseVersion) {
      await writeOwnership(
        ownershipPath,
        recordWith(record, input.settingsPath, { spec, version: releaseVersion }),
      );
    }
    return { status: "unchanged", active: true, owned: true, spec };
  }

  const previousSpec = current;
  // An owned entry of another form (the npm spec an earlier release wrote)
  // has a different Pi match key, so installing would add a second facade.
  if (previousSpec !== undefined) {
    await runPiCommand(["remove", removeArgument(previousSpec)], commandContext);
  }
  try {
    await runPiCommand(["install", spec], commandContext);
    await assertPackageSource(input.settingsPath, input.runtimeDir, spec);
    await writeOwnership(
      ownershipPath,
      recordWith(record, input.settingsPath, { spec, version: releaseVersion }),
    );
  } catch (error) {
    try {
      // Only undo what actually landed: a failed `pi install` added nothing.
      const landed = await currentPiPackageSource(input.settingsPath, input.runtimeDir);
      if (sameSource(landed, spec)) {
        await runPiCommand(["remove", spec], commandContext);
      }
      if (previousSpec !== undefined) {
        await runPiCommand(["install", previousSpec], commandContext);
      }
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Pi package installation failed and rollback was incomplete.",
      );
    }
    throw error;
  }

  return {
    status: previousSpec === undefined ? "added" : "changed",
    active: true,
    owned: true,
    spec,
  };
}
