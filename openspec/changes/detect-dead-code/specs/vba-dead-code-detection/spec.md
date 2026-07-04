# Delta Spec — vba-dead-code-detection

## ADDED Requirements

### Purpose

Read-only detection of VBA procedures and module-level declarations that are defined but never referenced, exposed via the `dysflow_detect_dead_code` MCP tool. Sibling capability: the `#701` modern procedure tools (`dysflow_list_procedures`, `dysflow_get_procedure`, `dysflow_find_references`). The tool follows the **modern MCP tool path**, NOT the dispatch-routes path.

### Requirement: Core dead-code detection

The system MUST expose `detectDeadCode(modules: Record<string,string>, opts?: { scope?: "binary" | "source" | "module"; module?: string }): DeadCodeReport | undefined` in `src/core/services/vba-procedure-service.ts`. The function MUST collect procedures via `listVbaProcedures` and module-level declarations, then for each symbol run `findVbaReferences` with string-literal stripping (`stripStrings`) and word-boundary matching (`\b<name>\b`). Symbols with no non-definition references MUST be returned as dead code. Symbols in the special-name allowlist MUST NOT be returned. The tool MUST be a pure function over the in-memory `modules` map and MUST NOT read or write any filesystem path. When `opts.module` is provided and no case-insensitive module match exists, the function MUST return `undefined` so the MCP handler can surface `MODULE_NOT_FOUND`; an empty inline `modules` map without a module constraint returns an empty `DeadCodeReport`.

| Scenario | Setup | When | Then |
|----------|-------|------|------|
| Unreferenced procedure | `ModA.UnusedProc`, `ModB.UsedProc` + call to `UsedProc` | `detectDeadCode({ModA,ModB}, { scope: "binary" })` | Report returns `UnusedProc`; omits `UsedProc` |
| Optional module narrows | `ModA.UnusedA`, `ModB.UnusedB`, `ModB.UsedProc` | `detectDeadCode({ModA,ModB}, { scope: "binary", module: "ModB" })` | Report returns `UnusedB` only and `scannedModules: ["ModB"]` |
| Missing module narrows | `ModA.UnusedA` only | `detectDeadCode({ModA}, { scope: "binary", module: "Missing" })` | Returns `undefined` |
| Empty inline modules | `{}` | `detectDeadCode({}, { scope: "binary" })` | Report has `findings: []`, `summary.total: 0`, and `scannedModules: []` |
| Cross-module call counts | `ModA.Producer` calls `ModB.Consumer` | `detectDeadCode({ModA,ModB}, { scope: "binary" })` | `Consumer` omitted |
| String literal does not count | `ModA.UnusedProc`, `ModB` contains `Application.Run "UnusedProc"` | `detectDeadCode({ModA,ModB}, { scope: "binary" })` | `UnusedProc` returned as dead |
| Comment does not count | `ModA.UnusedProc`, `ModB` contains `' TODO UnusedProc` | `detectDeadCode({ModA,ModB}, { scope: "binary" })` | `UnusedProc` returned as dead |
| Substring does not count | `ModA.UnusedProc`, `ModB.MyUnusedProcCaller` | `detectDeadCode({ModA,ModB}, { scope: "binary" })` | `UnusedProc` returned as dead |

### Requirement: Special-name allowlist

The system MUST exclude from dead-code results any symbol whose name matches the special-name allowlist: `AutoExec`, Access form/report events (`Form_Open`, `Form_Load`, `Form_Close`, `Report_Open`, `Report_Close`, plus the full Access event set), and control event handlers whose name matches `<Control>_<Event>` (e.g. `cmdSave_Click`, `txtName_AfterUpdate`). Allowlist matching MUST be case-insensitive.

| Scenario | Setup | When | Then |
|----------|-------|------|------|
| `AutoExec` excluded | `AutoExec` defined, zero references | `detectDeadCode(modules, { scope: "binary" })` | `AutoExec` omitted |
| Form/report events excluded | `Form_Load`, `Report_Open` defined, zero references | `detectDeadCode(modules, { scope: "binary" })` | Both omitted |
| Control event handler excluded | `cmdSave_Click` defined, zero references | `detectDeadCode(modules, { scope: "binary" })` | `cmdSave_Click` omitted |

