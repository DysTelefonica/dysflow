import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PI_PACKAGE_NAME,
  type PiPackageCommandRunner,
  reconcilePiPackage,
  resolvePiFacadeDir,
  resolvePiPackageOwnershipPath,
} from "../../../../src/cli/commands/install/pi-package-manager";

const roots: string[] = [];
const LEGACY_SPEC = `npm:${PI_PACKAGE_NAME}@4.2.0`;

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "dysflow-pi-package-"));
  roots.push(root);
  return {
    root,
    runtimeDir: join(root, "runtime"),
    settingsPath: join(root, "home", ".pi", "agent", "settings.json"),
    packageVersion: "4.3.2",
    env: { HOME: join(root, "home"), USERPROFILE: join(root, "home") },
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

/** How Pi writes a local path into settings: relative to the settings directory. */
function piSettingsEntry(settingsPath: string, absolutePath: string): string {
  return relative(dirname(settingsPath), absolutePath) || ".";
}

/**
 * Mirrors Pi's package manager (`addSourceToSettings` /
 * `removeSourceFromSettings`): npm specs match by package name, local paths
 * match by resolved location and are stored relative to the settings file.
 */
function simulatedPiRunner(settingsPath: string): PiPackageCommandRunner {
  const matchKey = (source: string): string => {
    if (source.startsWith("npm:")) return `npm:${source.slice(4).replace(/(.)@.*$/, "$1")}`;
    return `path:${resolve(dirname(settingsPath), source)}`;
  };
  const inputKey = (source: string): string =>
    source.startsWith("npm:") || isAbsolute(source) ? matchKey(source) : `path:${resolve(source)}`;
  return async (args, context) => {
    expect(context.env.HOME).toBeDefined();
    const current = await readFile(settingsPath, "utf8")
      .then((raw) => JSON.parse(raw) as { packages?: unknown[] })
      .catch(() => ({ packages: [] }));
    const packages = (Array.isArray(current.packages) ? current.packages : []) as string[];
    const source = args[1] as string;
    const others = packages.filter((entry) => matchKey(entry) !== inputKey(source));
    if (args[0] === "install") {
      const stored = source.startsWith("npm:") ? source : piSettingsEntry(settingsPath, source);
      current.packages = [...others, stored];
    } else if (args[0] === "remove") {
      current.packages = others;
    }
    await writeJson(settingsPath, current);
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Pi facade reconciliation by local path (#1723, #1754)", () => {
  it("activates the runtime's own facade by absolute path through the injected Pi runner", async () => {
    const input = await fixture();
    const runner = vi.fn(simulatedPiRunner(input.settingsPath));

    const result = await reconcilePiPackage({ ...input, runPiCommand: runner });

    const spec = resolvePiFacadeDir(input.runtimeDir);
    expect(spec).toBe(join(input.runtimeDir, "app", "plugin", "pi"));
    expect(runner).toHaveBeenCalledWith(["install", spec], {
      cwd: input.root,
      env: input.env,
    });
    expect(runner.mock.calls.flat().flat()).not.toContain(expect.stringMatching(/^npm:/));
    expect(result).toEqual({ status: "added", active: true, owned: true, spec });
    expect((await readJson(input.settingsPath)).packages).toEqual([
      piSettingsEntry(input.settingsPath, spec),
    ]);
    expect(await readJson(resolvePiPackageOwnershipPath(input.runtimeDir))).toMatchObject({
      packageName: PI_PACKAGE_NAME,
      spec,
      version: input.packageVersion,
      owned: true,
    });
  });

  it("recognises its facade in the relative form Pi stores and leaves it unchanged", async () => {
    const input = await fixture();
    const runner = vi.fn(simulatedPiRunner(input.settingsPath));
    await reconcilePiPackage({ ...input, runPiCommand: runner });
    runner.mockClear();

    const result = await reconcilePiPackage({ ...input, runPiCommand: runner });

    expect(result.status).toBe("unchanged");
    expect(result.owned).toBe(true);
    expect(runner).not.toHaveBeenCalled();
  });

  it("preserves the same facade path added by the user without claiming ownership", async () => {
    const input = await fixture();
    const spec = resolvePiFacadeDir(input.runtimeDir);
    await writeJson(input.settingsPath, {
      packages: ["npm:other", piSettingsEntry(input.settingsPath, spec)],
    });
    const runner = vi.fn<PiPackageCommandRunner>();

    const result = await reconcilePiPackage({ ...input, runPiCommand: runner });

    expect(result).toEqual({ status: "unchanged", active: true, owned: false, spec });
    expect(runner).not.toHaveBeenCalled();
    await expect(access(resolvePiPackageOwnershipPath(input.runtimeDir))).rejects.toThrow();
  });

  it("fails safely on a pre-existing npm package it does not own", async () => {
    const input = await fixture();
    const original = { packages: ["npm:other", LEGACY_SPEC] };
    await writeJson(input.settingsPath, original);
    const runner = vi.fn<PiPackageCommandRunner>();

    await expect(reconcilePiPackage({ ...input, runPiCommand: runner })).rejects.toThrow(
      /pre-existing Pi package/i,
    );
    expect(await readJson(input.settingsPath)).toEqual(original);
    expect(runner).not.toHaveBeenCalled();
  });

  it("migrates an npm entry it owns to the local-path facade", async () => {
    const input = await fixture();
    await writeJson(input.settingsPath, { packages: ["npm:other", LEGACY_SPEC] });
    await writeJson(resolvePiPackageOwnershipPath(input.runtimeDir), {
      packageName: PI_PACKAGE_NAME,
      spec: LEGACY_SPEC,
      version: "4.2.0",
      owned: true,
    });
    const runner = vi.fn(simulatedPiRunner(input.settingsPath));

    const result = await reconcilePiPackage({ ...input, runPiCommand: runner });

    const spec = resolvePiFacadeDir(input.runtimeDir);
    expect(runner.mock.calls.map(([args]) => args)).toEqual([
      ["remove", `npm:${PI_PACKAGE_NAME}`],
      ["install", spec],
    ]);
    expect(result).toEqual({ status: "changed", active: true, owned: true, spec });
    expect((await readJson(input.settingsPath)).packages).toEqual([
      "npm:other",
      piSettingsEntry(input.settingsPath, spec),
    ]);
    expect(await readJson(resolvePiPackageOwnershipPath(input.runtimeDir))).toMatchObject({ spec });
  });

  it("restores the owned npm entry when installing the local path fails", async () => {
    const input = await fixture();
    await writeJson(input.settingsPath, { packages: [LEGACY_SPEC] });
    await writeJson(resolvePiPackageOwnershipPath(input.runtimeDir), {
      packageName: PI_PACKAGE_NAME,
      spec: LEGACY_SPEC,
      version: "4.2.0",
      owned: true,
    });
    const pi = simulatedPiRunner(input.settingsPath);
    const spec = resolvePiFacadeDir(input.runtimeDir);
    const runner = vi.fn<PiPackageCommandRunner>(async (args, context) => {
      if (args[0] === "install" && args[1] === spec) throw new Error("injected pi install failure");
      await pi(args, context);
    });

    await expect(reconcilePiPackage({ ...input, runPiCommand: runner })).rejects.toThrow(
      "injected pi install failure",
    );

    expect(runner.mock.calls.map(([args]) => args)).toEqual([
      ["remove", `npm:${PI_PACKAGE_NAME}`],
      ["install", spec],
      ["install", LEGACY_SPEC],
    ]);
    expect((await readJson(input.settingsPath)).packages).toEqual([LEGACY_SPEC]);
  });

  it("removes only the exact facade installation Dysflow owns", async () => {
    const input = await fixture();
    const runner = vi.fn(simulatedPiRunner(input.settingsPath));
    await writeJson(input.settingsPath, { packages: ["npm:other"] });
    await reconcilePiPackage({ ...input, runPiCommand: runner });
    runner.mockClear();

    const result = await reconcilePiPackage({ ...input, mode: "remove", runPiCommand: runner });

    const spec = resolvePiFacadeDir(input.runtimeDir);
    expect(runner).toHaveBeenCalledWith(["remove", spec], { cwd: input.root, env: input.env });
    expect(result).toEqual({ status: "changed", active: false, owned: false, spec });
    expect((await readJson(input.settingsPath)).packages).toEqual(["npm:other"]);
    await expect(access(resolvePiPackageOwnershipPath(input.runtimeDir))).rejects.toThrow();
  });

  it("does not remove a user entry when no Dysflow ownership record exists", async () => {
    const input = await fixture();
    const spec = resolvePiFacadeDir(input.runtimeDir);
    await writeJson(input.settingsPath, { packages: [piSettingsEntry(input.settingsPath, spec)] });
    const runner = vi.fn<PiPackageCommandRunner>();

    const result = await reconcilePiPackage({ ...input, mode: "remove", runPiCommand: runner });

    expect(result).toEqual({ status: "unchanged", active: true, owned: false, spec });
    expect(runner).not.toHaveBeenCalled();
  });

  it("rolls back the Pi install when the ownership record cannot be committed", async () => {
    const input = await fixture();
    const runner = vi.fn(simulatedPiRunner(input.settingsPath));

    await expect(
      reconcilePiPackage({
        ...input,
        runPiCommand: runner,
        writeOwnershipFile: async () => {
          throw new Error("injected ownership failure");
        },
      }),
    ).rejects.toThrow("injected ownership failure");

    const spec = resolvePiFacadeDir(input.runtimeDir);
    expect(runner.mock.calls.map(([args]) => args)).toEqual([
      ["install", spec],
      ["remove", spec],
    ]);
    expect((await readJson(input.settingsPath)).packages).toEqual([]);
    await expect(access(resolvePiPackageOwnershipPath(input.runtimeDir))).rejects.toThrow();
  });

  it("preserves a user-modified package even when a stale ownership record remains", async () => {
    const input = await fixture();
    const userSpec = `npm:${PI_PACKAGE_NAME}@5.0.0`;
    await writeJson(input.settingsPath, { packages: [userSpec] });
    await writeJson(resolvePiPackageOwnershipPath(input.runtimeDir), {
      packageName: PI_PACKAGE_NAME,
      spec: resolvePiFacadeDir(input.runtimeDir),
      version: input.packageVersion,
      owned: true,
    });
    const runner = vi.fn<PiPackageCommandRunner>();

    const result = await reconcilePiPackage({ ...input, mode: "remove", runPiCommand: runner });

    expect(result).toEqual({
      status: "unchanged",
      active: true,
      owned: false,
      spec: resolvePiFacadeDir(input.runtimeDir),
    });
    expect(runner).not.toHaveBeenCalled();
    expect((await readJson(input.settingsPath)).packages).toEqual([userSpec]);
  });
});
