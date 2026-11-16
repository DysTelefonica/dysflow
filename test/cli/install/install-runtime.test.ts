/**
 * Issue #940 — install pipeline ships three diagnostic docs in the release
 * tarball (references/error-codes.md, docs/diagnostics/hresult-guide.md,
 * docs/diagnostics/form-import-gate-failures.md) but `dysflow install` and
 * `dysflow update` strip them at extract time. These tests pin the contract:
 * after `installRuntime` returns, the runtimeDir must contain all three docs
 * and the install report must surface them by name.
 */

import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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
import { DYSSKILL_NAMES } from "../../../src/cli/commands/install/skills-installer";

type RuntimePaths = ReturnType<typeof resolveRuntimePaths>;

async function seedPackageRoot(packageRoot: string): Promise<void> {
  await mkdir(join(packageRoot, "dist"), { recursive: true });
  await writeFile(join(packageRoot, "dist", "index.js"), "// stub", "utf8");
  await mkdir(join(packageRoot, "scripts"), { recursive: true });
  await writeFile(join(packageRoot, "scripts", "noop.mjs"), "// stub", "utf8");
  await mkdir(join(packageRoot, "plugin", "pi"), { recursive: true });
  await writeFile(
    join(packageRoot, "plugin", "pi", "index.ts"),
    "export default () => {};\n",
    "utf8",
  );
  await writeFile(
    join(packageRoot, "plugin", "pi", "package.json"),
    JSON.stringify({ name: "@aroman22/dysflow-pi", pi: { extensions: ["./index.ts"] } }),
    "utf8",
  );
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({ name: "dysflow", version: "0.0.0" }),
    "utf8",
  );
  for (const name of DYSSKILL_NAMES) {
    await mkdir(join(packageRoot, "skills", name), { recursive: true });
    await writeFile(join(packageRoot, "skills", name, "SKILL.md"), `${name} bytes\n`, "utf8");
  }
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
  await writeFile(
    join(packageRoot, "docs", "pi-native-integration.md"),
    "# Pi-native integration\n",
    "utf8",
  );
}

let root: string;
let runtimeDir: string;
let runtimePaths: RuntimePaths;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "dysflow-install-docs-"));
  vi.stubEnv("ProgramData", root);
  vi.stubEnv("ALLUSERSPROFILE", root);
  vi.stubEnv("DYSFLOW_RUNTIME_MARKER_PATH", join(root, ".dysflow-marker"));
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
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

async function importExtractor(): Promise<
  typeof import("../../../src/cli/commands/install/extractor")
> {
  return import("../../../src/cli/commands/install/extractor");
}

