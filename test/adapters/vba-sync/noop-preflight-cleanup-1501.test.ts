import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const mockExecFile = vi.fn();
const mockSpawn = vi.fn();
vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

import {
  type VbaManagerExecutor,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter.js";

const TEST_ROOT = resolve(process.cwd(), "test");
const PREFLIGHT_EXEMPTIONS: Readonly<Record<string, string>> = Object.freeze({});

function typeScriptFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return typeScriptFilesUnder(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

function adaptersWithoutPreflightCleanup(): string[] {
  return typeScriptFilesUnder(TEST_ROOT)
    .filter((path) =>
      /new\s+(?:VbaSyncAdapter|VbaModulesAdapter)\s*\(/.test(readFileSync(path, "utf8")),
    )
    .filter((path) => !/(?:preflightCleanup|runPreflightCleanup)/.test(readFileSync(path, "utf8")))
    .map((path) => relative(process.cwd(), path).replaceAll("\\", "/"))
    .filter((path) => PREFLIGHT_EXEMPTIONS[path] === undefined)
    .sort();
}

describe("#1501 no-op preflight cleanup", () => {
  it("returns the complete empty cleanup result", async () => {
    const { noopPreflightCleanup } = await import("../../_helpers/noop-preflight-cleanup.js");

    await expect(
      noopPreflightCleanup().cleanup({ accessPath: "C:/db/front.accdb", projectRoot: "C:/repo" }),
    ).resolves.toEqual({
      cleaned: [],
      killed: [],
      orphanedKilled: [],
      errors: [],
      transitioned: [],
    });
  });

  it("spawns no process when a mocked executor runs with the no-op preflight", async () => {
    const { noopPreflightCleanup } = await import("../../_helpers/noop-preflight-cleanup.js");
    const executor = vi.fn<VbaManagerExecutor>(async () => ({
      exitCode: 0,
      stdout: `DYSFLOW_RESULT ${JSON.stringify({
        module: "Module1",
        status: "ok",
        phase: null,
        error: null,
        durationMs: 1,
        rollbackApplied: false,
        fallbackUsed: false,
        fallbackReason: null,
      })}`,
      stderr: "",
      durationMs: 1,
      timedOut: false,
    }));
    const adapter = new VbaSyncAdapter({
      executor,
      preflightCleanup: noopPreflightCleanup(),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: "C:/repo/src",
      env: {},
    });

    const result = await adapter.execute("import_modules", {
      moduleNames: ["Module1"],
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(executor).toHaveBeenCalledTimes(1);
    expect(mockExecFile).not.toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});

describe("#1501 structural preflight injection guard", () => {
  it("finds no adapter-building test without an injected preflight cleanup", () => {
    expect(
      adaptersWithoutPreflightCleanup(),
      "Inject noopPreflightCleanup(), or add a reasoned exemption when the test exercises real preflight behavior.",
    ).toEqual([]);
  });

  it("keeps every exemption explicit and reasoned", () => {
    const bare = Object.entries(PREFLIGHT_EXEMPTIONS)
      .filter(([, reason]) => reason.trim().length === 0)
      .map(([path]) => path);
    expect(bare).toEqual([]);
  });
});
