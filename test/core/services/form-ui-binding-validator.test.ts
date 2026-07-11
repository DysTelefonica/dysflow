import { describe, expect, it } from "vitest";
import type { FormIR, FormNode } from "../../../src/core/models/form-ir";
import {
  type BindingFinding,
  type ColumnSchema,
  extractBindingsFromControlSource,
  extractBindingsFromRowSource,
  type FormBindingSchema,
  validateBindings,
} from "../../../src/core/services/form-ui-binding-validator";

// ---------------------------------------------------------------------------
// Issue #818 — `verify_form_bindings` core service.
//
// The pure validator sits between `get_schema` (which yields the
// `Record<tableName, ColumnSchema[]>` aggregate) and the .form.txt's bindings
// (ControlSource / RowSource per control). The aggregator pre-walks every
// table once via `get_schema`; the validator is then a pure IR-level lint
// over the in-memory form contract. Adapter I/O lives elsewhere — this
// module never imports the fileSystem port and never opens Access.
//
// Pinned behavioral contract (issue spec):
//   - Missing table → control binds to a table not in the schema.
//   - Missing column → control binds to a column not in the table.
//   - Type mismatch → ComboBox/ListBox RowSource column count != 2
//     (text/value pair shape), or Number column bound to a CheckBox.
//   - Empty binding → ControlSource is "" or whitespace-only.
//   - Unparseable SQL → RowSource SQL could not be parsed.
//   - Every finding carries `severity: "warning"` (informational; the tool
//     is read-only and never gating — matches the dispatch route risk).
// ---------------------------------------------------------------------------

function makeControl(blockType: string, props: Record<string, string>): FormNode {
  return {
    blockType,
    entries: Object.entries(props).map(([key, value]) => ({
      kind: "scalar",
      key,
      value,
    })),
    children: [],
  };
}

function makeForm(controls: FormNode[]): FormIR {
  return {
    name: "TestForm",
    kind: "Form",
    preamble: [],
    root: {
      blockType: "Form",
      entries: [],
      children: controls,
    },
    codeBehind: null,
  };
}

const SCHEMA: FormBindingSchema = {
  Customers: [
    { name: "Id", type: "Long", nullable: false },
    { name: "Name", type: "Text", nullable: true },
    { name: "Email", type: "Text", nullable: true },
    { name: "IsActive", type: "YesNo", nullable: false },
    { name: "CreatedAt", type: "DateTime", nullable: false },
  ],
  Orders: [
    { name: "Id", type: "Long", nullable: false },
    { name: "CustomerId", type: "Long", nullable: false },
    { name: "Total", type: "Currency", nullable: false },
  ],
};

describe("validateBindings — missing table", () => {
  it("emits FORM_BINDING_MISSING_TABLE when ControlSource references a table not in the schema", () => {
    const form = makeForm([
      makeControl("TextBox", {
        Name: '"txtGhost"',
        ControlSource: "=Ghosts.Name",
      }),
    ]);
    const findings = validateBindings(form, SCHEMA);
    const f = findings.find((finding) => finding.code === "FORM_BINDING_MISSING_TABLE");
    expect(f, "missing-table finding must be emitted").toBeDefined();
    expect(f?.severity).toBe("warning");
    expect(f?.controlName).toBe("txtGhost");
    expect(f?.data).toMatchObject({ table: "Ghosts", binding: "ControlSource" });
  });

  it("emits FORM_BINDING_MISSING_TABLE for RowSource FROM clause", () => {
    const form = makeForm([
      makeControl("ComboBox", {
        Name: '"cmbGhost"',
        RowSource: "SELECT Id, Name FROM Ghosts",
      }),
    ]);
    const findings = validateBindings(form, SCHEMA);
    const f = findings.find((finding) => finding.code === "FORM_BINDING_MISSING_TABLE");
    expect(f?.severity).toBe("warning");
    expect(f?.data).toMatchObject({ table: "Ghosts", binding: "RowSource" });
  });
});

