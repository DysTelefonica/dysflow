import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("issue reconciliation notes", () => {
  it("records issue #160 setup registry error status", async () => {
    const note = await readFile("docs/testing/issue-160-registry-error.md", "utf8");

    expect(note).toContain("# Issue #160: setup registry error");
    expect(note).toContain("Status: update/close as already fixed");
    expect(note).toContain("`Invalid Dysflow project registry JSON`");
    expect(note).toContain("must not expose filesystem paths");
    expect(note).toContain("Follow-up: none unless the sanitized behavior regresses");
  });
});
