import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runMcpSession } from "./_helpers/mcp-harness.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const editor = join(repoRoot, "E2E_testing", "_helpers", "issue-1817-access-edit.ps1");
const form = "Form_Issue1817Form";
const klass = "Issue1817Class";
const artifacts = [
  `forms/${form}.form.txt`,
  `forms/${form}.cls`,
  `classes/${klass}.cls`,
];

function edit(root, action, marker) {
  const result = spawnSync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-File", editor,
    "-Root", root, "-Action", action, "-Marker", marker,
  ], { encoding: "utf8", windowsHide: true, timeout: 60000 });
  assert.equal(result.status, 0, `External Access edit failed: ${result.stderr || result.error}`);
  assert.match(result.stdout, /ISSUE_1817_EDIT_SAVED/);
}

function payload(result) {
  assert.equal(result.isError, false, result.text);
  const envelope = result.response?.result;
  const structured = envelope?.structuredContent;
  const value = structured?.content?.[0]?.text;
  return value ? JSON.parse(value) : structured ?? JSON.parse(result.text);
}

async function snapshot(directory) {
  const result = {};
  for (const relative of artifacts) {
    const bytes = await readFile(join(directory, relative));
    const text = bytes[0] === 0xff && bytes[1] === 0xfe
      ? bytes.subarray(2).toString("utf16le") : bytes.toString("utf8");
    result[relative] = { text, hash: createHash("sha256").update(bytes).digest("hex") };
  }
  return result;
}

function markerState(files) {
  const ui = files[artifacts[0]].text.match(/Caption\s*=\s*"([A-Z0-9_]*1817[A-Z0-9_]*)"/);
  const code = artifacts.slice(1).map((relative) =>
    files[relative].text.match(/Issue1817Marker\s+As\s+String\s*=\s*"([A-Z0-9_]+)"/i)?.[1]);
  assert.ok(ui && code.every(Boolean), "Export must contain the actual fixture UI and code.");
  return [ui[1], ...code];
}

function assertNoAction(data) {
  assert.equal(data.ok, true, JSON.stringify(data));
  assert.equal(data.postSync?.actionable?.total, 0, JSON.stringify(data));
  assert.equal(data.recommendation, "no_action", JSON.stringify(data));
  assert.equal(data.execution?.chunksExecuted ?? 0, 0, "Repeated sync must dispatch no writes.");
}

