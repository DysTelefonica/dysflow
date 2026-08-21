/**
 * Issue #1459 — schema-advertisement accounting, kept separate from runtime
 * invocation telemetry.
 *
 * #1197 records what an agent CALLS. It cannot record what a client is CHARGED
 * for: every `tools/list` re-injects the whole advertised surface into the
 * client's context, and clients differ in how often they do it. A surface
 * profile is a context-cost decision, so the cost side needs its own evidence —
 * and it must stay in its own stream, because one advertisement is not one
 * invocation and averaging the two would be meaningless.
 *
 * The record is names-and-counts only. No schema body, no tool descriptions,
 * no client identity beyond the surface that served the request.
 */

/** The advertisement surface served. Additive: never rename a member. */
export type SchemaAdvertisementSurface = "tools/list";

/**
 * Which advertisement view was served. `compact` is the #1475 advertisement
 * shape; `full` is the deep contract a consumer pulls through `describe_tool`
 * or `schema`.
 */
export type SchemaAdvertisementView = "compact" | "full";

export type SchemaAdvertisementEntry = {
  timestamp: string;
  surface: SchemaAdvertisementSurface;
  view: SchemaAdvertisementView;
  /** Number of tools advertised — after hidden-tool filtering. */
  toolCount: number;
  /** Serialized size of the advertised payload: the context the client pays for. */
  payloadBytes: number;
  /** 1-based ordinal of this advertisement within the server process. */
  repetition: number;
  /**
   * Milliseconds since the previous advertisement in this process, or null for
   * the first. This is the repetition signal: a client that re-lists on every
   * turn produces a tight cadence, one that lists once at handshake does not.
   */
  msSincePrevious: number | null;
};

export interface SchemaAdvertisementRecorder {
  record(entry: SchemaAdvertisementEntry): Promise<void>;
}

export type SchemaAdvertisementObservation = {
  surface: SchemaAdvertisementSurface;
  view: SchemaAdvertisementView;
  toolCount: number;
  payloadBytes: number;
};

export type SchemaAdvertisementAccountant = {
  next(observation: SchemaAdvertisementObservation): SchemaAdvertisementEntry;
};

/**
 * Per-process accountant. Repetition and cadence are process-scoped facts, so
 * they are derived here rather than reconstructed from timestamps later: a
 * restarted server legitimately begins a new repetition sequence, and that
 * distinction is invisible once the records are on disk.
 */
export function createSchemaAdvertisementAccountant(
  now: () => number = () => Date.now(),
): SchemaAdvertisementAccountant {
  let repetition = 0;
  let previousAt: number | undefined;

  return {
    next(observation) {
      const at = now();
      repetition += 1;
      const msSincePrevious = previousAt === undefined ? null : Math.max(0, at - previousAt);
      previousAt = at;
      return {
        timestamp: new Date(at).toISOString(),
        surface: observation.surface,
        view: observation.view,
        toolCount: Math.max(0, Math.floor(observation.toolCount)),
        payloadBytes: Math.max(0, Math.floor(observation.payloadBytes)),
        repetition,
        msSincePrevious,
      };
    },
  };
}

export type SchemaAdvertisementSummary = {
  advertisements: number;
  totalPayloadBytes: number;
  /** Bytes re-injected after the first advertisement — the avoidable cost. */
  repeatedPayloadBytes: number;
  maxToolCount: number;
  /** Median gap between consecutive advertisements; null with fewer than two. */
  medianIntervalMs: number | null;
};

/**
 * Fold a collected advertisement stream into the context-accounting summary
 * the #1215 gate asks for. `repeatedPayloadBytes` is the number that matters:
 * a profile only pays off when the surface is re-injected, so a client that
 * lists once has little to gain from one.
 */
export function summarizeSchemaAdvertisements(
  entries: readonly SchemaAdvertisementEntry[],
): SchemaAdvertisementSummary {
  if (entries.length === 0) {
    return {
      advertisements: 0,
      totalPayloadBytes: 0,
      repeatedPayloadBytes: 0,
      maxToolCount: 0,
      medianIntervalMs: null,
    };
  }

  const ordered = [...entries].sort((left, right) => left.repetition - right.repetition);
  const intervals = ordered
    .map((entry) => entry.msSincePrevious)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);

  const middle = Math.floor(intervals.length / 2);
  const medianIntervalMs =
    intervals.length === 0
      ? null
      : intervals.length % 2 === 1
        ? (intervals[middle] ?? null)
        : Math.round(((intervals[middle - 1] ?? 0) + (intervals[middle] ?? 0)) / 2);

  return {
    advertisements: ordered.length,
    totalPayloadBytes: ordered.reduce((sum, entry) => sum + entry.payloadBytes, 0),
    repeatedPayloadBytes: ordered
      .filter((entry) => entry.repetition > 1)
      .reduce((sum, entry) => sum + entry.payloadBytes, 0),
    maxToolCount: ordered.reduce((max, entry) => Math.max(max, entry.toolCount), 0),
    medianIntervalMs,
  };
}
