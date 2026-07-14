export type VbaLintSource = {
  path: string;
  text: string;
};

export type MissingCallee = {
  file: string;
  line: number;
  column: number;
  name: string;
  module: string;
  kind: "call" | "method";
};

export type VbaMissingCalleesLintResult = {
  ok: boolean;
  elapsedMs: number;
  totals: { declarations: number; missing: number; unused: number };
  missing: MissingCallee[];
  unused: string[];
};

export type VbaMissingCalleesLintOptions = {
  additionalExclusions?: readonly string[];
};

// Sources: VBA language keywords and intrinsic functions documented in the
// Microsoft VBA Language Reference. These names are provided by the runtime,
// not by consumer source trees.
const VBA_RUNTIME_NAMES = [
  "Array",
  "Asc",
  "CStr",
  "CInt",
  "CLng",
  "CDbl",
  "CDate",
  "CBool",
  "Chr",
  "CreateObject",
  "Date",
  "DateAdd",
  "DateDiff",
  "DatePart",
  "Debug",
  "Dir",
  "DoCmd",
  "Environ",
  "Err",
  "Eval",
  "Format",
  "GetObject",
  "IIf",
  "InputBox",
  "InStr",
  "IsDate",
  "IsEmpty",
  "IsError",
  "IsNull",
  "IsNumeric",
  "Join",
  "LBound",
  "Left",
  "Len",
  "LCase",
  "Mid",
  "MsgBox",
  "Nz",
  "Replace",
  "Right",
  "Rnd",
  "Round",
  "Space",
  "Split",
  "StrComp",
  "String",
  "Timer",
  "Trim",
  "TypeName",
  "UBound",
  "UCase",
  "Val",
  "VBA",
  "Application",
  "Me",
  "CurrentDb",
  "DBEngine",
  "And",
  "As",
  "ByRef",
  "ByVal",
  "Call",
  "Case",
  "Const",
  "Do",
  "Each",
  "Else",
  "ElseIf",
  "Empty",
  "End",
  "Error",
  "Exit",
  "False",
  "For",
  "Function",
  "GoSub",
  "GoTo",
  "If",
  "Let",
  "Loop",
  "Mod",
  "New",
  "Next",
  "Not",
  "Nothing",
  "Null",
  "On",
  "Open",
  "Option",
  "Or",
  "Private",
  "Property",
  "Public",
  "ReDim",
  "Resume",
  "Select",
  "Set",
  "Static",
  "Step",
  "Stop",
  "Sub",
  "Then",
  "To",
  "True",
  "Until",
  "Wend",
  "While",
  "With",
  "Xor",
];

// Sources: Microsoft DAO object model reference. Receiver types are not always
// statically available in VBA, so these well-known members are conservatively
// treated as runtime-provided.
const DAO_RUNTIME_MEMBERS = [
  "AddNew",
  "BOF",
  "CancelUpdate",
  "Close",
  "CreateField",
  "CreateIndex",
  "CreateQueryDef",
  "CreateRelation",
  "CreateTableDef",
  "Edit",
  "EOF",
  "Execute",
  "Fields",
  "FindFirst",
  "FindLast",
  "FindNext",
  "FindPrevious",
  "Indexes",
  "MoveFirst",
  "MoveLast",
  "MoveNext",
  "MovePrevious",
  "OpenDatabase",
  "OpenRecordset",
  "Parameters",
  "QueryDefs",
  "RecordCount",
  "RecordsAffected",
  "Relations",
  "TableDefs",
  "Update",
  "Workspaces",
];

// Sources: Microsoft Access object model and VBA Collection/Dictionary APIs.
// These are implicit or late-bound members that do not have declarations in a
// consumer's .bas/.cls source tree.
const IMPLICIT_RUNTIME_MEMBERS = [
  "ActiveControl",
  "ActiveForm",
  "Add",
  "Clear",
  "Controls",
  "Count",
  "Exists",
  "Forms",
  "Hide",
  "Item",
  "Items",
  "Keys",
  "Pages",
  "Print",
  "Properties",
  "Raise",
  "Remove",
  "RemoveAll",
  "Reports",
  "Run",
  "Screen",
  "SetFocus",
  "Show",
];

const DECLARATION_RE =
  /^\s*(?:(?:Public|Private|Friend|Static)\s+)?(?:Function|Sub|Property\s+(?:Get|Let|Set))\s+([A-Za-z_][A-Za-z0-9_]*)/gim;
