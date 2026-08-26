import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAgentWorkflowMetadata } from "../../../../src/adapters/mcp/agent-workflow-registry.js";
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
import { executableResultContractForTool } from "../../../../src/adapters/mcp/contracts/executable-result-contract-registry.js";
import { MCP_TOOL_CONTRACTS } from "../../../../src/adapters/mcp/mcp-tool-contracts.js";
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

function schemaAllowsWarnings(schema: unknown): boolean {
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) return false;
  const record = schema as Record<string, unknown>;
  const variants = [record.anyOf, record.oneOf].filter(Array.isArray).flat() as unknown[];
  if (variants.length > 0) return variants.some(schemaAllowsWarnings);
  if (record.type !== "object") return false;
  if (record.additionalProperties !== false) return true;
  const properties = record.properties;
  return (
    properties !== null &&
    typeof properties === "object" &&
    !Array.isArray(properties) &&
    Object.hasOwn(properties, "warnings")
  );
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

  it("keeps every warning-eligible tool compatible with preferred-tool decoration", () => {
    const warningEligibleTools = Object.keys(MCP_TOOL_CONTRACTS).filter((name) => {
      const workflow = buildAgentWorkflowMetadata(name);
      const access = MCP_TOOL_CONTRACTS[name as keyof typeof MCP_TOOL_CONTRACTS].access;
      return (
        workflow.status === "legacy" ||
        (workflow.status === "specialized" && access !== "read-only")
      );
    });

    const incompatible = warningEligibleTools.filter((name) => {
      const contract = executableResultContractForTool(name);
      return contract?.kind !== "dataSchema" || !schemaAllowsWarnings(contract.introspectionSchema);
    });

    expect(incompatible).toEqual([]);
  });
});
