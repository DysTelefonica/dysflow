import { describe, expect, it, vi } from "vitest";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../../src/adapters/mcp/schemas/vba-sync-schemas";
import {
  VbaFormsAdapter,
  type VbaFormsOrchestrator,
} from "../../../../src/adapters/vba-sync/vba-forms-adapter";
import { successResult } from "../../../../src/core/contracts/index";
import type { FormUiBehaviorMap } from "../../../../src/core/models/form-ui-builder";
import type { FormFileSystemPort } from "../../../../src/core/services/vba-form-service";
import type { JsonSchemaProperty } from "../../../../src/shared/validation/schemas";
import { validateInput } from "../../../../src/shared/validation/validator";

const OPERATION_KINDS = [
  "add-control",
  "delete-control",
  "move-control",
  "note",
  "rename-control",
  "set-property",
] as const;
const DOCS_PLACEHOLDER = "TODO: replace this scaffold with a runtime-verified usage contract.";

const BASE_MAP: FormUiBehaviorMap = {
  formName: "Customer",
  controls: [
    {
      name: "cmdSave",
      type: "CommandButton",
      role: "action",
      events: ["OnClick"],
      bindings: [],
      codegraphEvidence: [
        { handler: "cmdSave_Click", callPath: ["cmdSave_Click", "SaveCustomer"] },
      ],
      properties: { Left: "100", Top: "100", Width: "1000", Height: "300" },
    },
  ],
  formEvents: [],
  unmappedEvidence: [],
  warnings: [],
};

function expectDocumentedObject(
  property: JsonSchemaProperty | undefined,
  required: readonly string[],
): asserts property is JsonSchemaProperty {
  expect(property?.type).toBe("object");
  expect(property?.properties).toBeDefined();
  expect(property?.required).toEqual(expect.arrayContaining([...required]));
  for (const name of required) {
    const child = property?.properties?.[name];
    expect(child?.type, `${name} must publish its type`).toBeDefined();
    expect(child?.description?.trim().length, `${name} must publish a description`).toBeGreaterThan(
      0,
    );
  }
}

function makeOrchestrator(): VbaFormsOrchestrator {
  return {
    executor: vi.fn(),
    env: {},
    cwd: "C:/repo",
    resolveExecutionTarget: vi.fn().mockResolvedValue(
      successResult({
        accessPath: "C:/repo/App.accdb",
        destinationRoot: "C:/repo",
        projectRoot: "C:/repo",
        timeoutMs: 30_000,
        configSource: "explicit-request",
      }),
    ),
    validateStrictContext: vi.fn(() => successResult(undefined)),
    executeMappedTool: vi.fn().mockResolvedValue(successResult({ imported: true })),
  };
}

function makeFileSystem(writeFile: FormFileSystemPort["writeFile"]): FormFileSystemPort {
  return {
    mkdir: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
    readJson: vi.fn(),
    writeFile,
  };
}

function resultData(
  result: Awaited<ReturnType<VbaFormsAdapter["execute"]>>,
): Record<string, unknown> {
  expect(result.ok).toBe(true);
  if (!result.ok || typeof result.data !== "object" || result.data === null) {
    throw new Error("Expected a successful object result");
  }
  return result.data as Record<string, unknown>;
}

const FORM_INDICADOR_CONTROL_NAMES = [
  "EncabezadoDelFormulario",
  "lblTitulo",
  "cmdAyuda",
  "Detalle",
  "rectFiltro",
  "cmdCalcular",
  "cboSemestre",
  "txtAnio",
  "Etiqueta59",
  "Etiqueta121",
  "shTile1",
  "lblTile1Titulo",
  "shTile2",
  "shTile3",
  "shTile4",
  "lblTile1Valor",
  "cmdTile1Excel",
  "lblTit2",
  "lblTile2Valor",
  "cmdTile2Excel",
  "lblTit3",
  "lblTile3Valor",
  "cmdTile3Excel",
  "lblTit4",
  "lblTile4Valor",
  "cmdTile4Excel",
  "cmdCargarProyectos",
  "lblProyectosCargados",
  "shTile5",
  "lblTit5",
  "lblTile5Valor",
  "cmdTile5Excel",
  "shTile6",
  "lblTit6",
  "lblTile6Valor",
  "cmdTile6Excel",
  "PieDelFormulario",
  "btnSalir",
] as const;

