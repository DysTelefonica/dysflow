import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolvePiProfiles,
  SKIP_GENTLE_SHELL_ENV,
} from "../../../../src/cli/commands/install/agent-config.js";
import {
  PI_PACKAGE_NAME,
  PiPackageOwnershipError,
  reconcilePiPackage,
  resolvePiFacadeDir,
  resolvePiPackageOwnershipPath,
} from "../../../../src/cli/commands/install/pi-package-manager.js";
import { DYSSKILL_NAMES } from "../../../../src/cli/commands/install/skills-installer.js";
import { handleInstallCommand, handleUpdateCommand } from "../../../../src/cli/commands/install.js";
import { handleUninstallCommand } from "../../../../src/cli/commands/uninstall.js";
import { useHermeticTmpdir } from "../../../_helpers/hermetic-tmpdir.js";

/**
 * Issue #1822: install and update reconcile the gentle-shell Pi profile next
 * to the ordinary one. Every path below lives in a disposable sandbox; the Pi
 * CLI is a fake port that edits the sandboxed settings file the way Pi does.
 */
useHermeticTmpdir();
vi.setConfig({ testTimeout: 120_000 });

const roots: string[] = [];
const POINTER_OPEN = "<!-- user-supplement:dysflow:pointer -->";
const POINTER_CLOSE = "<!-- /user-supplement:dysflow:pointer -->";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function sandbox() {
  const root = await mkdtemp(join(tmpdir(), "dysflow-pi-profiles-1822-"));
  roots.push(root);
  const home = join(root, "home");
  const ordinary = join(home, ".pi", "agent");
  const gentleShell = join(home, ".gentle-shell", "agent");
  const runtimeDir = join(root, "runtime");
  await mkdir(home, { recursive: true });
  return { root, home, ordinary, gentleShell, runtimeDir, env: { USERPROFILE: home } };
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJsonFile(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

/** Pi's package manager, scoped like Pi to `PI_CODING_AGENT_DIR` or `~/.pi/agent`. */
async function fakePi(args: readonly string[], context: { env: NodeJS.ProcessEnv }) {
  const home = context.env.USERPROFILE ?? context.env.HOME;
  if (!home) throw new Error("sandboxed Pi runner requires a home directory");
  const agentDir = context.env.PI_CODING_AGENT_DIR?.trim() || join(home, ".pi", "agent");
  const settingsPath = join(agentDir, "settings.json");
  const settings = await readJsonFile(settingsPath).catch(() => ({ packages: [] }));
  const packages = Array.isArray(settings.packages) ? (settings.packages as string[]) : [];
  const key = (entry: string, fromSettings: boolean): string =>
    entry.startsWith("npm:")
      ? `npm:${entry.slice(4).replace(/(.)@.*$/, "$1")}`
      : resolve(fromSettings ? agentDir : "", entry);
  const source = args[1] ?? "";
  const others = packages.filter((entry) => key(entry, true) !== key(source, false));
  settings.packages =
    args[0] === "install"
      ? [...others, source.startsWith("npm:") ? source : relative(agentDir, source)]
      : others;
  await writeJsonFile(settingsPath, settings);
}

async function releasePackage(root: string, version: string): Promise<string> {
  const packageRoot = join(root, `package-${version}`);
  await mkdir(join(packageRoot, "dist", "cli"), { recursive: true });
  await mkdir(join(packageRoot, "scripts"), { recursive: true });
  await writeFile(join(packageRoot, "dist", "cli", "index.js"), "// cli\n", "utf8");
  await writeFile(join(packageRoot, "scripts", "dysflow-vba-manager.ps1"), "#\n", "utf8");
  await writeFile(join(packageRoot, "scripts", "dysflow-access-runner.ps1"), "#\n", "utf8");
  await writeJsonFile(join(packageRoot, "package.json"), { name: "dysflow", version });
  await cp(join(process.cwd(), "skills"), join(packageRoot, "skills"), { recursive: true });
  await cp(join(process.cwd(), "plugin"), join(packageRoot, "plugin"), {
    recursive: true,
    filter: (source) => !source.split(/[\\/]/).includes("node_modules"),
  });
  return packageRoot;
}

function provider(version: string, packageRoot: string) {
  return {
    resolveLatestRelease: async () => ({ version }),
    preparePackage: async () => ({ packageRoot }),
  };
}

function launcher(runtimeDir: string): string {
  return join(runtimeDir, "bin", "dysflow.cmd").replaceAll("\\", "/");
}

function facadeEntry(agentDir: string, runtimeDir: string): string {
  return relative(agentDir, resolvePiFacadeDir(runtimeDir));
}

async function treeHashes(dir: string): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  async function visit(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else {
        const digest = createHash("sha256")
          .update(await readFile(absolute))
          .digest("hex");
        hashes.set(relative(dir, absolute).replaceAll("\\", "/"), digest);
      }
    }
  }
  await visit(dir);
  return hashes;
}

