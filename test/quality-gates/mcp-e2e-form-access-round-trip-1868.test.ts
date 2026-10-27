// Issue #1868 — offline pin for the Access round-trip of every form write tool.
//
// The real round-trip runs only in the release battery (`mcp-e2e.mjs`), which
// needs Access. This pin catches, in milliseconds, the ways that scenario can
// rot without Access:
//   1. a new form write tool ships without a round-trip scenario;
//   2. a scenario's arguments stop matching the live input schema;
//   3. the production adapter stops writing what the scenario asserts (raw
//      numbers, whole twips, LayoutCached* in step), so the battery would fail
//      on a harness assumption instead of on a real Access rejection;
//   4. the harness stops wiring apply -> verify_code -> revert -> verify_code.
//
// Each scenario is replayed through `VbaFormsAdapter` against the real
// `Form_FormPECAL` fixture with the import gate stubbed; only Access is fake.

// @ts-nocheck — the shared scenario module is a plain `.mjs` helper.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildRejectedDeserializeArgs,
  controlProperty,
  FORM_ROUND_TRIP_CLONE_MODULE,
  FORM_ROUND_TRIP_EXEMPT_TOOLS,
  FORM_ROUND_TRIP_MODULE,
  FORM_ROUND_TRIP_PLAN_OPERATIONS,
  FORM_ROUND_TRIP_SCENARIOS,
  geometryDefects,
  hasControl,
  summarizeFormVerify,
} from "../../E2E_testing/_helpers/form-access-round-trip.mjs";
import { inputSchemaForTool } from "../../src/adapters/mcp/schema-tool.js";
import { buildHiddenToolRegistry } from "../../src/adapters/mcp/stdio-wrappers.js";
import { createDysflowMcpTools } from "../../src/adapters/mcp/tools.js";
import { VbaFormsAdapter } from "../../src/adapters/vba-sync/vba-forms-adapter.js";
import { successResult } from "../../src/core/contracts/index.js";
import { COMMIT_FLAG_REGISTRY } from "../../src/core/runtime/commit-flag-registry.js";
import { parseFormTxt } from "../../src/core/services/form-ir-service.js";
import { validateInput } from "../../src/shared/validation/validator.js";

const MCP_E2E_PATH = resolve(process.cwd(), "E2E_testing/mcp-e2e.mjs");
const FIXTURE_PATH = resolve(process.cwd(), "E2E_testing/src/forms/Form_FormPECAL.form.txt");
const SOURCE_PATH = "C:/sandbox/src/forms/Form_FormPECAL.form.txt";
const FIXTURE = readFileSync(FIXTURE_PATH, "utf8");
const harness = readFileSync(MCP_E2E_PATH, "utf8");

function makeAdapter() {
  const written: string[] = [];
  const executeMappedTool = vi.fn().mockResolvedValue(successResult({ result: { ok: true } }));
  const adapter = new VbaFormsAdapter(
    {
      executor: vi.fn(),
      env: { DYSFLOW_HOME: "C:/runtime/dysflow" },
      cwd: "C:/sandbox",
      resolveExecutionTarget: vi.fn().mockResolvedValue(
        successResult({
          accessPath: "C:/sandbox/NoConformidades.accdb",
          destinationRoot: "C:/sandbox/src",
          projectRoot: "C:/sandbox",
          timeoutMs: 30_000,
          configSource: "explicit-request",
        }),
      ),
      validateStrictContext: vi.fn(() => successResult(undefined)),
      executeMappedTool,
    },
    {
      mkdir: vi.fn(),
      readdir: vi.fn(),
      readFile: vi.fn().mockImplementation(async () => written.at(-1) ?? FIXTURE),
      readJson: vi.fn(),
      writeFile: vi.fn().mockImplementation(async (_path: string, text: string) => {
        written.push(text);
      }),
    },
    { benchCacheRoot: "C:/sandbox/src/forms" },
  );
  return { adapter, written, executeMappedTool };
}

async function designPlan() {
  const { adapter } = makeAdapter();
  const map = await adapter.execute("map_form_behavior", { sourcePath: SOURCE_PATH });
  expect(map.ok, JSON.stringify(map)).toBe(true);
  const plan = await adapter.execute("generate_form_design_plan", {
    behaviorMap: map.data,
    plan: { operations: FORM_ROUND_TRIP_PLAN_OPERATIONS },
  });
  expect(plan.ok, JSON.stringify(plan)).toBe(true);
  return plan.data;
}

