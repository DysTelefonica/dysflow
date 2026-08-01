import { existsSync, type FSWatcher, readFileSync, realpathSync, watch } from "node:fs";
import { resolve } from "node:path";
import type { ProjectConfigDiagnostic } from "./project-config-diagnostic.js";

export const DEFAULT_WORKTREE_CACHE_TTL_MS = 300_000;
export const DEFAULT_WORKTREE_CACHE_MAX_ENTRIES = 32;

export type WorktreeContextSource = "startup" | "cwd-param" | "register";

export type WorktreeContext = {
  cwd: string;
  projectRoot: string;
  configPath: string | null;
  config: Record<string, unknown> | null;
  discoveredProjects: NonNullable<ProjectConfigDiagnostic["discoveredProjects"]>;
  scannedAt: number;
  sourceHint: WorktreeContextSource;
  projectConfig: ProjectConfigDiagnostic;
};

export type WorktreeCacheTelemetry = {
  hits: number;
  misses: number;
  invalidations: number;
  evictions: number;
  entries: number;
  watchers: number;
  maxEntries: number;
  ttlMs: number;
};

type DiagnosticResolver = (
  cwd: string,
  request: Record<string, unknown>,
) => ProjectConfigDiagnostic | Promise<ProjectConfigDiagnostic>;

type CacheEntry = { context: WorktreeContext; watcher?: FSWatcher };

const TARGET_KEYS = new Set([
  "projectId",
  "accessPath",
  "accessDbPath",
  "databasePath",
  "sourcePath",
  "backendPath",
  "destinationRoot",
  "projectRoot",
  "allowExternalAccessPath",
]);

export class WorktreeContextCache {
  readonly #entries = new Map<string, CacheEntry>();
  readonly #resolveDiagnostic: DiagnosticResolver;
  readonly #ttlMs: number;
  readonly #maxEntries: number;
  #hits = 0;
  #misses = 0;
  #invalidations = 0;
  #evictions = 0;

  constructor(options: {
    resolveDiagnostic: DiagnosticResolver;
    ttlMs?: number;
    maxEntries?: number;
  }) {
    this.#resolveDiagnostic = options.resolveDiagnostic;
    this.#ttlMs = options.ttlMs ?? DEFAULT_WORKTREE_CACHE_TTL_MS;
    this.#maxEntries = options.maxEntries ?? DEFAULT_WORKTREE_CACHE_MAX_ENTRIES;
  }

  async getContext(
    cwdInput: string,
    sourceHint: WorktreeContextSource,
  ): Promise<{ context: WorktreeContext; status: "hit" | "miss" }> {
    const cwd = canonicalCwd(cwdInput);
    const key = identity(cwd);
    const now = Date.now();
    const cached = this.#entries.get(key);
    if (cached !== undefined && now - cached.context.scannedAt < this.#ttlMs) {
      this.#entries.delete(key);
      this.#entries.set(key, cached);
      this.#hits += 1;
      return { context: { ...cached.context, sourceHint }, status: "hit" };
    }
    if (cached !== undefined) this.#invalidateKey(key);
    this.#misses += 1;
    const diagnostic = await this.#resolveDiagnostic(cwd, {});
    const context = buildContext(cwd, sourceHint, diagnostic, now);
    this.#insert(key, context);
    return { context, status: "miss" };
  }

  async resolveDiagnostic(
    cwdInput: string,
    request: Record<string, unknown>,
    sourceHint: WorktreeContextSource,
  ): Promise<ProjectConfigDiagnostic> {
    const cached = await this.getContext(cwdInput, sourceHint);
    if (requiresSelectorSpecificDiagnostic(request, cached.context)) {
      // A selector that names another target must retain the resolver's
      // fail-closed project-selection behavior. The cached context still
      // avoids repeating the unselected-worktree scan; this one request is
      // intentionally resolved with its selector-specific semantics.
      this.#misses += 1;
      return await this.#resolveDiagnostic(cached.context.cwd, request);
    }
    return cached.context.projectConfig;
  }

