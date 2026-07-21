import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDysflowConfig } from "../../src/adapters/config/dysflow-config-node.js";
import { getCapabilitiesAll } from "../../src/adapters/mcp/get-capabilities-tool.js";
import { resolveStartupWriteExecutionPolicy } from "../../src/adapters/mcp/stdio.js";

describe("get_capabilities write policy propagation (#1037)", () => {
  it("reports developer defaults from the project config through the runtime snapshot", ({
    task,
  }) => {
    const root = join(process.cwd(), ".tmp", task.id);
    mkdirSync(join(root, ".dysflow"), { recursive: true });
    writeFileSync(join(root, "app.accdb"), "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({
        accessPath: "app.accdb",
        capabilities: { allowWrites: true, writeExecutionPolicy: "developer" },
      }),
    );

    const loaded = loadDysflowConfig({ cwd: root });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const snapshot = getCapabilitiesAll({
      writesEnabled: true,
      writeAccessResolver: undefined,
      allowedProcedures: undefined,
      projectId: undefined,
      allowWrites: true,
      writeExecutionPolicy: resolveStartupWriteExecutionPolicy(loaded.data),
    });

    expect(snapshot.writeExecutionPolicy).toBe("developer");
    expect(snapshot.effectiveDryRunDefault.import_modules).toBe(false);
    expect(snapshot.effectiveDryRunDefault.test_vba).toBe(false);
    expect(snapshot.effectiveDryRunDefault.form_set_property).toBe(false);
    expect(snapshot.effectiveDryRunDefault.compact_repair).toBe(true);
  });
});
