import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type ComparisonFileSystemPort,
  compareSourceAgainstBinary,
  type VbaExecutionRequest,
} from "../../../src/core/services/vba-source-comparison";
import { resolveDestinationRootForTest } from "../../_helpers/resolve-destination-root.js";

// Issue #1866 item 1 — verify_code is documented as read-only. The Access
// runner opens the database with write-capable maintenance (bypass key, startup
// disable), so verify_code must hand the runner a disposable copy of the .accdb
// and never the committed file itself.
const fileSystem: ComparisonFileSystemPort = {
  mkdtemp: (prefix) => mkdtemp(prefix),
  readdir: (path) => readdir(path, { withFileTypes: true }),
  readFile: (path, encoding) => readFile(path, encoding),
  rm: (path, options) => rm(path, options),
  tmpdir: () => tmpdir(),
  copyFile: (src, dest) => copyFile(src, dest),
};

describe("verify_code read-only database handling (#1866 item 1)", () => {
  it("exports from a snapshot copy so the committed .accdb is never written", async () => {
    const workRoot = await mkdtemp(join(tmpdir(), "dysflow-1866-readonly-"));
    try {
      const sourceRoot = join(workRoot, "src");
      await mkdir(sourceRoot, { recursive: true });
      const accessPath = join(workRoot, "frontend.accdb");
      const original = Buffer.from("ORIGINAL-ACCDB-BYTES");
      await writeFile(accessPath, original);

      const seenAccessPaths: string[] = [];
      const ctx = {
        scriptPath: "script.ps1",
        resolveExecutionTarget: async () => ({
          ok: true as const,
          data: {
            accessPath,
            destinationRoot: await resolveDestinationRootForTest(sourceRoot),
            timeoutMs: 5000,
          },
          diagnostics: [],
          durationMs: 0,
        }),
        validateStrictContext: () => ({
          ok: true as const,
          data: undefined,
          diagnostics: [],
          durationMs: 0,
        }),
        runPreflightCleanup: async () => ({
          cleaned: [],
          killed: [],
          orphanedKilled: [],
          errors: [],
        }),
        runVbaManager: async (request: VbaExecutionRequest) => {
          const target = String(request.accessPath);
          seenAccessPaths.push(target);
          // Simulate the runner's write-capable open: it mutates whatever file
          // it is handed. The committed database must not be that file.
          await writeFile(target, Buffer.from("MUTATED-BY-RUNNER"));
          return { exitCode: 0, stdout: "", stderr: "", durationMs: 0, timedOut: false };
        },
      };

      await compareSourceAgainstBinary({}, ctx, fileSystem);

      expect(seenAccessPaths).toHaveLength(1);
      expect(seenAccessPaths[0]).not.toBe(accessPath);
      expect(await readFile(accessPath)).toEqual(original);
    } finally {
      await rm(workRoot, { recursive: true, force: true });
    }
  });
});
