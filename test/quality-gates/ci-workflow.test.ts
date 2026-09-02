import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { PR_SMOKE_TESTS } from "../e2e-suite-authority.js";

async function readText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

function workflowRunCommands(workflow: string): string[] {
  return [...workflow.matchAll(/^\s*run:\s*(.+)$/gm)].map((match) => (match[1] ?? "").trim());
}

/** Extract every concrete `*.test.ts` file (not a glob) from a vitest config. */
function vitestConfigPaths(config: string): string[] {
  const array = (label: string): string[] => {
    const block = new RegExp(`${label}:\\s*\\[([^\\]]+)\\]`).exec(config);
    if (!block || block[1] === undefined) return [];
    return [...block[1].matchAll(/["']([^"']+\.test\.ts)["']/g)].map((m) => m[1] ?? "");
  };
  return [...array("include"), ...array("exclude")].filter((p) => p.length > 0 && !p.includes("*"));
}

/** Extract every concrete `*.test.ts` file (not a glob) from a `run:` step in a workflow. */
function workflowRunTestPaths(workflow: string): string[] {
  const out: string[] = [];
  for (const match of workflow.matchAll(/(\S*\.test\.ts)\b/g)) {
    const path = match[1] ?? "";
    if (path.length > 0 && !path.startsWith("-") && !path.includes("*") && !path.startsWith("--")) {
      out.push(path);
    }
  }
  return out;
}

/** The body of one top-level job in a workflow, without the neighbouring jobs. */
function workflowJobBlock(workflow: string, job: string): string {
  const lines = workflow.split(/\r?\n/);
  const start = lines.indexOf(`  ${job}:`);
  if (start < 0) throw new Error(`.github/workflows/ci.yml declares no "${job}" job`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}\S/.test(line));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n");
}

