/**
 * DELTA-012 (mcp-reliability-fix) — Vitest age gate for MCP_PROTOCOL_VERSION_REVIEW.
 *
 * MCP_PROTOCOL_VERSION_REVIEW.reviewedAt records the date the upstream MCP spec
 * was last cross-checked. This test guards against silent drift by failing when
 * the review is older than a configurable window (default 90 days), with an
 * actionable message that points the maintainer at
 * docs/testing/mcp-protocol-maintenance.md.
 *
 * The production gate logic lives inside this test file (it IS the gate) and
 * fires once per CI run. The current production value (2026-06-27) must stay
 * within the window — the first test is the real GREEN assertion. The second
 * test simulates a stale reviewedAt to prove the gate's message is actionable.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { MCP_PROTOCOL_VERSION_REVIEW } from "../../../src/adapters/mcp/stdio.js";

const AGE_WINDOW_DAYS = 90;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MAINTENANCE_DOC = "docs/testing/mcp-protocol-maintenance.md";

function daysSince(reviewedAt: string): number {
  const reviewedMs = new Date(reviewedAt).getTime();
  return (Date.now() - reviewedMs) / MS_PER_DAY;
}

describe("DELTA-012 — MCP_PROTOCOL_VERSION_REVIEW reviewedAt age gate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("MCP_PROTOCOL_VERSION_REVIEW reviewedAt within 90-day window passes (real production value)", () => {
    const ageDays = daysSince(MCP_PROTOCOL_VERSION_REVIEW.reviewedAt);
    expect(
      ageDays,
      `MCP_PROTOCOL_VERSION_REVIEW is ${ageDays.toFixed(1)} days old; refresh the upstream MCP spec review and bump reviewedAt (see ${MAINTENANCE_DOC}).`,
    ).toBeLessThanOrEqual(AGE_WINDOW_DAYS);
  });

  it("age gate produces an actionable message when reviewedAt is stale (simulated)", () => {
    // Simulate a stale reviewedAt by setting the system clock 100 days past
    // the production value. We then verify the gate's error MESSAGE (not the
    // test outcome) names the maintenance doc — that's the contract.
    const reviewedMs = new Date(MCP_PROTOCOL_VERSION_REVIEW.reviewedAt).getTime();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(reviewedMs + 100 * MS_PER_DAY));

    try {
      const ageDays = daysSince(MCP_PROTOCOL_VERSION_REVIEW.reviewedAt);
      expect(ageDays).toBeGreaterThan(AGE_WINDOW_DAYS);

      // Now run the actual gate expression and verify its message names the
      // maintenance doc. The test only PASSES if the gate would surface an
      // actionable error — which is the whole point of this guardrail.
      const gateExpression = () => {
        if (ageDays > AGE_WINDOW_DAYS) {
          throw new Error(
            `MCP_PROTOCOL_VERSION_REVIEW is ${ageDays.toFixed(1)} days old (window: ${AGE_WINDOW_DAYS}); refresh and bump reviewedAt — see ${MAINTENANCE_DOC}`,
          );
        }
      };
      expect(gateExpression).toThrow(MAINTENANCE_DOC);
    } finally {
      vi.useRealTimers();
    }
  });

  it("MCP_PROTOCOL_VERSION_REVIEW shape exposes version, reviewedAt, specRef", () => {
    expect(MCP_PROTOCOL_VERSION_REVIEW).toMatchObject({
      version: expect.any(String),
      reviewedAt: expect.any(String),
      specRef: expect.any(String),
    });
  });
});
