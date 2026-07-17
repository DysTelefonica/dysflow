import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRuntimeDir } from "./runtime-dir.js";

/**
 * Issue #940 — runtime documentation bundle status.
 *
 * `dysflow install` ships three diagnostic markdown files inside the runtime
 * dir (`references/error-codes.md`, `docs/diagnostics/hresult-guide.md`,
 * `docs/diagnostics/form-import-gate-failures.md`). Older releases did not
 * extract them at install time, so the `remediation` field on every typed
 * error envelope pointed at a markdown anchor that did not exist on disk.
 *
 * `get_capabilities` exposes this status up-front so callers can detect
 * missing docs without probing the filesystem. The shape is intentionally
 * tiny — just the two most-actionable flags plus the runtime version — so
 * it stays cheap to compute and easy to reason about. `formImportGateFailuresMd`
 * is intentionally OUT of scope for v2.14.x; the field can be added later
 * if the consumer demand proves it useful.
 *
 * Field semantics:
 * - `errorCodesMd`: true when `<runtimeDir>/references/error-codes.md` exists
 *   on disk. False otherwise.
 * - `hresultGuideMd`: true when `<runtimeDir>/docs/diagnostics/hresult-guide.md`
 *   exists on disk. False otherwise.
 * - `version`: the runtime version (read from `<runtimeDir>/app/package.json`
 *   when present), falling back to the `adapterVersion` option, falling back
 *   to `"unknown"`. Never undefined.
 */
export interface DocumentationBundleStatus {
  errorCodesMd: boolean;
  hresultGuideMd: boolean;
  version: string;
}

export type DocumentationBundleResolver = () => DocumentationBundleStatus;

/**
 * Resolve the documentation bundle status for the current runtime.
 *
 * - `runtimeDir` override wins over `DYSFLOW_HOME` and the system marker
 *   (mirrors `resolveRuntimeDir`'s precedence).
 * - When the override is omitted, the env-stripped `resolveRuntimeDir(undefined, env)`
 *   wins — so test callers can pass `DYSFLOW_HOME=...` without polluting the
 *   host process environment.
 * - `existsSync` on the two on-disk paths. We don't read the file — just
 *   confirm presence — so this stays cheap and never throws on a corrupt install.
 * - `version` prefers `<runtimeDir>/app/package.json` `version` field; falls
 *   back to the `adapterVersion` option; final fallback `"unknown"`.
 */
export function resolveDocumentationBundleStatus(
  env: NodeJS.ProcessEnv,
  options: { runtimeDir?: string; adapterVersion?: string } = {},
): DocumentationBundleStatus {
  const runtimeDir = resolveRuntimeDir(options.runtimeDir, env);
  const errorCodesMd = existsSync(path.join(runtimeDir, "references", "error-codes.md"));
  const hresultGuideMd = existsSync(
    path.join(runtimeDir, "docs", "diagnostics", "hresult-guide.md"),
  );
  return {
    errorCodesMd,
    hresultGuideMd,
    version: readRuntimeVersion(runtimeDir, options.adapterVersion),
  };
}

/**
 * Resolve bundle status from the runtime that contains a packaged entry point.
 *
 * An MCP client can preserve a stale `DYSFLOW_HOME` across an in-place update.
 * The running entry point is stronger evidence: packaged adapters live at
 * `<runtime>/app/dist/adapters/mcp/*.js`. Fall back to the normal environment
 * and marker precedence outside that packaged layout (for example in source
 * checkouts and tests).
 */
export function resolveDocumentationBundleStatusNearModule(
  moduleUrl: string,
  env: NodeJS.ProcessEnv,
  adapterVersion?: string,
): DocumentationBundleStatus {
  const modulePath = fileURLToPath(moduleUrl);
  const packagedRuntimeDir = path.resolve(path.dirname(modulePath), "../../../..");
  const packagedManifest = path.join(packagedRuntimeDir, "app", "package.json");
  const runtimeDir = existsSync(packagedManifest) ? packagedRuntimeDir : undefined;
  return resolveDocumentationBundleStatus(env, { runtimeDir, adapterVersion });
}

function readRuntimeVersion(runtimeDir: string, adapterVersion: string | undefined): string {
  try {
    const raw = readFileSync(path.join(runtimeDir, "app", "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.length > 0) {
      return parsed.version;
    }
  } catch {
    // app/package.json missing or unreadable — fall back to adapterVersion.
  }
  return adapterVersion ?? "unknown";
}
