# Testing Philosophy & Criteria

> **For any human or AI agent working on this repo.** This document defines what a *good* test is here.
> It is authoritative. When it conflicts with a habit ("chase coverage %", "mock everything"),
> this document wins. Do not silently override it.

## North star: refactor-safety

A test exists to let us **refactor the implementation with confidence**. The single most important
property of our test base is:

> **A test must survive any internal refactor that preserves observable behavior.**

If you can rewrite the internals of a feature — rename functions, split classes, change data
structures, swap algorithms — **without touching a single test**, and the suite still proves the
feature works, the test base is healthy. If a behavior-preserving refactor turns the suite red,
**the test is the defect, not the refactor.** Delete it or rewrite it against behavior.

## The real axis: behavior vs implementation (NOT unit vs e2e)

The enemy is **not** the unit test. The enemy is the **implementation-coupled** test — a test bound
to *how* the code works instead of *what* it guarantees.

- A unit test of a **pure function** (a parser, a domain rule, a calculator) tests behavior:
  `parse(x) === y`. It never breaks on an internal refactor. **Keep these.**
- A unit test that mocks five collaborators and asserts "method `_foo` was called with these args"
  is bound to internals. It breaks the moment you refactor, and proves nothing about behavior.
  **This is the test we reject.**

So the question is never "is this a unit test?" — it is **"is this test bound to behavior or to
implementation?"**

## Test at the ports (this codebase is hexagonal)

Our architecture gives us the sweet spot for free. Test at the **ports**, not at the internals:

1. **Exercise use cases / domain with the REAL domain logic.** No mocking of business rules.
2. **Mock ONLY the adapters at the I/O boundary** — Access COM, the filesystem, process spawn,
   the network. Those are the legitimate seams.
3. **Never assert on internal call order, private collaborators, or internal data shape.**
   Assert on the outputs and the observable effects at the boundary (what was returned, what the
   adapter was asked to persist/launch).

A test written this way is fast like a unit test but behavioral like an integration test, and it
survives any refactor that keeps the port contract intact.

## Distribution (Testing Trophy, not the old pyramid)

Best confidence per unit of maintenance cost — that is the ranking, in priority order:

1. **Integration at the ports — the workhorse.** The bulk of our value lives here. Use cases driven
   end-to-end through the domain, adapters mocked at the boundary.
2. **E2E — a thin layer of critical journeys.** Few, expensive, high-value smoke coverage of the
   real runtime (see `mcp-access-e2e.md` and `E2E_testing/mcp-e2e.mjs`). E2E is the **least stable**
   layer — flaky on timing/environment, slow feedback, and a red E2E tells you *something* broke,
   not *where*. Keep it small and reserved for journeys that must never break.
3. **Unit — only for pure/algorithmic complexity.** Where covering edge cases through integration
   would be a combinatorial explosion (a parser with 30 cases, a tricky calculation), a focused unit
   test on the pure function is the right tool. Otherwise prefer a port-level integration test.

## Coverage is a diagnostic, not a target

Coverage tells you what code was **executed**, never what was **verified**. 90% coverage with weak
assertions proves nothing.

- The thresholds in [`repo-quality-gates.md`](./repo-quality-gates.md) are a **regression floor** —
  they stop us from silently deleting protection. They are **not a goal to chase**.
- **Never add an implementation-coupled test just to move a coverage number.** That trades a real
  property (refactor-safety) for a fake one (a green percentage). If a branch is hard to cover at the
  port level, ask whether the branch should exist, or cover it with a focused pure-unit test — not by
  mocking internals.

## Smells to reject in review

- Mocking the thing under test, or mocking domain/business logic.
- Asserting on private methods, internal call sequences, or internal data structures.
- Snapshots of internal shapes (vs. observable output/contract).
- A test file that mirrors the implementation file 1:1 in structure — it will break 1:1 on refactor.
- Adding tests whose only justification is "raise coverage to N%".

## In this repo, concretely

- Integration/E2E config: `vitest.integration.config.ts` → `test/e2e/**` and `test/integration/**`.
- Unit/spec config: `vitest.config.ts`.
- The I/O adapters that are legitimate mock seams: Access COM runner
  (`scripts/dysflow-access-runner.ps1` / `dysflow-vba-manager.ps1` via the runner port), filesystem,
  and process spawn.
