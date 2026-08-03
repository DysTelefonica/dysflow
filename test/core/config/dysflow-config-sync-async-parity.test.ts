import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type ConfigFileSystemPort,
  discoverWorktreeProjectConfigs,
  discoverWorktreeProjectConfigsAsync,
  loadDysflowConfigAsyncWith,
  loadDysflowConfigWith,
} from "../../../src/core/config/dysflow-config.js";

const ROOT = resolve(process.cwd(), "config-parity-fixtures");

type ConfigStyle = "standard" | "legacy";

class ScenarioFileSystem implements ConfigFileSystemPort {
  readonly #entries = new Map<string, unknown>();
  readonly #directories = new Map<string, string[]>();
  readonly #unreadable = new Set<string>();

  constructor(private readonly temporaryRoot = resolve(ROOT, "system-tmp")) {}

  addWorktree(
    projectRoot: string,
    options: {
      id: string;
      style?: ConfigStyle;
      frontendFile?: string;
      destinationRoot?: string;
      rawConfig?: unknown;
      unreadable?: boolean;
    },
  ): this {
    const root = resolve(projectRoot);
    const style = options.style ?? "standard";
    const configPath =
      style === "standard"
        ? resolve(root, ".dysflow", "project.json")
        : resolve(root, "dysflow.project.json");
    const rawConfig = options.rawConfig ?? {
      id: options.id,
      frontendFile: options.frontendFile ?? `${options.id}.accdb`,
      destinationRoot: options.destinationRoot ?? "src",
      capabilities: { allowWrites: true },
    };

    this.#entries.set(resolve(root, ".git"), true);
    if (style === "standard") this.#entries.set(resolve(root, ".dysflow"), true);
    this.#entries.set(configPath, rawConfig);
    if (options.unreadable === true) this.#unreadable.add(configPath);

    const parent = dirname(root);
    const siblings = this.#directories.get(parent) ?? [];
    const name = root.slice(parent.length + 1);
    if (!siblings.includes(name)) siblings.push(name);
    this.#directories.set(parent, siblings);
    this.#entries.set(parent, true);
    return this;
  }

  existsSync(path: string): boolean {
    return this.#entries.has(resolve(path));
  }

  async existsAsync(path: string): Promise<boolean> {
    return this.existsSync(path);
  }

