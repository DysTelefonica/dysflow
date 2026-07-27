/**
 * Issue #1186 — reclassify a generic PowerShell-runner failure into the typed
 * `ACCESS_PASSWORD_INVALID` code when Access/DAO rejected the supplied
 * password.
 *
 * Background: when the configured password env var holds the wrong value,
 * DAO's `OpenDatabase` throws error 3031 and the runner exits non-zero with a
 * raw, host-locale-dependent message (`"No es una contraseña válida."` on a
 * Spanish Windows). That reached the consumer as an opaque `RUNNER_FAILED`,
 * so the reader had to recognise a localized Access string to realise the
 * only thing wrong was an environment variable.
 *
 * The #980 taxonomy already reserves `ACCESS_PASSWORD_INVALID` for exactly
 * this cause — the MCP dispatch seam remaps it to the canonical
 * `BINARY_PASSWORD_INVALID` — but nothing was emitting it, so the mapping was
 * unreachable from the real runner path.
 *
 * Detection is deliberately narrow: it matches only the DAO 3031 wording in
 * the locales dysflow actually runs on, so a genuine runner failure that
 * merely mentions the word "password" still surfaces as `RUNNER_FAILED`.
 */

import { createDysflowError, type DysflowError } from "../contracts/index.js";

/** Env var dysflow reads when the project config declares no explicit name. */
const DEFAULT_PASSWORD_ENV = "ACCESS_VBA_PASSWORD";

/**
 * DAO error 3031 ("Not a valid password") as the Access engine words it.
 * The accent classes are permissive on purpose: runner output crosses a
 * PowerShell/UTF-8 boundary that can render `ñ`/`á` as `?` or U+FFFD, and a
 * mojibake'd message describes the same failure.
 */
const INVALID_PASSWORD_PATTERNS: readonly RegExp[] = [
  /no es una contrase.{1,4}a v.{1,4}lida/i,
  /not a valid password/i,
];

/** Target + password-env context needed to phrase an actionable message. */
export interface RunnerPasswordContext {
  readonly accessDbPath: string;
  readonly accessPasswordEnv?: string;
  readonly backendPasswordEnv?: string;
}

/** True when the runner output carries the DAO invalid-password signature. */
export function isInvalidPasswordRunnerOutput(output: string): boolean {
  return INVALID_PASSWORD_PATTERNS.some((pattern) => pattern.test(output));
}

/**
 * Build the typed `ACCESS_PASSWORD_INVALID` error for a failed runner
 * invocation, or `null` when the output does not indicate a rejected
 * password. Callers keep their existing `RUNNER_FAILED` envelope for `null`
 * so every other failure mode propagates verbatim.
 *
 * `safeOutput` MUST already be secret-sanitized: it is echoed back inside the
 * message so the original Access diagnostic survives the reclassification.
 */
export function classifyInvalidPasswordFailure(
  safeOutput: string,
  context: RunnerPasswordContext,
): DysflowError | null {
  if (!isInvalidPasswordRunnerOutput(safeOutput)) return null;
  const passwordEnv =
    context.accessPasswordEnv ?? context.backendPasswordEnv ?? DEFAULT_PASSWORD_ENV;
  const remediation =
    `Set the correct database password in the '${passwordEnv}' environment variable, ` +
    `then restart the process that spawns the runner so the child inherits the new value. ` +
    `The password itself is never echoed by dysflow.`;
  return createDysflowError(
    "ACCESS_PASSWORD_INVALID",
    `Access rejected the password configured for '${context.accessDbPath}' (DAO 3031). ` +
      `${remediation} Runner output: ${safeOutput}`,
    {
      details: {
        accessDbPath: context.accessDbPath,
        passwordEnv,
        runnerCode: "RUNNER_FAILED",
        runnerOutput: safeOutput,
      },
      remediation,
    },
  );
}