  clear(cwdInput?: string): number {
    if (cwdInput === undefined) {
      const count = this.#entries.size;
      for (const key of [...this.#entries.keys()]) this.#invalidateKey(key);
      return count;
    }
    const key = identity(canonicalCwd(cwdInput));
    if (!this.#entries.has(key)) return 0;
    this.#invalidateKey(key);
    return 1;
  }

  telemetry(): WorktreeCacheTelemetry {
    return {
      hits: this.#hits,
      misses: this.#misses,
      invalidations: this.#invalidations,
      evictions: this.#evictions,
      entries: this.#entries.size,
      watchers: [...this.#entries.values()].filter((entry) => entry.watcher !== undefined).length,
      maxEntries: this.#maxEntries,
      ttlMs: this.#ttlMs,
    };
  }

  close(): void {
    for (const entry of this.#entries.values()) entry.watcher?.close();
    this.#entries.clear();
  }

  #insert(key: string, context: WorktreeContext): void {
    while (this.#entries.size >= this.#maxEntries) {
      const oldest = this.#entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#evictions += 1;
      this.#invalidateKey(oldest);
    }
    const entry: CacheEntry = { context };
    if (context.configPath !== null && existsSync(context.configPath)) {
      try {
        entry.watcher = watch(context.configPath, () => this.#invalidateKey(key));
        entry.watcher.on("error", () => this.#invalidateKey(key));
        entry.watcher.unref();
      } catch {
        // TTL remains the bounded fallback when the platform watcher is unavailable.
      }
    }
    this.#entries.set(key, entry);
  }

  #invalidateKey(key: string): void {
    const entry = this.#entries.get(key);
    if (entry === undefined) return;
    entry.watcher?.close();
    this.#entries.delete(key);
    this.#invalidations += 1;
  }
}

function requiresSelectorSpecificDiagnostic(
  request: Record<string, unknown>,
  context: WorktreeContext,
): boolean {
  if (!Object.keys(request).some((key) => TARGET_KEYS.has(key))) return false;

  const diagnostic = context.projectConfig;
  if (request.projectId !== undefined && request.projectId !== diagnostic.projectId) return true;
  if (!matchesConfiguredPath(request.projectRoot, diagnostic.projectRoot, context.cwd)) return true;
  if (!matchesConfiguredPath(request.destinationRoot, diagnostic.destinationRoot, context.cwd))
    return true;
  if (!matchesConfiguredPath(request.backendPath, diagnostic.backendPath, context.cwd)) return true;

  for (const key of ["accessPath", "accessDbPath", "databasePath"] as const) {
    if (!matchesConfiguredPath(request[key], diagnostic.accessPath, context.cwd)) return true;
  }

  // `sourcePath` names a source artifact for form-oriented operations, not
  // necessarily the frontend database. Keep that dynamic dispatch path fresh.
  if (request.sourcePath !== undefined) {
    const operation = typeof request.operation === "string" ? request.operation : "";
    if (operation.startsWith("form_") || operation === "apply_form_design_plan") return true;
    if (!matchesConfiguredPath(request.sourcePath, diagnostic.accessPath, context.cwd)) return true;
  }

  return false;
}

function matchesConfiguredPath(
  requested: unknown,
  configured: string | null,
  cwd: string,
): boolean {
  if (requested === undefined) return true;
  if (typeof requested !== "string" || configured === null) return false;
  return identity(canonicalCwd(resolve(cwd, requested))) === identity(canonicalCwd(configured));
}

function buildContext(
  cwd: string,
  sourceHint: WorktreeContextSource,
  projectConfig: ProjectConfigDiagnostic,
  scannedAt: number,
): WorktreeContext {
  const configPath = existsSync(projectConfig.configPath) ? projectConfig.configPath : null;
  let config: Record<string, unknown> | null = null;
  if (configPath !== null) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(configPath, "utf8"));
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        config = parsed as Record<string, unknown>;
      }
    } catch {
      config = null;
    }
  }
  return {
    cwd,
    projectRoot: projectConfig.projectRoot,
    configPath,
    config,
    discoveredProjects: projectConfig.discoveredProjects ?? [],
    scannedAt,
    sourceHint,
    projectConfig,
  };
}

function canonicalCwd(value: string): string {
  const absolute = resolve(value);
  try {
    return realpathSync.native(absolute);
  } catch {
    return absolute;
  }
}

function identity(value: string): string {
  const normalized = resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