describe("installRuntime — runtime docs must be copied alongside dist (#940)", () => {
  it("preserves signed override settings for pnpm 12 without leaking them into Pi (#1999)", async () => {
    const packageRoot = join(root, "pkg");
    const overrides = { "fast-uri@<3.1.3": ">=4.1.3" };
    const manifest = JSON.stringify({ name: "dysflow", version: "0.0.0", pnpm: { overrides } });
    await writeFile(runtimePaths.packageJsonSource, manifest);
    execFileMock.mockImplementation((_file, _args, options, callback) => {
      void readFile(join(options.cwd, "pnpm-workspace.yaml"), "utf8").then(
        (workspace) => {
          const expected = options.cwd.endsWith(join("plugin", "pi")) ? {} : { overrides };
          callback(
            JSON.stringify(JSON.parse(workspace)) === JSON.stringify(expected)
              ? null
              : new Error("ERR_PNPM_LOCKFILE_CONFIG_MISMATCH: overrides"),
            "",
            "",
          );
        },
        () => callback(new Error("ERR_PNPM_LOCKFILE_CONFIG_MISMATCH: missing overrides")),
      );
    });

    const { installRuntime } = await importExtractor();
    const report = await installRuntime(runtimePaths, packageRoot);
    expect(await readFile(runtimePaths.packageJsonSource, "utf8")).toBe(manifest);
    expect(
      JSON.parse(await readFile(join(runtimePaths.appDir, "pnpm-workspace.yaml"), "utf8")),
    ).toEqual({ overrides });
    expect(
      JSON.parse(await readFile(join(runtimePaths.piFacadeDest, "pnpm-workspace.yaml"), "utf8")),
    ).toEqual({});
    expect(report.copiedFiles.some((file) => file.endsWith("pnpm-workspace.yaml"))).toBe(false);
  });

  it("preserves existing workspace configuration byte-for-byte (#1999)", async () => {
    const packageRoot = join(root, "pkg");
    const workspace = "# release settings\npackages:\n  - .\noverrides:\n  fast-uri: 4.1.3\n";
    await writeFile(join(packageRoot, "pnpm-workspace.yaml"), workspace);
    await writeFile(
      join(runtimePaths.piFacadeSource, "pnpm-workspace.yaml"),
      "# Pi settings\npackages: ['.']\n",
    );

    const { installRuntime } = await importExtractor();
    await installRuntime(runtimePaths, packageRoot);
    expect(await readFile(join(runtimePaths.appDir, "pnpm-workspace.yaml"), "utf8")).toBe(
      workspace,
    );
    expect(await readFile(join(runtimePaths.piFacadeDest, "pnpm-workspace.yaml"), "utf8")).toBe(
      "# Pi settings\npackages: ['.']\n",
    );
  });

  it.each(["runtime", "Pi facade"])(
    "preserves the installed runtime and state when %s dependencies fail (#1999)",
    async (phase) => {
      const packageRoot = join(root, "pkg");
      const statePath = join(runtimeDir, ".dysflow-install-state.json");
      await mkdir(join(runtimePaths.appDir, "node_modules"), { recursive: true });
      await mkdir(join(runtimePaths.appDir, "dist"), { recursive: true });
      await writeFile(join(runtimePaths.appDir, "dist", "index.js"), "old runtime");
      await writeFile(join(runtimePaths.appDir, "package.json"), '{"version":"1.0.0"}');
      await writeFile(join(runtimePaths.appDir, "node_modules", "sentinel"), "old dependencies");
      await writeFile(statePath, '{"version":"1.0.0","channel":"stable"}');
      execFileMock.mockImplementation((_file, _args, options, callback) => {
        const isPi = options.cwd.endsWith(join("plugin", "pi"));
        queueMicrotask(() =>
          callback(isPi === (phase === "Pi facade") ? new Error("dependency failure") : null),
        );
      });

      const { installRuntime } = await importExtractor();
      await expect(installRuntime(runtimePaths, packageRoot)).rejects.toThrow(/Retry dysflow/);

      expect(await readFile(join(runtimePaths.appDir, "dist", "index.js"), "utf8")).toBe(
        "old runtime",
      );
      expect(await readFile(join(runtimePaths.appDir, "package.json"), "utf8")).toBe(
        '{"version":"1.0.0"}',
      );
      expect(await readFile(join(runtimePaths.appDir, "node_modules", "sentinel"), "utf8")).toBe(
        "old dependencies",
      );
      expect(await readFile(statePath, "utf8")).toBe('{"version":"1.0.0","channel":"stable"}');
    },
  );

  it("installs a fresh dependency graph instead of reusing broken old links (#1999)", async () => {
    await mkdir(join(runtimePaths.appDir, "node_modules"), { recursive: true });
    await writeFile(join(runtimePaths.appDir, "node_modules", "broken-link"), "stale");
    execFileMock.mockImplementation((_file, _args, options, callback) => {
      void access(join(options.cwd, "node_modules", "broken-link")).then(
        () => callback(new Error("stale node_modules reused")),
        () => callback(null, "", ""),
      );
    });

    const { installRuntime } = await importExtractor();
    await installRuntime(runtimePaths, join(root, "pkg"));
    await expect(
      access(join(runtimePaths.appDir, "node_modules", "broken-link")),
    ).rejects.toThrow();
  });

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

  it("copies the canonical Pi-native guide into the managed runtime", async () => {
    const packageRoot = join(root, "pkg");

    const { installRuntime } = await importExtractor();
    await installRuntime(runtimePaths, packageRoot);

    const dest = join(runtimePaths.runtimeDir, "docs", "pi-native-integration.md");
    expect(await readFile(dest, "utf8")).toBe("# Pi-native integration\n");
  });

  it("creates the diagnostics parent directory before copying into it", async () => {
    const packageRoot = join(root, "pkg");

    const { installRuntime } = await importExtractor();
    await installRuntime(runtimePaths, packageRoot);

    const diagnosticsDir = join(runtimePaths.runtimeDir, "docs", "diagnostics");
    const s = await stat(diagnosticsDir);
    expect(s.isDirectory()).toBe(true);
  });

  it("returns a manifest of copied package files and excludes generated dependencies", async () => {
    const packageRoot = join(root, "pkg");

    const { installRuntime } = await importExtractor();
    const report = await installRuntime(runtimePaths, packageRoot);

    expect(report.copiedFiles).toContain(join(runtimeDir, "app", "dist", "index.js"));
    expect(report.copiedFiles).toContain(join(runtimeDir, "app", "scripts", "noop.mjs"));
    expect(report.copiedFiles).toContain(join(runtimeDir, "app", "package.json"));
    expect(report.copiedFiles).toContain(
      join(runtimeDir, "docs", "diagnostics", "hresult-guide.md"),
    );
    expect(report.copiedFiles.every((file) => !file.includes("node_modules"))).toBe(true);
  });

  it("keeps the Pi facade in the runtime without the source checkout's node_modules (#1754)", async () => {
    const packageRoot = join(root, "pkg");
    await mkdir(join(packageRoot, "plugin", "pi", "node_modules", "nested"), {
      recursive: true,
    });
    await writeFile(
      join(packageRoot, "plugin", "pi", "node_modules", "nested", "dependency.js"),
      "must not copy",
      "utf8",
    );

    const { installRuntime } = await importExtractor();
    const report = await installRuntime(runtimePaths, packageRoot);

    const destination = join(runtimePaths.appDir, "plugin", "pi");
    await expect(access(join(destination, "package.json"))).resolves.toBeUndefined();
    await expect(access(join(destination, "node_modules", "nested"))).rejects.toThrow();
    expect(report.copiedFiles).toContain(join(destination, "package.json"));
    expect(report.copiedFiles.every((file) => !file.includes("node_modules"))).toBe(true);
  });

  it("retains every bundled skill byte-exactly in the installed runtime for update and doctor", async () => {
    const packageRoot = join(root, "pkg");

    const { installRuntime } = await importExtractor();
    const report = await installRuntime(runtimePaths, packageRoot);

    for (const name of DYSSKILL_NAMES) {
      const source = join(packageRoot, "skills", name, "SKILL.md");
      const destination = join(runtimePaths.appDir, "skills", name, "SKILL.md");
      expect(await readFile(destination)).toEqual(await readFile(source));
      expect(report.copiedFiles).toContain(destination);
    }
  });

  it("fails before mutating the runtime when any required bundled skill is absent", async () => {
    const packageRoot = join(root, "pkg");
    const sentinel = join(runtimeDir, "existing-runtime.txt");
    await mkdir(runtimeDir, { recursive: true });
    await writeFile(sentinel, "unchanged\n", "utf8");
    await rm(join(packageRoot, "skills", "dysflow-arnes", "SKILL.md"));

    const { installRuntime } = await importExtractor();
    await expect(installRuntime(runtimePaths, packageRoot)).rejects.toThrow(
      /skills[\\/]dysflow-arnes[\\/]SKILL\.md/,
    );

    expect(await readFile(sentinel, "utf8")).toBe("unchanged\n");
    await expect(stat(runtimePaths.appDir)).rejects.toThrow();
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("installReport mentions all three new docs by name", () => {
    const report = createInstallReport(runtimeDir, []);
    expect(report).toContain("error-codes.md");
    expect(report).toContain("hresult-guide.md");
    expect(report).toContain("form-import-gate-failures.md");
    expect(report).toContain("pi-native-integration.md");
  });
});
