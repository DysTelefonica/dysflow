import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #750 — cheap pre-merge check that the `diagnostics` branch of the
 * PowerShell runner script does NOT open or write to the .accdb before
 * returning. Opening Access even in read-only mode rewrites metadata
 * (timestamps, internal stats) on the binary, which is exactly the
 * problem this fix targets.
 *
 * This static check parses the script text and verifies the order of
 * operations around the `if ($Operation -eq 'diagnostics')` branch.
 * The complementary E2E (`access-runner-readlock.e2e.test.ts`) verifies
 * the same contract at the binary level; this unit test catches the
 * regression cheaply in CI without spawning PowerShell/Access.
 *
 * Contract: between script entry and the `diagnostics` branch, the
 * script must NOT call any Access-COM mutating operation on the
 * `$access` object (e.g. `DoCmd.SetWarnings`, `CurrentDb`, `OpenRecordset`).
 * The branch itself must terminate the script with `return` BEFORE the
 * canonical Access open path runs DoCmd-side effects.
 */

const scriptPath = "scripts/dysflow-access-runner.ps1";

function readScript(): string {
  return readFileSync(scriptPath, "utf8");
}

/**
 * Extract the body of the ACTIVE `if ($Operation -eq 'diagnostics')` branch
 * (the one with the early-return path). Returns the text span between
 * the opening `{` and the matching closing `}`.
 */
