/**
 * Issue #830 — internal CodeGraph-VBA invoker.
 *
 * Boundary invariant: this adapter depends on `codegraph-vba` (one-way only).
 * Dysflow → CodeGraph-VBA. NEVER the other direction (CodeGraph-VBA never
 * imports or invokes dysflow). The direction is documented in the issue body
 * and pinned by the `autoFetchCodeGraph` opt-in flag on `map_form_behavior`:
 * the caller decides per-call whether to relax the no-MCP-to-MCP boundary.
 *
 * The invoker is a port. The default factory below returns a graceful-fallback
 * implementation that tries `codegraph-vba explore` when a `.codegraph/`
 * index exists in the project. If anything goes wrong (no index, CLI missing,
 * subprocess error, parse error) the implementation returns `{ evidence: [],
 * warning }` and the adapter falls back to the legacy `.form.txt`-only
 * behavior — NEVER throws. This contract is the core of the issue #830
 * acceptance criteria.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import type { CodeGraphBehaviorEvidence } from "../../core/models/form-ui-builder.js";

const execFileAsync = promisify(execFile);

/**
 * Inputs to `fetchBehaviorEvidence`. The `projectPath` MUST be the project's
 * source root (where `.codegraph/` would live, if at all). The adapter scopes
 * the request to the named form's mapped controls so the lookup stays narrow.
 */
export type CodeGraphVbaEvidenceRequest = {
  formName: string;
  controlNames: readonly string[];
  projectPath: string;
};

/**
 * Result envelope. `evidence` is the merged call-path evidence to feed into
 * `buildFormUiBehaviorMap` alongside any caller-supplied evidence. `warning`
 * is a soft-failure notice (e.g. "CodeGraph index not initialized in
 * `<path>`. Pass `codegraphEvidence` manually, or run `codegraph-vba init`.")
 * — the adapter surfaces this on the behavior map's `warnings[]` array
 * alongside any caller-supplied warnings, so the agent sees WHY the lookup
 * was skipped.
 *
 * `warning` is OPTIONAL — a successful lookup just returns `{ evidence }`.
 */
export type CodeGraphVbaEvidenceResult = {
  evidence: CodeGraphBehaviorEvidence[];
  codegraphIndexPath: string | null;
  warning?: string;
};

/**
 * Port: fetch CodeGraph-VBA call-path evidence for a form's mapped controls.
 *
 * Contract:
 *   - MUST NOT throw. Always resolve with a `CodeGraphVbaEvidenceResult`.
 *   - On lookup success: `{ evidence: CodeGraphBehaviorEvidence[] }`.
 *   - On any failure (no index, CLI missing, parse error, timeout): resolve
 *     with `{ evidence: [], warning: "<human-readable reason>" }`.
 *   - On partial success: include what was found in `evidence` and put any
 *     caveats in `warning`.
 *
 * The adapter layer (vba-forms-ai-tools.ts `mapFromFile`) wraps invoker
 * failures in a try/catch as defense-in-depth; the invoker itself still
 * promises never to throw so its `warning` channel is the single source of
 * truth for soft failures.
 */
export interface CodeGraphVbaInvoker {
  fetchBehaviorEvidence(request: CodeGraphVbaEvidenceRequest): Promise<CodeGraphVbaEvidenceResult>;
}

/**
 * Options for {@link createDefaultCodeGraphVbaInvoker}.
 */
export type CreateDefaultCodeGraphVbaInvokerOptions = {
  /**
   * The shell command to invoke. Default: `"codegraph-vba"`. Override for
   * tests that want to point at a custom CLI stub.
   */
  command?: string;
  /**
   * Maximum time (ms) to wait for the CLI invocation. Default: `10000`.
   * Short enough to keep `map_form_behavior` responsive when codegraph-vba
   * hangs; long enough for a small project.
   */
  timeoutMs?: number;
};

/**
 * Default factory: returns a `CodeGraphVbaInvoker` that
 *   1. Checks for `<projectPath>/.codegraph/`. If absent, returns
 *      `{ evidence: [], warning: "<…> not initialized in <projectPath>" }`.
 *   2. If the index exists, shells out to `<command> explore <query>` with a
 *      bounded timeout.
 *   3. Parses the JSON-shaped output into `CodeGraphBehaviorEvidence[]`.
 *   4. On any failure (ENOENT, non-zero exit, parse error, timeout), returns
 *      `{ evidence: [], warning: "<human-readable reason>" }`.
 *
 * The default implementation NEVER throws. The contract is "best-effort +
 * opt-in flag" per issue #830.
 */
