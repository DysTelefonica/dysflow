/**
 * Field-type descriptor used inside the result-contract surface. Mirrors
 * the {@link ToolParameterSchema} vocabulary so a single consumer-side
 * helper can coerce both surfaces without branching on field shape.
 */
export type ToolFieldShape = {
  type: "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";
  optional?: boolean;
  description?: string;
  enum?: readonly (string | number | boolean | null)[];
  /** Element type when `type === "array"`. */
  items?: ToolFieldShape;
  /**
   * Nested property map when `type === "object"`. Allows one level of
   * inline nesting so a typed payload like `{ summary: { total,
   * inSync } }` does not require a separate
   * {@link ToolDataSchemaFragment} just for the nested object.
   */
  properties?: Record<string, ToolFieldShape>;
};

/**
 * Issue #1077 — typed error envelope shape. Mirrors the `McpToolError`
 * contract surfaced by `translateCoreResultToMcpContent`: every error
 * envelope carries a typed `code`, a human-readable `message`, and (for
 * gate refusals) a typed `remediation` string. The shape is pinned here
 * so a future envelope simplification cannot silently drop the
 * remediation field that consumers rely on.
 */
export type ToolErrorEnvelopeShape = {
  code: { type: "string" };
  message: { type: "string" };
  rejectedFlag?: { type: "string"; optional: true };
  rejectedFlags?: { type: "array"; optional: true; items: { type: "string" } };
  toolCommitFlag?: { type: "string"; optional: true };
  remediation?: { type: "string"; optional: true };
  actualShape?: { type: "object"; optional: true };
  expectedShape?: { type: "object"; optional: true };
};

/**
 * Tools whose payload can grow unbounded surface this dimension so the
 * consumer knows where to find the bytes. `summary` is the inline
 * count/aggregation; `file` is a path on disk; `full` is the full
 * in-memory payload. Today only `export_modules` and the form
 * preview/lint tools declare more than one mode.
 */
export type ToolOutputMode = "summary" | "file" | "full";

/**
 * Result discriminator for write-class tools. `plan` means the
 * runtime computed the change but did not commit; `apply` means the
 * runtime persisted the change. A consumer can refuse a result that
 * claims `apply:true` but returned a `plan`-shaped payload — the modes
 * field is what makes that refusal safe. `resolution` is the
 * non-mutating setup_project branch that only caches an existing project
 * selected through the ambiguity-recovery contract.
 */
export type ToolResultMode = "plan" | "apply" | "resolution";

/**
 * Minimal JSON-Schema-like fragment for a tool's primary payload. The
 * fragment is intentionally narrow (no `oneOf`/`anyOf`/`$ref`): it
 * documents the SHAPE of the payload, not its full type algebra. Tools
 * with discriminated payloads (sync_binary, query_execute) use
 * `oneOf`; tools with a flat payload use `properties`.
 */
export type ToolDataSchemaFragment = {
  type: "object";
  description?: string;
  properties?: Record<string, ToolFieldShape>;
  required?: readonly string[];
  oneOf?: readonly ToolDataSchemaFragment[];
  additionalProperties?: boolean;
};

/**
 * Issue #1077 — discriminated result contract. The catalog exposes
 * either:
 *
 *   - `kind: "dataSchema"` — the tool returns a typed payload that the
 *     consumer must introspect (plan/apply variants, output modes,
 *     error envelope shape).
 *   - `kind: "envelope-only"` — the tool is a pure pass-through or
 *     returns an opaque status; the generic MCP envelope is enough and
 *     the catalog carries a justification that names WHY.
 *
 * Every advertised tool must publish one or the other. The schema test
 * (`test/adapters/mcp/tool-result-contracts.test.ts`) enforces the
 * invariant at build time.
 */
export type ToolResultContract =
  | {
      kind: "dataSchema";
      /**
       * Human-readable description of what the payload contains.
       * Optional — most entries use it to document the discriminator
       * or the way to interpret the shape.
       */
      description?: string;
      dataSchema: ToolDataSchemaFragment;
      /**
       * Issue #1077 — discriminated result modes for write-class tools.
       * Read-only tools omit this field; write-class tools must declare
       * at least `["plan", "apply"]` so consumers can refuse
       * inconsistent `apply:true` / plan-shaped combinations.
       */
      modes?: readonly ToolResultMode[];
      /**
       * Issue #1077 — large-response behavior. Tools whose payload
       * could grow unbounded declare the supported modes; consumers
       * branch on `outputModes` to decide between reading inline vs
       * tailing a file path. Omitted when the tool only has one
       * canonical delivery channel.
       */
      outputModes?: readonly ToolOutputMode[];
      errorEnvelope: { shape: ToolErrorEnvelopeShape };
    }
  | {
      kind: "envelope-only";
      /**
       * Human-readable justification for why the generic envelope is
       * sufficient. Required: the schema test fails any envelope-only
       * entry that ships without one.
       */
      justification: string;
      errorEnvelope: { shape: ToolErrorEnvelopeShape };
    };
