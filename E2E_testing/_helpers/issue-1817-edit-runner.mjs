// Runs the external Access edit used by the Issue 1817 E2E scenario (#1898).
//
// The default timeout keeps the historical 60 s budget. Runners that are slow
// to start Access can raise it with DYSFLOW_E2E_ACCESS_EDIT_TIMEOUT_MS. Only a
// spawn timeout is retried, and only up to DEFAULT_EDIT_ATTEMPTS attempts: any
// other failure is an assertion result and is returned unchanged.
//
// `create` is not idempotent, so it is retried only when the caller supplies
// `resetCreate` to remove the partial fixture database first (#1974). A create
// that still times out carries a `diagnosis` naming the hung start.

import { win32 } from "node:path";

export const DEFAULT_EDIT_TIMEOUT_MS = 60000;
export const DEFAULT_EDIT_ATTEMPTS = 2;
export const CREATE_ATTEMPTS = 2;
export const EDIT_TIMEOUT_ENV = "DYSFLOW_E2E_ACCESS_EDIT_TIMEOUT_MS";
export const FIXTURE_MARKER_FILE = ".issue-1817-fixture";
export const FIXTURE_DATABASE_FILES = ["Fixture.accdb", "Fixture.laccdb"];

export function resolveEditTimeoutMs(env) {
  const raw = env[EDIT_TIMEOUT_ENV];
  if (raw === undefined || raw === "") return DEFAULT_EDIT_TIMEOUT_MS;
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
    throw new Error(`${EDIT_TIMEOUT_ENV} must be a positive integer (milliseconds), got "${raw}"`);
  }
  return Number(raw);
}

/**
 * Removes the database a timed-out `create` may have left behind (#1974). Mirrors the
 * editor's own guard: the root must sit strictly under the temp directory and carry the
 * fixture marker, and only the fixture database and its lock file are touched.
 * @param {{ root: string, tmpDir: string, exists: (path: string) => boolean, remove: (path: string) => void }} input
 */
export function removePartialFixtureDatabase({ root, tmpDir, exists, remove }) {
  const relative = win32.relative(win32.resolve(tmpDir), win32.resolve(root));
  const underTemp = relative !== "" && !relative.startsWith("..") && !win32.isAbsolute(relative);
  if (!underTemp || !exists(win32.join(root, FIXTURE_MARKER_FILE))) {
    throw new Error(
      `Refusing to remove a fixture database outside the marked disposable fixture: ${root}`,
    );
  }
  for (const name of FIXTURE_DATABASE_FILES) {
    const path = win32.join(root, name);
    if (exists(path)) remove(path);
  }
}

function describeTimeout({ action, attempt, maxAttempts, elapsedMs, note }) {
  const base =
    `action=${action} attempt ${attempt}/${maxAttempts} elapsedMs=${elapsedMs}: ` +
    "the Access start hung (spawn ETIMEDOUT)";
  return note ? `${base}; ${note}` : base;
}

export function runAccessEdit({
  spawn,
  args,
  env,
  command = "powershell.exe",
  attempts = DEFAULT_EDIT_ATTEMPTS,
  action,
  resetCreate,
  now = Date.now,
}) {
  const timeout = resolveEditTimeoutMs(env);
  const isCreate = action === "create";
  // A timed-out create may already have written the database, so a blind retry fails with
  // "already exists" (run 40281030424). It is retried only after resetCreate removed it.
  const maxAttempts = isCreate ? (resetCreate ? CREATE_ATTEMPTS : 1) : attempts;
  const startedAt = now();
  let result;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    result = spawn(command, args, { encoding: "utf8", windowsHide: true, timeout });
    if (result.error?.code !== "ETIMEDOUT") return result;
    if (!isCreate) continue;
    let note;
    if (attempt < maxAttempts) {
      try {
        resetCreate();
        continue;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        note = `partial fixture removal failed, create not retried: ${reason}`;
      }
    }
    const elapsedMs = now() - startedAt;
    return {
      ...result,
      diagnosis: describeTimeout({ action, attempt, maxAttempts, elapsedMs, note }),
    };
  }
  return result;
}