async function expectProfileAligned(agentDir: string, runtimeDir: string, bundleRoot: string) {
  const settings = await readJsonFile(join(agentDir, "settings.json"));
  const dysflowEntries = (settings.packages as string[]).filter(
    (entry) => entry !== "npm:unrelated",
  );
  expect(dysflowEntries).toEqual([facadeEntry(agentDir, runtimeDir)]);
  const servers = (await readJsonFile(join(agentDir, "mcp.json"))).mcpServers as Record<
    string,
    Record<string, unknown>
  >;
  expect(servers.dysflow?.command).toBe(launcher(runtimeDir));
  for (const skill of DYSSKILL_NAMES) {
    expect(await treeHashes(join(agentDir, "skills", skill))).toEqual(
      await treeHashes(join(bundleRoot, "skills", skill)),
    );
  }
  const pointer = await readFile(join(agentDir, "APPEND_SYSTEM.md"), "utf8");
  expect(pointer.split(POINTER_OPEN)).toHaveLength(2);
  expect(pointer.split(POINTER_CLOSE)).toHaveLength(2);
}

async function snapshot(paths: readonly string[]): Promise<string[]> {
  return Promise.all(paths.map((path) => readFile(path, "utf8").catch(() => "<missing>")));
}

describe("Pi profile discovery (#1822)", () => {
  it("selects only the ordinary profile when gentle-shell is absent", async () => {
    const { home, ordinary, env } = await sandbox();

    expect(resolvePiProfiles(home, env).map((profile) => profile.agentDir)).toEqual([ordinary]);
  });

  it("adds an existing default gentle-shell home with an env that selects it for Pi", async () => {
    const { home, ordinary, gentleShell, env } = await sandbox();
    await mkdir(gentleShell, { recursive: true });

    const profiles = resolvePiProfiles(home, env);

    expect(profiles.map(({ agentDir, origin }) => ({ agentDir, origin }))).toEqual([
      { agentDir: ordinary, origin: "default" },
      { agentDir: gentleShell, origin: "gentle-shell" },
    ]);
    expect(profiles[0]?.env).toBe(env);
    expect(profiles[1]?.env.PI_CODING_AGENT_DIR).toBe(gentleShell);
    expect(profiles[1]?.settingsPath).toBe(join(gentleShell, "settings.json"));
  });

  it("follows the gentle-shell configured home path and GENTLE_SHELL_HOME", async () => {
    const { root, home, gentleShell, env } = await sandbox();
    const configured = join(root, "custom-shell-home");
    await mkdir(configured, { recursive: true });
    await mkdir(gentleShell, { recursive: true });
    await writeJsonFile(join(home, ".gentle-shell", "config.json"), { home: configured });

    expect(resolvePiProfiles(home, env).map((profile) => profile.agentDir)).toEqual([
      join(home, ".pi", "agent"),
      configured,
    ]);

    const isolated = join(root, "isolated-home");
    await mkdir(isolated, { recursive: true });
    await writeJsonFile(join(home, ".gentle-shell", "config.json"), { home: "isolated" });
    expect(resolvePiProfiles(home, { ...env, GENTLE_SHELL_HOME: isolated }).at(-1)?.agentDir).toBe(
      isolated,
    );
  });

  it("does not duplicate a linked gentle-shell home or invent a missing one", async () => {
    const { home, gentleShell, env } = await sandbox();
    await mkdir(gentleShell, { recursive: true });
    await writeJsonFile(join(home, ".gentle-shell", "config.json"), { home: "link" });
    expect(resolvePiProfiles(home, env)).toHaveLength(1);

    await writeJsonFile(join(home, ".gentle-shell", "config.json"), {
      home: join(home, "does-not-exist"),
    });
    expect(resolvePiProfiles(home, env)).toHaveLength(1);
  });

  it("respects an explicit PI_CODING_AGENT_DIR override and the exclusion switch", async () => {
    const { root, home, gentleShell, env } = await sandbox();
    await mkdir(gentleShell, { recursive: true });
    const custom = join(root, "custom-pi");

    const overridden = resolvePiProfiles(home, { ...env, PI_CODING_AGENT_DIR: custom });
    expect(overridden.map(({ agentDir, origin }) => ({ agentDir, origin }))).toEqual([
      { agentDir: custom, origin: "override" },
    ]);
    expect(resolvePiProfiles(home, { ...env, [SKIP_GENTLE_SHELL_ENV]: "1" })).toHaveLength(1);
  });
});