/** Real Access changes outside Dysflow, repeated calls inside one MCP process. */
export async function runIssue1817SyncJourney({
  command = process.execPath,
  args = [join(repoRoot, "dist", "cli", "index.js"), "mcp", "--tool-surface", "full"],
  shell = false,
  env = process.env,
  onChild = async () => {},
  onClosed = async () => {},
  onCase = async () => {},
  operations = ["export_modules", "sync_binary", "import_modules", "sync-src-to-binary"],
} = {}) {
  assert.equal(process.platform, "win32", "Issue 1817 requires real Windows Access, never skip.");
  const root = await realpath(await mkdtemp(join(tmpdir(), "dysflow-issue-1817-")));
  await writeFile(join(root, ".issue-1817-fixture"), "Disposable Access E2E fixture only.\n");
  const git = spawnSync("git", ["init", "--quiet"], { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(git.status, 0, git.stderr);
  let successful = false;
  try {
    // Each primitive/direction starts independently, so export cannot fix sync first.
    for (const operation of operations) {
      const caseRoot = join(root, operation);
      const source = join(caseRoot, "src");
      const control = join(caseRoot, "control");
      await mkdir(join(caseRoot, ".dysflow"), { recursive: true });
      const init = spawnSync("git", ["init", "--quiet"], { cwd: caseRoot, encoding: "utf8", windowsHide: true });
      assert.equal(init.status, 0, init.stderr);
      await mkdir(source);
      await mkdir(control);
      await writeFile(join(caseRoot, ".issue-1817-fixture"), "Disposable fixture.\n");
      await writeFile(join(caseRoot, ".dysflow", "project.json"), JSON.stringify({
        id: `issue-1817-${operation}`, frontendFile: "Fixture.accdb", destinationRoot: "src",
        capabilities: { allowWrites: true },
      }));
      edit(caseRoot, "create", "INITIAL_1817");
      const child = spawn(command, args, {
        cwd: caseRoot, shell, stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
        env: { ...env, INIT_CWD: caseRoot },
      });
      await onChild(child.pid);
      try {
        await runMcpSession({ child, timeoutMs: 120000, run: async ({ callTool }) => {
          payload(await callTool("bootstrap", { cwd: caseRoot }));
          payload(await callTool("schema", { view: "index" }));
          for (const name of ["export_modules", "import_modules", "sync_binary"]) {
            payload(await callTool("describe_tool", { name }));
          }
          const common = { cwd: caseRoot, accessPath: join(caseRoot, "Fixture.accdb"),
            moduleNames: [form, klass], apply: true, timeoutMs: 90000 };
          const exportTo = async (destinationRoot) => payload(await callTool("export_modules", {
            ...common, destinationRoot, implements_check: "export_overwrites_source_precheck",
            confirmedRequiresConfirmation: true,
          }));
          await exportTo(source);
          const initial = markerState(await snapshot(source));
          assert.deepEqual(initial, ["INITIAL_1817", "INITIAL_1817", "INITIAL_1817"]);
          const binaryToSource = operation === "export_modules" || operation === "sync_binary";
          const applyOperation = async () => {
            if (operation === "export_modules") return await exportTo(source);
            if (operation === "import_modules") return payload(await callTool(operation, {
              ...common, destinationRoot: source,
            }));
            return payload(await callTool("sync_binary", {
              ...common, destinationRoot: source, includeForms: true,
              direction: binaryToSource ? "binary-to-src" : "src-to-binary",
              acceptBothChanged: true,
              implements_check: "export_overwrites_source_precheck", confirmedRequiresConfirmation: true,
            }));
          };
          for (const [index, action] of ["ui", "form-code", "class-code"].entries()) {
            for (const round of [1, 2]) {
              const marker = `CHANGED_1817_${index}_${round}`;
              console.log(`CHECK issue-1817 ${operation} ${action} round ${round}`);
              const expected = markerState(await snapshot(source));
              expected[index] = marker;
              if (binaryToSource) {
                // Populate sync's read-only view before an out-of-band Access change.
                if (operation === "sync_binary") payload(await callTool("sync_binary", {
                  ...common, destinationRoot: source, direction: "binary-to-src", includeForms: true, apply: false,
                }));
                edit(caseRoot, action, marker);
                edit(caseRoot, "snapshot", marker);
                assert.deepEqual(markerState(await snapshot(control)), expected);
              } else {
                const relative = artifacts[index];
                const before = await readFile(join(source, relative));
                const encoding = before[0] === 0xff && before[1] === 0xfe ? "utf16le" : "utf8";
                const text = before.toString(encoding).replace(markerState(await snapshot(source))[index], marker);
                await writeFile(join(source, relative), Buffer.from(text, encoding));
              }
              const result = await applyOperation();
              assert.notEqual(result.ok, false, JSON.stringify(result));
              const after = await snapshot(source);
              assert.deepEqual(markerState(after), expected);
              // A sentinel timestamp detects equal-content export rewrites, not just byte drift.
              if (operation === "export_modules") {
                for (const relative of artifacts) await utimes(join(source, relative), 946684800, 946684800);
              }
              // Repeat immediately: an external observer must not resave the binary between calls.
              const repeated = await applyOperation();
              if (operation === "export_modules") {
                for (const relative of artifacts) assert.equal((await stat(join(source, relative))).mtimeMs,
                  946684800000, `Unchanged export rewrote ${relative}`);
              }
              const twice = await snapshot(source);
              assert.deepEqual(twice, after, "Repeated operation must not rewrite source bytes.");
              edit(caseRoot, "snapshot", marker);
              assert.deepEqual(markerState(await snapshot(control)), expected);
              if (operation.includes("sync")) assertNoAction(repeated);
            }
          }
          if (operation.includes("sync")) {
            // Both sides changed: do not silently choose a winner without explicit consent.
            edit(caseRoot, "class-code", "BINARY_CONFLICT_1817");
            const path = join(source, artifacts[2]);
            const bytes = await readFile(path);
            const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf16le" : "utf8";
            await writeFile(path, bytes.toString(encoding).replace(markerState(await snapshot(source))[2],
              "SOURCE_CONFLICT_1817"), encoding);
            const before = await snapshot(source);
            const guarded = payload(await callTool("sync_binary", {
              ...common, destinationRoot: source, includeForms: true,
              direction: binaryToSource ? "binary-to-src" : "src-to-binary",
            }));
            assert.equal(guarded.ok, false);
            assert.equal(guarded.recommendation, "manual_merge");
            assert.equal(guarded.execution?.chunksExecuted ?? 0, 0);
            assert.deepEqual(await snapshot(source), before);
            edit(caseRoot, "snapshot", "BINARY_CONFLICT_1817");
            assert.equal(markerState(await snapshot(control))[2], "BINARY_CONFLICT_1817");
            assert.notEqual((await applyOperation()).ok, false);
            const winner = binaryToSource ? "BINARY_CONFLICT_1817" : "SOURCE_CONFLICT_1817";
            assert.equal(markerState(await snapshot(source))[2], winner);
            edit(caseRoot, "snapshot", winner);
            assert.equal(markerState(await snapshot(control))[2], winner);
          }
        } });
      } finally {
        await onClosed(child.pid);
      }
      await onCase(operation);
    }
    successful = true;
  } finally {
    if (successful) await rm(root, { recursive: true, force: true });
    else console.error(`Issue 1817 failed; disposable evidence preserved at ${root}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runIssue1817SyncJourney({ env: { ...process.env, DYSFLOW_HOME: "" },
    onCase: async (operation) => console.log(`PASS issue-1817 ${operation}`) });
}
