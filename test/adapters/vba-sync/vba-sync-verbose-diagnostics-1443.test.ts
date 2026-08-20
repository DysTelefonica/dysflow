import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { VbaSyncAdapter } from "../../../src/adapters/vba-sync/vba-sync-adapter.js";

const SOURCE = ["Option Explicit", "Public Sub Run()", '  MsgBox "Hello"', "End Sub", ""].join(
  "\n",
);

function snapshot(lines: number, bytes: number, sha256: string) {
  return { lines, bytes, sha256 };
}

function runner(stdoutPayload: unknown) {
  return async () => ({
    exitCode: 0,
    stdout: `DYSFLOW_RESULT ${JSON.stringify(stdoutPayload)}`,
    stderr: "",
    durationMs: 1,
    timedOut: false,
  });
}

function service(stdoutPayload: unknown) {
  return new VbaSyncAdapter({
    executor: runner(stdoutPayload),
    accessPath: "C:/project/frontend.accdb",
    destinationRoot: "C:/project/src",
    env: {},
  });
}

function powershellService(stdoutPayload: unknown, exitCode = 0) {
  const encodedPayload = Buffer.from(JSON.stringify(stdoutPayload), "utf8").toString("base64");
  const stdout = execFileSync(
    "pwsh",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPayload}')); ` +
        `$payload = $json | ConvertFrom-Json; ` +
        `Write-Output ('DYSFLOW_RESULT ' + ($payload | ConvertTo-Json -Compress -Depth 20))`,
    ],
    { encoding: "utf8" },
  );

  return new VbaSyncAdapter({
    executor: async () => ({
      exitCode,
      stdout,
      stderr: "",
      durationMs: 1,
      timedOut: false,
    }),
    accessPath: "C:/project/frontend.accdb",
    destinationRoot: "C:/project/src",
    env: {},
  });
}

