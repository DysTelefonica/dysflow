/**
 * Issue #1867 — when a call has no project context (no cwd, projectRoot or projectId,
 * no project fixed by resolve_project) and the MCP startup cwd is not a project, the
 * error must name the cause: PROJECT_CONTEXT_MISSING, with the remediation to pass
 * cwd or call resolve_project. It must not surface as CONFIG_MISSING_ACCESS_PATH.
 */

import { describe, expect, it } from "vitest";
import { projectContextMissingError } from "../../../src/adapters/mcp/project-context-missing.js";

const noSession = () => undefined;

describe("PROJECT_CONTEXT_MISSING (#1867)", () => {
  it("names the missing context when nothing identifies a project and the startup cwd is not one", () => {
    const error = projectContextMissingError(
      { module: "Constantes" },
      {
        sessionCwd: noSession,
        startupError: { code: "CONFIG_MISSING_ACCESS_PATH" },
      },
    );

    expect(error?.code).toBe("PROJECT_CONTEXT_MISSING");
    expect(error?.message).toMatch(/cwd/);
    expect(error?.remediation).toMatch(/resolve_project/);
  });

  it("does not replace the error when the call names a context", () => {
    for (const input of [{ cwd: "C:/repo" }, { projectRoot: "C:/repo" }, { projectId: "bench" }]) {
      expect(
        projectContextMissingError(input, {
          sessionCwd: noSession,
          startupError: { code: "CONFIG_MISSING_ACCESS_PATH" },
        }),
      ).toBeUndefined();
    }
  });

  it("does not replace the error when a session project is fixed", () => {
    expect(
      projectContextMissingError(
        { module: "Constantes" },
        { sessionCwd: () => "C:/repo", startupError: { code: "CONFIG_MISSING_ACCESS_PATH" } },
      ),
    ).toBeUndefined();
  });

  it("does not replace the error when the startup cwd is a configured project", () => {
    expect(
      projectContextMissingError(
        { module: "Constantes" },
        {
          sessionCwd: noSession,
          startupError: { code: "STARTUP_ERR" },
        },
      ),
    ).toBeUndefined();
  });
});
