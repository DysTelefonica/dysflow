import { rename, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { isRecord } from "../../core/utils/index.js";
import { PROJECT_IDENTITY_BLOCK, WRITE_INTENT_BLOCK } from "../../shared/validation/index.js";
import { migrateProjectConfigResultContract } from "./contracts/bootstrap-result-contracts.js";
import {
  enrichmentForValidationMessage,
  invalidInput,
  writesDisabled,
} from "./dispatch-common.js";
import { MCP_TOOL_CONTRACTS } from "./mcp-tool-contracts.js";
import type { DysflowMcpTool, McpToolResult } from "./result-translation.js";
import { validateInput } from "./validator.js";

// `migrate_project_config` — issue #1177.
//
// Drives legacy `.dysflow/project.json` migrations deterministically. The
// tool pairs with `resolve_project` and `get_capabilities`: the consumer
// can call it once, review the proposed diff, and (with explicit
// `apply: true`) rewrite the file in place instead of editing by hand.
//
// Read-only path (default): returns `{ current, proposed, diff,
// remediation[] }` WITHOUT mutating the file. The diff is a unified
// representation that lets a human or AI consumer review the change
// before committing.
//
// Apply path (`apply: true`): atomically writes the proposed JSON to
// `.dysflow/project.json` (via sibling `.tmp` + rename) and refuses
// with `MCP_WRITES_DISABLED` when the MCP process or the project
// capabilities disallow writes.
//
// Idempotence: a config that is already migrated returns an empty
// `diff` and an empty `remediation[]`. The apply path also no-ops on
// the second pass.

const PROJECT_CONFIG_RELATIVE_PATH = join(".dysflow", "project.json");

// Fields the migration engine knows how to rewrite. Listed explicitly
// so future migrations are additive and reviewable here.
const LEGACY_ACCESS_PATH_FIELD = "accessPath";
const FRONTEND_FILE_FIELD = "frontendFile";
const LEGACY_ALLOW_WRITES_FIELD = "allowWrites";
const CAPABILITIES_FIELD = "capabilities";
const CAPABILITIES_ALLOW_WRITES_FIELD = "allowWrites";
const ALLOWED_PROCEDURES_FIELD = "allowedProcedures";
const PROCEDURES_FIELD = "procedures";

const ERR_PROJECT_CONFIG_NOT_FOUND = "PROJECT_CONFIG_NOT_FOUND";
const ERR_PROJECT_CONFIG_INVALID = "PROJECT_CONFIG_INVALID";

export type MigrateProjectConfigInput = {
  projectId?: string;
  cwd?: string;
  apply?: boolean;
};

export type MigrateRemediation = {
  field: string;
  from: string;
  to: string;
  reason: string;
};

export type MigrateProjectConfigSuccess = {
  outcome: "ok";
  configPath: string;
  current: Record<string, unknown>;
  proposed: Record<string, unknown>;
  diff: string;
  remediation: readonly MigrateRemediation[];
  applied: boolean;
};

export type MigrateProjectConfigError = {
  outcome: "error";
  error: {
    code: string;
    message: string;
    remediation?: string;
  };
};

export type MigrateProjectConfigResult =
  | MigrateProjectConfigSuccess
  | MigrateProjectConfigError;

// ─── Pure helper ─────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

function stableStringify(value: Record<string, unknown>): string {
  const sortedKeys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const entries: string[] = [];
  for (const key of sortedKeys) {
    entries.push(`${JSON.stringify(key)}:${JSON.stringify(value[key])}`);
  }
  return `{${entries.join(",")}}`;
}

function normalizeForJson(value: unknown, depth = 0): unknown {
  if (depth > 32) return value;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => normalizeForJson(item, depth + 1));
  if (typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = normalizeForJson((value as Record<string, unknown>)[key], depth + 1);
  }
  return out;
}

