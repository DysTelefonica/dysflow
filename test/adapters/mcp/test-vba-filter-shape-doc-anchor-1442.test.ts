import { describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";
import type { JsonObjectSchema } from "../../../src/shared/validation/schemas";
import { validateInput } from "../../../src/shared/validation/validator";

/**
 * Issue #1442 — runtime-anchored contract for the `test_vba` `filter` parameter.
 *
 * The assertions below read the LIVE advertised tool surface (the same
 * `inputSchema` a client receives from `tools/list` and `describe_tool`) and
 * push real payloads through the real boundary validator. They deliberately do
 * NOT grep a documentation string: a string anchor only catches deletion, while
 * feeding the live schema catches the case this issue actually hit — a `filter`
 * declared `type:"string"` silently rejecting the object form at the boundary,
 * long before `parseTestFilter` in the adapter ever sees it.
 */

class FakeVbaService {
  async execute() {
    return successResult({ returnValue: "ok" });
  }
}

class FakeQueryService {
  async execute() {
    return successResult({ rows: [] });
  }
}

class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}

describe("test_vba filter shape (#1442)", () => {
  it("accepts the object form { tag } at the live boundary validator", () => {
    expect(validateInput({ filter: { tag: "smoke" } }, testVbaSchema())).toBeUndefined();
  });

  it("still accepts the legacy string form at the live boundary validator", () => {
    expect(validateInput({ filter: "smoke" }, testVbaSchema())).toBeUndefined();
    expect(validateInput({ filter: "smoke|regression" }, testVbaSchema())).toBeUndefined();
  });

  it("advertises both the string form and the { tag } form in the live description", () => {
    const description = filterProperty().description ?? "";

    expect(description).toMatch(/string/i);
    expect(description).toContain("{ tag:");
  });

  it("names tags-only narrowing so a caller knows name and procedure are skipped", () => {
    const description = filterProperty().description ?? "";

    expect(description).toMatch(/tags/i);
    expect(description).toMatch(/MCP_INPUT_INVALID/);
  });

  // The widened shape belongs to `test_vba` alone. `filter` is shared by the
  // export/list tools, which accept a string only; if a later edit points
  // `test_vba` back at the shared property (or widens the shared one), these
  // tools silently lose their boundary type guard. Assert the containment.
  it.each([
    "export_modules",
    "export_all",
    "list_objects",
    "harvest_form_catalog",
  ])("keeps %s rejecting an object filter at the boundary", (toolName) => {
    expect(validateInput({ filter: { tag: "smoke" } }, schemaFor(toolName))).toBe(
      "filter must be a string.",
    );
  });
});

function schemaFor(toolName: string): JsonObjectSchema {
  const tool = advertisedTools().find((candidate) => candidate.name === toolName);

  expect(tool, `${toolName} must be advertised on the live tool surface`).toBeDefined();
  const schema = tool?.inputSchema as JsonObjectSchema | undefined;
  expect(schema, `${toolName} must advertise an inputSchema`).toBeDefined();
  if (schema === undefined) throw new Error("unreachable: schema asserted above");
  return schema;
}

function testVbaSchema(): JsonObjectSchema {
  return schemaFor("test_vba");
}

function advertisedTools() {
  return createDysflowMcpTools({
    services: {
      vbaService: new FakeVbaService(),
      queryService: new FakeQueryService(),
      diagnosticsService: new FakeDiagnosticsService(),
    },
  });
}

function filterProperty() {
  const property = testVbaSchema().properties.filter;
  expect(property, "test_vba must advertise a filter parameter").toBeDefined();
  if (property === undefined) throw new Error("unreachable: property asserted above");
  return property;
}
