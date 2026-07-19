/**
 * Issue #961 (A component) — `dysflow codegraph-drift` command.
 *
 * The write-capable counterpart of the doctor's supplement drift check
 * (B component, #999). Default run is a read-only dry-run that exits 1
 * when drift exists so automation (e.g. the `dysflow-codegraph-update`
 * ARN chain) can react; `--apply` rewrites the stale references in place
 * to a runtime-neutral `codegraph --version` pointer.
 *
 * Composition root: this module imports `node:fs` and wires the pure
 * kernel in `src/core/services/codegraph-supplement-drift-detector.ts`.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  applySupplementDriftFix,
  DEFAULT_INSTRUCTION_FILE_PATHS,
  type SupplementDriftFixResult,
} from "../../core/services/codegraph-supplement-drift-detector.js";
import { getHome } from "./install/agent-config.js";
import type { CliCommandContext, CliResult } from "./types.js";

const USAGE = [
  "Usage: dysflow codegraph-drift [--apply]",
  "",
  "Scans user-global instruction files for stale `codegraph-vba` runtime",
  "version references inside <!-- user-supplement:* --> blocks (issue #961).",
  "",
  "Default is a read-only dry-run: it reports the rewrites it WOULD make and",
  "exits 1 when drift is found so automation can react. With --apply the",
  "references are rewritten in place to a runtime-neutral phrasing that",
  "points at `codegraph --version` as the single source of the runtime",
  "version. Files whose supplement block never closes are skipped fail-closed.",
].join("\n");

export type CodegraphDriftRunOptions = {
  /** Absolute `$HOME`; instruction files live under `~/.config/opencode/`. */
  home: string;
  /** `false` = dry-run (default CLI behavior); `true` = rewrite in place. */
  apply: boolean;
  /** Override the canonical instruction-file list — tests and opt-in scans. */
  relativePaths?: readonly string[];
  /** Injectable read seam — defaults to `node:fs/promises#readFile`. */
  readFile?: (filePath: string) => Promise<string>;
  /** Injectable write seam — defaults to `node:fs/promises#writeFile`. */
  writeFile?: (filePath: string, content: string) => Promise<void>;
};

/** Render the fix result as CLI stdout lines. Pure — no I/O. */
function renderFixResult(result: SupplementDriftFixResult): string {
  const lines: string[] = [];
  const mode = result.apply ? "apply" : "dry-run";

  if (result.rewrites.length === 0) {
    lines.push(
      `[${mode}] Scanned ${result.filesScanned} instruction file(s). No drift to rewrite.`,
    );
  } else {
    const verb = result.apply ? "rewrote" : "would rewrite";
    lines.push(
      `[${mode}] Scanned ${result.filesScanned} instruction file(s); ${verb} ${result.rewrites.length} stale reference(s) in ${result.filesChanged} file(s).`,
    );
    for (const rewrite of result.rewrites) {
      lines.push(`  ${rewrite.filePath}:${rewrite.line} ${rewrite.matchedVersion} -> runtime-neutral pointer`);
    }
    if (!result.apply) {
      lines.push("Run `dysflow codegraph-drift --apply` to rewrite in place.");
    }
  }

  for (const skipped of result.skippedMalformed) {
    lines.push(
      `  SKIPPED (malformed closing marker): ${skipped} — restore the missing <!-- /user-supplement:* --> marker, then re-run.`,
    );
  }
  for (const error of result.errors) {
    lines.push(`  SKIPPED (${error.code}): ${error.filePath} — ${error.message}`);
  }

  return lines.join("\n");
}

/**
 * Run the drift scan/fix against `home`. Exit-code contract:
 * - dry-run: 1 when drift, read errors, or malformed-closing skips exist;
 *   0 when the tree is clean.
 * - apply: 1 when errors or malformed-closing skips remain; 0 otherwise
 *   (a successful rewrite IS the success case).
 */
export async function runCodegraphDriftCommand(
  options: CodegraphDriftRunOptions,
): Promise<CliResult> {
  const relativePaths = options.relativePaths ?? DEFAULT_INSTRUCTION_FILE_PATHS;
  const filePaths = relativePaths.map((relative) => path.join(options.home, relative));

  const result = await applySupplementDriftFix({
    filePaths,
    apply: options.apply,
    port: {
      readFile:
        options.readFile ??
        (async (filePath: string) => (await readFile(filePath, "utf8")) as string),
      writeFile:
        options.writeFile ??
        (async (filePath: string, content: string) => {
          await writeFile(filePath, content, "utf8");
        }),
    },
  });

  const blocking = !result.ok || (!result.apply && result.rewrites.length > 0);

  return {
    exitCode: blocking ? 1 : 0,
    stdout: renderFixResult(result),
    stderr: "",
  };
}

/** CLI handler — parses flags and wires `$HOME` from the environment. */
export async function handleCodegraphDriftCommand(
  args: readonly string[],
  context: CliCommandContext = {},
): Promise<CliResult> {
  let apply = false;
  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      return { exitCode: 0, stdout: USAGE, stderr: "" };
    }
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    return {
      exitCode: 1,
      stdout: "",
      stderr: [`Unsupported option for codegraph-drift: ${arg}`, "", USAGE].join("\n"),
    };
  }

  const env = context.env ?? process.env;
  return runCodegraphDriftCommand({ home: getHome(env), apply });
}
