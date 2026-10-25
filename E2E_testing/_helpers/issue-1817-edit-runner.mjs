// Runs the external Access edit used by the Issue 1817 E2E scenario (#1898).
//
// The default timeout keeps the historical 60 s budget. Runners that are slow
// to start Access can raise it with DYSFLOW_E2E_ACCESS_EDIT_TIMEOUT_MS. Only a
// spawn timeout is retried, and only up to DEFAULT_EDIT_ATTEMPTS attempts: any
// other failure is an assertion result and is returned unchanged.

export const DEFAULT_EDIT_TIMEOUT_MS = 60000;
export const DEFAULT_EDIT_ATTEMPTS = 2;
export const EDIT_TIMEOUT_ENV = "DYSFLOW_E2E_ACCESS_EDIT_TIMEOUT_MS";

export function resolveEditTimeoutMs(env) {
  const raw = env[EDIT_TIMEOUT_ENV];
  if (raw === undefined || raw === "") return DEFAULT_EDIT_TIMEOUT_MS;
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
    throw new Error(`${EDIT_TIMEOUT_ENV} must be a positive integer (milliseconds), got "${raw}"`);
  }
  return Number(raw);
}

export function runAccessEdit({ spawn, args, env, command = "powershell.exe", attempts = DEFAULT_EDIT_ATTEMPTS }) {
  const timeout = resolveEditTimeoutMs(env);
  let result;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    result = spawn(command, args, { encoding: "utf8", windowsHide: true, timeout });
    if (result.error?.code !== "ETIMEDOUT") return result;
  }
  return result;
}