function unifiedDiff(before: string, after: string, fileLabel: string): string {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  // Small files only — emit a contextual, line-based diff without
  // pulling a Myers algorithm. The consumer is reviewing one
  // project.json, so a 100% human-readable shape beats algorithmic
  // brevity.
  const max = Math.max(a.length, b.length);
  const lines: string[] = [`--- ${fileLabel}`, `+++ ${fileLabel}`];
  let cursor = 0;
  while (cursor < max) {
    const left = a[cursor];
    const right = b[cursor];
    if (left === right) {
      if (left !== undefined) lines.push(` ${left}`);
    } else {
      if (left !== undefined) lines.push(`-${left}`);
      if (right !== undefined) lines.push(`+${right}`);
    }
    cursor += 1;
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Read `.dysflow/project.json` from `cwd` and compute the proposed
 * migration. Never mutates the filesystem; the caller decides whether
 * to apply via `apply: true` on the tool surface.
 *
 * Returns a discriminated union: `outcome: "ok"` always carries the
 * `current`/`proposed`/`diff`/`remediation` quadruple, `outcome: "error"`
 * always carries a typed error envelope. The `applied` field is set by
 * the tool factory after the atomic write, not by this helper.
 */
export async function tryMigrateProjectConfig(
  input: MigrateProjectConfigInput,
  cwd: string,
): Promise<MigrateProjectConfigResult> {
  const configPath = join(cwd, PROJECT_CONFIG_RELATIVE_PATH);

  let raw: string;
  try {
    raw = await readFile(configPath, "utf-8");
  } catch {
    return {
      outcome: "error",
      error: {
        code: ERR_PROJECT_CONFIG_NOT_FOUND,
        message: `No project config found at ${configPath}. Run \`dysflow setup --cwd ${cwd}\` to create one.`,
        remediation: `Run \`dysflow setup --cwd ${cwd}\` to create .dysflow/project.json, then re-run \`migrate_project_config\`.`,
      },
    };
  }

  let parsed: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isPlainObject(value)) throw new Error("not an object");
    parsed = value;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      outcome: "error",
      error: {
        code: ERR_PROJECT_CONFIG_INVALID,
        message: `${configPath} is not a valid project config JSON object: ${detail}.`,
        remediation: `Repair the JSON in ${configPath} (e.g. trailing comma, unquoted key) and re-run \`migrate_project_config\`.`,
      },
    };
  }

  // Apply migrations in a fixed order; the next pass is a no-op on the
  // result of the previous one, so reordering does not change the
  // final shape.
  const remediation: MigrateRemediation[] = [];
  const proposed: Record<string, unknown> = { ...parsed };

  // 1. Legacy absolute `accessPath` → basename `frontendFile`.
  const legacyAccessPath = proposed[LEGACY_ACCESS_PATH_FIELD];
  if (typeof legacyAccessPath === "string" && legacyAccessPath.length > 0) {
    const isAbsolute =
      /^[a-zA-Z]:[\\/]/.test(legacyAccessPath) || legacyAccessPath.startsWith("/");
    const isBasenameOnly = basename(legacyAccessPath) === legacyAccessPath;
    if (isAbsolute || !isBasenameOnly) {
      const newBasename = basename(legacyAccessPath);
      if (proposed[FRONTEND_FILE_FIELD] === undefined) {
        proposed[FRONTEND_FILE_FIELD] = newBasename;
      }
      delete proposed[LEGACY_ACCESS_PATH_FIELD];
      remediation.push({
        field: LEGACY_ACCESS_PATH_FIELD,
        from: legacyAccessPath,
        to: FRONTEND_FILE_FIELD,
        reason:
          "basename-only frontendFile resolves against the worktree root (issue #1092, shipped v2.23.1) so a single config works across every worktree without edits",
      });
    }
  }

  // 2. Top-level `allowWrites` → `capabilities.allowWrites` (T18).
  if (Object.hasOwn(proposed, LEGACY_ALLOW_WRITES_FIELD)) {
    const value = proposed[LEGACY_ALLOW_WRITES_FIELD];
    const capabilities = isPlainObject(proposed[CAPABILITIES_FIELD])
      ? { ...proposed[CAPABILITIES_FIELD] }
      : {};
    if (
      !Object.hasOwn(capabilities, CAPABILITIES_ALLOW_WRITES_FIELD) &&
      (typeof value === "boolean" || value === undefined)
    ) {
      capabilities[CAPABILITIES_ALLOW_WRITES_FIELD] = value ?? true;
    }
    proposed[CAPABILITIES_FIELD] = capabilities;
    delete proposed[LEGACY_ALLOW_WRITES_FIELD];
    remediation.push({
      field: LEGACY_ALLOW_WRITES_FIELD,
      from: LEGACY_ALLOW_WRITES_FIELD,
      to: `${CAPABILITIES_FIELD}.${CAPABILITIES_ALLOW_WRITES_FIELD}`,
      reason:
        "T18 caps-block migration: top-level allowWrites is deprecated in favour of capabilities.allowWrites",
    });
  }

  // 3. Top-level `allowedProcedures` → `capabilities.procedures.allow`
  //    (deprecation, kept as a read-through alias until v1.15.0).
  if (Object.hasOwn(proposed, ALLOWED_PROCEDURES_FIELD)) {
    const value = proposed[ALLOWED_PROCEDURES_FIELD];
    const capabilities = isPlainObject(proposed[CAPABILITIES_FIELD])
      ? { ...proposed[CAPABILITIES_FIELD] }
      : {};
    const procedures = isPlainObject(capabilities[PROCEDURES_FIELD])
      ? { ...(capabilities[PROCEDURES_FIELD] as Record<string, unknown>) }
      : {};
    if (!Object.hasOwn(procedures, "allow") && Array.isArray(value)) {
      procedures.allow = [...value];
    }
    capabilities[PROCEDURES_FIELD] = procedures;
    proposed[CAPABILITIES_FIELD] = capabilities;
    delete proposed[ALLOWED_PROCEDURES_FIELD];
    remediation.push({
      field: ALLOWED_PROCEDURES_FIELD,
      from: ALLOWED_PROCEDURES_FIELD,
      to: `${CAPABILITIES_FIELD}.${PROCEDURES_FIELD}.allow`,
      reason:
        "deprecation: top-level allowedProcedures is read-through to capabilities.procedures.allow until v1.15.0",
    });
  }

  const normalizedCurrent = normalizeForJson(parsed) as Record<string, unknown>;
  const normalizedProposed = normalizeForJson(proposed) as Record<string, unknown>;
  const beforeText = JSON.stringify(parsed, null, 2);
  const afterText = JSON.stringify(normalizedProposed, null, 2);
  const changed = stableStringify(normalizedCurrent) !== stableStringify(normalizedProposed);
  const diff = changed ? unifiedDiff(beforeText, afterText, configPath) : "";

  return {
    outcome: "ok",
    configPath,
    current: parsed,
    proposed: normalizedProposed,
    diff,
    remediation,
    // The helper never applies; the factory stamps `applied: true`
    // after the atomic write succeeds.
    applied: false,
  };
}

