import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConfigFileSystemPort } from "../../../src/core/config/dysflow-config.js";
import { resolveExecutionTarget } from "../../../src/core/config/execution-target.js";

/**
 * Issue #1478 — a caller-supplied RELATIVE `destinationRoot` was returned
 * verbatim, so every downstream consumer anchored it to a different base:
 * `executeMappedTool` spawns the VBA worker with `cwd: projectRoot` (which
 * #1169 made follow the same raw override), and the worker then resolved
 * the relative `destinationRoot` against that cwd — writing to
 * `<root>/src/src/forms/` instead of `<root>/src/forms/`.
 *
 * The contract these tests pin: `ExecutionTarget.destinationRoot` and
 * `ExecutionTarget.projectRoot` are ALWAYS absolute. Absolute overrides stay
 * byte-identical so the `OUTSIDE_PROJECT_ROOT` guard keeps firing.
 */

const nodeFileSystem: ConfigFileSystemPort = {
  existsSync: (path: string) => existsSync(path),
  existsAsync: async (path: string) => existsSync(path),
  readJsonSync: <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T,
  readJsonAsync: async <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T,
};

const throwingFileSystem: ConfigFileSystemPort = {
  existsSync: () => false,
  existsAsync: async () => false,
  readJsonSync: <T>(): T => {
    throw new Error("ConfigFileSystemPort.readJsonSync must not be called here");
  },
  readJsonAsync: <T>(): Promise<T> =>
    Promise.reject(new Error("ConfigFileSystemPort.readJsonAsync must not be called here")),
};

describe("resolveExecutionTarget — relative destinationRoot override (#1478)", () => {
  let root: string;
  let accessPath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "execution-target-1478-"));
    accessPath = join(root, "app.accdb");
    writeFileSync(accessPath, "", "utf8");
    mkdirSync(join(root, "src", "forms"), { recursive: true });
    mkdirSync(join(root, ".dysflow"), { recursive: true });
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      `${JSON.stringify({ id: "issue-1478", accessPath: "app.accdb", destinationRoot: "src" }, null, 2)}\n`,
      "utf8",
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function repoContext(overrides: Record<string, unknown> = {}) {
    return {
      env: {} as Record<string, string | undefined>,
      cwd: root,
      fileSystem: nodeFileSystem,
      ...overrides,
    };
  }

  it("resolves a relative destinationRoot that matches the configured one against the project root", async () => {
    const result = await resolveExecutionTarget({ destinationRoot: "src" }, repoContext());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.destinationRoot).toBe(resolve(root, "src"));
    expect(result.data.destinationRoot).not.toBe("src");
    expect(result.data.destinationRoot).not.toBe(resolve(root, "src", "src"));
  });

  it("keeps projectRoot absolute when the destinationRoot override drives it (#1169 follow-along)", async () => {
    const result = await resolveExecutionTarget({ destinationRoot: "src" }, repoContext());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    // #1169 keeps projectRoot following the override so the form
    // path-containment guards accept it; #1478 requires it be absolute, because
    // executeMappedTool passes it as the spawned worker's cwd.
    expect(result.data.projectRoot).toBe(resolve(root, "src"));
  });

  it("resolves a relative destinationRoot on the explicit-accessPath branch (disposable-copy re-entry)", async () => {
    // export_modules re-enters through executeExportWithBinaryIsolation with an
    // accessPath pointing at the staging copy — the second pass that produced the
    // doubled path in the consumer report.
    const stagingRoot = mkdtempSync(join(tmpdir(), "execution-target-1478-staging-"));
    const stagingPath = join(stagingRoot, "app.accdb");
    writeFileSync(stagingPath, "", "utf8");
    try {
      const result = await resolveExecutionTarget(
        { accessPath: stagingPath, destinationRoot: "src" },
        repoContext(),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.message);
      expect(result.data.destinationRoot).toBe(resolve(root, "src"));
      expect(result.data.projectRoot).toBe(resolve(root, "src"));
    } finally {
      rmSync(stagingRoot, { recursive: true, force: true });
    }
  });

  it("does not collapse a sibling destinationRoot that merely shares a prefix", async () => {
    const result = await resolveExecutionTarget({ destinationRoot: "src-backup" }, repoContext());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.destinationRoot).toBe(resolve(root, "src-backup"));
    expect(result.data.destinationRoot).not.toBe(resolve(root, "src", "src-backup"));
  });

  it("keeps an absolute destinationRoot override byte-identical so OUTSIDE_PROJECT_ROOT still fires", async () => {
    const external = "C:/Users/external/temp";
    const result = await resolveExecutionTarget({ destinationRoot: external }, repoContext());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.destinationRoot).toBe(external);
    expect(result.data.projectRoot).toBe(external);
  });

  it("resolves a relative destinationRoot against cwd on the runtime-default branch", async () => {
    const result = await resolveExecutionTarget(
      { destinationRoot: "src" },
      {
        env: {} as Record<string, string | undefined>,
        cwd: "C:/my-project",
        accessPath: "C:/my-project/db.accdb",
        destinationRoot: "C:/my-project/dest",
        fileSystem: throwingFileSystem,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.destinationRoot).toBe(resolve("C:/my-project", "src"));
    expect(result.data.projectRoot).toBe(resolve("C:/my-project", "src"));
  });
});
