/**
 * `resolveStrictModeFor` — per-input resolution of
 * `capabilities.procedures.strictMode`, parallel to
 * `resolveAllowedProceduresFor` (#1440).
 *
 * One MCP process serves several worktrees, so the enforcement posture has to
 * be read from the project the input targets, not frozen at startup. Every
 * failure mode resolves to `undefined` (= default-allow) on purpose: the write
 * gate owns the write risk, so a broken strict-mode resolver must not turn
 * into an undebuggable refusal.
 */

import { describe, expect, it } from "vitest";
import { resolveStrictModeFor } from "../../../src/adapters/mcp/allowed-procedures-resolver";
import {
  createDysflowError,
  failureResult,
  successResult,
} from "../../../src/core/contracts/index";

describe("resolveStrictModeFor — static form", () => {
  it("returns undefined when no strict mode is configured", async () => {
    await expect(resolveStrictModeFor(undefined, {})).resolves.toBeUndefined();
  });

  it("returns the literal boolean it was given", async () => {
    await expect(resolveStrictModeFor(true, {})).resolves.toBe(true);
    await expect(resolveStrictModeFor(false, {})).resolves.toBe(false);
  });
});

describe("resolveStrictModeFor — resolver form", () => {
  it("awaits an async resolver and returns its value", async () => {
    await expect(resolveStrictModeFor(async () => true, { cwd: "C:/a" })).resolves.toBe(true);
    await expect(resolveStrictModeFor(async () => false, { cwd: "C:/b" })).resolves.toBe(false);
  });

  it("passes the input through to the resolver so it can target the right project", async () => {
    const seen: unknown[] = [];
    const input = { cwd: "C:/worktrees/rc1" };
    await resolveStrictModeFor(async (received) => {
      seen.push(received);
      return true;
    }, input);
    expect(seen).toEqual([input]);
  });

  it("unwraps a successful OperationResult envelope, sync or async", async () => {
    await expect(resolveStrictModeFor(() => successResult(true), {})).resolves.toBe(true);
    await expect(resolveStrictModeFor(async () => successResult(true), {})).resolves.toBe(true);
  });

  it("resolves a failed OperationResult envelope to undefined (default-allow)", async () => {
    // A resolver that cannot read the project config must not turn into an
    // undebuggable refusal — the write gate owns the write risk.
    const failure = () =>
      failureResult(createDysflowError("CONFIG_NOT_FOUND", "no project.json in scope"));
    await expect(resolveStrictModeFor(failure, {})).resolves.toBeUndefined();
    await expect(resolveStrictModeFor(async () => failure(), {})).resolves.toBeUndefined();
  });

  it("resolves a throwing resolver to undefined instead of crashing the gate", async () => {
    await expect(
      resolveStrictModeFor(() => {
        throw new Error("config read exploded");
      }, {}),
    ).resolves.toBeUndefined();
  });

  it("resolves a rejecting async resolver to undefined", async () => {
    await expect(
      resolveStrictModeFor(async () => {
        throw new Error("ENOENT");
      }, {}),
    ).resolves.toBeUndefined();
  });

  it("resolves a resolver that returns undefined to undefined", async () => {
    await expect(resolveStrictModeFor(async () => undefined, {})).resolves.toBeUndefined();
  });
});
