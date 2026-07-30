import { describe, expect, it, vi } from "vitest";
import {
  enrichmentForValidationMessage,
  invalidInput,
} from "../../../src/adapters/mcp/dispatch-common.js";
import { MCP_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas.js";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";
import { validateInput } from "../../../src/shared/validation/validator.js";

type InputError = {
  message?: string;
  missingParam?: string;
  rejectedFlag?: string;
  rejectedFlags?: readonly string[];
  toolCommitFlag?: string;
  remediation?: string;
};

function services(): DysflowMcpServices {
  return {
    vbaService: { execute: vi.fn(async () => successResult({ returnValue: "ok" })) },
    queryService: { execute: vi.fn(async () => successResult({ rows: [] })) },
    diagnosticsService: { run: vi.fn(async () => successResult({ checks: [] })) },
  } as unknown as DysflowMcpServices;
}

function tool(name: string, withProjectConfig = false) {
  const found = createDysflowMcpTools({
    services: services(),
    writes: true,
    ...(withProjectConfig
      ? { projectConfigResolver: async () => Promise.reject(new Error("must not resolve")) }
      : {}),
  }).find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`${name} must be registered`);
  return found;
}

function inputError(result: Awaited<ReturnType<ReturnType<typeof tool>["handler"]>>): InputError {
  return result.error as InputError;
}

describe("MCP input remediation failure kinds (#1198)", () => {
  it("run_vba names the missing procedureName and uses its schema description", async () => {
    const result = await tool("run_vba").handler({ projectId: "demo" });
    const error = inputError(result);

    expect(result.error?.code).toBe("MCP_INPUT_INVALID");
    expect(error.missingParam).toBe("procedureName");
    expect(error.rejectedFlag).toBeUndefined();
    expect(error.toolCommitFlag).toBeUndefined();
    expect(error.remediation).toContain("requires");
    expect(error.remediation).toContain("procedureName");
    expect(error.remediation).toContain("Public VBA procedure name");
    expect(error.remediation).not.toContain("does not accept");
  });

  it("query_execute preserves its specific mode remediation without a generic tail", async () => {
    const result = await tool("query_execute").handler({ sql: "SELECT 1" });
    const error = inputError(result);

    expect(error.missingParam).toBe("mode");
    expect(error.rejectedFlag).toBeUndefined();
    expect(error.toolCommitFlag).toBeUndefined();
    expect(error.remediation).toBe(
      "Pass mode: 'read' for SELECT or mode: 'write' for INSERT/UPDATE/DELETE/DDL.",
    );
    expect(error.remediation).not.toContain("does not accept");
    expect(error.remediation).not.toContain("accepts");
  });

  it("keeps an unknown parameter as a genuine rejected parameter", async () => {
    const result = await tool("fix_encoding").handler({ unexpectedOption: true });
    const error = inputError(result);

    expect(error.rejectedFlag).toBe("unexpectedOption");
    expect(error.missingParam).toBeUndefined();
    expect(error.toolCommitFlag).toBeUndefined();
    expect(error.remediation).toBe('fix_encoding does not accept "unexpectedOption".');
  });

  it("explains the conflict between canonical apply and legacy diff", async () => {
    const result = await tool("query_execute").handler({
      sql: "SELECT 1",
      mode: "write",
      apply: true,
      diff: true,
    });
    const error = inputError(result);

    expect(error.message).toContain("apply and diff are mutually exclusive");
    expect(error.message).toContain("apply is the canonical commit signal");
    expect(error.message).toContain("diff:true is a deprecated alias of apply:false");
    expect(error.missingParam).toBeUndefined();
    expect(error.remediation).toContain("Check the tool schema");
  });

  it("keeps a specific remediation verbatim instead of appending generic guidance", () => {
    const remediation =
      "Pass dryRunWithPreflight:true to validate readiness, or dryRun:true to plan.";
    const result = invalidInput(
      "dryRunWithPreflight is mutually exclusive with dryRun.",
      remediation,
      {
        kind: "rejected-write-flag",
        rejectedFlag: "dryRunWithPreflight",
        toolName: "export_modules",
      },
    );

    expect(inputError(result).remediation).toBe(remediation);
  });

  it("keeps write metadata on a registered wrapper with specific remediation", async () => {
    const result = await tool("export_modules", true).handler({
      dryRun: true,
      dryRunWithPreflight: true,
    });
    const error = inputError(result);

    expect(error.rejectedFlag).toBe("dryRunWithPreflight");
    expect(error.toolCommitFlag).toBe("apply");
    expect(error.remediation).toBe(
      "Pass dryRunWithPreflight:true to validate the project's readiness without writing, or dryRun:true to plan the write without preflight. They cannot be combined.",
    );
  });

  it("preserves a nested missing parameter identity through the registered handler", async () => {
    const registered = tool("apply_form_design_plan");
    const inputSchema = registered.inputSchema;
    if (inputSchema === undefined) throw new Error("input schema must be registered");
    const description = inputSchema.properties.plan?.properties?.formName?.description;
    if (description === undefined) throw new Error("nested schema description must be registered");
    const result = await registered.handler({
      sourcePath: "forms/Form_Demo.form.txt",
      plan: { operations: [], sourceContract: {} },
    });
    const error = inputError(result);

    expect(error.missingParam).toBe("plan.formName");
    expect(error.rejectedFlag).toBeUndefined();
    expect(error.toolCommitFlag).toBeUndefined();
    expect(error.remediation).toContain("plan.formName");
    expect(error.remediation).toContain(description);
    expect(error.remediation).not.toContain("does not accept");
  });

  it("never says a declared required or anyOf parameter is not accepted", () => {
    type SchemaNode = {
      anyOf?: readonly { required?: readonly string[] }[];
      items?: SchemaNode;
      properties?: Readonly<Record<string, SchemaNode>>;
      required?: readonly string[];
    };
    const requiredPaths = function* (node: SchemaNode, prefix = ""): Generator<string> {
      const required = [
        ...(node.required ?? []),
        ...(node.anyOf ?? []).flatMap((alternative) => alternative.required ?? []),
      ];
      for (const name of required) yield prefix.length === 0 ? name : `${prefix}.${name}`;
      for (const [name, child] of Object.entries(node.properties ?? {})) {
        yield* requiredPaths(child, prefix.length === 0 ? name : `${prefix}.${name}`);
      }
      if (node.items !== undefined) yield* requiredPaths(node.items, `${prefix}[0]`);
    };

    for (const [toolName, schema] of Object.entries(MCP_TOOL_SCHEMAS)) {
      for (const missingParam of requiredPaths(schema)) {
        const validation = `${missingParam} is required.`;
        const enrichment = enrichmentForValidationMessage(validation, toolName, schema);
        const result = invalidInput(validation, undefined, enrichment);
        const error = inputError(result);

        expect(error.missingParam, `${toolName}.${missingParam}`).toBe(missingParam);
        expect(error.remediation, `${toolName}.${missingParam}`).not.toContain("does not accept");
      }

      if ((schema.anyOf?.length ?? 0) > 0) {
        const validation = validateInput({}, schema);
        expect(validation, `${toolName} should reject an empty anyOf payload`).toBeDefined();
        const enrichment = enrichmentForValidationMessage(validation ?? "", toolName, schema);
        const result = invalidInput(validation ?? "", undefined, enrichment);

        expect(inputError(result).remediation, toolName).not.toContain("does not accept");
      }
    }
  });
});
