/**
 * Issue #1521 — `dysflow doctor` reports the install channel in plain text and
 * warns on the two unsigned channels. It reports; it never switches.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handleDoctorCommand } from "../../src/cli/commands/doctor";
import { CHANNEL_ERROR_CODES } from "../../src/cli/commands/install/channel";
import { writeInstallState } from "../../src/cli/commands/install/install-state";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function createRuntimeDir(): Promise<{ runtimeDir: string; env: NodeJS.ProcessEnv }> {
  const root = await mkdtemp(join(tmpdir(), "dysflow-doctor-channel-"));
  roots.push(root);
  const runtimeDir = join(root, "runtime");
  return {
    runtimeDir,
    env: {
      USERPROFILE: join(root, "home"),
      HOME: join(root, "home"),
      DYSFLOW_HOME: runtimeDir,
      DYSFLOW_RUNTIME_MARKER_PATH: join(root, "marker", ".dysflow-marker"),
    },
  };
}

/** Category D is read-only and spawns nothing, so it is the cheapest carrier. */
const READ_ONLY_ARGS = ["--category", "D", "--cwd"] as const;

describe("doctor channel reporting", () => {
  it("reports the default stable channel with no warning", async () => {
    const { runtimeDir, env } = await createRuntimeDir();

    const result = await handleDoctorCommand([...READ_ONLY_ARGS, process.cwd()], { env });

    expect(result.stdout.split("\n")[0]).toBe("Dysflow install channel: stable (source: default)");
    expect(result.stdout).not.toContain("WARN: insecure channel");
    expect(runtimeDir).toBeTruthy();
  });

  it("reports the persisted channel and warns when it is unsigned", async () => {
    const { runtimeDir, env } = await createRuntimeDir();
    await writeInstallState(runtimeDir, {
      channel: "main",
      version: "2.39.0",
      installedAt: "2026-08-23T17:00:00.000Z",
    });

    const result = await handleDoctorCommand([...READ_ONLY_ARGS, process.cwd()], { env });

    const lines = result.stdout.split("\n");
    expect(lines[0]).toBe("Dysflow install channel: main (source: state)");
    expect(lines[1]).toBe("WARN: insecure channel, expect breakage");
  });

  it("lets --channel report what a channel would resolve to without changing state", async () => {
    const { runtimeDir, env } = await createRuntimeDir();
    await writeInstallState(runtimeDir, {
      channel: "stable",
      version: "2.38.2",
      installedAt: "2026-08-23T17:00:00.000Z",
    });

    const result = await handleDoctorCommand(
      ["--channel", "beta", ...READ_ONLY_ARGS, process.cwd()],
      { env },
    );

    const lines = result.stdout.split("\n");
    expect(lines[0]).toBe("Dysflow install channel: beta (source: flag)");
    expect(lines[1]).toBe("WARN: insecure channel, expect breakage");
  });

  it("rejects an unknown channel with the documented code", async () => {
    const { env } = await createRuntimeDir();

    const result = await handleDoctorCommand(["--channel", "nightly"], { env });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(CHANNEL_ERROR_CODES.unknownChannel);
  });

  it("keeps --help free of side effects and documents the flag", async () => {
    const result = await handleDoctorCommand(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[--channel stable|beta|main]");
    expect(result.stdout).not.toContain("Dysflow install channel:");
  });
});
