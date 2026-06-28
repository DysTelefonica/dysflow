# Spec — mcp-e2e-cleanup (#583)

> Behavior contract for the MCP E2E harness in `E2E_testing/mcp-e2e.mjs`. The
> harness must always settle the per-call promise, even when the spawned
> `dysflow mcp` child process never emits a `close` event after a response is
> captured.

## Requirement R1 — second watchdog guarantees settle after response

After a JSON-RPC response is captured, the harness clears the primary
`timeoutMs` timer and signals the child to end. If `close` does not arrive
within a bounded `closeWatchdogMs` window, the harness must still resolve the
per-call promise with the captured response, so the suite cannot hang
indefinitely.

#### Scenario: response captured, child closes quickly (normal path)

- **Given** the harness is waiting for a `tools/call` response
- **When** the response arrives and the child emits `close` within 1 second
- **Then** the harness resolves the per-call promise with the captured response
- **And** the `closeWatchdog` timer is cleared and never fires

#### Scenario: response captured, child never emits `close`

- **Given** the harness is waiting for a `tools/call` response
- **When** the response arrives but the child does NOT emit `close` within `closeWatchdogMs`
- **Then** the per-call promise resolves within `closeWatchdogMs + slack` of the response
- **And** the resolved payload is the captured response (not a `TIMEOUT`)
- **And** the resolution records the watchdog reason: `closeWatchdogFired: true`
- **And** the harness does not throw, leak handles, or deadlock the suite

#### Scenario: response never arrives (primary timeout still applies)

- **Given** the harness is waiting for a `tools/call` response
- **When** no response arrives within `timeoutMs`
- **Then** the harness resolves with the original `TIMEOUT` shape
- **And** the child is killed
- **And** the `closeWatchdog` is irrelevant (the primary timer path resolves the promise first)

## Requirement R2 — `finish` is settle-guarded

The internal `finish` function that resolves the per-call promise must be
idempotent: a `close` arriving after the watchdog fired must NOT cause a
double-resolve (which would throw inside the promise machinery).

#### Scenario: close arrives after watchdog

- **Given** the harness has resolved the promise via the close watchdog
- **When** the child finally emits `close`
- **Then** the `child.on("close", ...)` handler is a no-op
- **And** the promise is not re-resolved
- **And** no `UnhandledPromiseRejection` is emitted

#### Scenario: watchdog fires after close

- **Given** the harness has resolved the promise via the `close` event
- **When** the close watchdog timer elapses
- **Then** the watchdog's `finish` call is a no-op
- **And** the promise is not re-resolved

## Requirement R3 — best-effort cleanup still applies

The watchdog-based settle path must still attempt to close stdin and kill the
child, just like the original response-arrival path. Cleanup remains
best-effort; failures during cleanup must not block the promise resolution.

#### Scenario: watchdog fires, child stdin end throws

- **Given** the watchdog timer fires
- **When** `child.stdin.end()` throws (e.g. child already closed stdin)
- **Then** the harness swallows the throw
- **And** `child.kill()` is still attempted
- **And** the promise still resolves with the captured response

## Requirement R4 — regression test covers a non-closing child

A Vitest integration test exercises the harness with a fake child that
captures the response but never emits `close`. The test asserts the watchdog
settles the promise within the bounded window and the payload is the captured
response.

#### Scenario: integration test with non-closing child mock

- **Given** a fake child stream that:
  - accepts the `initialize`, `notifications/initialized`, and `tools/call` writes
  - emits the `tools/call` response on stdout
  - NEVER emits `close` and NEVER exits
- **When** the harness's `callMcp` function runs against the fake child
- **Then** the promise resolves within `closeWatchdogMs + 500 ms` slack
- **And** `result.response.id === requestId`
- **And** `result.closeWatchdogFired === true`
- **And** the test does not require a real `dysflow.cmd` runtime on disk
