/**
 * #1174 — `run_vba` procedure-name parser.
 *
 * Pure function that splits a `procedureName` argument (e.g.
 * `"MyModule.PublicSub"`) into the module / procedure pair the runtime
 * uses for allowlist lookup, source-existence preflight, and Access COM
 * resolution. Lives in `src/core/services/` so the parser can be unit-tested
 * without I/O and consumed from both the MCP adapter (`buildRunVbaRequest`)
 * and the VBA execution service (`AccessVbaService.execute`) so the dry-run
 * plan and the apply path agree on the same verdict.
 *
 * Why this is its own module (vs. inlined into the existing `vba-service.ts`):
 *   - The MCP adapter layer must project the parsed `moduleName` onto the
 *     `AccessVbaRequest` BEFORE the dry-run short-circuit runs. That means
 *     the parser is shared between `src/adapters/mcp/alias-tools.ts` and
 *     `src/core/services/vba-service.ts`; an inlined copy would drift.
 *   - The contract for "what counts as a parseable procedure name" must be
 *     testable without spinning up Access or the PowerShell runner. The
 *     parser is intentionally a pure function with no `node:*` imports.
 *
 * Design contract (issue #1174 acceptance criteria #1 and #2):
 *   1. Both `dryRun: true` and `apply: true` MUST go through this parser,
 *      so the dry-run response and the apply-path preflight produce
 *      identical `moduleName` / `procName` for the same input.
 *   2. When the parser cannot split the input (no `.`, whitespace, etc.)
 *      the caller is responsible for mapping the structured `ok:false`
 *      branch to a typed error envelope. The parser itself does NOT throw
 *      — it returns a value the caller can branch on.
 *   3. The "first dot" split rule matches the VBA canonical form
 *      `Module.Procedure`. A `procedureName` without a `.` is treated as
 *      an unqualified procedure name (legacy `dysflow_vba_execute` shape)
 *      and the parser yields `{ moduleName: "", procName: <input> }` so
 *      the apply path's all-modules fallback (already in place) still
 *      works for the legacy case.
 */

export type ParsedProcedureName =
  | {
      ok: true;
      /**
       * Module name extracted from the `<module>.<procedure>` shape. Empty
       * string when the input has no `.` — the apply path's source
       * preflight treats `""` as "scan every module" (Test 3 in
       * `test/core/services/run-vba-preflight-procedure-exists.test.ts`).
       */
      moduleName: string;
      /**
       * Bare procedure name WITHOUT the module prefix. This is the value
       * the runtime looks up via `listVbaProcedures(source)` and the value
       * Access COM resolves when the `moduleName` is empty.
       */
      procName: string;
      /**
       * The original `procedureName` argument verbatim — preserved so the
       * dry-run plan can echo it back without losing whitespace or case.
       */
      original: string;
    }
  | {
      ok: false;
      /**
       * Typed error code the caller must surface as the response envelope.
       * One of:
       *   - `PROCEDURE_NAME_EMPTY` — the caller passed `""` or whitespace-only.
       *   - `PROCEDURE_NAME_INVALID` — the input is structurally malformed
       *     (e.g. only dots, leading/trailing dots, dots but no module name).
       * The parser intentionally splits "empty" from "invalid" so consumers
       * can map `PROCEDURE_NAME_EMPTY` to a friendlier `MCP_INPUT_INVALID`
       * and `PROCEDURE_NAME_INVALID` to a `PROCEDURE_NOT_FOUND`-shaped
       * envelope — both paths are surfaced in the typed taxonomy rather
       * than collapsed into one code.
       */
      code: "PROCEDURE_NAME_EMPTY" | "PROCEDURE_NAME_INVALID";
      message: string;
      /**
       * The literal `procedureName` argument the caller supplied, for
       * diagnostics and `error.details.procedure` echo.
       */
      original: string;
    };

/**
 * Parse `procedureName` into its `<module>.<procedure>` parts. Trims
 * surrounding whitespace before splitting so a caller-supplied
 * `" Module.Foo "` does not leak through as the literal procName.
 *
 * Splitting rule (VBA canonical form):
 *   - `"Module.Proc"` → `{ moduleName: "Module", procName: "Proc" }`
 *   - `"Module.Nested.Type.Proc"` → first dot wins:
 *     `{ moduleName: "Module", procName: "Nested.Type.Proc" }`
 *     (matches how `AccessApplication.Run` resolves qualified names).
 *   - `"JustAProc"` (no `.`) → `{ moduleName: "", procName: "JustAProc" }`
 *     (legacy shape; apply path falls back to all-modules scan).
 *   - `""` or whitespace-only → `{ ok: false, code: "PROCEDURE_NAME_EMPTY" }`.
 *   - `".Foo"`, `"Module."`, `"."`, `".."`, etc. → `{ ok: false, code: "PROCEDURE_NAME_INVALID" }`.
 *
 * @internal — exported only for unit tests and the shared service layer.
 * The MCP adapter reaches it via `parseProcedureName(input)` directly.
 */
export function parseProcedureName(input: unknown): ParsedProcedureName {
  if (typeof input !== "string") {
    return {
      ok: false,
      code: "PROCEDURE_NAME_EMPTY",
      message: "procedureName must be a non-empty string.",
      original: typeof input === "undefined" ? "" : String(input),
    };
  }
  const original = input;
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      code: "PROCEDURE_NAME_EMPTY",
      message: "procedureName must be a non-empty string.",
      original,
    };
  }

  const dotIndex = trimmed.indexOf(".");
  if (dotIndex < 0) {
    // Legacy unqualified shape — preserved verbatim. The apply path's
    // existing all-modules fallback (Test 3 in run-vba-preflight...) handles
    // resolution when `moduleName === ""`.
    return { ok: true, moduleName: "", procName: trimmed, original };
  }

  const moduleName = trimmed.slice(0, dotIndex).trim();
  const procName = trimmed.slice(dotIndex + 1).trim();

  if (moduleName.length === 0 || procName.length === 0) {
    return {
      ok: false,
      code: "PROCEDURE_NAME_INVALID",
      message:
        `procedureName '${original}' is malformed: expected '<module>.<procedure>' ` +
        "but the module or procedure part is empty.",
      original,
    };
  }

  // Disallow path-like or traversal-y module names. The apply-path resolver
  // also rejects these, but failing at the parser boundary gives the
  // dry-run plan a typed envelope instead of a misleading empty moduleName.
  if (
    moduleName === "." ||
    moduleName === ".." ||
    moduleName.includes("/") ||
    moduleName.includes("\\") ||
    moduleName.includes("\0")
  ) {
    return {
      ok: false,
      code: "PROCEDURE_NAME_INVALID",
      message: `procedureName '${original}' contains an invalid module name '${moduleName}'.`,
      original,
    };
  }

  return { ok: true, moduleName, procName, original };
}