// ─── Atomic write helper ─────────────────────────────────────────────────────

async function writeProjectJsonAtomically(
  configPath: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const tempPath = `${configPath}.${process.pid}.${Math.random().toString(36).slice(2, 10)}.tmp`;
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  try {
    await writeFile(tempPath, serialized, "utf-8");
    await rename(tempPath, configPath);
  } catch (error) {
    // Best-effort temp cleanup; never mask the original error.
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

// ─── MCP tool factory ────────────────────────────────────────────────────────

export const MIGRATE_PROJECT_CONFIG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    // Issue #1076 — compose the shared ProjectIdentity block so the
    // consumer-facing description matches every other tool that uses
    // this atom. `projectId` is currently informational; the migration
    // engine reads `.dysflow/project.json` from `cwd` directly.
    ...PROJECT_IDENTITY_BLOCK,
    cwd: {
      type: "string",
      description:
        "Optional per-call cwd override (#1057 F10). Must be an existing directory containing .dysflow/project.json. Omit to use the MCP factory cwd.",
    },
    // Issue #1076 — compose the shared write-intent block. `apply` is
    // the canonical commit signal (#1167 unification); passing
    // `apply: true` atomically rewrites `.dysflow/project.json` with
    // the proposed migration and refuses with `MCP_WRITES_DISABLED`
    // when writes are disabled. When omitted (or `apply: false`), the
    // handler returns the proposed diff without writing — pure
    // introspection.
    ...WRITE_INTENT_BLOCK,
  },
} as const;

export type MigrateProjectConfigToolOptions = {
  cwd: string;
  writesEnabled: boolean;
};

