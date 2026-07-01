# Delta for access-core-services

## ADDED Requirements

### Requirement: Form Template Cloning Service

The system MUST provide a protocol-neutral service that clones an existing source form into a new target form by applying a caller-supplied token map to the source layout text. Token replacement scope MUST be limited to the source layout (`.form.txt`) content only (OQ1: code-behind `.cls` token replacement is a non-goal for this slice). The service MUST preserve the source form's opaque serialization data so the cloned target satisfies the `serializeFormTxt` round-trip property: a manual clone-and-replace on the same source MUST be byte-equivalent to the service result, with no metadata loss.

The service resolves source and target locations against the project's canonical form source location (OQ2: bench-cache-first vs project-root-first resolution is deferred to design).

#### Scenario: Clone preserves round-trip byte-equivalence
- GIVEN a source form and a token map whose keys all appear in the source
- WHEN the clone-from-template operation runs
- THEN the service MUST return a target form whose serialized layout is byte-equivalent to a manual clone-and-replace on the same source
- AND opaque serialization metadata (Checksum, PrtDevMode, Format bytes) MUST remain preserved

#### Scenario: Token replacement never touches preserved metadata
- GIVEN a source form where a token appears on a section that also holds `PrtDevMode`
- WHEN the operation applies the token map
- THEN replacement MUST occur only in user-modifiable layout strings
- AND the preserved metadata bytes MUST remain byte-equivalent

### Requirement: Token Map Application Policy

Tokens MUST use the `{{Token}}` syntax by default (OQ3). When a token is present in the source but absent from the token map, the service MUST leave the token verbatim, emit a structured per-token warning, and still return success — the `warn-pass-through` policy (OQ4). When the caller passes strict token-map enforcement, an unmapped source token MUST cause a typed error and MUST NOT write a target form. An invalid token map MUST fail with a typed, actionable error.

#### Scenario: All tokens mapped
- GIVEN a source form and a token map covering every source token
- WHEN the operation runs
- THEN every token MUST be replaced with its mapped value
- AND the result MUST report no missing-token warnings

#### Scenario: Missing token warns and passes through
- GIVEN a source token that has no entry in the token map
- WHEN the operation runs without strict enforcement
- THEN the token MUST be left verbatim in the target
- AND the result MUST include a structured warning naming the missing token
- AND the operation MUST still return success

#### Scenario: Strict enforcement rejects missing token
- GIVEN a source token absent from the token map
- WHEN the operation runs with strict token-map enforcement enabled
- THEN it MUST return a typed error
- AND no target form MUST be written

#### Scenario: Invalid token map is rejected
- GIVEN a token map with a non-string key or value, malformed token syntax, or an empty token key
- WHEN the operation validates the map
- THEN it MUST return a typed error with an actionable message
- AND no target form MUST be written

### Requirement: Target Form Existence Policy

When the target form already exists, the service MUST reject the operation by default (OQ5). The caller MAY request overwrite; when overwrite is requested, the service MUST replace the existing target through the gated restore path so a failed load restores prior state.

#### Scenario: Absent target is created
- GIVEN a target form that does not yet exist
- WHEN the clone operation runs
- THEN the service MUST create the target from the token-replaced source

#### Scenario: Existing target without overwrite is rejected
- GIVEN a target form that already exists
- WHEN the clone operation runs without an overwrite request
- THEN it MUST return a typed error
- AND it MUST NOT modify the existing target
