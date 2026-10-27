/**
 * Filesystem store for the `verify_code` last-synced base snapshot (#1890).
 *
 * Layout: `<projectRoot>/.dysflow/runtime/verify-base/<sha256(accessPath)>/`,
 * one folder per target binary, holding one file per key:
 * - `e-<sha256(sourceRoot, module, fileType)>.json` — one observed agreement;
 * - `i-<sha256(module)>.json` / `i-all.json` — the latest invalidation.
 *
 * Each write replaces exactly one file through write-then-rename, so concurrent
 * writers never drop each other's keys. Ordering between writers is settled at
 * read time by the timestamps (see `vba-verify-base.ts`), not by write order.
 *
 * `.dysflow/runtime/` is gitignored: the base is local, unversioned state, and
 * losing it only falls back to the two-text direction.
 *
 * The project folder is the first of the target's `projectRoot` and the
 * adapter's working directory that already holds a `.dysflow/` directory (a
 * `destinationRoot` override moves `projectRoot` onto the source folder). There
 * is no upward search, and the store stays inert when neither candidate has
 * `.dysflow/`, so a call that names an arbitrary folder never creates project
 * state in it.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type VerifyBaseEntry,
  type VerifyBaseInvalidation,
  type VerifyBaseStorePort,
  type VerifyBaseTarget,
  verifyBaseModuleKey,
  verifyBasePathKey,
} from "../../core/services/vba-verify-base.js";

const SCHEMA_VERSION = "dysflow.verify-base/v2";

type StoredEntry = { schemaVersion: string; accessPath: string; entry: VerifyBaseEntry };
type StoredInvalidation = {
  schemaVersion: string;
  accessPath: string;
  invalidation: VerifyBaseInvalidation;
};

export class FileVerifyBaseStore implements VerifyBaseStorePort {
  constructor(private readonly fallbackProjectRoot: string) {}

  async available(target: VerifyBaseTarget): Promise<boolean> {
    return (await this.projectRoot(target)) !== undefined;
  }

  async list(
    target: VerifyBaseTarget,
  ): Promise<{ entries: VerifyBaseEntry[]; invalidations: VerifyBaseInvalidation[] }> {
    const entries: VerifyBaseEntry[] = [];
    const invalidations: VerifyBaseInvalidation[] = [];
    const directory = await this.directory(target);
    if (directory === undefined) return { entries, invalidations };
    let names: string[];
    try {
      names = await readdir(directory);
    } catch (error) {
      if (isMissing(error)) return { entries, invalidations };
      throw error;
    }
    const accessPath = verifyBasePathKey(target.accessPath);
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const stored = await readJson(join(directory, name));
      // Unreadable files, other schemas and other binaries count as no base.
      if (stored === undefined || stored.schemaVersion !== SCHEMA_VERSION) continue;
      if (stored.accessPath !== accessPath) continue;
      if (name.startsWith("e-") && isEntry(stored.entry)) entries.push(stored.entry);
      if (name.startsWith("i-") && isInvalidation(stored.invalidation)) {
        invalidations.push(stored.invalidation);
      }
    }
    return { entries, invalidations };
  }

  async put(target: VerifyBaseTarget, entry: VerifyBaseEntry): Promise<void> {
    const directory = await this.directory(target);
    if (directory === undefined) return;
    const key = `${entry.sourceRoot}\0${verifyBaseModuleKey(entry.moduleName, entry.fileType)}`;
    const file = join(directory, `e-${sha256(key)}.json`);
    // A newer observation of the same key is never replaced by an older one.
    const existing = await readJson(file);
    if (isEntry(existing?.entry) && existing.entry.observedAt > entry.observedAt) return;
    const stored: StoredEntry = {
      schemaVersion: SCHEMA_VERSION,
      accessPath: verifyBasePathKey(target.accessPath),
      entry,
    };
    await writeAtomically(directory, file, stored);
  }

  async invalidate(target: VerifyBaseTarget, invalidation: VerifyBaseInvalidation): Promise<void> {
    const directory = await this.directory(target);
    if (directory === undefined) return;
    const scope =
      invalidation.moduleName === null ? "all" : sha256(invalidation.moduleName.toLowerCase());
    const file = join(directory, `i-${scope}.json`);
    const existing = await readJson(file);
    if (
      isInvalidation(existing?.invalidation) &&
      existing.invalidation.invalidatedAt >= invalidation.invalidatedAt
    ) {
      return;
    }
    const stored: StoredInvalidation = {
      schemaVersion: SCHEMA_VERSION,
      accessPath: verifyBasePathKey(target.accessPath),
      invalidation,
    };
    await writeAtomically(directory, file, stored);
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

  private async directory(target: VerifyBaseTarget): Promise<string | undefined> {
    const root = await this.projectRoot(target);
    if (root === undefined) return undefined;
    const id = sha256(verifyBasePathKey(target.accessPath));
    return join(root, ".dysflow", "runtime", "verify-base", id);
  }
}

async function writeAtomically(directory: string, file: string, value: unknown): Promise<void> {
  await mkdir(directory, { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function readJson(file: string): Promise<Record<string, unknown> | undefined> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
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
    typeof entry.observedAt === "string"
  );
}

function isInvalidation(value: unknown): value is VerifyBaseInvalidation {
  if (typeof value !== "object" || value === null) return false;
  const invalidation = value as Record<string, unknown>;
  return (
    (invalidation.moduleName === null || typeof invalidation.moduleName === "string") &&
    typeof invalidation.invalidatedAt === "string"
  );
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
