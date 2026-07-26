import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = resolve("scripts/dependency-audit-evidence.mjs");
const STUB = resolve("test/fixtures/dependency-audit-stub.mjs");
const tempRoots: string[] = [];

function runAudit(scenario: string, policy = "warn", overrides: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "dysflow-audit-"));
  tempRoots.push(root);
  const summaryPath = join(root, "summary.md");
  const outputPath = join(root, "output.txt");
  const counterPath = join(root, "counter.txt");
  const result = spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      DYSFLOW_AUDIT_COMMAND_JSON: JSON.stringify([process.execPath, STUB]),
      DYSFLOW_AUDIT_SCENARIO: scenario,
      DYSFLOW_AUDIT_COUNTER: counterPath,
      AUDIT_UNAVAILABLE_POLICY: policy,
      AUDIT_RETRY_DELAY_MS: "0",
      AUDIT_SOURCE: "https://token:super-secret@registry.example.test/audit?auth=hidden",
      GITHUB_STEP_SUMMARY: summaryPath,
      GITHUB_OUTPUT: outputPath,
      ...overrides,
    },
  });
  const machineLine = result.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith("DYSFLOW_AUDIT_RESULT="));
  const report = JSON.parse(machineLine?.slice("DYSFLOW_AUDIT_RESULT=".length) ?? "null") as {
    status: string;
    attempts: number;
    source: string;
    freshness: string;
    reason: string;
  };
  return {
    result,
    report,
    summary: readFileSync(summaryPath, "utf8"),
    output: readFileSync(outputPath, "utf8"),
  };
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("dependency audit evidence", () => {
  it("reports a completed audit with no high advisories as clean", () => {
    const audit = runAudit("clean");
    expect(audit.result.status).toBe(0);
    expect(audit.report).toMatchObject({ status: "clean", attempts: 1 });
    expect(audit.summary).toContain("Status: **clean**");
    expect(audit.report.freshness).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("trusts a valid clean report when pnpm exits nonzero for lower-severity advisories", () => {
    const audit = runAudit("clean-nonzero", "fail");
    expect(audit.result.status).toBe(0);
    expect(audit.report).toMatchObject({ status: "clean", attempts: 1 });
  });

  it("fails immediately when high-severity advisories are present", () => {
    const audit = runAudit("vulnerable");
    expect(audit.result.status).toBe(1);
    expect(audit.report).toMatchObject({ status: "vulnerable", attempts: 1 });
    expect(audit.output).toContain("audit-evidence=vulnerable");
  });

  it.each([
    "410",
    "500",
    "network",
    "malformed",
  ])("reports %s audit evidence as unavailable, never clean", (scenario) => {
    const audit = runAudit(scenario);
    expect(audit.result.status).toBe(0);
    expect(audit.report).toMatchObject({ status: "unavailable", attempts: 3 });
    expect(audit.summary).toContain("PR policy: warning");
  });

  it.each([
    ["warn", 0],
    ["fail", 2],
  ])("treats exit-0 schema-invalid JSON as unavailable under %s policy", (policy, expectedExit) => {
    const audit = runAudit("wrong-json", policy);
    expect(audit.result.status).toBe(expectedExit);
    expect(audit.report).toMatchObject({ status: "unavailable", attempts: 3 });
  });

  it("retries transient failures within the bound and records the successful attempt", () => {
    const audit = runAudit("retry-clean");
    expect(audit.report).toMatchObject({ status: "clean", attempts: 3 });
  });

  it("fails unavailable evidence under the default-branch policy", () => {
    const audit = runAudit("network", "fail");
    expect(audit.result.status).toBe(2);
    expect(audit.report.status).toBe("unavailable");
    expect(audit.summary).toContain("default-branch policy: fail");
  });

  it("redacts registry credentials from logs, summaries, and machine output", () => {
    const audit = runAudit("network");
    const visible = `${audit.result.stdout}\n${audit.result.stderr}\n${audit.summary}\n${audit.output}`;
    expect(visible).not.toContain("super-secret");
    expect(visible).not.toContain("token:");
    expect(audit.report.source).toBe("https://registry.example.test/audit");
  });

  it("names a spawn failure instead of blaming the registry (#1149)", () => {
    // When the audit command cannot launch, both stdout and stderr are undefined.
    // The classifier used to fall through to "malformed-response", which accuses
    // registry.npmjs.org of returning bad data for a process that never ran and
    // sends the investigation at the wrong subsystem.
    const audit = runAudit("clean", "fail", {
      DYSFLOW_AUDIT_COMMAND_JSON: JSON.stringify([
        resolve("test/fixtures/definitely-not-an-executable"),
      ]),
    });

    expect(audit.report.status).toBe("unavailable");
    expect(audit.report.reason).toBe("audit-command-not-executable");
    expect(audit.summary).not.toContain("malformed-response");
  });

  it.skipIf(process.platform !== "win32")(
    "runs an audit command exposed only as a Windows .cmd shim (#1149)",
    () => {
      // `actions/setup-pnpm` puts `pnpm.CMD` on PATH with no `.exe` sibling, and
      // since the CVE-2024-27980 fix Node refuses to spawn `.cmd` without a shell.
      // The real gate therefore could never run on Windows.
      const shim = join(mkdtempSync(join(tmpdir(), "dysflow-audit-shim-")), "fake-audit.cmd");
      tempRoots.push(dirname(shim));
      writeFileSync(
        shim,
        ["@echo off", `"${process.execPath}" "${STUB}" %*`, ""].join("\r\n"),
        "utf8",
      );

      const audit = runAudit("clean", "fail", {
        DYSFLOW_AUDIT_COMMAND_JSON: JSON.stringify([shim]),
      });

      expect(audit.report.status).toBe("clean");
    },
  );

  it.skipIf(process.platform !== "win32")(
    "resolves a PATH tool that ships an extensionless script beside its .cmd (#1149)",
    () => {
      // Exactly the runner layout: PNPM_HOME holds an extensionless Node script,
      // `pnpm.CMD`, and `pnpm.ps1` for the same tool. Preferring the extensionless
      // spelling resolves a path Windows then refuses to launch, which is how the
      // first fix produced an honest `audit-command-not-executable` for a tool that
      // was in fact present and runnable.
      const binDir = mkdtempSync(join(tmpdir(), "dysflow-audit-bin-"));
      tempRoots.push(binDir);
      writeFileSync(join(binDir, "fakeaudit"), "#!/usr/bin/env node\n", "utf8");
      writeFileSync(
        join(binDir, "fakeaudit.cmd"),
        ["@echo off", `"${process.execPath}" "${STUB}" %*`, ""].join("\r\n"),
        "utf8",
      );

      const audit = runAudit("clean", "fail", {
        DYSFLOW_AUDIT_COMMAND_JSON: JSON.stringify(["fakeaudit"]),
        PATH: `${binDir};${process.env.PATH ?? ""}`,
      });

      expect(audit.report.reason).not.toBe("audit-command-not-executable");
      expect(audit.report.status).toBe("clean");
    },
  );

  it("pins CI to the wrapper without registry-error masking", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflow).toContain("node scripts/dependency-audit-evidence.mjs");
    expect(workflow).not.toContain("--ignore-registry-errors");
    expect(workflow).toContain("AUDIT_UNAVAILABLE_POLICY");
  });
});
