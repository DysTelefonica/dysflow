/**
 * Issue #1459 — evidence analysis over privacy-safe invocation telemetry.
 *
 * #1215 defers the MCP surface-profile decision until representative
 * telemetry exists. #1197 built the recorder; this module turns a collected
 * window of `InvocationTelemetryEntry` records into the evidence that gate
 * asks for, without ever needing a parameter value, a path, or SQL text.
 *
 * The module is deliberately pure and taxonomy-free. It never hardcodes which
 * tool belongs to which workflow phase and never decides which tool is
 * write-capable: both are runtime facts owned by the tool catalog, and a
 * second copy here would drift the moment a tool moves. The caller supplies
 * them through `SurfaceProfileEvidenceInput.catalog`, so the analysis stays
 * correct as the surface evolves.
 */
import type { InvocationTelemetryEntry } from "./invocation-telemetry.js";

/**
 * The six workflow phases #1459 requires coverage of, plus the bucket for a
 * tool the runtime catalog does not classify. `unclassified` is never a
 * coverage target — it exists so an unmapped tool stays visible instead of
 * being folded into a phase it does not belong to.
 */
export const SAMPLED_WORKFLOW_PHASES = [
  "bootstrap",
  "sync",
  "tests",
  "sql",
  "forms",
  "recovery",
] as const;

export type SampledWorkflowPhase = (typeof SAMPLED_WORKFLOW_PHASES)[number];
export type WorkflowPhase = SampledWorkflowPhase | "unclassified";

/**
 * Per-tool facts the runtime catalog owns. `phases` comes from the tool's
 * `agentWorkflow.phases` metadata; `writeCapable` from its declared access. A
 * tool absent from the map is analyzed as `unclassified` and non-write, and
 * reported as a catalog gap rather than guessed at.
 */
export type ToolCatalogEntry = {
  phases: readonly WorkflowPhase[];
  writeCapable: boolean;
};

export type SurfaceProfileCatalog = Readonly<Record<string, ToolCatalogEntry>>;

export type SurfaceProfileThresholds = {
  /**
   * Inactivity gap that ends a session. Telemetry entries carry no session id,
   * so a window of silence is the only honest boundary available. The default
   * matches the protocol document: a shorter value fragments long
   * human-in-the-loop pauses (the HR-1 manual compile step routinely idles for
   * minutes), a longer one merges unrelated work into one session.
   */
  sessionGapMs: number;
  /**
   * Fraction of a tool's sessions in which a follower must appear before the
   * pair is reported as a dependency rather than as co-occurrence.
   */
  dependencyConfidence: number;
  /** Minimum invocations before the window is considered representative. */
  minimumInvocations: number;
  /** Minimum distinct projects before the window is considered representative. */
  minimumProjects: number;
};

export const DEFAULT_SURFACE_PROFILE_THRESHOLDS: SurfaceProfileThresholds = {
  sessionGapMs: 30 * 60 * 1000,
  dependencyConfidence: 0.9,
  minimumInvocations: 2000,
  minimumProjects: 3,
};

export type SurfaceProfileEvidenceInput = {
  entries: readonly InvocationTelemetryEntry[];
  catalog: SurfaceProfileCatalog;
  thresholds?: Partial<SurfaceProfileThresholds>;
};

export type ToolUsageStat = {
  tool: string;
  invocations: number;
  okCount: number;
  contractFailures: number;
  runtimeFailures: number;
  /** p95 of observed `durationMs`, nearest-rank. 0 when nothing was observed. */
  p95DurationMs: number;
  writeIntents: { apply: number; dryRun: number; read: number };
  phases: WorkflowPhase[];
  /** Schema-required parameter names the caller omitted (#1198). */
  missingParams: string[];
  rejectedParams: string[];
};

export type ToolDependency = {
  tool: string;
  /**
   * Tools that followed `tool` inside the same session in at least
   * `dependencyConfidence` of the sessions where `tool` appeared. This is the
   * sync→tests / forms→schema signal: hiding a follower behind a profile would
   * break the workflow that reaches it.
   */
  requiredFollowers: string[];
  /** Tools that reached `tool` at the same confidence — its inbound closure. */
  reachedFrom: string[];
  sessionsObserved: number;
};

export type ReadProfileEligibility = {
  tool: string;
  /** Every observed invocation used `writeIntent: "read"`. */
  readOnlyInPractice: boolean;
  /** The runtime catalog declares this tool write-capable. */
  declaredWriteCapable: boolean;
  /**
   * The AC#7 signal. A tool that is write-capable by declaration but was only
   * ever read from cannot be placed in a `read` profile on declared access
   * alone: the profile would need eligibility metadata separate from write
   * access, or the read branch of that tool disappears with it. Conditional
   * recovery tools are the canonical case — `cleanup_access_operation`
   * inspects without `force` and mutates with it.
   */
  needsSeparateEligibilityMetadata: boolean;
};

export type SampleAdequacy = {
  totalInvocations: number;
  minimumInvocations: number;
  distinctProjects: number;
  minimumProjects: number;
  phasesCovered: SampledWorkflowPhase[];
  phasesMissing: SampledWorkflowPhase[];
  toolsMissingFromCatalog: string[];
  adequate: boolean;
  /** Human-readable reasons the window is not yet representative. */
  gaps: string[];
};

