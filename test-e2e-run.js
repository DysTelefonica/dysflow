import { resolve, join } from "node:path";
import { loadDysflowConfig } from "./dist/core/config/dysflow-config.js";
import { AccessPowerShellRunner } from "./dist/core/runner/access-runner.js";
import { AccessQueryService } from "./dist/core/services/query-service.js";

console.log("Starting debug run for 2nd test (relink)...");
const workspaceRoot = "C:\\Proyectos\\dysflow\\E2E_testing";
const fixtureBackend = join(workspaceRoot, "NoConformidades_Datos.accdb");

const config = loadDysflowConfig({
  cwd: workspaceRoot,
  env: { DYSFLOW_BACKEND_PASSWORD: process.env.ACCESS_VBA_PASSWORD ?? "backend-secret" },
});

console.log("Config OK:", config.ok);
if (!config.ok) {
  console.error("Config error:", config.error);
  process.exit(1);
}

const runner = new AccessPowerShellRunner({
  scriptPath: resolve("scripts/dysflow-access-runner.ps1"),
});
const queryService = new AccessQueryService({ runner, config: config.data });

try {
  const result = await queryService.execute({
    sql: "",
    mode: "write",
    action: "relink_tables",
    backendPath: fixtureBackend,
  });
  console.log("Result relink:", JSON.stringify(result, null, 2));
} catch (err) {
  console.error("Execution threw:", err);
}
