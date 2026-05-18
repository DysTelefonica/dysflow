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
		expect(docs).toContain("Coverage starts at a 0% floor");
	});
});
