# Codegraph supplement drift — proposal

> **Status:** Both dysflow-side components shipped. B component (detector)
> landed in PR #999; A component (auto-rewrite via `dysflow codegraph-drift
> --apply`) landed with this document — see
> `docs/codegraph-supplement-drift-detector.md` for the operator surface.
> The upstream ARN-chain extension still belongs in the
> `dysflow-codegraph-update` skill (originally hosted at
> `DysTelefonica/workflow`, **archived 2026-07-18**, read-only); until that
> repo is unarchived or forked, this document remains the canonical
> reference for the upstream fix shape.

## Problem

`~/.config/opencode/AGENTS.md` and 10 user-global instruction files carry
**user-supplement blocks** (e.g. `<!-- user-supplement:ardelperal:codegraph-extra-tools -->`, lines 227-244 today) that document `codegraph-vba` semantics. After upgrading `codegraph-vba` v1.10.0 → v1.11.0 today (2026-07-18), line 243 still read "the user-owned source of truth for v1.10.0 semantics" until the user hand-edited it inline.

## Why it happens

`dysflow-codegraph-update`'s ARN chain is scoped narrowly:

- **ARN-1** regenerates the `dysflow-arnes` delimited block.
- **ARN-2** redistributes pointer blocks (`<!-- user-supplement:dysflow:pointer -->` markers) across 10 user-global instruction files.
- **ARN-3** scaffolds missing example files under `dysflow-usage/assets/examples/`.

It does **not** cover other `<!-- user-supplement:* -->` blocks that live in the same global files. Those blocks pin themselves to a runtime version in prose, drift every codegraph release, and only the user catches them after the fact.

## Repro (today)

1. Install `codegraph-vba` v1.10.0.
2. Ship `dysflow` v2.15.0 + `codegraph-vba` v1.11.0 same day.
3. Run `dysflow-codegraph-update` (pre-flight + ARN-1 + ARN-2 + ARN-3 pass cleanly, dual-hashes equal, verify-examples-vs-runtime.ps1 exit 0).
4. Inspect `~/.config/opencode/AGENTS.md` line 243 → still says "v1.10.0 semantics" even though the runtime is now v1.11.0.

## Proposed fix (canonical)

Extend the alignment procedure so `codegraph upgrade --check` (now allowed to also apply the upgrade, per today's `procedure.md` edit) is paired with a **user-supplement block scan**: any `<!-- user-supplement:* -->` block whose prose cites a literal `codegraph-vba` runtime version should be either

- (a) auto-rewritten to a runtime-neutral phrasing + a `codegraph --version` pointer (preferred; aligns with HR-3 no-bitácoras and HR-9 one-authoritative-place-per-runtime-rule), or
- (b) flagged as drift, blocking the post-apply step until the user hand-fixes it.

(a) is preferred because it removes per-release churn from the human. The skill version (`codegraph-usage vN.M`) should stay as the canonical documentation version reference; the runtime version belongs only in `codegraph --version` output, never in prose.

## Acceptance

- After running `dysflow-codegraph-update` post any `codegraph-vba` release, `~/.config/opencode/AGENTS.md` and the 10 user-global instruction files contain **zero** stale references to a literal `codegraph-vba` runtime version in user-supplement blocks.
- The pre-existing pointers (`<!-- user-supplement:dysflow:pointer -->`, `<!-- gentle-ai:* -->`) keep their managed-by signal unchanged.

## Inbound

This is opening in-session from a `dysflow v2.15.0` + `codegraph-vba v1.11.0` rollout. Repro is the diff between (a) commit `09a6c4b` in `DysTelefonica/workflow` (passed dual-hash + verify) and (b) the un-refreshed line 243 of the user's `~/.config/opencode/AGENTS.md`. See `DysTelefonica/dysflow#961` for the consumer-side report.

## Until upstream lands: dysflow-side guard

A dysflow-side pre-flight check (TDD cycle in progress, see PR forthcoming) will detect stale `codegraph-vba` runtime refs in user-supplement blocks and surface them locally with remediation:

- For each file under `~/.config/opencode/AGENTS.md` + the 10 user-global instruction files, find blocks delimited by `<!-- user-supplement:* -->` ... `<!-- /user-supplement:* -->`.
- Within those blocks, scan for patterns matching `codegraph-vba v\d+\.\d+\.\d+` (literal runtime version) or `codegraph-vba v\d+\.\d+` (major.minor).
- If any match: fail the pre-flight with a structured error pointing to the exact file + line + offending snippet, plus a remediation hint: "replace the literal version with a `codegraph --version` pointer".

The dysflow guard is a **safety net, not a substitute** — the proper fix belongs in `DysTelefonica/workflow`'s ARN chain.