import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
export const CHECKPOINT_FILE = "mcp-e2e-checkpoint.json";
export const CHECKPOINT_VERSION = 1;

export function createResultRows() {
  const rows = [];
  const appendUnchecked = (row) => rows.push(row);
  const addFailFastResult = (row) => {
    const length = appendUnchecked(row);
    if (!row.pass) throw new Error(`mcp-e2e: STOP-ON-FAIL after ${row.tool}`);
    return length;
  };
  // recordImpl must append its tool + zombie rows before it decides to throw.
  return { rows, addFailFastResult, appendUnchecked };
}
export function parseResumeArgs(argv, env = process.env) {
  const index = argv.indexOf("--resume");
  if (index < 0) return undefined;
  const root = argv[index + 1];
  if (!root || !isAbsolute(root)) throw new Error("--resume requires an absolute sandbox root");
  if (env.DYSFLOW_E2E_RELEASE_GATE === "1" || argv.includes("--release")) {
    throw new Error("Release-gate E2E must be a fresh full run; --resume is refused");
  }
  return resolve(root);
}
export async function hashRunIdentity(paths) {
  const hash = createHash("sha256");
  async function add(path) {
    const info = await lstat(path);
    hash.update(path);
    if (info.isDirectory()) {
      for (const name of (await readdir(path)).sort()) await add(join(path, name));
    } else hash.update(await readFile(path));
  }
  for (const path of paths) await add(resolve(path));
  return `checkpoint-v2|${hash.digest("hex")}`;
}
export function assertSafeResumeRoot(root, { repoRoot, scriptDir }) {
  const resolved = resolve(root);
  if (!basename(resolved).startsWith("dysflow-mcp-e2e-")) {
    throw new Error(`Unsafe MCP E2E resume root: ${root}`);
  }
  for (const protectedRoot of [resolve(repoRoot), resolve(scriptDir)]) {
    if (
      resolved === protectedRoot ||
      resolved.startsWith(`${protectedRoot}\\`) ||
      resolved.startsWith(`${protectedRoot}/`)
    ) {
      throw new Error(`Unsafe MCP E2E resume root: ${root}`);
    }
  }
  return resolved;
}
export async function readCheckpoint(root) {
  return JSON.parse(await readFile(join(root, CHECKPOINT_FILE), "utf8"));
}
export async function writeCheckpointAtomic(root, checkpoint) {
  const target = join(root, CHECKPOINT_FILE);
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}
export async function validateCheckpoint(checkpoint, expected) {
  if (checkpoint.version !== CHECKPOINT_VERSION)
    throw new Error("Unsupported MCP E2E checkpoint version");
  if (checkpoint.identity !== expected.identity)
    throw new Error("MCP E2E checkpoint runtime identity mismatch");
  if (resolve(checkpoint.sandboxRoot) !== resolve(expected.sandboxRoot))
    throw new Error("MCP E2E checkpoint sandbox mismatch");
  for (const pid of checkpoint.ownedPids ?? []) {
    if (expected.isOwnedPidAlive(pid))
      throw new Error(`Cannot resume while suite-owned pid=${pid} survives`);
  }
}
export function createResumeController({
  root,
  identity,
  resumedCheckpoint,
  mutatingAreas,
  snapshotSandbox,
  restoreSandbox,
}) {
  const state = resumedCheckpoint ?? {
    version: CHECKPOINT_VERSION,
    identity,
    sandboxRoot: root,
    completed: {},
    failedStepId: null,
    failedArea: null,
    ownedPids: [],
  };
  const occurrences = new Map();
  const snapshottedAreas = new Set();
  let restoredArea;
  const recoveryArea = state.inProgress?.mutating ? state.inProgress.area : state.failedArea;

  function stepId(area, tool) {
    const key = `${area}/${tool}`;
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    return `${key}#${occurrence}`;
  }
  async function before(area, tool) {
    const id = stepId(area, tool);
    const mutating = mutatingAreas.has(area) || mutatingAreas.has(`${area}/${tool}`);
    if (resumedCheckpoint && recoveryArea === area && mutating && restoredArea !== area) {
      await restoreSandbox(area);
      for (const [completedId, item] of Object.entries(state.completed)) {
        if (item.area === area) delete state.completed[completedId];
      }
      restoredArea = area;
    }
    if (!resumedCheckpoint && mutating && !snapshottedAreas.has(area)) {
      await snapshotSandbox(area);
      snapshottedAreas.add(area);
    }
    const cached = state.completed[id]?.result;
    if (cached) return { id, cached };
    state.inProgress = { id, area, mutating };
    await writeCheckpointAtomic(root, state);
    return { id };
  }
  async function pass(id, area, result) {
    state.completed[id] = { area, result };
    state.lastCompletedId = id;
    state.failedStepId = null;
    state.failedArea = null;
    state.ownedPids = [];
    state.inProgress = null;
    await writeCheckpointAtomic(root, state);
  }
  async function fail(id, area, ownedPids, { invalidateLast = false } = {}) {
    if (invalidateLast && state.lastCompletedId) {
      delete state.completed[state.lastCompletedId];
    }
    state.failedStepId = id;
    state.failedArea = area;
    state.ownedPids = [...ownedPids];
    await writeCheckpointAtomic(root, state);
  }
  async function registerOwnedPid(pid) {
    state.ownedPids ??= [];
    if (pid > 0 && !state.ownedPids.includes(pid)) state.ownedPids.push(pid);
    await writeCheckpointAtomic(root, state);
  }
  async function clearOwnedPid(pid) {
    state.ownedPids = (state.ownedPids ?? []).filter((ownedPid) => ownedPid !== pid);
    await writeCheckpointAtomic(root, state);
  }
  return { before, pass, fail, registerOwnedPid, clearOwnedPid, state };
}
async function copyExisting(source, destination) {
  try {
    const info = await stat(source);
    await cp(source, destination, { recursive: info.isDirectory(), force: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
async function assertContainedPlainPath(path, root) {
  if ((await lstat(root)).isSymbolicLink())
    throw new Error(`Unsafe MCP E2E restore reparse root: ${root}`);
  const rootReal = await realpath(root);
  const pathReal = await realpath(path);
  const rel = relative(rootReal, pathReal);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Unsafe MCP E2E restore path: ${path}`);
  }
  let current = rootReal;
  for (const segment of rel.split(/[\\/]/).filter(Boolean)) {
    current = join(current, segment);
    if ((await lstat(current)).isSymbolicLink())
      throw new Error(`Unsafe MCP E2E restore reparse point: ${current}`);
  }
}
export function createPhaseSnapshots(root, sandboxPaths) {
  const snapshotsRoot = `${root}.phase-snapshots`;
  const phasePath = (area, path) => join(snapshotsRoot, area, basename(path));
  return {
    async snapshot(area) {
      const target = join(snapshotsRoot, area);
      const temporary = `${target}.tmp-${process.pid}`;
      await rm(temporary, { recursive: true, force: true });
      await mkdir(temporary, { recursive: true });
      for (const source of sandboxPaths) {
        const copy = join(temporary, basename(source));
        await copyExisting(source, copy);
        await stat(copy);
      }
      await rm(target, { recursive: true, force: true });
      await rename(temporary, target);
    },
    async restore(area) {
      for (const destination of sandboxPaths) {
        await assertContainedPlainPath(destination, root);
        await assertContainedPlainPath(phasePath(area, destination), snapshotsRoot);
        await rm(destination, { recursive: true, force: true });
        await copyExisting(phasePath(area, destination), destination);
      }
    },
    root: snapshotsRoot,
  };
}
