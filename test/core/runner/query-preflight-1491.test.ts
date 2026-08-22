/**
 * Issue #1491 — behaviour tests for the query pre-flight, reached directly.
 *
 * The point of the extraction is exactly this file. Before it, every one of
 * these branches lived inside `runLockedOperation`, so reaching one meant
 * building a full locked-operation context: a registry, a lock, an executor, a
 * clock, a preflight cleanup. The branches most likely to change were the ones
 * most expensive to test, which is why they had accumulated two near-identical
 * copies of the same ambiguity handling.
 *
 * Here the collaborators are three injected functions.
 */

import { describe, expect, it } from "vitest";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import { successResult } from "../../../src/core/contracts/index.js";
import type { AccessRunnerOperation } from "../../../src/core/runner/access-runner-operation.js";
import {
  type QueryPreflightDeps,
  resolveQueryPreflight,
} from "../../../src/core/runner/query-preflight.js";

const noCompactTarget = () => undefined;

function config(overrides: Partial<DysflowConfig> = {}): DysflowConfig {
  return { accessDbPath: "C:/db/front.accdb", ...overrides } as DysflowConfig;
}

function deps(overrides: Partial<QueryPreflightDeps> = {}): QueryPreflightDeps {
  return {
    runProbe: async <TData>() => successResult({} as TData),
    fileExists: () => true,
    crossDbRunner: {} as QueryPreflightDeps["crossDbRunner"],
    ...overrides,
  };
}

function queryOperation(request: Record<string, unknown>): AccessRunnerOperation {
  return { kind: "query", request } as AccessRunnerOperation;
}

describe("#1491 resolveQueryPreflight", () => {
  it("passes a non-query operation through untouched", async () => {
    const operation = {
      kind: "vba",
      request: { moduleName: "Module1", procedureName: "Main" },
    } as AccessRunnerOperation;

    const result = await resolveQueryPreflight(operation, config(), deps(), noCompactTarget);

    expect(result.outcome).toBe("resolved");
    if (result.outcome !== "resolved") return;
    // The whole point: a vba operation must not be rewritten by query pre-flight.
    expect(result.operation).toBe(operation);
    expect(result.compactRepairTarget).toBeUndefined();
  });

  it("refuses an untargeted compact_repair when both databases are configured", async () => {
    const result = await resolveQueryPreflight(
      queryOperation({ action: "compact_repair", mode: "write", sql: "" }),
      config({ backendPath: "C:/db/back.accdb" } as Partial<DysflowConfig>),
      deps(),
      noCompactTarget,
    );

    expect(result.outcome).toBe("failure");
    if (result.outcome !== "failure") return;
    expect(result.failure.ok).toBe(false);
    if (result.failure.ok) return;
    expect(result.failure.error.code).toBe("CONFIG_TARGET_AMBIGUOUS");
    // The details payload is part of the contract, not decoration — a caller
    // uses it to ask the human which target they meant.
    expect(result.failure.error.details).toMatchObject({ targets: ["frontend", "backend"] });
  });

  it("reports a configured accessPath that is not on disk", async () => {
    const result = await resolveQueryPreflight(
      queryOperation({ action: "query_sql", mode: "read", sql: "SELECT 1" }),
      config({ configPath: "C:/proj/.dysflow/project.json" } as Partial<DysflowConfig>),
      deps({ fileExists: () => false }),
      noCompactTarget,
    );

    expect(result.outcome).toBe("failure");
    if (result.outcome !== "failure") return;
    if (result.failure.ok) return;
    expect(result.failure.error.code).toBe("CONFIG_TARGET_NOT_FOUND");
  });

  it("does not probe the schema for an action that carries no table shape", async () => {
    let probes = 0;
    const result = await resolveQueryPreflight(
      queryOperation({ action: "list_tables", mode: "read", sql: "" }),
      config(),
      deps({
        runProbe: async <TData>() => {
          probes += 1;
          return successResult({} as TData);
        },
      }),
      noCompactTarget,
    );

    expect(result.outcome).toBe("resolved");
    expect(probes, "list_tables must not trigger a schema probe").toBe(0);
  });
});
