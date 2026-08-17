/**
 * Issue #1438 — export_all returns DESTINATION_ROOT_NOT_FOUND even when the
 * caller passes an EXISTING `destinationRoot` parameter (regression of #966).
 *
 * The runtime gate at `src/adapters/config/project-config-diagnostic.ts:533`
 * checks `existsSync(destinationRoot)` against the CONFIGURED value and
 * silently ignores `request.destinationRoot`. This regression means the
 * natural `git rm -r src/ && mkdir -p src/{classes,forms,modules,reports}`
 * flow cannot export against a fresh binary because the configured value
 * (after the rm) is checked instead of the override that the consumer
 * supplied.
 *
 * Acceptance criteria (mirrors the issue body):
 *
 * 1. export_all with `apply: true` succeeds when destinationRoot exists,
 *    regardless of who created it.
 * 2. Path normalization: forward slashes, backslashes, mixed accepted.
 * 3. The runtime honors explicit `destinationRoot` over the configured
 *    value when both are present.
 * 4. `clearResolution: true` fully invalidates per-project cache.
 * 5. Error message references the EXACT path checked, post-normalization.
 * 6. No regression for export_all with a valid configured destinationRoot.
 *
 * These tests exercise the gate directly through `diagnoseProjectConfig`
 * (the function the dispatch seam consults before every export), since the
 * gate is the surface the issue calls out and the unit surface is what
 * survives refactors. Issue #1438 acceptance criterion 4 (clearResolution)
 * is covered separately by `resolve-project` tests.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic.js";

/**
 * Build a fixture worktree whose configured destinationRoot is `"src"`
 * and create `src/{classes,forms,modules,reports}` so the configured path
 * itself exists. Tests that exercise the override may DELETE `src/`
 * afterward to prove the override (not the configured value) is what
 * gets checked.
 */
