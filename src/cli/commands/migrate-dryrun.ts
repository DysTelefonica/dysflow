import { mkdir, opendir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type DryRunMigrationEdit,
  migrateDryRunContent,
  restoreDryRunContent,
} from "../../core/services/dryrun-migration.js";
import { parseNamedArgs } from "./arg-parser.js";
import type { CliCommandContext, CliResult } from "./types.js";

const USAGE =
  "Usage: dysflow migrate-dryrun --cwd <consumer-repo> (--dry-run | --apply | --undo <manifest>)";
const SUPPORTED_SUFFIXES = [".bas", ".cls", ".form.txt"] as const;
const SKIPPED_DIRECTORIES = new Set([".git", ".dysflow-runtime", "node_modules"]);

type MigratedFile = {
  relativePath: string;
  before: string;
  after: string;
  edits: readonly DryRunMigrationEdit[];
};

type UndoManifest = {
  schemaVersion: "dysflow.migrate-dryrun.undo/v1";
  createdAt: string;
  root: string;
  files: readonly {
    path: string;
    before: string;
    after: string;
  }[];
};

function isSupportedFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return SUPPORTED_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

async function collectConsumerFiles(root: string): Promise<string[]> {
  const collected: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = [];
    for await (const entry of await opendir(directory)) entries.push(entry);
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) await visit(fullPath);
      } else if (entry.isFile() && isSupportedFile(entry.name)) {
        collected.push(fullPath);
      }
    }
  }

  await visit(root);
  return collected;
}

function renderReport(
  root: string,
  files: readonly MigratedFile[],
  mode: "dry-run" | "apply",
  undoPath?: string,
): string {
  const lines = [
    `dryRun migration — ${mode}`,
    `Root: ${root}`,
    `Files matched: ${files.length}`,
    `Edits proposed: ${files.reduce((total, file) => total + file.edits.length, 0)}`,
  ];
  for (const file of files) {
    lines.push(`--- ${file.relativePath}`);
    for (const edit of file.edits) {
      lines.push(
        `  line ${edit.line} confidence=${edit.confidence} (${edit.confidenceReason})`,
        `- ${edit.legacyLine}`,
        `+ ${edit.newLine}`,
      );
    }
  }
  if (undoPath !== undefined) lines.push(`Undo manifest: ${undoPath}`);
  return lines.join("\n");
}

function timestampForFile(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function scan(root: string): Promise<MigratedFile[]> {
  const paths = await collectConsumerFiles(root);
  const files: MigratedFile[] = [];
  for (const filePath of paths) {
    const before = await readFile(filePath, "utf8");
    const migrated = migrateDryRunContent(before);
    if (migrated.edits.length > 0) {
      files.push({
        relativePath: path.relative(root, filePath),
        before,
        after: migrated.content,
        edits: migrated.edits,
      });
    }
  }
  return files;
}

async function applyMigration(root: string, files: readonly MigratedFile[]): Promise<string> {
  const runtimeDirectory = path.join(root, ".dysflow-runtime");
  await mkdir(runtimeDirectory, { recursive: true });
  const manifestPath = path.join(
    runtimeDirectory,
    `migration-${timestampForFile(new Date())}.undo.json`,
  );
  const manifest: UndoManifest = {
    schemaVersion: "dysflow.migrate-dryrun.undo/v1",
    createdAt: new Date().toISOString(),
    root,
    files: files.map((file) => ({
      path: file.relativePath,
      before: file.before,
      after: file.after,
    })),
  };

  // Persist recovery data before the first consumer write so a mid-apply I/O
  // failure never leaves modified files without an undo path.
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  for (const file of files) {
    await writeFile(path.join(root, file.relativePath), file.after, "utf8");
  }
  return manifestPath;
}

function resolveManifestEntry(root: string, relativePath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Undo manifest path escapes consumer root: ${relativePath}`);
  }
  return resolved;
}

function parseUndoManifest(raw: string): UndoManifest {
  const value = JSON.parse(raw) as Partial<UndoManifest>;
  if (
    value.schemaVersion !== "dysflow.migrate-dryrun.undo/v1" ||
    !Array.isArray(value.files) ||
    value.files.some(
      (file) =>
        typeof file !== "object" ||
        file === null ||
        typeof file.path !== "string" ||
        typeof file.before !== "string" ||
        typeof file.after !== "string",
    )
  ) {
    throw new Error("Invalid dryRun migration undo manifest.");
  }
  return value as UndoManifest;
}

async function undoMigration(root: string, manifestPath: string): Promise<number> {
  const manifest = parseUndoManifest(await readFile(manifestPath, "utf8"));
  const pending: Array<{ filePath: string; before: string }> = [];

  // Validate every entry before writing any of them: undo is all-or-nothing
  // when consumer files have moved on since the migration.
  for (const entry of manifest.files) {
    const filePath = resolveManifestEntry(root, entry.path);
    const current = await readFile(filePath, "utf8");
    pending.push({
      filePath,
      before: restoreDryRunContent(current, entry),
    });
  }
  for (const entry of pending) {
    await writeFile(entry.filePath, entry.before, "utf8");
  }
  return pending.length;
}

export async function handleMigrateDryRunCommand(
  args: readonly string[],
  context: CliCommandContext = {},
): Promise<CliResult> {
  if (args[0] === "--help" || args[0] === "-h") {
    return { exitCode: 0, stdout: USAGE, stderr: "" };
  }
  const parsed = parseNamedArgs({
    specs: [
      { name: "--cwd", type: "string" },
      { name: "--dry-run", type: "boolean" },
      { name: "--apply", type: "boolean" },
      { name: "--undo", type: "string" },
    ],
    args,
    onUnknown: (arg) => `Unsupported option: ${arg}\n${USAGE}`,
  });
  if (!parsed.ok) return { exitCode: 1, stdout: "", stderr: parsed.message };

  const root = path.resolve(
    (parsed.values["--cwd"] as string | undefined) ?? context.cwd ?? process.cwd(),
  );
  const dryRun = parsed.values["--dry-run"] === true;
  const apply = parsed.values["--apply"] === true;
  const undoPath = parsed.values["--undo"] as string | undefined;
  if (Number(dryRun) + Number(apply) + Number(undoPath !== undefined) !== 1) {
    return { exitCode: 1, stdout: "", stderr: USAGE };
  }

  try {
    const rootStats = await stat(root);
    if (!rootStats.isDirectory()) throw new Error(`Consumer root is not a directory: ${root}`);

    if (undoPath !== undefined) {
      const restored = await undoMigration(root, path.resolve(root, undoPath));
      return {
        exitCode: 0,
        stdout: `Restored files: ${restored}\nUndo manifest: ${path.resolve(root, undoPath)}`,
        stderr: "",
      };
    }

    const files = await scan(root);
    if (dryRun) {
      return { exitCode: 0, stdout: renderReport(root, files, "dry-run"), stderr: "" };
    }
    const manifestPath = await applyMigration(root, files);
    return {
      exitCode: 0,
      stdout: renderReport(root, files, "apply", manifestPath),
      stderr: "",
    };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}
