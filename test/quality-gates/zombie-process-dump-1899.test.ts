import { describe, expect, it } from "vitest";
import { formatZombieReport } from "../../E2E_testing/_helpers/zombie-process-dump.mjs";

const LONG_CMD = `"C:\\Program Files\\Microsoft Office\\MSACCESS.EXE" -Embedding "C:\\Temp\\${"x".repeat(900)}.accdb"`;

function row(
  ProcessId: number,
  ParentProcessId: number,
  Name: string,
  CommandLine: string | null = null,
) {
  return { ProcessId, ParentProcessId, Name, CommandLine };
}

describe("issue #1899: zombie dump keeps the owner chain and never truncates the suspects", () => {
  it("reports the MCP child, its descendants and every MSACCESS with the full ancestor chain", () => {
    const rows = [
      row(1, 0, "System"),
      row(100, 1, "explorer.exe"),
      row(200, 100, "cmd.exe", "cmd /c run.cmd"),
      row(300, 200, "node.exe", "node dysflow mcp"),
      row(400, 300, "powershell.exe", "powershell -File issue-1817.ps1"),
      row(500, 400, "MSACCESS.EXE", LONG_CMD),
      row(900, 100, "codegraph.exe", "codegraph serve"),
    ];

    const lines = formatZombieReport({ rows, childPid: 300 });
    const text = lines.join("\n");

    expect(text).toContain("pid=300 parent=200 name=node.exe role=child");
    expect(text).toContain("pid=400 parent=300 name=powershell.exe role=descendant");
    expect(text).toContain("pid=500 parent=400 name=MSACCESS.EXE role=msaccess");
    expect(text).toContain(
      "chain=500(MSACCESS.EXE)<-400(powershell.exe)<-300(node.exe)<-200(cmd.exe)<-100(explorer.exe)<-1(System)",
    );
    expect(text).toContain(LONG_CMD);
    expect(text).not.toContain("codegraph");
  });

  it("keeps an orphan MSACCESS whose parent is gone and marks the missing ancestor", () => {
    const rows = [row(500, 777, "MSACCESS.EXE", "MSACCESS.EXE x.accdb")];

    const text = formatZombieReport({ rows, childPid: 42 }).join("\n");

    expect(text).toContain("pid=500 parent=777 name=MSACCESS.EXE role=msaccess");
    expect(text).toContain("<-777(missing)");
  });

  it("terminates on a parent cycle", () => {
    const rows = [row(10, 20, "MSACCESS.EXE"), row(20, 10, "node.exe")];

    const lines = formatZombieReport({ rows, childPid: 20 });

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join("\n")).toContain("cycle");
  });

  it("states explicitly when neither the child nor any MSACCESS is present", () => {
    const rows = [row(1, 0, "System"), row(900, 1, "codegraph.exe")];

    expect(formatZombieReport({ rows, childPid: 555 })).toEqual([
      "ZOMBIE none: childPid=555 not in the process table and no MSACCESS.EXE running.",
    ]);
  });
});
