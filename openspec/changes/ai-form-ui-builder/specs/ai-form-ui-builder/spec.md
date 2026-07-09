# Delta for ai-form-ui-builder

## ADDED Requirements

### Requirement: Workflow Contract

The system MUST provide separate, testable slices for analysis, behavior mapping, design planning, plan application, reference pattern copy, and verification. Strict TDD MUST govern each slice.

#### Scenario: Slices stay separate
- GIVEN a contributor starts the workflow
- WHEN they request analysis, planning, application, or verification
- THEN the system MUST treat each request as a distinct slice

#### Scenario: Coverage is required
- GIVEN a slice has no characterization coverage
- WHEN change is proposed
- THEN the system MUST require tests before implementation

### Requirement: Semantic UI Analysis

The system MUST analyze exported form artifacts into semantic UI structure, control roles, and observable behavior. Screenshots or visual heuristics alone MUST NOT be the source of truth.

#### Scenario: Semantic findings are returned
- GIVEN exported form artifacts are available
- WHEN analysis runs
- THEN the result MUST describe behavior-relevant UI structure

#### Scenario: Screenshot alone is insufficient
- GIVEN only a screenshot exists
- WHEN analysis is requested
- THEN the system MUST NOT treat it as the source of truth

### Requirement: Behavior Map

The system MUST generate a behavior map linking controls, events, and visible effects for a target form. CodeGraph-VBA MUST be a first-class discovery dependency.

#### Scenario: Behavior map is produced
- GIVEN a form export and code-behind are available
- WHEN behavior mapping runs
- THEN the system MUST produce a behavior map with control-event links

#### Scenario: CodeGraph-VBA is required
- GIVEN the workflow needs behavior discovery
- WHEN the system maps form behavior
- THEN it MUST use CodeGraph-VBA input for call-path discovery

### Requirement: Design Plan Generation and Application

The system MUST generate a design plan from the behavior map and apply it only when the plan remains aligned with the source form contract.

#### Scenario: Plan derives from map
- GIVEN a completed behavior map
- WHEN a design plan is requested
- THEN the plan MUST reference mapped behaviors

#### Scenario: Application preserves alignment
- GIVEN an approved design plan
- WHEN the system applies it
- THEN resulting UI changes MUST remain aligned with the source contract

### Requirement: Reference Pattern Copy

The system MUST support copying a reference UI pattern into the target workflow as reusable design intent. The copied pattern MUST remain explicit and traceable.

#### Scenario: Pattern is copied
- GIVEN a reference pattern is selected
- WHEN the copy step runs
- THEN the system MUST record the pattern as a plan input

#### Scenario: Pattern does not erase target behavior
- GIVEN mapped target behavior exists
- WHEN a reference pattern is copied
- THEN the target behavior map MUST remain intact

### Requirement: Verification

The system MUST verify AI-driven form UI changes against the behavior map and the source contract. Mismatches MUST surface as actionable failures.

#### Scenario: Compatible changes pass
- GIVEN an applied design matches the behavior map
- WHEN verification runs
- THEN the system MUST report success

#### Scenario: Drift fails
- GIVEN an applied design changes mapped behavior without approval
- WHEN verification runs
- THEN the system MUST report failure and identify the drift
