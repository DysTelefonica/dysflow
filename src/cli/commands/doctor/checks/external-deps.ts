import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { DoctorCategoryCheck } from "./types.js";

const CODEGRAPH_STALE_MS = 24 * 60 * 60 * 1000;

/**
 * Issue #1057 (F9) — Category D: external dependency hygiene. Read-only
 * filesystem scans: orphan `.laccdb` lock candidates and `.codegraph/`
 * index freshness. Never opens Access, never kills processes.
 */
export function runExternalDepsChecks(cwd: string): DoctorCategoryCheck[] {
  const checks: DoctorCategoryCheck[] = [];

  const lockCandidates = findLaccdbLocks(cwd);
  checks.push(
    lockCandidates.length === 0
      ? {
          ok: true,
          name: ".laccdb locks",
          message: "no orphan .laccdb locks",
          severity: "warning",
        }
      : {
          ok: false,
          name: ".laccdb locks",
          message: `${lockCandidates.length} .laccdb lock file(s) found (${lockCandidates
            .map((file) => path.basename(file))
            .join(
              ", ",
            )}) — if no Access instance is open, cleanup via list_access_operations → access_force_cleanup_orphaned (never kill MSACCESS.EXE by name)`,
          severity: "warning",
        },
  );

  const codegraphDir = path.join(cwd, ".codegraph");
  if (existsSync(codegraphDir)) {
    const newest = newestMtimeMs(codegraphDir);
    const stale = newest !== undefined && Date.now() - newest > CODEGRAPH_STALE_MS;
    checks.push({
      ok: !stale,
      name: ".codegraph freshness",
      message: stale
        ? `index is ${Math.round((Date.now() - (newest as number)) / (60 * 60 * 1000))}h old — reindex recommended (codegraph index <projectPath>)`
        : "index is fresh (<24h)",
      severity: "warning",
    });
  } else {
    checks.push({
      ok: true,
      name: ".codegraph freshness",
      message: "no .codegraph index in this worktree — check skipped",
      severity: "warning",
    });
  }

  return checks;
}

function findLaccdbLocks(cwd: string): string[] {
  const roots = new Set<string>([cwd]);
  try {
    const configPath = path.join(cwd, ".dysflow", "project.json");
    if (existsSync(configPath)) {
      const raw = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
      for (const field of ["accessPath", "backendPath"]) {
        if (typeof raw[field] === "string" && (raw[field] as string).length > 0) {
          roots.add(path.dirname(path.resolve(cwd, raw[field] as string)));
        }
      }
    }
  } catch {
    // best effort — scan the cwd alone
  }

  const found: string[] = [];
  for (const root of roots) {
    let entries: string[];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.toLowerCase().endsWith(".laccdb")) found.push(path.join(root, entry));
    }
  }
  return [...new Set(found)];
}

function newestMtimeMs(dir: string): number | undefined {
  let newest: number | undefined;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    try {
      const stats = statSync(path.join(dir, entry));
      const mtime = stats.mtimeMs;
      if (newest === undefined || mtime > newest) newest = mtime;
    } catch {
      // skip unreadable entries
    }
  }
  return newest;
}
