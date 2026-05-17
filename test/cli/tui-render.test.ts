import { describe, expect, it } from "vitest";
import {
	buildVersionStatus,
	renderDashboard,
	renderIntegrationSelection,
} from "../../src/cli/tui/render";

describe("Dysflow TUI rendering", () => {
	it("renders a branded dashboard with local and latest versions", () => {
		const output = renderDashboard({
			localVersion: "0.2.0",
			latestVersion: "0.2.1",
			cursor: 0,
		});

		expect(output).toContain("DYSFLOW");
		expect(output).not.toContain("___  _║");
		expect(output).toContain("╔════════════════════════════════════╗\n║                                    ║\n║           D Y S F L O W            ║");
		expect(output).toContain("local: 0.2.0");
		expect(output).toContain("latest: 0.2.1");
		expect(output).toContain("▸ Install / Integrations");
		expect(output).toContain("Doctor");
		expect(output).toContain("Exit");
	});

	it("shows concise update guidance when local is outdated", () => {
		const status = buildVersionStatus("0.2.0", "0.2.1");
		const output = renderDashboard({
			localVersion: status.localVersion,
			latestVersion: status.latestVersion,
			cursor: 0,
		});

		expect(status.outdated).toBe(true);
		expect(output).toContain("update:");
		expect(output).toContain(
			"pnpm add -g git+https://github.com/DysTelefonica/dysflow.git#v0.2.1",
		);
	});

	it("does not duplicate a v prefix when latest version already has a tag prefix", () => {
		const status = buildVersionStatus("0.2.0", "v0.2.1");

		expect(status.outdated).toBe(true);
		expect(status.updateCommand).toBe(
			"pnpm add -g git+https://github.com/DysTelefonica/dysflow.git#v0.2.1",
		);
	});

	it("compares v-prefixed latest versions correctly across major versions", () => {
		const status = buildVersionStatus("0.9.0", "v1.0.0");

		expect(status.outdated).toBe(true);
	});

	it("renders unknown latest version as non-fatal", () => {
		const status = buildVersionStatus("0.2.0", undefined);
		const output = renderDashboard({
			localVersion: status.localVersion,
			latestVersion: status.latestVersion,
			cursor: 0,
		});

		expect(status.outdated).toBe(false);
		expect(output).toContain("local: 0.2.0");
		expect(output).toContain("latest: unknown");
		expect(output).not.toContain("update:");
	});

	it("keeps every logo line aligned to the same width", () => {
		const [logo] = renderDashboard({
			localVersion: "0.2.0",
			latestVersion: "0.2.0",
			cursor: 0,
		}).split("local:");
		const lineWidths = logo
			.trimEnd()
			.split("\n")
			.map((line) => line.length);

		expect(new Set(lineWidths).size).toBe(1);
	});

	it("resolves latest version through an injectable provider", async () => {
		const status = await buildVersionStatus.fromProvider(
			"0.2.0",
			async () => "v0.2.1",
		);

		expect(status.latestVersion).toBe("v0.2.1");
		expect(status.outdated).toBe(true);
	});

	it("renders integration checkboxes with cursor and selected state", () => {
		const output = renderIntegrationSelection({
			agents: ["opencode", "pi", "codex"],
			selectedAgents: ["opencode", "pi"],
			cursor: 1,
		});

		expect(output).toContain("Select Dysflow MCP integrations");
		expect(output).toContain("  [x] opencode");
		expect(output).toContain("▸ [x] pi");
		expect(output).toContain("  [ ] codex");
		expect(output).toContain("space: toggle");
	});
});
