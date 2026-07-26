# Form Output Modes Specification

## Purpose

Define validation and response behavior for the three output modes (`"summary"`, `"file"`, `"full"`) across the six Access form tools, allowing clients to optimize payload sizes.

## Requirements

### Requirement: Output Mode Parameter Schema Validation
The system MUST validate the optional `outputMode` parameter on the schemas for `form_serialize`, `form_deserialize`, `form_add_control`, `form_move_control`, `form_rename_control`, and `create_form_from_template`.

#### Scenario: Valid outputMode parameter is accepted
- GIVEN a form tool schema
- WHEN the request contains `outputMode` with value `"summary"`, `"file"`, or `"full"`
- THEN validation MUST succeed

#### Scenario: Invalid outputMode parameter is rejected
- GIVEN a form tool schema
- WHEN the request contains `outputMode` with an unsupported string value
- THEN validation MUST fail

---

### Requirement: Form Serialization Output Modes
The `form_serialize` tool MUST support response filtering based on `outputMode` while maintaining backward compatibility with `includeSerialized`.

#### Scenario: Serialize summary mode
- GIVEN a `form_serialize` request with `outputMode: "summary"`
- WHEN the tool executes successfully
- THEN the response MUST omit `serialized`
- AND the response MUST include `name`, `kind`, `byteEqual`, `byteDiff`, and `metadataReport`

#### Scenario: Serialize file mode
- GIVEN a `form_serialize` request with `outputMode: "file"`
- WHEN the tool executes successfully
- THEN the response MUST include `serialized`
- AND the response MUST omit `metadataReport`, `byteEqual`, and `byteDiff`

#### Scenario: Serialize full mode
- GIVEN a `form_serialize` request with `outputMode: "full"`
- WHEN the tool executes successfully
- THEN the response MUST include both metadata fields and `serialized`

#### Scenario: Serialize default fallback
- GIVEN a `form_serialize` request with no `outputMode`
- WHEN `includeSerialized` is true
- THEN the output mode MUST default to `"full"`
- WHEN `includeSerialized` is false or omitted
- THEN the output mode MUST default to `"summary"`

---

### Requirement: Form Deserialization Output Modes
The dry-run form deserialization (`form_deserialize` with `apply: false` / `dryRun: true`) MUST filter response payload size based on `outputMode`.

#### Scenario: Deserialize dry-run summary mode
- GIVEN a dry-run `form_deserialize` request with `outputMode: "summary"`
- WHEN the tool executes successfully
- THEN the response MUST omit `preview`

#### Scenario: Deserialize dry-run file mode
- GIVEN a dry-run `form_deserialize` request with `outputMode: "file"`
- WHEN the tool executes successfully
- THEN the response MUST include `preview`
- AND the response MUST omit gate status details

---

### Requirement: Form Mutation Output Modes
Form mutation tools (`form_add_control`, `form_move_control`, `form_rename_control`) and clone tools (`create_form_from_template`) MUST respect `outputMode` for dry-run and clone results.

#### Scenario: Mutation dry-run summary mode
- GIVEN a dry-run form mutation request with `outputMode: "summary"`
- WHEN the tool executes successfully
- THEN the response MUST omit `source`

#### Scenario: Clone summary mode
- GIVEN a form clone request with `outputMode: "summary"`
- WHEN the tool executes successfully
- THEN the response MUST omit `targetSource`

#### Scenario: Default mutation and clone behavior
- GIVEN a form mutation or clone request with no `outputMode`
- WHEN the tool executes successfully
- THEN the output mode MUST default to `"full"`
- AND the response MUST include the complete source code (`source` or `targetSource`)
