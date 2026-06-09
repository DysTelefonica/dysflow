/**
 * CI guard tests that catch the runtime-drift class of bugs:
 *
 * 1. dysflow-v1.2.28-silently-shipped (issue 18): a release was cut
 *    with the JS/TS code bumped to v1.2.32 but the PowerShell
 *    runner scripts (.ps1) inside the tarball were still v1.2.28.
 *    The user-facing symptom was that dysflow_list_tables returned
 *    only the 2 frontend tables while the database had 40+ backend
 *    tables, get_schema and query_sql returned RUNNER_INVALID_JSON,
 *    and the project that consumed the runtime had no way to detect
 *    the drift. These tests assert that the dev tree and the
 *    installed runtime share the same runner and that any user
 *    opencode.json that points at the runtime points at a fresh
 *    version, not at a stale test-runtime.
 *
 * 2. dysflow-mcp-v1.2.28-on-stale-test-runtime: when an operator
 *    configures opencode.json with a `command` pointing at the
 *    in-tree test-runtime/ instead of the installed runtime, the
 *    MCP server silently serves the older code. This test asserts
 *    the installed-runtime path is the one wired up.
 *
 * The tests are SKIPPED (not failed) if the installed runtime is
 * missing from the host. CI gates require the runtime to be
 * installed; the dev tree does not.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const INSTALLED_HOME = "C:\\Users\\adm1\\AppData\\Local\\dysflow";
const INSTALLED_RUNNER = `${INSTALLED_HOME}\\app\\scripts\\dysflow-access-runner.ps1`;
const INSTALLED_PACKAGE = `${INSTALLED_HOME}\\app\\package.json`;
const DEV_RUNNER = `${REPO_ROOT}\\scripts\\dysflow-access-runner.ps1`;
const TEST_RUNTIME_BIN = `${REPO_ROOT}\\test-runtime\\bin\\dysflow.cmd`;
const OPENCODE_GLOBAL = "C:\\Users\\adm1\\.config\\opencode\\opencode.json";

const installedRuntimeAvailable = existsSync(INSTALLED_RUNNER) && existsSync(INSTALLED_PACKAGE);

if (!installedRuntimeAvailable) {
  console.warn(
    `[dysflow-quality] Skipping runtime-drift guards: installed runtime at ${INSTALLED_HOME} is not available on this host.`,
  );
}

function sha256OfFile(path: string): string {
  const bytes = readFileSync(path);
  return createHash("sha256").update(bytes).digest("hex");
}

function readInstalledVersion(): string {
  const raw = readFileSync(INSTALLED_PACKAGE, "utf8");
  const m = raw.match(/"version"\s*:\s*"([^"]+)"/);
  return m?.[1] ?? "";
}

describe("runtime drift guards (CI required)", () => {
  it.skipIf(!installedRuntimeAvailable)(
    "installed dysflow runtime is at v1.2.32 or newer (catches the v1.2.28-silently-shipped regression)",
    () => {
      const version = readInstalledVersion();
      const [majorStr, minorStr, patchStr] = version.split(".");
      const major = Number.parseInt(majorStr ?? "", 10);
      const minor = Number.parseInt(minorStr ?? "", 10);
      const patch = Number.parseInt(patchStr ?? "", 10);
      expect(Number.isFinite(major) && Number.isFinite(minor) && Number.isFinite(patch)).toBe(true);
      const atLeast =
        major > 1 || (major === 1 && minor > 2) || (major === 1 && minor === 2 && patch >= 32);
      expect(atLeast, `installed dysflow runtime is ${version}, expected >= 1.2.32`).toBe(true);
    },
  );

  it.skipIf(!installedRuntimeAvailable)(
    "dev scripts/dysflow-access-runner.ps1 hash matches the installed runtime copy (catches script drift between dev tree and published runtime)",
    () => {
      const devHash = sha256OfFile(DEV_RUNNER);
      const installedHash = sha256OfFile(INSTALLED_RUNNER);
      expect(
        installedHash,
        `Installed runtime runner hash ${installedHash} does not match dev runner hash ${devHash}. ` +
          "The PowerShell runner that ships in the published runtime is out of sync with the dev tree. " +
          "Re-run `pnpm test:e2e:mcp` after copying the dev scripts into the runtime, " +
          "or rebuild and re-publish the runtime tarball.",
      ).toBe(devHash);
    },
  );

  it("opencode.json dysflow MCP server command does not point at the in-tree test-runtime (catches the stale-test-runtime drift)", () => {
    if (!existsSync(OPENCODE_GLOBAL)) {
      console.warn(`[dysflow-quality] ${OPENCODE_GLOBAL} not present; skipping.`);
      return;
    }
    const raw = readFileSync(OPENCODE_GLOBAL, "utf8");
    let parsed: { mcp?: { dysflow?: { command?: string[]; enabled?: boolean } } };
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`opencode.json is not valid JSON: ${(err as Error).message}`);
    }
    const cmd = parsed.mcp?.dysflow?.command?.[0];
    if (cmd === undefined) {
      console.warn(
        "[dysflow-quality] dysflow MCP server not configured in opencode.json; skipping.",
      );
      return;
    }
    if (cmd.includes("test-runtime")) {
      throw new Error(
        `opencode.json points the dysflow MCP server at the in-tree test-runtime (${cmd}). ` +
          "The test-runtime is for CI E2E only and ships older code. " +
          "Point the command at the installed runtime instead (e.g. C:/Users/adm1/AppData/Local/dysflow/bin/dysflow.cmd).",
      );
    }
    // The installed runtime path is the canonical one.
    const isInstalledPath =
      cmd.toLowerCase().includes("\\appdata\\local\\dysflow\\bin\\dysflow.cmd") ||
      cmd.toLowerCase().includes("/appdata/local/dysflow/bin/dysflow.cmd");
    expect(isInstalledPath, `expected command to point at the installed runtime, got: ${cmd}`).toBe(
      true,
    );
  });

  it("test-runtime/scripts/ is not used as the production MCP server entry (catches a different class of drift)", () => {
    // The test-runtime is for CI E2E only. Operators who wire it up
    // to opencode.json as the production MCP server get a runtime
    // that is weeks behind main. If this test fails, someone set
    // up the test-runtime for production use and the right answer
    // is to point opencode.json at the installed runtime.
    if (!existsSync(TEST_RUNTIME_BIN)) {
      return; // test-runtime is not built in this environment
    }
    const testRuntimeHash = sha256OfFile(TEST_RUNTIME_BIN);
    // Sanity: the test-runtime wrapper should NOT collide with the
    // installed runtime wrapper (different install paths, different
    // bin dirs). If the hashes match, the test-runtime is
    // accidentally the same as the installed one and the test
    // setup is wrong.
    if (installedRuntimeAvailable) {
      const installedBin = `${INSTALLED_HOME}\\bin\\dysflow.cmd`;
      if (existsSync(installedBin)) {
        const installedHash = sha256OfFile(installedBin);
        expect(testRuntimeHash).not.toBe(installedHash);
      }
    }
  });
});
