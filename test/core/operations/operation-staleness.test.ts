import { describe, expect, it } from "vitest";
import {
  type AccessOperationRecord,
  DEFAULT_STALE_OPERATION_MS,
  InMemoryAccessOperationRegistry,
  isStaleAccessOperation,
  listRecentAccessOperations,
} from "../../../src/core/operations/access-operation-registry.js";

const NOW = Date.parse("2026-06-15T12:00:00.000Z");
const IDLE_AT = "2026-06-15T10:30:00.000Z"; // 90 min earlier (> 1h default)
const RECENT_AT = "2026-06-15T11:59:30.000Z"; // 30s earlier
const THRESHOLD = DEFAULT_STALE_OPERATION_MS;

const base = {
  action: "vba" as const,
  accessPath: "C:/projA/NoConformidades.accdb",
  metadata: {},
};

const record = (overrides: Partial<AccessOperationRecord>): AccessOperationRecord => ({
  ...base,
  operationId: "op",
  accessPid: null,
  processStartTime: null,
  status: "failed",
  updatedAt: IDLE_AT,
  ...overrides,
});

describe("isStaleAccessOperation", () => {
  it("is true for a failed, unattributed (null PID) op idle past the threshold", () => {
    expect(isStaleAccessOperation(record({ status: "failed" }), NOW, THRESHOLD)).toBe(true);
  });

  it("is true for timed_out / pid_unknown / cleanup_pending unattributed idle ops", () => {
    for (const status of ["timed_out", "pid_unknown", "cleanup_pending"] as const) {
      expect(isStaleAccessOperation(record({ status }), NOW, THRESHOLD)).toBe(true);
    }
  });

  it("is false when the op is recent (within the threshold)", () => {
    expect(isStaleAccessOperation(record({ updatedAt: RECENT_AT }), NOW, THRESHOLD)).toBe(false);
  });

  it("is false when a PID is recorded (ownership exists)", () => {
    expect(isStaleAccessOperation(record({ accessPid: 4321 }), NOW, THRESHOLD)).toBe(false);
  });

  it("is false for an active/running op", () => {
    expect(isStaleAccessOperation(record({ status: "running" }), NOW, THRESHOLD)).toBe(false);
  });

  it("is true for an interrupted starting op (composes isInterruptedStartingRecord)", () => {
    expect(isStaleAccessOperation(record({ status: "starting" }), NOW, THRESHOLD)).toBe(true);
  });

  it("is false when updatedAt is not parseable", () => {
    expect(isStaleAccessOperation(record({ updatedAt: "not-a-date" }), NOW, THRESHOLD)).toBe(false);
  });
});

describe("listRecentAccessOperations marks staleness", () => {
  it("annotates each entry with isStale using an injected nowMs", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create(
      record({ operationId: "op-stale", status: "failed", updatedAt: IDLE_AT }),
    );
    await registry.create(
      record({
        operationId: "op-active",
        status: "running",
        accessPid: 999,
        updatedAt: RECENT_AT,
      }),
    );

    const entries = await listRecentAccessOperations(registry, { nowMs: NOW });

    const byId = new Map(entries.map((e) => [e.operationId, e]));
    expect(byId.get("op-stale")?.isStale).toBe(true);
    expect(byId.get("op-active")?.isStale).toBe(false);
  });
});
