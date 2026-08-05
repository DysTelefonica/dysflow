import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { withSchemaVersion } from "../../../src/adapters/mcp/result-translation.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

async function repoFile(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, `${new URL("../../..", import.meta.url).href}/`), "utf8");
}

function errorEnvelope(code: string, remediation = "Follow the documented recovery procedure.") {
  return withSchemaVersion({
    content: [{ type: "text", text: `${code}: rejected` }],
    isError: true,
    ok: false,
    error: { code, message: "rejected", remediation },
  });
}

describe("issue #1403 skill discoverability", () => {
  it("marks dysflow-usage as MUST-LOAD before dysflow artifact diagnosis", async () => {
    const skill = await repoFile("skills/dysflow-usage/SKILL.md");

    expect(skill).toMatch(/description:.*MUST-LOAD/i);
    expect(skill).toMatch(/\.dysflow\/project\.json/);
    expect(skill).toMatch(/get_capabilities.*first/i);
  });

  it("marks dysflow-arnes as MUST-LOAD and loads dysflow-usage first", async () => {
    const skill = await repoFile("skills/dysflow-arnes/SKILL.md");

    expect(skill).toMatch(/description:.*MUST-LOAD/i);
    expect(skill).toMatch(/load.*dysflow-usage.*first/i);
  });

  it("keeps the generated consumer pointer aligned with the MUST-LOAD contract", async () => {
    const pointer = await repoFile("skills/dysflow-pointer-rollout/assets/pointer.md");
    const installedSkill = await repoFile("skills/dysflow-pointer-rollout/SKILL.md");

    expect(pointer).toContain("<!-- user-supplement:dysflow:pointer -->");
    expect(pointer).toMatch(/dysflow-usage[\s\S]*MUST-LOAD/i);
    expect(pointer).toMatch(/\.dysflow\/project\.json/);
    expect(installedSkill).toContain(pointer.trim());
  });

  it("keeps the embedded project harness aligned with the consumer pointer", async () => {
    const agents = await readFile(`${repoRoot}/AGENTS.md`, "utf8");

    expect(agents).toMatch(/load.*dysflow-usage.*first/i);
    expect(agents).toMatch(/get_capabilities\(\{\}\)[\s\S]*before[\s\S]*static/i);
  });
});

describe("issue #1403 typed error remediation", () => {
  it("points ambiguous worktree recovery to the canonical skill section", () => {
    const result = errorEnvelope("FRONTEND_TARGET_AMBIGUOUS");

    expect(result.error?.remediationHint).toMatchObject({
      skill: "dysflow-usage",
      section: expect.stringMatching(/ambiguity|multi-worktree/i),
    });
  });

  it("points invalid input to describe_tool without losing the canonical skill", () => {
    const result = errorEnvelope("MCP_INPUT_INVALID");

    expect(result.error?.remediationHint).toMatchObject({
      skill: "dysflow-usage",
      tool: "describe_tool",
      hint: expect.stringMatching(/describe_tool/i),
    });
  });

  it("adds a skill or tool hint to every typed error envelope", () => {
    const knownErrorCodes = [
      "MCP_INPUT_INVALID",
      "CONFIG_MISSING_ACCESS_PATH",
      "FRONTEND_TARGET_AMBIGUOUS",
      "FRONTEND_TARGET_MISSING",
      "FRONTEND_PATH_NOT_BASENAME",
      "INHERITED_WORKTREE_MISMATCH",
      "PROJECT_ID_COLLISION",
      "PROJECT_ID_MISMATCH",
      "LACCDB_STALE_DETECTED",
      "LIVE_PROCESS_HOLDS_LACCDB",
      "PROCEDURE_NOT_FOUND",
      "PROCEDURE_NOT_CALLABLE",
      "EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION",
      "DESTINATION_ROOT_REQUIRED",
      "MCP_PROCEDURE_NOT_ALLOWED",
      "MCP_WRITES_DISABLED",
      "PROJECT_CONFIG_NOT_WRITE_READY",
    ];

    for (const code of knownErrorCodes) {
      const remediation = errorEnvelope(code).error?.remediationHint;
      expect(remediation, code).toEqual(expect.objectContaining({ skill: "dysflow-usage" }));
    }
  });
});
