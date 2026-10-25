/**
 * Issue #1867 — after `resolve_project` resolves a project for the session, a call
 * without `cwd` must use that project, not the MCP startup cwd. The session root
 * sits between the explicit cwd and the startup cwd in the resolution order.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSessionProjectRoot } from "../../../src/adapters/mcp/session-project-root.js";
import { resolveMcpAccessContextForInput } from "../../../src/adapters/mcp/stdio.js";

let root: string;
let projectRoot: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "dysflow-1867-session-"));
  projectRoot = join(root, "bench-main");
  mkdirSync(join(projectRoot, ".dysflow"), { recursive: true });
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, ".git"), "gitdir: isolated-fixture", "utf-8");
  writeFileSync(join(projectRoot, "front.accdb"), "fake", "utf-8");
  writeFileSync(
    join(projectRoot, ".dysflow", "project.json"),
    JSON.stringify({ id: "bench-main", frontendFile: "front.accdb", destinationRoot: "src" }),
    "utf-8",
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("session project root (#1867)", () => {
  it("keeps a resolved project for calls that carry no cwd", async () => {
    const session = createSessionProjectRoot();
    session.set(projectRoot);

    const result = await resolveMcpAccessContextForInput({ module: "Constantes" }, undefined, {
      sessionCwd: session.get,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected the session project to resolve");
    expect(result.data.projectRoot).toBe(projectRoot);
  });

  it("an explicit cwd still wins over the session project", async () => {
    const session = createSessionProjectRoot();
    session.set(join(root, "elsewhere"));

    const result = await resolveMcpAccessContextForInput(
      { cwd: projectRoot, module: "Constantes" },
      undefined,
      { sessionCwd: session.get },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected the explicit cwd to resolve");
    expect(result.data.projectRoot).toBe(projectRoot);
  });

  it("clear drops the session project", () => {
    const session = createSessionProjectRoot();
    session.set(projectRoot);
    session.clear();
    expect(session.get()).toBeUndefined();
  });
});
