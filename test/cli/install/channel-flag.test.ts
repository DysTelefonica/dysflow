/**
 * Issue #1521 — per-channel gating for `dysflow install` / `dysflow update`.
 *
 * The behavior under test is what the operator observes: which requests are
 * refused, with which documented code, whether the network was touched at all,
 * and what ends up recorded in install state. The process boundary (pnpm/tar)
 * and the release provider are the only things stubbed.
 */
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFile: execFileMock }));
execFileMock.mockImplementation(
  (_file: unknown, _args: unknown, options: unknown, callback: (...args: unknown[]) => void) => {
    const cb = typeof options === "function" ? options : callback;
    if (cb) queueMicrotask(() => cb(null, { stdout: "", stderr: "" }));
  },
);

import { handleInstallCommand } from "../../../src/cli/commands/install";
import { CHANNEL_ERROR_CODES } from "../../../src/cli/commands/install/channel";
import type { ReleaseUpdateProvider } from "../../../src/cli/commands/install/downloader";
import {
  readInstallState,
  writeInstallState,
} from "../../../src/cli/commands/install/install-state";
import { handleUpdateCommand } from "../../../src/cli/commands/install/updater";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

type Fixture = {
  root: string;
  home: string;
  runtimeDir: string;
  packageRoot: string;
  env: NodeJS.ProcessEnv;
};

async function createFixture(version = "9.9.9"): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "dysflow-channel-flag-"));
  roots.push(root);
  const home = join(root, "home");
  const runtimeDir = join(root, "runtime");
  const packageRoot = join(root, "package");

  await mkdir(join(packageRoot, "dist", "cli"), { recursive: true });
  await writeFile(join(packageRoot, "dist", "cli", "index.js"), `MARKER_${version}`, "utf8");
  await mkdir(join(packageRoot, "scripts"), { recursive: true });
  await writeFile(join(packageRoot, "scripts", "noop.ps1"), "# noop", "utf8");
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({ name: "dysflow", version, type: "module" }, null, 2),
    "utf8",
  );
  await cp(join(process.cwd(), "skills"), join(packageRoot, "skills"), { recursive: true });
  await mkdir(home, { recursive: true });

  return {
    root,
    home,
    runtimeDir,
    packageRoot,
    env: {
      USERPROFILE: home,
      HOME: home,
      DYSFLOW_RUNTIME_MARKER_PATH: join(root, "marker", ".dysflow-marker"),
    },
  };
}

/** Marks an installed runtime at `version` so update has something to compare. */
async function seedInstalledRuntime(runtimeDir: string, version: string): Promise<void> {
  await mkdir(join(runtimeDir, "app"), { recursive: true });
  await writeFile(
    join(runtimeDir, "app", "package.json"),
    JSON.stringify({ name: "dysflow", version }),
    "utf8",
  );
}

type CountingProvider = ReleaseUpdateProvider & { calls: number };

function providerThatMustNotRun(): CountingProvider {
  const provider: CountingProvider = {
    calls: 0,
    async resolveLatestRelease() {
      provider.calls += 1;
      throw new Error("the gate should have refused before any network work");
    },
    async preparePackage() {
      provider.calls += 1;
      throw new Error("the gate should have refused before any download");
    },
  };
  return provider;
}

function reachableProvider(fixture: Fixture, version = "9.9.9"): ReleaseUpdateProvider {
  return {
    async resolveLatestRelease() {
      return { version, tagName: `v${version}` };
    },
    async preparePackage() {
      return { packageRoot: fixture.packageRoot, commitSha: "a".repeat(40) };
    },
  };
}