describe("Pi package ownership per profile (#1822)", () => {
  it("refreshes the recorded release when the facade path is unchanged", async () => {
    const { ordinary, runtimeDir, env } = await sandbox();
    const settingsPath = join(ordinary, "settings.json");
    await writeJsonFile(settingsPath, { packages: [facadeEntry(ordinary, runtimeDir)] });
    await writeJsonFile(resolvePiPackageOwnershipPath(runtimeDir), {
      packageName: PI_PACKAGE_NAME,
      spec: resolvePiFacadeDir(runtimeDir),
      version: "4.4.9",
      owned: true,
    });

    const result = await reconcilePiPackage({
      settingsPath,
      runtimeDir,
      packageVersion: "4.4.14",
      env,
      runPiCommand: fakePi,
    });

    expect(result).toMatchObject({ status: "unchanged", owned: true });
    const record = await readJsonFile(resolvePiPackageOwnershipPath(runtimeDir));
    expect(record.version).toBe("4.4.14");
    expect(Object.values(record.profiles as Record<string, unknown>)).toEqual([
      { spec: resolvePiFacadeDir(runtimeDir), version: "4.4.14" },
    ]);
  });

  it("refuses an unowned development-checkout facade and preserves it", async () => {
    const { root, ordinary, runtimeDir, env } = await sandbox();
    const devFacade = join(root, "dev-checkout", "plugin", "pi");
    await writeJsonFile(join(devFacade, "package.json"), {
      name: PI_PACKAGE_NAME,
      version: "4.4.9",
    });
    const settingsPath = join(ordinary, "settings.json");
    const original = { packages: ["npm:other", relative(ordinary, devFacade)] };
    await writeJsonFile(settingsPath, original);
    const calls: string[][] = [];

    const attempt = reconcilePiPackage({
      settingsPath,
      runtimeDir,
      packageVersion: "4.4.14",
      env,
      runPiCommand: async (args, context) => {
        calls.push([...args]);
        await fakePi(args, context);
      },
    });

    await expect(attempt).rejects.toBeInstanceOf(PiPackageOwnershipError);
    await expect(attempt).rejects.toThrow(/pi remove .*then re-run `dysflow update`/);
    expect(await readJsonFile(settingsPath)).toEqual(original);
    expect(calls).toEqual([]);
  });
});