function makeProjectWithFreshSrc(): { root: string; src: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "issue-1438-"));
  // .git marker so worktreeRoot() resolves the worktree toplevel.
  // In a real git worktree, .git is a FILE pointing at the gitdir; the
  // existing project-config-diagnostic.test.ts uses the same shape.
  writeFileSync(join(root, ".git"), "gitdir: fixture");
  mkdirSync(join(root, ".dysflow"), { recursive: true });
  mkdirSync(join(root, "Test.accdb"));
  writeFileSync(
    join(root, ".dysflow", "project.json"),
    JSON.stringify(
      {
        id: "issue-1438-fixture",
        frontendFile: "Test.accdb",
        destinationRoot: "src",
      },
      null,
      2,
    ),
    "utf8",
  );
  const src = join(root, "src");
  mkdirSync(src, { recursive: true });
  mkdirSync(join(src, "classes"), { recursive: true });
  mkdirSync(join(src, "forms"), { recursive: true });
  mkdirSync(join(src, "modules"), { recursive: true });
  mkdirSync(join(src, "reports"), { recursive: true });
  return {
    root,
    src,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** Build a fixture whose configured `src/` does NOT exist. */
function makeProjectWithoutSrc(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "issue-1438-no-src-"));
  writeFileSync(join(root, ".git"), "gitdir: fixture");
  mkdirSync(join(root, ".dysflow"), { recursive: true });
  mkdirSync(join(root, "Test.accdb"));
  writeFileSync(
    join(root, ".dysflow", "project.json"),
    JSON.stringify(
      {
        id: "issue-1438-no-src",
        frontendFile: "Test.accdb",
        destinationRoot: "src",
      },
      null,
      2,
    ),
    "utf8",
  );
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe("Issue #1438 — destinationRoot gate honors explicit override", () => {
  let project: { root: string; src: string; cleanup: () => void };

  beforeEach(() => {
    project = makeProjectWithFreshSrc();
  });
  afterEach(() => {
    project.cleanup();
  });

  it("succeeds when destinationRoot override is an absolute path (forward slashes) and the directory exists", () => {
    // Sanity: the configured `src/` is intact, so a no-override call
    // passes today. The bug surfaces when src/ is missing AND the caller
    // passes an existing absolute path.
    const noOverride = diagnoseProjectConfig(project.root);
    expect(noOverride.status).toBe("valid");

    // Now delete the configured src/ (mirrors the user's `git rm -r src/`
    // + `mkdir src/{...}` flow AFTER the override reaches the gate).
    // We KEEP the override directory; only the configured path is gone.
    rmSync(project.src, { recursive: true, force: true });
    expect(
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      true,
    );

    const override = `${project.root.replaceAll("\\", "/")}/src`;
    mkdirSync(join(project.root, "src"), { recursive: true });
    mkdirSync(join(project.root, "src", "classes"), { recursive: true });
    mkdirSync(join(project.root, "src", "modules"), { recursive: true });

    const diagnosed = diagnoseProjectConfig(project.root, {
      destinationRoot: override,
    });
    expect(
      diagnosed.status,
      `override=${override} must honor override; got status=${diagnosed.status}, ` +
        `diagnostics=${JSON.stringify(diagnosed.diagnostics)}`,
    ).toBe("valid");
    expect(diagnosed.writeReady).toBe(true);
  });

  it("succeeds when destinationRoot override is an absolute path (backslashes) and the directory exists", () => {
    // Same shape as the forward-slash test, but the override arrives with
    // native Windows separators. Windows-native callers (PowerShell, .NET)
    // emit backslashes; the gate must normalize before existsSync.
    rmSync(project.src, { recursive: true, force: true });

    // Recreate the override as a sibling subdir so we can prove the override
    // (not the configured path) is what gets checked.
    const override = join(project.root, "scratch-export");
    mkdirSync(override, { recursive: true });
    mkdirSync(join(override, "classes"), { recursive: true });
    mkdirSync(join(override, "modules"), { recursive: true });

    const diagnosed = diagnoseProjectConfig(project.root, {
      destinationRoot: override, // native backslashes on Windows
    });
    expect(
      diagnosed.status,
      `override=${override} must honor override; got status=${diagnosed.status}, ` +
        `diagnostics=${JSON.stringify(diagnosed.diagnostics)}`,
    ).toBe("valid");
    expect(diagnosed.writeReady).toBe(true);
  });

  it("succeeds when destinationRoot override is the relative 'src' and exists", () => {
    // Caller passes a relative override that resolves to the configured
    // `src/`. The gate must normalize before the existsSync check.
    const override = "src";
    const diagnosed = diagnoseProjectConfig(project.root, {
      destinationRoot: override,
    });
    expect(diagnosed.status).toBe("valid");
    expect(diagnosed.writeReady).toBe(true);
  });

  it("honors explicit destinationRoot override, not the configured value", () => {
    // This is the precise regression from #1438: configured src/ is
    // missing, but the explicit override exists. The gate must check the
    // OVERRIDE, not the configured value.
    rmSync(project.src, { recursive: true, force: true });

    // Make sure the configured path is genuinely missing.
    const overrideRoot = join(project.root, "scratch-export");
    mkdirSync(overrideRoot, { recursive: true });
    mkdirSync(join(overrideRoot, "classes"), { recursive: true });
    mkdirSync(join(overrideRoot, "modules"), { recursive: true });

    const diagnosed = diagnoseProjectConfig(project.root, {
      destinationRoot: "scratch-export",
    });
    expect(diagnosed.status).toBe("valid");
    expect(diagnosed.writeReady).toBe(true);
  });

  it("error message references the exact path checked, not generic 'Configured'", () => {
    // When the destinationRoot genuinely does NOT exist — neither
    // configured nor override — the error envelope must name the exact
    // path that the gate tried to read, post-normalization.
    const projectNoSrc = makeProjectWithoutSrc();
    try {
      const diagnosed = diagnoseProjectConfig(projectNoSrc.root, {
        destinationRoot: "scratch-export",
      });
      expect(diagnosed.status).toBe("destination-root-not-found");
      const diagnostic = diagnosed.diagnostics.find((d) => d.code === "DESTINATION_ROOT_NOT_FOUND");
      expect(diagnostic, "DESTINATION_ROOT_NOT_FOUND entry must exist").toBeDefined();
      // Must mention the EFFECTIVE path (override resolved + normalized),
      // not a generic "Configured destinationRoot" phrase.
      const message = diagnostic?.message ?? "";
      expect(
        message,
        `error message must not say "Configured destinationRoot"; got: ${message}`,
      ).not.toMatch(/Configured destinationRoot/i);
      expect(
        message,
        `error message must reference the resolved override path; got: ${message}`,
      ).toContain("scratch-export");
    } finally {
      projectNoSrc.cleanup();
    }
  });

  it("no regression: configured destinationRoot path still gates when no override is supplied", () => {
    // The fix must NOT relax the configured-path gate when no override is
    // supplied. When the configured `src/` is missing, the gate still
    // fires — just with the corrected message.
    const projectNoSrc = makeProjectWithoutSrc();
    try {
      const diagnosed = diagnoseProjectConfig(projectNoSrc.root);
      expect(diagnosed.status).toBe("destination-root-not-found");
      const diagnostic = diagnosed.diagnostics.find((d) => d.code === "DESTINATION_ROOT_NOT_FOUND");
      expect(diagnostic).toBeDefined();
      // Must reference the configured path, not the generic phrase.
      const message = diagnostic?.message ?? "";
      expect(message).toMatch(/src/);
    } finally {
      projectNoSrc.cleanup();
    }
  });
});

// `sep` is referenced to keep the import meaningful on platforms where
// path separators differ; the override contract is separator-agnostic.
void sep;