  readJsonSync<T>(path: string): T {
    const normalized = resolve(path);
    if (this.#unreadable.has(normalized)) throw new Error(`EACCES: ${normalized}`);
    const value = this.#entries.get(normalized);
    if (value === undefined) throw new Error(`ENOENT: ${normalized}`);
    return (typeof value === "string" ? JSON.parse(value) : value) as T;
  }

  async readJsonAsync<T>(path: string): Promise<T> {
    return this.readJsonSync<T>(path);
  }

  readdirSync(path: string): string[] {
    const normalized = resolve(path);
    const entries = this.#directories.get(normalized);
    if (entries === undefined) throw new Error(`ENOTDIR: ${normalized}`);
    return [...entries];
  }

  async readdirAsync(path: string): Promise<string[]> {
    return this.readdirSync(path);
  }

  tmpdir(): string {
    return this.temporaryRoot;
  }
}

async function expectDiscoveryParity(
  cwd: string,
  fileSystem: ConfigFileSystemPort,
): Promise<ReturnType<typeof discoverWorktreeProjectConfigs>> {
  const syncResult = discoverWorktreeProjectConfigs(cwd, fileSystem);
  const asyncResult = await discoverWorktreeProjectConfigsAsync(cwd, fileSystem);
  expect(asyncResult).toEqual(syncResult);
  return syncResult;
}

async function expectLoadParity(
  input: Parameters<typeof loadDysflowConfigWith>[0],
  fileSystem: ConfigFileSystemPort,
): Promise<ReturnType<typeof loadDysflowConfigWith>> {
  const syncResult = loadDysflowConfigWith(input, fileSystem);
  const asyncResult = await loadDysflowConfigAsyncWith(input, fileSystem);
  expect(asyncResult).toEqual(syncResult);
  return syncResult;
}

describe("sync/async config discovery parity", () => {
  it("returns only the active worktree when there are no siblings", async () => {
    const active = resolve(ROOT, "solo", "active");
    const fileSystem = new ScenarioFileSystem().addWorktree(active, { id: "active" });

    const result = await expectDiscoveryParity(active, fileSystem);

    expect(result).toEqual([
      expect.objectContaining({ id: "active", projectRoot: active, active: true }),
    ]);
  });

  it("discovers standard and legacy siblings in project-root order with stable active flags", async () => {
    const parent = resolve(ROOT, "ordered");
    const active = resolve(parent, "middle");
    const first = resolve(parent, "alpha");
    const last = resolve(parent, "zulu");
    const fileSystem = new ScenarioFileSystem()
      .addWorktree(last, { id: "legacy", style: "legacy" })
      .addWorktree(active, { id: "active" })
      .addWorktree(first, { id: "standard" });

    const result = await expectDiscoveryParity(active, fileSystem);

    expect(
      result.map(({ id, projectRoot, active: isActive }) => ({ id, projectRoot, isActive })),
    ).toEqual([
      { id: "standard", projectRoot: first, isActive: false },
      { id: "active", projectRoot: active, isActive: true },
      { id: "legacy", projectRoot: last, isActive: false },
    ]);
  });

  it("does not scan siblings when the worktree parent is the OS temporary root", async () => {
    const temporaryRoot = resolve(ROOT, "tmp-parent");
    const active = resolve(temporaryRoot, "active");
    const sibling = resolve(temporaryRoot, "sibling");
    const fileSystem = new ScenarioFileSystem(temporaryRoot)
      .addWorktree(active, { id: "active" })
      .addWorktree(sibling, { id: "ignored" });

    const result = await expectDiscoveryParity(active, fileSystem);

    expect(result.map((project) => project.id)).toEqual(["active"]);
  });

  it("skips unreadable and malformed sibling configs without disturbing valid results", async () => {
    const parent = resolve(ROOT, "broken-siblings");
    const active = resolve(parent, "active");
    const fileSystem = new ScenarioFileSystem()
      .addWorktree(active, { id: "active" })
      .addWorktree(resolve(parent, "malformed"), {
        id: "malformed",
        style: "legacy",
        rawConfig: "{ invalid json",
      })
      .addWorktree(resolve(parent, "unreadable"), { id: "unreadable", unreadable: true });

    const result = await expectDiscoveryParity(active, fileSystem);

    expect(result.map((project) => project.id)).toEqual(["active"]);
  });
});

describe("sync/async config loading parity", () => {
  it("loads standard and legacy active configs with identical result shapes", async () => {
    for (const style of ["standard", "legacy"] as const) {
      const active = resolve(ROOT, `active-${style}`);
      const fileSystem = new ScenarioFileSystem().addWorktree(active, {
        id: style,
        style,
      });

      const result = await expectLoadParity({ cwd: active, env: {} }, fileSystem);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`expected ${style} config to load`);
      expect(result.data).toMatchObject({
        projectId: style,
        projectRoot: active,
        configSource: "repo-config",
      });
    }
  });

  it("maps malformed active config and missing config to the same failures", async () => {
    const malformed = resolve(ROOT, "load-errors", "malformed");
    const malformedFs = new ScenarioFileSystem().addWorktree(malformed, {
      id: "malformed",
      rawConfig: "{ invalid json",
    });
    const malformedResult = await expectLoadParity({ cwd: malformed, env: {} }, malformedFs);
    expect(malformedResult.ok).toBe(false);
    if (!malformedResult.ok) expect(malformedResult.error.code).toBe("CONFIG_PROJECT_FILE_INVALID");

    const missingResult = await expectLoadParity(
      { cwd: resolve(ROOT, "load-errors", "missing"), env: {} },
      new ScenarioFileSystem(),
    );
    expect(missingResult.ok).toBe(false);
    if (!missingResult.ok) expect(missingResult.error.code).toBe("CONFIG_MISSING_ACCESS_PATH");
  });

  it("selects a sibling by explicit project id and by explicit access path", async () => {
    const parent = resolve(ROOT, "explicit-targets");
    const active = resolve(parent, "active");
    const sibling = resolve(parent, "sibling");
    const fileSystem = new ScenarioFileSystem()
      .addWorktree(active, { id: "active" })
      .addWorktree(sibling, { id: "target", frontendFile: "Target.accdb" });

    const byId = await expectLoadParity({ cwd: active, projectId: "target", env: {} }, fileSystem);
    expect(byId.ok).toBe(true);
    if (!byId.ok) throw new Error("expected sibling selection by project id");
    expect(byId.data.projectRoot).toBe(sibling);

    const byPath = await expectLoadParity(
      { cwd: active, accessDbPath: resolve(sibling, "Target.accdb"), env: {} },
      fileSystem,
    );
    expect(byPath.ok).toBe(true);
    if (!byPath.ok) throw new Error("expected sibling selection by access path");
    expect(byPath.data.projectRoot).toBe(sibling);
    expect(byPath.data.accessDbPath).toBe(resolve(sibling, "Target.accdb"));
  });

  it("returns the same collision failure for duplicate sibling project ids", async () => {
    const parent = resolve(ROOT, "collision");
    const active = resolve(parent, "active");
    const fileSystem = new ScenarioFileSystem()
      .addWorktree(active, { id: "active" })
      .addWorktree(resolve(parent, "first"), { id: "duplicate" })
      .addWorktree(resolve(parent, "second"), { id: "duplicate", style: "legacy" });

    const result = await expectLoadParity(
      { cwd: active, projectId: "duplicate", env: {} },
      fileSystem,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PROJECT_ID_COLLISION");
      expect(result.error.message).toContain(resolve(parent, "first"));
      expect(result.error.message).toContain(resolve(parent, "second"));
    }
  });
});
