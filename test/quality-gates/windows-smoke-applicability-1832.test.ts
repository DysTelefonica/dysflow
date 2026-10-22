import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error The classifier is a JavaScript CLI.
import { classifyChanges } from "../../scripts/check-documentation-quality.mjs";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const job = (name: string) => workflow.split(`  ${name}:`)[1]?.split(/\n {2}[a-z][\w-]*:/)[0] ?? "";
const condition = job("windows-integration-smoke").match(
  /if: >-\r?\n([\s\S]*?)\r?\n {4}runs-on:/,
)?.[1];
const aggregate =
  job("ci-result").split("        run: |\n")[1] ?? job("ci-result").split("        run: |\r\n")[1];
const bash =
  process.platform === "win32" && existsSync("C:/Program Files/Git/bin/bash.exe")
    ? "C:/Program Files/Git/bin/bash.exe"
    : "bash";

describe("content-based Windows smoke routing (#1832)", () => {
  it.each([
    ["skill-fleet/catalog", ["skills/example/SKILL.md", ".team-skills.yaml", "AGENTS.md"], false],
    ["skill-fleet/mixed", ["skills/example/SKILL.md", "src/index.ts"], true],
    ["skill-fleet/script", ["scripts/dysflow-access-runner.ps1"], true],
    ["fix/code", ["src/index.ts"], true],
    ["docs/guide", ["docs/SETUP.md"], false],
  ] as const)("routes %s by its changed paths", (headRef, paths, required) => {
    const classified = classifyChanges(paths.map((path) => ({ status: "M", paths: [path] })));
    expect(classified.windowsSmokeRequired).toBe(required);
    expect(condition).toBeDefined();
    const expression = (condition ?? "")
      .replaceAll("github.event_name", JSON.stringify("pull_request"))
      .replaceAll("github.event.pull_request.head.ref", JSON.stringify(headRef))
      .replaceAll(
        "needs.changes.outputs.code_required",
        JSON.stringify(String(classified.codeRequired)),
      )
      .replaceAll(
        "needs.changes.outputs.windows_smoke_required",
        JSON.stringify(String(classified.windowsSmokeRequired)),
      );
    const applies = Function(
      "startsWith",
      `return (${expression});`,
    )((value: string, prefix: string) => value.startsWith(prefix));
    expect(applies).toBe(required);
    expect(aggregate).toBeDefined();
    for (const smokeResult of ["success", "skipped", "failure", "cancelled"]) {
      const result = spawnSync(bash, ["-e", "-c", aggregate ?? "exit 99"], {
        env: {
          ...process.env,
          EVENT: "pull_request",
          HEAD_REF: headRef,
          CODE_REQUIRED: String(classified.codeRequired),
          WINDOWS_SMOKE_REQUIRED: String(classified.windowsSmokeRequired),
          CHANGES_RESULT: "success",
          INTEGRITY_RESULT: "skipped",
          QUALITY_RESULT: classified.codeRequired ? "success" : "skipped",
          SMOKE_RESULT: smokeResult,
        },
        encoding: "utf8",
      });
      expect(result.error).toBeUndefined();
      expect(result.status === 0, `${headRef}: ${smokeResult}`).toBe(
        smokeResult === (required ? "success" : "skipped"),
      );
    }
  });

  it("requires smoke for unknown changes and renames out of the catalog", () => {
    for (const changes of [
      [],
      [{ status: "?", paths: ["skills/example.md"] }],
      [{ status: "R100", paths: ["skills/example.md", "scripts/example.ps1"] }],
    ]) {
      expect(classifyChanges(changes).windowsSmokeRequired).toBe(true);
    }
  });
});
