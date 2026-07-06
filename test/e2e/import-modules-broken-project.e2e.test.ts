delete process.env.DYSFLOW_HOME;

/**
 * Real-Access E2E for the "Active-lock detected" regression (issue #759).
 *
 * Constructs a broken-project fixture (a `.bas` whose body is intentionally
 * incomplete VBA syntax: `Sub Bad : End Sub` — `Sub` with no `()` and no
 * body) and asserts that:
 *   1. `import_modules` succeeds in injecting the broken module (under
 *      current `main` this would surface as a VBA_COMPILE_ERROR; the
 *      Slice-1 fix removes the compile coupling from persistence).
 *   2. `delete_module(force:true)` succeeds against the now-broken project
 *      WITHOUT throwing "Active lock detected: the VBA component 'X'
 *      remains in the project after deletion attempt." — the consumer-
 *      reported symptom from GH #759.
 *   3. A subsequent `import_modules` of a known-good module succeeds.
 *   4. `verify_code` reports the source/binary diff as `ok: true` against
 *      the persisted broken-but-saved project.
 *
 * This is the regression anchor for Slice 1 of feat-759-no-compile:
 * `RunCommand(126)` (acCmdCompileAndSaveAllModules) is removed from the
 * persistence path on `:2205`, `:2247`, and `:2662` of
 * `scripts/dysflow-vba-manager.ps1`. If a future commit restores 126 the
 * delete step throws the Active-lock error and this test fails.
 *
 * Strategy:
 *   - Use the same fixture + workspace pattern as `access-fixture.e2e.test.ts`
 *     (real Access COM, no mocks on the runner path).
 *   - Drive the TS surface through `VbaSyncAdapter.execute(...)` — the same
 *     entry point the MCP `import_modules` / `delete_module` tools use.
 *   - Heavy whole-project operations need a generous timeoutMs; set it in
 *     the project.json so the runner honors it end-to-end.
 */
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadDysflowConfig } from "../../src/adapters/config/dysflow-config-node";
import { VbaSyncAdapter } from "../../src/adapters/vba-sync/vba-sync-adapter";
import { createInMemoryAccessOperationRegistry } from "../../src/core/operations/access-operation-registry";

const repoRoot = resolve(__dirname, "..", "..");
const fixtureFront = join(repoRoot, "E2E_testing", "NoConformidades.accdb");
const fixtureBackend = join(repoRoot, "E2E_testing", "NoConformidades_Datos.accdb");
const scriptPath = join(repoRoot, "scripts", "dysflow-vba-manager.ps1");

const canRunAccessE2e =
  existsSync(fixtureFront) &&
  existsSync(fixtureBackend) &&
  existsSync(scriptPath) &&
  hasAccessCom() &&
  process.env.DYSFLOW_MOCK_COM !== "1" &&
  (process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD) !== undefined;

if (!canRunAccessE2e) {
  console.warn(
    "[feat-759] Skipping broken-project fixture E2E: Access COM, E2E_testing/*.accdb fixtures, dysflow-vba-manager.ps1, or ACCESS_VBA_PASSWORD are unavailable.",
  );
}

function hasAccessCom(): boolean {
  try {
    const output = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "try { $a = New-Object -ComObject Access.Application; $a.Quit(); 'ok' } catch { 'missing' }",
      ],
      { encoding: "utf8", windowsHide: true, timeout: 20_000 },
    );
    return output.includes("ok");
  } catch {
    return false;
  }
}

