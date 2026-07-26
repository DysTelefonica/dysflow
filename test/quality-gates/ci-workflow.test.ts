import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

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
  for (const cmd of workflowRunCommands(workflow)) {
    for (const match of cmd.matchAll(/(\S*\.test\.ts)\b/g)) {
      const path = match[1] ?? "";
      if (
        path.length > 0 &&
        !path.startsWith("-") &&
        !path.includes("*") &&
        !path.startsWith("--")
      ) {
        out.push(path);
      }
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

/** Every Node major listed in a job's `strategy.matrix.node-version`. */
function matrixNodeMajors(jobBlock: string): number[] {
  const inline = /node-version:[ \t]*\[([^\]]*)\]/.exec(jobBlock);
  const listed = /node-version:[ \t]*\n((?:[ \t]*-[ \t]*\S+\n?)+)/.exec(jobBlock);
  const entries =
    inline?.[1] !== undefined
      ? inline[1].split(",")
      : [...(listed?.[1] ?? "").matchAll(/-[ \t]*(\S+)/g)].map((match) => match[1] ?? "");
  return entries
    .map((entry) => Number.parseInt(entry.trim().replace(/^["']|["']$/g, ""), 10))
    .filter((major) => Number.isInteger(major));
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
  it("runs install, lint, test, build, and coverage in CI", async () => {
    const workflow = await readText(".github/workflows/ci.yml");
    const commands = workflowRunCommands(workflow);

    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("push:");
    expect(commands).toContain("pnpm install --frozen-lockfile");
    expect(commands).toContain("pnpm test");
    expect(commands).toContain("pnpm build");
    expect(commands).toContain("pnpm lint");
    expect(commands).toContain("pnpm coverage");
    expect(commands.indexOf("pnpm lint")).toBeLessThan(commands.indexOf("pnpm test"));
    expect(commands.indexOf("pnpm lint")).toBeLessThan(commands.indexOf("pnpm build"));
  });

  it("runs the complete quality-gate suite on the supported Windows platform", async () => {
    const workflow = await readText(".github/workflows/ci.yml");

    expect(workflow).toMatch(
      /quality:\s*\r?\n\s*name: Quality gates\s*\r?\n\s*runs-on: windows-latest/,
    );
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

  it("uses Node 24-capable GitHub Actions while preserving Node 20 product runtime (#190)", async () => {
    const workflow = await readText(".github/workflows/ci.yml");
    const packageJson = JSON.parse(await readText("package.json")) as {
      engines?: Record<string, string>;
    };

    expect(workflow).toContain("uses: actions/checkout@v5");
    expect(workflow).toContain("uses: actions/setup-node@v5");
    expect(workflow).toContain("uses: pnpm/action-setup@v6");
    expect(workflow).toContain("node-version: 20");
    // Only the floor is pinned here; the ceiling belongs to the matrix-coverage
    // test below, which derives it rather than restating a literal.
    expect(packageJson.engines?.node).toMatch(/^>=20\.0\.0(\s|$)/);
  });

  it("runs the quality gates on every Node major the package claims to support (#1153)", async () => {
    // Both halves are derived, never restated: widening `engines.node` without a
    // matching matrix entry — or matrixing a Node the package never claimed —
    // fails here instead of shipping an unverified support claim.
    const workflow = await readText(".github/workflows/ci.yml");
    const declared =
      (JSON.parse(await readText("package.json")) as { engines?: Record<string, string> }).engines
        ?.node ?? "";
    const supported = enginesNodeBoundaries(declared);
    const quality = workflowJobBlock(workflow, "quality");
    const matrix = matrixNodeMajors(quality);

    expect(quality, "the Quality gates job must take its Node version from the matrix").toMatch(
      /node-version:\s*\$\{\{\s*matrix\.node-version\s*\}\}/,
    );
    expect(
      matrix,
      `engines.node "${declared}" claims Node ${supported.floor}, which the Quality gates matrix never runs`,
    ).toContain(supported.floor);
    expect(
      matrix,
      `engines.node "${declared}" claims Node up to ${supported.ceiling}, which the Quality gates matrix never runs`,
    ).toContain(supported.ceiling);
    for (const major of matrix) {
      expect(
        major >= supported.floor && major <= supported.ceiling,
        `the Quality gates matrix runs Node ${major}, which engines.node "${declared}" does not claim to support`,
      ).toBe(true);
    }
  });

  it("uses Windows for release validation and Linux only for platform-neutral packaging", async () => {
    const workflow = await readText(".github/workflows/release.yml");

    expect(workflow).toMatch(
      /release-validation:\s*\r?\n\s*name: Windows release validation\s*\r?\n\s*runs-on: windows-latest/,
    );
    expect(workflow).toMatch(
      /release:\s*\r?\n\s*name: Build & Release Artifacts\s*\r?\n\s*needs: release-validation\s*\r?\n\s*runs-on: ubuntu-latest/,
    );
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
      "node scripts/check-core-adapter-boundary.mjs && node scripts/check-optional-presence-guards.mjs && node scripts/report-ts-import-cycles.mjs --check scripts/baselines/ts-import-cycles.json && tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json --noEmit && biome check src/ test/ tests/ scripts/ E2E_testing/_helpers/",
    );
    expect(packageJson.scripts).toHaveProperty("format");
    expect(packageJson.scripts).toHaveProperty("format:check");
    expect(packageJson.scripts?.coverage).toBe("vitest run --coverage");
    expect(packageJson.scripts).not.toHaveProperty("postinstall");
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

  it("configures Vitest coverage for source files without generated output", async () => {
    const config = await readText("vitest.config.ts");

    expect(config).toContain('provider: "v8"');
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
    expect(docs).toContain("biome check src/ test/ scripts/ E2E_testing/_helpers/");
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
