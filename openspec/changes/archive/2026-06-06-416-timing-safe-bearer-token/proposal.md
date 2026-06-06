# Proposal: Timing-safe bearer token comparison (#416)

## Problem

The HTTP bearer token check in `src/adapters/http/server.ts` uses a plain string comparison
(`token !== context.httpToken`). String comparison in JavaScript short-circuits on the first
differing character, leaking information about how many leading characters of the token are
correct via timing differences. This enables timing-based side-channel attacks.

Additionally, `crypto.timingSafeEqual` THROWS if the two `Buffer` arguments differ in byte
length. A naive replacement without a length guard would convert mismatched-length tokens from
a 401 Unauthorized response into an unhandled exception (HTTP 500).

## Solution

Replace the string comparison with:

1. **Length guard**: if `tokenBuf.length !== expectedBuf.length`, reject immediately (401) without
   calling `timingSafeEqual`. This is correct — different lengths guarantee inequality — and avoids
   the throw.
2. **Constant-time compare**: call `crypto.timingSafeEqual(tokenBuf, expectedBuf)` only when
   lengths match.

Both sides are encoded as `Buffer.from(x, "utf8")` for consistency.

## Scope

- `src/adapters/http/server.ts`: one import added, four lines changed.
- `test/adapters/http/server.test.ts`: four new behavior tests added.

## Risks

None. The observable behavior is identical for correct tokens and all incorrect tokens. The only
change is the internal comparison mechanism becoming constant-time and exception-safe.
