import { describe, expect, it } from "vitest";
import {
  derivePsTimeoutMs,
  MIN_PS_TIMEOUT_MS,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";

describe("derivePsTimeoutMs", () => {
  it("floor applies when effectiveTimeoutMs is way over wall-clock budget", () => {
    // preflightElapsedMs = 1000, effectiveTimeoutMs = 30000
    // min(5000, 30000) = 5000
    // min(30000, 25000) - 1000 = 24000
    // max(5000, 24000) = 24000
    const result = derivePsTimeoutMs(30_000, 1_000);
    expect(result).toBe(24_000);
  });

  it("5-second floor is the minimum when preflight consumed less than budget", () => {
    // preflightElapsedMs = 0, effectiveTimeoutMs = 3000 (below floor)
    // min(5000, 3000) = 3000
    // min(3000, 25000) - 0 = 3000
    // max(3000, 3000) = 3000
    const result = derivePsTimeoutMs(3_000, 0);
    expect(result).toBe(3_000);
  });

  it("floor of 5000 is returned when preflight already consumed the entire budget", () => {
    // preflightElapsedMs = 60000 (more than wall-clock budget 25000)
    // effectiveTimeoutMs = 30000
    // min(5000, 30000) = 5000
    // min(30000, 25000) - 60000 = 25000 - 60000 = -35000
    // max(5000, -35000) = 5000
    const result = derivePsTimeoutMs(30_000, 60_000);
    expect(result).toBe(5_000);
  });

  it("no preflight elapsed: floor of 5000 applies when effectiveTimeoutMs exceeds both floor and budget", () => {
    // preflightElapsedMs = 0, effectiveTimeoutMs = 30000
    // min(5000, 30000) = 5000
    // min(30000, 25000) - 0 = 25000
    // max(5000, 25000) = 25000
    const result = derivePsTimeoutMs(30_000, 0);
    expect(result).toBe(25_000);
  });

  it("MIN_PS_TIMEOUT_MS is exported and equals 5000", () => {
    expect(MIN_PS_TIMEOUT_MS).toBe(5_000);
  });
});
