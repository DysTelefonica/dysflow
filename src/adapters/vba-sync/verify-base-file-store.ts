/**
 * Filesystem store for the `verify_code` last-synced base snapshot (#1890).
 *
 * Layout: `<projectRoot>/.dysflow/runtime/verify-base/<sha256(accessPath)>.json`,
 * one file per target binary. `.dysflow/runtime/` is gitignored: the base is
 * local, unversioned state, and losing it only falls back to the two-text
 * direction.
 *
 * The project folder is the first of the target's `projectRoot` and the
 * adapter's working directory that already holds a `.dysflow/` directory (a
 * `destinationRoot` override moves `projectRoot` onto the source folder). There
 * is no upward search, and the store stays inert when neither candidate has
 * `.dysflow/`, so a call that names an arbitrary folder never creates project
 * state in it.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type VerifyBaseEntry,
  type VerifyBaseRecord,
  type VerifyBaseStorePort,
  type VerifyBaseTarget,
  verifyBasePathKey,
} from "../../core/services/vba-verify-base.js";

const SCHEMA_VERSION = "dysflow.verify-base/v1";

type StoredFile = {
  schemaVersion: string;
  accessPath: string;
  entries: VerifyBaseEntry[];
};

export class FileVerifyBaseStore implements VerifyBaseStorePort {
  constructor(private readonly fallbackProjectRoot: string) {}

  async available(target: VerifyBaseTarget): Promise<boolean> {
    return (await this.projectRoot(target)) !== undefined;
  }

  async load(target: VerifyBaseTarget): Promise<VerifyBaseRecord | undefined> {
    const file = await this.filePath(target);
    if (file === undefined) return undefined;
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
    const parsed = parseStoredFile(text);
    // A file that is unreadable, from another schema, or for another binary is
    // treated as no base: the next successful write replaces it.
    if (parsed === undefined || parsed.accessPath !== verifyBasePathKey(target.accessPath)) {
      return undefined;
    }
    return { accessPath: parsed.accessPath, entries: parsed.entries };
  }

  async save(target: VerifyBaseTarget, record: VerifyBaseRecord): Promise<void> {
    const file = await this.filePath(target);
    if (file === undefined) return;
    await mkdir(dirname(file), { recursive: true });
    const stored: StoredFile = {
      schemaVersion: SCHEMA_VERSION,
      accessPath: record.accessPath,
      entries: record.entries,
    };
    // Write then rename, so a reader never sees a half-written file.
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
      await rename(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async projectRoot(target: VerifyBaseTarget): Promise<string | undefined> {
    const candidates = [target.projectRoot, this.fallbackProjectRoot].filter(
      (candidate): candidate is string => candidate !== undefined && candidate.length > 0,
    );
    for (const candidate of candidates) {
      try {
        if ((await stat(join(candidate, ".dysflow"))).isDirectory()) return candidate;
      } catch {
        // Not a project folder; try the next candidate.
      }
    }
    return undefined;
  }

  private async filePath(target: VerifyBaseTarget): Promise<string | undefined> {
    const root = await this.projectRoot(target);
    if (root === undefined) return undefined;
    const id = createHash("sha256").update(verifyBasePathKey(target.accessPath)).digest("hex");
    return join(root, ".dysflow", "runtime", "verify-base", `${id}.json`);
  }
}

function parseStoredFile(text: string): StoredFile | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as Partial<StoredFile>;
  if (candidate.schemaVersion !== SCHEMA_VERSION) return undefined;
  if (typeof candidate.accessPath !== "string" || !Array.isArray(candidate.entries)) {
    return undefined;
  }
  return {
    schemaVersion: candidate.schemaVersion,
    accessPath: candidate.accessPath,
    entries: candidate.entries.filter(isEntry),
  };
}

function isEntry(value: unknown): value is VerifyBaseEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.sourceRoot === "string" &&
    typeof entry.moduleName === "string" &&
    typeof entry.fileType === "string" &&
    typeof entry.hash === "string" &&
    typeof entry.canon === "string" &&
    typeof entry.recordedAt === "string"
  );
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
