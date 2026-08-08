#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { access, appendFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const languages = new Set(["bash", "json", "text", "http", "yaml", "ts", "py"]);
const excluded = /^(openspec\/|docs\/(?:archive|prompts)\/)/;
const docPath = (path) =>
  (/^[^/]+\.md$/i.test(path) || /^docs\/.+\.md$/i.test(path)) && !excluded.test(path);
export function classifyChanges(changes) {
  if (!Array.isArray(changes) || changes.length === 0)
    return { codeRequired: true, docsChanged: false, applicableDocs: [] };
  const known = /^(?:A|C\d*|D|M|R\d*|T)$/;
  const paths = [];
  let codeRequired = false;
  for (const change of changes) {
    if (
      !known.test(change.status) ||
      !Array.isArray(change.paths) ||
      change.paths.length < 1 ||
      change.paths.some((p) => typeof p !== "string" || !p)
    ) {
      codeRequired = true;
      continue;
    }
    paths.push(...change.paths);
    if (change.paths.some((path) => !docPath(path))) codeRequired = true;
  }
  const applicableDocs = [...new Set(paths.filter(docPath))];
  return { codeRequired, docsChanged: applicableDocs.length > 0, applicableDocs };
}
export async function validateMarkdown({ path, content, root = process.cwd() }) {
  const violations = [];
  const add = (rule, line, message) => violations.push({ rule, line, message });
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let fenced = false,
    previousHeading = 0,
    h1 = 0,
    paragraph = [],
    paragraphLine = 0;
  const flush = () => {
    const text = paragraph.join(" ").trim();
    if (text.length > 200)
      add("paragraph-length", paragraphLine, `paragraph has ${text.length} characters`);
    paragraph = [];
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "",
      number = index + 1;
    const fence = /^```(\S*)\s*$/.exec(line);
    if (fence) {
      flush();
      if (!fenced && !languages.has(fence[1] ?? ""))
        add("fence-language", number, "code fence needs an allowed language");
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const heading = /^(#{1,})\s+/.exec(line);
    if (heading) {
      flush();
      const depth = heading[1].length;
      if (depth === 1) h1++;
      if (depth > 3) add("heading-depth", number, "headings may not exceed H3");
      if (previousHeading && depth > previousHeading + 1)
        add("heading-jump", number, "heading levels may not jump");
      previousHeading = depth;
      continue;
    }
    if (!line.trim()) flush();
    else if (!/^\s*(?:[-*+] |\d+\. |>|\||<!--)/.test(line)) {
      if (paragraph.length === 0) paragraphLine = number;
      paragraph.push(line.trim());
    } else flush();
  }
  flush();
  if (h1 !== 1) add("h1", 1, `expected exactly one H1, found ${h1}`);
  const external = [...content.matchAll(/\[[^\]]*\]\((https?:\/\/[^)\s]+)[^)]*\)/g)];
  for (let i = 6; i < external.length; i++)
    add("external-links", 1, "document exceeds six external links");
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g)) {
    const target = match[1] ?? "";
    if (/^(?:https?:|mailto:|#)/.test(target)) continue;
    const clean = decodeURIComponent(target.split("#")[0] ?? "");
    if (!clean) continue;
    try {
      await access(resolve(root, dirname(path), clean));
    } catch {
      add(
        "relative-link",
        content.slice(0, match.index).split("\n").length,
        `relative link does not resolve: ${target}`,
      );
    }
  }
  const name = path.includes("/")
    ? /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(path.split("/").at(-1))
    : /^[A-Z0-9]+(?:-[A-Z0-9]+)*\.md$/.test(path);
  if (!name) add("file-name", 1, "new documentation path does not follow repository naming");
  return violations;
}
function args(values) {
  const result = {};
  for (let i = 0; i < values.length; i++)
    if (values[i]?.startsWith("--")) result[values[i].slice(2)] = values[++i];
  return result;
}
function diffChanges(base, head) {
  const raw = execFileSync("git", ["diff", "--name-status", "-z", "--find-renames", base, head], {
    encoding: "utf8",
  });
  const fields = raw.split("\0").filter(Boolean),
    changes = [];
  for (let i = 0; i < fields.length; ) {
    const status = fields[i++],
      count = /^[RC]/.test(status) ? 2 : 1;
    const paths = fields.slice(i, i + count);
    i += count;
    changes.push({ status, paths });
  }
  return changes;
}
const countRules = (items) => {
  const counts = {};
  for (const item of items) counts[item.rule] = (counts[item.rule] ?? 0) + 1;
  return counts;
};
async function check(base, head) {
  const changes = diffChanges(base, head);
  const failures = [];
  for (const change of changes) {
    const path = change.paths.at(-1);
    if (!path || !docPath(path) || change.status === "D") continue;
    const headContent = execFileSync("git", ["show", `${head}:${path}`], { encoding: "utf8" });
    const headIssues = await validateMarkdown({ path, content: headContent });
    if (change.status === "A" || /^R/.test(change.status))
      failures.push(...headIssues.map((issue) => ({ path, ...issue })));
    else {
      const baseContent = execFileSync("git", ["show", `${base}:${path}`], { encoding: "utf8" });
      const baseIssues = await validateMarkdown({ path, content: baseContent });
      const baseline = countRules(baseIssues);
      const seen = {};
      for (const issue of headIssues) {
        if (
          issue.rule === "relative-link" &&
          !baseIssues.some(
            (candidate) => candidate.rule === issue.rule && candidate.message === issue.message,
          )
        ) {
          failures.push({ path, ...issue });
          continue;
        }
        seen[issue.rule] = (seen[issue.rule] ?? 0) + 1;
        if (seen[issue.rule] > (baseline[issue.rule] ?? 0)) failures.push({ path, ...issue });
      }
    }
  }
  if (failures.length)
    throw new Error(failures.map((v) => `${v.path}:${v.line} [${v.rule}] ${v.message}`).join("\n"));
}
async function main() {
  const [command, ...rest] = process.argv.slice(2),
    options = args(rest);
  if (!options.base || !options.head || !["classify", "check"].includes(command))
    throw new Error(
      "usage: check-documentation-quality.mjs <classify|check> --base <ref> --head <ref>",
    );
  if (command === "check") return check(options.base, options.head);
  const result = classifyChanges(diffChanges(options.base, options.head));
  console.log(JSON.stringify(result));
  if (options["github-output"])
    await appendFile(
      options["github-output"],
      `code_required=${result.codeRequired}\ndocs_changed=${result.docsChanged}\n`,
    );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
