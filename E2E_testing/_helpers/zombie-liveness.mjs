// Liveness and termination record for a failing zombie-check (#1899).
// Pure: the harness and the record helper supply the samples and the taskkill result.

/**
 * @param {Array<{ atMs: number, alive: boolean }>} samples
 * @returns {{ firstDeadAtMs: number | null, aliveAtEnd: boolean, sampleCount: number }}
 */
export function summarizeLiveness(samples) {
  const firstDead = samples.find((s) => !s.alive);
  const last = samples.at(-1);
  return {
    firstDeadAtMs: firstDead ? firstDead.atMs : null,
    aliveAtEnd: last ? last.alive : false,
    sampleCount: samples.length,
  };
}

// Images the harness can legitimately spawn as the call's child: the shell wrapper it
// uses (`shell: true`) and the MCP node process. Any other image on a live PID is a
// reused PID, not the child (#1899, run 40286564767: conhost.exe on the wrapper's PID).
const CHILD_IMAGES = new Set(["cmd.exe", "node.exe", "powershell.exe", "pwsh.exe"]);

/**
 * @param {{ alive: boolean, imageName: string | null | undefined }} input
 * @returns {"dead" | "alive" | "reused"}
 */
export function classifyChildLiveness({ alive, imageName }) {
  if (!alive) return "dead";
  if (!imageName) return "alive";
  return CHILD_IMAGES.has(imageName.toLowerCase()) ? "alive" : "reused";
}

// Tolerance between the harness's Date.now() and a process CreationDate. The harness takes
// `spawnedAtMs` right after `spawn()` returns, so the wrapper was created at or before it;
// the slack only absorbs clock rounding. A wrapper that exits and loses its PID within this
// window is still read as the child: the conservative, pre-#1899 outcome.
export const SPAWN_IDENTITY_SLACK_MS = 1000;

/**
 * Whether the process now holding a PID is the one the harness spawned (#1899). A process
 * created after the spawn returned took the PID over once the child exited. Without a
 * creation time or a spawn time the answer is "unknown", and callers keep treating the PID
 * as the child.
 * @param {{ spawnedAtMs: number | null | undefined, row: { creationMs?: number | null } | null | undefined }} input
 * @returns {"same" | "reused" | "unknown"}
 */
export function isSameProcess({ spawnedAtMs, row }) {
  const creationMs = row?.creationMs;
  if (!Number.isFinite(spawnedAtMs) || !Number.isFinite(creationMs)) return "unknown";
  return creationMs > spawnedAtMs + SPAWN_IDENTITY_SLACK_MS ? "reused" : "same";
}

/**
 * @param {{
 *   tool: string,
 *   childPid: number,
 *   taskkillExit: number | null,
 *   guardExpired: boolean,
 *   terminationMs: number,
 *   liveness: { firstDeadAtMs: number | null, aliveAtEnd: boolean, sampleCount: number },
 * }} input
 * @returns {string}
 */
export function formatTerminationLine({
  tool,
  childPid,
  taskkillExit,
  guardExpired,
  terminationMs,
  liveness,
}) {
  const exit = taskkillExit === null || taskkillExit === undefined ? "none" : String(taskkillExit);
  const dead = liveness.firstDeadAtMs === null ? "none" : String(liveness.firstDeadAtMs);
  return [
    `ZOMBIE-TIMING tool=${tool} childPid=${childPid}`,
    `taskkillExit=${exit}`,
    `guardExpired=${guardExpired}`,
    `terminationMs=${terminationMs}`,
    `firstDeadAtMs=${dead}`,
    `aliveAtEnd=${liveness.aliveAtEnd}`,
    `samples=${liveness.sampleCount}`,
  ].join(" ");
}

/**
 * Verdict for the zombie-check (#1899). A child that answers at the check and stops within
 * the sampling window is a late exit, not a leak; only a child that still answers at the end
 * of the window is a zombie.
 * @param {{ aliveAtCheck: boolean, liveness: { aliveAtEnd: boolean } | null }} input
 * @returns {"pass" | "late-exit" | "zombie"}
 */
export function zombieVerdict({ aliveAtCheck, liveness }) {
  if (!aliveAtCheck) return "pass";
  if (liveness && liveness.aliveAtEnd === false) return "late-exit";
  return "zombie";
}
