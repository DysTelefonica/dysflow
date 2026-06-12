import { z } from "zod";

/**
 * TS↔PowerShell payload contract for the `Write-DysflowResult` writer (issue #496).
 *
 * This module defines the **observable contract** that any adapter implementing
 * the `Write-DysflowResult` writer must satisfy. It is intentionally
 * protocol-pure: it does not import PowerShell, Access COM, or the filesystem.
 * Concrete implementations live in `scripts/dysflow-vba-manager.ps1` and
 * `scripts/dysflow-access-runner.ps1`.
 *
 * # Contract rules
 *
 * 1. **Payload type whitelist.** Only the following payload types are valid:
 *    - `undefined` / `null` (treated as `null` in JSON)
 *    - `string`, `number`, `boolean`
 *    - `object[]` (plain array, not a `List<object>`)
 *    - `pscustomobject` / `Record<string, unknown>`
 *    - `[ordered]@{}` / `[hashtable]` (PowerShell ordered / regular hashtable)
 *    Anything else (a `List<object>`, a `Dictionary<string, object>`, a COM
 *    object, an `IDisposable` whose enumeration throws) is a contract
 *    violation; the writer MUST NOT silently succeed and MUST NOT silently
 *    drop the sentinel.
 *
 * 2. **On success, the writer emits exactly one line of the form:**
 *    `DYSFLOW_RESULT <compact-single-line-json>`
 *    where the JSON is the result of `ConvertTo-Json -Compress` on the
 *    whitelisted payload, with no embedded newlines and no trailing
 *    whitespace.
 *
 * 3. **On payload-contract violation (whitelist type check fails or
 *    `ConvertTo-Json` throws), the writer MUST still emit exactly one
 *    `DYSFLOW_RESULT` line** (the sentinel contract from issue #440 is
 *    non-negotiable), but the payload switches to the **fallback envelope**
 *    with these properties:
 *    - `ok: false`
 *    - `error.code`: `SERIALIZATION_FAILED` (or the script-specific
 *      subclass like `VBA_MANAGER_SERIALIZATION_FAILED` or
 *      `RUNNER_SERIALIZATION_FAILED`)
 *    - `error.message`: a stable, non-leaking string the operator can grep
 *    - `diagnostics`: a non-empty array where the first element begins with
 *      `LastSerializationError: ` followed by the original exception text
 *      (truncated to a documented budget so it cannot blow up the sentinel
 *      line). This is the field that lets the operator diagnose the real
 *      cause without re-running with debug flags.
 *
 * 4. **The writer never returns a non-object payload** (e.g. a bare string,
 *    a bare array). The fallback envelope is always an object so the TS
 *    adapter can route it through the same `OperationResult<T>` parser
 *    used for the success path.
 *
 * 5. **The writer never silently swallows the original cause.** The
 *    `diagnostics[0]` field is the public contract for "what actually
 *    went wrong inside the writer". A future refactor MUST keep this
 *    invariant: a SERIALIZATION_FAILED envelope without a non-empty
 *    `diagnostics` field is itself a contract violation.
 *
 * # Why this is a domain type
 *
 * Before this module existed, the contract was implicit in the
 * PowerShell code, in scattered CHANGELOG lines, and in Pester tests that
 * asserted on the call site (anti-pattern: implementation-coupled tests).
 * Pulling the contract into the domain lets:
 * - the TS adapter validate payloads before invoking the runner
 * - a single spec suite pin the contract for any future writer
 *   implementation (PowerShell, .NET, anything)
 * - the AST guard in `scripts/tests/dysflow-access-runner-result-coverage.Tests.ps1`
 *   reference this whitelist instead of duplicating it
 */

/**
 * The single sentinel prefix every implementation must emit on the result
 * line. Kept in sync with `RESULT_MARKER` in `ps-result-channel.ts`.
 */
export const RESULT_MARKER = "DYSFLOW_RESULT ";

/**
 * Canonical error code emitted on the fallback envelope. Specific
 * implementations may use a script-specific subclass (e.g.
 * `VBA_MANAGER_SERIALIZATION_FAILED`); the prefix is the contract.
 */
export const SERIALIZATION_FAILED_CODE = "SERIALIZATION_FAILED";

/**
 * Stable prefix for the first element of `diagnostics[]` on the
 * fallback envelope. Operators can grep for this to extract the real
 * cause from a captured sentinel line.
 */
export const DIAGNOSTICS_PREFIX = "LastSerializationError: ";

/**
 * Maximum byte budget for the captured exception text inside
 * `diagnostics[0]`. Anything longer is truncated with a
 * `...[truncated]` suffix. The budget must be small enough to keep
 * the fallback envelope under a reasonable size cap (4 KB chosen
 * to leave headroom for surrounding JSON metadata and any
 * downstream reformatting).
 */
export const DIAGNOSTICS_MAX_LENGTH = 4096;

