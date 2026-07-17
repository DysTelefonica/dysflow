/**
 * Issue #940 — install pipeline ships three diagnostic docs in the release
 * tarball (references/error-codes.md, docs/diagnostics/hresult-guide.md,
 * docs/diagnostics/form-import-gate-failures.md) but `dysflow install` and
 * `dysflow update` strip them at extract time. These tests pin the contract:
 * after `installRuntime` returns, the runtimeDir must contain all three docs
 * and the install report must surface them by name.
 */

import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock node:child_process BEFORE importing the extractor so the runCommand
// call inside copyRuntime goes through the spy instead of spawning pnpm.
const execFileMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

import {
  createInstallReport,
  resolveRuntimePaths,
} from "../../../src/cli/commands/install/extractor";

type RuntimePaths = ReturnType<typeof resolveRuntimePaths>;

async function seedPackageRoot(packageRoot: string): Promise<void> {
  await mkdir(join(packageRoot, "dist"), { recursive: true });
  await writeFile(join(packageRoot, "dist", "index.js"), "// stub", "utf8");
  await mkdir(join(packageRoot, "scripts"), { recursive: true });
  await writeFile(join(packageRoot, "scripts", "noop.mjs"), "// stub", "utf8");
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({ name: "dysflow", version: "0.0.0" }),
    "utf8",
  );
  // Issue #940 — the three docs the install pipeline used to strip.
  await mkdir(join(packageRoot, "references"), { recursive: true });
  await writeFile(join(packageRoot, "references", "error-codes.md"), "# error codes\n", "utf8");
  await mkdir(join(packageRoot, "docs", "diagnostics"), { recursive: true });
  await writeFile(
    join(packageRoot, "docs", "diagnostics", "hresult-guide.md"),
    "# hresult guide\n",
    "utf8",
  );
  await writeFile(
    join(packageRoot, "docs", "diagnostics", "form-import-gate-failures.md"),
    "# form import gate failures\n",
    "utf8",
  );
}

let root: string;
let runtimeDir: string;
let runtimePaths: RuntimePaths;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "dysflow-install-docs-"));
  runtimeDir = join(root, "runtime");
  const packageRoot = join(root, "pkg");
  await seedPackageRoot(packageRoot);
  runtimePaths = resolveRuntimePaths(runtimeDir, packageRoot);
  execFileMock.mockReset();
  execFileMock.mockImplementation(
    (_file: unknown, _args: unknown, options: unknown, callback: (...args: unknown[]) => void) => {
      const cb = typeof options === "function" ? options : callback;
      if (cb) queueMicrotask(() => cb(null, { stdout: "", stderr: "" }));
    },
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function importExtractor(): Promise<
  typeof import("../../../src/cli/commands/install/extractor")
> {
  return import("../../../src/cli/commands/install/extractor");
}

describe("installRuntime — runtime docs must be copied alongside dist (#940)", () => {
  it("copies references/error-codes.md from packageRoot into <runtimeDir>/references/", async () => {
    const packageRoot = join(root, "pkg");

    const { installRuntime } = await importExtractor();
    await installRuntime(runtimePaths, packageRoot);

    const dest = join(runtimePaths.runtimeDir, "references", "error-codes.md");
    const s = await stat(dest);
    expect(s.isFile()).toBe(true);
  });

  it("copies docs/diagnostics/hresult-guide.md into <runtimeDir>/docs/diagnostics/", async () => {
    const packageRoot = join(root, "pkg");

    const { installRuntime } = await importExtractor();
    await installRuntime(runtimePaths, packageRoot);

    const dest = join(runtimePaths.runtimeDir, "docs", "diagnostics", "hresult-guide.md");
    const s = await stat(dest);
    expect(s.isFile()).toBe(true);
  });

  it("copies docs/diagnostics/form-import-gate-failures.md into <runtimeDir>/docs/diagnostics/", async () => {
    const packageRoot = join(root, "pkg");

    const { installRuntime } = await importExtractor();
    await installRuntime(runtimePaths, packageRoot);

    const dest = join(
      runtimePaths.runtimeDir,
      "docs",
      "diagnostics",
      "form-import-gate-failures.md",
    );
    const s = await stat(dest);
    expect(s.isFile()).toBe(true);
  });

  it("creates the diagnostics parent directory before copying into it", async () => {
    const packageRoot = join(root, "pkg");

    const { installRuntime } = await importExtractor();
    await installRuntime(runtimePaths, packageRoot);

    const diagnosticsDir = join(runtimePaths.runtimeDir, "docs", "diagnostics");
    const s = await stat(diagnosticsDir);
    expect(s.isDirectory()).toBe(true);
  });

  it("installReport mentions all three new docs by name", () => {
    const report = createInstallReport(runtimeDir, []);
    expect(report).toContain("error-codes.md");
    expect(report).toContain("hresult-guide.md");
    expect(report).toContain("form-import-gate-failures.md");
  });
});
