import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function readText(path: string): Promise<string> {
	return readFile(path, "utf8");
}

function workflowRunCommands(workflow: string): string[] {
	return [...workflow.matchAll(/^\s*run:\s*(.+)$/gm)].map((match) =>
		match[1].trim(),
	);
}

describe("repository quality gates", () => {
	it("runs install, test, build, lint, and coverage in CI", async () => {
		const workflow = await readText(".github/workflows/ci.yml");
		const commands = workflowRunCommands(workflow);

		expect(workflow).toContain("pull_request:");
		expect(workflow).toContain("push:");
		expect(commands).toContain("pnpm install --frozen-lockfile");
		expect(commands).toContain("pnpm test");
		expect(commands).toContain("pnpm build");
		expect(commands).toContain("pnpm lint");
		expect(commands).toContain("pnpm coverage");
	});

	it("runs Windows PowerShell smoke coverage for Access-facing paths (#182)", async () => {
		const workflow = await readText(".github/workflows/ci.yml");
		const commands = workflowRunCommands(workflow);

		expect(workflow).toContain("windows-integration-smoke:");
		expect(workflow).toContain("runs-on: windows-latest");
		expect(workflow).toContain("Get-Command powershell.exe");
		expect(commands).toContain(
			"pnpm vitest run test/e2e/access-fixture.e2e.test.ts test/scripts-access-runner.test.ts",
		);
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
		expect(packageJson.engines?.node).toBe(">=20.0.0");
	});

	it("exposes package scripts for lint and coverage gates", async () => {
		const packageJson = JSON.parse(await readText("package.json")) as {
			packageManager?: string;
			scripts?: Record<string, string>;
		};

		expect(packageJson.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
		expect(packageJson.scripts?.lint).toBe("tsc -p tsconfig.json --noEmit");
		expect(packageJson.scripts?.coverage).toBe("vitest run --coverage");
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
		expect(docs).toContain("Lint currently uses TypeScript strict checking");
		expect(docs).not.toContain("Coverage starts at a 0% floor");
	});

	it("sets non-zero coverage thresholds in vitest.config.ts (#178)", async () => {
		const config = await readText("vitest.config.ts");

		// Extract threshold values — all must be > 0
		const thresholdMatches = [...config.matchAll(/(?:statements|branches|functions|lines):\s*(\d+(?:\.\d+)?)/g)];
		expect(thresholdMatches.length, "vitest.config.ts must declare all four threshold fields").toBeGreaterThanOrEqual(4);
		for (const match of thresholdMatches) {
			const value = Number(match[1]);
			expect(value, `threshold for ${match[0].split(":")[0].trim()} must be > 0`).toBeGreaterThan(0);
		}
	});
});
