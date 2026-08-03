import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type ConfigFileSystemPort,
  loadDysflowConfigAsyncWith,
  loadDysflowConfigWith,
} from "../../../src/core/config/dysflow-config.js";

const ROOT = resolve(process.cwd(), "config-discovery-diagnostic-fixtures");

class DiagnosticFileSystem implements ConfigFileSystemPort {
  readonly #entries = new Map<string, unknown>();
  readonly #directories = new Map<string, string[]>();
  readonly #existsFailures = new Map<string, NodeJS.ErrnoException>();

  addWorktree(
    projectRoot: string,
    options: { id: string; rawConfig?: unknown; style?: "standard" | "legacy" },
  ): this {
    const root = resolve(projectRoot);
    const configPath =
      options.style === "legacy"
        ? resolve(root, "dysflow.project.json")
        : resolve(root, ".dysflow", "project.json");
    this.#entries.set(resolve(root, ".git"), true);
    if (options.style !== "legacy") this.#entries.set(resolve(root, ".dysflow"), true);
    this.#entries.set(
      configPath,
      options.rawConfig ?? {
        id: options.id,
        frontendFile: `${options.id}.accdb`,
        destinationRoot: "src",
        capabilities: { allowWrites: true },
      },
    );

    const parent = dirname(root);
    const siblings = this.#directories.get(parent) ?? [];
    siblings.push(root.slice(parent.length + 1));
    this.#directories.set(parent, siblings);
    this.#entries.set(parent, true);
    return this;
  }

  failExists(path: string, code: string): this {
    const error = new Error(`${code}: ${resolve(path)}`) as NodeJS.ErrnoException;
    error.code = code;
    this.#existsFailures.set(resolve(path), error);
    return this;
  }

  existsSync(path: string): boolean {
    const normalized = resolve(path);
    const failure = this.#existsFailures.get(normalized);
    if (failure !== undefined) throw failure;
    return this.#entries.has(normalized);
  }

  async existsAsync(path: string): Promise<boolean> {
    return this.existsSync(path);
  }

  readJsonSync<T>(path: string): T {
    const value = this.#entries.get(resolve(path));
    if (value === undefined) throw new Error(`ENOENT: ${resolve(path)}`);
    return (typeof value === "string" ? JSON.parse(value) : value) as T;
  }

  async readJsonAsync<T>(path: string): Promise<T> {
    return this.readJsonSync<T>(path);
  }

  readdirSync(path: string): string[] {
    return [...(this.#directories.get(resolve(path)) ?? [])];
  }

  async readdirAsync(path: string): Promise<string[]> {
    return this.readdirSync(path);
  }

  tmpdir(): string {
    return resolve(ROOT, "system-tmp");
  }
}

async function loadBoth(cwd: string, fileSystem: ConfigFileSystemPort) {
  const syncResult = loadDysflowConfigWith({ cwd, env: {} }, fileSystem);
  const asyncResult = await loadDysflowConfigAsyncWith({ cwd, env: {} }, fileSystem);
  expect(asyncResult).toEqual(syncResult);
  expect(syncResult.ok).toBe(true);
  if (!syncResult.ok) throw new Error("expected active config to remain loadable");
  return syncResult;
}

describe("worktree discovery diagnostics", () => {
  it("surfaces a structured scan error without discarding candidates found before it", async () => {
    const parent = resolve(ROOT, "scan-error");
    const active = resolve(parent, "active");
    const healthy = resolve(parent, "healthy");
    const denied = resolve(parent, "denied");
    const fileSystem = new DiagnosticFileSystem()
      .addWorktree(active, { id: "active" })
      .addWorktree(healthy, { id: "healthy" })
      .addWorktree(denied, { id: "denied" })
      .failExists(resolve(denied, ".git"), "EACCES");

    const result = await loadBoth(active, fileSystem);

    expect(result.data.discoveredProjects?.map((project) => project.id)).toEqual([
      "active",
      "healthy",
    ]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "warning",
        source: "worktree-config-discovery",
        phase: "scan",
        path: resolve(denied, ".git"),
        code: "EACCES",
        message: expect.stringContaining("EACCES"),
      }),
    );
  });

  it("surfaces malformed sibling JSON as a parse diagnostic and continues discovery", async () => {
    const parent = resolve(ROOT, "parse-error");
    const active = resolve(parent, "active");
    const malformed = resolve(parent, "malformed");
    const healthy = resolve(parent, "healthy");
    const malformedPath = resolve(malformed, ".dysflow", "project.json");
    const fileSystem = new DiagnosticFileSystem()
      .addWorktree(active, { id: "active" })
      .addWorktree(malformed, { id: "malformed", rawConfig: "{" })
      .addWorktree(healthy, { id: "healthy", style: "legacy" });

    const result = await loadBoth(active, fileSystem);

    expect(result.data.discoveredProjects?.map((project) => project.id)).toEqual([
      "active",
      "healthy",
    ]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "warning",
        source: "worktree-config-discovery",
        phase: "parse",
        path: malformedPath,
        code: "INVALID_JSON",
        message: expect.stringContaining("JSON"),
      }),
    );
  });
});
