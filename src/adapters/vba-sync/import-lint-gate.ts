// Issue #1863 — lint findings for the modules an import is about to load.
//
// import_modules refuses apply:true when a module it would import has an
// error-severity lint finding; apply:false reports every finding as a preview.
// The lint is the core lint_module engine with its default rules, so the gate
// and the lint tool cannot disagree.

import { join } from "node:path";
import { lintVbaModule } from "../../core/services/vba-module-lint-service.js";

export type ImportLintFinding = {
  module: string;
  /** Root-relative path of the source file that was linted. */
  file: string;
  rule: string;
  severity: "error" | "warning";
  line: number;
  message: string;
};

/** The minimal filesystem surface needed to read a module source. */
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
}): Promise<ImportLintFinding[]> {
  const findings: ImportLintFinding[] = [];
  for (const name of input.moduleNames) {
    const located = await readModuleSource(input.root, name, input.fileSystem);
    if (located === undefined) continue;
    const report = await lintVbaModule({ module: name, source: located.source });
    for (const diagnostic of report.flatDiagnostics) {
      findings.push({
        module: name,
        file: displayPath(located.file, input.root),
        rule: diagnostic.rule,
        severity: diagnostic.severity,
        line: diagnostic.line,
        message: diagnostic.message,
      });
    }
  }
  return findings;
}
