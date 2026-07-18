# Canonical fixture: `test-project.accdb`

Issue #979 acceptance criterion #5: `tests/ai-fixtures/test-project.accdb`
is the documented canonical Access fixture that consumers extending the
public test suite can use as a known-good binary.

## Documented module structure

A canonical fixture for dysflow public tests should contain:

| Module name     | Kind       | Purpose                              |
|-----------------|------------|--------------------------------------|
| `Module1`       | standard   | Two trivial procedures (`Foo`, `Bar`) |
| `Module2`       | standard   | One trivial procedure (`Baz`)        |
| `Class1`        | class      | Empty class                           |
| `Form_Main`     | form       | Single unbound form with one button   |
| `Report_Main`   | report     | Single unbound report                 |

Expected source-tree layout for fixture-driven tests:

```
test-project.accdb                  # the binary
.dysflow/
  project.json                      # id: "test-project-fixture"
                                    # accessPath: "test-project.accdb"
                                    # destinationRoot: "src"
src/
  modules/
    Module1.bas
    Module2.bas
  classes/
    Class1.cls
  forms/
    Form_Main.cls                   # code-behind
    Form_Main.form.txt              # layout
  reports/
    Report_Main.cls
    Report_Main.report.txt
```

## Why the binary is intentionally absent

A real `test-project.accdb` requires Microsoft Access to author — the
Jet Blue database engine cannot be created from scratch in pure Node.
The public suite under `tests/` runs without Access COM and exercises
the MCP contract surface via stubbed services; the canonical fixture
exists as a **documented reference** so external consumers extending
the public suite (or AI agents authoring fixture-driven integration
tests) can generate a real `.accdb` against this template in their own
Access-equipped environment.

## Generating the fixture

1. Open Access 365 (or compatible).
2. Create a blank database named `test-project.accdb` in this directory.
3. Add the modules listed above (Module1, Module2, Class1) with the
   trivial procedures documented in `docs/testing/testing-philosophy.md`.
4. Add `Form_Main` (single unbound form with `cmdTest` button → no-op
   click handler) and `Report_Main` (single unbound report).
5. Save and close.
6. Drop the binary at `tests/ai-fixtures/test-project.accdb`.

Once the binary is present, an integration-style test can:

```ts
import { resolve } from "node:path";

const fixturePath = resolve("tests/ai-fixtures/test-project.accdb");
expect(existsSync(fixturePath), "canonical fixture must be present").toBe(true);
```

The binary is **gitignored** at the repo root via the existing
`*.accdb` pattern. Consumers who want it tracked should override the
ignore for this single file or use `git add -f`.

## Cross-reference

- Issue #979 — acceptance criterion #5.
- `docs/testing/testing-philosophy.md` — fixture-first principle.