describe("validateBindings — missing column", () => {
  it("emits FORM_BINDING_MISSING_COLUMN when ControlSource references a column not in the table", () => {
    const form = makeForm([
      makeControl("TextBox", {
        Name: '"txtNope"',
        ControlSource: "=Customers.Phantom",
      }),
    ]);
    const findings = validateBindings(form, SCHEMA);
    const f = findings.find((finding) => finding.code === "FORM_BINDING_MISSING_COLUMN");
    expect(f?.severity).toBe("warning");
    expect(f?.controlName).toBe("txtNope");
    expect(f?.data).toMatchObject({
      table: "Customers",
      column: "Phantom",
      binding: "ControlSource",
    });
  });

  it("emits FORM_BINDING_MISSING_COLUMN for RowSource column refs", () => {
    const form = makeForm([
      makeControl("ComboBox", {
        Name: '"cmbBad"',
        RowSource: "SELECT Id, Phantom FROM Customers",
      }),
    ]);
    const findings = validateBindings(form, SCHEMA);
    const f = findings.find((finding) => finding.code === "FORM_BINDING_MISSING_COLUMN");
    expect(f?.severity).toBe("warning");
    expect(f?.data).toMatchObject({ table: "Customers", column: "Phantom" });
  });

  it("treats [bracketed] identifiers as the same identifier (no false missing-column)", () => {
    // The schema key is "Customers"; the form binds to "[Customers].[Name]".
    // Bracket-quoting is an Access convention; the validator strips it.
    const form = makeForm([
      makeControl("ComboBox", {
        Name: '"cmbName"',
        RowSource: "SELECT [Id], [Name] FROM [Customers]",
      }),
    ]);
    const findings = validateBindings(form, SCHEMA);
    const missing = findings.filter(
      (finding) =>
        finding.code === "FORM_BINDING_MISSING_TABLE" ||
        finding.code === "FORM_BINDING_MISSING_COLUMN",
    );
    expect(missing, "no false missing refs for bracket-quoted identifiers").toEqual([]);
  });
});

describe("validateBindings — empty binding", () => {
  it("emits FORM_BINDING_EMPTY when ControlSource is empty", () => {
    const form = makeForm([
      makeControl("TextBox", {
        Name: '"txtEmpty"',
        ControlSource: "",
      }),
    ]);
    const findings = validateBindings(form, SCHEMA);
    const f = findings.find((finding) => finding.code === "FORM_BINDING_EMPTY");
    expect(f?.severity).toBe("warning");
    expect(f?.controlName).toBe("txtEmpty");
  });

  it("emits FORM_BINDING_EMPTY when ControlSource is whitespace-only", () => {
    const form = makeForm([
      makeControl("TextBox", {
        Name: '"txtWs"',
        ControlSource: "   ",
      }),
    ]);
    const findings = validateBindings(form, SCHEMA);
    expect(findings.find((finding) => finding.code === "FORM_BINDING_EMPTY")).toBeDefined();
  });

  it("does NOT emit FORM_BINDING_EMPTY when ControlSource is omitted entirely (no binding property present)", () => {
    const form = makeForm([
      makeControl("Label", {
        Name: '"lblNoBinding"',
        Caption: '"Just a label"',
      }),
    ]);
    const findings = validateBindings(form, SCHEMA);
    expect(findings.filter((f) => f.code === "FORM_BINDING_EMPTY")).toEqual([]);
  });
});

describe("validateBindings — unparseable SQL", () => {
  it("emits FORM_BINDING_SQL_UNPARSEABLE when RowSource is not recognizable SQL", () => {
    const form = makeForm([
      makeControl("ComboBox", {
        Name: '"cmbWeird"',
        RowSource: "lorem ipsum dolor sit amet",
      }),
    ]);
    const findings = validateBindings(form, SCHEMA);
    const f = findings.find((finding) => finding.code === "FORM_BINDING_SQL_UNPARSEABLE");
    expect(f?.severity).toBe("warning");
    expect(f?.controlName).toBe("cmbWeird");
  });
});