describe("update channel gating", () => {
  const cases = [
    {
      name: "an unknown channel is refused before anything else happens",
      args: ["--channel", "nightly"],
      env: {},
      code: CHANNEL_ERROR_CODES.unknownChannel,
    },
    {
      name: "beta requires the insecure-update gate",
      args: ["--channel", "beta"],
      env: {},
      code: CHANNEL_ERROR_CODES.insecureGateMissing,
    },
    {
      name: "main requires the insecure-update gate",
      args: ["--channel", "main"],
      env: {},
      code: CHANNEL_ERROR_CODES.insecureGateMissing,
    },
    {
      name: "a channel selected through the environment is gated the same way",
      args: [],
      env: { DYSFLOW_CHANNEL: "main" },
      code: CHANNEL_ERROR_CODES.insecureGateMissing,
    },
    {
      name: "--skip-checksum is refused on beta even with the insecure gate open",
      args: ["--channel", "beta", "--skip-checksum"],
      env: { DYSFLOW_ALLOW_INSECURE_UPDATE: "1" },
      code: CHANNEL_ERROR_CODES.skipChecksumRequiresStableChannel,
    },
    {
      name: "--skip-checksum is refused on main even with the insecure gate open",
      args: ["--channel", "main", "--skip-checksum"],
      env: { DYSFLOW_ALLOW_INSECURE_UPDATE: "1" },
      code: CHANNEL_ERROR_CODES.skipChecksumRequiresStableChannel,
    },
  ] as const;

  it.each(cases)("$name", async ({ args, env, code }) => {
    const fixture = await createFixture();
    await seedInstalledRuntime(fixture.runtimeDir, "1.0.0");
    const provider = providerThatMustNotRun();

    const result = await handleUpdateCommand(["--runtime-dir", fixture.runtimeDir, ...args], {
      env: { ...fixture.env, ...env },
      releaseUpdateProvider: provider,
      packageRoot: fixture.packageRoot,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(code);
    expect(result.stderr).toContain("docs/security/update-trust-model.md");
    expect(provider.calls).toBe(0);
  });

  it("refuses main without the gate even when the artifact is reachable", async () => {
    const fixture = await createFixture();
    await seedInstalledRuntime(fixture.runtimeDir, "1.0.0");
    let prepared = false;

    const result = await handleUpdateCommand(
      ["--runtime-dir", fixture.runtimeDir, "--channel", "main"],
      {
        env: fixture.env,
        releaseUpdateProvider: {
          async resolveLatestRelease() {
            return { version: "main" };
          },
          async preparePackage() {
            prepared = true;
            return { packageRoot: fixture.packageRoot };
          },
        },
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(CHANNEL_ERROR_CODES.insecureGateMissing);
    expect(prepared).toBe(false);
  });
});

describe("update channel pin", () => {
  it("refuses to switch channels without --force", async () => {
    const fixture = await createFixture();
    await seedInstalledRuntime(fixture.runtimeDir, "1.0.0");
    await writeInstallState(fixture.runtimeDir, {
      channel: "stable",
      version: "1.0.0",
      installedAt: "2026-08-22T10:00:00.000Z",
    });
    const provider = providerThatMustNotRun();

    const result = await handleUpdateCommand(
      ["--runtime-dir", fixture.runtimeDir, "--channel", "beta"],
      {
        env: { ...fixture.env, DYSFLOW_ALLOW_INSECURE_UPDATE: "1" },
        releaseUpdateProvider: provider,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(CHANNEL_ERROR_CODES.channelPinRequiresForce);
    expect(result.stderr).toContain("docs/security/update-trust-model.md");
    expect(provider.calls).toBe(0);
    expect((await readInstallState(fixture.runtimeDir))?.channel).toBe("stable");
  });

  it("switches channels when --force is passed and records the new pin", async () => {
    const fixture = await createFixture();
    await seedInstalledRuntime(fixture.runtimeDir, "1.0.0");
    await writeInstallState(fixture.runtimeDir, {
      channel: "stable",
      version: "1.0.0",
      installedAt: "2026-08-22T10:00:00.000Z",
    });

    const result = await handleUpdateCommand(
      ["--runtime-dir", fixture.runtimeDir, "--channel", "beta", "--force"],
      {
        env: { ...fixture.env, DYSFLOW_ALLOW_INSECURE_UPDATE: "1" },
        releaseUpdateProvider: reachableProvider(fixture),
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Dysflow install channel: beta (source: flag)");
    const state = await readInstallState(fixture.runtimeDir);
    expect(state?.channel).toBe("beta");
    expect(state?.version).toBe("9.9.9");
  });

  it("re-running update on the pinned channel stays allowed and idempotent", async () => {
    const fixture = await createFixture();
    await seedInstalledRuntime(fixture.runtimeDir, "1.0.0");
    await writeInstallState(fixture.runtimeDir, {
      channel: "beta",
      version: "1.0.0",
      installedAt: "2026-08-22T10:00:00.000Z",
    });

    const env = { ...fixture.env, DYSFLOW_ALLOW_INSECURE_UPDATE: "1" };
    const first = await handleUpdateCommand(["--runtime-dir", fixture.runtimeDir], {
      env,
      releaseUpdateProvider: reachableProvider(fixture),
    });
    const second = await handleUpdateCommand(["--runtime-dir", fixture.runtimeDir], {
      env,
      releaseUpdateProvider: reachableProvider(fixture),
    });

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect((await readInstallState(fixture.runtimeDir))?.channel).toBe("beta");
  });
});

describe("stable channel is unchanged", () => {
  it("updates without a channel banner and pins stable", async () => {
    const fixture = await createFixture();
    await seedInstalledRuntime(fixture.runtimeDir, "1.0.0");

    const result = await handleUpdateCommand(["--runtime-dir", fixture.runtimeDir], {
      env: fixture.env,
      releaseUpdateProvider: reachableProvider(fixture),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "Dysflow runtime update: upgrading from v1.0.0 to v9.9.9 (1.0.0 -> 9.9.9)",
    );
    expect(result.stdout).not.toContain("Dysflow install channel:");
    expect(result.stdout).not.toContain("WARN: insecure channel");
    expect((await readInstallState(fixture.runtimeDir))?.channel).toBe("stable");
  });

  it("selects the stable provider by default and never asks for the insecure gate", async () => {
    const fixture = await createFixture();
    await seedInstalledRuntime(fixture.runtimeDir, "1.0.0");
    let requestedChannel: string | undefined;

    const result = await handleUpdateCommand(["--runtime-dir", fixture.runtimeDir], {
      env: fixture.env,
      createReleaseUpdateProvider: (channel) => {
        requestedChannel = channel;
        return reachableProvider(fixture);
      },
    });

    expect(requestedChannel).toBe("stable");
    expect(result.exitCode).toBe(0);
  });
});

describe("install channel gating", () => {
  it("installs the local package and pins stable when no channel is requested", async () => {
    const fixture = await createFixture();

    const result = await handleInstallCommand(["--runtime-dir", fixture.runtimeDir, "--no-tui"], {
      env: fixture.env,
      packageRoot: fixture.packageRoot,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Dysflow install channel:");
    expect(await readFile(join(fixture.runtimeDir, "app", "dist", "cli", "index.js"), "utf8")).toBe(
      "MARKER_9.9.9",
    );
    expect(await readInstallState(fixture.runtimeDir)).toMatchObject({
      channel: "stable",
      version: "9.9.9",
    });
  });

  it("refuses an unsigned channel without the gate and never fetches", async () => {
    const fixture = await createFixture();
    let providerRequested = false;

    const result = await handleInstallCommand(
      ["--runtime-dir", fixture.runtimeDir, "--no-tui", "--channel", "beta"],
      {
        env: fixture.env,
        packageRoot: fixture.packageRoot,
        createReleaseUpdateProvider: () => {
          providerRequested = true;
          return reachableProvider(fixture);
        },
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(CHANNEL_ERROR_CODES.insecureGateMissing);
    expect(providerRequested).toBe(false);
    expect(await readInstallState(fixture.runtimeDir)).toBeUndefined();
  });

  it("installs the main channel build and records the channel and commit", async () => {
    const fixture = await createFixture("9.9.9");
    let cleaned = false;

    const result = await handleInstallCommand(
      ["--runtime-dir", fixture.runtimeDir, "--no-tui", "--channel", "main"],
      {
        env: { ...fixture.env, DYSFLOW_ALLOW_INSECURE_UPDATE: "1" },
        createReleaseUpdateProvider: (channel) => ({
          channel,
          isRolling: true,
          async resolveLatestRelease() {
            return { version: "main", commitSha: "b".repeat(40) };
          },
          async preparePackage() {
            return {
              packageRoot: fixture.packageRoot,
              commitSha: "b".repeat(40),
              cleanup: async () => {
                cleaned = true;
              },
            };
          },
        }),
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Dysflow install channel: main (source: flag)");
    expect(result.stdout).toContain("WARN: insecure channel, expect breakage");
    expect(await readFile(join(fixture.runtimeDir, "app", "dist", "cli", "index.js"), "utf8")).toBe(
      "MARKER_9.9.9",
    );
    expect(await readInstallState(fixture.runtimeDir)).toMatchObject({
      channel: "main",
      version: "9.9.9",
      commitSha: "b".repeat(40),
    });
    expect(cleaned).toBe(true);
  });
});
