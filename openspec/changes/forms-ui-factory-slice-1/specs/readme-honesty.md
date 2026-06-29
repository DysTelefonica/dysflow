# Spec — README honesty (Form UI Factory)

> Part of SDD change `forms-ui-factory-slice-1` (closes issue #596). Source: this spec
> is the contract; `README.md` and `AGENTS.md` are the deliverables.

## Purpose

`generate_form` writes a `.form.json` stub to disk. It does **not** create or compile
a live Access form. The pre-Slice-1 README misrepresented this and risked causing AI
agents to attempt to use `generate_form` for a job it cannot do. This spec pins the
honest description and locks it behind a doc-anchor test that fails if the lie ever
re-appears.

The same honesty principle applies to `inspect_form`: it reads the
version-controlled `.form.txt` from source. It does **not** need Access, it does
**not** invoke `LoadFromText` / `SaveAsText`, and it does **not** see un-exported
live state. The README's MCP tool surface already documents this; this spec lists
both the `generate_form` honesty claim and the `inspect_form` source-only claim
together because they are the two slice-1 documentation changes the user asked for.

## Requirements

| # | Requirement                                                              | Strength |
|---|--------------------------------------------------------------------------|----------|
| 1 | `generate_form` documented as writing a `.form.json` stub, not compiling | MUST     |
| 2 | `generate_form` description MUST NOT contain "live Access form" + create | MUST     |
| 3 | `inspect_form` documented as source-only and read-only                   | MUST     |
| 4 | The honest claims are pinned by a doc-anchor test                        | MUST     |

---

### Requirement: `generate_form` is a JSON-stub writer, not a form compiler

The `README.md` MCP tool surface entry for `generate_form` MUST describe the tool
as writing a `.form.json` stub from a form spec, and MUST NOT claim that it creates
or compiles a live Access form.

#### Scenario: `generate_form` entry is honest

- GIVEN the `README.md` MCP tool surface section.
- WHEN a reader looks up `generate_form`.
- THEN the entry MUST mention `.form.json` (or equivalent stub language) and MUST
  NOT include the phrase "live Access form" combined with an active verb like
  "compile" / "create" / "build".

---

### Requirement: `inspect_form` is source-only and read-only

The `README.md` MCP tool surface entry for `inspect_form` MUST describe the tool
as parsing a version-controlled `.form.txt` from disk (the SaveAsText format) and
returning structured JSON, and MUST state that it works offline / without Access.

#### Scenario: `inspect_form` entry is honest

- GIVEN the `README.md` MCP tool surface section.
- WHEN a reader looks up `inspect_form`.
- THEN the entry MUST mention that the tool reads the source `.form.txt` and works
  offline (without Access) and is read-only.

---

### Requirement: Doc-anchor test pins the honesty claim

A new test file `test/docs/forms-ui-factory-readme.test.ts` MUST read `README.md`
and assert:

- The `generate_form` inventory entry contains a `.form.json` reference.
- The `generate_form` inventory entry does NOT contain the substring
  `"compile a live Access form"` (the exact pre-Slice-1 lie) nor the substring
  `"create a live Access form"` (the matching synonym).
- The `inspect_form` inventory entry mentions `.form.txt` and `offline` (or
  equivalent source-only language).

This test is the regression net: if a future change to `README.md` re-introduces
the lie, this test fails before the change can land.

#### Scenario: README honesty test passes

- GIVEN the current `README.md` after the `63dea09` honesty fix.
- WHEN the doc-anchor test runs.
- THEN it MUST pass.
