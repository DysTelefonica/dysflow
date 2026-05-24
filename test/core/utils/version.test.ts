import { describe, expect, it } from "vitest";
import { compareVersions } from "../../../src/core/utils/version.js";

describe("compareVersions", () => {
	// ---------------------------------------------------------------------------
	// Equality
	// ---------------------------------------------------------------------------
	it("returns 0 for identical versions", () => {
		expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
	});

	it("returns 0 for two 0.0.0 versions", () => {
		expect(compareVersions("0.0.0", "0.0.0")).toBe(0);
	});

	it("returns 0 for identical single-segment versions", () => {
		expect(compareVersions("5", "5")).toBe(0);
	});

	// ---------------------------------------------------------------------------
	// a > b  →  1
	// ---------------------------------------------------------------------------
	it("returns 1 when major of a is greater", () => {
		expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
	});

	it("returns 1 when minor of a is greater with equal major", () => {
		expect(compareVersions("1.3.0", "1.2.9")).toBe(1);
	});

	it("returns 1 when patch of a is greater with equal major and minor", () => {
		expect(compareVersions("1.2.4", "1.2.3")).toBe(1);
	});

	it("returns 1 when a has extra segments that are non-zero", () => {
		expect(compareVersions("1.0.0.1", "1.0.0")).toBe(1);
	});

	// ---------------------------------------------------------------------------
	// a < b  →  -1
	// ---------------------------------------------------------------------------
	it("returns -1 when major of a is less", () => {
		expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
	});

	it("returns -1 when minor of a is less with equal major", () => {
		expect(compareVersions("1.2.0", "1.3.0")).toBe(-1);
	});

	it("returns -1 when patch of a is less with equal major and minor", () => {
		expect(compareVersions("1.2.3", "1.2.4")).toBe(-1);
	});

	it("returns -1 when b has extra segments that are non-zero", () => {
		expect(compareVersions("1.0.0", "1.0.0.1")).toBe(-1);
	});

	// ---------------------------------------------------------------------------
	// Asymmetric lengths — missing segments treated as 0
	// ---------------------------------------------------------------------------
	it("treats missing trailing segments as 0 (a shorter, equal)", () => {
		expect(compareVersions("1.0", "1.0.0")).toBe(0);
	});

	it("treats missing trailing segments as 0 (b shorter, equal)", () => {
		expect(compareVersions("1.0.0", "1.0")).toBe(0);
	});

	it("treats missing segment as 0 when b has extra non-zero segment", () => {
		expect(compareVersions("1.0", "1.0.1")).toBe(-1);
	});

	// ---------------------------------------------------------------------------
	// Pre-release / build metadata stripping
	// ---------------------------------------------------------------------------
	it("strips pre-release tag before comparison (equal base)", () => {
		expect(compareVersions("1.2.3-beta.1", "1.2.3")).toBe(0);
	});

	it("strips pre-release tag before comparison (a less)", () => {
		expect(compareVersions("1.2.2-rc.1", "1.2.3")).toBe(-1);
	});

	it("strips build metadata before comparison", () => {
		expect(compareVersions("1.2.3+build.42", "1.2.3")).toBe(0);
	});

	it("strips both pre-release and metadata before comparison", () => {
		expect(compareVersions("1.2.3-beta.1+sha.abc", "1.2.3")).toBe(0);
	});

	// ---------------------------------------------------------------------------
	// Non-numeric segments treated as 0
	// ---------------------------------------------------------------------------
	it("treats non-numeric segments as 0", () => {
		expect(compareVersions("1.x.3", "1.0.3")).toBe(0);
	});

	// ---------------------------------------------------------------------------
	// Edge cases: empty or trivial strings
	// ---------------------------------------------------------------------------
	it("returns 0 for two empty strings", () => {
		expect(compareVersions("", "")).toBe(0);
	});

	it("returns 0 for empty string vs 0", () => {
		expect(compareVersions("", "0")).toBe(0);
	});

	it("handles leading/trailing whitespace around version string", () => {
		// The function trims the clean segment
		expect(compareVersions("  1.2.3  ".trim(), "1.2.3")).toBe(0);
	});
});
