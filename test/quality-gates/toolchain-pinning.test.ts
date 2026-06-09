/**
 * CI guard for the toolchain exact-pinning policy
 * (docs/dev/toolchain-pinning.md).
 *
 * Policy: every entry in `dependencies` and `devDependencies` is pinned to an
 * EXACT version (no caret `^`, no `*`, no range). The single documented
 * exception is `@types/node`, which may use a tilde `~` range for patch-only
 * updates on the Node typings.
 *
 * Without this guard the policy rots silently: a `pnpm up`, a careless edit, or
 * a future tool that rewrites package.json can reintroduce a caret range and
 * nothing would catch it until a fresh-major drift breaks the build. This test
 * fails loudly the moment a non-exact version is reintroduced.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const PACKAGE_JSON = path.join(REPO_ROOT, "package.json");

/** The one documented exception: `@types/node` may use a tilde range. */
const TILDE_EXEMPT = new Set(["@types/node"]);

/** Exact semver, optionally with a pre-release/build suffix. No range operators. */
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
/** Tilde-pinned exact semver (allowed only for the exempt packages). */
const TILDE_VERSION = /^~\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as PackageJson;
}

function collectViolations(deps: Record<string, string> | undefined): string[] {
  if (deps === undefined) return [];
  const violations: string[] = [];
  for (const [name, version] of Object.entries(deps)) {
    if (TILDE_EXEMPT.has(name)) {
      if (!TILDE_VERSION.test(version) && !EXACT_VERSION.test(version)) {
        violations.push(`${name}: "${version}" (exempt package must be exact or tilde-pinned)`);
      }
      continue;
    }
    if (!EXACT_VERSION.test(version)) {
      violations.push(`${name}: "${version}" (must be an exact pin, e.g. "1.2.3")`);
    }
  }
  return violations;
}

describe("toolchain exact-pinning guard (CI required)", () => {
  it("pins every dependency to an exact version (no caret/range)", () => {
    const pkg = readPackageJson();
    const violations = collectViolations(pkg.dependencies);
    expect(
      violations,
      `dependencies must be exact-pinned per docs/dev/toolchain-pinning.md. Offenders:\n  ${violations.join("\n  ")}`,
    ).toEqual([]);
  });

  it("pins every devDependency to an exact version, allowing only the documented tilde exception", () => {
    const pkg = readPackageJson();
    const violations = collectViolations(pkg.devDependencies);
    expect(
      violations,
      `devDependencies must be exact-pinned (only ${[...TILDE_EXEMPT].join(", ")} may use a tilde range) per docs/dev/toolchain-pinning.md. Offenders:\n  ${violations.join("\n  ")}`,
    ).toEqual([]);
  });

  it("keeps the tilde exemption narrow: @types/node is the only allowed tilde range", () => {
    const pkg = readPackageJson();
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const tildeUsers = Object.entries(allDeps)
      .filter(([, version]) => version.startsWith("~"))
      .map(([name]) => name);
    const unexpected = tildeUsers.filter((name) => !TILDE_EXEMPT.has(name));
    expect(
      unexpected,
      `Only ${[...TILDE_EXEMPT].join(", ")} may use a tilde range. Unexpected tilde users:\n  ${unexpected.join("\n  ")}`,
    ).toEqual([]);
  });
});