async function argsFor(scenario) {
  const plan = scenario.tool === "apply_form_design_plan" ? await designPlan() : undefined;
  return scenario.buildArgs({ source: FIXTURE, parseFormTxt, plan });
}

describe("form write tools — Access round-trip coverage (#1868)", () => {
  it("covers every form write tool that imports into Access", () => {
    const formWriteTools = Object.entries(COMMIT_FLAG_REGISTRY)
      .filter(([, meta]) => meta.defaultBehavior === "plan")
      .map(([name]) => name)
      .filter((name) => /^form_|_form_|^generate_form$|^catalog_add_control$/.test(name));
    const covered = [
      ...FORM_ROUND_TRIP_SCENARIOS.map((scenario) => scenario.tool),
      "create_form_from_template",
      ...Object.keys(FORM_ROUND_TRIP_EXEMPT_TOOLS),
    ];

    expect(new Set(covered).size).toBe(covered.length);
    expect([...covered].sort()).toEqual([...formWriteTools].sort());
  });

  it("targets only advertised tools", () => {
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute: async () => successResult({}) },
        queryService: { execute: async () => successResult({ rows: [] }) },
        diagnosticsService: { run: async () => successResult({ checks: [] }) },
      },
    });
    const hidden = buildHiddenToolRegistry(tools);
    const advertised = new Set(tools.map((tool) => tool.name).filter((name) => !hidden.has(name)));

    for (const tool of [
      ...FORM_ROUND_TRIP_SCENARIOS.map((scenario) => scenario.tool),
      "create_form_from_template",
      "verify_code",
      "import_modules",
      "export_modules",
      "delete_module",
      "map_form_behavior",
      "generate_form_design_plan",
    ]) {
      expect(advertised.has(tool), tool).toBe(true);
    }
  });

  it.each([
    ["verify_code", { moduleNames: [FORM_ROUND_TRIP_MODULE], diagnostic: true, timeoutMs: 180000 }],
    ["import_modules", { moduleNames: [FORM_ROUND_TRIP_MODULE], apply: true, timeoutMs: 180000 }],
    [
      "export_modules",
      {
        moduleNames: [FORM_ROUND_TRIP_MODULE],
        exportPath: "C:/sandbox/exports/form-round-trip",
        apply: true,
      },
    ],
    [
      "create_form_from_template",
      {
        sourceForm: FORM_ROUND_TRIP_MODULE,
        targetForm: FORM_ROUND_TRIP_CLONE_MODULE,
        tokenMap: {},
        overwrite: true,
        apply: true,
      },
    ],
    [
      "delete_module",
      {
        moduleName: FORM_ROUND_TRIP_CLONE_MODULE,
        apply: true,
        implements_check: "delete_module_precheck",
        confirmedRequiresConfirmation: true,
        timeoutMs: 180000,
      },
    ],
  ])("passes the live %s schema with the harness arguments", (tool, args) => {
    expect(
      validateInput({ projectId: "noconformidades-e2e", ...args }, inputSchemaForTool(tool)),
    ).toBeUndefined();
  });

  it("starts from a fixture whose geometry is internally consistent", () => {
    for (const control of ["PECAL", "DESCRIPCION", "Etiqueta232", "Etiqueta240"]) {
      expect(geometryDefects(FIXTURE, control), control).toEqual([]);
    }
  });
});

describe.each(FORM_ROUND_TRIP_SCENARIOS)("$tool round-trip scenario (#1868)", (scenario) => {
  it("passes the live input schema", async () => {
    const args = {
      projectId: "noconformidades-e2e",
      sourcePath: SOURCE_PATH,
      ...(await argsFor(scenario)),
      apply: true,
    };
    expect(validateInput(args, inputSchemaForTool(scenario.tool))).toBeUndefined();
  });

  it("writes through the production adapter what the battery asserts", async () => {
    const { adapter, written, executeMappedTool } = makeAdapter();
    const result = await adapter.execute(scenario.tool, {
      sourcePath: SOURCE_PATH,
      ...(await argsFor(scenario)),
      apply: true,
    });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(executeMappedTool).toHaveBeenCalled();
    const check = scenario.expectSource(written.at(-1));
    expect(check.pass, check.summary).toBe(true);
    expect(
      scenario.expectSource(FIXTURE).pass,
      "assertion must not pass on the untouched fixture",
    ).toBe(false);
    if (scenario.binaryValues !== undefined) {
      const { control, properties } = scenario.binaryValues;
      for (const [key, raw] of Object.entries(properties)) {
        expect(controlProperty(written.at(-1), control, key), `${control}.${key}`).toBe(raw);
      }
    }
  });
});

