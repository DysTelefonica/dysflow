/**
 * Filesystem store for the `verify_code` last-synced base snapshot (#1890).
 *
 * Layout: `<projectRoot>/.dysflow/runtime/verify-base/<sha256(accessPath)>/`,
 * one folder per target binary, holding one file per observation:
 * - `e-<sha256(sourceRoot, module, fileType)>-<ms>-<uuid>.json` — an observed agreement;
 * - `i-<sha256(module)>-<ms>-<uuid>.json` / `i-all-<ms>-<uuid>.json` — an invalidation.
 *
 * Every write creates a new, uniquely named file through write-then-rename and
 * never replaces an existing one, so concurrent writers (same key or not) never
 * drop or overwrite each other's observations, and no rename races on Windows.
 * Ordering between writers is settled at read time by the timestamps (see
 * `vba-verify-base.ts`): the newest observation of a key wins whatever order the
 * files landed in. Older observations of a key are pruned best-effort.
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
import * as nodeFs from "node:fs/promises";
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

/** `<key>-<observed epoch ms>-<uuid>.json`; the key is `e-<hash>`, `i-<hash>` or `i-all`. */
const OBSERVATION_FILE = /^([ei]-(?:[0-9a-f]{64}|all))-(\d{15})-[0-9a-f-]{36}\.json$/;

type StoredEntry = { schemaVersion: string; accessPath: string; entry: VerifyBaseEntry };
type StoredInvalidation = {
  schemaVersion: string;
  accessPath: string;
  invalidation: VerifyBaseInvalidation;
};

/** The filesystem operations the store uses; injectable so tests can force an interleaving. */
export type VerifyBaseFs = Pick<
  typeof nodeFs,
  "mkdir" | "readdir" | "readFile" | "rename" | "rm" | "stat" | "writeFile"
>;

export class FileVerifyBaseStore implements VerifyBaseStorePort {
  constructor(
    private readonly fallbackProjectRoot: string,
    private readonly fs: VerifyBaseFs = nodeFs,
  ) {}

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
      names = await this.fs.readdir(directory);
    } catch (error) {
      if (isMissing(error)) return { entries, invalidations };
      throw error;
    }
    const accessPath = verifyBasePathKey(target.accessPath);
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const stored = await readJson(this.fs, join(directory, name));
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
    const stored: StoredEntry = {
      schemaVersion: SCHEMA_VERSION,
      accessPath: verifyBasePathKey(target.accessPath),
      entry,
    };
    // A newer observation of the same key makes this one redundant.
    await this.append(
      directory,
      `e-${sha256(key)}`,
      entry.observedAt,
      stored,
      (other, own) => other > own,
    );
  }

  async invalidate(target: VerifyBaseTarget, invalidation: VerifyBaseInvalidation): Promise<void> {
    const directory = await this.directory(target);
    if (directory === undefined) return;
    const scope =
      invalidation.moduleName === null ? "all" : sha256(invalidation.moduleName.toLowerCase());
    const stored: StoredInvalidation = {
      schemaVersion: SCHEMA_VERSION,
      accessPath: verifyBasePathKey(target.accessPath),
      invalidation,
    };
    await this.append(
      directory,
      `i-${scope}`,
      invalidation.invalidatedAt,
      stored,
      (other, own) => other >= own,
    );
  }

  /**
   * Adds one observation of `key` as its own file, unless a stored observation
   * already `supersedes` it, then best-effort removes the strictly older ones.
   * A file name is never reused, so racing writers never rename onto the same
   * target and none can replace another's newer observation.
   */
  private async append(
    directory: string,
    key: string,
    time: string,
    stored: unknown,
    supersedes: (other: number, own: number) => boolean,
  ): Promise<void> {
    const parsed = Date.parse(time);
    const stamp = Number.isNaN(parsed) ? 0 : parsed;
    const siblings = await this.observations(directory, key);
    if (siblings.some((sibling) => supersedes(sibling.stamp, stamp))) return;
    const name = `${key}-${String(stamp).padStart(15, "0")}-${randomUUID()}.json`;
    await writeAtomically(this.fs, directory, join(directory, name), stored);
    for (const sibling of siblings) {
      if (sibling.stamp >= stamp) continue;
      // Pruning only bounds growth; a file left behind loses at read time.
      await this.fs.rm(join(directory, sibling.name), { force: true }).catch(() => undefined);
    }
  }

  private async observations(
    directory: string,
    key: string,
  ): Promise<{ name: string; stamp: number }[]> {
    let names: string[];
    try {
      names = await this.fs.readdir(directory);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const found: { name: string; stamp: number }[] = [];
    for (const name of names) {
      const match = OBSERVATION_FILE.exec(name);
      if (match?.[1] === key) found.push({ name, stamp: Number(match[2]) });
    }
    return found;
  }

  private async projectRoot(target: VerifyBaseTarget): Promise<string | undefined> {
    const candidates = [target.projectRoot, this.fallbackProjectRoot].filter(
      (candidate): candidate is string => candidate !== undefined && candidate.length > 0,
    );
    for (const candidate of candidates) {
      try {
        if ((await this.fs.stat(join(candidate, ".dysflow"))).isDirectory()) return candidate;
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

async function writeAtomically(
  fs: VerifyBaseFs,
  directory: string,
  file: string,
  value: unknown,
): Promise<void> {
  await fs.mkdir(directory, { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function readJson(
  fs: VerifyBaseFs,
  file: string,
): Promise<Record<string, unknown> | undefined> {
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    // Missing, or being pruned by a concurrent writer (EPERM/EBUSY on Windows).
    return undefined;
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
