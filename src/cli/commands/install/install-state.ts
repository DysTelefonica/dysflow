import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { type InstallChannel, isInstallChannel } from "./channel.js";

/**
 * Install state companion file (issue #1521).
 *
 * `<runtimeDir>/.dysflow-install-state.json` records which channel produced the
 * bytes currently installed, so `update` can refuse a silent channel switch and
 * `doctor` can report what is actually running. It sits next to the runtime it
 * describes — one state file per runtime directory — rather than in the shared
 * system marker, because two runtimes may legitimately track two channels.
 *
 * The file is advisory: a missing or unreadable state file never blocks a
 * command, it only removes the pin. That keeps runtimes installed before this
 * feature working unchanged.
 */
export const INSTALL_STATE_FILE = ".dysflow-install-state.json";

export type InstallState = {
  channel: InstallChannel;
  version: string;
  commitSha?: string;
  installedAt: string;
};

export function getInstallStatePath(runtimeDir: string): string {
  return path.join(runtimeDir, INSTALL_STATE_FILE);
}

/**
 * Parses install-state JSON, returning `undefined` for anything that is not a
 * complete, well-typed record. A half-written or hand-edited file must not be
 * able to pin a runtime to a channel it never installed.
 */
export function parseInstallState(raw: string): InstallState | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;

  const candidate = parsed as Record<string, unknown>;
  if (!isInstallChannel(candidate.channel)) return undefined;
  if (typeof candidate.version !== "string" || candidate.version.length === 0) return undefined;
  if (typeof candidate.installedAt !== "string" || candidate.installedAt.length === 0) {
    return undefined;
  }
  const commitSha = candidate.commitSha;
  if (commitSha !== undefined && typeof commitSha !== "string") return undefined;

  return {
    channel: candidate.channel,
    version: candidate.version,
    ...(commitSha !== undefined && commitSha.length > 0 ? { commitSha } : {}),
    installedAt: candidate.installedAt,
  };
}

export function serializeInstallState(state: InstallState): string {
  return `${JSON.stringify(
    {
      channel: state.channel,
      version: state.version,
      ...(state.commitSha !== undefined && state.commitSha.length > 0
        ? { commitSha: state.commitSha }
        : {}),
      installedAt: state.installedAt,
    },
    null,
    2,
  )}\n`;
}

/** Reads the state for a runtime directory; `undefined` when absent or invalid. */
export async function readInstallState(runtimeDir: string): Promise<InstallState | undefined> {
  const raw = await readFile(getInstallStatePath(runtimeDir), "utf8").catch(() => undefined);
  if (raw === undefined) return undefined;
  return parseInstallState(raw);
}

/**
 * Writes the state atomically: a full write to a sibling temp file followed by
 * a rename, so a crashed or concurrent install can never leave a truncated
 * record that would read back as a different channel.
 */
export async function writeInstallState(runtimeDir: string, state: InstallState): Promise<void> {
  const destination = getInstallStatePath(runtimeDir);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, serializeInstallState(state), "utf8");
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}
