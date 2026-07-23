// Type definitions for the list_vba_modules MCP tool (#807 Feature 1).
//
// Cross-reference contract: every component known to the binary is paired with
// its on-disk source-file existence (if any). The runner side (PowerShell) emits
// the binary-side rows; the TS side adds the source-side `sourceExists` /
// `contentMatch` decorations by walking the project's source root.

import { extname, parse, resolve } from "node:path";
import type { ComparisonFileSystemPort } from "../services/vba-source-comparison.js";
import { logSwallowedIoError } from "../utils/log-swallowed-io-error.js";

/**
 * VBComponent.Type value. See Microsoft Access VBComponent documentation:
 *   1 = vbext_ct_StdModule (standard module, .bas)
 *   2 = vbext_ct_ClassModule (class module, .cls)
 *   3 = vbext_ct_Form (form / document module, .form.txt)
 *   100 = vbext_ct_Document (document / report, .report.txt — also returned as 3 in some hosts)
 *
 * The literal set is the smallest union that captures every category the
 * runner distinguishes. We do not invent intermediate IDs; the schema's
 * `typeFilter` enum ("standard" | "class" | "form" | "report" | "document")
 * is the user-facing surface and is mapped onto these VBComponent types by
 * `mapTypeFilterToVbComponentType()`.
 */
export type VbaComponentType = 1 | 2 | 3 | 100;

/**
 * Where the component physically lives on disk. `form` means the
 * canonicalized form-binary layout (legacy .frm); `form.txt` is the
 * SaveAsText-exported layout this runtime prefers and the only one the
 * runner writes today. We include both so the cross-reference can flag
 * whether the source matches the runtime's expected layout for forms.
 */
export type VbaFileType = "bas" | "cls" | "frm" | "form.txt" | "report.txt";

export type VbaContentMatch = "identical" | "cosmetic_only" | "functional_drift" | "unknown";

/**
 * One cross-referenced VBA component emitted by list_vba_modules. A component
 * may be present only in the binary (`sourceExists: false`, `sourcePath` is
 * absent), only on disk (`binaryExists: false`, `binaryPath` is absent), or
 * in both. The `contentMatch` decoration is computed only when both sides
 * exist; otherwise it is `undefined` (we cannot compare a single side).
 */
export type VbaModuleInfo = {
  /** VB_Name (the VBE's identity for the component, not the filename). */
  name: string;
  /** VBComponent.Type code. */
  type: VbaComponentType;
  /**
   * Which source layout this component serializes as. For forms this is the
   * SaveAsText export (`.form.txt`); legacy `.frm` binary forms carry `frm`.
   * Standard modules and class modules map to `.bas` / `.cls` respectively.
   */
  fileType: VbaFileType;
  /** Relative path under the resolved source root, when present on disk. */
  sourcePath?: string;
  /** Re-export path relative to the temp export root of a recent run, if any. */
  binaryPath?: string;
  sourceExists: boolean;
  binaryExists: boolean;
  /**
   * Best-effort classification of source vs binary content for this
   * component. `unknown` when the runner could not determine or content is
   * not available; absent when only one side exists (no comparison possible).
   */
  contentMatch?: VbaContentMatch;
};

/**
 * Output of `list_vba_modules`. `summary` is computed from the same `modules`
 * array so consumers never have to re-bucket it.
 *
 * `inBinaryOnly` counts modules the binary knows about but the source tree
 * does not have. `inSourceOnly` counts the inverse. `inBoth` counts the
 * overlap. The three numbers always equal `total`.
 */
export type ListVbaModulesResult = {
  modules: readonly VbaModuleInfo[];
  summary: {
    total: number;
    inBinaryOnly: number;
    inSourceOnly: number;
    inBoth: number;
    /** #1057 (F3) — explicit-unit alias of `total`. */
    totalModules: number;
    /**
     * #1057 (F3) — explicit-unit aliases. These count module PRESENCE
     * (which side has the module), not content drift — a consumer that
     * needs drift counts must read `verify_code.moduleCounts`.
     */
    modulesInBinaryOnly: number;
    modulesInSourceOnly: number;
    modulesInBoth: number;
  };
};

/**
 * User-facing filter vocabulary for `typeFilter`. The PowerShell-side runner
 * translates these strings into VBComponent.Type integers; the TS service
 * applies the same mapping for the cross-reference pass and for tests.
 */
export type VbaTypeFilterName = "standard" | "class" | "form" | "report" | "document";

/**
 * Resolves a user-facing `typeFilter` to one or more VBComponent.Type values.
 * Form and document are both `3` (acForm), but the runner treats "form"
 * against `AllForms` (project objects) and "document" against
 * `VBComponents` of type 100. Returns the union so the cross-reference
 * pass can match either side.
 */
export function mapTypeFilterToVbComponentType(
  name: VbaTypeFilterName,
): readonly VbaComponentType[] {
  switch (name) {
    case "standard":
      return [1];
    case "class":
      return [2];
    case "form":
      return [3];
    case "report":
      return [3];
    case "document":
      return [100];
  }
}

/**
 * Walks the project's source root once and returns the set of basenames
 * (.bas / .cls / .form.txt / .report.txt) keyed by module name (case-fold).
 *
 * The cross-reference caller merges this with the runner-emitted binary
 * rows. Kept as a small port-aware function so the TS-side test can pass a
 * stub filesystem and assert `sourceExists` correctness without a real
 * project tree.
 */
export type ModuleFileIndexEntry = {
  moduleName: string;
  fileType: VbaFileType;
  relativePath: string;
};

export async function indexManagedSourceFiles(
  destinationRoot: string,
  fileSystem: Pick<ComparisonFileSystemPort, "readdir">,
): Promise<ModuleFileIndexEntry[]> {
  const out: ModuleFileIndexEntry[] = [];
  async function visit(directory: string): Promise<void> {
    let entries: readonly { name: string; isDirectory(): boolean; isFile(): boolean }[];
    try {
      entries = (await fileSystem.readdir(directory)) as readonly {
        name: string;
        isDirectory(): boolean;
        isFile(): boolean;
      }[];
    } catch (err) {
      logSwallowedIoError("list-vba-modules:readdir", err);
      return;
    }
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const fileType = sourceFileType(entry.name);
      if (fileType === undefined) continue;
      out.push({
        moduleName: moduleNameFromVbaFile(entry.name),
        fileType,
        relativePath: path,
      });
    }
  }
  await visit(destinationRoot);
  return out;
}

function sourceFileType(name: string): VbaFileType | undefined {
  const lower = name.toLowerCase();
  if (lower.endsWith(".form.txt")) return "form.txt";
  if (lower.endsWith(".report.txt")) return "report.txt";
  const ext = extname(lower).slice(1);
  if (ext === "bas" || ext === "cls" || ext === "frm") return ext as VbaFileType;
  return undefined;
}

function moduleNameFromVbaFile(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".form.txt")) return name.slice(0, -".form.txt".length);
  if (lower.endsWith(".report.txt")) return name.slice(0, -".report.txt".length);
  return parse(name).name;
}
