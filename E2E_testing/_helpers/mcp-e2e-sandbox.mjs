import { tmpdir } from "node:os";
import { join } from "node:path";

export function buildMcpE2eSandboxPlan({ scriptDir, sandboxRoot }) {
  const root = sandboxRoot ?? join(tmpdir(), `dysflow-mcp-e2e-${process.pid}-${Date.now()}`);
  const source = {
    accessPath: join(scriptDir, "NoConformidades.accdb"),
    backendPath: join(scriptDir, "NoConformidades_Datos.accdb"),
    destinationRoot: join(scriptDir, "src"),
  };
  const sandbox = {
    root,
    accessPath: join(root, "NoConformidades.accdb"),
    backendPath: join(root, "NoConformidades_Datos.accdb"),
    destinationRoot: join(root, "src"),
    exportsRoot: join(root, "exports"),
    pruneExportPath: join(root, "exports", "prune"),
    erdPath: join(root, "ERD"),
    reportPath: join(root, "mcp-e2e-report.md"),
    sqlScript: join(root, "script.sql"),
    formSpec: join(root, "form-spec.json"),
    queriesExportPath: join(root, "exports", "queries.json"),
    catalogPath: join(root, "catalog.json"),
  };

  return {
    source,
    sandbox,
    mutablePaths: [
      sandbox.accessPath,
      sandbox.backendPath,
      sandbox.destinationRoot,
      sandbox.exportsRoot,
      sandbox.pruneExportPath,
      sandbox.erdPath,
      sandbox.reportPath,
      sandbox.sqlScript,
      sandbox.formSpec,
      sandbox.queriesExportPath,
      sandbox.catalogPath,
    ],
  };
}
