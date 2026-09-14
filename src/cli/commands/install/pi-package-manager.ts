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

export function piPackageSpec(version: string): string {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Cannot install the Pi package for invalid Dysflow version: ${version}.`);
  }
  return `npm:${PI_PACKAGE_NAME}@${version}`;
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

function isPiPackageSource(source: string): boolean {
  return source === `npm:${PI_PACKAGE_NAME}` || source.startsWith(`npm:${PI_PACKAGE_NAME}@`);
}

async function currentPiPackageSource(settingsPath: string): Promise<string | undefined> {
  const settings = await readJson(settingsPath);
  if (!Array.isArray(settings.packages)) return undefined;
  return settings.packages
    .map(packageSource)
    .find((source): source is string => source !== undefined && isPiPackageSource(source));
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
  return (await currentPiPackageSource(settingsPath)) === ownership.spec;
}

async function assertPackageSource(
  settingsPath: string,
  expected: string | undefined,
): Promise<void> {
  const actual = await currentPiPackageSource(settingsPath);
  if (actual !== expected) {
    throw new Error(
      expected === undefined
        ? "Pi reported package removal but the Dysflow package remains installed."
        : `Pi did not activate the required package spec ${expected}.`,
    );
  }
}

export async function reconcilePiPackage(input: PiPackageInput): Promise<PiPackageResult> {
  const baseSpec = `npm:${PI_PACKAGE_NAME}`;
  const mode = input.mode ?? "install";
  const runPiCommand = input.runPiCommand ?? defaultPiPackageCommandRunner;
  const commandContext = {
    cwd: input.cwd ?? path.dirname(input.runtimeDir),
    env: input.env,
  };
  const ownershipPath = resolvePiPackageOwnershipPath(input.runtimeDir);
  const ownership = await readOwnership(input.runtimeDir);
  const current = await currentPiPackageSource(input.settingsPath);
  const packageVersion = input.packageVersion;
  let spec: string;
  if (mode === "remove") {
    spec = ownership?.spec ?? current ?? baseSpec;
  } else {
    if (packageVersion === undefined) {
      throw new Error("A Dysflow release version is required to install the Pi package.");
    }
    spec = piPackageSpec(packageVersion);
  }
  const ownsCurrent = ownership !== undefined && ownership.spec === current;

  if (mode === "remove") {
    if (!ownsCurrent) {
      if (ownership) await rm(ownershipPath, { force: true });
      return { status: "unchanged", active: current !== undefined, owned: false, spec };
    }
    await runPiCommand(["remove", baseSpec], commandContext);
    await assertPackageSource(input.settingsPath, undefined);
    await rm(ownershipPath, { force: true });
    return { status: "changed", active: false, owned: false, spec };
  }

  if (current !== undefined && !ownsCurrent) {
    if (current === spec) {
      return { status: "unchanged", active: true, owned: false, spec };
    }
    throw new Error(
      `Pi already has a pre-existing Pi package for ${PI_PACKAGE_NAME}; Dysflow left it unchanged.`,
    );
  }

  if (current === spec && ownsCurrent) {
    return { status: "unchanged", active: true, owned: true, spec };
  }

  const previousSpec = current;
  await runPiCommand(["install", spec], commandContext);
  try {
    await assertPackageSource(input.settingsPath, spec);
    await (input.writeOwnershipFile ?? writeJson)(ownershipPath, {
      packageName: PI_PACKAGE_NAME,
      spec,
      version: packageVersion,
      owned: true,
    });
  } catch (error) {
    try {
      if (previousSpec === undefined) {
        await runPiCommand(["remove", baseSpec], commandContext);
      } else {
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
