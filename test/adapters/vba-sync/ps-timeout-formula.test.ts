import { describe, expect, it } from "vitest";
import {
  derivePsTimeoutMs,
  MIN_PS_TIMEOUT_MS,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";

describe("derivePsTimeoutMs", () => {
  it("returns effectiveTimeoutMs minus preflightElapsedMs when result is >= MIN_PS_TIMEOUT_MS", () => {
    // effectiveTimeoutMs = 30000, preflightElapsedMs = 1000
    // max(5000, 30000 - 1000) = max(5000, 29000) = 29000
    const result = derivePsTimeoutMs(30_000, 1_000);
    expect(result).toBe(29_000);
  });

  it("returns MIN_PS_TIMEOUT_MS when effectiveTimeoutMs is absurdly small", () => {
    // effectiveTimeoutMs = 3000, preflightElapsedMs = 0
    //3000 is NOT< ABSURDLY_SMALL_TIMEOUT_MS (1000), so we proceed
    // max(5000, 3000 - 0) = max(5000, 3000) = 5000
    const result = derivePsTimeoutMs(3_000, 0);
    expect(result).toBe(5_000);
  });

  it("returns MIN_PS_TIMEOUT_MS when preflightElapsedMs exceeds effectiveTimeoutMs", () => {
    // effectiveTimeoutMs = 30000, preflightElapsedMs = 60000
    // max(5000, 30000 - 60000) = max(5000, -30000) = 5000
    const result = derivePsTimeoutMs(30_000, 60_000);
    expect(result).toBe(5_000);
  });

  it("returns effectiveTimeoutMs minus preflightElapsedMs when no preflight elapsed", () => {
    // effectiveTimeoutMs = 30000, preflightElapsedMs = 0
    // max(5000, 30000 - 0) = max(5000, 30000) = 30000
    const result = derivePsTimeoutMs(30_000, 0);
    expect(result).toBe(30_000);
  });

  it("MIN_PS_TIMEOUT_MS is exported and equals 5000", () => {
    expect(MIN_PS_TIMEOUT_MS).toBe(5_000);
  });
});
