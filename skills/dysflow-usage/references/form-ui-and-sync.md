# Form UI and sync

Form UI tools and the `sync_binary` workflow.

## Form UI tools — perceive → act → verify

The form-UI builder surface treats an Access form like a web page: perceive it, act with rich verbs, re-verify. All operate on `FormIR` (parsed `.form.txt`); the write tools go through the same guarded write + import gate. Full workflow in the **`access-form-ui-builder`** skill; canonical flags/errors stay here.

| Phase | Tools | Class |
|---|---|---|
| **Perceive** | `analyze_form_ui` (roles), `analyze_form_layout` (geometry lint: overlap/alignment/tab-order), `render_form_preview` (SVG/ASCII from twips), `map_form_behavior` (control→handler→callpath; consumes codegraph-vba evidence) | read |
| **Plan** | `generate_form_design_plan`, `copy_form_ui_pattern` | read |
| **Act** | `apply_form_design_plan` (execute plan — WRITE), `form_align_controls`, `form_distribute_controls` (batch geometry — WRITE) | write |
| **Verify** | `verify_form_ui` (contract + geometry/tab-order/property), `verify_form_bindings` (ControlSource/RowSource vs real schema), `diff_form_preview` (before/after visual) | read |

Write tools follow the live matrix: prefer `apply:false` to preview and `apply:true` to commit;
use `diff` only when reported as a compatibility alias. `apply_form_design_plan`'s
`mode`/`filesystemApplied` reflect the real write; the pure planning preview is always
`mode:"dry-run"`.

`form_set_properties` accepts a `properties` map and validates every property name and value before opening a guarded write. Every form mutation is transactional: when the import gate fails, dysflow restores the original source instead of leaving a partial filesystem mutation.

## VBA-sync workflow — `sync_binary`

Manual Access edits require live binary → source reconciliation, not a restart.
Compare each exported `.form.txt` with its source counterpart and each `.cls`
with its counterpart; never compare database hashes with source hashes.

Inspect workflow `ok`, `postSync` and `recommendation` before declaring parity.
Unchanged sync repeats execute no chunks; unchanged exports preserve source
bytes and timestamps. Access database bookkeeping may still change physical bytes.


When an AI agent needs a whole-project source ⇄ binary workflow, prefer `sync_binary` over the manual 5-step loop. For an explicit narrow list of modules, use `import_modules({moduleNames:[...]})` or `export_modules({moduleNames:[...]})`; Dysflow does not steer those focused calls toward a broader workflow. When the composed verify/plan/re-verify envelope is still useful for an explicit list, pass `scope:{moduleNamesOnly:true}` so modules outside that list cannot affect the workflow result. `sync_binary` composes `verify_code` + `import_modules` + `export_modules` + re-verify into a single round-trip. Workflow pattern lives in the **`vba-binary-sync`** skill; this is its MCP one-shot wrapper.

| Direction | What it does |
|---|---|
| `"src-to-binary"` | verify → plan import → (if `apply:true`) chunked `import_modules` → re-verify → recommend |
| `"binary-to-src"` | verify → plan export → (if `apply:true`) chunked `export_modules` → re-verify → recommend |
| `"both"` | verify + plan both directions; **plan-only even with `apply:true`**. Detect drift without committing either side. |

`apply:false` is the explicit preview shape and omitted intent plans. The consumer must explicitly opt into `apply:true`. `effectiveDryRunDefault.sync_binary` remains `true` as compatibility-named plan metadata. The four-list lockstep preserves plan-by-default semantics in developer mode. Hard rules honored: NO `compile:true`, Round 2/3/4 invariants preserved (no abort on missing module; ASCII-only runner-bound strings; chunked COM-safe imports).

Conflicting `bothChanged` entries remain `manual_merge` by default. A caller that has made an
explicit one-way decision may pass `acceptBothChanged:true` together with `direction:
"src-to-binary"` or `"binary-to-src"`; `direction:"both"` never resolves the conflict.

`export_modules` opens a disposable copy of the `.accdb` by default so the
original binary is not mutated by Access bookkeeping. Read `binaryMutated:false` as the normal
result. Pass `mutateBinary:true` only when the legacy direct-binary behavior is intentional.

Use `sync_binary` whenever the agent would otherwise script the 5-step loop manually. Use the manual primitives (`verify_code` + `import_modules` + `export_modules`) only when you need the granular control (single-step inspection, partial commits, custom chunking).

Large `import_modules` orchestration payloads are transport-safe on Windows: the PowerShell bridge
keeps Base64 payloads up to 8192 characters on argv and sends larger payloads over stdin. Do not
reduce `sync_binary.batchSize` merely to avoid Windows error 206; chunking remains a COM workload
and error-isolation decision. `PAYLOAD_TOO_LARGE_FOR_ARGV` is the internal CLI's pre-mutation guard
when a direct caller incorrectly sends an oversized payload through `--payload-base64` instead of
`--payload-stdin`.
