import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { runCommand } from "./command-runner.js";
import { readJson, writeJson } from "./file-utils.js";

export const PI_PACKAGE_NAME = "@aroman22/dysflow-pi";
const PI_PACKAGE_OWNERSHIP_FILE = ".dysflow-pi-package.json";

type PiPackageOwnership = {
  packageName: typeof PI_PACKAGE_NAME;
  spec: string;
  version: string;
  owned: true;
};

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
  for (const source of settings.packages.map(packageSource)) {
    if (source === undefined) continue;
    if (isLegacyNpmSource(source)) return source;
    if (!source.includes(":") || path.isAbsolute(source)) {
      if (samePath(path.resolve(path.dirname(settingsPath), source), facadeDir)) return facadeDir;
    }
  }
  return undefined;
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
    typeof parsed.version !== "string"
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
  const ownership = await readOwnership(runtimeDir);
  if (!ownership) return false;
  return sameSource(await currentPiPackageSource(settingsPath, runtimeDir), ownership.spec);
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
  const ownership = await readOwnership(input.runtimeDir);
  const current = await currentPiPackageSource(input.settingsPath, input.runtimeDir);
  const packageVersion = input.packageVersion;
  let spec: string;
  if (mode === "remove") {
    spec = ownership?.spec ?? current ?? resolvePiFacadeDir(input.runtimeDir);
  } else {
    if (packageVersion === undefined) {
      throw new Error("A Dysflow release version is required to install the Pi package.");
    }
    spec = resolvePiFacadeDir(input.runtimeDir);
  }
  const ownsCurrent = ownership !== undefined && sameSource(ownership.spec, current);

  if (mode === "remove") {
    if (!ownsCurrent || current === undefined) {
      if (ownership) await rm(ownershipPath, { force: true });
      return { status: "unchanged", active: current !== undefined, owned: false, spec };
    }
    await runPiCommand(["remove", removeArgument(current)], commandContext);
    await assertPackageSource(input.settingsPath, input.runtimeDir, undefined);
    await rm(ownershipPath, { force: true });
    return { status: "changed", active: false, owned: false, spec };
  }

  if (current !== undefined && !ownsCurrent) {
    if (sameSource(current, spec)) {
      return { status: "unchanged", active: true, owned: false, spec };
    }
    throw new Error(
      `Pi already has a pre-existing Pi package for ${PI_PACKAGE_NAME}; Dysflow left it unchanged.`,
    );
  }

  if (ownsCurrent && sameSource(current, spec)) {
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
    await (input.writeOwnershipFile ?? writeJson)(ownershipPath, {
      packageName: PI_PACKAGE_NAME,
      spec,
      version: packageVersion,
      owned: true,
    });
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
