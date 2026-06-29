# Design: Stop Silent Config Data Loss on Corrupt JSON

## Technical Approach

Tighten the JSON-loading port in two call sites — `readJson` (shared helper, all install/agent/MCP config loads) and `updateProjectConfigId` (setup flow) — so a present-but-unreadable config file is no longer treated as "no config". The fix is a localised read-error split and a plain-object guard; no public exports move, no signatures change, and the existing atomic-write contract from `499d5e4` continues to govern the write side.

The contract is the same in both sites: ENOENT is the only "no data, start from `{}`" case. Every other condition (parse error, non-object value, permission error, EIO, …) throws and leaves the file on disk untouched, because the next write would otherwise clobber the user's real data with the empty object.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Single source of truth for the ENOENT split | Put the split in `readJson`; duplicate locally in `updateProjectConfigId` | Refactor `updateProjectConfigId` to use `readJson` and `writeJson` | The setup helper writes through `writeFile` (not `writeJson`) and has a focused single-call contract; refactoring the write path is a behaviour change beyond this fix. Duplicating ~10 lines is cheaper and keeps the diff small. A follow-up can consolidate. |
| Non-ENOENT read errors | Re-throw the original `NodeJS.ErrnoException` | Wrap with a Dysflow-typed error, swallow with a log | The caller (`writeRelativeProjectConfig`, `mcp-configurator`, `agent-config`) needs the original `code` (`EACCES`, `EISDIR`, `EIO`, …) to decide whether to retry, prompt, or fail. Swallowing loses that signal. |
| Plain-object guard | `typeof parsed !== "object" \|\| parsed === null \|\| Array.isArray(parsed)` | `Object.getPrototypeOf(parsed) === Object.prototype` | The functional check matches how downstream code already consumes the value (`root.mcp`, `root.mcpServers`, `parsed.id`); the prototype check is stricter and would reject class instances, which is not the contract here. |
| Parse-error message | `Syntax error in JSON file <path>: <inner.message>` | `Invalid JSON in <path>` (no inner) | The user needs the actual `JSON.parse` reason (unexpected token, position, etc.) to fix the file. The path is prepended so the error is self-locating. |
| `updateProjectConfigId` parse-error message | `Invalid .dysflow/project.json: <path>. <inner.message>` | Same shape as `readJson` | The setup flow already used a different prefix (`Invalid .dysflow/project.json`); keeping that prefix preserves grep-ability of the existing user-facing message and only appends the inner reason. |
| Test layer | Port-level Vitest against `readJson` | Unit-test the predicate, mock `node:fs` | Per `docs/testing/testing-philosophy.md`, the test must survive an internal refactor that preserves the observable contract. The behaviour under test is "corrupt file → throws with informative message" — that is exactly the port surface. |
| Auto-recovery (last-known-good, backup-restore) | Not in scope | — | The audit specifies "warn or fail loudly and preserve the original file", not "silently heal". Auto-recovery adds restore semantics, backup storage, and a new failure mode (stale backups). Out of scope. |

## Data Flow

```text
readJson(filePath)
  ├─ readFile(filePath, "utf8")
  │     ├─ ENOENT                    ──► return {}
  │     └─ other (EACCES, EIO, …)    ──► throw (original error preserved)
  ├─ JSON.parse(raw)
  │     ├─ throws SyntaxError        ──► throw new Error("Syntax error in JSON file <path>: <inner>")
  │     └─ parsed value
  │           ├─ object && !null && !Array  ──► return parsed
  │           └─ else                     ──► throw new Error("JSON value is not a plain object")
  └─ (caller decides whether to call writeJson)

updateProjectConfigId(projectId, context)
  ├─ readFile(projectPath, "utf8")
  │     ├─ ENOENT   ──► raw = "{}"
  │     └─ other    ──► throw (original error)
  ├─ JSON.parse(raw)
  │     ├─ throws              ──► throw new Error("Invalid .dysflow/project.json: <path>. <inner>")
  │     └─ non-object value    ──► throw new Error("Invalid .dysflow/project.json: <path>. JSON value is not a plain object")
  ├─ parsed.id = projectId
  ├─ mkdir(dirname, { recursive: true })
  └─ writeFile(projectPath, JSON.stringify(parsed, null, 2) + "\n", "utf8")
        (write is unconditional only when read + validate succeeded)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/cli/commands/install/file-utils.ts` | Modify | `readJson` re-throws non-ENOENT read errors; `JSON.parse` failure wrapped as `Syntax error in JSON file <path>: <inner>`; non-object parsed values throw `JSON value is not a plain object`. ENOENT → `{}` preserved. |
| `src/cli/commands/setup.ts` | Modify | `updateProjectConfigId` splits ENOENT from other read errors; throws `Invalid .dysflow/project.json: <path>. <inner>` on parse failure and the same plain-object message on non-object values. |
| `test/cli/install-utils.test.ts` | Modify | Adds "readJson rejects if file exists but contains invalid JSON or non-object JSON": corrupt `{invalid}`, top-level array `[1,2,3]`, and `null` payloads each assert the corresponding thrown error. |
| `openspec/changes/435-stop-silent-config-data-loss/specs/install-runtime/spec.md` | Create | Delta spec under the new `install-runtime` capability, with ADDED Requirements describing the corrupt-config contract and the port-level test rule. |

## Interfaces / Contracts

`readJson` keeps its existing signature: `(filePath: string) => Promise<Record<string, unknown>>`. The return type is unchanged; the failure surface is widened (more error types now propagate). Callers that already wrapped the call (`mcp-configurator.ts`, `agent-config.ts`) inherit the safer behaviour without changes.

`updateProjectConfigId` keeps its existing signature and `Promise<string>` return type. The thrown error type stays `Error`; the message now includes the inner parse reason in addition to the file path.

No new exports. No changes to `writeFileAtomically` or `writeJson` (atomic-write contract from `499d5e4` is preserved).

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Port (install-utils) | `readJson` on corrupt JSON throws `Syntax error in JSON file <path>`; on top-level array throws `JSON value is not a plain object`; on `null` throws the same plain-object message. ENOENT still returns `{}`. Round-trip still works. | Real `fs` in a `mkdtemp` sandbox; assert error message *prefix* (behaviour, not exact wording). |
| Regression | Existing round-trip, ENOENT, `ensureObject`, `runCommand`, `runCommandOutput` cases stay green. | `pnpm test`. |
| Manual / future E2E | `setup --set-project-id <id>` on a corrupt `.dysflow/project.json` aborts with the new error and leaves the file unchanged. | Verify by writing `"{not json"` to the file, running the command, and `cat`-ing the file after. |
| Full suite | Regression after the change | `pnpm test`; focused Vitest file first, then full suite in verify. |

## Migration / Rollout

No data, config, or runtime migration. The change is contained to `file-utils.ts`, `setup.ts`, and their companion test. The atomic-write helper from `499d5e4` already protects the write side; this change closes the read side.

Recommended single PR under the 400-line review budget:

1. Add the failing test in `install-utils.test.ts` (corrupt / array / null).
2. Tighten `readJson` in `file-utils.ts` to pass the test.
3. Tighten `updateProjectConfigId` in `setup.ts` to match the contract.
4. Run `pnpm test` and record implementation commits in `tasks.md` per SDD traceability.

## Open Questions

None.
