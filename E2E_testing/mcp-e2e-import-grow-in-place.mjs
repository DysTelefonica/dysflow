import { spawn } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const fixturePath = join(scriptDir, "NoConformidades.accdb");
const managerPath = join(repoRoot, "scripts", "dysflow-vba-manager.ps1");
const tempRoot = join(process.env.TEMP ?? process.env.TMP ?? ".", `dysflow-f16-import-grow-${Date.now()}`);
const accessPath = join(tempRoot, "NoConformidades.accdb");
const modulesRoot = join(tempRoot, "modules");
const moduleName = "Test_F16GrowImport";

function makeModule(name, lineCount) {
  const filler = Array.from({ length: lineCount }, (_, index) => `    Debug.Print "line ${index + 1}"`);
  return [
    `Attribute VB_Name = "${name}"`,
    "Option Explicit",
    "Public Sub Sanity()",
    ...filler,
    "End Sub",
  ].join("\r\n");
}

function parseDysflowResult(stdout) {
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("DYSFLOW_RESULT ")) continue;
    return JSON.parse(line.slice("DYSFLOW_RESULT ".length));
  }
  throw new Error(`No DYSFLOW_RESULT line found. stdout=${stdout.slice(0, 500)}`);
}

function firstModule(payload) {
  const modules = Array.isArray(payload) ? payload : (payload?.modules ?? []);
  return modules[0];
}

async function runImport(extraArgs = []) {
  return await new Promise((resolvePromise) => {
    const child = spawn("pwsh", ["-NoProfile", "-NonInteractive", "-File", managerPath, ...extraArgs], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("close", (code) => resolvePromise({ code: code ?? -1, stdout, stderr }));
  });
}

if (process.platform !== "win32") {
  console.log("[f16-import-grow] skipped: Windows + Access required.");
  process.exit(0);
}

if (!existsSync(fixturePath)) {
  console.log(`[f16-import-grow] skipped: missing fixture ${fixturePath}`);
  process.exit(0);
}

try {
  await rm(tempRoot, { recursive: true, force: true });
  await mkdir(modulesRoot, { recursive: true });
  await cp(fixturePath, accessPath);

  const modulePath = join(modulesRoot, `${moduleName}.bas`);
  await writeFile(modulePath, makeModule(moduleName, 2), "utf8");
  const baseArgs = [
    "-Action", "Import",
    "-AccessPath", accessPath,
    "-DestinationRoot", modulesRoot,
    "-ModuleNamesJson", JSON.stringify([moduleName]),
    "-Json",
  ];

  const initial = await runImport(baseArgs);
  if (initial.code !== 0 || firstModule(parseDysflowResult(initial.stdout))?.status !== "ok") {
    throw new Error(`Initial import failed. code=${initial.code} stderr=${initial.stderr}`);
  }

  await writeFile(modulePath, makeModule(moduleName, 40), "utf8");
  const grown = await runImport([...baseArgs, "-VerboseContract"]);
  const entry = firstModule(parseDysflowResult(grown.stdout));
  if (grown.code !== 0 || entry?.status !== "ok" || entry?.error?.code === "IMPORT_TRUNCATED" || entry?.verbose?.truncated) {
    throw new Error(`Grow import failed/truncated. code=${grown.code} entry=${JSON.stringify(entry)} stderr=${grown.stderr}`);
  }

  console.log("[f16-import-grow] passed: larger source imported over existing module without IMPORT_TRUNCATED.");
} finally {
  if (!process.env.DYSFLOW_E2E_PRESERVE_SANDBOX) {
    await rm(tempRoot, { recursive: true, force: true });
  } else {
    console.log(`[f16-import-grow] sandbox preserved: ${tempRoot}`);
  }
}