const FORM_INDICADOR_TILE_GEOMETRY: Record<
  string,
  { Left: string; Top: string; Width: string; Height: string; TabIndex: string; GUID?: string }
> = {
  cmdTile1Excel: { Left: "4287", Top: "3091", Width: "448", Height: "448", TabIndex: "3" },
  cmdTile2Excel: { Left: "9123", Top: "3091", Width: "448", Height: "448", TabIndex: "4" },
  cmdTile3Excel: { Left: "4287", Top: "5092", Width: "448", Height: "448", TabIndex: "5" },
  cmdTile4Excel: { Left: "9123", Top: "5092", Width: "448", Height: "448", TabIndex: "6" },
  cmdTile5Excel: {
    Left: "4287",
    Top: "6992",
    Width: "448",
    Height: "448",
    TabIndex: "8",
    GUID: "0x6efe25de7eddc44e992c942cfc8e983f",
  },
  cmdTile6Excel: { Left: "9123", Top: "6992", Width: "448", Height: "448", TabIndex: "9" },
};

const FORM_INDICADOR_MAP: FormUiBehaviorMap = {
  formName: "FormIndicador",
  controls: FORM_INDICADOR_CONTROL_NAMES.map((name) => {
    const geometry = FORM_INDICADOR_TILE_GEOMETRY[name];
    return {
      name,
      type: name.startsWith("cmdTile") ? "CommandButton" : "Control",
      role: name.startsWith("cmd") ? ("action" as const) : ("unknown" as const),
      events: name.startsWith("cmdTile") ? ["OnClick"] : [],
      bindings: [],
      codegraphEvidence: [],
      ...(geometry === undefined ? {} : { properties: geometry }),
    };
  }),
  formEvents: [],
  unmappedEvidence: [],
  warnings: [],
};

