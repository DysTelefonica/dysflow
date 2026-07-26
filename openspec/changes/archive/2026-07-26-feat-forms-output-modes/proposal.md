# Proposal: Unified Forms Output Modes

## Intent
Consolidate issues #719 and #720 under #793 to implement a unified `outputMode` parameter across MCP form tools, reducing payload sizes for AI clients.

## Scope

### In Scope
- Add `outputMode` to schemas of: `form_serialize`, `form_deserialize`, `form_add_control`, `form_move_control`, `form_rename_control`, and `create_form_from_template`.
- Support three output modes: `"summary"`, `"file"`, and `"full"`.
- Filter tool outputs accordingly to exclude/include source/preview code.
- Maintain backward compatibility for existing callers.

### Out of Scope
- Modifying core Access/VBA COM operations or database interaction.
- Adding non-form tool output modes.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- None (no existing specifications cover the form-serialization or form-mutation tools at the capabilities level).

## Approach
Implement Approach 1 (Explicit Output Mode Contract Mapping) from exploration:
1. Define `outputMode` enum (`["summary", "file", "full"]`) in `schema-props.ts`.
2. Update form tool schemas in `vba-sync-schemas.ts` to include optional `outputMode`.
3. Refactor tool execution handlers to build and filter success responses:
   - **`summary`**: Omit full source/preview code (`serialized`, `preview`, `source`, `targetSource`).
   - **`file`**: Return only target code and primary path/name metadata.
   - **`full`** (default for mutations/cloning, or when `includeSerialized` is true for serialize): Return all fields.
4. Support `includeSerialized` as a deprecated fallback parameter for `form_serialize`.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| [schema-props.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/src/shared/validation/schema-props.ts) | Modified | Define `outputMode` property atom. |
| [vba-sync-schemas.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/src/adapters/mcp/schemas/vba-sync-schemas.ts) | Modified | Wire `outputMode` to target schemas. |
| [vba-forms-serialization-tools.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/src/adapters/vba-sync/vba-forms-serialization-tools.ts) | Modified | Apply output filtering to serialization tools. |
| [vba-forms-mutation-tools.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/src/adapters/vba-sync/vba-forms-mutation-tools.ts) | Modified | Filter source output on dry-runs. |
| [vba-forms-clone-tools.ts](file:///C:/Users/adm1/.gemini/antigravity-cli/worktrees/issue-793/src/adapters/vba-sync/vba-forms-clone-tools.ts) | Modified | Filter targetSource output on clone. |
| Tests | Modified | Expand form test suites to assert all three output modes. |

## Success Criteria
- [ ] All 6 form tools accept `outputMode: "summary" | "file" | "full"`.
- [ ] `"summary"` mode successfully omits source/preview files, returning metadata.
- [ ] `"file"` mode returns only the requested file contents and identifier.
- [ ] Backward compatibility is preserved (omitting parameter maps to legacy behavior).
- [ ] Schema validation rejects invalid output modes.

## Risks & Mitigation
- **Breaking changes**: Omission of `outputMode` defaults to `full` (for mutations/cloning) and maps based on `includeSerialized` (for serialization) to prevent breaking legacy clients.
- **Strict schema validation**: Register `outputMode` as an optional parameter to prevent Zod validation failures on unexpected properties.

## Rollback Plan
Revert the modifications to the schemas, tool logic, and tests.

## Dependencies
- None
