import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("dysflow-issue-release-loop post-release handoff", () => {
  it("requires a fresh session before post-release alignment", async () => {
    const skill = await readFile("skills/dysflow-issue-release-loop/SKILL.md", "utf8");

    expect(skill).toMatch(/close the current agent session/i);
    expect(skill).toContain("`dysflow update`");
    expect(skill).toMatch(/open a fresh agent session/i);
    expect(skill).toContain("`dysflow-codegraph-update`");
    expect(skill).toMatch(/do not run.*same session/is);
  });
});