describe("issue #1033 — non-opaque nested schemas for form UI tools", () => {
  it("publishes generate_form_design_plan behaviorMap and discriminated plan shapes", () => {
    const schema = VBA_SYNC_TOOL_SCHEMAS.generate_form_design_plan;
    expectDocumentedObject(schema.properties.behaviorMap, [
      "formName",
      "controls",
      "formEvents",
      "unmappedEvidence",
      "warnings",
    ]);
    expectDocumentedObject(schema.properties.plan, ["operations"]);

    const operation = schema.properties.plan?.properties?.operations?.items;
    expectDocumentedObject(operation, ["kind", "target", "intent", "params"]);
    expect(operation?.additionalProperties).toBe(false);
    expect(operation?.properties?.kind?.enum).toEqual(OPERATION_KINDS);

    const valid = validateInput(
      {
        behaviorMap: BASE_MAP,
        plan: {
          operations: [
            {
              kind: "note",
              target: "cmdSave",
              intent: "Keep the primary action visible",
              params: { sourceForm: "Order" },
            },
          ],
        },
      },
      schema,
    );
    expect(valid).toBeUndefined();

    const invalid = validateInput(
      {
        behaviorMap: BASE_MAP,
        plan: {
          operations: [{ kind: "unknown", target: "cmdSave", intent: "invalid", params: {} }],
        },
      },
      schema,
    );
    expect(invalid).toMatch(/kind|operations\[0\]/i);
  });

  it("publishes copy_form_ui_pattern behaviorMap and closed referencePattern shapes", () => {
    const schema = VBA_SYNC_TOOL_SCHEMAS.copy_form_ui_pattern;
    expectDocumentedObject(schema.properties.behaviorMap, [
      "formName",
      "controls",
      "formEvents",
      "unmappedEvidence",
      "warnings",
    ]);
    expectDocumentedObject(schema.properties.referencePattern, [
      "sourceForm",
      "intent",
      "mappedControls",
    ]);
    expect(schema.properties.referencePattern?.additionalProperties).toBe(false);
    expect(schema.properties.referencePattern?.properties?.mappedControls).toMatchObject({
      type: "object",
      additionalProperties: { type: "string" },
    });
    expect(
      validateInput(
        {
          behaviorMap: BASE_MAP,
          referencePattern: {
            sourceForm: "Order",
            intent: "Reuse footer action grouping",
            mappedControls: { cmdCommit: "cmdSave" },
          },
        },
        schema,
      ),
    ).toBeUndefined();
  });

  it("publishes verify_form_ui source and applied contracts without inventing an unsupported checks[] input", () => {
    const schema = VBA_SYNC_TOOL_SCHEMAS.verify_form_ui;
    expectDocumentedObject(schema.properties.sourceContract, [
      "formName",
      "controls",
      "formEvents",
      "unmappedEvidence",
      "warnings",
    ]);
    expectDocumentedObject(schema.properties.appliedContract, [
      "formName",
      "controls",
      "formEvents",
      "unmappedEvidence",
      "warnings",
    ]);
    expect(schema.properties).not.toHaveProperty("checks");
    expect(
      validateInput({ sourceContract: BASE_MAP, appliedContract: BASE_MAP }, schema),
    ).toBeUndefined();
  });

  it("accepts constructable payloads for all three read-only tools and returns mode:dry-run without writes", async () => {
    const writeFile = vi.fn<FormFileSystemPort["writeFile"]>();
    const adapter = new VbaFormsAdapter(makeOrchestrator(), makeFileSystem(writeFile));
    const cases = [
      {
        name: "generate_form_design_plan",
        input: {
          behaviorMap: BASE_MAP,
          plan: {
            operations: [
              { kind: "note", target: "cmdSave", intent: "Preserve action", params: {} },
            ],
          },
        },
      },
      {
        name: "copy_form_ui_pattern",
        input: {
          behaviorMap: BASE_MAP,
          referencePattern: {
            sourceForm: "Order",
            intent: "Reuse action placement",
            mappedControls: { cmdCommit: "cmdSave" },
          },
        },
      },
      {
        name: "verify_form_ui",
        input: { sourceContract: BASE_MAP, appliedContract: BASE_MAP },
      },
    ] as const;

    for (const { name, input } of cases) {
      expect(validateInput(input, VBA_SYNC_TOOL_SCHEMAS[name]), `${name} schema`).toBeUndefined();
      const data = resultData(await adapter.execute(name, input));
      expect(data.mode, `${name} mode`).toBe("dry-run");
    }
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("publishes a runtime-owned usage contract with no docs-side TODO scaffold text", () => {
    const targetSchemas = [
      VBA_SYNC_TOOL_SCHEMAS.generate_form_design_plan,
      VBA_SYNC_TOOL_SCHEMAS.copy_form_ui_pattern,
      VBA_SYNC_TOOL_SCHEMAS.verify_form_ui,
    ];
    const published = JSON.stringify(targetSchemas);
    expect(published).not.toContain(DOCS_PLACEHOLDER);
    for (const schema of targetSchemas) {
      for (const property of Object.values(schema.properties)) {
        if (property.type !== "object" && property.type !== "array") continue;
        expect(property.description?.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("verifies the real FormIndicador 38-control tile fixture through verify_form_ui", async () => {
    expect(FORM_INDICADOR_MAP.controls).toHaveLength(38);
    expect(
      FORM_INDICADOR_MAP.controls.find((control) => control.name === "cmdTile5Excel")?.properties
        ?.GUID,
    ).toBe("0x6efe25de7eddc44e992c942cfc8e983f");

    const writeFile = vi.fn<FormFileSystemPort["writeFile"]>();
    const adapter = new VbaFormsAdapter(makeOrchestrator(), makeFileSystem(writeFile));
    const input = {
      sourceContract: FORM_INDICADOR_MAP,
      appliedContract: FORM_INDICADOR_MAP,
    };
    expect(validateInput(input, VBA_SYNC_TOOL_SCHEMAS.verify_form_ui)).toBeUndefined();

    const data = resultData(await adapter.execute("verify_form_ui", input));
    expect(data).toMatchObject({ mode: "dry-run", ok: true });
    expect(data.checkedControls).toHaveLength(38);
    expect(data.survivedFindings).toEqual([]);
    expect(
      (data.looksRightFindings as Array<{ code: string }>).filter(
        (finding) => finding.code === "FORM_UI_OVERLAPPING_BOUNDS",
      ),
    ).toEqual([]);
    expect(writeFile).not.toHaveBeenCalled();
  });
});