const CALL_RE = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
const STATEMENT_CALL_RE =
  /^\s*(?:Call\s+)?(?:[A-Za-z_][A-Za-z0-9_]*\.)*([A-Za-z_][A-Za-z0-9_]*)\b(.*)$/i;
const IGNORE_DIRECTIVE = "dysflow:lint-ignore-line";

type Declaration = { name: string; key: string };

export function lintVbaMissingCallees(
  sources: readonly VbaLintSource[],
  options: VbaMissingCalleesLintOptions = {},
): VbaMissingCalleesLintResult {
  const started = performance.now();
  const excluded = new Set(
    [
      ...VBA_RUNTIME_NAMES,
      ...DAO_RUNTIME_MEMBERS,
      ...IMPLICIT_RUNTIME_MEMBERS,
      ...(options.additionalExclusions ?? []),
    ].map((name) => name.toLowerCase()),
  );
  const declarations = new Map<string, Declaration>();

  for (const source of sources) {
    for (const match of source.text.matchAll(DECLARATION_RE)) {
      const name = match[1];
      if (name === undefined) continue;
      declarations.set(name.toLowerCase(), { name, key: name.toLowerCase() });
    }
  }

  const referenced = new Set<string>();
  const missing: MissingCallee[] = [];
  for (const source of sources) {
    const module = moduleName(source.path, source.text);
    const lines = source.text.split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex] ?? "";
      if (line.toLowerCase().includes(IGNORE_DIRECTIVE) || isDeclarationLine(line)) continue;
      const executable = removeCommentAndStrings(line);
      for (const reference of referencesOnLine(executable)) {
        const { name, column, kind } = reference;
        const key = name.toLowerCase();
        referenced.add(key);
        if (declarations.has(key) || excluded.has(key)) continue;
        missing.push({
          file: source.path.replaceAll("\\", "/"),
          line: lineIndex + 1,
          column,
          name,
          module,
          kind,
        });
      }
    }
  }

  const unused = [...declarations.values()]
    .filter(({ key }) => !referenced.has(key))
    .map(({ name }) => name)
    .sort((left, right) => left.localeCompare(right));
  const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
  return {
    ok: missing.length === 0,
    elapsedMs,
    totals: { declarations: declarations.size, missing: missing.length, unused: unused.length },
    missing,
    unused,
  };
}

function referencesOnLine(
  executable: string,
): Array<{ name: string; column: number; kind: "call" | "method" }> {
  const references = [...executable.matchAll(CALL_RE)].flatMap((match) => {
    const name = match[1];
    if (name === undefined) return [];
    const before = executable.slice(0, match.index);
    return [
      {
        name,
        column: match.index + 1,
        kind: before.trimEnd().endsWith(".") ? "method" : "call",
      } as const,
    ];
  });
  const statement = executable.match(STATEMENT_CALL_RE);
  const name = statement?.[1];
  const tail = statement?.[2]?.trimStart() ?? "";
  if (name === undefined || tail.startsWith("(") || /^[=:]/.test(tail)) return references;
  const column = executable.toLowerCase().lastIndexOf(name.toLowerCase()) + 1;
  if (references.some((reference) => reference.name.toLowerCase() === name.toLowerCase())) {
    return references;
  }
  return [
    ...references,
    { name, column, kind: executable.slice(0, column - 1).includes(".") ? "method" : "call" },
  ];
}

function isDeclarationLine(line: string): boolean {
  DECLARATION_RE.lastIndex = 0;
  return DECLARATION_RE.test(line);
}

function moduleName(path: string, text: string): string {
  const attribute = text.match(/^\s*Attribute\s+VB_Name\s*=\s*"([^"]+)"/im)?.[1];
  if (attribute !== undefined) return attribute;
  return (
    path
      .replaceAll("\\", "/")
      .split("/")
      .at(-1)
      ?.replace(/\.(?:bas|cls)$/i, "") ?? path
  );
}

function removeCommentAndStrings(line: string): string {
  let output = "";
  let inString = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inString && line[index + 1] === '"') {
        output += "  ";
        index += 1;
        continue;
      }
      inString = !inString;
      output += " ";
      continue;
    }
    if (char === "'" && !inString) break;
    output += inString ? " " : char;
  }
  return output;
}