describe("dysflow update reconciles the gentle-shell Pi profile (#1822)", () => {
  async function dualProfileFixture() {
    const box = await sandbox();
    const bundleRoot = await releasePackage(box.root, "9.9.9");
    const managedMcp = {
      mcpServers: {
        other: { command: "other-server" },
        dysflow: { command: launcher(box.runtimeDir), args: ["mcp"], directTools: false },
      },
    };
    for (const agentDir of [box.ordinary, box.gentleShell]) {
      await writeJsonFile(join(agentDir, "mcp.json"), managedMcp);
      await writeFile(join(agentDir, "APPEND_SYSTEM.md"), "user-owned guidance\n", "utf8");
    }
    await writeJsonFile(join(box.ordinary, "settings.json"), {
      theme: "dark",
      packages: ["npm:unrelated", facadeEntry(box.ordinary, box.runtimeDir)],
    });
    // gentle-shell still holds the npm facade an earlier Dysflow wrote and owns.
    await writeJsonFile(join(box.gentleShell, "settings.json"), {
      quietStartup: true,
      packages: ["npm:unrelated", `npm:${PI_PACKAGE_NAME}@4.2.0`],
    });
    const key = (path: string) =>
      process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
    await writeJsonFile(resolvePiPackageOwnershipPath(box.runtimeDir), {
      packageName: PI_PACKAGE_NAME,
      spec: resolvePiFacadeDir(box.runtimeDir),
      version: "4.4.9",
      owned: true,
      profiles: {
        [key(join(box.ordinary, "settings.json"))]: {
          spec: resolvePiFacadeDir(box.runtimeDir),
          version: "4.4.9",
        },
        [key(join(box.gentleShell, "settings.json"))]: {
          spec: `npm:${PI_PACKAGE_NAME}@4.2.0`,
          version: "4.2.0",
        },
      },
    });
    return { ...box, bundleRoot };
  }

  it("aligns both profiles with the installed release and records each one", async () => {
    const box = await dualProfileFixture();

    const result = await handleUpdateCommand(["--runtime-dir", box.runtimeDir], {
      env: box.env,
      releaseUpdateProvider: provider("9.9.9", box.bundleRoot),
      piPackageCommandRunner: fakePi,
    });

    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`gentle-shell ${box.gentleShell}: active (changed)`);
    for (const agentDir of [box.ordinary, box.gentleShell]) {
      await expectProfileAligned(agentDir, box.runtimeDir, box.bundleRoot);
      expect(await readFile(join(agentDir, "APPEND_SYSTEM.md"), "utf8")).toMatch(
        /^user-owned guidance\n/,
      );
      const servers = (await readJsonFile(join(agentDir, "mcp.json"))).mcpServers as Record<
        string,
        unknown
      >;
      expect(servers.other).toEqual({ command: "other-server" });
    }
    expect((await readJsonFile(join(box.ordinary, "settings.json"))).theme).toBe("dark");
    const shellSettings = await readJsonFile(join(box.gentleShell, "settings.json"));
    expect(shellSettings.quietStartup).toBe(true);
    expect(shellSettings.packages).toContain("npm:unrelated");
    const record = await readJsonFile(resolvePiPackageOwnershipPath(box.runtimeDir));
    expect(Object.values(record.profiles as Record<string, unknown>)).toEqual([
      { spec: resolvePiFacadeDir(box.runtimeDir), version: "9.9.9" },
      { spec: resolvePiFacadeDir(box.runtimeDir), version: "9.9.9" },
    ]);
  });

  it("is idempotent across repeated updates", async () => {
    const box = await dualProfileFixture();
    const update = (args: string[]) =>
      handleUpdateCommand(["--runtime-dir", box.runtimeDir, ...args], {
        env: box.env,
        releaseUpdateProvider: provider("9.9.9", box.bundleRoot),
        piPackageCommandRunner: fakePi,
      });
    await update([]);
    const watched = [box.ordinary, box.gentleShell].flatMap((agentDir) => [
      join(agentDir, "settings.json"),
      join(agentDir, "mcp.json"),
      join(agentDir, "APPEND_SYSTEM.md"),
    ]);
    const before = await snapshot([...watched, resolvePiPackageOwnershipPath(box.runtimeDir)]);

    const upToDate = await update([]);
    const forced = await update(["--force"]);

    expect(upToDate.exitCode).toBe(0);
    expect(forced.exitCode).toBe(0);
    expect(await snapshot([...watched, resolvePiPackageOwnershipPath(box.runtimeDir)])).toEqual(
      before,
    );
    await expectProfileAligned(box.gentleShell, box.runtimeDir, box.bundleRoot);
  });

  it("preserves an unowned development facade in gentle-shell and reports the recovery", async () => {
    const box = await dualProfileFixture();
    const devFacade = join(box.root, "dev-checkout", "plugin", "pi");
    await writeJsonFile(join(devFacade, "package.json"), {
      name: PI_PACKAGE_NAME,
      version: "4.4.9",
    });
    await writeJsonFile(join(box.gentleShell, "settings.json"), {
      packages: [relative(box.gentleShell, devFacade)],
    });
    await writeFile(
      join(box.gentleShell, "mcp.json"),
      `{ "mcpServers": { "dysflow": { "command": "dysflow", "args": ["mcp"] } } }\n`,
      "utf8",
    );
    const preserved = await snapshot([
      join(box.gentleShell, "settings.json"),
      join(box.gentleShell, "mcp.json"),
      join(box.gentleShell, "APPEND_SYSTEM.md"),
    ]);

    const result = await handleUpdateCommand(["--runtime-dir", box.runtimeDir], {
      env: box.env,
      releaseUpdateProvider: provider("9.9.9", box.bundleRoot),
      piPackageCommandRunner: fakePi,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`gentle-shell ${box.gentleShell}: NOT reconciled.`);
    expect(result.stderr).toContain(`Warning: Pi profile ${box.gentleShell}`);
    expect(result.stderr).toContain(`PI_CODING_AGENT_DIR=${box.gentleShell}`);
    expect(
      await snapshot([
        join(box.gentleShell, "settings.json"),
        join(box.gentleShell, "mcp.json"),
        join(box.gentleShell, "APPEND_SYSTEM.md"),
      ]),
    ).toEqual(preserved);
    await expectProfileAligned(box.ordinary, box.runtimeDir, box.bundleRoot);
  });

  it("leaves gentle-shell untouched under an explicit PI_CODING_AGENT_DIR or the exclusion", async () => {
    for (const extraEnv of [
      (box: { root: string }) => ({ PI_CODING_AGENT_DIR: join(box.root, "explicit-pi") }),
      () => ({ [SKIP_GENTLE_SHELL_ENV]: "true" }),
    ]) {
      const box = await dualProfileFixture();
      const watched = ["settings.json", "mcp.json", "APPEND_SYSTEM.md"].map((file) =>
        join(box.gentleShell, file),
      );
      const before = await snapshot(watched);

      const result = await handleUpdateCommand(["--runtime-dir", box.runtimeDir], {
        env: { ...box.env, ...extraEnv(box) },
        releaseUpdateProvider: provider("9.9.9", box.bundleRoot),
        piPackageCommandRunner: fakePi,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain("Additional Pi profiles:");
      expect(await snapshot(watched)).toEqual(before);
    }
  });

  it("skips gentle-shell skills and pointer when Pi is excluded from skill rollout", async () => {
    const box = await dualProfileFixture();

    const result = await handleUpdateCommand(["--runtime-dir", box.runtimeDir, "--exclude", "pi"], {
      env: box.env,
      releaseUpdateProvider: provider("9.9.9", box.bundleRoot),
      piPackageCommandRunner: fakePi,
    });

    expect(result.exitCode).toBe(0);
    expect(await readFile(join(box.gentleShell, "APPEND_SYSTEM.md"), "utf8")).toBe(
      "user-owned guidance\n",
    );
    await expect(readdir(join(box.gentleShell, "skills"))).rejects.toThrow();
  });
});

describe("dysflow install --agents pi covers the gentle-shell profile (#1822)", () => {
  it("wires an existing empty gentle-shell home alongside the ordinary profile", async () => {
    const box = await sandbox();
    const bundleRoot = await releasePackage(box.root, "9.9.9");
    await mkdir(box.gentleShell, { recursive: true });

    const result = await handleInstallCommand(
      ["--runtime-dir", box.runtimeDir, "--agents", "pi", "--no-tui"],
      { env: box.env, packageRoot: bundleRoot, piPackageCommandRunner: fakePi },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`gentle-shell ${box.gentleShell}: active (added)`);
    for (const agentDir of [box.ordinary, box.gentleShell]) {
      await expectProfileAligned(agentDir, box.runtimeDir, bundleRoot);
    }
  });
});

describe("dysflow uninstall removes owned wiring from every recorded Pi profile (#1822)", () => {
  /** Uninstall deletes the runtime and the marker: both stay inside the sandbox. */
  function uninstallEnv(box: { root: string; env: { USERPROFILE: string }; runtimeDir: string }) {
    return {
      ...box.env,
      DYSFLOW_HOME: box.runtimeDir,
      DYSFLOW_RUNTIME_MARKER_PATH: join(box.root, "marker", ".dysflow-marker"),
    };
  }

  /**
   * The pre-#1822 uninstall output for one profile. Lines before the success
   * line are the host-environment `DYSFLOW_HOME` warnings, which depend on the
   * process running the suite, not on the change.
   */
  function expectPlainUninstallSuccess(result: {
    exitCode: number;
    stdout: string;
    stderr: string;
  }) {
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const lines = result.stdout.split("\n");
    expect(lines.at(-1)).toBe("Dysflow uninstalled successfully.");
    expect(lines.slice(0, -1).every((line) => line.startsWith("Warning: DYSFLOW_"))).toBe(true);
  }

  async function installedDualProfiles() {
    const box = await sandbox();
    const bundleRoot = await releasePackage(box.root, "9.9.9");
    for (const agentDir of [box.ordinary, box.gentleShell]) {
      await writeJsonFile(join(agentDir, "mcp.json"), {
        mcpServers: { other: { command: "other-server" } },
      });
      await writeJsonFile(join(agentDir, "settings.json"), { theme: "dark", packages: ["npm:x"] });
      await writeFile(join(agentDir, "APPEND_SYSTEM.md"), "user-owned guidance\n", "utf8");
      await mkdir(join(agentDir, "skills", "user-skill"), { recursive: true });
      await writeFile(join(agentDir, "skills", "user-skill", "SKILL.md"), "# mine\n", "utf8");
    }
    const install = await handleInstallCommand(
      ["--runtime-dir", box.runtimeDir, "--agents", "pi", "--no-tui"],
      { env: box.env, packageRoot: bundleRoot, piPackageCommandRunner: fakePi },
    );
    expect(install.exitCode).toBe(0);
    return { ...box, bundleRoot };
  }

  async function expectProfileClean(agentDir: string) {
    expect(await readJsonFile(join(agentDir, "settings.json"))).toEqual({
      theme: "dark",
      packages: ["npm:x"],
    });
    expect((await readJsonFile(join(agentDir, "mcp.json"))).mcpServers).toEqual({
      other: { command: "other-server" },
    });
    expect(await readFile(join(agentDir, "APPEND_SYSTEM.md"), "utf8")).toBe(
      "user-owned guidance\n",
    );
    expect((await readdir(join(agentDir, "skills"))).sort()).toEqual(["user-skill"]);
  }

  it("finishes uninstall when an unowned facade sits next to the owned one (B1)", async () => {
    const box = await sandbox();
    const devFacade = join(box.root, "dev-checkout", "plugin", "pi");
    await writeJsonFile(join(devFacade, "package.json"), { name: PI_PACKAGE_NAME });
    const devEntry = relative(box.ordinary, devFacade);
    await writeJsonFile(join(box.ordinary, "settings.json"), {
      packages: [facadeEntry(box.ordinary, box.runtimeDir), devEntry],
    });
    await writeJsonFile(join(box.ordinary, "mcp.json"), {
      mcpServers: { dysflow: { command: launcher(box.runtimeDir), args: ["mcp"] } },
    });
    await writeJsonFile(resolvePiPackageOwnershipPath(box.runtimeDir), {
      packageName: PI_PACKAGE_NAME,
      spec: resolvePiFacadeDir(box.runtimeDir),
      version: "9.9.9",
      owned: true,
    });

    const result = await handleUninstallCommand([], {
      env: uninstallEnv(box),
      piPackageCommandRunner: fakePi,
    });

    expectPlainUninstallSuccess(result);
    expect((await readJsonFile(join(box.ordinary, "settings.json"))).packages).toEqual([devEntry]);
    expect((await readJsonFile(join(box.ordinary, "mcp.json"))).mcpServers).toEqual({});
    await expect(readdir(box.runtimeDir)).rejects.toThrow();
  });

  it("removes owned wiring from the gentle-shell profile install recorded (B2)", async () => {
    const box = await installedDualProfiles();

    const result = await handleUninstallCommand([], {
      env: uninstallEnv(box),
      piPackageCommandRunner: fakePi,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    await expectProfileClean(box.gentleShell);
    // The selected profile keeps its pre-#1822 uninstall behavior.
    expect((await readJsonFile(join(box.ordinary, "settings.json"))).packages).toEqual(["npm:x"]);
  });

  it("preserves and reports an unowned facade in a recorded gentle-shell profile", async () => {
    const box = await installedDualProfiles();
    const devFacade = join(box.root, "dev-checkout", "plugin", "pi");
    await writeJsonFile(join(devFacade, "package.json"), { name: PI_PACKAGE_NAME });
    await writeJsonFile(join(box.gentleShell, "settings.json"), {
      packages: [relative(box.gentleShell, devFacade)],
    });
    const before = await snapshot([join(box.gentleShell, "settings.json")]);

    const result = await handleUninstallCommand([], {
      env: uninstallEnv(box),
      piPackageCommandRunner: fakePi,
    });

    expect(result.exitCode).toBe(0);
    expect(await snapshot([join(box.gentleShell, "settings.json")])).toEqual(before);
    expect(result.stdout).toContain(`Pi profile ${box.gentleShell}`);
    expect(result.stdout).toContain("preserved");
    expect((await readJsonFile(join(box.gentleShell, "mcp.json"))).mcpServers).toEqual({
      other: { command: "other-server" },
    });
  });

  it("leaves gentle-shell untouched under an explicit PI_CODING_AGENT_DIR or the exclusion", async () => {
    for (const extra of [
      (box: { ordinary: string }) => ({ PI_CODING_AGENT_DIR: box.ordinary }),
      () => ({ [SKIP_GENTLE_SHELL_ENV]: "1" }),
    ]) {
      const box = await installedDualProfiles();
      const watched = ["settings.json", "mcp.json", "APPEND_SYSTEM.md"].map((file) =>
        join(box.gentleShell, file),
      );
      const before = await snapshot(watched);
      const skillsBefore = (await readdir(join(box.gentleShell, "skills"))).sort();

      const result = await handleUninstallCommand([], {
        env: { ...uninstallEnv(box), ...extra(box) },
        piPackageCommandRunner: fakePi,
      });

      expect(result.exitCode).toBe(0);
      expect(await snapshot(watched)).toEqual(before);
      expect((await readdir(join(box.gentleShell, "skills"))).sort()).toEqual(skillsBefore);
    }
  });

  it("keeps the single default profile uninstall output unchanged", async () => {
    const box = await sandbox();
    const bundleRoot = await releasePackage(box.root, "9.9.9");
    await mkdir(box.ordinary, { recursive: true });
    const install = await handleInstallCommand(
      ["--runtime-dir", box.runtimeDir, "--agents", "pi", "--no-tui"],
      { env: box.env, packageRoot: bundleRoot, piPackageCommandRunner: fakePi },
    );
    expect(install.exitCode).toBe(0);

    const result = await handleUninstallCommand([], {
      env: uninstallEnv(box),
      piPackageCommandRunner: fakePi,
    });

    expectPlainUninstallSuccess(result);
    expect((await readJsonFile(join(box.ordinary, "settings.json"))).packages).toEqual([]);
    expect((await readJsonFile(join(box.ordinary, "mcp.json"))).mcpServers).toEqual({});
  });
});
