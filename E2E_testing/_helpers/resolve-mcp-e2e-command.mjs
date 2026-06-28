// E2E_testing/_helpers/resolve-mcp-e2e-command.mjs
//
// Resolves which dysflow runtime the MCP E2E harness is allowed to spawn.
// The harness must NEVER silently default to the production runtime at
// %LOCALAPPDATA%\dysflow — that install is the host's live runtime, and
// spawning it under E2E mixes the wrong scripts, the wrong DYSFLOW_HOME,
// and the wrong Update path into the test environment.
//
// Priority order:
//   1. process.env.DYSFLOW_E2E_COMMAND  (operator override; always honored)
//   2. <repoRoot>/test-runtime/bin/dysflow.cmd  (local build; preferred default)
//   3. %LOCALAPPDATA%/dysflow/bin/dysflow.cmd  (REFUSED without an explicit override)
//   4. nothing → MCP_E2E_NO_RUNTIME_AVAILABLE
//
// This is a pure function: it takes `env`, `repoRoot`, and an injected `fs`
// so the unit test (test/quality-gates/resolve-mcp-e2e-command.test.ts)
// can exercise every branch without touching the real filesystem.

/**
 * Returns true when the given path lives under %LOCALAPPDATA%\dysflow,
 * i.e. the production install that the harness must refuse by default.
 * @param {string} candidatePath
 */
export function isProductionRuntimePath(candidatePath) {
  if (!candidatePath || typeof candidatePath !== "string") return false;
  const normalized = candidatePath.replace(/\\/g, "/").toLowerCase();
  // %LOCALAPPDATA% resolves to <USERPROFILE>/AppData/Local on Windows, and
  // the production install places its bin under that AppData/Local/dysflow.
  return (
    normalized.includes("/appdata/local/dysflow/") ||
    normalized.includes("/localappdata/dysflow/")
  );
}

/**
 * Resolve the dysflow command the E2E harness should spawn.
 * @param {object} options
 * @param {Record<string, string | undefined>} options.env
 * @param {string} options.repoRoot
 * @param {{ existsSync: (path: string) => boolean }} [options.fs]
 * @returns {{ ok: true, command: string, source: "env-override" | "test-runtime" }
 *          | { ok: false, code: "MCP_E2E_OVERRIDE_NOT_FOUND"
 *                       | "MCP_E2E_REFUSES_PRODUCTION_RUNTIME"
 *                       | "MCP_E2E_NO_RUNTIME_AVAILABLE",
 *              message: string, candidates: string[] }}
 */
export function resolveMcpE2eCommand(options) {
  const env = options.env ?? {};
  const repoRoot = options.repoRoot ?? "";
  const existsSync =
    options.fs?.existsSync ?? ((p) => {
      try {
        // Lazy import so the helper stays pure when an fs is injected.
        // eslint-disable-next-line global-require
        return require("node:fs").existsSync(p);
      } catch {
        return false;
      }
    });

  // 1. Operator override.
  const override = env.DYSFLOW_E2E_COMMAND;
  if (override && override.length > 0) {
    if (existsSync(override)) {
      return { ok: true, command: override, source: "env-override" };
    }
    return {
      ok: false,
      code: "MCP_E2E_OVERRIDE_NOT_FOUND",
      message:
        `DYSFLOW_E2E_COMMAND is set to "${override}" but the file does not exist. ` +
        `Either build the runtime (pnpm build) or fix the env var.`,
      candidates: [override],
    };
  }

  // 2. Repo-local test-runtime build.
  const testRuntimePath = joinPath(repoRoot, "test-runtime", "bin", "dysflow.cmd");
  if (existsSync(testRuntimePath)) {
    return { ok: true, command: testRuntimePath, source: "test-runtime" };
  }

  // 3. Production runtime — refused without an explicit override.
  const localAppData = env.LOCALAPPDATA ?? "";
  const productionPath = joinPath(localAppData, "dysflow", "bin", "dysflow.cmd");
  if (existsSync(productionPath)) {
    return {
      ok: false,
      code: "MCP_E2E_REFUSES_PRODUCTION_RUNTIME",
      message:
        `Refusing to use the production runtime at "${productionPath}" without an explicit ` +
        `DYSFLOW_E2E_COMMAND. The E2E suite must run against the repo-local test-runtime. ` +
        `Build it with 'pnpm build' (produces ${testRuntimePath}) or set DYSFLOW_E2E_COMMAND ` +
        `to point at a different runtime.`,
      candidates: [productionPath, testRuntimePath],
    };
  }

  // 4. Nothing on disk anywhere.
  return {
    ok: false,
    code: "MCP_E2E_NO_RUNTIME_AVAILABLE",
    message:
      `No dysflow runtime found. Searched: ${testRuntimePath}, ${productionPath}. ` +
      `Set DYSFLOW_E2E_COMMAND or build the test-runtime with 'pnpm build'.`,
    candidates: [testRuntimePath, productionPath],
  };
}

/**
 * Cross-platform path join (the helper is Windows-targeted but the
 * resolution logic should not blow up on the test runner's host OS).
 * @param  {...string} parts
 */
function joinPath(...parts) {
  return parts
    .filter((p) => typeof p === "string" && p.length > 0)
    .join("/")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
}
