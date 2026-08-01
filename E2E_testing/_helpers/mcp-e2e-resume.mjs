import { execFileSync } from "node:child_process";
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
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
export const CHECKPOINT_FILE = "mcp-e2e-checkpoint.json";
export const CHECKPOINT_VERSION = 1;

export function createResultRows() {
  const rows = [];
  const occurrences = new Map();
  const appendUnchecked = (row) => {
    const area = row.area ?? "unknown";
    const key = `${area}/${row.tool}`;
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    return rows.push({
      ...row,
      id: row.id ?? `${key}#${occurrence}`,
      ...(!row.pass && row.failureClass === undefined ? { failureClass: "ordinary" } : {}),
    });
  };
  const addResult = (row) => appendUnchecked(row);
  return { rows, addResult, appendUnchecked };
}
export function computeE2eExitCode(rows, abortedDueToUnsafeFailure) {
  return abortedDueToUnsafeFailure || rows.some((row) => !row.pass) ? 1 : 0;
}
export function parseResumeArgs(argv, env = process.env) {
  const index = argv.indexOf("--resume");
  if (index < 0) return undefined;
  if (env.DYSFLOW_E2E_RELEASE_GATE === "1" || argv.includes("--release")) {
    throw new Error("Release-gate E2E must be a fresh full run; --resume is refused");
  }
  const root = argv[index + 1];
  if (!root || !isAbsolute(root)) throw new Error("--resume requires an absolute sandbox root");
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
export function runtimeIdentityPaths(cliCommand) {
  const runtimeRoot = dirname(dirname(resolve(cliCommand)));
  return [resolve(cliCommand), join(runtimeRoot, "app", "dist")];
}

async function hashPortableTree(root) {
  const hash = createHash("sha256");
  async function add(current, relativePath) {
    const info = await lstat(current);
    if (info.isDirectory()) {
      hash.update(`directory:${relativePath}\0`);
      for (const name of (await readdir(current)).sort()) {
        await add(join(current, name), join(relativePath, name));
      }
      return;
    }
    hash.update(`file:${relativePath}\0`);
    hash.update(await readFile(current));
  }
  await add(resolve(root), ".");
  return hash.digest("hex");
}

export async function assertReleaseRuntimeIdentity(repoRoot) {
  const candidateDist = join(repoRoot, "dist");
  const runtimeApp = join(repoRoot, "test-runtime", "app");
  if (
    (await hashPortableTree(candidateDist)) !== (await hashPortableTree(join(runtimeApp, "dist")))
  ) {
    throw new Error("Repository test-runtime compiled bytes mismatch the release candidate");
  }
  const candidatePackage = await readFile(join(repoRoot, "package.json"));
  const runtimePackage = await readFile(join(runtimeApp, "package.json"));
  if (!candidatePackage.equals(runtimePackage)) {
    throw new Error("Repository test-runtime package metadata mismatch the release candidate");
  }
}

export async function prepareReleaseRuntime(
  repoRoot,
  { env = process.env, execute = execFileSync } = {},
) {
  if (env.DYSFLOW_E2E_COMMAND) {
    throw new Error(
      "Release-gate E2E refuses DYSFLOW_E2E_COMMAND; repository test-runtime is required",
    );
  }
  if (process.platform === "win32") {
    execute(env.ComSpec ?? process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "pnpm build"], {
      cwd: repoRoot,
      stdio: "inherit",
    });
  } else {
    execute("pnpm", ["build"], { cwd: repoRoot, stdio: "inherit" });
  }
  execute(
    process.execPath,
    [
      join(repoRoot, "dist", "cli", "index.js"),
      "install",
      "--runtime-dir",
      join(repoRoot, "test-runtime"),
      "--no-tui",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );
  await assertReleaseRuntimeIdentity(repoRoot);
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
    failures: [],
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
    if (
      resumedCheckpoint &&
      state.snapshot?.status === "creating" &&
      state.snapshot.area === area
    ) {
      await snapshotSandbox(area);
      state.snapshot = { area, status: "ready" };
      await writeCheckpointAtomic(root, state);
    }
    if (resumedCheckpoint && recoveryArea === area && mutating && restoredArea !== area) {
      await restoreSandbox(area);
      for (const [completedId, item] of Object.entries(state.completed)) {
        if (item.area === area) delete state.completed[completedId];
      }
      restoredArea = area;
    }
    if (!resumedCheckpoint && mutating && !snapshottedAreas.has(area)) {
      state.snapshot = { area, status: "creating" };
      await writeCheckpointAtomic(root, state);
      await snapshotSandbox(area);
      state.snapshot = { area, status: "ready" };
      await writeCheckpointAtomic(root, state);
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
  async function continueAfterFailure(id) {
    delete state.completed[id];
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
  async function syncFailures(failures) {
    state.failures = failures.map((failure) => ({ ...failure }));
    await writeCheckpointAtomic(root, state);
  }
  return {
    before,
    pass,
    continueAfterFailure,
    fail,
    registerOwnedPid,
    clearOwnedPid,
    syncFailures,
    state,
  };
}
async function copyExisting(source, destination) {
  try {
    const info = await stat(source);
    await cp(source, destination, { recursive: info.isDirectory(), force: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
/**
 * Resolve `target` through `realpath`, tolerating a tail that does not exist yet.
 *
 * Walks up to the deepest existing ancestor, resolves that, and re-appends the
 * missing segments. Needed because the restore destination is routinely absent
 * (that is the point of restoring it), yet the containment check still has to
 * compare it against a realpath-normalized root.
 */
async function realpathDeepest(target) {
  const resolved = resolve(target);
  const missing = [];
  let current = resolved;
  for (;;) {
    try {
      const real = await realpath(current);
      return missing.length === 0 ? real : join(real, ...missing);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = dirname(current);
      if (parent === current) return resolved;
      missing.unshift(basename(current));
      current = parent;
    }
  }
}

async function assertContainedPlainPath(path, root, { allowMissing = false } = {}) {
  if ((await lstat(root)).isSymbolicLink())
    throw new Error(`Unsafe MCP E2E restore reparse root: ${root}`);
  const rootReal = await realpath(root);
  // Both sides must share a spelling before they can be compared. The root is
  // realpath-normalized, so the candidate has to be too: on Windows runners
  // `os.tmpdir()` can hand back an 8.3 short name (C:\Users\RUNNER~1\...), and a
  // literally-resolved candidate then shares no prefix with the normalized root,
  // so `relative()` reports an escape for a path that is plainly inside (#1146).
  //
  // Normalizing the candidate also strengthens the guard: a symlink that leaves
  // the root is now collapsed before the comparison, so it fails containment
  // outright instead of depending on the per-segment reparse walk below.
  const resolvedPath = await realpathDeepest(path);
  const rel = relative(rootReal, resolvedPath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Unsafe MCP E2E restore path: ${path}`);
  }
  let current = rootReal;
  for (const segment of rel.split(/[\\/]/).filter(Boolean)) {
    current = join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error(`Unsafe MCP E2E restore reparse point: ${current}`);
    } catch (error) {
      if (allowMissing && error?.code === "ENOENT") break;
      throw error;
    }
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
        await assertContainedPlainPath(destination, root, { allowMissing: true });
        await assertContainedPlainPath(phasePath(area, destination), snapshotsRoot);
        const temporary = `${destination}.restore-${process.pid}`;
        await rm(temporary, { recursive: true, force: true });
        await copyExisting(phasePath(area, destination), temporary);
        await rm(destination, { recursive: true, force: true });
        await rename(temporary, destination);
      }
    },
    root: snapshotsRoot,
  };
}
