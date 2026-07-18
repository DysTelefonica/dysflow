/**
 * Issue #958 — pre-import structural quality gate for form/report sources.
 *
 * Before `import_all` / `import_modules` spawn the PowerShell runner, every
 * planned `.form.txt` / `.report.txt` is parsed with the strict FormIR parser
 * (`parseFormTxt`). A file that cannot be parsed (unbalanced Begin/End tree,
 * truncated blob, not a SaveAsText export at all) is reported as a defect so
 * the caller can fail closed WITHOUT touching the Access binary.
 *
 * Scope note: this gate only blocks STRUCTURAL damage. Metadata-only legacy
 * defects (missing `AutoResize = NotDefault`, stale/absent `Attribute
 * VB_Name`) are intentionally allowed through — the PowerShell import path
 * self-heals them (`Normalize-AccessDocumentTextForLoadFromText`), which is
 * how pre-v2.14.0 exports get progressively repaired.
 */
import { join } from "node:path";
import { parseFormTxt } from "../../core/services/form-ir-service.js";
import type { ComparisonFileSystemPort } from "../../core/services/vba-source-comparison.js";

/** The minimal filesystem surface the gate needs (injectable for tests). */
export type FormSourceQualityFileSystem = Pick<ComparisonFileSystemPort, "readdir" | "readFile">;

export type FormSourceDefect = {
  /** Absolute path of the offending source file. */
  file: string;
  /** Parser message describing why the file cannot be trusted. */
  message: string;
};

const FORM_EXT = /\.form\.txt$/i;
const REPORT_EXT = /\.report\.txt$/i;

function documentModuleBase(fileName: string): string | null {
  if (FORM_EXT.test(fileName)) return fileName.replace(FORM_EXT, "");
  if (REPORT_EXT.test(fileName)) return fileName.replace(REPORT_EXT, "");
  return null;
}

/** Access object identity is case-insensitive and prefix-tolerant. */
function normalizeModuleIdentity(name: string): string {
  return name.toLowerCase().replace(/^(form|report)_/, "");
}

async function walkForDocumentSources(
  fileSystem: FormSourceQualityFileSystem,
  dir: string,
  out: string[],
): Promise<void> {
  let entries;
  try {
    entries = await fileSystem.readdir(dir);
  } catch {
    return; // absent folder — path errors surface through the normal flow
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkForDocumentSources(fileSystem, path, out);
    } else if (documentModuleBase(entry.name) !== null) {
      out.push(path);
    }
  }
}

/**
 * Strict Begin/End balance check over the LAYOUT section (everything before
 * the CodeBehind* marker). `parseFormTxt` is deliberately tolerant — it
 * treats a `CodeBehindForm` marker inside an open node as a graceful close
 * so quirky-but-loadable exports keep round-tripping — but the import gate
 * must fail closed on a tree that does not balance: LoadFromText can
 * half-load it as a form with missing controls. Mirrors the PowerShell
 * `Get-AccessDocumentLayoutNestingDefect` rules exactly: `Begin` /
 * `Begin <Type>` and `<key> = Begin` (hex blob) open a level, a bare `End`
 * closes one, and string-continuation lines (starting with `"`) can never
 * be markers because a marker line is matched against the full trimmed line.
 */
export function findLayoutNestingDefect(text: string): string | null {
  const lines = text.split(/\r\n|\r|\n/);
  let depth = 0;
  let started = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = (lines[i] ?? "").trim();
    if (/^CodeBehind\w*$/.test(trimmed)) break;
    if (/^Begin(?:\s+\w+)?$/.test(trimmed) || /^\w+\s*=\s*Begin$/.test(trimmed)) {
      depth++;
      started = true;
      continue;
    }
    if (trimmed === "End") {
      if (depth === 0) {
        return `line ${i + 1}: 'End' without an open 'Begin' (stray End in the layout section)`;
      }
      depth--;
    }
  }
  if (started && depth > 0) {
    return `${depth} closing 'End' marker(s) missing — the layout section has unclosed Begin blocks`;
  }
  return null;
}

export type CollectFormSourceDefectsInput = {
  /** Source tree root to scan (destinationRoot / sourceDir). */
  root?: string;
  /**
   * When non-empty, only files whose module identity matches one of these
   * names are validated (import_modules targets a subset; a broken form that
   * is NOT being imported must not block a .bas import).
   */
  moduleNames?: readonly string[];
  /** Explicit single-file override (guarded-write style calls). */
  sourcePath?: string;
};

export async function collectFormSourceDefects(
  input: CollectFormSourceDefectsInput,
  fileSystem: FormSourceQualityFileSystem,
): Promise<FormSourceDefect[]> {
  const candidates = new Set<string>();

  if (
    input.sourcePath !== undefined &&
    documentModuleBase(input.sourcePath.replace(/\\/g, "/").split("/").pop() ?? "") !== null
  ) {
    candidates.add(input.sourcePath);
  }

  if (input.root !== undefined) {
    const found: string[] = [];
    await walkForDocumentSources(fileSystem, input.root, found);
    const targets = (input.moduleNames ?? []).map(normalizeModuleIdentity);
    for (const file of found) {
      if (targets.length > 0) {
        const base = documentModuleBase(file.replace(/\\/g, "/").split("/").pop() ?? "");
        if (base === null || !targets.includes(normalizeModuleIdentity(base))) continue;
      }
      candidates.add(file);
    }
  }

  const defects: FormSourceDefect[] = [];
  for (const file of candidates) {
    let text: string;
    try {
      text = await fileSystem.readFile(file, "utf8");
    } catch (err) {
      defects.push({
        file,
        message: `Cannot read file: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }
    try {
      parseFormTxt(text);
    } catch (err) {
      defects.push({
        file,
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    const nestingDefect = findLayoutNestingDefect(text);
    if (nestingDefect !== null) {
      defects.push({ file, message: `Unbalanced Begin/End layout tree: ${nestingDefect}` });
    }
  }
  return defects;
}
