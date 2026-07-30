import { describe, expect, it } from "vitest";
import {
  migrateDryRunContent,
  restoreDryRunContent,
} from "../../../src/core/services/dryrun-migration";

describe("dryRun consumer migration", () => {
  it("inverts literal dryRun booleans without disturbing surrounding source", () => {
    const source = ['CallTool "{""dryRun"": true}"', 'CallTool "{""dryRun"": false}"'].join("\n");

    const result = migrateDryRunContent(source);

    expect(result.content).toBe(
      ['CallTool "{""apply"": false}"', 'CallTool "{""apply"": true}"'].join("\n"),
    );
    expect(result.edits).toEqual([
      expect.objectContaining({
        line: 1,
        legacyLine: 'CallTool "{""dryRun"": true}"',
        newLine: 'CallTool "{""apply"": false}"',
        confidence: 1,
        confidenceReason: "literal",
      }),
      expect.objectContaining({
        line: 2,
        confidence: 1,
        confidenceReason: "literal",
      }),
    ]);
  });

  it("reports and safely inverts context-dependent expressions", () => {
    const result = migrateDryRunContent('Tag ="{""dryRun"": shouldPlan}"');

    expect(result.content).toBe('Tag ="{""apply"": Not (shouldPlan)}"');
    expect(result.edits).toEqual([
      expect.objectContaining({
        legacyLine: 'Tag ="{""dryRun"": shouldPlan}"',
        newLine: 'Tag ="{""apply"": Not (shouldPlan)}"',
        confidence: 0.5,
        confidenceReason: "context-dependent",
      }),
    ]);
  });

  it("restores only the exact migrated content recorded by the undo entry", () => {
    const original = 'CallTool "{""dryRun"": true}"';
    const migrated = migrateDryRunContent(original);

    expect(
      restoreDryRunContent(migrated.content, {
        before: original,
        after: migrated.content,
      }),
    ).toBe(original);
    expect(() =>
      restoreDryRunContent(`${migrated.content}\nchanged`, {
        before: original,
        after: migrated.content,
      }),
    ).toThrow(/changed since migration/i);
  });
});