/**
 * Factory for the `migrate_project_config` MCP tool.
 *
 * Behaviour:
 *
 *   - `migrate_project_config({})` → read-only; returns
 *     `{ outcome, configPath, current, proposed, diff, remediation,
 *     applied: false }`. Never writes.
 *   - `migrate_project_config({ apply: true })` → when the diff is
 *     non-empty, atomically rewrites the file and returns the same
 *     payload with `applied: true`. When the diff is empty (already
 *     migrated), returns `applied: false` and leaves the file alone.
 *     Refuses with `MCP_WRITES_DISABLED` when `writesEnabled: false`.
 */
export function createMigrateProjectConfigTool(
  options: MigrateProjectConfigToolOptions,
): DysflowMcpTool {
  return {
    name: "migrate_project_config",
    resultContract: migrateProjectConfigResultContract,
    description:
      "Read .dysflow/project.json and (optionally with apply:true) rewrite it in place. Drives legacy config migrations deterministically — no more hand-editing accessPath vs frontendFile or top-level allowWrites vs capabilities.allowWrites. Read-only path returns { current, proposed, diff, remediation[] } for review. Apply path writes the proposed JSON atomically and refuses with MCP_WRITES_DISABLED when writes are off. Idempotent: an already-migrated config returns an empty diff and applied:false. " +
      MCP_TOOL_CONTRACTS.migrate_project_config.summary,
    inputSchema: MIGRATE_PROJECT_CONFIG_SCHEMA,
    handler: async (input): Promise<McpToolResult> => {
      // Issue #1078 — uniform `MCP_INPUT_INVALID` envelope across every
      // dispatch entry point. The schema validator enforces the
      // `apply` / `dryRun` / `diff` contradiction rule before the
      // handler reaches the filesystem, and the shared enrichment
      // helper maps the legacy `<flag> is not allowed.` text into the
      // structured `{ rejectedFlag, rejectedFlags, toolCommitFlag,
      // remediation }` shape every other write-class tool already
      // returns.
      const validation = validateInput(input, MIGRATE_PROJECT_CONFIG_SCHEMA);
      if (validation !== undefined) {
        const enrichment = enrichmentForValidationMessage(validation, "migrate_project_config");
        if (enrichment !== undefined) return invalidInput(validation, undefined, enrichment);
        return invalidInput(validation);
      }

      const params = isPlainObject(input) ? input : {};
      const cwdOverride =
        typeof params.cwd === "string" && params.cwd.trim().length > 0
          ? params.cwd.trim()
          : undefined;
      const effectiveCwd = cwdOverride !== undefined ? cwdOverride : options.cwd;
      const applyRequested = params.apply === true;

      if (applyRequested && options.writesEnabled !== true) {
        return writesDisabled("migrate_project_config");
      }

      const migration = await tryMigrateProjectConfig({}, effectiveCwd);
      if (migration.outcome === "error") {
        const code = migration.error.code;
        const message = migration.error.message;
        return {
          content: [{ type: "text", text: `${code}: ${message}` }],
          isError: true,
          ok: false,
          error: {
            code,
            message,
            errorCode: code,
            errorMessage: message,
            ...(migration.error.remediation !== undefined
              ? { remediation: migration.error.remediation }
              : {}),
          },
        };
      }

      let applied = false;
      if (applyRequested && migration.diff.length > 0) {
        try {
          await writeProjectJsonAtomically(migration.configPath, migration.proposed);
          applied = true;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [
              { type: "text", text: `PROJECT_CONFIG_WRITE_FAILED: ${message}` },
            ],
            isError: true,
            ok: false,
            error: {
              code: "PROJECT_CONFIG_WRITE_FAILED",
              message: `Failed to write ${migration.configPath}: ${message}`,
              errorCode: "PROJECT_CONFIG_WRITE_FAILED",
              errorMessage: `Failed to write ${migration.configPath}: ${message}`,
              remediation: `Verify the file is writable and not locked, then re-run \`migrate_project_config\` with apply:true.`,
            },
          };
        }
      }

      const payload: MigrateProjectConfigSuccess = {
        ...migration,
        applied,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        isError: false,
        ok: true,
      };
    },
  };
}