### Requirement: Evidence and risk classification

Each dead-code entry MUST include: `symbol`, `module`, `kind` (`sub` \| `function` \| `property` \| `declaration`), `line` (1-indexed definition line), `evidence.scannedModules` (sorted list), `evidence.definitionSnippet` (verbatim source line), and `risk` ∈ `{"Low","Med","High"}`. The `declaration` kind covers module-level `Const`, `Type`, `Enum`, and variable declarations (subsumes the earlier `const` and `variable` cases); procedures are always one of `sub` / `function` / `property`. Risk MUST be `Low` for full-scope scans of private symbols; `Med` when `module` narrows the scope or the symbol is `Public`; `High` when the symbol is a `Public` or `Global` module-level declaration (`Const` / variable / `Type` / `Enum`) whose callers may live in unparsed sources.

| Scenario | Setup | When | Then |
|----------|-------|------|------|
| Output carries evidence | `ModA.UnusedProc` at line 12 | Entry produced | Includes `evidence.scannedModules`, `evidence.definitionSnippet` matching line 12 |
| Default risk | Full-scope scan, no event ties | Entry produced | `risk: "Low"` |
| Module-narrowed risk | `module: "ModA"` | Entry produced | `risk: "Med"` |

### Requirement: MCP read-only contract (modern tool path)

The system MUST register `dysflow_detect_dead_code` through the **modern MCP tool path** alongside the `#701` procedure tools (`dysflow_list_procedures`, `dysflow_get_procedure`, `dysflow_find_references`). Specifically the system MUST:

- Append `"dysflow_detect_dead_code"` to `MODERN_TOOL_NAMES` (`src/adapters/mcp/tools.ts`) so the tool is visible in `dysflow_get_capabilities.toolsVisible` regardless of write-gate state.
- Add a `modernContracts.dysflow_detect_dead_code` entry with `access: "read-only"` and `writeGate: "none"` (`src/adapters/mcp/mcp-tool-contracts.ts`).
- Declare `DETECT_DEAD_CODE_SCHEMA` (`src/adapters/mcp/schemas/dysflow-schemas.ts`) with `scope` required, `modules` optional for project-source fallback, and `additionalProperties: false` so unknown fields are rejected at parse time.
- Wire a custom handler that runs the pure core function over inline modules or the resolved project source tree; fallback failure or a missing module constraint MUST return a typed `MODULE_NOT_FOUND` envelope. The handler MUST never open Access nor spawn PowerShell.
- NOT register the tool in `dispatch-routes.ts` or `mcp-tool-registry.ts` — modern tools bypass those legacy registries.
- NOT mutate the `.accdb` binary, NOT mutate the filesystem, and NOT consult the write gate at runtime.

| Scenario | Setup | When | Then |
|----------|-------|------|------|
| Listed in modern tool names | `MODERN_TOOL_NAMES` from `tools.ts` | Read | Contains `"dysflow_detect_dead_code"` |
| Contract is read-only | `modernContracts.dysflow_detect_dead_code` | Read | `access === "read-only"` AND `writeGate === "none"` |
| Schema rejects bad input | Caller sends `{ scope: "bogus" }` or `{ scope: "binary", extraField: 1 }` | Tool called | Returns typed `MCP_INPUT_INVALID`; handler never runs |
| Missing inline modules falls back | Caller sends `{ scope: "binary" }` and no project source can be resolved | Tool called | Returns typed `MODULE_NOT_FOUND` |
| Missing module constraint | Caller sends inline modules and `module: "Missing"` | Tool called | Returns typed `MODULE_NOT_FOUND` |
| Binary untouched | Compiled `.accdb` with known mtime | Tool runs | Binary mtime unchanged |
| Filesystem untouched | Clean source tree under `src/` | Tool runs | No file created, modified, or deleted |
| Available in read-only mode | `dysflow mcp --disable-writes` | Tool called | Returns result; never `MCP_WRITES_DISABLED`; absent from `dispatch-routes.ts` and `mcp-tool-registry.ts` |