/**
 * Issue #830 — default `CodeGraphVbaInvoker` factory unit tests.
 *
 * The default factory (`createDefaultCodeGraphVbaInvoker`) is the production
 * adapter that dysflow uses when no override is supplied. Its contract is
 * "best-effort + opt-in flag": it MUST NEVER throw, and any failure (no
 * `.codegraph/` index, CLI missing, parse error, subprocess error) collapses
 * to `{ evidence: [], warning: "<reason>" }`.
 *
 * These tests pin that contract end-to-end without spinning up a real
 * codegraph-vba process. The `command` option overrides the CLI binary path
 * to a controlled stub script that we author per-scenario.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createDefaultCodeGraphVbaInvoker,
  parseCodeGraphJson,
} from "../../../src/adapters/codegraph-vba/codegraph-vba-invoker.js";

describe("createDefaultCodeGraphVbaInvoker", () => {
  // Use OS temp dir as the "project root" for these tests — we need a path
  // that exists (for the "happy path" sub-test) AND we need to test the
  // "no .codegraph/ index" path against a path that exists but doesn't
  // contain `.codegraph/`.
  const projectRoot = mkdtempSync(join(tmpdir(), "codegraph-vba-invoker-test-"));
  // Pre-create .codegraph/ so the "happy path" sub-tests reach the CLI
  // invocation branch (instead of being short-circuited by the absence check).
  mkdirSync(join(projectRoot, ".codegraph"));

  it("returns empty evidence + warning when projectPath does not exist", async () => {
    const invoker = createDefaultCodeGraphVbaInvoker();
    const result = await invoker.fetchBehaviorEvidence({
      formName: "Customer",
      controlNames: ["cmdSave"],
      projectPath: join(projectRoot, "does-not-exist"),
    });

    expect(result.evidence).toEqual([]);
    expect(result.warning).toMatch(/does not exist/);
  });

  it("reports both supported index paths when neither is present", async () => {
    // Create a fresh sibling temp dir without `.codegraph/` so the absence
    // check fires. The shared `projectRoot` has `.codegraph/`, so we can't
    // reuse it for this case.
    const emptyProjectRoot = mkdtempSync(join(tmpdir(), "codegraph-vba-invoker-empty-"));
    try {
      const invoker = createDefaultCodeGraphVbaInvoker();
      const result = await invoker.fetchBehaviorEvidence({
        formName: "Customer",
        controlNames: ["cmdSave"],
        projectPath: emptyProjectRoot,
      });

      expect(result.evidence).toEqual([]);
      expect(result.codegraphIndexPath).toBeNull();
      expect(result.warning).toContain(".codegraph-vba/");
      expect(result.warning).toContain(".codegraph/");
      expect(result.warning).toMatch(/Run `codegraph-vba init`/);
    } finally {
      rmSync(emptyProjectRoot, { recursive: true, force: true });
    }
  });

  it("uses the fork .codegraph-vba index before the upstream index", async () => {
    const root = mkdtempSync(join(tmpdir(), "codegraph-vba-fork-priority-"));
    mkdirSync(join(root, ".codegraph-vba"));
    mkdirSync(join(root, ".codegraph"));
    const scriptPath = join(root, "success.cmd");
    writeFileSync(
      scriptPath,
      "@node -e \"console.log(JSON.stringify({results:[{handler:'cmdSave_Click',callPath:['cmdSave_Click']}]}))\"\r\n",
    );
    try {
      const result = await createDefaultCodeGraphVbaInvoker({
        command: scriptPath,
      }).fetchBehaviorEvidence({
        formName: "Customer",
        controlNames: ["cmdSave"],
        projectPath: root,
      });
      expect(result.codegraphIndexPath).toBe(join(root, ".codegraph-vba"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("falls back to the upstream .codegraph index", async () => {
    const root = mkdtempSync(join(tmpdir(), "codegraph-vba-upstream-"));
    mkdirSync(join(root, ".codegraph"));
    const result = await createDefaultCodeGraphVbaInvoker({
      command: "missing-codegraph-cli",
    }).fetchBehaviorEvidence({ formName: "Customer", controlNames: [], projectPath: root });
    expect(result.codegraphIndexPath).toBe(join(root, ".codegraph"));
    rmSync(root, { recursive: true, force: true });
  });

  it.runIf(process.platform === "win32")(
    "resolves an extensionless Windows command to a .cmd shim in a path with spaces",
    async () => {
      const binDir = join(projectRoot, "CLI stubs with spaces");
      mkdirSync(binDir);
      const command = join(binDir, "codegraph-vba");
      writeFileSync(
        `${command}.cmd`,
        "@node -e \"console.log(JSON.stringify({results:[{handler:'cmdSave_Click',callPath:['cmdSave_Click']}]}))\"\r\n",
      );

      try {
        const result = await createDefaultCodeGraphVbaInvoker({ command }).fetchBehaviorEvidence({
          formName: "Customer",
          controlNames: ["cmdSave"],
          projectPath: projectRoot,
        });

        expect(result.evidence, result.warning).toEqual([
          { handler: "cmdSave_Click", callPath: ["cmdSave_Click"] },
        ]);
        expect(result.warning).toBeUndefined();
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    },
  );

  it("tries Windows executable extensions in order until one resolves", async () => {
    const command = join(projectRoot, "CLI fallback order", "codegraph-vba");
    const attempts: string[] = [];
    const stdout = JSON.stringify({
      results: [{ handler: "cmdSave_Click", callPath: ["cmdSave_Click"] }],
    });

    const result = await createDefaultCodeGraphVbaInvoker({
      command,
      platform: "win32",
      executeCommand: async (candidate: string) => {
        attempts.push(candidate);
        if (candidate === `${command}.exe`) return { stdout, stderr: "" };
        throw Object.assign(new Error(`spawn ${candidate} ENOENT`), { code: "ENOENT" });
      },
    }).fetchBehaviorEvidence({
      formName: "Customer",
      controlNames: ["cmdSave"],
      projectPath: projectRoot,
    });

    expect(attempts).toEqual([
      command,
      `${command}.cmd`,
      `${command}.bat`,
      `${command}.ps1`,
      `${command}.exe`,
    ]);
    expect(result.evidence).toEqual([{ handler: "cmdSave_Click", callPath: ["cmdSave_Click"] }]);
    expect(result.warning).toBeUndefined();
  });

  it("surfaces the original ENOENT only after every Windows extension is exhausted", async () => {
    const command = join(projectRoot, "missing CLI", "codegraph-vba");
    const attempts: string[] = [];
    const firstError = Object.assign(new Error("original extensionless spawn ENOENT"), {
      code: "ENOENT",
    });

    const result = await createDefaultCodeGraphVbaInvoker({
      command,
      platform: "win32",
      executeCommand: async (candidate: string) => {
        attempts.push(candidate);
        if (candidate === command) throw firstError;
        throw Object.assign(new Error(`fallback failed: ${candidate}`), { code: "ENOENT" });
      },
    }).fetchBehaviorEvidence({
      formName: "Customer",
      controlNames: ["cmdSave"],
      projectPath: projectRoot,
    });

    expect(attempts).toHaveLength(5);
    expect(result.evidence).toEqual([]);
    expect(result.warning).toContain(firstError.message);
    expect(result.warning).not.toContain(`fallback failed: ${command}.exe`);
  });

  it("does not append fallback extensions to an explicit executable name", async () => {
    const command = join(projectRoot, "codegraph-vba.exe");
    const attempts: string[] = [];
    const stdout = JSON.stringify({
      results: [{ handler: "cmdSave_Click", callPath: ["cmdSave_Click"] }],
    });

    const result = await createDefaultCodeGraphVbaInvoker({
      command,
      platform: "win32",
      executeCommand: async (candidate: string) => {
        attempts.push(candidate);
        return { stdout, stderr: "" };
      },
    }).fetchBehaviorEvidence({
      formName: "Customer",
      controlNames: ["cmdSave"],
      projectPath: projectRoot,
    });

    expect(attempts).toEqual([command]);
    expect(result.evidence).toEqual([{ handler: "cmdSave_Click", callPath: ["cmdSave_Click"] }]);
  });

  it("does not apply Windows extension fallback on non-Windows platforms", async () => {
    const command = "codegraph-vba";
    const attempts: string[] = [];

    const result = await createDefaultCodeGraphVbaInvoker({
      command,
      platform: "linux",
      executeCommand: async (candidate: string) => {
        attempts.push(candidate);
        throw Object.assign(new Error("spawn codegraph-vba ENOENT"), { code: "ENOENT" });
      },
    }).fetchBehaviorEvidence({
      formName: "Customer",
      controlNames: ["cmdSave"],
      projectPath: projectRoot,
    });

    expect(attempts).toEqual([command]);
    expect(result.evidence).toEqual([]);
    expect(result.warning).toContain("spawn codegraph-vba ENOENT");
  });

  it("returns empty evidence + warning when CLI command is not found (ENOENT)", async () => {
    // projectRoot has `.codegraph/` (set up at the describe level), so the
    // impl proceeds to the `execFile` step. The CLI path is guaranteed
    // ENOENT (does not exist on PATH).
    const invoker = createDefaultCodeGraphVbaInvoker({
      command: "definitely-not-a-real-binary-xyz-1234",
      timeoutMs: 2000,
    });
    const result = await invoker.fetchBehaviorEvidence({
      formName: "Customer",
      controlNames: ["cmdSave"],
      projectPath: projectRoot,
    });

    expect(result.evidence).toEqual([]);
    expect(result.warning).toMatch(/CodeGraph-VBA lookup failed/);
    // Should also mention graceful fallback.
    expect(result.warning).toMatch(/Falling back to/);
  });

  it("returns empty evidence + warning when CLI exits non-zero", async () => {
    // Write a small Windows .cmd stub that exits non-zero. On non-Windows
    // the impl uses execFile which can run scripts directly — but we can't
    // reliably test that cross-platform without more work. On Windows,
    // `execFile` invokes the .cmd via cmd.exe which is fine.
    const scriptPath = join(projectRoot, "fail-stub.cmd");
    writeFileSync(scriptPath, "@exit /b 1\r\n");
    const invoker = createDefaultCodeGraphVbaInvoker({
      command: scriptPath,
      timeoutMs: 5000,
    });
    const result = await invoker.fetchBehaviorEvidence({
      formName: "Customer",
      controlNames: ["cmdSave"],
      projectPath: projectRoot,
    });

    expect(result.evidence).toEqual([]);
    expect(result.warning).toMatch(/CodeGraph-VBA lookup failed/);
  });

  it("translates a codegraph JSON envelope into CodeGraphBehaviorEvidence", async () => {
    const stdout = JSON.stringify({
      results: [
        {
          handler: "cmdSave_Click",
          callPath: ["cmdSave_Click", "SaveCustomer"],
          tables: ["Customers"],
        },
        {
          handler: "OtherModule_Proc",
          callPath: ["OtherModule_Proc"],
          // missing `tables` — optional, must be omitted on the result.
        },
      ],
    });
    const evidence = parseCodeGraphJson(stdout, "Customer", ["cmdSave"]);
    expect(evidence).toEqual([
      {
        handler: "cmdSave_Click",
        callPath: ["cmdSave_Click", "SaveCustomer"],
        tables: ["Customers"],
      },
      {
        handler: "OtherModule_Proc",
        callPath: ["OtherModule_Proc"],
      },
    ]);
  });

  it("tolerates malformed JSON and returns []", () => {
    expect(parseCodeGraphJson("not json at all", "Customer", ["cmdSave"])).toEqual([]);
    expect(parseCodeGraphJson("", "Customer", ["cmdSave"])).toEqual([]);
  });

  it("tolerates array-shaped stdout (no envelope)", () => {
    const stdout = JSON.stringify([{ handler: "cmdSave_Click", callPath: ["cmdSave_Click"] }]);
    expect(parseCodeGraphJson(stdout, "Customer", ["cmdSave"])).toEqual([
      { handler: "cmdSave_Click", callPath: ["cmdSave_Click"] },
    ]);
  });

  it("accepts { matches: [...] } envelope shape", () => {
    const stdout = JSON.stringify({
      matches: [{ handler: "cmdSave_Click", callPath: ["cmdSave_Click"] }],
    });
    expect(parseCodeGraphJson(stdout, "Customer", ["cmdSave"])).toEqual([
      { handler: "cmdSave_Click", callPath: ["cmdSave_Click"] },
    ]);
  });

  it("accepts { data: [...] } envelope shape", () => {
    const stdout = JSON.stringify({
      data: [{ handler: "cmdSave_Click", callPath: ["cmdSave_Click"] }],
    });
    expect(parseCodeGraphJson(stdout, "Customer", ["cmdSave"])).toEqual([
      { handler: "cmdSave_Click", callPath: ["cmdSave_Click"] },
    ]);
  });

  it("drops entries with malformed callPath", () => {
    const stdout = JSON.stringify({
      results: [
        { handler: "cmdSave_Click", callPath: ["cmdSave_Click"] },
        { handler: "Bad_Click", callPath: "not-an-array" },
        { handler: "Bad_Click2", callPath: [1, 2, 3] },
      ],
    });
    const evidence = parseCodeGraphJson(stdout, "Customer", ["cmdSave"]);
    expect(evidence).toEqual([{ handler: "cmdSave_Click", callPath: ["cmdSave_Click"] }]);
  });

  it("cleanup", () => {
    // Best-effort cleanup of the shared projectRoot.
    if (existsSync(projectRoot)) {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
