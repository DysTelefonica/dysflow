import { compareVersions, type AgentName } from "../commands/install.js";

const MENU_OPTIONS = ["Install / Integrations", "Doctor", "Exit"] as const;
const UPDATE_COMMAND_PREFIX =
	"pnpm add -g git+https://github.com/DysTelefonica/dysflow.git#";

export type VersionStatus = {
	localVersion: string;
	latestVersion: string;
	outdated: boolean;
	updateCommand?: string;
};

export type DashboardRenderOptions = {
	localVersion: string;
	latestVersion?: string;
	cursor: number;
};

export type IntegrationSelectionRenderOptions = {
	agents: readonly AgentName[];
	selectedAgents: readonly AgentName[];
	cursor: number;
};

export function buildVersionStatus(
	localVersion: string,
	latestVersion: string | undefined,
): VersionStatus {
	const normalizedLatest = latestVersion?.trim() || "unknown";
	const outdated =
		normalizedLatest !== "unknown" &&
		compareVersions(toComparableVersion(normalizedLatest), toComparableVersion(localVersion)) > 0;
	return {
		localVersion,
		latestVersion: normalizedLatest,
		outdated,
		...(outdated
			? {
					updateCommand: `${UPDATE_COMMAND_PREFIX}${toTagVersion(normalizedLatest)}`,
				}
			: {}),
	};
}

export namespace buildVersionStatus {
	export async function fromProvider(
		localVersion: string,
		provider: () => Promise<string | undefined>,
	): Promise<VersionStatus> {
		return buildVersionStatus(localVersion, await provider());
	}
}

export function renderDashboard(options: DashboardRenderOptions): string {
	const status = buildVersionStatus(
		options.localVersion,
		options.latestVersion,
	);
	const lines = [
		renderLogo(),
		`local: ${status.localVersion}   latest: ${status.latestVersion}`,
	];

	if (status.updateCommand !== undefined) {
		lines.push(`update: ${status.updateCommand}`);
	}

	lines.push(
		"",
		...MENU_OPTIONS.map((option, index) =>
			renderOption(option, index === options.cursor),
		),
	);
	lines.push("", "↑/↓: move • enter: select • q: exit");
	return lines.join("\n");
}

export function renderIntegrationSelection(
	options: IntegrationSelectionRenderOptions,
): string {
	const selected = new Set(options.selectedAgents);
	return [
		"Select Dysflow MCP integrations",
		"Use ↑/↓ to move, space to toggle, enter to apply.",
		"",
		...options.agents.map((agent, index) =>
			renderCheckbox(agent, selected.has(agent), index === options.cursor),
		),
		"",
		"space: toggle • enter: apply • esc: back",
	].join("\n");
}

function renderLogo(): string {
	return [
		"╔════════════════════════════════════╗",
		frameLine(""),
		frameLine("D Y S F L O W"),
		frameLine("Access automation control plane"),
		frameLine("MCP • TUI • Runtime installer"),
		frameLine(""),
		frameLine("DYSFLOW"),
		"╚════════════════════════════════════╝",
	].join("\n");
}

function frameLine(content: string): string {
	const width = 36;
	const clipped = content.length > width ? content.slice(0, width) : content;
	const left = Math.floor((width - clipped.length) / 2);
	const right = width - clipped.length - left;
	return `║${" ".repeat(left)}${clipped}${" ".repeat(right)}║`;
}

function toTagVersion(version: string): string {
	return version.startsWith("v") ? version : `v${version}`;
}

function toComparableVersion(version: string): string {
	return version.startsWith("v") ? version.slice(1) : version;
}

function renderOption(label: string, focused: boolean): string {
	return `${focused ? "▸" : " "} ${label}`;
}

function renderCheckbox(
	label: string,
	checked: boolean,
	focused: boolean,
): string {
	return `${focused ? "▸" : " "} [${checked ? "x" : " "}] ${label}`;
}
