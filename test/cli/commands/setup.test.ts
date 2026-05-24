import { describe, expect, it } from "vitest";
import { handleSetupCommand } from "../../../src/cli/commands/setup.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makeWorkspace(options?: { withProjectJson?: boolean; withAccessDb?: boolean }): {
	root: string;
	cleanup(): void;
} {
	const root = mkdtempSync(join(tmpdir(), "dysflow-setup-unit-"));
	if (options?.withProjectJson !== false) {
		mkdirSync(join(root, ".dysflow"), { recursive: true });
	}
	if (options?.withAccessDb) {
		writeFileSync(join(root, "front.accdb"), "", "utf8");
		writeFileSync(
			join(root, ".dysflow", "project.json"),
			`${JSON.stringify({ accessPath: "front.accdb" }, null, 2)}\n`,
			"utf8",
		);
	}
	return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// Help flag
// ---------------------------------------------------------------------------
describe("handleSetupCommand — help", () => {
	it.each([["--help"], ["-h"]])("returns usage text for %s", async (flag) => {
		const result = await handleSetupCommand([flag]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Usage: dysflow setup");
		expect(result.stderr).toBe("");
	});
});

// ---------------------------------------------------------------------------
// Option parsing errors
// ---------------------------------------------------------------------------
describe("handleSetupCommand — parse errors", () => {
	it("rejects --access-path with no value", async () => {
		const result = await handleSetupCommand(["--access-path"]);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Missing value for --access-path.");
	});

	it("rejects --access-path when next token starts with --", async () => {
		const result = await handleSetupCommand(["--access-path", "--backend-path"]);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Missing value for --access-path.");
	});

	it("rejects --backend-path with no value", async () => {
		const result = await handleSetupCommand(["--backend-path"]);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Missing value for --backend-path.");
	});

	it("rejects --project-id with no value", async () => {
		const result = await handleSetupCommand(["--project-id"]);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Missing value for --project-id.");
	});

	it("rejects --set-project-id with no value", async () => {
		const result = await handleSetupCommand(["--set-project-id"]);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Missing value for --set-project-id.");
	});

	it("rejects --set-project-id when next token starts with --", async () => {
		const result = await handleSetupCommand(["--set-project-id", "--other"]);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Missing value for --set-project-id.");
	});

	it("rejects unknown flags", async () => {
		const result = await handleSetupCommand(["--unknown-flag"]);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Unsupported setup option: --unknown-flag");
	});
});

// ---------------------------------------------------------------------------
// Config resolution errors
// ---------------------------------------------------------------------------
describe("handleSetupCommand — config resolution errors", () => {
	it("returns exitCode 1 with CONFIG_MISSING error when no access path is configured", async () => {
		const workspace = makeWorkspace({ withProjectJson: false });
		try {
			const result = await handleSetupCommand([], {
				cwd: workspace.root,
				env: {},
			});

			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("CONFIG_MISSING_ACCESS_PATH");
		} finally {
			workspace.cleanup();
		}
	});

	it("passes explicit --access-path to config loader", async () => {
		const workspace = makeWorkspace({ withProjectJson: false });
		try {
			const accessFile = join(workspace.root, "mydb.accdb");
			writeFileSync(accessFile, "", "utf8");

			const result = await handleSetupCommand(
				["--access-path", accessFile],
				{ cwd: workspace.root, env: {} },
			);

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Access database:");
			expect(result.stdout).toContain("mydb.accdb");
		} finally {
			workspace.cleanup();
		}
	});
});

// ---------------------------------------------------------------------------
// Successful config display
// ---------------------------------------------------------------------------
describe("handleSetupCommand — successful display", () => {
	it("prints redacted config without --write-project", async () => {
		const workspace = makeWorkspace({ withAccessDb: true });
		try {
			const result = await handleSetupCommand([], {
				cwd: workspace.root,
				env: { DYSFLOW_ACCESS_PASSWORD: "top-secret" },
			});

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Dysflow core configuration resolved.");
			expect(result.stdout).toContain("Access database:");
			expect(result.stdout).toContain("Password: [REDACTED]");
			expect(result.stdout).not.toContain("top-secret");
			expect(result.stderr).toBe("");
		} finally {
			workspace.cleanup();
		}
	});

	it("shows (not configured) for password when no password env var is set", async () => {
		const workspace = makeWorkspace({ withAccessDb: true });
		try {
			const result = await handleSetupCommand([], {
				cwd: workspace.root,
				env: {},
			});

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Password: (not configured)");
		} finally {
			workspace.cleanup();
		}
	});

	it("does not include project write message when --write-project is absent", async () => {
		const workspace = makeWorkspace({ withAccessDb: true });
		try {
			const result = await handleSetupCommand([], {
				cwd: workspace.root,
				env: {},
			});

			expect(result.stdout).not.toContain("Wrote portable project config");
		} finally {
			workspace.cleanup();
		}
	});
});

// ---------------------------------------------------------------------------
// --set-project-id — creates project.json when it doesn't exist
// ---------------------------------------------------------------------------
describe("handleSetupCommand — --set-project-id with missing file", () => {
	it("creates .dysflow/project.json when it does not exist yet", async () => {
		const workspace = makeWorkspace({ withProjectJson: false });
		try {
			mkdirSync(join(workspace.root, ".dysflow"), { recursive: true });

			const result = await handleSetupCommand(
				["--set-project-id", "my-new-project"],
				{ cwd: workspace.root, env: {} },
			);

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Updated project id in .dysflow/project.json: my-new-project");
		} finally {
			workspace.cleanup();
		}
	});
});