/**
 * Fallback envelope shape emitted when a payload violates the
 * contract or `ConvertTo-Json` throws. Always an object so the
 * TS adapter can route it through the same parser as success.
 */
export type SerializationFailedEnvelope = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
  diagnostics: [string, ...string[]];
};

/**
 * Whitelist of payload types the writer is contractually required to
 * accept. Used by:
 *  - the spec suite that pins this contract
 *  - the AST guard in `dysflow-access-runner-result-coverage.Tests.ps1`
 *  - any future TS-side pre-validation of payloads before spawn
 *
 * The whitelist is **narrow on purpose**. Each type in the list is
 * a type that `ConvertTo-Json -Compress -Depth N` can serialize
 * deterministically under PowerShell 5.1 and 7.x. Anything outside
 * the list is a known foot-gun: see issue #496 for the failure
 * mode (COM exception messages, `List<object>` round-trip breakage,
 * `__ComObject` references, etc.).
 */
export const PAYLOAD_TYPE_WHITELIST = [
  "null",
  "string",
  "number",
  "boolean",
  "object[]",
  "pscustomobject",
  "Record<string, unknown>",
  "[ordered]@{}",
  "[hashtable]",
] as const;
export type PayloadType = (typeof PAYLOAD_TYPE_WHITELIST)[number];

/**
 * Declarative schema for the public payload type labels accepted by the
 * Write-DysflowResult contract. This mirrors PAYLOAD_TYPE_WHITELIST exactly;
 * it does not replace the JavaScript value predicate below.
 */
export const PayloadTypeSchema = z.enum(PAYLOAD_TYPE_WHITELIST);

/**
 * Declarative schema for serialization-failed fallback envelopes. This is an
 * additive contract boundary for tests and future CI drift checks, not a
 * runtime validation gate.
 */
export const SerializationFailedEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string().refine((code) => code.endsWith(SERIALIZATION_FAILED_CODE), {
      message: `error.code must end with ${SERIALIZATION_FAILED_CODE}`,
    }),
    message: z.string(),
  }),
  diagnostics: z.array(z.string()).min(1),
});

/**
 * Declarative schema for parsed result envelopes after the DYSFLOW_RESULT marker
 * is stripped. The success payload intentionally remains polymorphic.
 */
export const ResultEnvelopeSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    data: z.unknown(),
  }),
  SerializationFailedEnvelopeSchema,
]);

/**
 * Pure helper used by the spec suite to assert that a given
 * JavaScript value is in the whitelist. Kept in the domain so
 * the AST guard and the spec share the same predicate.
 *
 * Returns `null` when the value is whitelisted, or a human-readable
 * reason string when it is not. The reason string is stable
 * (no timestamps, no paths) so the AST guard can assert on it.
 */
export function whyPayloadTypeIsNotWhitelisted(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return null;
  if (Array.isArray(value)) return null;
  if (t === "object") {
    // Heuristic: hashtable / Record / pscustomobject are all
    // plain objects with a non-array prototype. Anything that
    // exposes a different prototype (Map, Set, COM wrappers,
    // PowerShell List<>, Date, etc.) is rejected.
    const proto = Object.getPrototypeOf(value);
    if (proto === null || proto === Object.prototype) return null;
    if (
      // PowerShell List<object> arrives in the TS adapter as
      // an array-like with extra methods; arrays already pass
      // the Array.isArray branch above. Anything that has
      // methods beyond plain-object shape is rejected.
      typeof (value as { entries?: unknown }).entries === "function" &&
      proto !== Object.prototype
    ) {
      return `payload is a Map-like / Collection-like object (prototype=${proto.constructor?.name ?? "anonymous"}); only plain objects are whitelisted`;
    }
    return `payload has a non-plain prototype (${proto.constructor?.name ?? "anonymous"}); COM wrappers, PowerShell List<>, Date, and class instances are excluded by contract`;
  }
  return `payload type "${t}" is not in the whitelist; only null, string, number, boolean, object[], and plain object are accepted`;
}

/**
 * Pure helper that builds the fallback envelope from a captured
 * exception. The TS adapter and the spec suite both call this so
 * the fallback shape is computed in exactly one place. The
 * implementation in PS1 mirrors this logic but cannot import
 * from TS; the AST guard in
 * `dysflow-access-runner-result-coverage.Tests.ps1` asserts the
 * PS1 path produces a JSON shape that round-trips through
 * `JSON.parse` into the same fields.
 */
export function buildSerializationFailedEnvelope(
  code: string,
  originalExceptionText: string,
  stableMessage = "Write-DysflowResult could not serialize the result payload.",
): SerializationFailedEnvelope {
  const truncated =
    originalExceptionText.length > DIAGNOSTICS_MAX_LENGTH
      ? `${originalExceptionText.substring(0, DIAGNOSTICS_MAX_LENGTH)}...[truncated]`
      : originalExceptionText;
  return {
    ok: false,
    error: { code, message: stableMessage },
    diagnostics: [`${DIAGNOSTICS_PREFIX}${truncated}`],
  };
}
