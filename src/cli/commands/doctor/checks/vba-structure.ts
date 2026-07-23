import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { DoctorCategoryCheck } from "./types.js";

const SOURCE_EXTENSIONS = [".bas", ".cls", ".form.txt", ".report.txt"];
const CODE_EXTENSIONS = [".bas", ".cls"];
const MAX_LISTED_EXAMPLES = 5;

/**
 * Issue #1057 (F9) — Category B: validate the VBA source tree structure.
 * Read-only scan of `destinationRoot` (from `.dysflow/project.json`,
 * falling back to `src/`): `Attribute VB_Name` headers and
 * `Option Explicit` presence. Never opens Access.
 */
export function runVbaStructureChecks(cwd: string): DoctorCategoryCheck[] {
  const root = resolveDestinationRoot(cwd);
  if (root === undefined) {
    return [
      {
        ok: true,
        name: "VBA source structure",
        message: "no source root found (destinationRoot missing) — structure checks skipped",
        severity: "warning",
      },
    ];
  }

  const files = collectSourceFiles(root);
  if (files.length === 0) {
    return [
      {
        ok: true,
        name: "VBA source structure",
        message: `no VBA source files under ${root} — structure checks skipped`,
        severity: "warning",
      },
    ];
  }

  const checks: DoctorCategoryCheck[] = [];

  const missingVbName: string[] = [];
  const missingOptionExplicit: string[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!/^\s*Attribute\s+VB_Name\s*=/im.test(text)) missingVbName.push(path.basename(file));
    if (
      CODE_EXTENSIONS.some((extension) => file.toLowerCase().endsWith(extension)) &&
      !/^\s*Option\s+Explicit\b/im.test(text)
    ) {
      missingOptionExplicit.push(path.basename(file));
    }
  }

  checks.push(
    missingVbName.length === 0
      ? {
          ok: true,
          name: "Attribute VB_Name",
          message: `present in all ${files.length} source files`,
          severity: "warning",
        }
      : {
          ok: false,
          name: "Attribute VB_Name",
          message: `Attribute VB_Name missing in ${missingVbName.length} files (${missingVbName
            .slice(0, MAX_LISTED_EXAMPLES)
            .join(", ")}${missingVbName.length > MAX_LISTED_EXAMPLES ? ", …" : ""}) — see the vba-form-metadata-repair guidance`,
          severity: "warning",
        },
  );

  checks.push(
    missingOptionExplicit.length === 0
      ? {
          ok: true,
          name: "Option Explicit",
          message: "present in every .bas/.cls module",
          severity: "warning",
        }
      : {
          ok: false,
          name: "Option Explicit",
          message: `missing in ${missingOptionExplicit.length} module(s) (${missingOptionExplicit
            .slice(0, MAX_LISTED_EXAMPLES)
            .join(", ")}${missingOptionExplicit.length > MAX_LISTED_EXAMPLES ? ", …" : ""})`,
          severity: "warning",
        },
  );

  return checks;
}

function resolveDestinationRoot(cwd: string): string | undefined {
  try {
    const configPath = path.join(cwd, ".dysflow", "project.json");
    if (existsSync(configPath)) {
      const raw = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
      if (typeof raw.destinationRoot === "string" && raw.destinationRoot.length > 0) {
        const resolved = path.resolve(cwd, raw.destinationRoot);
        if (existsSync(resolved)) return resolved;
      }
    }
  } catch {
    // fall through to the src/ default
  }
  const fallback = path.join(cwd, "src");
  return existsSync(fallback) ? fallback : undefined;
}

function collectSourceFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      let stats: ReturnType<typeof statSync>;
      try {
        stats = statSync(full);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        stack.push(full);
        continue;
      }
      const lower = entry.toLowerCase();
      if (SOURCE_EXTENSIONS.some((extension) => lower.endsWith(extension))) out.push(full);
    }
  }
  return out;
}
