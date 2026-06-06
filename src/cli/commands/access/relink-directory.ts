import type { RelinkDirectoryReport } from "../../../core/contracts/index.js";
import type { AccessQueryService } from "../../../core/services/query-service.js";
import { parseNamedArgs } from "../arg-parser.js";
import type { CliCommandContext, CliResult } from "../types.js";

export type AliasMapEntry = { from: string; to: string };

export type RelinkDirectoryOptions = {
  rootPath: string;
  apply: boolean;
  recursive: boolean;
  maps: readonly AliasMapEntry[];
  denyPrefixes: readonly string[];
  strictLocal: boolean;
  removeUnresolved: boolean;
  passwordEnv?: string;
  json: boolean;
  backup: boolean;
  timeoutMs?: number;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const USAGE =
  "Usage: dysflow access relink-directory --root <path> [--apply] [--dry-run] [--no-backup] [--recursive] [--map <old>=<new>] [--deny-prefix <prefix>] [--strict-local] [--remove-unresolved] [--password-env <VAR>] [--timeout-ms <ms>] [--json]";

export function parseRelinkDirectoryArgs(
  args: readonly string[],
): ParseResult<RelinkDirectoryOptions> {
  const parsed = parseNamedArgs({
    specs: [
      { name: "--root", type: "string" },
      { name: "--apply", type: "boolean" },
      { name: "--dry-run", type: "boolean" },
      { name: "--backup", type: "boolean" },
      { name: "--no-backup", type: "boolean" },
      { name: "--recursive", type: "boolean" },
      { name: "--strict-local", type: "boolean" },
      { name: "--remove-unresolved", type: "boolean" },
      { name: "--json", type: "boolean" },
      { name: "--map", type: "string", multiple: true },
      { name: "--deny-prefix", type: "string", multiple: true },
      { name: "--password-env", type: "string" },
      { name: "--timeout-ms", type: "string" },
    ],
    args,
    onUnknown: (arg) => `Unknown option: ${arg}\n${USAGE}`,
    onMissing: (arg) => `Missing value for ${arg}.`,
  });

  if (!parsed.ok) {
    return { ok: false, error: parsed.message };
  }

  const rootPath = parsed.values["--root"] as string | undefined;
  if (rootPath === undefined) {
    return {
      ok: false,
      error: `--root is required.\n${USAGE}`,
    };
  }

  const applySet = parsed.values["--apply"] === true;
  const dryRunSet = parsed.values["--dry-run"] === true;

  if (applySet && dryRunSet) {
    return {
      ok: false,
      error: "--apply and --dry-run are mutually exclusive. Cannot use both at the same time.",
    };
  }

  const maps: AliasMapEntry[] = [];
  const rawMaps = (parsed.values["--map"] as string[]) ?? [];
  for (const next of rawMaps) {
    const eqIndex = next.indexOf("=");
    if (eqIndex === -1) {
      return {
        ok: false,
        error: `Invalid --map format: "${next}". Expected: OldName.accdb=NewName.accdb`,
      };
    }
    maps.push({ from: next.slice(0, eqIndex), to: next.slice(eqIndex + 1) });
  }

  const denyPrefixes = (parsed.values["--deny-prefix"] as string[]) ?? [];

  let timeoutMs: number | undefined;
  const timeoutVal = parsed.values["--timeout-ms"] as string | undefined;
  if (timeoutVal !== undefined) {
    const parsedTimeout = Number(timeoutVal);
    if (!Number.isFinite(parsedTimeout) || parsedTimeout <= 0) {
      return {
        ok: false,
        error: `Invalid --timeout-ms value: "${timeoutVal}". Expected a positive integer.`,
      };
    }
    timeoutMs = parsedTimeout;
  }

  const backup = parsed.values["--no-backup"] !== true;

  return {
    ok: true,
    value: {
      rootPath,
      apply: applySet,
      recursive: true, // Defaults to true, --recursive flag is just a no-op that sets it to true
      backup,
      strictLocal: parsed.values["--strict-local"] === true,
      removeUnresolved: parsed.values["--remove-unresolved"] === true,
      passwordEnv: parsed.values["--password-env"] as string | undefined,
      json: parsed.values["--json"] === true,
      timeoutMs,
      maps,
      denyPrefixes,
    },
  };
}

function formatReport(report: RelinkDirectoryReport, _options: RelinkDirectoryOptions): string {
  const lines: string[] = [
    `Relink Directory — ${report.mode} mode`,
    `Root: ${report.root}`,
    `Files scanned: ${report.filesScanned}`,
    `Linked tables found: ${report.linkedTablesFound}`,
    `Already local: ${report.alreadyLocal}`,
    `Planned relinks: ${report.plannedRelinks}`,
    `Applied relinks: ${report.appliedRelinks}`,
    `Unresolved: ${report.unresolved.length}`,
    `Removed: ${report.removed.length}`,
    `External link count: ${report.externalLinkCount}`,
    `Datoste link count: ${report.datosteLinkCount}`,
    `Broken link count: ${report.brokenLinkCount}`,
  ];

  if (report.backupPaths.length > 0) {
    lines.push(`Backups created: ${report.backupPaths.length}`);
    for (const bp of report.backupPaths) {
      lines.push(`  ${bp}`);
    }
  }

  if (report.errors.length > 0) {
    lines.push(`Errors (${report.errors.length}):`);
    for (const err of report.errors) {
      lines.push(`  ${err}`);
    }
  }

  return lines.join("\n");
}

function computeExitCode(report: RelinkDirectoryReport, options: RelinkDirectoryOptions): number {
  if (options.strictLocal && report.externalLinkCount > 0) {
    return 1;
  }
  if (options.denyPrefixes.length > 0 && report.datosteLinkCount > 0) {
    return 1;
  }
  if (report.errors.length > 0) {
    return 1;
  }
  return 0;
}

export type HandleRelinkDirectoryDeps = {
  service?: Pick<AccessQueryService, "execute">;
};

export async function handleRelinkDirectoryCommand(
  args: readonly string[],
  context?: CliCommandContext,
  deps?: HandleRelinkDirectoryDeps,
): Promise<CliResult> {
  const parsed = parseRelinkDirectoryArgs(args);
  if (!parsed.ok) {
    return { exitCode: 1, stdout: "", stderr: parsed.error };
  }

  const options = parsed.value;

  // Resolve password from env if requested
  let _password: string | undefined;
  if (options.passwordEnv !== undefined) {
    const env = context?.env ?? process.env;
    _password = env[options.passwordEnv];
  }

  if (deps?.service === undefined) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "Access query service is not available for relink-directory.",
    };
  }

  const result = await deps.service.execute({
    action: "relink_directory",
    mode: "write",
    sql: "",
    rootPath: options.rootPath,
    dryRun: !options.apply,
    noBackup: !options.backup || undefined,
    maps: options.maps.length > 0 ? options.maps : undefined,
    denyPrefixes: options.denyPrefixes.length > 0 ? options.denyPrefixes : undefined,
    strictLocal: options.strictLocal || undefined,
    removeUnresolved: options.removeUnresolved || undefined,
    recursive: options.recursive,
    timeoutMs: options.timeoutMs,
    backendPassword: _password,
  });

  if (!result.ok) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `${result.error.code}: ${result.error.message}`,
    };
  }

  const report = result.data.relinkDirectory;
  if (report === undefined) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "Unexpected: relink_directory action returned no report.",
    };
  }

  const exitCode = computeExitCode(report, options);

  if (options.json) {
    return {
      exitCode,
      stdout: JSON.stringify(report),
      stderr: "",
    };
  }

  return {
    exitCode,
    stdout: formatReport(report, options),
    stderr: "",
  };
}
