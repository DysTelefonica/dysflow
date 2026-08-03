import { describe, expect, it } from "vitest";
import { MCP_TOOL_ROUTES } from "../../../src/adapters/mcp/dispatch-routes.js";
import { resolveEffectiveDryRunInput } from "../../../src/adapters/mcp/write-execution-dispatch.js";

const HISTORICAL_SERVICE_PLAN_TOOLS = [
  "apply_form_design_plan",
  "catalog_add_control",
  "create_form_from_template",
  "form_add_control",
  "form_align_controls",
  "form_delete_control",
  "form_deserialize",
  "form_distribute_controls",
  "form_duplicate_control",
  "form_move_control",
  "form_rename_control",
  "form_set_properties",
  "form_set_property",
  "generate_form",
  "sync_binary",
] as const;

type WriteIntent = "always-execute" | "policy-default" | "service-plan";

function vbaRouteEntries() {
  return Object.entries(MCP_TOOL_ROUTES).filter(([, route]) => route.kind === "vba-sync");
}

function writeIntent(route: object): WriteIntent | undefined {
  return (route as { writeIntent?: WriteIntent }).writeIntent;
}

describe("route-declared write intent saturation (#1353)", () => {
  it("requires every vba-sync route to declare one closed write intent", () => {
    const missingOrInvalid = vbaRouteEntries()
      .filter(([, route]) =>
        !["always-execute", "policy-default", "service-plan"].includes(
          writeIntent(route) ?? "",
        ),
      )
      .map(([name]) => name);

    expect(missingOrInvalid).toEqual([]);
  });

  it("derives the complete historical service-plan family from the route table", () => {
    const actual = vbaRouteEntries()
      .filter(([, route]) => writeIntent(route) === "service-plan")
      .map(([name]) => name)
      .sort();

    expect(actual).toEqual([...HISTORICAL_SERVICE_PLAN_TOOLS].sort());
  });

  it("keeps service-plan calls unchanged when developer mode receives no flags", () => {
    for (const tool of HISTORICAL_SERVICE_PLAN_TOOLS) {
      const input = { projectRoot: "C:/fixture", spec: { name: "Example" } };
      expect(resolveEffectiveDryRunInput(tool, "developer", input)).toBe(input);
    }
  });

  it("keeps preview-capable policy tools distinct from unconditional binary writes", () => {
    expect(writeIntent(MCP_TOOL_ROUTES.fix_encoding)).toBe("policy-default");
    expect(writeIntent(MCP_TOOL_ROUTES.vba_inline_execution)).toBe("policy-default");
    expect(writeIntent(MCP_TOOL_ROUTES.import_modules)).toBe("always-execute");
    expect(writeIntent(MCP_TOOL_ROUTES.import_all)).toBe("always-execute");
  });
});