export type SurfaceProfileEvidence = {
  window: {
    firstTimestamp: string | null;
    lastTimestamp: string | null;
    sessions: number;
  };
  tools: ToolUsageStat[];
  dependencies: ToolDependency[];
  readProfile: ReadProfileEligibility[];
  adequacy: SampleAdequacy;
};

export type TelemetrySession = {
  projectId: string | null;
  entries: InvocationTelemetryEntry[];
};

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Telemetry entries carry no session id, so sessions are reconstructed by
 * splitting each project's chronological stream on an inactivity gap. Entries
 * from different projects never share a session even when interleaved in time.
 */
export function reconstructSessions(
  entries: readonly InvocationTelemetryEntry[],
  sessionGapMs: number,
): TelemetrySession[] {
  const byProject = new Map<string, InvocationTelemetryEntry[]>();
  for (const entry of entries) {
    const key = entry.projectId ?? "";
    const bucket = byProject.get(key);
    if (bucket === undefined) byProject.set(key, [entry]);
    else bucket.push(entry);
  }

  const sessions: TelemetrySession[] = [];
  for (const [key, bucket] of byProject) {
    const ordered = [...bucket].sort(
      (left, right) => parseTimestamp(left.timestamp) - parseTimestamp(right.timestamp),
    );
    let current: InvocationTelemetryEntry[] = [];
    let previousAt: number | undefined;
    for (const entry of ordered) {
      const at = parseTimestamp(entry.timestamp);
      if (previousAt !== undefined && at - previousAt > sessionGapMs) {
        sessions.push({ projectId: key === "" ? null : key, entries: current });
        current = [];
      }
      current.push(entry);
      previousAt = at;
    }
    if (current.length > 0) {
      sessions.push({ projectId: key === "" ? null : key, entries: current });
    }
  }
  return sessions;
}

/** Nearest-rank p95: the smallest observation at or above the 95th percentile. */
function p95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil(0.95 * sorted.length);
  return sorted[Math.max(0, rank - 1)] ?? 0;
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function buildToolStats(
  entries: readonly InvocationTelemetryEntry[],
  catalog: SurfaceProfileCatalog,
): ToolUsageStat[] {
  const durations = new Map<string, number[]>();
  const stats = new Map<string, ToolUsageStat>();
  const missing = new Map<string, Set<string>>();
  const rejected = new Map<string, Set<string>>();

  for (const entry of entries) {
    let stat = stats.get(entry.tool);
    if (stat === undefined) {
      stat = {
        tool: entry.tool,
        invocations: 0,
        okCount: 0,
        contractFailures: 0,
        runtimeFailures: 0,
        p95DurationMs: 0,
        writeIntents: { apply: 0, dryRun: 0, read: 0 },
        phases: [...(catalog[entry.tool]?.phases ?? ["unclassified"])],
        missingParams: [],
        rejectedParams: [],
      };
      stats.set(entry.tool, stat);
      durations.set(entry.tool, []);
      missing.set(entry.tool, new Set());
      rejected.set(entry.tool, new Set());
    }
    stat.invocations += 1;
    if (entry.outcome === "ok") stat.okCount += 1;
    if (entry.failureClass === "contract") stat.contractFailures += 1;
    if (entry.failureClass === "runtime") stat.runtimeFailures += 1;
    stat.writeIntents[entry.writeIntent] += 1;
    durations.get(entry.tool)?.push(entry.durationMs);
    for (const name of entry.missingParams) missing.get(entry.tool)?.add(name);
    for (const name of entry.rejectedParams) rejected.get(entry.tool)?.add(name);
  }

  for (const stat of stats.values()) {
    stat.p95DurationMs = p95(durations.get(stat.tool) ?? []);
    stat.missingParams = sortedUnique(missing.get(stat.tool) ?? []);
    stat.rejectedParams = sortedUnique(rejected.get(stat.tool) ?? []);
  }

  return [...stats.values()].sort(
    (left, right) => right.invocations - left.invocations || left.tool.localeCompare(right.tool),
  );
}

/**
 * Dependency closure. For each tool, the followers that appeared after it
 * inside the same session in at least `dependencyConfidence` of the sessions
 * where the tool ran. Co-occurrence below that bar is reported by omission,
 * not by a weaker edge — a profile decision needs the confident edges only.
 */
