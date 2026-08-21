# Surface-profile evidence

[#1215](https://github.com/DysTelefonica/dysflow/issues/1215) defers MCP surface profiles until
telemetry proves which tools a real workflow can safely omit.

This document is the sampling protocol that produces that proof, and the honest boundary of what
a local run can prove on its own.

What ships is the instrument, never the verdict. The runtime records the evidence and the CLI
reports whether a window is representative; a maintainer reads the report and decides.

## Quick path

1. Leave `capabilities.telemetry.invocations` at its default in every participating project.
2. Run the real workflows — bootstrap, sync, tests, SQL, forms, recovery — as you normally would.
3. Analyze the window: `dysflow telemetry-evidence --cwd <project-root>`.
4. Read `adequacy.gaps` first. A non-empty list means the window is not yet evidence.
5. When the window is adequate, post the report to #1215 with a reopen or defer recommendation.

```bash
dysflow telemetry-evidence --cwd C:\Proyectos\mi-proyecto
dysflow telemetry-evidence --json --min-invocations 500 --min-projects 2
```

## What the runtime records

| Stream | File under `.dysflow/runtime/` | One record is | Answers |
|---|---|---|---|
| Invocations (#1197) | `invocations.jsonl` | one `tools/call` | which tools ran, in what order, how they failed |
| Advertisements (#1459) | `schema-advertisements.jsonl` | one `tools/list` | what the schema surface costs the client, and how often it is re-sent |

The two streams are separate files on purpose. One advertisement is not one invocation, and a
consumer counting invocations must never have to filter advertisements out first.

Both follow the same opt-out. Setting `capabilities.telemetry.invocations` to `false` silences
both streams, because a project that declined telemetry declined all of it.

### Privacy boundary

Names only. Tool names, parameter names, outcome, failure class, error code, duration, and write
intent are recorded.

Argument values, SQL text, source, paths, and table names never enter either stream. The single
deliberate exception is `projectId`, retained so local multi-project telemetry can be attributed.

Advertisement records carry no tool names at all — only a count, a payload size, a repetition
ordinal, and the gap since the previous advertisement in that process.

## What the report answers

| Acceptance criterion | Where the answer appears |
|---|---|
| Workflow-phase coverage | `adequacy.phasesCovered` and `adequacy.phasesMissing` |
| Minimum volume and breadth | `adequacy.totalInvocations`, `adequacy.distinctProjects`, `adequacy.adequate` |
| Dependency closure (`sync`→`tests`, `forms`→`schema`) | `dependencies[].requiredFollowers` and `reachedFrom` |
| Schema injection and repetition cost | the advertisement summary — count, bytes, cadence |
| Whether a `read` profile needs its own eligibility metadata | `readProfile[].needsSeparateEligibilityMetadata` |

The phase taxonomy and write capability are read off the live tool catalog through
`src/adapters/mcp/surface-profile-catalog.ts`, never copied into the analyzer.

A second copy would drift the moment a tool is reclassified, and the analysis would keep
answering with yesterday's surface.

## Thresholds

| Threshold | Default | Why this value |
|---|---|---|
| `sessionGapMs` | 30 min | Entries carry no session id. A shorter gap fragments the HR-1 manual compile pause; a longer one merges unrelated work. |
| `dependencyConfidence` | 0.9 | A profile decision needs confident edges. Weaker co-occurrence is reported by omission, not by a weaker edge. |
| `minimumInvocations` | 2000 | Volume floor for a representative window. |
| `minimumProjects` | 3 | Breadth floor, so one project's habits do not become the surface. |

Every threshold is overridable per run. The defaults are a starting proposal for maintainers, not
an approved sampling plan.

## The evidence gap

Two acceptance criteria cannot be closed by this repository, and the report does not pretend
otherwise.

- **Maintainer approval of environments, duration, and volume.** The thresholds are explicit and
  overridable so an approved plan can be encoded, but the approval itself is external.
- **Client attribution across Claude, Codex, OpenCode, and Pi.** No record carries a client
  identity, by design. Attribution must come from outside the stream — one participating project
  per client, or an operator note recording which client produced the window.

Until both are supplied, `dysflow telemetry-evidence` reports a window, not a decision. Treat an
`adequate: true` window from a single unattributed client as a pilot, never as the #1215 gate.

## Next step

- Analyzer contract: [`surface-profile-evidence.ts`](../../src/core/telemetry/surface-profile-evidence.ts).
- The surface being profiled: [MCP tool reference](../api/mcp-tools.md).
