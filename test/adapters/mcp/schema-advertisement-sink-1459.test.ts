import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createInvocationTelemetryRecorder,
  createSchemaAdvertisementRecorder,
} from "../../../src/adapters/mcp/invocation-telemetry.js";
import type { InvocationTelemetryEntry } from "../../../src/core/telemetry/invocation-telemetry.js";
import type { SchemaAdvertisementEntry } from "../../../src/core/telemetry/schema-advertisement.js";

/**
 * Issue #1459 — the two streams are separate files, and the documented path is
 * the one the runtime actually writes. A consumer counting invocations must
 * never have to filter advertisements out first, so a shared file would be a
 * silent contract break rather than a visible failure.
 */

const roots: string[] = [];

function projectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "dysflow-1459-sink-"));
  roots.push(root);
  return root;
}

const ADVERTISEMENT: SchemaAdvertisementEntry = {
  timestamp: "2026-08-21T00:00:00.000Z",
  surface: "tools/list",
  view: "compact",
  toolCount: 2,
  payloadBytes: 512,
  repetition: 1,
  msSincePrevious: null,
};

const INVOCATION: InvocationTelemetryEntry = {
  timestamp: "2026-08-21T00:00:01.000Z",
  tool: "schema",
  action: "diagnostics",
  operationId: null,
  projectId: null,
  outcome: "ok",
  failureClass: "none",
  errorCode: null,
  durationMs: 1,
  writeIntent: "read",
  paramNamesPresent: [],
  missingParams: [],
  rejectedParams: [],
  unknownToolName: null,
};

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe("schema-advertisement sink (#1459)", () => {
  it("writes advertisements to the documented sibling stream", async () => {
    const cwd = projectRoot();

    await createSchemaAdvertisementRecorder({ cwd }).record(ADVERTISEMENT);

    const raw = await readFile(
      join(cwd, ".dysflow", "runtime", "schema-advertisements.jsonl"),
      "utf8",
    );
    expect(
      raw
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual([ADVERTISEMENT]);
  });

  it("keeps advertisements out of the invocation stream", async () => {
    const cwd = projectRoot();

    await createSchemaAdvertisementRecorder({ cwd }).record(ADVERTISEMENT);
    await createInvocationTelemetryRecorder({ cwd }).record(INVOCATION);

    const invocations = await readFile(
      join(cwd, ".dysflow", "runtime", "invocations.jsonl"),
      "utf8",
    );
    expect(
      invocations
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual([INVOCATION]);
  });

  it("records nothing for a project that opted out", async () => {
    const cwd = projectRoot();

    await createSchemaAdvertisementRecorder({ cwd, enabled: false }).record(ADVERTISEMENT);

    await expect(
      readFile(join(cwd, ".dysflow", "runtime", "schema-advertisements.jsonl"), "utf8"),
    ).rejects.toThrow();
  });
});