describe("VBA sync verbose diagnostics (#1443)", () => {
  it("classifies post-import normalization through the public adapter path", async () => {
    const destinationText = SOURCE.replace(/\n/g, "\r\n").replace("MsgBox", "msgbox");
    const result = await service({
      module: "Module1",
      status: "ok",
      error: null,
      verbose: {
        source: snapshot(5, 69, "a".repeat(64)),
        destination: snapshot(5, 73, "b".repeat(64)),
        truncated: false,
        mismatchReason: "content_hash",
        _sourceText: SOURCE,
        _destinationText: destinationText,
        fileType: ".bas",
      },
    }).execute("import_modules", {
      moduleNames: ["Module1"],
      destinationRoot: "C:/project/src",
      apply: true,
      verbose: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected import success");
    const entry = (result.data as { result: { verbose: Record<string, unknown> } }).result;
    expect(entry.verbose).toMatchObject({
      classification: "caseOnly",
      actionable: false,
      recommendation: "no_action",
    });
    expect(entry.verbose).not.toHaveProperty("_sourceText");
    expect(entry.verbose).not.toHaveProperty("_destinationText");
  });

  it("keeps string-literal and procedure-body changes actionable", async () => {
    const result = await service({
      module: "Module1",
      status: "ok",
      error: null,
      verbose: {
        source: snapshot(5, 69, "a".repeat(64)),
        destination: snapshot(5, 67, "b".repeat(64)),
        truncated: false,
        mismatchReason: "content_hash",
        _sourceText: SOURCE,
        _destinationText: SOURCE.replace('"Hello"', '"HELLO"').replace(
          "End Sub",
          "  x = 1\nEnd Sub",
        ),
        fileType: ".bas",
      },
    }).execute("import_modules", {
      moduleNames: ["Module1"],
      destinationRoot: "C:/project/src",
      apply: true,
      verbose: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected import success");
    const verbose = (result.data as { result: { verbose: Record<string, unknown> } }).result
      .verbose;
    expect(verbose.actionable).toBe(true);
    expect(verbose.classification).toBe("bothChanged");
    expect(verbose.recommendation).toBe("manual_merge");
  });

  it("keeps terminal/trailing whitespace benign and comment text case-sensitive", async () => {
    const entries = [
      {
        module: "WhitespaceOnly",
        status: "ok",
        error: null,
        verbose: {
          source: snapshot(2, 18, "a".repeat(64)),
          destination: snapshot(2, 23, "b".repeat(64)),
          truncated: false,
          mismatchReason: "content_hash",
          _sourceText: "Option Explicit\n' note\n",
          _destinationText: "Option Explicit   \r\n' note   ",
          fileType: "bas",
        },
      },
      {
        module: "CommentChanged",
        status: "ok",
        error: null,
        verbose: {
          source: snapshot(2, 18, "a".repeat(64)),
          destination: snapshot(2, 18, "b".repeat(64)),
          truncated: false,
          mismatchReason: "content_hash",
          _sourceText: "Option Explicit\n' Important\n",
          _destinationText: "Option Explicit\n' IMPORTANT\n",
          fileType: "bas",
        },
      },
    ];
    const result = await service(entries).execute("import_modules", {
      moduleNames: entries.map((entry) => entry.module),
      destinationRoot: "C:/project/src",
      apply: true,
      verbose: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected import success");
    const resultEntries = (result.data as { result: Array<{ verbose: Record<string, unknown> }> })
      .result;
    expect(resultEntries[0]?.verbose).toMatchObject({
      classification: "whitespaceOnly",
      actionable: false,
    });
    expect(resultEntries[1]?.verbose.actionable).toBe(true);
  });

  it.each([
    "export_modules",
    "export_all",
  ] as const)("%s returns classified binary-before/file-after snapshots only when requested", async (toolName) => {
    const payload = {
      ok: true,
      exported: ["Module1"],
      verbose: [
        {
          module: "Module1",
          binary: snapshot(5, 73, "a".repeat(64)),
          file: snapshot(5, 69, "b".repeat(64)),
          _binaryText: SOURCE.replace(/\n/g, "\r\n"),
          _fileText: SOURCE,
          fileType: ".bas",
        },
      ],
    };
    const result = await service(payload).execute(toolName, {
      ...(toolName === "export_modules" ? { moduleNames: ["Module1"] } : {}),
      destinationRoot: "C:/project/src",
      apply: true,
      verbose: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected export success");
    const data = result.data as { verbose: Array<Record<string, unknown>> };
    expect(data.verbose[0]).toMatchObject({
      module: "Module1",
      binary: payload.verbose[0]?.binary,
      file: payload.verbose[0]?.file,
      classification: "whitespaceOnly",
      actionable: false,
      recommendation: "no_action",
    });
    expect(data.verbose[0]).not.toHaveProperty("_binaryText");
    expect(data.verbose[0]).not.toHaveProperty("_fileText");
  });

  it("keeps verbose payload absent when export verbose is omitted", async () => {
    const result = await service({ ok: true, exported: ["Module1"] }).execute("export_modules", {
      moduleNames: ["Module1"],
      destinationRoot: "C:/project/src",
      apply: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected export success");
    expect(result.data).not.toHaveProperty("verbose");
  });

  it("classifies equivalent VB_Name representations from real PowerShell JSON", async () => {
    const result = await powershellService({
      ok: true,
      exported: ["Module1"],
      verbose: [
        {
          module: "Module1",
          binary: snapshot(2, 50, "a".repeat(64)),
          file: snapshot(2, 50, "a".repeat(64)),
          _binaryText: 'Attribute VB_Name = "Module1"\r\nOption Explicit\r\n',
          _fileText: 'Attribute VB_Name = "Module1"\r\nOption Explicit\r\n',
          fileType: "bas",
        },
      ],
    }).execute("export_modules", {
      moduleNames: ["Module1"],
      destinationRoot: "C:/project/src",
      apply: true,
      verbose: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected export success");
    const verbose = (result.data as { verbose: Array<Record<string, unknown>> }).verbose[0];
    expect(verbose).toMatchObject({ classification: "matched", actionable: false });
    expect(verbose).not.toHaveProperty("_binaryText");
    expect(verbose).not.toHaveProperty("_fileText");
  });

  it("never exposes private comparison bodies from a mixed failure PowerShell envelope", async () => {
    const privateSource = 'Public Sub Secret(): MsgBox "PRIVATE_SOURCE_BODY": End Sub';
    const privateDestination = 'Public Sub Secret(): MsgBox "PRIVATE_DESTINATION_BODY": End Sub';
    const result = await powershellService({
      ok: false,
      error: { code: "VBA_IMPORT_FAILED", message: "one module failed" },
      modules: [
        {
          module: "SuccessfulModule",
          status: "ok",
          error: null,
          verbose: {
            source: snapshot(1, 50, "a".repeat(64)),
            destination: snapshot(1, 55, "b".repeat(64)),
            truncated: false,
            mismatchReason: "content_hash",
            _sourceText: privateSource,
            _destinationText: privateDestination,
            fileType: "bas",
          },
        },
        { module: "FailedModule", status: "error", error: "simulated failure" },
      ],
    }).execute("import_modules", {
      moduleNames: ["SuccessfulModule", "FailedModule"],
      destinationRoot: "C:/project/src",
      apply: true,
      verbose: true,
    });

    expect(result.ok).toBe(false);
    const publicEnvelope = JSON.stringify(result);
    expect(publicEnvelope).not.toContain(privateSource);
    expect(publicEnvelope).not.toContain(privateDestination);
    expect(publicEnvelope).not.toContain("_sourceText");
    expect(publicEnvelope).not.toContain("_destinationText");
  });
});