function buildDependencies(
  sessions: readonly TelemetrySession[],
  dependencyConfidence: number,
): ToolDependency[] {
  const sessionsWithTool = new Map<string, number>();
  const followerSessions = new Map<string, Map<string, number>>();

  for (const session of sessions) {
    const firstIndexByTool = new Map<string, number>();
    session.entries.forEach((entry, index) => {
      if (!firstIndexByTool.has(entry.tool)) firstIndexByTool.set(entry.tool, index);
    });
    for (const tool of firstIndexByTool.keys()) {
      sessionsWithTool.set(tool, (sessionsWithTool.get(tool) ?? 0) + 1);
    }
    for (const [tool, firstIndex] of firstIndexByTool) {
      const followers = followerSessions.get(tool) ?? new Map<string, number>();
      const counted = new Set<string>();
      for (let index = firstIndex + 1; index < session.entries.length; index += 1) {
        const follower = session.entries[index]?.tool;
        if (follower === undefined || follower === tool || counted.has(follower)) continue;
        counted.add(follower);
        followers.set(follower, (followers.get(follower) ?? 0) + 1);
      }
      followerSessions.set(tool, followers);
    }
  }

  const required = new Map<string, string[]>();
  for (const [tool, followers] of followerSessions) {
    const total = sessionsWithTool.get(tool) ?? 0;
    if (total === 0) continue;
    required.set(
      tool,
      [...followers.entries()]
        .filter(([, count]) => count / total >= dependencyConfidence)
        .map(([follower]) => follower)
        .sort(),
    );
  }

  const reachedFrom = new Map<string, string[]>();
  for (const [tool, followers] of required) {
    for (const follower of followers) {
      reachedFrom.set(follower, [...(reachedFrom.get(follower) ?? []), tool]);
    }
  }

  return [...sessionsWithTool.keys()].sort().map((tool) => ({
    tool,
    requiredFollowers: required.get(tool) ?? [],
    reachedFrom: sortedUnique(reachedFrom.get(tool) ?? []),
    sessionsObserved: sessionsWithTool.get(tool) ?? 0,
  }));
}

function buildReadProfile(
  stats: readonly ToolUsageStat[],
  catalog: SurfaceProfileCatalog,
): ReadProfileEligibility[] {
  return stats
    .map((stat) => {
      const readOnlyInPractice = stat.writeIntents.apply === 0 && stat.writeIntents.dryRun === 0;
      const declaredWriteCapable = catalog[stat.tool]?.writeCapable ?? false;
      return {
        tool: stat.tool,
        readOnlyInPractice,
        declaredWriteCapable,
        needsSeparateEligibilityMetadata: readOnlyInPractice && declaredWriteCapable,
      };
    })
    .sort((left, right) => left.tool.localeCompare(right.tool));
}

function buildAdequacy(
  entries: readonly InvocationTelemetryEntry[],
  stats: readonly ToolUsageStat[],
  catalog: SurfaceProfileCatalog,
  thresholds: SurfaceProfileThresholds,
): SampleAdequacy {
  const distinctProjects = new Set(
    entries.map((entry) => entry.projectId).filter((id): id is string => id !== null),
  ).size;

  const covered = new Set<SampledWorkflowPhase>();
  for (const stat of stats) {
    for (const phase of stat.phases) {
      if (phase !== "unclassified") covered.add(phase);
    }
  }
  const phasesMissing = SAMPLED_WORKFLOW_PHASES.filter((phase) => !covered.has(phase));
  const toolsMissingFromCatalog = stats
    .filter((stat) => catalog[stat.tool] === undefined)
    .map((stat) => stat.tool)
    .sort();

  const gaps: string[] = [];
  if (entries.length < thresholds.minimumInvocations) {
    gaps.push(
      `invocation volume ${entries.length} is below the agreed minimum ${thresholds.minimumInvocations}`,
    );
  }
  if (distinctProjects < thresholds.minimumProjects) {
    gaps.push(
      `distinct projects ${distinctProjects} is below the agreed minimum ${thresholds.minimumProjects}`,
    );
  }
  if (phasesMissing.length > 0) {
    gaps.push(`workflow phases with no observed invocation: ${phasesMissing.join(", ")}`);
  }
  if (toolsMissingFromCatalog.length > 0) {
    gaps.push(
      `tools observed but absent from the runtime catalog: ${toolsMissingFromCatalog.join(", ")}`,
    );
  }

  return {
    totalInvocations: entries.length,
    minimumInvocations: thresholds.minimumInvocations,
    distinctProjects,
    minimumProjects: thresholds.minimumProjects,
    phasesCovered: SAMPLED_WORKFLOW_PHASES.filter((phase) => covered.has(phase)),
    phasesMissing,
    toolsMissingFromCatalog,
    adequate: gaps.length === 0,
    gaps,
  };
}

export function buildSurfaceProfileEvidence(
  input: SurfaceProfileEvidenceInput,
): SurfaceProfileEvidence {
  const thresholds = { ...DEFAULT_SURFACE_PROFILE_THRESHOLDS, ...input.thresholds };
  const entries = input.entries;
  const sessions = reconstructSessions(entries, thresholds.sessionGapMs);
  const stats = buildToolStats(entries, input.catalog);

  const timestamps = entries
    .map((entry) => entry.timestamp)
    .filter((value) => parseTimestamp(value) > 0)
    .sort();

  return {
    window: {
      firstTimestamp: timestamps[0] ?? null,
      lastTimestamp: timestamps[timestamps.length - 1] ?? null,
      sessions: sessions.length,
    },
    tools: stats,
    dependencies: buildDependencies(sessions, thresholds.dependencyConfidence),
    readProfile: buildReadProfile(stats, input.catalog),
    adequacy: buildAdequacy(entries, stats, input.catalog, thresholds),
  };
}
