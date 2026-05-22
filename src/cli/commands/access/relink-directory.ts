import type { CliCommandContext, CliResult } from "../types.js";
import type { AccessQueryService } from "../../../core/services/query-service.js";
import type { RelinkDirectoryReport } from "../../../core/contracts/index.js";

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

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const USAGE =
  "Usage: dysflow access relink-directory --root <path> [--apply] [--dry-run] [--no-backup] [--recursive] [--map <old>=<new>] [--deny-prefix <prefix>] [--strict-local] [--remove-unresolved] [--password-env <VAR>] [--timeout-ms <ms>] [--json]";

export function parseRelinkDirectoryArgs(
  args: readonly string[],
): ParseResult<RelinkDirectoryOptions> {
  let rootPath: string | undefined;
  let applySet = false;
  let dryRunSet = false;
  let recursive = true;
  let backup = true;
  let strictLocal = false;
  let removeUnresolved = false;
  let passwordEnv: string | undefined;
  let json = false;
  let timeoutMs: number | undefined;
  const maps: AliasMapEntry[] = [];
  const denyPrefixes: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--root") {
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) {
        return { ok: false, error: "Missing value for --root." };
      }
      rootPath = next;
      i++;
      continue;
    }

    if (arg === "--apply") {
      applySet = true;
      continue;
    }

    if (arg === "--dry-run") {
      dryRunSet = true;
      continue;
    }

    if (arg === "--backup") {
      backup = true;
      continue;
    }

    if (arg === "--no-backup") {
      backup = false;
      continue;
    }

    if (arg === "--recursive") {
      recursive = true;
      continue;
    }

    if (arg === "--strict-local") {
      strictLocal = true;
      continue;
    }

    if (arg === "--remove-unresolved") {
      removeUnresolved = true;
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--map") {
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) {
        return { ok: false, error: "Missing value for --map." };
      }
      const eqIndex = next.indexOf("=");
      if (eqIndex === -1) {
        return {
          ok: false,
          error: `Invalid --map format: "${next}". Expected: OldName.accdb=NewName.accdb`,
        };
      }
      maps.push({ from: next.slice(0, eqIndex), to: next.slice(eqIndex + 1) });
      i++;
      continue;
    }

    if (arg === "--deny-prefix") {
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) {
        return { ok: false, error: "Missing value for --deny-prefix." };
      }
      denyPrefixes.push(next);
      i++;
      continue;
    }

    if (arg === "--password-env") {
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) {
        return { ok: false, error: "Missing value for --password-env." };
      }
      passwordEnv = next;
      i++;
      continue;
    }

    if (arg === "--timeout-ms") {
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) {
        return { ok: false, error: "Missing value for --timeout-ms." };
      }
      const parsed = Number(next);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return { ok: false, error: `Invalid --timeout-ms value: "${next}". Expected a positive integer.` };
      }
      timeoutMs = parsed;
      i++;
      continue;
    }

    return { ok: false, error: `Unknown option: ${arg}\n${USAGE}` };
  }

  if (rootPath === undefined) {
    return {
      ok: false,
      error: `--root is required.\n${USAGE}`,
    };
  }

  if (applySet && dryRunSet) {
    return {
      ok: false,
      error: "--apply and --dry-run are mutually exclusive. Cannot use both at the same time.",
    };
  }

  return {
    ok: true,
    value: {
      rootPath,
      apply: applySet,
      recursive,
      backup,
      strictLocal,
      removeUnresolved,
      passwordEnv,
      json,
      timeoutMs,
      maps,
      denyPrefixes,
    },
  };
}

function formatReport(report: RelinkDirectoryReport, options: RelinkDirectoryOptions): string {
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

function computeExitCode(
  report: RelinkDirectoryReport,
  options: RelinkDirectoryOptions,
): number {
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
    maps: options.maps.length > 0 ? options.maps : undefined,
    denyPrefixes: options.denyPrefixes.length > 0 ? options.denyPrefixes : undefined,
    strictLocal: options.strictLocal || undefined,
    removeUnresolved: options.removeUnresolved || undefined,
    recursive: options.recursive,
    timeoutMs: options.timeoutMs,
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
