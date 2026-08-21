import { describe, expect, it } from "vitest";
import {
  createSchemaAdvertisementAccountant,
  type SchemaAdvertisementEntry,
  summarizeSchemaAdvertisements,
} from "../../../src/core/telemetry/schema-advertisement.js";

/**
 * Issue #1459 — the context-cost half of the surface-profile evidence.
 * Invocation telemetry says what an agent called; these records say what the
 * client was charged to be told the surface exists.
 */

function fixedClock(values: readonly number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}

describe("createSchemaAdvertisementAccountant", () => {
  it("numbers advertisements within the process and leaves the first without a cadence", () => {
    const accountant = createSchemaAdvertisementAccountant(fixedClock([1000, 4000, 4500]));
    const observation = {
      surface: "tools/list",
      view: "compact",
      toolCount: 3,
      payloadBytes: 120,
    } as const;

    const first = accountant.next(observation);
    const second = accountant.next(observation);
    const third = accountant.next(observation);

    expect(first.repetition).toBe(1);
    expect(first.msSincePrevious).toBeNull();
    expect(second.repetition).toBe(2);
    expect(second.msSincePrevious).toBe(3000);
    expect(third.msSincePrevious).toBe(500);
  });

  it("stamps the observation without carrying anything beyond names and counts", () => {
    const accountant = createSchemaAdvertisementAccountant(fixedClock([1_766_000_000_000]));

    const entry = accountant.next({
      surface: "tools/list",
      view: "compact",
      toolCount: 42,
      payloadBytes: 90_000,
    });

    expect(Object.keys(entry).sort()).toEqual([
      "msSincePrevious",
      "payloadBytes",
      "repetition",
      "surface",
      "timestamp",
      "toolCount",
      "view",
    ]);
    expect(entry.toolCount).toBe(42);
    expect(entry.payloadBytes).toBe(90_000);
  });

  it("never emits a negative count when a caller passes nonsense", () => {
    const accountant = createSchemaAdvertisementAccountant(fixedClock([0]));

    const entry = accountant.next({
      surface: "tools/list",
      view: "compact",
      toolCount: -5,
      payloadBytes: -1,
    });

    expect(entry.toolCount).toBe(0);
    expect(entry.payloadBytes).toBe(0);
  });
});

describe("summarizeSchemaAdvertisements", () => {
  function entry(overrides: Partial<SchemaAdvertisementEntry>): SchemaAdvertisementEntry {
    return {
      timestamp: "2026-08-21T10:00:00.000Z",
      surface: "tools/list",
      view: "compact",
      toolCount: 10,
      payloadBytes: 1000,
      repetition: 1,
      msSincePrevious: null,
      ...overrides,
    };
  }

  it("reports an empty window without inventing a cadence", () => {
    expect(summarizeSchemaAdvertisements([])).toEqual({
      advertisements: 0,
      totalPayloadBytes: 0,
      repeatedPayloadBytes: 0,
      maxToolCount: 0,
      medianIntervalMs: null,
    });
  });

  it("separates the re-injected cost from the unavoidable first advertisement", () => {
    const summary = summarizeSchemaAdvertisements([
      entry({ repetition: 1, payloadBytes: 1000 }),
      entry({ repetition: 2, payloadBytes: 1000, msSincePrevious: 5000 }),
      entry({ repetition: 3, payloadBytes: 1000, msSincePrevious: 7000 }),
    ]);

    expect(summary.advertisements).toBe(3);
    expect(summary.totalPayloadBytes).toBe(3000);
    // Only repetitions 2 and 3 are avoidable by a narrower profile.
    expect(summary.repeatedPayloadBytes).toBe(2000);
    expect(summary.medianIntervalMs).toBe(6000);
  });

  it("leaves the cadence null for a client that lists exactly once", () => {
    const summary = summarizeSchemaAdvertisements([entry({ repetition: 1 })]);

    expect(summary.repeatedPayloadBytes).toBe(0);
    expect(summary.medianIntervalMs).toBeNull();
  });

  it("reports the widest surface the client was ever shown", () => {
    const summary = summarizeSchemaAdvertisements([
      entry({ repetition: 1, toolCount: 10 }),
      entry({ repetition: 2, toolCount: 130, msSincePrevious: 100 }),
    ]);

    expect(summary.maxToolCount).toBe(130);
  });
});
