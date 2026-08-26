import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handleTelemetryEvidenceCommand } from "../../src/cli/commands/telemetry-evidence.js";
import type { InvocationTelemetryEntry } from "../../src/core/telemetry/invocation-telemetry.js";
import type { SchemaAdvertisementEntry } from "../../src/core/telemetry/schema-advertisement.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function invocation(overrides: Partial<InvocationTelemetryEntry> = {}): InvocationTelemetryEntry {
  return {
    timestamp: "2026-08-26T10:00:00.000Z",
    tool: "get_capabilities",
    action: "diagnostics",
    operationId: null,
    projectId: "alpha",
    outcome: "ok",
    failureClass: "none",
    errorCode: null,
    durationMs: 10,
    writeIntent: "read",
    paramNamesPresent: [],
    missingParams: [],
    rejectedParams: [],
    unknownToolName: null,
    ...overrides,
  };
}

function advertisement(
  overrides: Partial<SchemaAdvertisementEntry> = {},
): SchemaAdvertisementEntry {
  return {
    timestamp: "2026-08-26T10:00:00.000Z",
    surface: "tools/list",
    view: "compact",
    toolCount: 71,
    payloadBytes: 1000,
    repetition: 1,
    msSincePrevious: null,
    ...overrides,
  };
}

async function telemetryRoot(): Promise<{ root: string; runtime: string }> {
  const root = await mkdtemp(join(tmpdir(), "dysflow-telemetry-evidence-"));
  roots.push(root);
  const runtime = join(root, ".dysflow", "runtime");
  await mkdir(runtime, { recursive: true });
  return { root, runtime };
}

async function writeJsonl(path: string, entries: readonly unknown[]): Promise<void> {
  await writeFile(path, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
}

describe("telemetry-evidence CLI", () => {
  it("shows help without reading the telemetry directory", async () => {
    const result = await handleTelemetryEvidenceCommand(["--help"], {
      cwd: "Z:/path-that-does-not-exist",
    });

    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    expect(result.stdout).toContain("Usage: dysflow telemetry-evidence");
  });

  it("explains how to enable collection when no invocation stream exists", async () => {
    const { root, runtime } = await telemetryRoot();

    const result = await handleTelemetryEvidenceCommand([], { cwd: root });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(`No invocation telemetry found under ${runtime}`);
    expect(result.stderr).toContain("capabilities.invocationTelemetryEnabled");
  });

  it("combines valid rotated records and exposes caller thresholds as JSON", async () => {
    const { root, runtime } = await telemetryRoot();
    await writeFile(
      join(runtime, "invocations.jsonl"),
      `${JSON.stringify(invocation())}\nnot-json\n{}\n`,
      "utf8",
    );
    await writeJsonl(join(runtime, "invocations.jsonl.1"), [
      invocation({ projectId: "beta", tool: "query_execute" }),
    ]);
    await writeJsonl(join(runtime, "schema-advertisements.jsonl"), [advertisement()]);
    await writeFile(
      join(runtime, "schema-advertisements.jsonl.1"),
      `${JSON.stringify(advertisement({ repetition: 2, msSincePrevious: 500 }))}\n{"toolCount":"bad"}\n`,
      "utf8",
    );

    const result = await handleTelemetryEvidenceCommand(
      [
        "--json",
        "--cwd",
        root,
        "--min-invocations",
        "2",
        "--min-projects",
        "2",
        "--session-gap-minutes",
        "15",
        "--dependency-confidence",
        "0.75",
      ],
      { cwd: "Z:/ignored" },
    );

    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    const payload = JSON.parse(result.stdout) as {
      evidence: { adequacy: { totalInvocations: number; distinctProjects: number } };
      advertisements: { advertisements: number; repeatedPayloadBytes: number };
      thresholds: Record<string, number>;
    };
    expect(payload.evidence.adequacy).toMatchObject({ totalInvocations: 2, distinctProjects: 2 });
    expect(payload.advertisements).toMatchObject({ advertisements: 2, repeatedPayloadBytes: 1000 });
    expect(payload.thresholds).toMatchObject({
      minimumInvocations: 2,
      minimumProjects: 2,
      sessionGapMs: 15 * 60 * 1000,
      dependencyConfidence: 0.75,
    });
  });

  it("renders thin-window gaps and empty dependency guidance", async () => {
    const { root, runtime } = await telemetryRoot();
    await writeJsonl(join(runtime, "invocations.jsonl"), [invocation()]);

    const result = await handleTelemetryEvidenceCommand(
      ["--min-invocations", "not-a-number", "--min-projects"],
      { cwd: root },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("**No**");
    expect(result.stdout).toContain("Gaps that must close");
    expect(result.stdout).toContain("No confident dependency edges observed");
    expect(result.stdout).toContain("No write-capable tool was used read-only");
    expect(result.stdout).toContain("0 advertisements");
  });

  it("renders dependency closure and read-eligibility evidence from real sessions", async () => {
    const { root, runtime } = await telemetryRoot();
    await writeJsonl(join(runtime, "invocations.jsonl"), [
      invocation({ tool: "sync_binary", timestamp: "2026-08-26T10:00:00.000Z" }),
      invocation({ tool: "test_vba", timestamp: "2026-08-26T10:01:00.000Z" }),
      invocation({
        tool: "cleanup_access_operation",
        timestamp: "2026-08-26T10:02:00.000Z",
      }),
      invocation({ tool: "sync_binary", timestamp: "2026-08-26T12:00:00.000Z" }),
      invocation({ tool: "test_vba", timestamp: "2026-08-26T12:01:00.000Z" }),
      invocation({
        tool: "cleanup_access_operation",
        timestamp: "2026-08-26T12:02:00.000Z",
      }),
    ]);

    const result = await handleTelemetryEvidenceCommand(["--dependency-confidence", "1"], {
      cwd: root,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("| `sync_binary` |");
    expect(result.stdout).toContain("`test_vba`");
    expect(result.stdout).toContain("These tools are write-capable by declaration");
    expect(result.stdout).toContain("- `cleanup_access_operation`");
  });
});
