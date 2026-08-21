/**
 * Issue #1459 — `dysflow telemetry-evidence`.
 *
 * Turns a collected telemetry window into the report the #1215 reopening gate
 * asks for. Read-only: it reads the project-local JSONL streams, runs the pure
 * analyzer, and prints. It never writes telemetry, never opens Access, and
 * never touches project config.
 *
 * The command deliberately refuses to recommend reopening on its own. It
 * reports whether the window is representative against the thresholds the
 * maintainers approved, and the maintainer makes the call.
 */
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildSurfaceProfileCatalog } from "../../adapters/mcp/surface-profile-catalog.js";
import type { InvocationTelemetryEntry } from "../../core/telemetry/invocation-telemetry.js";
import {
  type SchemaAdvertisementEntry,
  type SchemaAdvertisementSummary,
  summarizeSchemaAdvertisements,
} from "../../core/telemetry/schema-advertisement.js";
import {
  buildSurfaceProfileEvidence,
  DEFAULT_SURFACE_PROFILE_THRESHOLDS,
  type SurfaceProfileEvidence,
  type SurfaceProfileThresholds,
} from "../../core/telemetry/surface-profile-evidence.js";
import type { CliCommandContext, CliResult } from "./types.js";

const USAGE = [
  "Usage: dysflow telemetry-evidence [options]",
  "",
  "Analyze a collected invocation-telemetry window for the #1215 surface-profile gate.",
  "",
  "Options:",
  "  --cwd <path>                  Project root to read telemetry from (default: process cwd)",
  "  --json                        Emit the raw evidence object instead of the Markdown report",
  "  --min-invocations <n>         Minimum invocations for a representative window",
  "  --min-projects <n>            Minimum distinct projects for a representative window",
  "  --session-gap-minutes <n>     Inactivity gap that ends a session (default: 30)",
  "  --dependency-confidence <n>   Fraction of sessions a follower must appear in (0-1)",
  "  --help, -h                    Show this message",
].join("\n");

/** Rotated generations written alongside the live sink by the JSONL recorder. */
const ROTATION_SUFFIXES = ["", ".1", ".2", ".3"];

function numericFlag(args: readonly string[], flag: string): number | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const raw = args[index + 1];
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringFlag(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

/**
 * Read one JSONL stream and its rotated generations. A malformed line is
 * skipped rather than fatal: telemetry is append-only evidence, and one torn
 * write at a rotation boundary must not discard the whole window.
 */
async function readJsonlStream<TEntry>(
  runtimePath: string,
  fileName: string,
  isEntry: (value: unknown) => value is TEntry,
): Promise<TEntry[]> {
  const entries: TEntry[] = [];
  for (const suffix of ROTATION_SUFFIXES) {
    let raw: string;
    try {
      raw = await readFile(join(runtimePath, `${fileName}${suffix}`), "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      if (line.trim().length === 0) continue;
      try {
        const parsed: unknown = JSON.parse(line);
        if (isEntry(parsed)) entries.push(parsed);
      } catch {
        // torn or partially flushed line — skip it
      }
    }
  }
  return entries;
}

function isInvocationEntry(value: unknown): value is InvocationTelemetryEntry {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.timestamp === "string" &&
    typeof candidate.tool === "string" &&
    typeof candidate.durationMs === "number" &&
    Array.isArray(candidate.missingParams) &&
    Array.isArray(candidate.rejectedParams)
  );
}

function isAdvertisementEntry(value: unknown): value is SchemaAdvertisementEntry {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.timestamp === "string" &&
    typeof candidate.toolCount === "number" &&
    typeof candidate.payloadBytes === "number" &&
    typeof candidate.repetition === "number"
  );
}

