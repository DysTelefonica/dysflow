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
