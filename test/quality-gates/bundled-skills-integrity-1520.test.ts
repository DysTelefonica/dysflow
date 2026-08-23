import { readdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const skillNames = [
  "dysflow-arnes",
  "dysflow-usage",
  "dysflow-codegraph-update",
  "dysflow-examples-sync",
  "dysflow-pointer-rollout",
] as const;
const mojibake = ["Â", "Ã", "â€", "â€”", "â†", "ÔÇ", "├", "ï»¿", "�"];

async function filesBelow(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(root, entry.name);
      return entry.isDirectory() ? await filesBelow(full) : [full];
    }),
  );
  return nested.flat();
}

describe("release-owned Dysflow skill integrity (#1520)", () => {
  it("ships every helper, reference, and bootstrap example needed by its own guidance", async () => {
    const required = [
      "skills/dysflow-usage/assets/examples/bootstrap.md",
      "skills/dysflow-usage/assets/examples/resolve-project-recovery.md",
      "skills/dysflow-usage/assets/examples/verify-code.md",
      "skills/dysflow-usage/assets/scripts/verify-examples-vs-runtime.ps1",
      "skills/dysflow-usage/references/agent-friction-map.md",
      "skills/dysflow-codegraph-update/assets/scripts/Invoke-DysflowJsonRpc.ps1",
      "skills/dysflow-codegraph-update/assets/scripts/Invoke-DysflowSemanticAudit.ps1",
      "skills/dysflow-codegraph-update/references/procedure.md",
      "skills/dysflow-pointer-rollout/references/procedure.md",
      "skills/dysflow-examples-sync/references/procedure.md",
    ];
    for (const relativePath of required) {
      expect((await stat(path.join(repoRoot, relativePath))).isFile(), relativePath).toBe(true);
    }
  });

  it("decodes every bundled skill file as UTF-8 without mojibake or deprecated mirror paths", async () => {
    for (const name of skillNames) {
      const root = path.join(repoRoot, "skills", name);
      for (const file of await filesBelow(root)) {
        const bytes = await readFile(file);
        const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        for (const sentinel of mojibake) expect(content, file).not.toContain(sentinel);
        expect(content, file).not.toMatch(/C:\\Users\\[^\\]+|C:\\Proyectos\\skills|C:\\00repos/i);
      }
    }
  });

  it("keeps every fenced example JSON shape parseable", async () => {
    const examples = await filesBelow(path.join(repoRoot, "skills/dysflow-usage/assets/examples"));
    for (const file of examples.filter((value) => value.endsWith(".md"))) {
      const content = await readFile(file, "utf8");
      for (const match of content.matchAll(/```json\s*\r?\n([\s\S]*?)\r?\n```/g)) {
        expect(() => JSON.parse(match[1] ?? ""), file).not.toThrow();
      }
    }
  });

  it("tracks the exact bytes of every bundled example", async () => {
    const usageRoot = path.join(repoRoot, "skills/dysflow-usage");
    const tracker = JSON.parse(
      await readFile(path.join(usageRoot, "assets/example-hashes.json"), "utf8"),
    ) as Record<string, { path: string; sha256: string; needs_human_content: boolean }>;
    const examples = (await filesBelow(path.join(usageRoot, "assets/examples"))).filter((value) =>
      value.endsWith(".md"),
    );
    expect(Object.keys(tracker)).toHaveLength(examples.length);
    for (const entry of Object.values(tracker)) {
      const bytes = await readFile(path.join(usageRoot, entry.path));
      expect(createHash("sha256").update(bytes).digest("hex"), entry.path).toBe(entry.sha256);
      expect(entry.needs_human_content, entry.path).toBe(false);
    }
  });

  it("keeps repository-relative asset and reference paths resolvable", async () => {
    for (const name of skillNames) {
      const root = path.join(repoRoot, "skills", name);
      const skill = await readFile(path.join(root, "SKILL.md"), "utf8");
      const references = [...skill.matchAll(/(?:`|\()((?:assets|references)\/[A-Za-z0-9_./-]+)(?:`|\))/g)].map(
        (match) => match[1] as string,
      );
      for (const relativePath of references.filter((value) => !value.includes("<"))) {
        expect((await stat(path.join(root, relativePath))).isFile() || relativePath.endsWith("/"), `${name}/${relativePath}`).toBe(true);
      }
    }
  });

  it("audits structured MCP content rather than the lossy summary text", async () => {
    const helper = await readFile(
      path.join(
        repoRoot,
        "skills/dysflow-codegraph-update/assets/scripts/Invoke-DysflowJsonRpc.ps1",
      ),
      "utf8",
    );
    const audit = await readFile(
      path.join(
        repoRoot,
        "skills/dysflow-codegraph-update/assets/scripts/Invoke-DysflowSemanticAudit.ps1",
      ),
      "utf8",
    );
    expect(helper).toContain("structuredContent");
    expect(audit).toContain("bootstrap.json");
    expect(audit).toContain("index.json");
    expect(audit).toMatch(/RUNTIME CONTRACT GAP/);
    expect(audit).toMatch(/DRIFT/);
  });
});
