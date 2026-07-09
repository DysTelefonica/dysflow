# Exploration: Unified Forms Output Modes (Issue #793)

## Current State

The current Access Forms MCP tools return full file contents, metadata reports, or a combination depending on the tool:

1. **`form_serialize`**:
   - By default, returns metadata properties (`byteEqual`, `byteDiff`, `metadataReport`) and omits the serialized content text.
   - If the parameter `includeSerialized` is set to `true`, it appends the `serialized` field containing the entire form txt representation.
   - The schema lacks a standardized way to request *only* the file contents.

2. **`form_deserialize` (Dry-Run)**:
   - On dry-run (`apply: false` / `dryRun: true`), returns the entire text under the `preview` key.

3. **Form Mutation Tools (`form_add_control`, `form_move_control`, `form_rename_control`)**:
   - On dry-run, they always return the full mutated form text under the `source` key.
   - For complex forms, this represents a large payload (up to 10k+ lines), wasting token budget for AI clients when they only need to verify mutation parameters.

4. **Form Cloning (`create_form_from_template`)**:
   - On dry-run, returns the full generated target form text under the `targetSource` key.
   - On success (`apply: true`), also returns the `targetSource` key alongside mutation parameters.

There is no unified mechanism to let the caller select whether they want a `summary` of the operation, the modified `file` content itself, or the `full` combination.

---

## Affected Areas

1. **Schema & Properties**:
   - [schema-props.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/src/shared/validation/schema-props.ts): Add `outputMode` property atom with enum `["summary", "file", "full"]`.
   - [vba-sync-schemas.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/src/adapters/mcp/schemas/vba-sync-schemas.ts): Wire `outputMode` property into `form_serialize`, `form_deserialize`, `form_add_control`, `form_move_control`, `form_rename_control`, and `create_form_from_template`.

2. **Serialization Tools**:
   - [vba-forms-serialization-tools.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/src/adapters/vba-sync/vba-forms-serialization-tools.ts):
     - Refactor `serializeForm` to handle `outputMode`. Preserve backward compatibility with `includeSerialized`.
     - Refactor `deserializeForm` dry-run to conditionally return `preview`.

3. **Mutation Tools**:
   - [vba-forms-mutation-tools.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/src/adapters/vba-sync/vba-forms-mutation-tools.ts):
     - Refactor `mutateForm` dry-run to conditionally omit the `source` property under `summary` output mode.

4. **Cloning Tools**:
   - [vba-forms-clone-tools.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/src/adapters/vba-sync/vba-forms-clone-tools.ts):
     - Refactor `cloneFormFromTemplate` to conditionally omit `targetSource` based on the requested `outputMode`.

5. **Test Suites**:
   - [vba-forms-serialize-output-contract.test.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/test/adapters/vba-sync/vba-forms-serialize-output-contract.test.ts): Expand test assertions to cover all three output modes.
   - [vba-forms-adapter-mutation.test.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/test/adapters/vba-sync/vba-forms-adapter-mutation.test.ts): Assert that mutation dry-runs respect the `outputMode` constraints.

---

## Approaches

### Approach 1: Explicit Output Mode Contract Mapping (Recommended)
Add a unified parameter `outputMode: "summary" | "file" | "full"` to each tool schema. Let the tool implementation build/filter its success dictionary based on the requested value.

#### Tool Mapping Contracts

| Tool | `outputMode === "summary"` | `outputMode === "file"` | `outputMode === "full"` (Default) |
|---|---|---|---|
| **`form_serialize`** | Omit `serialized`. Return name, kind, byteEqual, byteDiff, metadataReport. | Return ONLY `serialized` (and maybe path/name metadata). Omit metadataReport/diffs. | Return name, kind, byteEqual, byteDiff, metadataReport, AND `serialized`. |
| **`form_deserialize`** (Dry-run) | Omit `preview`. Return mode, path, gate states. | Return ONLY `preview` (and path). | Return everything (preview, path, mode, gate states). |
| **Mutation dry-run** | Omit `source`. Return changedControlName, mode, sourcePath, preservedKeys, importGate. | Return ONLY `source` (and sourcePath). | Return everything (source, changedControlName, mode, etc.). |
| **Form clone** (Dry-run & Apply) | Omit `targetSource`. Return tokens, warnings, path, mode. | Return ONLY `targetSource` (and targetPath). | Return everything (targetSource, tokens, warnings, path, mode). |

**Pros**: Highly optimized for client token usage; clean separation; explicit behavior per tool.
**Cons**: Requires updating the implementation code of each form tool individually.

### Approach 2: Generic Output Filtering at Adapter Level
Intercept responses at the `VbaFormsAdapter.execute` level. Clean up keys from the output dynamically depending on generic rules (e.g. key `source` or `preview` is filtered out if mode is `summary`).

**Pros**: Low implementation effort; keeps the individual tool logic untouched.
**Cons**: Error-prone, hard to handle custom cases, obscures performance optimizations (e.g. we might still generate full content text only to throw it away).

---

## Recommendation

Implement **Approach 1**. To guarantee backward compatibility:
- If `outputMode` is omitted:
  - For `form_serialize`: Default to `summary` unless `includeSerialized` is true, which acts as `full`.
  - For mutation dry-runs and clone tools: Default to `full` to match existing behavior where source code is returned.
- Keep the `includeSerialized` parameter in `form_serialize` as a deprecated fallback.

---

## Risks & Mitigations

- **Breaking existing tool workflows**: Since MCP clients expect mutation dry-runs to return the `source` block, mapping the default (when omitted) to `full` prevents any breakage.
- **Zod / JSON Schema validation strictness**: Since MCP tool routes reject undefined arguments when `additionalProperties` is set to `false`, we must ensure the schema definition properly registers the optional `outputMode` property.

---

## Ready for Proposal
Yes, the topic is clear, and the codebase structure is well-understood. We can proceed to write the design specifications and implement the changes.