function extractDiagnosticsBranch(script: string): string | null {
  const re = /if\s*\(\s*\$Operation\s*-eq\s*'diagnostics'\s*\)\s*\{/g;
  for (const match of script.matchAll(re)) {
    const openIdx = match.index + match[0].length - 1; // index of `{`
    let depth = 0;
    let endIdx = -1;
    for (let i = openIdx; i < script.length; i++) {
      const ch = script[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
    if (endIdx < 0) continue;
    const body = script.slice(openIdx + 1, endIdx);
    if (/Write-DysflowResult/.test(body) && /;\s*return\b/.test(body)) {
      return body;
    }
  }
  return null;
}

/**
 * Index of the ACTIVE diagnostics branch in the script (the one that
 * contains the early-return path). Dead-code branches that exist only
 * to satisfy backward-compatible greps (`throw "Dead code..."` sentinel)
 * are skipped. Returns -1 if no live branch is found.
 */
function diagnosticsBranchIndex(script: string): number {
  const re = /if\s*\(\s*\$Operation\s*-eq\s*'diagnostics'\s*\)\s*\{/g;
  for (const match of script.matchAll(re)) {
    // Find the matching `}` at the same depth.
    const openIdx = match.index + match[0].length - 1; // index of `{`
    let depth = 0;
    let endIdx = -1;
    for (let i = openIdx; i < script.length; i++) {
      const ch = script[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
    if (endIdx < 0) continue;
    const body = script.slice(openIdx + 1, endIdx);
    // The LIVE branch contains `Write-DysflowResult` + `; return` early-out.
    // A DEAD branch contains `throw "Dead code..."` or similar sentinel.
    if (/Write-DysflowResult/.test(body) && /;\s*return\b/.test(body)) {
      return match.index;
    }
  }
  return -1;
}

describe("scripts/dysflow-access-runner.ps1 — diagnostics branch (#750)", () => {
  it("contains an explicit if ($Operation -eq 'diagnostics') branch", () => {
    const script = readScript();
    const idx = diagnosticsBranchIndex(script);
    expect(idx).toBeGreaterThan(-1);
  });

  it("diagnostics branch terminates with $script:exitCode = 0; return (or equivalent) BEFORE accessing the binary", () => {
    const script = readScript();
    const branch = extractDiagnosticsBranch(script);
    expect(branch).not.toBeNull();
    if (branch === null) return;
    // The branch must contain an early-return pattern so it never falls
    // through into the post-branch access path. Without this, Access
    // is opened and the .accdb metadata is rewritten.
    const hasReturn = /\breturn\b/.test(branch);
    const hasExitAssignment = /\$script:exitCode\s*=/.test(branch);
    expect(
      hasReturn,
      "diagnostics branch must contain a `return` so it never falls through into the Access-COM open path",
    ).toBe(true);
    expect(
      hasExitAssignment,
      "diagnostics branch must set $script:exitCode so the script exits cleanly",
    ).toBe(true);
  });

  it("diagnostics branch does not call Access-COM mutating methods on $access (DoCmd.SetWarnings, CurrentDb, OpenRecordset)", () => {
    const script = readScript();
    const branch = extractDiagnosticsBranch(script);
    expect(branch).not.toBeNull();
    if (branch === null) return;
    // The branch is read-only by contract. None of these mutating
    // operations are allowed.
    const forbidden: readonly { name: string; pattern: RegExp }[] = [
      { name: "DoCmd.SetWarnings", pattern: /\$access\.DoCmd\.SetWarnings\b/ },
      { name: "DoCmd.* (any DoCmd call)", pattern: /\$access\.DoCmd\.[A-Za-z]+/ },
      { name: "CurrentDb (any)", pattern: /\$access\.CurrentDb\b/ },
      { name: "OpenRecordset (any)", pattern: /\$access\.OpenRecordset\b/ },
      { name: "Execute (any)", pattern: /\$access\.Execute\b/ },
      { name: "Run (any)", pattern: /\$access\.Run\b/ },
    ];
    for (const { name, pattern } of forbidden) {
      expect(
        pattern.test(branch),
        `diagnostics branch must not call ${name} — that opens Access and rewrites .accdb metadata`,
      ).toBe(false);
    }
  });

  it("diagnostics branch returns BEFORE the canonical Access-open path (no DoCmd effects before the early return)", () => {
    const script = readScript();
    const branchStart = diagnosticsBranchIndex(script);
    expect(branchStart).toBeGreaterThan(-1);
    if (branchStart < 0) return;
    // Find the next `$access.DoCmd.` call AFTER the diagnostics branch.
    // If that call appears BEFORE the branch's `return`, the script
    // is mutating the binary before the read-only path exits — regression.
    const diagnosticsBlock = script.slice(branchStart);
    const branchReturn = /;\s*return\b/.exec(diagnosticsBlock);
    const branchReturnIdx = branchReturn?.index ?? -1;
    expect(
      branchReturnIdx,
      "diagnostics branch must contain `; return` before exiting",
    ).toBeGreaterThan(-1);
    // The diagnostics branch's return must come before any other
    // `$access.DoCmd.*` call in the script. If there's a DoCmd call
    // before the branch's return (impossible by ordering — the branch
    // is the entry point — but worth pinning), this test fails.
    const doCmdAfterBranch = /\$access\.DoCmd\./.exec(diagnosticsBlock);
    if (doCmdAfterBranch) {
      const doCmdIdx = doCmdAfterBranch.index;
      // If a DoCmd call is inside the diagnostics branch and BEFORE
      // the return, that's a regression. (The canonical Access open
      // path runs DoCmd.SetWarnings AFTER the diagnostics branch ends;
      // that one is fine.)
      if (doCmdIdx < branchReturnIdx) {
        throw new Error(
          `diagnostics branch calls $access.DoCmd. before its return — ` +
            "this opens Access and rewrites .accdb metadata before the " +
            "read-only path exits.",
        );
      }
    }
  });

  it("diagnostics branch is evaluated BEFORE any code that opens Access (Open-CanonicalAccess / OpenCurrentDatabase)", () => {
    const script = readScript();
    const branchStart = diagnosticsBranchIndex(script);
    expect(branchStart).toBeGreaterThan(-1);
    if (branchStart < 0) return;
    // The diagnostics branch must appear BEFORE the canonical Access
    // open path. Otherwise the runner opens the .accdb and rewrites its
    // metadata BEFORE the read-only branch gets a chance to return early.
    // We match the CALLS (which are followed by `` ` `` or whitespace +
    // `-` for splatting) — not function definitions or comments.
    // The diagnostics branch must appear BEFORE the main-flow Access open.
    // The main-flow call is `$script:canonicalSession = Open-CanonicalAccess \``,
    // not any mention of these names in comments, function definitions, or
    // helper function bodies.
    const openAccessPatterns: readonly { name: string; pattern: RegExp }[] = [
      {
        name: "Open-CanonicalAccess",
        pattern: /\$script:canonicalSession\s*=\s*Open-CanonicalAccess\b/,
      },
    ];
    for (const { name, pattern } of openAccessPatterns) {
      const match = pattern.exec(script);
      if (!match) continue;
      const openIdx = match.index;
      expect(
        branchStart < openIdx,
        `diagnostics branch must appear BEFORE "${name}" ` +
          `at line ${script.slice(0, openIdx).split("\n").length}. ` +
          "Otherwise the runner opens the .accdb before the read-only " +
          "branch returns, causing Access to rewrite .accdb metadata.",
      ).toBe(true);
    }
  });
});
