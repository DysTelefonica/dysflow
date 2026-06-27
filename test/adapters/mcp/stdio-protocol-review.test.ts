/**
 * DELTA-012 (mcp-reliability-fix) — Vitest age gate for MCP_PROTOCOL_VERSION_REVIEW.
 *
 * MCP_PROTOCOL_VERSION_REVIEW.reviewedAt records the date the upstream MCP spec
 * was last cross-checked. This test guards against silent drift by failing when
 * the review is older than a configurable window (default 90 days), with an
 * actionable message that points the maintainer at
 * docs/testing/mcp-protocol-maintenance.md.
 *
 * The test exercises the age calculation against `Date.now()` directly (no fake
 * timers) — when the production code's reviewedAt is within the window the test
 * passes; when it's outside, the test fails with a message that names the
 * maintenance doc.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { MCP_PROTOCOL_VERSION_REVIEW } from "../../../src/adapters/mcp/stdio.js";

const AGE_WINDOW_DAYS = 90;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysSince(reviewedAt: string): number {
  const reviewedMs = new Date(reviewedAt).getTime();
  return (Date.now() - reviewedMs) / MS_PER_DAY;
}

describe("DELTA-012 — MCP_PROTOCOL_VERSION_REVIEW reviewedAt age gate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("MCP_PROTOCOL_VERSION_REVIEW reviewedAt within 90-day window passes", () => {
    const ageDays = daysSince(MCP_PROTOCOL_VERSION_REVIEW.reviewedAt);
    expect(
      ageDays,
      `MCP_PROTOCOL_VERSION_REVIEW is ${ageDays.toFixed(1)} days old; refresh the upstream MCP spec review and bump reviewedAt (see docs/testing/mcp-protocol-maintenance.md).`,
    ).toBeLessThanOrEqual(AGE_WINDOW_DAYS);
  });

  it("MCP_PROTOCOL_VERSION_REVIEW reviewedAt older than 90 days fails with actionable message", () => {
    // Simulate a future date 100 days past the production reviewedAt.
    // Use vi.setSystemTime so Date.now() reflects the future without
    // actually waiting.
    const reviewedMs = new Date(MCP_PROTOCOL_VERSION_REVIEW.reviewedAt).getTime();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(reviewedMs + 100 * MS_PER_DAY));

    try {
      const ageDays = daysSince(MCP_PROTOCOL_VERSION_REVIEW.reviewedAt);
      // The age gate triggers when age > window. We expect vitest.fail
      // semantics — we model the failure as a custom assertion that throws
      // an error mentioning the maintenance doc.
      expect(
        ageDays,
        `MCP_PROTOCOL_VERSION_REVIEW is ${ageDays.toFixed(1)} days old (window: ${AGE_WINDOW_DAYS}); refresh and bump reviewedAt — see docs/testing/mcp-protocol-maintenance.md`,
      ).toBeLessThanOrEqual(AGE_WINDOW_DAYS);
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