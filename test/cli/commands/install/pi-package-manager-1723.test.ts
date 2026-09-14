import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PI_PACKAGE_NAME,
  type PiPackageCommandRunner,
  piPackageSpec,
  reconcilePiPackage,
  resolvePiPackageOwnershipPath,
} from "../../../../src/cli/commands/install/pi-package-manager";

const roots: string[] = [];

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

function simulatedPiRunner(settingsPath: string): PiPackageCommandRunner {
  return async (args, context) => {
    expect(context.env.HOME).toBeDefined();
    const current = await readFile(settingsPath, "utf8")
      .then((raw) => JSON.parse(raw) as { packages?: unknown[] })
      .catch(() => ({ packages: [] }));
    const packages = Array.isArray(current.packages) ? current.packages : [];
    if (args[0] === "install") {
      current.packages = [
        ...packages.filter(
          (entry) => typeof entry !== "string" || !entry.startsWith(`npm:${PI_PACKAGE_NAME}`),
        ),
        args[1],
      ];
    } else if (args[0] === "remove") {
      current.packages = packages.filter(
        (entry) => typeof entry !== "string" || !entry.startsWith(`npm:${PI_PACKAGE_NAME}`),
      );
    }
    await writeJson(settingsPath, current);
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Pi npm package reconciliation (#1723)", () => {
  it("installs an exact release-matched npm spec through the injected Pi runner", async () => {
    const input = await fixture();
    const runner = vi.fn(simulatedPiRunner(input.settingsPath));

    const result = await reconcilePiPackage({ ...input, runPiCommand: runner });

    const spec = piPackageSpec(input.packageVersion);
    expect(runner).toHaveBeenCalledWith(["install", spec], {
      cwd: input.root,
      env: input.env,
    });
    expect(result).toEqual({ status: "added", active: true, owned: true, spec });
    expect((await readJson(input.settingsPath)).packages).toEqual([spec]);
    expect(await readJson(resolvePiPackageOwnershipPath(input.runtimeDir))).toMatchObject({
      packageName: PI_PACKAGE_NAME,
      spec,
      version: input.packageVersion,
      owned: true,
    });
  });

  it("preserves an exact pre-existing user package without claiming ownership", async () => {
    const input = await fixture();
    const spec = piPackageSpec(input.packageVersion);
    await writeJson(input.settingsPath, { packages: ["npm:other", spec] });
    const runner = vi.fn<PiPackageCommandRunner>();

    const result = await reconcilePiPackage({ ...input, runPiCommand: runner });

    expect(result).toEqual({ status: "unchanged", active: true, owned: false, spec });
    expect(runner).not.toHaveBeenCalled();
    await expect(access(resolvePiPackageOwnershipPath(input.runtimeDir))).rejects.toThrow();
  });

  it("fails safely on a differently pinned pre-existing user package", async () => {
    const input = await fixture();
    const original = { packages: ["npm:other", `npm:${PI_PACKAGE_NAME}@4.2.0`] };
    await writeJson(input.settingsPath, original);
    const runner = vi.fn<PiPackageCommandRunner>();

    await expect(reconcilePiPackage({ ...input, runPiCommand: runner })).rejects.toThrow(
      /pre-existing Pi package/i,
    );
    expect(await readJson(input.settingsPath)).toEqual(original);
    expect(runner).not.toHaveBeenCalled();
  });

  it("updates only a package previously installed by Dysflow", async () => {
    const input = await fixture();
    const oldSpec = piPackageSpec("4.2.0");
    await writeJson(input.settingsPath, { packages: [oldSpec] });
    await writeJson(resolvePiPackageOwnershipPath(input.runtimeDir), {
      packageName: PI_PACKAGE_NAME,
      spec: oldSpec,
      version: "4.2.0",
      owned: true,
    });
    const runner = vi.fn(simulatedPiRunner(input.settingsPath));

    const result = await reconcilePiPackage({ ...input, runPiCommand: runner });

    expect(result.status).toBe("changed");
    expect(result.owned).toBe(true);
    expect((await readJson(input.settingsPath)).packages).toEqual([
      piPackageSpec(input.packageVersion),
    ]);
  });

  it("removes only the exact package installation Dysflow owns", async () => {
    const input = await fixture();
    const spec = piPackageSpec(input.packageVersion);
    await writeJson(input.settingsPath, { packages: ["npm:other", spec] });
    await writeJson(resolvePiPackageOwnershipPath(input.runtimeDir), {
      packageName: PI_PACKAGE_NAME,
      spec,
      version: input.packageVersion,
      owned: true,
    });
    const runner = vi.fn(simulatedPiRunner(input.settingsPath));

    const result = await reconcilePiPackage({ ...input, mode: "remove", runPiCommand: runner });

    expect(runner).toHaveBeenCalledWith(["remove", `npm:${PI_PACKAGE_NAME}`], {
      cwd: input.root,
      env: input.env,
    });
    expect(result).toEqual({ status: "changed", active: false, owned: false, spec });
    expect((await readJson(input.settingsPath)).packages).toEqual(["npm:other"]);
    await expect(access(resolvePiPackageOwnershipPath(input.runtimeDir))).rejects.toThrow();
  });

  it("does not remove a user package when no Dysflow ownership record exists", async () => {
    const input = await fixture();
    const spec = piPackageSpec(input.packageVersion);
    await writeJson(input.settingsPath, { packages: [spec] });
    const runner = vi.fn<PiPackageCommandRunner>();

    const result = await reconcilePiPackage({
      ...input,
      mode: "remove",
      runPiCommand: runner,
    });

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

    expect(runner.mock.calls.map(([args]) => args)).toEqual([
      ["install", piPackageSpec(input.packageVersion)],
      ["remove", `npm:${PI_PACKAGE_NAME}`],
    ]);
    expect((await readJson(input.settingsPath)).packages).toEqual([]);
    await expect(access(resolvePiPackageOwnershipPath(input.runtimeDir))).rejects.toThrow();
  });

  it("preserves a user-modified package even when a stale ownership record remains", async () => {
    const input = await fixture();
    const ownedSpec = piPackageSpec(input.packageVersion);
    const userSpec = `npm:${PI_PACKAGE_NAME}@5.0.0`;
    await writeJson(input.settingsPath, { packages: [userSpec] });
    await writeJson(resolvePiPackageOwnershipPath(input.runtimeDir), {
      packageName: PI_PACKAGE_NAME,
      spec: ownedSpec,
      version: input.packageVersion,
      owned: true,
    });
    const runner = vi.fn<PiPackageCommandRunner>();

    const result = await reconcilePiPackage({
      ...input,
      mode: "remove",
      runPiCommand: runner,
    });

    expect(result).toEqual({ status: "unchanged", active: true, owned: false, spec: ownedSpec });
    expect(runner).not.toHaveBeenCalled();
    expect((await readJson(input.settingsPath)).packages).toEqual([userSpec]);
  });
});
