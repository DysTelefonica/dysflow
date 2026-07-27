# Design: AI Form UI Builder

## Technical Approach

Build an additive, AI-first workflow on the existing FormIR and MCP form-tool stack. Core owns protocol-neutral analysis, planning, pattern-copy, and verification models; adapters resolve files, accept caller-supplied CodeGraph-VBA evidence, and currently return an in-memory plan application report before any raw `.form.txt` or binary mutation is introduced.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Source of truth | Use FormIR + sibling `.cls` + CodeGraph-VBA evidence | Screenshots or raw `.form.txt` edits | Matches spec: semantic analysis must not rely on visual heuristics alone. |
| Dependency direction | Add pure core services and thin adapters | Put workflow logic in MCP handlers | Keeps `src/core` independent from `src/adapters`, per OpenSpec config and AGENTS. |
| Application model | Design plans are explicit JSON-like contracts returned as an apply result in this slice | Direct free-form mutation | Enables dry-run, review, and strict TDD at tool boundaries while avoiding unsafe writes until FormIR mutation operations are implemented. |
| Delivery | Single epic branch with issue-sized slices | Chained PRs | User requested `exception-ok`; keep slices testable even on one branch. |

## Data Flow

```text
.form.txt + .cls + CodeGraph-VBA
        │
        ▼
analyze_form_ui ──→ behavior map ──→ design plan
        │                              │
        └──────────── verify ◄──────── apply/copy pattern
                                      │
        in-memory apply report (actual guarded mutation/import integration is a follow-up slice)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `skills/access-form-ui-builder/SKILL.md` | Create | #796 project skill. Follow `skill-creator`: frontmatter, Activation Contract, Hard Rules, Decision Gates, Execution Steps, Output Contract, References. Register in `AGENTS.md`; require CodeGraph-VBA before behavior-sensitive changes and prohibit raw `.form.txt` edits unless justified. |
| `skills/access-form-ui-builder/references/*.md` | Create | Golden path and local form ownership notes; keep SKILL body concise per skill style guide. |
| `src/core/models/form-ui-builder.ts` | Create | Shared types: analysis report, behavior map, design plan, plan application result, verification report. |
| `src/core/services/form-ui-analysis-service.ts` | Create | #797 pure analyzer over `FormIR` controls/events/properties. |
| `src/core/services/form-ui-behavior-map-service.ts` | Create | #798 merge FormIR events with adapter-supplied CodeGraph-VBA call-path evidence. |
| `src/core/services/form-ui-design-plan-service.ts` | Create | #799 validate/generate/apply plan intent to pure IR operations where possible. |
| `src/core/services/form-ui-pattern-copy-service.ts` | Create | #800 derive reusable design intent from a reference report/map without erasing target behavior. |
| `src/core/services/form-ui-verification-service.ts` | Create | #801 compare applied output against source contract, behavior map, `compareForms`, and lint findings. |
| `src/adapters/vba-sync/vba-forms-ai-tools.ts` | Create | Adapter boundary for read/plan/apply/verify tools; owns filesystem and CodeGraph-VBA input. |
| `src/adapters/vba-sync/vba-forms-adapter.ts` | Modify | Dispatch new AI builder tools alongside existing `inspect_form`, `compare_form`, mutation, serialize, clone tools. |
| `src/adapters/mcp/mcp-tool-registry.ts` | Modify | Add public tool names: `analyze_form_ui`, `map_form_behavior`, `generate_form_design_plan`, `apply_form_design_plan`, `copy_form_ui_pattern`, `verify_form_ui`. |
| `src/adapters/mcp/dispatch-routes.ts` | Modify | Mark analysis/map/plan/verify as read-only; mark apply/copy as write-gated routine-dev-write when they can write/import. |
| `src/adapters/mcp/schemas/vba-sync-schemas.ts` | Modify | Add strict schemas with `sourcePath`, `referencePath`, `targetPath`, `plan`, `dryRun`, `apply`, `outputMode`. |
| `test/core/services/form-ui-*.test.ts` | Create | Strict TDD unit coverage for pure behavior. |
| `test/adapters/vba-sync/vba-forms-ai-tools.test.ts` and `test/adapters/mcp/*form-ui*.test.ts` | Create | Port/tool tests for schemas, routing, write gates, CodeGraph boundary, and dry-run/apply behavior. |
| `docs/mcp-examples.md`, `AGENTS.md` | Modify | Add golden-path example and form-builder guidance. |

## Interfaces / Contracts

```ts
type FormUiBehaviorMap = {
  formName: string;
  controls: Array<{ name: string; type: string; events: string[]; bindings: string[] }>;
  codegraphEvidence: Array<{ handler: string; callPath: string[]; tables?: string[] }>;
};

type FormDesignPlan = {
  sourceContract: FormUiBehaviorMap;
  operations: Array<{ kind: string; target: string; intent: string; params: Record<string, unknown> }>;
  referencePattern?: { sourceForm: string; mappedControls: Record<string, string> };
};
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Analysis, behavior-map merge, plan validation, pattern copy, verification drift | RED first in `test/core/services/form-ui-*.test.ts`; no filesystem/Access mocks except explicit CodeGraph evidence objects. |
| Adapter | File resolution, `.form.txt`/`.cls` ownership, CodeGraph-VBA required for maps, dry-run/apply | Mock `FormFileSystemPort`, `VbaFormsOrchestrator`, and CodeGraph boundary; assert observable result envelopes only. |
| MCP/registry | Tool names, schemas, routes, write gates | Extend parity/route/schema tests; dry-run allowed without writes, apply blocked when writes disabled. |
| E2E | Golden path copy reference UI then verify | Optional Windows/Access E2E after unit/adapter green; use guarded import and `verify_code`. |

## Slice Plan (#797-#801)

1. #796 skill only: create `skills/access-form-ui-builder` and docs registration.
2. #797 `analyze_form_ui`: enrich semantic analysis from existing `inspect_form`/FormIR.
3. #798 behavior map: adapter accepts CodeGraph-VBA evidence and core merges it with controls/events.
4. #799 design plan: generate/validate/apply guarded plans through existing mutation/import tools.
5. #800 reference copy: convert reference analysis + target map into plan inputs.
6. #801 verification: fail actionable drift in handlers, bindings, ownership, lint, import gate, and layout.

## Migration / Rollout

No migration required. Existing form tools remain compatible; new tools are additive.

## Open Questions

- [ ] Define the exact CodeGraph-VBA boundary shape available to the adapter before #798 implementation.
