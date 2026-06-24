/**
 * Runtime diagnostics — ambient runtime information surfaced in verify_code
 * results so consumers can identify exactly which Dysflow
 * binary is executing, through which interface (CLI / MCP stdio / shared-core),
 * and when it was built.
 *
 * All fields are optional so the object is always presentable even when some
 * signals are unavailable (e.g. buildTimestamp in dev mode without SOURCE_EPOCH
 * injected). Callers MUST treat missing fields as "unknown".
 */

import { readPackageVersionNear } from "./package-info.js";

/** Runtime execution context labels. */
export type RuntimeType = "cli" | "mcp-stdio" | "shared-core";

export type RuntimeDiagnostics = {
  /** Dysflow package version (e.g. "1.2.53"). */
  dysflowVersion?: string;
  /** Version of the MCP adapter / server that produced this result. */
  adapterVersion?: string;
  /** How Dysflow is being invoked. */
  runtimeType?: RuntimeType;
  /** Absolute path to the process / binary that is running. */
  runtimePath?: string;
  /**
   * ISO-8601 timestamp of when the runtime was built.
   * Injected at build time via the `SOURCE_EPOCH` env var (set by CI/CD
   * pipelines from the git commit timestamp). Absent in local dev builds.
   */
  buildTimestamp?: string;
  /**
   * Absolute path to the Node.js executable (process.execPath).
   * Useful for identifying the actual runtime binary.
   */
  executablePath?: string;
  /**
   * Which code path is executing — mirrors runtimeType but carried as a
   * separate field so consumers can distinguish the CLI entrypoint from the
   * MCP adapter without ambiguity.
   */
  codePath?: RuntimeType;
  /**
   * Build identifier — if SOURCE_EPOCH is available, this is the ISO-8601
   * timestamp derived from it. Otherwise undefined in dev builds.
   */
  buildIdentifier?: string;
};

/**
 * Detect the runtime execution context from ambient Node.js process information.
 *
 * Priority:
 * 1. DYSFLOW_RUNTIME_TYPE env var (explicit override — used by tests and wrappers)
 * 2. Detection heuristics:
 *    - `process.env.DYSFLOW_MCP_STDIO` → "mcp-stdio"
 *    - argv[2] === "mcp" when argv[1] contains "dysflow" → "mcp-stdio"
 *    - argv[1] contains "dysflow" → "cli"
 *    - otherwise → "shared-core"
 *
 * @param overrides - Optional test hook for argv/env injection. Not intended for
 *   production use; enables reliable unit testing without global mutation.
 */
export function detectRuntimeContext(
  overrides?: Partial<{ argv: string[]; env: Record<string, string | undefined> }>,
): {
  runtimeType: RuntimeType;
  runtimePath: string;
  buildTimestamp: string | undefined;
} {
  const argv = overrides?.argv ?? process.argv;
  const env = overrides?.env ?? process.env;

  // Explicit override — used by test harnesses and wrapper scripts
  const explicit = env.DYSFLOW_RUNTIME_TYPE;
  if (explicit === "cli" || explicit === "mcp-stdio" || explicit === "shared-core") {
    return {
      runtimeType: explicit,
      runtimePath: process.execPath,
      buildTimestamp: normalizeBuildTimestamp(env.SOURCE_EPOCH),
    };
  }

  // Heuristic: MCP stdio servers set this env var
  if (env.DYSFLOW_MCP_STDIO === "1") {
    return {
      runtimeType: "mcp-stdio",
      runtimePath: process.execPath,
      buildTimestamp: normalizeBuildTimestamp(env.SOURCE_EPOCH),
    };
  }

  // Heuristic: CLI invocation — argv[0] is the node binary, argv[1] is dysflow
  const argv1 = argv[1] ?? "";
  const argv2 = argv[2] ?? "";

  // Check for dysflow mcp subcommand before classifying as cli
  if (
    (argv1.includes("dysflow") || argv1.endsWith("dysflow") || argv1.includes("dysflow\\")) &&
    argv2 === "mcp"
  ) {
    return {
      runtimeType: "mcp-stdio",
      runtimePath: argv1,
      buildTimestamp: normalizeBuildTimestamp(env.SOURCE_EPOCH),
    };
  }

  if (argv1.includes("dysflow") || argv1.endsWith("dysflow") || argv1.includes("dysflow\\")) {
    return {
      runtimeType: "cli",
      runtimePath: argv1,
      buildTimestamp: normalizeBuildTimestamp(env.SOURCE_EPOCH),
    };
  }

  // Default: shared core library loaded by another process
  return {
    runtimeType: "shared-core",
    runtimePath: process.execPath,
    buildTimestamp: normalizeBuildTimestamp(env.SOURCE_EPOCH),
  };
}

/**
 * Normalize SOURCE_EPOCH to ISO-8601.
 *
 * - Numeric Unix epoch seconds → ISO-8601 UTC string
 * - Already-formatted ISO string → pass through as-is
 * - undefined / empty → undefined
 */
function normalizeBuildTimestamp(sourceEpoch: string | undefined): string | undefined {
  if (sourceEpoch === undefined || sourceEpoch.trim() === "") {
    return undefined;
  }
  const trimmed = sourceEpoch.trim();
  // If it looks like a plain number, treat as Unix epoch seconds
  if (/^\d+$/.test(trimmed)) {
    const ms = Number.parseInt(trimmed, 10) * 1000;
    return new Date(ms).toISOString();
  }
  // Already an ISO string or other formatted value — pass through
  return trimmed;
}

/**
 * Build a RuntimeDiagnostics snapshot using the canonical Dysflow package version
 * and the ambient runtime context detection.
 */
export function buildRuntimeDiagnostics(options?: Partial<RuntimeDiagnostics>): RuntimeDiagnostics {
  const ctx = detectRuntimeContext();
  return {
    dysflowVersion: readPackageVersionNear(import.meta.url),
    adapterVersion: readPackageVersionNear(import.meta.url),
    runtimeType: ctx.runtimeType,
    runtimePath: ctx.runtimePath,
    buildTimestamp: ctx.buildTimestamp,
    // Additive fields per user contract
    executablePath: process.execPath,
    codePath: ctx.runtimeType,
    buildIdentifier: ctx.buildTimestamp,
    ...options,
  };
}
