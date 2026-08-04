/**
 * Single source of truth for the GNU tar drive-letter workaround.
 *
 * GNU tar parses a Windows path like `C:\dir\out.tar.gz` as remote `host:path`
 * syntax and fails with "Cannot connect to C: resolve failed". `--force-local`
 * suppresses that parse. bsdtar — shipped by Windows 10+ as
 * `C:\WINDOWS\system32\tar.exe` — rejects the flag outright, so it must stay
 * conditional on the implementation actually running.
 *
 * Callers must also pass at most ONE absolute path per invocation: under
 * `--force-local` GNU tar escapes the drive colon inside a `-C` argument too,
 * turning the destination into an unopenable literal. Prefer setting the
 * child's `cwd` over passing `-C <absolute>`.
 *
 * This module holds only the DECISION and deliberately imports nothing, so each
 * caller keeps its own process-execution seam: `.github/scripts` probes with
 * `spawnSync`, while `src/cli` routes through `command-runner.ts` like all of
 * its other subprocess work. Sharing the decision is what prevents the drift
 * that left #1377 half-fixed; sharing the spawn would have broken the seam.
 *
 * It lives in `scripts/` because that directory is one of
 * RELEASE_ARCHIVE_ENTRIES, so it ships inside the release archive and is
 * present on disk at update time.
 *
 * @param {string} versionOutput stdout of `tar --version`, or "" when the probe failed.
 * @returns {string[]} `["--force-local"]` for GNU tar, otherwise `[]`.
 */
export function tarForceLocalArgsFromVersion(versionOutput) {
  return versionOutput.includes("GNU tar") ? ["--force-local"] : [];
}
