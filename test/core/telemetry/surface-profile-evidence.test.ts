import { describe, expect, it } from "vitest";
import type { InvocationTelemetryEntry } from "../../../src/core/telemetry/invocation-telemetry.js";
import {
  buildSurfaceProfileEvidence,
  reconstructSessions,
  type SurfaceProfileCatalog,
} from "../../../src/core/telemetry/surface-profile-evidence.js";

/**
 * Issue #1459 — the evidence analysis behind the #1215 reopening gate.
 *
 * These tests exercise the analyzer through its single public entry point and
 * assert only what a maintainer reading the report would act on: which tools a
 * profile cannot hide, which tools need eligibility metadata separate from
 * declared write access, and whether the collected window is representative
 * enough to decide at all.
 */

const MINUTE = 60 * 1000;

function entry(overrides: Partial<InvocationTelemetryEntry> = {}): InvocationTelemetryEntry {
  return {
    timestamp: "2026-08-21T10:00:00.000Z",
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

function at(minutesFromStart: number): string {
  return new Date(Date.parse("2026-08-21T10:00:00.000Z") + minutesFromStart * MINUTE).toISOString();
}

const catalog: SurfaceProfileCatalog = {
  get_capabilities: { phases: ["bootstrap"], writeCapable: false },
  sync_binary: { phases: ["sync"], writeCapable: true },
  test_vba: { phases: ["tests"], writeCapable: true },
  query_sql: { phases: ["sql"], writeCapable: false },
  analyze_form_ui: { phases: ["forms"], writeCapable: false },
  cleanup_access_operation: { phases: ["recovery"], writeCapable: true },
};

describe("reconstructSessions", () => {
  it("splits one project's stream on an inactivity gap", () => {
    const sessions = reconstructSessions(
      [
        entry({ timestamp: at(0) }),
        entry({ timestamp: at(5) }),
        entry({ timestamp: at(90) }),
        entry({ timestamp: at(92) }),
      ],
      30 * MINUTE,
    );

    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.entries).toHaveLength(2);
    expect(sessions[1]?.entries).toHaveLength(2);
  });

  it("never merges two projects into one session even when they interleave", () => {
    const sessions = reconstructSessions(
      [
        entry({ timestamp: at(0), projectId: "alpha" }),
        entry({ timestamp: at(1), projectId: "beta" }),
        entry({ timestamp: at(2), projectId: "alpha" }),
      ],
      30 * MINUTE,
    );

    expect(sessions).toHaveLength(2);
    expect(sessions.map((session) => session.projectId).sort()).toEqual(["alpha", "beta"]);
  });
});

describe("buildSurfaceProfileEvidence — dependency closure", () => {
  it("reports a follower that consistently trails a tool, and omits an occasional one", () => {
    // sync_binary is followed by test_vba in all three sessions; query_sql
    // trails it only once, which is co-occurrence, not a dependency.
    const entries: InvocationTelemetryEntry[] = [];
    for (let session = 0; session < 3; session += 1) {
      const base = session * 120;
      entries.push(entry({ tool: "sync_binary", timestamp: at(base), writeIntent: "apply" }));
      entries.push(entry({ tool: "test_vba", timestamp: at(base + 1), writeIntent: "apply" }));
      if (session === 0) {
        entries.push(entry({ tool: "query_sql", timestamp: at(base + 2) }));
      }
    }

    const evidence = buildSurfaceProfileEvidence({ entries, catalog });
    const sync = evidence.dependencies.find((item) => item.tool === "sync_binary");

    expect(sync?.requiredFollowers).toEqual(["test_vba"]);
    expect(sync?.sessionsObserved).toBe(3);
  });

  it("records the inbound closure so a hidden predecessor is visible from the follower", () => {
    const entries: InvocationTelemetryEntry[] = [];
    for (let session = 0; session < 2; session += 1) {
      const base = session * 120;
      entries.push(entry({ tool: "analyze_form_ui", timestamp: at(base) }));
      entries.push(entry({ tool: "query_sql", timestamp: at(base + 1) }));
    }

    const evidence = buildSurfaceProfileEvidence({ entries, catalog });

    expect(evidence.dependencies.find((item) => item.tool === "query_sql")?.reachedFrom).toContain(
      "analyze_form_ui",
    );
  });
});

describe("buildSurfaceProfileEvidence — read profile eligibility", () => {
  it("flags a write-capable tool that was only ever read from", () => {
    const evidence = buildSurfaceProfileEvidence({
      entries: [entry({ tool: "cleanup_access_operation", writeIntent: "read" })],
      catalog,
    });

    const eligibility = evidence.readProfile.find(
      (item) => item.tool === "cleanup_access_operation",
    );
    expect(eligibility?.readOnlyInPractice).toBe(true);
    expect(eligibility?.declaredWriteCapable).toBe(true);
    expect(eligibility?.needsSeparateEligibilityMetadata).toBe(true);
  });

  it("does not flag a tool that actually applied a write", () => {
    const evidence = buildSurfaceProfileEvidence({
      entries: [
        entry({ tool: "cleanup_access_operation", writeIntent: "read" }),
        entry({ tool: "cleanup_access_operation", writeIntent: "apply" }),
      ],
      catalog,
    });

    expect(
      evidence.readProfile.find((item) => item.tool === "cleanup_access_operation")
        ?.needsSeparateEligibilityMetadata,
    ).toBe(false);
  });

  it("does not flag a read-only tool — it needs no metadata beyond declared access", () => {
    const evidence = buildSurfaceProfileEvidence({
      entries: [entry({ tool: "query_sql", writeIntent: "read" })],
      catalog,
    });

    expect(
      evidence.readProfile.find((item) => item.tool === "query_sql")
        ?.needsSeparateEligibilityMetadata,
    ).toBe(false);
  });
});

describe("buildSurfaceProfileEvidence — per-tool statistics", () => {
  it("separates contract failures from runtime failures", () => {
    const evidence = buildSurfaceProfileEvidence({
      entries: [
        entry({ tool: "test_vba", outcome: "error", failureClass: "contract" }),
        entry({ tool: "test_vba", outcome: "error", failureClass: "runtime" }),
        entry({ tool: "test_vba", outcome: "error", failureClass: "runtime" }),
        entry({ tool: "test_vba" }),
      ],
      catalog,
    });

    const stat = evidence.tools.find((item) => item.tool === "test_vba");
    expect(stat?.invocations).toBe(4);
    expect(stat?.okCount).toBe(1);
    expect(stat?.contractFailures).toBe(1);
    expect(stat?.runtimeFailures).toBe(2);
  });

  it("reports p95 duration by nearest rank", () => {
    const entries = Array.from({ length: 20 }, (_unused, index) =>
      entry({ tool: "query_sql", durationMs: (index + 1) * 10 }),
    );

    const evidence = buildSurfaceProfileEvidence({ entries, catalog });

    // 20 observations, ceil(0.95 * 20) = 19 → the 19th smallest is 190ms.
    expect(evidence.tools.find((item) => item.tool === "query_sql")?.p95DurationMs).toBe(190);
  });

  it("collects the parameter names callers omitted or that were rejected", () => {
    const evidence = buildSurfaceProfileEvidence({
      entries: [
        entry({ tool: "test_vba", missingParams: ["testsPath"], rejectedParams: ["compile"] }),
        entry({ tool: "test_vba", missingParams: ["testsPath"] }),
      ],
      catalog,
    });

    const stat = evidence.tools.find((item) => item.tool === "test_vba");
    expect(stat?.missingParams).toEqual(["testsPath"]);
    expect(stat?.rejectedParams).toEqual(["compile"]);
  });
});

describe("buildSurfaceProfileEvidence — sample adequacy", () => {
  it("refuses to call a thin window representative and names every gap", () => {
    const evidence = buildSurfaceProfileEvidence({
      entries: [entry({ tool: "get_capabilities" })],
      catalog,
    });

    expect(evidence.adequacy.adequate).toBe(false);
    expect(evidence.adequacy.gaps.join(" ")).toContain("invocation volume");
    expect(evidence.adequacy.gaps.join(" ")).toContain("distinct projects");
    expect(evidence.adequacy.phasesMissing).toEqual(["sync", "tests", "sql", "forms", "recovery"]);
  });

  it("names a tool the runtime catalog does not classify instead of guessing its phase", () => {
    const evidence = buildSurfaceProfileEvidence({
      entries: [entry({ tool: "brand_new_tool" })],
      catalog,
    });

    expect(evidence.adequacy.toolsMissingFromCatalog).toEqual(["brand_new_tool"]);
    expect(evidence.tools.find((item) => item.tool === "brand_new_tool")?.phases).toEqual([
      "unclassified",
    ]);
  });

  it("calls the window adequate once volume, projects, and every phase are covered", () => {
    const tools = Object.keys(catalog);
    const projects = ["alpha", "beta", "gamma"];
    const entries: InvocationTelemetryEntry[] = [];
    for (let index = 0; index < 2400; index += 1) {
      entries.push(
        entry({
          tool: tools[index % tools.length] as string,
          projectId: projects[index % projects.length] as string,
          timestamp: at(index),
        }),
      );
    }

    const evidence = buildSurfaceProfileEvidence({ entries, catalog });

    expect(evidence.adequacy.gaps).toEqual([]);
    expect(evidence.adequacy.adequate).toBe(true);
    expect(evidence.adequacy.phasesMissing).toEqual([]);
    expect(evidence.adequacy.distinctProjects).toBe(3);
  });

  it("honors caller-supplied thresholds so the approved protocol drives the verdict", () => {
    const evidence = buildSurfaceProfileEvidence({
      entries: [
        entry({ tool: "get_capabilities" }),
        entry({ tool: "sync_binary" }),
        entry({ tool: "test_vba" }),
        entry({ tool: "query_sql" }),
        entry({ tool: "analyze_form_ui" }),
        entry({ tool: "cleanup_access_operation" }),
      ],
      catalog,
      thresholds: { minimumInvocations: 6, minimumProjects: 1 },
    });

    expect(evidence.adequacy.adequate).toBe(true);
  });
});
