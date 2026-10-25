/**
 * Issue #1863 — import_modules lint gate.
 *
 * apply:true is refused with LINT_FINDINGS_ERROR when a module being imported
 * has an error-severity lint finding, before the runner is spawned. apply:false
 * is a preview: the findings are reported as warnings and nothing is spawned.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type VbaManagerExecutor,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { noopPreflightCleanup } from "../../_helpers/noop-preflight-cleanup.js";

const BAD_MODULE = [
  'Attribute VB_Name = "ModBad"',
  "Option Compare Database",
  "Option Explicit",
  "",
  "Public Sub Demo(Optional ByRef p_Error As String, ByVal x As Long)",
  "End Sub",
  "",
].join("\r\n");

const CLEAN_MODULE = [
  'Attribute VB_Name = "ModClean"',
  "Option Compare Database",
  "Option Explicit",
  "",
  "Public Sub Ok()",
  "End Sub",
  "",
].join("\r\n");

function buildAdapter(executor: VbaManagerExecutor, destinationRoot: string) {
  return new VbaSyncAdapter({
    preflightCleanup: noopPreflightCleanup(),
    executor,
    scriptPath: "scripts/dysflow-vba-manager.ps1",
    accessPath: "C:/db/front.accdb",
    destinationRoot,
    env: {},
  });
}

function okExecutor(calls: { count: number }): VbaManagerExecutor {
  return async () => {
    calls.count += 1;
    return {
      exitCode: 0,
      stdout: "DYSFLOW_RESULT []",
      stderr: "",
      durationMs: 1,
      timedOut: false,
    };
  };
}

describe("import_modules — lint gate (#1863)", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), "dysflow-lint-gate-"));
    await mkdir(join(tmpRoot, "modules"), { recursive: true });
  });

  afterEach(async () => {
    if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
  });

  it("refuses apply:true with LINT_FINDINGS_ERROR and never spawns the runner", async () => {
    await writeFile(join(tmpRoot, "modules", "ModBad.bas"), BAD_MODULE, "utf8");
    const calls = { count: 0 };
    const adapter = buildAdapter(okExecutor(calls), tmpRoot);

    const result = await adapter.execute("import_modules", {
      destinationRoot: tmpRoot,
      moduleNames: ["ModBad"],
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("LINT_FINDINGS_ERROR");
    expect(result.error.message).toContain("error-param-last");
    expect(calls.count).toBe(0);
  });

  it("apply:false previews the lint findings as warnings and never runs a write", async () => {
    await writeFile(join(tmpRoot, "modules", "ModBad.bas"), BAD_MODULE, "utf8");
    // The dry run may read through a read-only export (#1878): only Import is a write.
    const actions: string[] = [];
    const adapter = buildAdapter(async (request) => {
      actions.push(String(request.action));
      return {
        exitCode: 0,
        stdout: "DYSFLOW_RESULT []",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    }, tmpRoot);

    const result = await adapter.execute("import_modules", {
      destinationRoot: tmpRoot,
      moduleNames: ["ModBad"],
      apply: false,
    });

    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).toContain("error-param-last");
    expect(actions).not.toContain("Import");
  });

  it("imports a module with no error-severity finding", async () => {
    await writeFile(join(tmpRoot, "modules", "ModClean.bas"), CLEAN_MODULE, "utf8");
    const calls = { count: 0 };
    const adapter = buildAdapter(okExecutor(calls), tmpRoot);

    const result = await adapter.execute("import_modules", {
      destinationRoot: tmpRoot,
      moduleNames: ["ModClean"],
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(calls.count).toBe(1);
  });
});
