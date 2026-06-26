# Delta for vba-inline-execution

## MODIFIED Requirements

### Requirement: Inline Execution and Cleanup

The system MUST validate the snippet against a word-boundary regex blocklist (checking for `Declare`, `Shell`, `CreateObject`, `GetObject`, `Lib`), reject unsafe code with an `INVALID_INPUT` error, and if valid, write the snippet to a temporary module, compile and run it, and delete the temporary module afterwards, even if execution fails.
(Previously: The system did not perform input validation/sanitization on the code string before writing and execution.)

#### Scenario: Snippet runs and module is deleted
- GIVEN a valid VBA statement "MsgBox 1"
- WHEN inline execution is called
- THEN the snippet MUST run successfully
- AND the temporary module MUST be deleted

#### Scenario: Snippet fails and module is deleted
- GIVEN a VBA statement that throws a COM exception
- WHEN inline execution is called
- THEN the exception MUST be caught and returned
- AND the temporary module MUST be deleted

#### Scenario: Unsafe snippet is rejected
- GIVEN a VBA statement containing "CreateObject(\"WScript.Shell\")"
- WHEN inline execution is called
- THEN it MUST be rejected immediately with an INVALID_INPUT error
- AND no temporary module SHALL be created
