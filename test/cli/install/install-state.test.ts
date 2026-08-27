/**
 * Issue #1521 — `<runtimeDir>/.dysflow-install-state.json` is what lets
 * `update` refuse a silent channel switch and `doctor` report what is running.
 * A half-written or hand-edited file must never be able to pin a runtime to a
 * channel it never installed, so the reader fails closed to `undefined`.
 */
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getInstallStatePath,
  INSTALL_STATE_FILE,
  parseInstallState,
  readInstallState,
  writeInstallState,
} from "../../../src/cli/commands/install/install-state";

const roots: string[] = [];

async function makeRuntimeDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "dysflow-install-state-"));
  roots.push(root);
  return join(root, "runtime");
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("install state round-trip", () => {
  it("reads back exactly what it wrote", async () => {
    const runtimeDir = await makeRuntimeDir();
    const state = {
      channel: "beta" as const,
      version: "2.39.0-rc.1",
      commitSha: "abc123def456",
      installedAt: "2026-08-23T17:00:00.000Z",
    };

    await writeInstallState(runtimeDir, state);

    expect(await readInstallState(runtimeDir)).toEqual(state);
  });

  it("omits commitSha when the channel could not resolve one", async () => {
    const runtimeDir = await makeRuntimeDir();
    await writeInstallState(runtimeDir, {
      channel: "stable",
      version: "2.38.2",
      installedAt: "2026-08-23T17:00:00.000Z",
    });

    const state = await readInstallState(runtimeDir);
    expect(state).toEqual({
      channel: "stable",
      version: "2.38.2",
      installedAt: "2026-08-23T17:00:00.000Z",
    });
    expect(state).not.toHaveProperty("commitSha");
  });

  it("replaces a previous record instead of appending to it", async () => {
    const runtimeDir = await makeRuntimeDir();
    await writeInstallState(runtimeDir, {
      channel: "stable",
      version: "2.38.2",
      installedAt: "2026-08-22T10:00:00.000Z",
    });
    await writeInstallState(runtimeDir, {
      channel: "main",
      version: "2.39.0",
      installedAt: "2026-08-23T17:00:00.000Z",
    });

    expect((await readInstallState(runtimeDir))?.channel).toBe("main");
    expect(JSON.parse(await readFile(getInstallStatePath(runtimeDir), "utf8"))).toMatchObject({
      channel: "main",
    });
  });

  it("leaves no temporary file behind, so the directory only ever shows the final record", async () => {
    const runtimeDir = await makeRuntimeDir();
    await writeInstallState(runtimeDir, {
      channel: "main",
      version: "2.39.0",
      installedAt: "2026-08-23T17:00:00.000Z",
    });

    expect(await readdir(runtimeDir)).toEqual([INSTALL_STATE_FILE]);
  });
});

describe("install state failure modes", () => {
  it("returns undefined when no runtime has been installed yet", async () => {
    expect(await readInstallState(await makeRuntimeDir())).toBeUndefined();
  });

  it("returns undefined for a truncated or corrupt file rather than guessing", async () => {
    const runtimeDir = await makeRuntimeDir();
    await writeInstallState(runtimeDir, {
      channel: "beta",
      version: "2.39.0-rc.1",
      installedAt: "2026-08-23T17:00:00.000Z",
    });
    await writeFile(getInstallStatePath(runtimeDir), '{ "channel": "be', "utf8");

    expect(await readInstallState(runtimeDir)).toBeUndefined();
  });

  it.each([
    ['{"channel":"nightly","version":"1.0.0","installedAt":"now"}', "unknown channel"],
    ['{"channel":"stable","installedAt":"now"}', "missing version"],
    ['{"channel":"stable","version":"1.0.0"}', "missing installedAt"],
    ['{"channel":"stable","version":"","installedAt":"now"}', "empty version"],
    ['{"channel":"stable","version":"1.0.0","installedAt":"now","commitSha":7}', "non-string sha"],
    ["[]", "not an object"],
    ["null", "null"],
  ])("refuses %j (%s)", (raw) => {
    expect(parseInstallState(raw)).toBeUndefined();
  });
});
