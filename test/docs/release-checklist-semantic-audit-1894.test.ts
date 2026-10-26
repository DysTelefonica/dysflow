import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const checklist = readFileSync(join(root, "docs", "release-checklist.md"), "utf8");
const releasePrepare = readFileSync(join(root, "scripts", "release-prepare.ps1"), "utf8");
const auditScriptRel =
  "skills/dysflow-codegraph-update/assets/scripts/Invoke-DysflowSemanticAudit.ps1";
const auditScript = readFileSync(join(root, auditScriptRel), "utf8");

describe("issue #1894: the release checklist documents the semantic-audit evidence", () => {
  it("names the audit script at a path that exists in the repository", () => {
    expect(checklist).toContain(auditScriptRel);
    expect(existsSync(join(root, auditScriptRel))).toBe(true);
  });

  it("names the release-prepare parameter the script actually declares", () => {
    expect(releasePrepare).toMatch(/\[string\]\$SemanticAuditEvidencePath/);
    expect(checklist).toContain("-SemanticAuditEvidencePath");
  });

  it("documents the audit parameters the script actually declares", () => {
    for (const param of ["CapturesDir", "Refresh", "OutputJson", "FailOnRuntimeGap"]) {
      expect(auditScript).toMatch(new RegExp(`\\$${param}\\b`));
      expect(checklist).toContain(`-${param}`);
    }
  });

  it("states that the evidence is bound to the release HEAD and must be generated outside the repo", () => {
    expect(checklist).toMatch(/repositoryHead/);
    expect(checklist).toMatch(/outside the repository|fuera del repositorio/i);
  });
});
