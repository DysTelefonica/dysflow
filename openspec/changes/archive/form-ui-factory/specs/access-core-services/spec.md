# Delta for access-core-services

## MODIFIED Requirements

### Requirement: VBA Form Service Module

`src/core/services/vba-form-service.ts` MUST own the operations `validateFormSpec`, `generateForm`,
`catalogAddControl`, `harvestFormCatalog`, and `resolveFormSpec`. These functions MUST be exported
from this module.

The public documentation for `generateForm` (README and inline JSDoc) MUST accurately describe its
actual behavior: it writes a `.form.json` stub consumed by `create_form_from_template` and does NOT
create a live Access form directly. No documentation artifact MUST claim that `generateForm`
compiles or imports a live Access form.
(Previously: no documentation-accuracy clause; README.md falsely stated `generate_form` compiles a
live Access form.)

#### Scenario: Form operations importable from vba-form-service

- GIVEN a consumer that needs `validateFormSpec` or `generateForm`
- WHEN they import
- THEN the symbol MUST be resolvable from `vba-form-service.ts`

#### Scenario: Not duplicated in vba-sync-adapter

- GIVEN `vba-sync-adapter.ts`
- WHEN it needs a form operation
- THEN it MUST import from `vba-form-service.ts`, not reimplement it

#### Scenario: README does not misrepresent generate_form

- GIVEN `README.md` at line ~647 describing `generate_form`
- WHEN a reader consults it
- THEN the description MUST state that `generate_form` writes a `.form.json` stub and MUST NOT claim it creates a live Access form