function toNodeMajors(entries: readonly string[]): number[] {
  return entries
    .map((entry) => Number.parseInt(entry.trim().replace(/^["']|["']$/g, ""), 10))
    .filter((major) => Number.isInteger(major));
}

/** Every Node major listed in a job's *literal* `strategy.matrix.node-version`. */
function matrixNodeMajors(jobBlock: string): number[] {
  const inline = /node-version:[ \t]*\[([^\]]*)\]/.exec(jobBlock);
  const listed = /node-version:[ \t]*\n((?:[ \t]*-[ \t]*\S+\n?)+)/.exec(jobBlock);
  const entries =
    inline?.[1] !== undefined
      ? inline[1].split(",")
      : [...(listed?.[1] ?? "").matchAll(/-[ \t]*(\S+)/g)].map((match) => match[1] ?? "");
  return toNodeMajors(entries);
}

/**
 * The Node majors a job's matrix runs, split by whether the pull-request event
 * is what selects them.
 *
 * A matrix may be a literal array — every event runs the same majors — or an
 * expression that widens the matrix for pull requests and narrows it elsewhere
 * (a push to main re-verifying a tree a pull request already proved). The
 * support claim in `engines.node` must be verified on the pull-request path;
 * `everyEvent` exists so a narrowed arm still cannot smuggle in a major the
 * package never claimed.
 */
interface MatrixNodeCoverage {
  readonly pullRequest: number[];
  readonly everyEvent: number[];
}

function matrixNodeCoverage(jobBlock: string): MatrixNodeCoverage {
  // Scope to the `matrix:` declaration. Every step also carries
  // `node-version: ${{ matrix.node-version }}`, and once the matrix itself
  // became a literal list (#1506) an unscoped search matched that step instead
  // and reported the matrix as conditional on `matrix.node-version`.
  const matrixBlock = /^\s*matrix:\n([\s\S]*?)(?=^\s{4}\S|^\s{0,4}steps:)/m.exec(jobBlock)?.[1];
  const declaration = matrixBlock ?? jobBlock;
  const expression = /node-version:[ \t]*\$\{\{(.+)\}\}/.exec(declaration)?.[1];
  if (expression === undefined) {
    const literal = matrixNodeMajors(declaration);
    return { pullRequest: literal, everyEvent: literal };
  }
  if (!expression.includes("github.event_name == 'pull_request'")) {
    throw new Error(
      `the Quality gates matrix is conditional on something other than the pull_request event: ${expression.trim()}`,
    );
  }
  // `<cond> && '<a>' || '<b>'` — the first quoted array is the arm the
  // condition selects, i.e. the pull-request matrix.
  const arms = [...expression.matchAll(/'\[([^\]]*)\]'/g)].map((match) =>
    toNodeMajors((match[1] ?? "").split(",")),
  );
  const pullRequest = arms[0];
  if (pullRequest === undefined) {
    throw new Error(
      `the Quality gates matrix expression declares no Node array: ${expression.trim()}`,
    );
  }
  return { pullRequest, everyEvent: arms.flat() };
}

/**
 * The Node majors at the boundaries of an `engines.node` range.
 *
 * An open-ended range has no ceiling, so no finite CI matrix can ever cover it —
 * that is a declaration defect, not a missing matrix entry, and it is reported
 * as such rather than silently assuming a ceiling the package never claimed.
 */
function enginesNodeBoundaries(declared: string): { floor: number; ceiling: number } {
  const floor = /(?:^|\s)>=\s*(\d+)\.\d+\.\d+/.exec(declared);
  const ceiling = /(?:^|\s)<(?!=)\s*(\d+)\.(\d+)\.(\d+)/.exec(declared);
  if (!floor) throw new Error(`engines.node "${declared}" declares no lower bound`);
  if (!ceiling) {
    throw new Error(
      `engines.node "${declared}" is open-ended: it claims every Node major above the floor, which no CI matrix can verify`,
    );
  }
  // `<25.0.0` supports Node 24; `<25.1.0` supports Node 25.
  const exclusiveMajor = Number(ceiling[1]);
  const atMajorBoundary = ceiling[2] === "0" && ceiling[3] === "0";
  return {
    floor: Number(floor[1]),
    ceiling: atMajorBoundary ? exclusiveMajor - 1 : exclusiveMajor,
  };
}

describe("repository quality gates", () => {
  it("keeps stable required checks while routing docs-only pull requests", async () => {
    const [ci, docs] = await Promise.all([
      readText(".github/workflows/ci.yml"),
      readText(".github/workflows/documentation-quality.yml"),
    ]);
    expect(ci).toContain("changes:");
    expect(workflowJobBlock(ci, "quality")).toContain(
      "needs.changes.outputs.code_required == 'true'",
    );
    expect(workflowJobBlock(ci, "ci-result")).toMatch(/if: always\(\)/);
    expect(workflowJobBlock(ci, "ci-result")).toContain("docs-only");
    expect(docs).toContain("name: Documentation quality");
    expect(docs).toContain("check-documentation-quality.mjs check");
    expect(docs).not.toMatch(/^\s+paths:/m);
  });
  it("runs install, lint, build, and the coverage suite in CI", async () => {
    // `pnpm test` is deliberately absent: `pnpm coverage` is a strict superset,
    // so asserting both would pin back the duplication #1506 removed.
    const workflow = await readText(".github/workflows/ci.yml");
    const commands = workflowRunCommands(workflow);

    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("push:");
    expect(commands).toContain("pnpm install --frozen-lockfile");
    expect(commands).toContain("pnpm lint");
    expect(commands).toContain("pnpm build");
    expect(commands).toContain("pnpm coverage");
    expect(commands.indexOf("pnpm lint")).toBeLessThan(commands.indexOf("pnpm build"));
  });

  it("does not repeat full tests after a validated PR merge (#1571)", async () => {
    const [workflow, docs] = await Promise.all([
      readText(".github/workflows/ci.yml"),
      readText("docs/testing/repo-quality-gates.md"),
    ]);
    const integrity = workflowJobBlock(workflow, "main-integrity");
    const quality = workflowJobBlock(workflow, "quality");
    const result = workflowJobBlock(workflow, "ci-result");

    expect(integrity).toContain("validated_pr_merge");
    expect(integrity).toContain("merge_commit_sha");
    expect(integrity).toContain("base.sha");
    expect(integrity).toContain("head.sha");
    expect(integrity).toContain("actions/workflows/ci.yml/runs");
    expect(integrity).toContain("node scripts/dependency-audit-evidence.mjs");
    expect(integrity).not.toContain("cache: pnpm");
    expect(integrity).toContain("package-manager-cache: false");
    expect(integrity).not.toContain("pnpm coverage");
    expect(integrity).not.toContain("pnpm test:public");
    expect(integrity).not.toContain("pnpm mcp:context-budget");

    expect(quality).toContain("needs.main-integrity.outputs.validated_pr_merge != 'true'");
    expect(quality).not.toContain("node scripts/dependency-audit-evidence.mjs");
    expect(result).toContain("validated PR merge: full quality already passed before merge");
    expect(result).toContain("direct or unverifiable push: full quality required");
    expect(docs).toMatch(/Validated PR merges do not\s+repeat the full quality suite/);
    expect(docs).toMatch(/Direct, ambiguous, or API-unverifiable pushes remain fail-closed/);
  });

  it("builds exactly once per job, before anything reads dist (#1506)", async () => {
    // The build ran twice per leg: the root `prepare` lifecycle during
    // `pnpm install`, then an explicit step. Removing the explicit step and
    // keeping `prepare` was measured and rejected — pnpm skips lifecycle
    // scripts when an install is a no-op, so the build silently would not
    // happen and release-bundled-skills-1349 fails with a bare ENOENT from its
    // unguarded `access(dist/cli/index.js)`. It survives in CI today only
    // because node_modules is uncached, which is a side effect, not a contract.
    //
    // So `prepare` is the half that goes: an explicit step ordered ahead of its
    // consumers cannot skip, and a lifecycle hook can.
    const packageJson = JSON.parse(await readText("package.json")) as {
      scripts?: Record<string, string>;
    };
    expect(
      packageJson.scripts?.prepare,
      "`prepare` reintroduces a second build on every install; CI builds explicitly instead",
    ).toBeUndefined();

    const workflow = await readText(".github/workflows/ci.yml");
    for (const jobName of ["quality", "windows-integration-smoke"]) {
      const builds = workflowRunCommands(workflowJobBlock(workflow, jobName)).filter(
        (command) => command === "pnpm build",
      );
      expect(builds.length, `${jobName} must build exactly once`).toBe(1);
    }

    // Both of these read `dist/`, so the build has to precede them.
    const qualityCommands = workflowRunCommands(workflowJobBlock(workflow, "quality"));
    for (const consumer of ["pnpm coverage", "pnpm mcp:context-budget"]) {
      expect(
        qualityCommands.indexOf("pnpm build"),
        `\`${consumer}\` reads dist/ and must run after the build`,
      ).toBeLessThan(qualityCommands.indexOf(consumer));
    }
  });

  it("runs the complete quality-gate suite on the supported Windows platform", async () => {
    const workflow = await readText(".github/workflows/ci.yml");

    expect(workflowJobBlock(workflow, "quality")).toMatch(/runs-on: windows-latest/);
    expect(workflow).toContain("windows-integration-smoke:");
    expect(workflow).toContain("runs-on: windows-latest");
    expect(workflow).toContain("Get-Command powershell.exe");
    // The Windows integration command lists exactly the e2e + integration files
    // matched by vitest.integration.config.ts. Drift is caught by the structural
    // assertion below (#580) — this test now only pins the integration-config
    // glob, not a verbatim command.
    expect(await readText("vitest.integration.config.ts")).toContain("test/e2e/**/*.test.ts");
  });

  it("every *.test.ts referenced by vitest configs and CI workflow exists on disk (#580)", async () => {
    const vitestUnit = await readText("vitest.config.ts");
    const vitestIntegration = await readText("vitest.integration.config.ts");
    const workflow = await readText(".github/workflows/ci.yml");

    const referenced = new Set<string>([
      ...vitestConfigPaths(vitestUnit),
      ...vitestConfigPaths(vitestIntegration),
      ...workflowRunTestPaths(workflow),
    ]);

    expect(
      referenced.size,
      "expected at least one *.test.ts reference across configs and workflow",
    ).toBeGreaterThan(0);

    for (const ref of referenced) {
      expect(
        existsSync(ref),
        `${ref} is referenced by a vitest config or CI workflow but does not exist on disk`,
      ).toBe(true);
    }
  });

  it("pins the GitHub Actions the quality gate depends on (#190)", async () => {
    // #190 originally paired the action versions with a literal Node 20 floor.
    // The floor moved to 26 in #1506, and restating any literal here would make
    // this test a second source of truth for the supported range. The matrix
    // test below owns that, derived from engines.node; this one owns the
    // actions.
    const workflow = await readText(".github/workflows/ci.yml");

    expect(workflow).toContain("uses: actions/checkout@v5");
    expect(workflow).toContain("uses: actions/setup-node@v5");
    expect(workflow).toContain("uses: pnpm/action-setup@v6");
  });

  it("runs the quality gates on every Node major the package claims to support (#1153)", async () => {
    // Both halves are derived, never restated: widening `engines.node` without a
    // matching matrix entry — or matrixing a Node the package never claimed —
    // fails here instead of shipping an unverified support claim.
    //
    // The claim is verified on the pull-request path, the event every change
    // passes through. A narrower arm for other events is allowed (a push to
    // main re-verifying an already-proven tree) but may never reach a major
    // outside the declared range.
    const workflow = await readText(".github/workflows/ci.yml");
    const declared =
      (JSON.parse(await readText("package.json")) as { engines?: Record<string, string> }).engines
        ?.node ?? "";
    const supported = enginesNodeBoundaries(declared);
    const quality = workflowJobBlock(workflow, "quality");
    const matrix = matrixNodeCoverage(quality);

    expect(quality, "the Quality gates job must take its Node version from the matrix").toMatch(
      /node-version:\s*\$\{\{\s*matrix\.node-version\s*\}\}/,
    );
    expect(
      matrix.pullRequest,
      `engines.node "${declared}" claims Node ${supported.floor}, which the Quality gates matrix never runs on a pull request`,
    ).toContain(supported.floor);
    expect(
      matrix.pullRequest,
      `engines.node "${declared}" claims Node up to ${supported.ceiling}, which the Quality gates matrix never runs on a pull request`,
    ).toContain(supported.ceiling);
    for (const major of matrix.everyEvent) {
      expect(
        major >= supported.floor && major <= supported.ceiling,
        `the Quality gates matrix runs Node ${major}, which engines.node "${declared}" does not claim to support`,
      ).toBe(true);
    }
  });

  it("runs the test suite exactly once per Node leg (#1188)", async () => {
    // `pnpm coverage` is `vitest run --coverage`: the same suite `pnpm test`
    // runs, plus instrumentation and thresholds. Running both doubles the
    // heaviest step for no extra signal.
    //
    // #1188 expressed that as "each leg reaches exactly one of them, selected by
    // a matrix condition", which required both commands to be present. #1506
    // collapsed the matrix to a single leg, so the guard is stated as the
    // invariant it always meant: the job runs one suite command, unconditionally
    // or matrix-selected, but never both at once.
    const workflow = await readText(".github/workflows/ci.yml");
    const quality = workflowJobBlock(workflow, "quality");
    const steps = quality.split(/^ {6}- name: /m).slice(1);

    const suiteSteps = ["pnpm test", "pnpm coverage"].flatMap((command) => {
      const step = steps.find((body) => new RegExp(`run: ${command}\\s*$`, "m").test(body));
      return step === undefined ? [] : [{ command, step }];
    });

    expect(
      suiteSteps.length,
      "the Quality gates job runs neither `pnpm test` nor `pnpm coverage`",
    ).toBeGreaterThan(0);

    const unguarded = suiteSteps.filter(
      ({ step }) => !/^\s*if: matrix\.node-version [!=]= \d+$/m.test(step),
    );
    expect(
      unguarded.length,
      `${unguarded.map((entry) => entry.command).join(" and ")} run on every leg; at most one suite ` +
        "command may be unguarded, or the suite runs twice per leg",
    ).toBeLessThanOrEqual(1);
  });

  it("runs no step twice across the quality-gate matrix (#1506)", async () => {
    // The two-leg matrix ran lint, the public suite and the build on both legs
    // with no `if:`, so each executed twice per pull request against pinned,
    // deterministic tooling. A single leg makes that impossible by construction;
    // this pins it, so re-widening the matrix without guarding the deterministic
    // steps fails here rather than quietly doubling the bill again.
    const workflow = await readText(".github/workflows/ci.yml");
    const quality = workflowJobBlock(workflow, "quality");
    const legs = matrixNodeCoverage(quality).everyEvent;

    if (legs.length <= 1) {
      expect(legs.length).toBe(1);
      return;
    }

    const steps = quality.split(/^ {6}- name: /m).slice(1);
    const unguardedRepeatable = steps.filter((body) => {
      const runsDeterministicWork = /run: pnpm (lint|build|test:public|coverage|test)\s*$/m.test(
        body,
      );
      const guarded = /^\s*if: /m.test(body);
      return runsDeterministicWork && !guarded;
    });

    expect(
      unguardedRepeatable,
      "a multi-leg matrix must guard every deterministic step, or it runs twice per pull request",
    ).toEqual([]);
  });

  it("cancels superseded pull-request runs but never a push to main (#1188)", async () => {
    // A superseded pull-request run validates a commit that will never merge.
    // A push to main is different: scripts/release-prepare.ps1 polls the CI
    // conclusion for one release SHA and refuses to tag on anything but
    // `success`, so cancelling a main run would abort a legitimate release.
    const workflow = await readText(".github/workflows/ci.yml");

    expect(workflow, "CI declares no concurrency group").toMatch(/^concurrency:$/m);
    expect(workflow).toMatch(
      /^\s*cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}$/m,
    );
  });

  it("uses Linux for packaging and the self-hosted Windows runner for the full E2E battery", async () => {
    // Release quality authority is platform-neutral and runs on Linux. The
    // Access-dependent E2E battery remains on the self-hosted Windows runner.
    const workflow = await readText(".github/workflows/release.yml");

    expect(workflow).not.toMatch(/^ {2}release-validation:$/m);
    expect(workflow).toMatch(
      /quality-authority:[\s\S]*?name: Exact-SHA quality authority[\s\S]*?runs-on: ubuntu-latest/,
    );
    expect(workflow).toMatch(
      /e2e-validation:[\s\S]*?name: E2E validation[\s\S]*?runs-on: dysflow-e2e/,
    );
    expect(workflow).toMatch(
      /release:[\s\S]*?name: Build & Release Artifacts[\s\S]*?needs: \[build, quality-authority, e2e-validation\][\s\S]*?runs-on: ubuntu-latest/,
    );
  });

  it("runs the full Access E2E battery nightly from main without overlapping itself (#1503)", async () => {
    const workflow = await readText(".github/workflows/nightly-access-e2e.yml");

    expect(workflow).toMatch(/^\s*schedule:$/m);
    expect(workflow).toContain("- cron: '17 2 * * *'");
    expect(workflow).toMatch(/^\s*group: nightly-access-e2e$/m);
    expect(workflow).toMatch(/^\s*cancel-in-progress: false$/m);
    expect(workflow).toMatch(/^\s*if: github\.ref == 'refs\/heads\/main'$/m);
    expect(workflow).toMatch(/^\s*runs-on: dysflow-e2e$/m);
    expect(workflow).toContain(
      "node dist/cli/index.js install --runtime-dir .\\test-runtime --no-tui",
    );
    expect(workflow).toMatch(/ACCESS_VBA_PASSWORD:\s*\$\{\{\s*secrets\.ACCESS_VBA_PASSWORD\s*\}\}/);
    expect(workflowRunCommands(workflow)).toContain("pnpm test:e2e:mcp:release");
    expect(workflow).not.toContain("--resume");
  });

  it("keeps the tag release gated by the unchanged full Access E2E battery (#1503)", async () => {
    const workflow = await readText(".github/workflows/release.yml");
    const e2e = workflowJobBlock(workflow, "e2e-validation");

    expect(e2e).toContain("if: startsWith(github.ref, 'refs/tags/v')");
    expect(e2e).toContain("runs-on: dysflow-e2e");
    expect(e2e).toMatch(/ACCESS_VBA_PASSWORD:\s*\$\{\{\s*secrets\.ACCESS_VBA_PASSWORD\s*\}\}/);
    expect(workflowRunCommands(e2e)).toContain("pnpm test:e2e:mcp:release");
    expect(workflowJobBlock(workflow, "release")).toContain(
      "needs: [build, quality-authority, e2e-validation]",
    );
  });

  it("requires an explicit external fixture source for every self-hosted Access gate (#1676)", async () => {
    const workflowPaths = [
      ".github/workflows/release.yml",
      ".github/workflows/nightly-access-e2e.yml",
    ];

    for (const workflowPath of workflowPaths) {
      const workflow = await readText(workflowPath);
      const fixtureSource = workflow.match(/^\s*FIXTURES_SOURCE:\s*(.+)$/m)?.[1]?.trim();

      expect(fixtureSource, `${workflowPath} must configure DYSFLOW_FIXTURES_SOURCE`).toBe(
        `\${{ vars.DYSFLOW_FIXTURES_SOURCE }}`,
      );
      expect(fixtureSource).not.toContain("||");
      expect(workflow).not.toContain("C:\\00repos\\codigo\\dysflow");
      expect(workflow).toMatch(/Write-Error[^\n]*DYSFLOW_FIXTURES_SOURCE/);
    }
  });

  it("runs exactly the audited Access-independent integration files on hosted Windows (#1503)", async () => {
    const workflow = await readText(".github/workflows/ci.yml");
    const hosted = workflowJobBlock(workflow, "windows-integration-smoke");
    expect(hosted).toContain("runs-on: windows-latest");
    expect([...new Set(workflowRunTestPaths(hosted))].sort()).toEqual([...PR_SMOKE_TESTS].sort());
  });

  it("pins LF checkouts so the Windows quality gate is not defeated by CRLF", async () => {
    // Git on Windows defaults to core.autocrlf=true, so without this attribute the
    // windows-latest checkout arrives as CRLF and Biome's LF-only formatter fails
    // every file it checks. Access/VBA sources stay unnormalized because they are
    // compared byte-for-byte against the Access binary.
    const attributes = await readText(".gitattributes");

    expect(attributes).toMatch(/^\* text=auto eol=lf$/m);
    for (const pattern of ["*.bas", "*.cls", "*.form.txt", "*.form.json"]) {
      expect(attributes).toContain(`${pattern} -text`);
    }
  });

  it("exposes package scripts for lint and coverage gates", async () => {
    const packageJson = JSON.parse(await readText("package.json")) as {
      packageManager?: string;
      scripts?: Record<string, string>;
    };

    expect(packageJson.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
    expect(packageJson.scripts?.lint).toBe(
      "node scripts/check-core-adapter-boundary.mjs && node scripts/check-optional-presence-guards.mjs && node scripts/report-ts-import-cycles.mjs --check scripts/baselines/ts-import-cycles.json && tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json --noEmit && biome check src/ test/ tests/ scripts/ E2E_testing/",
    );
    expect(packageJson.scripts).toHaveProperty("format");
    expect(packageJson.scripts).toHaveProperty("format:check");
    expect(packageJson.scripts?.coverage).toBe("vitest run --coverage");
    expect(packageJson.scripts).not.toHaveProperty("postinstall");
  });

  it("keeps format:check on Biome's non-writing format invocation (#1512)", async () => {
    const scripts = (
      JSON.parse(await readText("package.json")) as {
        scripts?: Record<string, string>;
      }
    ).scripts;
    const writeCommand = scripts?.format ?? "";
    const checkCommand = scripts?.["format:check"] ?? "";

    expect(writeCommand).toMatch(/^biome format .+ --write$/);
    expect(checkCommand).toBe(writeCommand.replace(/\s+--write$/, ""));
    expect(checkCommand).not.toMatch(/\s--(?:write|fix|check)(?:\s|$)/);
  });

  it("type-checks tests through a dedicated TypeScript config", async () => {
    const testConfig = JSON.parse(await readText("tsconfig.test.json")) as {
      extends?: string;
      compilerOptions?: Record<string, unknown>;
      include?: string[];
    };

    expect(testConfig.extends).toBe("./tsconfig.json");
    expect(testConfig.compilerOptions?.noEmit).toBe(true);
    expect(testConfig.compilerOptions?.rootDir).toBe(".");
    expect(testConfig.compilerOptions?.moduleResolution).toBe("Bundler");
    expect(testConfig.include).toEqual(["src/**/*.ts", "test/**/*.ts", "tests/**/*.ts"]);
  });

  it("configures deterministic V8 coverage for source files without generated output", async () => {
    const config = await readText("vitest.config.ts");

    expect(config).toContain('pool: "forks"');
    expect(config).toContain("maxWorkers: 1");
    expect(config).toContain('provider: "v8"');
    expect(config).toContain("processingConcurrency: 1");
    expect(config).toContain("branches: 80");
    expect(config).toContain('include: ["src/**/*.ts"]');
    expect(config).toContain('"dist/**"');
    expect(config).toContain('"test/**"');
    expect(config).toContain("thresholds:");
  });

  it("documents the current lint and coverage gate ownership", async () => {
    const docs = await readText("docs/testing/repo-quality-gates.md");

    expect(docs).toContain("Owner: repo-engineering-hardening");
    expect(docs).toContain("`pnpm lint` — three-stage check");
    expect(docs).toContain("node scripts/check-core-adapter-boundary.mjs");
    expect(docs).toContain("node scripts/check-optional-presence-guards.mjs");
    expect(docs).toContain("biome check src/ test/ scripts/ E2E_testing/");
    expect(docs).not.toContain("Coverage starts at a 0% floor");
  });

  it("sets non-zero coverage thresholds in vitest.config.ts (#178)", async () => {
    const config = await readText("vitest.config.ts");

    // Extract threshold values — all must be > 0
    const thresholdMatches = [
      ...config.matchAll(/(?:statements|branches|functions|lines):\s*(\d+(?:\.\d+)?)/g),
    ];
    expect(
      thresholdMatches.length,
      "vitest.config.ts must declare all four threshold fields",
    ).toBeGreaterThanOrEqual(4);
    for (const match of thresholdMatches) {
      const value = Number(match[1] ?? "0");
      const label = ((match[0] ?? "").split(":")[0] ?? "").trim();
      expect(value, `threshold for ${label} must be > 0`).toBeGreaterThan(0);
    }
  });

  it("forbids committed test.only/test.describe.only in both Vitest suites", async () => {
    const unitConfig = await readText("vitest.config.ts");
    const integrationConfig = await readText("vitest.integration.config.ts");

    expect(unitConfig).toContain("forbidOnly: true");
    expect(integrationConfig).toContain("forbidOnly: true");
  });
});
