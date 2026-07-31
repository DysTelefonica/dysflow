import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  bootstrapRecoveryResultContracts,
  cleanStaleMarkersResultContract,
  cleanupAccessOperationResultContract,
  describeToolResultContract,
  listAccessOperationsResultContract,
  orphanCleanupResultContract,
  resolveProjectResultContract,
  schemaResultContract,
} from "../../../../src/adapters/mcp/contracts/bootstrap-result-contracts.js";
import { createResolveProjectTool } from "../../../../src/adapters/mcp/resolve-project-tool.js";
import {
  createDescribeToolTool,
  createSchemaTool,
} from "../../../../src/adapters/mcp/schema-tool.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function payload(result: { content: readonly { text?: string }[] }): unknown {
  return JSON.parse(result.content[0]?.text ?? "null");
}

describe("bootstrap/recovery executable result contracts", () => {
  it("validates real serialized bootstrap handler payloads", async () => {
    const root = mkdtempSync(join(tmpdir(), "dysflow-contract-"));
    roots.push(root);

    const schemaTool = createSchemaTool();
    const schemaPayload = payload(await schemaTool.handler({ view: "compact" }));
    expect(schemaTool.resultContract).toBe(bootstrapRecoveryResultContracts.schema);
    expect(() => schemaResultContract.schema.parse(schemaPayload)).not.toThrow();

    const describeTool = createDescribeToolTool();
    const describePayload = payload(await describeTool.handler({ name: "resolve_project" }));
    expect(describeTool.resultContract).toBe(bootstrapRecoveryResultContracts.describe_tool);
    expect(() => describeToolResultContract.schema.parse(describePayload)).not.toThrow();

    const resolveTool = createResolveProjectTool({ cwd: root });
    const resolvePayload = payload(await resolveTool.handler({}));
    expect(resolveTool.resultContract).toBe(bootstrapRecoveryResultContracts.resolve_project);
    expect(() => resolveProjectResultContract.schema.parse(resolvePayload)).not.toThrow();
    expect(resolvePayload).toMatchObject({
      projectId: null,
      outcome: "unresolved",
      accessPath: null,
      projectRoot: null,
      sourceRoot: null,
    });
  });

  it("pins nullable cleanup fields and structurally distinct list/apply payloads", () => {
    expect(() =>
      listAccessOperationsResultContract.schema.parse({
        operations: [],
        registryHealth: { status: "healthy" },
      }),
    ).not.toThrow();

    expect(() =>
      cleanupAccessOperationResultContract.schema.parse({
        cleanup: { operationId: "op-1", accessPid: null, status: "cleaned" },
        registryHealth: { status: "healthy" },
      }),
    ).not.toThrow();

    expect(() =>
      orphanCleanupResultContract.schema.parse({
        orphans: [
          {
            pid: 42,
            accessPath: "C:\\work\\app.accdb",
            kind: "access",
            ageSeconds: 60,
            mainWindowHandle: 0,
          },
        ],
        totalCount: 1,
      }),
    ).not.toThrow();
    expect(() =>
      orphanCleanupResultContract.schema.parse({
        killed: [42],
        refused: [],
        errors: [],
        syntheticOperationId: "orphan-cleanup-42",
      }),
    ).not.toThrow();
  });

  it("validates the actual stale-marker plan/apply service result without inventing mode", () => {
    const fixture = {
      ok: true,
      scanned: 2,
      removed: 1,
      kept: 1,
      removedMarkerIds: ["stale-1"],
      keptMarkerIds: ["fresh-1"],
      errors: [],
    };
    expect(() => cleanStaleMarkersResultContract.schema.parse(fixture)).not.toThrow();
    expect(() =>
      cleanStaleMarkersResultContract.schema.parse({ ...fixture, mode: "apply" }),
    ).toThrow();
  });
});