function renderMarkdown(
  evidence: SurfaceProfileEvidence,
  advertisements: SchemaAdvertisementSummary,
  thresholds: SurfaceProfileThresholds,
): string {
  const lines: string[] = [];
  lines.push("# MCP surface-profile evidence (#1459)");
  lines.push("");
  lines.push(
    `Window: ${evidence.window.firstTimestamp ?? "n/a"} → ${evidence.window.lastTimestamp ?? "n/a"} (${evidence.window.sessions} reconstructed sessions).`,
  );
  lines.push("");

  lines.push("## Is this window representative?");
  lines.push("");
  lines.push(
    `**${evidence.adequacy.adequate ? "Yes" : "No"}** — ${evidence.adequacy.totalInvocations} invocations across ${evidence.adequacy.distinctProjects} projects (agreed minimums: ${thresholds.minimumInvocations} / ${thresholds.minimumProjects}).`,
  );
  lines.push("");
  if (evidence.adequacy.gaps.length > 0) {
    lines.push("Gaps that must close before the gate can be reopened:");
    lines.push("");
    for (const gap of evidence.adequacy.gaps) lines.push(`- ${gap}`);
    lines.push("");
  }
  lines.push(
    `Phases covered: ${evidence.adequacy.phasesCovered.join(", ") || "none"}. Missing: ${evidence.adequacy.phasesMissing.join(", ") || "none"}.`,
  );
  lines.push("");

  lines.push("## Context accounting");
  lines.push("");
  lines.push(
    `${advertisements.advertisements} advertisements, ${advertisements.totalPayloadBytes} bytes total, ${advertisements.repeatedPayloadBytes} of them re-injected after the first. Widest surface advertised: ${advertisements.maxToolCount} tools. Median gap between advertisements: ${advertisements.medianIntervalMs ?? "n/a"} ms.`,
  );
  lines.push("");
  lines.push(
    "A profile only pays for itself against the re-injected bytes. A client that lists once has nothing to gain from one.",
  );
  lines.push("");

  lines.push("## Tools a profile cannot hide");
  lines.push("");
  const dependencies = evidence.dependencies.filter(
    (item) => item.requiredFollowers.length > 0 || item.reachedFrom.length > 0,
  );
  if (dependencies.length === 0) {
    lines.push("No confident dependency edges observed in this window.");
  } else {
    lines.push("| Tool | Sessions | Required followers | Reached from |");
    lines.push("|---|---|---|---|");
    for (const item of dependencies) {
      lines.push(
        `| \`${item.tool}\` | ${item.sessionsObserved} | ${item.requiredFollowers.map((name) => `\`${name}\``).join(", ") || "—"} | ${item.reachedFrom.map((name) => `\`${name}\``).join(", ") || "—"} |`,
      );
    }
  }
  lines.push("");

  lines.push("## Read profile — eligibility beyond declared access");
  lines.push("");
  const needsMetadata = evidence.readProfile.filter(
    (item) => item.needsSeparateEligibilityMetadata,
  );
  if (needsMetadata.length === 0) {
    lines.push(
      "No write-capable tool was used read-only in this window, so declared access alone would be sufficient for a `read` profile.",
    );
  } else {
    lines.push(
      "These tools are write-capable by declaration but were only ever read from. A `read` profile keyed on declared access alone would drop their read branch:",
    );
    lines.push("");
    for (const item of needsMetadata) lines.push(`- \`${item.tool}\``);
  }
  lines.push("");

  lines.push("## Per-tool usage");
  lines.push("");
  lines.push("| Tool | Calls | OK | Contract fail | Runtime fail | p95 ms | Phases |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const stat of evidence.tools) {
    lines.push(
      `| \`${stat.tool}\` | ${stat.invocations} | ${stat.okCount} | ${stat.contractFailures} | ${stat.runtimeFailures} | ${stat.p95DurationMs} | ${stat.phases.join(", ")} |`,
    );
  }
  lines.push("");

  return lines.join("\n");
}

export async function handleTelemetryEvidenceCommand(
  args: readonly string[],
  context: CliCommandContext = {},
): Promise<CliResult> {
  if (args.includes("--help") || args.includes("-h")) {
    return { exitCode: 0, stdout: USAGE, stderr: "" };
  }

  const cwd = resolve(stringFlag(args, "--cwd") ?? context.cwd ?? process.cwd());
  const runtimePath = join(cwd, ".dysflow", "runtime");

  const sessionGapMinutes = numericFlag(args, "--session-gap-minutes");
  const thresholds: SurfaceProfileThresholds = {
    ...DEFAULT_SURFACE_PROFILE_THRESHOLDS,
    ...(numericFlag(args, "--min-invocations") === undefined
      ? {}
      : { minimumInvocations: numericFlag(args, "--min-invocations") as number }),
    ...(numericFlag(args, "--min-projects") === undefined
      ? {}
      : { minimumProjects: numericFlag(args, "--min-projects") as number }),
    ...(sessionGapMinutes === undefined ? {} : { sessionGapMs: sessionGapMinutes * 60 * 1000 }),
    ...(numericFlag(args, "--dependency-confidence") === undefined
      ? {}
      : { dependencyConfidence: numericFlag(args, "--dependency-confidence") as number }),
  };

  const [entries, advertisementEntries] = await Promise.all([
    readJsonlStream<InvocationTelemetryEntry>(runtimePath, "invocations.jsonl", isInvocationEntry),
    readJsonlStream<SchemaAdvertisementEntry>(
      runtimePath,
      "schema-advertisements.jsonl",
      isAdvertisementEntry,
    ),
  ]);

  if (entries.length === 0) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: [
        `No invocation telemetry found under ${runtimePath}.`,
        "Collection has not started, or this project disabled it via capabilities.invocationTelemetryEnabled.",
      ].join("\n"),
    };
  }

  const evidence = buildSurfaceProfileEvidence({
    entries,
    catalog: buildSurfaceProfileCatalog(),
    thresholds,
  });
  const advertisements = summarizeSchemaAdvertisements(advertisementEntries);

  const stdout = args.includes("--json")
    ? JSON.stringify({ evidence, advertisements, thresholds }, null, 2)
    : renderMarkdown(evidence, advertisements, thresholds);

  return { exitCode: 0, stdout, stderr: "" };
}