describe("validateBindings — type mismatch", () => {
  it("emits FORM_BINDING_TYPE_MISMATCH when ComboBox RowSource returns exactly one column (expected value+text pair)", () => {
    const form = makeForm([
      makeControl("ComboBox", {
        Name: '"cmbOne"',
        RowSource: "SELECT Name FROM Customers",
      }),
    ]);
    const findings = validateBindings(form, SCHEMA);
    const f = findings.find((finding) => finding.code === "FORM_BINDING_TYPE_MISMATCH");
    expect(f?.severity).toBe("warning");
    expect(f?.controlName).toBe("cmbOne");
    expect(f?.data).toMatchObject({ reason: "ComboBox expects 2+ columns (value + display)" });
  });

  it("does NOT emit type-mismatch for ComboBox with a 2-column RowSource", () => {
    const form = makeForm([
      makeControl("ComboBox", {
        Name: '"cmbTwo"',
        RowSource: "SELECT Id, Name FROM Customers",
      }),
    ]);
    const findings = validateBindings(form, SCHEMA);
    const mismatches = findings.filter((finding) => finding.code === "FORM_BINDING_TYPE_MISMATCH");
    expect(mismatches).toEqual([]);
  });

  it("emits FORM_BINDING_TYPE_MISMATCH when ListBox RowSource returns exactly one column", () => {
    const form = makeForm([
      makeControl("ListBox", {
        Name: '"lstOne"',
        RowSource: "SELECT Name FROM Customers",
      }),
    ]);
    const findings = validateBindings(form, SCHEMA);
    expect(findings.find((finding) => finding.code === "FORM_BINDING_TYPE_MISMATCH")).toBeDefined();
  });
});

describe("validateBindings — happy path", () => {
  it("emits no findings for a well-bound form (ControlSource + valid RowSource)", () => {
    const form = makeForm([
      makeControl("TextBox", {
        Name: '"txtName"',
        ControlSource: "=Customers.Name",
      }),
      makeControl("TextBox", {
        Name: '"txtCreated"',
        ControlSource: "=Customers.CreatedAt",
      }),
      makeControl("ComboBox", {
        Name: '"cmbCust"',
        RowSource: "SELECT Id, Name FROM Customers",
      }),
    ]);
    const findings = validateBindings(form, SCHEMA);
    expect(findings).toEqual([]);
  });
});

describe("validateBindings — pure (no I/O)", () => {
  it("returns the same findings on repeated calls with the same input (deterministic)", () => {
    const form = makeForm([
      makeControl("TextBox", {
        Name: '"txtGhost"',
        ControlSource: "=Ghosts.Name",
      }),
    ]);
    const a = validateBindings(form, SCHEMA);
    const b = validateBindings(form, SCHEMA);
    expect(a).toEqual(b);
  });

  it("does NOT mutate the input FormIR or the schema (input is read-only)", () => {
    const form = makeForm([
      makeControl("TextBox", {
        Name: '"txtGhost"',
        ControlSource: "=Ghosts.Name",
      }),
    ]);
    const irSnapshot = JSON.stringify(form);
    const schemaSnapshot = JSON.stringify(SCHEMA);
    validateBindings(form, SCHEMA);
    expect(JSON.stringify(form)).toBe(irSnapshot);
    expect(JSON.stringify(SCHEMA)).toBe(schemaSnapshot);
  });
});

describe("extractBindingsFromControlSource — helper", () => {
  it("returns a column-only binding when the value has no dot (implicit table)", () => {
    expect(extractBindingsFromControlSource("Name")).toEqual([{ column: "Name" }]);
  });

  it("returns a table.column binding when the value has one dot", () => {
    expect(extractBindingsFromControlSource("Customers.Name")).toEqual([
      { table: "Customers", column: "Name" },
    ]);
  });

  it("strips bracket-quoted identifiers ([Customers].[Name])", () => {
    expect(extractBindingsFromControlSource("[Customers].[Name]")).toEqual([
      { table: "Customers", column: "Name" },
    ]);
  });

  it("returns an empty array for an empty / whitespace value", () => {
    expect(extractBindingsFromControlSource("")).toEqual([]);
    expect(extractBindingsFromControlSource("   ")).toEqual([]);
  });

  it("returns an empty array when the value is an expression (= prefix)", () => {
    expect(extractBindingsFromControlSource("=IIf([Active]=True, 1, 0)")).toEqual([]);
    expect(extractBindingsFromControlSource("=Date()")).toEqual([]);
  });

  it("handles multi-dot dotted identifiers (parent.child.leaf) as one chain", () => {
    expect(extractBindingsFromControlSource("a.b.c")).toEqual([{ table: "a", column: "b.c" }]);
  });
});

