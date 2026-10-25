// Issue #1863 — lint findings for the modules an import is about to load.
//
// import_modules refuses apply:true when a module it would import has an
// error-severity lint finding; apply:false reports every finding as a preview.
// The lint is the core lint_module engine with its default rules, so the gate
// and the lint tool cannot disagree.

import { execFile } from "node:child_process";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { lintVbaModule } from "../../core/services/vba-module-lint-service.js";

export type ImportLintFinding = {
  module: string;
  /** Root-relative path of the source file that was linted. */
  file: string;
  rule: string;
  severity: "error" | "warning";
  line: number;
  message: string;
  /**
   * True when the module's previous version (HEAD) already had the same rule
   * and message. Inherited findings never block an import.
   */
  inherited: boolean;
};

/** The minimal filesystem surface needed to read a module source. */
const execFileAsync = promisify(execFile);

/** Reads the previous version of a module source; undefined when there is none. */
export type PreviousSourceReader = (file: string) => Promise<string | undefined>;

/**
 * The committed (HEAD) version of a source file. The binary cannot be read
 * without Access, so the previous version is the last commit. Undefined when
 * the file is not committed or root is not a git work tree.
 */
export async function readHeadSource(root: string, file: string): Promise<string | undefined> {
  const relativePath = relative(root, file).replace(/\\/g, "/");
  try {
    const { stdout } = await execFileAsync("git", ["-C", root, "show", `HEAD:./${relativePath}`], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return undefined;
  }
}

export type ImportLintFileSystem = {
  readFile(path: string, encoding: "utf8"): Promise<string>;
};

const SOURCE_FOLDERS = ["modules", "classes", "forms", "reports", ""] as const;
const SOURCE_EXTENSIONS = [".bas", ".cls"] as const;

/** Access object names carry a Form_/Report_ prefix the .cls file does not. */
function candidateBaseNames(name: string): string[] {
  const bare = name.replace(/^(?:form|report)_/i, "");
  return bare === name ? [name] : [name, bare];
}

async function readModuleSource(
  root: string,
  name: string,
  fileSystem: ImportLintFileSystem,
): Promise<{ file: string; source: string } | undefined> {
  for (const base of candidateBaseNames(name)) {
    for (const folder of SOURCE_FOLDERS) {
      for (const extension of SOURCE_EXTENSIONS) {
        const file = join(root, folder, `${base}${extension}`);
        try {
          return { file, source: await fileSystem.readFile(file, "utf8") };
        } catch {
          // Not at this location; keep looking.
        }
      }
    }
  }
  return undefined;
}

function displayPath(file: string, root: string): string {
  return file.startsWith(root)
    ? file
        .slice(root.length)
        .replace(/^[\\/]+/, "")
        .replace(/\\/g, "/")
    : file;
}

export async function collectImportLintFindings(input: {
  root: string;
  moduleNames: readonly string[];
  fileSystem: ImportLintFileSystem;
  readPrevious?: PreviousSourceReader;
}): Promise<ImportLintFinding[]> {
  const readPrevious = input.readPrevious ?? ((file: string) => readHeadSource(input.root, file));
  const findings: ImportLintFinding[] = [];
  for (const name of input.moduleNames) {
    const located = await readModuleSource(input.root, name, input.fileSystem);
    if (located === undefined) continue;
    const current = await lintModule(name, located.source);
    const previousSource = await readPrevious(located.file);
    // Count the previous findings by rule and message; line numbers are ignored
    // because any insertion above a finding moves it.
    const previousCounts = new Map<string, number>();
    if (previousSource !== undefined) {
      for (const finding of await lintModule(name, previousSource)) {
        const key = findingKey(finding);
        previousCounts.set(key, (previousCounts.get(key) ?? 0) + 1);
      }
    }
    for (const finding of current) {
      const key = findingKey(finding);
      const remaining = previousCounts.get(key) ?? 0;
      const inherited = remaining > 0;
      if (inherited) previousCounts.set(key, remaining - 1);
      findings.push({
        module: name,
        file: displayPath(located.file, input.root),
        rule: finding.rule,
        severity: finding.severity,
        line: finding.line,
        message: finding.message,
        inherited,
      });
    }
  }
  return findings;
}

type LintedFinding = { rule: string; severity: "error" | "warning"; line: number; message: string };

async function lintModule(name: string, source: string): Promise<LintedFinding[]> {
  const report = await lintVbaModule({ module: name, source });
  return report.flatDiagnostics.map((d) => ({
    rule: d.rule,
    severity: d.severity,
    line: d.line,
    message: d.message,
  }));
}

function findingKey(finding: { rule: string; message: string }): string {
  return `${finding.rule}|${finding.message}`;
}
