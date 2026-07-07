import { describe, expect, it } from "vitest";
import {
  clearHumanCompileState,
  getHumanCompileState,
  HUMAN_COMPILE_REMINDER_TEXT,
  isHumanCompilePending,
  recordPersistence,
  recordVerifyFail,
  recordVerifyOk,
} from "../../../src/core/runtime/human-compile-state";

/**
 * PR-1 (issue #762) — `human-compile-state` is the in-memory single source of
 * truth for "did the human compile since the last dysflow persistence?". v1.19.0
 * removed all compile from the runtime; v1.20.0 adds a structured reminder
 * surface so the agent (and the human reading the result) can see the gap.
 *
 * The state is keyed by `accessPath` and lives in a module-level Map. Each test
 * uses a fresh `accessPath` (the Fixture Gate rule) so concurrent tests do not
 * leak state between each other.
 */
describe("human-compile-state (#762) — pending flag transitions", () => {
  it("happy path: recordPersistence → isHumanCompilePending is true (verify has not happened yet)", () => {
    const accessPath = "C:/repo/front-A.accdb";
    clearHumanCompileState(accessPath);

    expect(isHumanCompilePending(accessPath)).toBe(false);

    recordPersistence(accessPath);

    expect(isHumanCompilePending(accessPath)).toBe(true);
  });

  it("happy path 2: recordPersistence + recordVerifyOk → isHumanCompilePending is false (human confirmed state)", () => {
    const accessPath = "C:/repo/front-B.accdb";
    clearHumanCompileState(accessPath);

    recordPersistence(accessPath);
    recordVerifyOk(accessPath);

    expect(isHumanCompilePending(accessPath)).toBe(false);
  });

  it("sad path: recordPersistence + recordVerifyFail → isHumanCompilePending stays true (failure does NOT clear the flag)", () => {
    // The reminder is conservative: a failed verify does NOT mean the human
    // compiled since the last persistence, so the reminder stays visible.
    const accessPath = "C:/repo/front-C.accdb";
    clearHumanCompileState(accessPath);

    recordPersistence(accessPath);
    recordVerifyFail(accessPath);

    expect(isHumanCompilePending(accessPath)).toBe(true);
  });

  it("edge: fresh accessPath with no recorded events → isHumanCompilePending is false", () => {
    const accessPath = "C:/repo/front-never-seen.accdb";
    clearHumanCompileState(accessPath);

    expect(isHumanCompilePending(accessPath)).toBe(false);
  });

  it("edge: clearHumanCompileState resets the entry → isHumanCompilePending is false after the clear", () => {
    const accessPath = "C:/repo/front-D.accdb";
    clearHumanCompileState(accessPath);

    recordPersistence(accessPath);
    expect(isHumanCompilePending(accessPath)).toBe(true);

    clearHumanCompileState(accessPath);

    expect(isHumanCompilePending(accessPath)).toBe(false);
  });

  it("edge: state for one accessPath does not affect another (key isolation)", () => {
    const a = "C:/repo/projA/front.accdb";
    const b = "C:/repo/projB/front.accdb";
    clearHumanCompileState(a);
    clearHumanCompileState(b);

    recordPersistence(a);
    // Only `a` has pending persistence; `b` must remain clean.
    expect(isHumanCompilePending(a)).toBe(true);
    expect(isHumanCompilePending(b)).toBe(false);

    recordVerifyOk(a);
    // `a` is now clean; `b` was never touched.
    expect(isHumanCompilePending(a)).toBe(false);
    expect(isHumanCompilePending(b)).toBe(false);

    // Cleanup so other test files start from a known state.
    clearHumanCompileState(a);
    clearHumanCompileState(b);
  });
});

describe("human-compile-state (#762) — getHumanCompileState observation surface", () => {
  it("returns a defined state entry for an accessPath that has recorded events", () => {
    const accessPath = "C:/repo/front-observed.accdb";
    clearHumanCompileState(accessPath);

    recordPersistence(accessPath);
    recordVerifyOk(accessPath);

    const state = getHumanCompileState(accessPath);
    expect(state.lastPersistenceAt).toBeInstanceOf(Date);
    expect(state.lastVerifyCodeAt).toBeInstanceOf(Date);
    expect(state.lastVerifyCodeOk).toBe(true);
  });

  it("returns an empty state entry (undefined timestamps) for an accessPath with no events", () => {
    const accessPath = "C:/repo/front-unobserved.accdb";
    clearHumanCompileState(accessPath);

    const state = getHumanCompileState(accessPath);
    expect(state.lastPersistenceAt).toBeUndefined();
    expect(state.lastVerifyCodeAt).toBeUndefined();
    expect(state.lastVerifyCodeOk).toBeUndefined();
  });

  it("records verify failures with lastVerifyCodeOk = false but a defined timestamp", () => {
    const accessPath = "C:/repo/front-fail.accdb";
    clearHumanCompileState(accessPath);

    recordPersistence(accessPath);
    recordVerifyFail(accessPath);

    const state = getHumanCompileState(accessPath);
    expect(state.lastPersistenceAt).toBeInstanceOf(Date);
    expect(state.lastVerifyCodeAt).toBeInstanceOf(Date);
    expect(state.lastVerifyCodeOk).toBe(false);
  });
});

describe("human-compile-state (#762) — HUMAN_COMPILE_REMINDER_TEXT contract", () => {
  it("exposes a non-empty reminder template that contains the placeholder for the timestamp", () => {
    // The reminder text must reference the fact that dysflow does NOT compile
    // and that the human must do so in Access before any test run.
    expect(typeof HUMAN_COMPILE_REMINDER_TEXT).toBe("string");
    expect(HUMAN_COMPILE_REMINDER_TEXT.length).toBeGreaterThan(0);
    // The placeholder is what consumers replace with the actual persistence
    // timestamp when emitting the structured reminder.
    expect(HUMAN_COMPILE_REMINDER_TEXT).toContain("<ISO timestamp>");
    // The reminder must reference the human-compile contract so consumers can
    // grep for the marker in logs and tests.
    expect(HUMAN_COMPILE_REMINDER_TEXT).toMatch(/compile/i);
  });
});
