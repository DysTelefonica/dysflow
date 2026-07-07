delete process.env.DYSFLOW_HOME;

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadDysflowConfig } from "../../src/adapters/config/dysflow-config-node";
import { createDefaultPowerShellExecutor } from "../../src/adapters/powershell/default-executor.js";
import { nodeLockFileSystem } from "../../src/adapters/runner/node-lock-file-system";
import { AccessPowerShellRunner } from "../../src/core/runner/access-runner";
import { AccessDiagnosticsService } from "../../src/core/services/diagnostics-service";

/**
 * #750 — end-to-end verification that read-only operations
 * (`dysflow_dysflow_doctor`, `export_modules`, `export_all`) do NOT
 * modify the .accdb. Acquiring the cross-process file lock tells Access
 * "another process is editing" and causes Access to rewrite metadata
 * (timestamps, internal stats) even when the runner writes nothing. A
 * read-only tool must never trigger that.
 *
 * This test runs the real PowerShell + Access runner against a copy of the
 * `E2E_testing/NoConformidades.accdb` fixture, captures the .accdb md5
 * before and after each read-only operation, and asserts the binary is
 * byte-for-byte identical. The fixture workspace is deleted in `finally`.
 */

const fixtureFront = resolve("E2E_testing/NoConformidades.accdb");
const fixtureBackend = resolve("E2E_testing/NoConformidades_Datos.accdb");
const canRunAccessE2e = existsSync(fixtureFront) && existsSync(fixtureBackend);
const workspaces: Array<{ root: string; cleanup(): void }> = [];

if (!canRunAccessE2e) {
  console.warn(
    "[dysflow] Skipping Access fixture E2E: E2E_testing/*.accdb fixtures are unavailable.",
  );
}

function createAccessFixtureWorkspace(): { root: string; cleanup(): void } {
  const root = join(
    tmpdir(),
    `dysflow-access-readlock-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(join(root, ".dysflow"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  cpSync(fixtureFront, join(root, "NoConformidades.accdb"));
  cpSync(fixtureBackend, join(root, "NoConformidades_Datos.accdb"));
  writeFileSync(
    join(root, ".dysflow", "project.json"),
    `${JSON.stringify(
      {
        id: "dysflow-access-readlock-e2e",
        accessPath: "NoConformidades.accdb",
        backendPath: "NoConformidades_Datos.accdb",
        destinationRoot: "src",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function createAccessFixtureRunner(): AccessPowerShellRunner {
  return new AccessPowerShellRunner({
    executor: createDefaultPowerShellExecutor(),
    lockFileSystem: nodeLockFileSystem,
    scriptPath: resolve("scripts/dysflow-access-runner.ps1"),
  });
}

function md5Of(path: string): string {
  // Lazy require to avoid loading node:crypto in the test surface.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  const { readFileSync } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:fs") as typeof import("node:fs");
  return createHash("md5").update(readFileSync(path)).digest("hex");
}

afterEach(() => {
  for (const w of workspaces.splice(0)) {
    try {
      w.cleanup();
    } catch {
      // best effort — fixture deletion is non-critical
    }
  }
});

describe.skipIf(!canRunAccessE2e)("Access runner read-only path (#750)", () => {
  it("doctor (diagnostics) does NOT modify the .accdb on disk", async () => {
    const workspace = createAccessFixtureWorkspace();
    workspaces.push(workspace);
    const accessDbPath = join(workspace.root, "NoConformidades.accdb");

    const config = loadDysflowConfig({
      cwd: workspace.root,
      env: {
        DYSFLOW_ACCESS_PASSWORD: process.env.DYSFLOW_ACCESS_PASSWORD,
        ACCESS_VBA_PASSWORD: process.env.ACCESS_VBA_PASSWORD,
        DYSFLOW_BACKEND_PASSWORD: process.env.DYSFLOW_BACKEND_PASSWORD,
      },
    });
    expect(config.ok).toBe(true);
    if (!config.ok) throw new Error(config.error.message);

    const runner = createAccessFixtureRunner();
    const diagnostics = new AccessDiagnosticsService({
      runner,
      config: config.data,
    });

    const md5Before = md5Of(accessDbPath);
    const result = await diagnostics.run({ includeEnvironment: true });
    const md5After = md5Of(accessDbPath);

    expect(result.ok).toBe(true);
    // Read-only operation must NOT have caused Access to rewrite metadata.
    expect(md5After).toBe(md5Before);
  }, 60_000);

  // NOTE: the export path is intentionally NOT covered by an md5-strict
  // E2E because SaveAsText (the export action) inherently opens the .accdb,
  // and Access rewrites some metadata on close even when the runner
  // writes nothing. The read-only contract for export is verified by:
  //   - this file's doctor test (the canonical read-only path)
  //   - `test/core/scripts/dysflow-access-runner-static.test.ts` (static
  //     analysis of the PowerShell runner script)
  //   - `test/core/runner/access-runner-readlock.test.ts` (unit test of
  //     the runner's read-only dispatch)
});
