// Reproductor que el test del quality-gate invoca en un subproceso.
// Se ejecuta como ESM (extension .mjs) para reproducir el path real que
// mcp-e2e.mjs usa. Importa el helper dinámicamente y llama a la rama
// "default" sin inyectar fs.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const helperUrl = new URL(
  "../../../E2E_testing/_helpers/resolve-mcp-e2e-command.mjs",
  import.meta.url,
);
const { resolveMcpE2eCommand } = await import(helperUrl.href);

const override = fileURLToPath(import.meta.url);
// Confirmamos que el archivo existe en disco, para que el bug quede
// inequívocamente aislado al lazy-`require` y no a un path mal formado.
if (!existsSync(override)) {
  console.error(JSON.stringify({ ok: false, code: "FIXTURE_MISSING" }));
  process.exit(1);
}

const result = resolveMcpE2eCommand({
  env: { DYSFLOW_E2E_COMMAND: override },
  repoRoot: process.cwd(),
  // intentionally no `fs`
});
console.log(JSON.stringify(result));
