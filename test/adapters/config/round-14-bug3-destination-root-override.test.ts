/**
 * Round-14 regression — issue #1228 bug 3.
 *
 * `export_modules` with `destinationRoot: "<subdir>"` (an INTERIOR path
 * under the worktree) MUST work when the project config is modern
 * (`id` + `frontendFile` in `.dysflow/project.json`). The dispatch seam
 * currently rejects every interior override with `OUTSIDE_PROJECT_ROOT`,
 * forcing consumers to either point `destinationRoot` at the configured
 * `src/` exactly (defeating the purpose of an override) or to use
 * `exportPath` (which has its own dispatch contract).
 *
 * CRITICAL: this fix MUST NOT regress v2.28.0's
 * `allowConfiguredDestinationRoot` + `DESTINATION_ROOT_REQUIRED` gate.
 * The pre-resolve gate fires BEFORE the `diagnoseProjectConfig` resolver
 * (it lives in `dispatch-factory.ts:361-374`) and stays untouched. Bug
 * 3's scope is the post-resolve containment check at
 * `project-config-diagnostic.ts:687-696` — the legacy "destinationRoot
 * must equal configured destinationRoot" equality must be loosened to
 * "destinationRoot must be inside the project root" (or, for legacy
 * configs, must equal the configured value).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic.js";

function makeModernProject(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "round14-bug3-"));
  // Build a minimal modern config: id + frontendFile (no legacy accessPath).
  // This is the shape the consumer described in issue #1228.
  mkdirSync(join(root, ".dysflow"), { recursive: true });
  mkdirSync(join(root, ".git"), { recursive: true });
  writeFileSync(
    join(root, ".dysflow", "project.json"),
    JSON.stringify(
      {
        id: "round14-bug3-modern",
        frontendFile: "Test.accdb",
        destinationRoot: "src",
      },
      null,
      2,
    ),
    "utf8",
  );
  writeFileSync(join(root, "Test.accdb"), "", "utf8");
  mkdirSync(join(root, "src"), { recursive: true });
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe("Round-14 bug 3 — destinationRoot override with modern config (#1228)", () => {
  let project: { root: string; cleanup: () => void };

  beforeEach(() => {
    project = makeModernProject();
  });
  afterEach(() => {
    project.cleanup();
  });

  it("accepts destinationRoot override to an interior subdir of the project root (modern config)", () => {
    // Sanity: project has a modern config (id + frontendFile), no legacy accessPath.
    const baseline = diagnoseProjectConfig(project.root);
    expect(baseline.status, "baseline config must be write-ready").toBe("valid");
    expect(baseline.writeReady).toBe(true);

    // The override is an INTERIOR subdir (e.g. "scratch-export") — not the
    // configured "src" verbatim. The bug: legacy equality check rejects
    // this with OUTSIDE_PROJECT_ROOT. The fix: accept any interior path
    // when config is modern.
    const override = "scratch-export";
    mkdirSync(join(project.root, override), { recursive: true });

    const diagnosed = diagnoseProjectConfig(project.root, {
      destinationRoot: override,
    });

    expect(
      diagnosed.status,
      `interior destinationRoot override must pass; got status=${diagnosed.status}, ` +
        `diagnostics=${JSON.stringify(diagnosed.diagnostics)}`,
    ).toBe("valid");
    expect(diagnosed.writeReady).toBe(true);
  });

  it("accepts destinationRoot override with normalized forward slashes (Windows compat)", () => {
    // Mirror what an AI agent might emit when passing a Windows path with
    // mixed separators. The resolver must normalize before containment.
    const override = "scratch/inner/subdir";
    mkdirSync(join(project.root, "scratch", "inner", "subdir"), { recursive: true });

    const diagnosed = diagnoseProjectConfig(project.root, {
      destinationRoot: override,
    });
    expect(
      diagnosed.status,
      `interior destinationRoot override with forward slashes must pass; got status=${diagnosed.status}, ` +
        `diagnostics=${JSON.stringify(diagnosed.diagnostics)}`,
    ).toBe("valid");
  });

  it("rejects destinationRoot override that ESCAPES the project root", () => {
    // Sanity guard: the loosening of bug 3 must NOT turn into a free pass
    // for paths outside the project root. An escape path still fails
    // closed with OUTSIDE_PROJECT_ROOT.
    const diagnosed = diagnoseProjectConfig(project.root, {
      destinationRoot: "../outside-the-worktree",
    });
    expect(diagnosed.status).toBe("outside-project-root");
    expect(diagnosed.writeReady).toBe(false);
  });
});