describe("forced Access rejection bait (#1868)", () => {
  it("hands Access the quoted numeric Width it rejected before #1928", async () => {
    const { adapter, written } = makeAdapter();
    const result = await adapter.execute("form_deserialize", {
      sourcePath: SOURCE_PATH,
      ...buildRejectedDeserializeArgs({ source: FIXTURE, parseFormTxt }),
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(controlProperty(written.at(-1), "Etiqueta232", "Width")).toBe('"1100"');
  });
});

describe("summarizeFormVerify (#1868)", () => {
  it("is clean only without actionable or missing entries", () => {
    expect(
      summarizeFormVerify({ actionableOk: true, actionableDifferent: [] }, FORM_ROUND_TRIP_MODULE)
        .clean,
    ).toBe(true);
    expect(
      summarizeFormVerify(
        { actionableOk: true, actionableDifferent: [], missingInBinary: [FORM_ROUND_TRIP_MODULE] },
        FORM_ROUND_TRIP_MODULE,
      ).clean,
    ).toBe(false);
  });

  it("accepts layout drift of the target form but never code-behind drift", () => {
    const layout = {
      moduleName: FORM_ROUND_TRIP_MODULE,
      fileType: "form.txt",
      classification: "functional",
    };
    const code = {
      moduleName: FORM_ROUND_TRIP_MODULE,
      fileType: "cls",
      classification: "functional",
    };

    expect(
      summarizeFormVerify({ actionableDifferent: [layout] }, FORM_ROUND_TRIP_MODULE).layoutOnly,
    ).toBe(true);
    expect(
      summarizeFormVerify({ actionableDifferent: [layout, code] }, FORM_ROUND_TRIP_MODULE)
        .layoutOnly,
    ).toBe(false);
  });

  it("reads a missing control as absent", () => {
    expect(hasControl(FIXTURE, "lblRoundTripCopy")).toBe(false);
  });
});

describe("mcp-e2e.mjs wires the form Access round-trip (#1868)", () => {
  const block = harness.slice(
    harness.indexOf("// Issue #1868 — form Access round-trip"),
    harness.indexOf("// Issue #1868 — end of form Access round-trip"),
  );

  it("contains the round-trip block", () => {
    expect(block.length).toBeGreaterThan(0);
    expect(harness).toContain('from "./_helpers/form-access-round-trip.mjs"');
    expect(harness).toContain('join(scriptDir, "_helpers", "form-access-round-trip.mjs")');
  });

  it("applies each scenario, verifies, reverts, and verifies again", () => {
    expect(block).toMatch(/for \(const scenario of FORM_ROUND_TRIP_SCENARIOS\)/);
    expect(block).toMatch(/apply: true/);
    expect(block).toMatch(
      /record\(\s*"forms",\s*"verify_code:form-round-trip"[\s\S]*?diagnostic: true[\s\S]*?timeoutMs: 180000/,
    );
    expect(block).toMatch(/writeFile\(formRoundTripPath, originalBytes\)/);
    expect(block).toContain('importFormRoundTrip("import_modules:form-round-trip-revert")');
    expect(block).toMatch(
      /moduleNames: \[FORM_ROUND_TRIP_MODULE\], apply: true, timeoutMs: 180000/,
    );
    expect(block).toContain("verify-reverted");
    expect(block).toContain("errors.txt");
    expect(block).toContain('"FORM_IMPORT_GATE_FAILED"');
    expect(block).toMatch(/record\(\s*"forms",\s*"create_form_from_template:access-round-trip"/);
    expect(block).toMatch(/targetForm: FORM_ROUND_TRIP_CLONE_MODULE/);
  });

  it("stops the battery when a revert leaves the sandbox state unknown", () => {
    expect(harness).toMatch(/\.\.\.FORM_ROUND_TRIP_SAFETY_STEPS/);
  });
});
