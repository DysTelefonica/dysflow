import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { handleSetupCommand, writeRelativeProjectConfig } from "../../../src/cli/commands/setup.js";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";

function makeWorkspace(options?: { withProjectJson?: boolean; withAccessDb?: boolean }): {
  root: string;
  cleanup(): void;
} {
  const root = mkdtempSync(join(tmpdir(), "dysflow-setup-unit-"));
  writeFileSync(join(root, ".git"), "gitdir: fixture", "utf8");
  mkdirSync(join(root, "src"));
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

      const result = await handleSetupCommand(["--access-path", accessFile], {
        cwd: workspace.root,
        env: {},
      });

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
  it("does not report success when the written config is not runtime-valid", async () => {
    const workspace = makeWorkspace({ withProjectJson: false });
    const external = mkdtempSync(join(tmpdir(), "dysflow-setup-external-"));
    try {
      const accessFile = join(external, "outside.accdb");
      writeFileSync(accessFile, "", "utf8");
      const result = await handleSetupCommand(["--apply", "--access-path", accessFile], {
        cwd: workspace.root,
        env: {},
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Project config is not write-ready");
    } finally {
      workspace.cleanup();
      rmSync(external, { recursive: true, force: true });
    }
  });
  it("preserves an existing config when the replacement candidate is invalid", async () => {
    const workspace = makeWorkspace({ withAccessDb: true });
    const configPath = join(workspace.root, ".dysflow", "project.json");
    const original = readFileSync(configPath, "utf8");
    const external = mkdtempSync(join(tmpdir(), "dysflow-setup-invalid-"));
    try {
      const target = join(external, "outside.accdb");
      writeFileSync(target, "");
      const result = await handleSetupCommand(["--apply", "--access-path", target], {
        cwd: workspace.root,
        env: {},
      });
      expect(result.exitCode).toBe(1);
      expect(readFileSync(configPath, "utf8")).toBe(original);
    } finally {
      workspace.cleanup();
      rmSync(external, { recursive: true, force: true });
    }
  });
  it("rejects a .dysflow junction that redirects project.json outside the worktree", async () => {
    const workspace = makeWorkspace({ withProjectJson: false });
    const external = mkdtempSync(join(tmpdir(), "dysflow-setup-junction-"));
    try {
      symlinkSync(external, join(workspace.root, ".dysflow"), "junction");
      const target = join(workspace.root, "front.accdb");
      writeFileSync(target, "");
      const result = await handleSetupCommand(["--apply", "--access-path", target], {
        cwd: workspace.root,
        env: {},
      });
      expect(result.exitCode).toBe(1);
      expect(existsSync(join(external, "project.json"))).toBe(false);
    } finally {
      workspace.cleanup();
      rmSync(external, { recursive: true, force: true });
    }
  });
  it("prevents a directory swap while the exclusive temporary handle is open", async () => {
    const workspace = makeWorkspace({ withAccessDb: true });
    const external = mkdtempSync(join(tmpdir(), "dysflow-setup-swap-"));
    const owned = join(workspace.root, ".dysflow-owned");
    const original = readFileSync(join(workspace.root, ".dysflow", "project.json"), "utf8");
    const config: DysflowConfig = {
      configSource: "explicit-request",
      allowWrites: true,
      accessDbPath: join(workspace.root, "front.accdb"),
      projectRoot: workspace.root,
      timeoutMs: 30_000,
    };
    try {
      await expect(
        writeRelativeProjectConfig(config, workspace.root, () => {
          renameSync(join(workspace.root, ".dysflow"), owned);
          symlinkSync(external, join(workspace.root, ".dysflow"), "junction");
        }),
      ).rejects.toThrow();
      const originalConfigPath = existsSync(owned)
        ? join(owned, "project.json")
        : join(workspace.root, ".dysflow", "project.json");
      expect(readFileSync(originalConfigPath, "utf8")).toBe(original);
      expect(existsSync(join(external, "project.json"))).toBe(false);
    } finally {
      workspace.cleanup();
      rmSync(external, { recursive: true, force: true });
    }
  });
  it("leaves the destination untouched when publication fails before rename", async () => {
    const workspace = makeWorkspace({ withAccessDb: true });
    const configPath = join(workspace.root, ".dysflow", "project.json");
    const original = readFileSync(configPath, "utf8");
    const config: DysflowConfig = {
      configSource: "explicit-request",
      allowWrites: true,
      accessDbPath: join(workspace.root, "front.accdb"),
      projectRoot: workspace.root,
      timeoutMs: 30_000,
    };
    try {
      await expect(
        writeRelativeProjectConfig(config, workspace.root, () => {
          throw new Error("pre-rename failure");
        }),
      ).rejects.toThrow("pre-rename failure");
      expect(readFileSync(configPath, "utf8")).toBe(original);
    } finally {
      workspace.cleanup();
    }
  });

  it.each([
    true,
    false,
  ])("recovers the destination after a post-rename failure (previous config: %s)", async (withPrevious) => {
    const workspace = makeWorkspace({ withAccessDb: true });
    const configPath = join(workspace.root, ".dysflow", "project.json");
    const previous = readFileSync(configPath, "utf8");
    if (!withPrevious) rmSync(configPath);
    const config: DysflowConfig = {
      configSource: "explicit-request",
      allowWrites: true,
      accessDbPath: join(workspace.root, "front.accdb"),
      projectRoot: workspace.root,
      timeoutMs: 30_000,
    };
    try {
      await expect(
        writeRelativeProjectConfig(config, workspace.root, undefined, () => {
          throw new Error("post-rename failure");
        }),
      ).rejects.toThrow("post-rename failure");
      expect(existsSync(configPath)).toBe(withPrevious);
      if (withPrevious) expect(readFileSync(configPath, "utf8")).toBe(previous);
    } finally {
      workspace.cleanup();
    }
  });
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

  it("scaffolds a per-project timeoutMs and recommends tuning it", async () => {
    const workspace = makeWorkspace({ withAccessDb: true });
    try {
      const result = await handleSetupCommand(["--write-project"], {
        cwd: workspace.root,
        env: { DYSFLOW_ACCESS_PASSWORD: "top-secret" },
      });

      expect(result.exitCode).toBe(0);
      const written = JSON.parse(
        readFileSync(join(workspace.root, ".dysflow", "project.json"), "utf8"),
      );
      // The scaffold makes the per-project timeout an explicit, editable knob so a
      // large database does not silently fall back to the generic default and
      // false-timeout heavy whole-project operations.
      expect(typeof written.timeoutMs).toBe("number");
      expect(written.timeoutMs).toBeGreaterThan(0);
      // And the CLI explicitly nudges the user to tune it per project.
      expect(result.stdout.toLowerCase()).toContain("recommend");
      expect(result.stdout.toLowerCase()).toContain("timeoutms");
    } finally {
      workspace.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// --set-project-id — creates project.json when it doesn't exist
// ---------------------------------------------------------------------------
describe("handleSetupCommand — --set-project-id with missing file", () => {
  it("requires --apply and never creates an identity-only config", async () => {
    const workspace = makeWorkspace({ withProjectJson: false });
    try {
      mkdirSync(join(workspace.root, ".dysflow"), { recursive: true });

      const result = await handleSetupCommand(
        ["--set-project-id", "my-new-project", "--cwd", workspace.root],
        {
          cwd: workspace.root,
          env: {},
        },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("--apply");
      expect(existsSync(join(workspace.root, ".dysflow", "project.json"))).toBe(false);
    } finally {
      workspace.cleanup();
    }
  });

  it("updates a valid worktree config atomically when explicitly applied", async () => {
    const workspace = makeWorkspace({ withAccessDb: true });
    try {
      const result = await handleSetupCommand(
        ["--set-project-id", "renamed", "--apply", "--cwd", workspace.root],
        { cwd: tmpdir(), env: {} },
      );
      expect(result.exitCode).toBe(0);
      expect(
        JSON.parse(readFileSync(join(workspace.root, ".dysflow", "project.json"), "utf8")).id,
      ).toBe("renamed");
    } finally {
      workspace.cleanup();
    }
  });

  it("rejects --set-project-id when --cwd is not an owning worktree", async () => {
    const root = mkdtempSync(join(tmpdir(), "dysflow-setup-outside-"));
    try {
      mkdirSync(join(root, ".dysflow"));
      writeFileSync(join(root, ".dysflow", "project.json"), JSON.stringify({ id: "old" }));
      const result = await handleSetupCommand(
        ["--set-project-id", "renamed", "--apply", "--cwd", root],
        { env: {} },
      );
      expect(result.exitCode).toBe(1);
      expect(JSON.parse(readFileSync(join(root, ".dysflow", "project.json"), "utf8")).id).toBe(
        "old",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