export function createDefaultCodeGraphVbaInvoker(
  options: CreateDefaultCodeGraphVbaInvokerOptions = {},
): CodeGraphVbaInvoker {
  const command = options.command ?? "codegraph-vba";
  const timeoutMs = options.timeoutMs ?? 10_000;

  return {
    async fetchBehaviorEvidence(request) {
      const { formName, controlNames, projectPath } = request;

      if (!existsSync(projectPath)) {
        return {
          evidence: [],
          codegraphIndexPath: null,
          warning: `CodeGraph-VBA lookup skipped: project path "${projectPath}" does not exist.`,
        };
      }
      const forkIndex = join(projectPath, ".codegraph-vba");
      const upstreamIndex = join(projectPath, ".codegraph");
      const codegraphIndexPath = existsSync(forkIndex)
        ? forkIndex
        : existsSync(upstreamIndex)
          ? upstreamIndex
          : null;
      if (codegraphIndexPath === null) {
        return {
          evidence: [],
          codegraphIndexPath: null,
          warning: `CodeGraph-VBA lookup skipped: no index found at "${forkIndex}/" (fork) or "${upstreamIndex}/" (upstream). Run \`codegraph-vba init\` to enable, or pass \`codegraphEvidence\` explicitly.`,
        };
      }

      // Compose the query. We pass the form name + control list so the CLI
      // narrows the call-path scope to the relevant handlers — matching the
      // contract `buildFormUiBehaviorMap` uses to merge evidence onto
      // controls (handlers prefixed with `<controlName>_`).
      const queryParts = [`form:${formName}`];
      if (controlNames.length > 0) {
        queryParts.push(`controls:${controlNames.join(",")}`);
      }
      const query = queryParts.join(" ");

      try {
        const { stdout } = await execFileAsync(
          command,
          ["explore", "--json", "--path", projectPath, "--max-files", "16", query],
          { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 },
        );
        const evidence = parseCodeGraphJson(stdout, formName, controlNames);
        if (evidence.length === 0) {
          return {
            evidence: [],
            codegraphIndexPath,
            warning: `CodeGraph-VBA returned no handler evidence for form "${formName}". The form may declare events with no VBA handlers, or the index is stale.`,
          };
        }
        return { evidence, codegraphIndexPath };
      } catch (err) {
        // ENOENT (CLI not in PATH), non-zero exit, timeout, parse failure,
        // and "index not initialized" stderr messages all land here. The
        // default implementation collapses them to a single soft-failure
        // envelope — issue #830 requires graceful fallback on ANY failure.
        const message = err instanceof Error ? err.message : String(err);
        return {
          evidence: [],
          codegraphIndexPath,
          warning: `CodeGraph-VBA lookup failed for form "${formName}": ${message}. Falling back to .form.txt-declared events only.`,
        };
      }
    },
  };
}

// ---- helpers --------------------------------------------------------------

/**
 * Parse the JSON output of `codegraph-vba explore --json` into a list of
 * `CodeGraphBehaviorEvidence`. The CLI's shape is intentionally narrow: each
 * evidence record only needs `handler` + `callPath`. We pass `tables` and
 * `effects` when the CLI surfaces them, otherwise omit (both are optional).
 *
 * The parser is defensive: any malformed entry is dropped, never thrown. If
 * the stdout isn't JSON at all, return `[]` so the caller can fall back.
 *
 * `controlNames` is currently informational — we don't filter by it here.
 * `buildFormUiBehaviorMap` already buckets entries by `${controlName}_`
 * prefix and surfaces the rest as `unmappedEvidence`. Keeping the parser
 * filter-free makes the function easier to test and the core merge logic
 * the single source of truth for control-vs-evidence matching.
 */
export function parseCodeGraphJson(
  stdout: string,
  _formName?: string,
  _controlNames?: readonly string[],
): CodeGraphBehaviorEvidence[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }

  const results = extractResults(parsed);
  if (results === undefined) return [];

  const out: CodeGraphBehaviorEvidence[] = [];
  for (const item of results) {
    if (typeof item !== "object" || item === null) continue;
    const entry = item as Record<string, unknown>;
    const handler = typeof entry.handler === "string" ? entry.handler : undefined;
    if (handler === undefined) continue;

    const callPath = entry.callPath;
    if (!Array.isArray(callPath) || !callPath.every((step) => typeof step === "string")) continue;

    const evidence: CodeGraphBehaviorEvidence = {
      handler,
      callPath: callPath as string[],
    };
    const tables = asStringArray(entry.tables);
    if (tables) evidence.tables = tables;
    const effects = asStringArray(entry.effects);
    if (effects) evidence.effects = effects;
    out.push(evidence);
  }
  return out;
}

/**
 * The CLI may return either an array of results directly, or an envelope
 * `{ results: [...] }` / `{ matches: [...] }`. Normalize to the array form.
 */
function extractResults(parsed: unknown): unknown[] | undefined {
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.results)) return obj.results;
    if (Array.isArray(obj.matches)) return obj.matches;
    if (Array.isArray(obj.data)) return obj.data;
  }
  return undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (!value.every((entry) => typeof entry === "string")) return undefined;
  return value as string[];
}