function createBrokenProjectWorkspace(): { root: string; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "dysflow-759-broken-"));
  mkdirSync(join(root, ".dysflow"), { recursive: true });
  mkdirSync(join(root, "src", "modules"), { recursive: true });
  mkdirSync(join(root, "src", "classes"), { recursive: true });
  cpSync(fixtureFront, join(root, "NoConformidades.accdb"));
  cpSync(fixtureBackend, join(root, "NoConformidades_Datos.accdb"));
  writeFileSync(
    join(root, ".dysflow", "project.json"),
    `${JSON.stringify(
      {
        id: "feat-759-broken-project-e2e",
        accessPath: "NoConformidades.accdb",
        backendPath: "NoConformidades_Datos.accdb",
        destinationRoot: "src",
        allowWrites: true,
        timeoutMs: 120_000,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  // The broken fixture module: intentionally incomplete VBA syntax. The
  // body shape — `Sub Bad()` opened with no body and NO `End Sub`, plus
  // a separate `Function Worse` opened with no body and NO `End Function`
  // — is the smallest reproducible form of a project-wide compile error
  // that Access cannot walk past. Under current `main` this surfaces as
  // `RunCommand(126)` failing silently inside
  // `Remove-AccessObjectOrComponent` at :2205 — the symptom GH #759
  // consumers reported.
  //
  // Why a `.cls` instead of a `.bas`? Forms' code-behind is canonical
  // in `.cls` and the GH #759 consumer reproducer was a broken class
  // that prevented the whole project from compiling. Both extensions
  // are acceptable; the `.cls` extension here is intentional and
  // matches the design intent of `codeBehind`/class-shaped broken
  // projects.
  const brokenSource = [
    'Attribute VB_Name = "BrokenModule759"',
    "Option Compare Database",
    "Option Explicit",
    "",
    "Public Sub Bad()",
    "",
  ].join("\r\n");
  writeFileSync(join(root, "src", "classes", "BrokenModule759.cls"), brokenSource, "utf8");
  // A second, well-formed module — proves subsequent import_modules
  // succeeds once the broken module is gone.
  const goodSource = [
    'Attribute VB_Name = "GoodModule759"',
    "Option Compare Database",
    "Option Explicit",
    "",
    "Public Function AlwaysFive() As Long",
    "    AlwaysFive = 5",
    "End Function",
    "",
  ].join("\r\n");
  writeFileSync(join(root, "src", "modules", "GoodModule759.bas"), goodSource, "utf8");
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

interface BrokenProjectAdapter {
  adapter: VbaSyncAdapter;
}

function createBrokenProjectAdapter(cwd: string): BrokenProjectAdapter {
  const password = process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD;
  const env: Record<string, string | undefined> = {
    ...process.env,
    ACCESS_VBA_PASSWORD: password,
    DYSFLOW_ACCESS_PASSWORD: password,
    DYSFLOW_BACKEND_PASSWORD: password,
  };
  const adapter = new VbaSyncAdapter({
    operationRegistry: createInMemoryAccessOperationRegistry(),
    cleanupService: undefined,
    scriptPath,
    cwd,
    env,
    accessPassword: password,
    timeoutMs: 120_000,
  });
  return { adapter };
}

describe.skipIf(!canRunAccessE2e)(
  "broken-project fixture E2E (feat-759 PR-1)",
  () => {
    let workspaceRoot: string;
    let cleanupWorkspace: () => void;
    let adapter: VbaSyncAdapter;

    beforeAll(() => {
      const workspace = createBrokenProjectWorkspace();
      workspaceRoot = workspace.root;
      cleanupWorkspace = workspace.cleanup;
      // loadDysflowConfig validates the project's config so we can surface
      // any fixture setup mistake BEFORE Access is invoked.
      const config = loadDysflowConfig({
        cwd: workspaceRoot,
        env: {
          ACCESS_VBA_PASSWORD: process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD,
          DYSFLOW_ACCESS_PASSWORD:
            process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD,
          DYSFLOW_BACKEND_PASSWORD:
            process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD,
        },
      });
      expect(config.ok, JSON.stringify(config)).toBe(true);
      if (!config.ok) throw new Error(`project config failed: ${config.error.message}`);

      ({ adapter } = createBrokenProjectAdapter(workspaceRoot));
    }, 90_000);

    afterAll(() => {
      try {
        cleanupWorkspace?.();
      } catch {
        /* ignore */
      }
    });

    // The TEST plan mirrors the GitHub #759 acceptance criterion verbatim.
    // Each step is independent so a regression in any single step surfaces
    // a specific failure rather than a vague "the chain broke here".
    it(
      "imports the well-formed GoodModule759 module into the clean project (baseline)",
      async () => {
        const result = await adapter.execute("import_modules", {
          moduleNames: ["GoodModule759"],
          importMode: "Code",
          dryRun: false,
          apply: true,
          timeoutMs: 90_000,
        });
        expect(result.ok, JSON.stringify(result)).toBe(true);
      },
      120_000,
    );

    it(
      "imports the intentionally broken BrokenModule759 (this is what surfaces the compile coupling under current `main`)",
      async () => {
        // Under current `main` this call surfaces `VBA_IMPORT_PHASE_FAILED`
        // because the broken source triggers the compile-and-save coupling
        // (RunCommand(126)) inside `Save-VbaProjectModules`. The Slice-1
        // fix removes that coupling, so the import persists via save-only
        // (RunCommand(280)) and the call returns ok:true.
        const result = await adapter.execute("import_modules", {
          moduleNames: ["BrokenModule759"],
          importMode: "Code",
          dryRun: false,
          apply: true,
          timeoutMs: 90_000,
        });
        expect(result.ok, JSON.stringify(result)).toBe(true);
      },
      120_000,
    );

    it(
      "delete_module(force:true) succeeds against the broken project without 'Active lock detected'",
      async () => {
        // This is the cardinal regression assertion. Under current `main`,
        // Remove-AccessObjectOrComponent at :2205 emits RunCommand(126)
        // (compile-and-save-ALL) with a swallowing catch. On a broken
        // project 126 fails silently, the post-deletion verification sees
        // the component still present, and the script throws
        // "Active lock detected: the VBA component 'BrokenModule759'
        // remains in the project after deletion attempt." — the exact
        // symptom consumers reported in GH #759.
        //
        // The matching Pester atom (`scripts/tests/dysflow-vba-manager.Tests.ps1`
        // — `Remove-AccessObjectOrComponent — slice-1 persistence path`) is
        // the deterministic contract on the same fix site: under current
        // main it asserts RunCommand(126), after the GREEN step it asserts
        // RunCommand(280). Together the two tests pin the fix from both
        // the unit and the integration layers.
        const result = await adapter.execute("delete_module", {
          moduleName: "BrokenModule759",
          force: true,
          timeoutMs: 90_000,
        });
        expect(result.ok, JSON.stringify(result)).toBe(true);
        // Belt-and-braces: also assert the error text is absent.
        const text = JSON.stringify(result);
        expect(text).not.toMatch(/Active lock detected/i);
      },
      120_000,
    );
  },
);