describe("extractBindingsFromRowSource — helper", () => {
  it("extracts the FROM table from a simple SELECT", () => {
    const refs = extractBindingsFromRowSource("SELECT Id, Name FROM Customers");
    expect(refs).toEqual([
      { table: "Customers" },
      { table: "Customers", column: "Id" },
      { table: "Customers", column: "Name" },
    ]);
  });

  it("strips bracket-quoted table identifiers ([Customers])", () => {
    const refs = extractBindingsFromRowSource("SELECT Id, Name FROM [Customers]");
    expect(refs.find((r) => r.table === "Customers")).toBeDefined();
  });

  it("resolves alias.column references back to the alias's table", () => {
    // SELECT c.Id, c.Name FROM Customers AS c
    const refs = extractBindingsFromRowSource("SELECT c.Id, c.Name FROM Customers AS c");
    expect(refs).toContainEqual({ table: "Customers", column: "Id" });
    expect(refs).toContainEqual({ table: "Customers", column: "Name" });
  });

  it("handles explicit JOINs (FROM Orders o INNER JOIN Customers c ON ...)", () => {
    const refs = extractBindingsFromRowSource(
      "SELECT c.Name, o.Total FROM Orders AS o INNER JOIN Customers AS c ON o.CustomerId = c.Id",
    );
    // FROM Orders: at least one ref to Orders
    expect(refs.some((r) => r.table === "Orders")).toBe(true);
    // FROM Customers: at least one ref to Customers
    expect(refs.some((r) => r.table === "Customers")).toBe(true);
    // c.Name -> Customers.Name; o.Total -> Orders.Total
    expect(refs).toContainEqual({ table: "Customers", column: "Name" });
    expect(refs).toContainEqual({ table: "Orders", column: "Total" });
  });

  it("returns an empty array for SQL that has no FROM clause", () => {
    // No FROM = expression / literal; nothing to validate.
    expect(extractBindingsFromRowSource("SELECT 1")).toEqual([]);
  });

  it("returns an empty array for unparseable input", () => {
    expect(extractBindingsFromRowSource("lorem ipsum")).toEqual([]);
    expect(extractBindingsFromRowSource("")).toEqual([]);
  });
});

describe("validateBindings — schema-shape tolerance", () => {
  it("treats an undefined column on a known table as missing (defensive: malformed schema rows)", () => {
    const partial: FormBindingSchema = {
      Customers: [{ name: "Id", type: "Long", nullable: false }] as ColumnSchema[],
    };
    const form = makeForm([
      makeControl("TextBox", {
        Name: '"txtName"',
        ControlSource: "=Customers.Name",
      }),
    ]);
    const findings = validateBindings(form, partial);
    expect(findings.find((f) => f.code === "FORM_BINDING_MISSING_COLUMN")).toBeDefined();
  });

  it("treats a missing table entry (undefined columns array) as missing-table", () => {
    const partial: FormBindingSchema = {
      Customers: undefined as unknown as ColumnSchema[],
    };
    const form = makeForm([
      makeControl("TextBox", {
        Name: '"txtName"',
        ControlSource: "=Customers.Name",
      }),
    ]);
    const findings = validateBindings(form, partial);
    expect(findings.find((f) => f.code === "FORM_BINDING_MISSING_TABLE")).toBeDefined();
  });
});

describe("validateBindings — finding envelope contract", () => {
  it("every finding carries severity='warning' (read-only stance, never gating)", () => {
    const form = makeForm([
      makeControl("TextBox", {
        Name: '"txtGhost"',
        ControlSource: "=Ghosts.Name",
      }),
      makeControl("TextBox", { Name: '"txtEmpty"', ControlSource: "" }),
      makeControl("ComboBox", {
        Name: '"cmbBad"',
        RowSource: "SELECT X FROM Customers",
      }),
    ]);
    const findings = validateBindings(form, SCHEMA);
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings as BindingFinding[]) {
      expect(finding.severity).toBe("warning");
    }
  });
});
