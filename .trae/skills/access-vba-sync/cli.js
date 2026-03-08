#!/usr/bin/env node
"use strict";

const path = require("path");
const { AccessVbaSyncSkill } = require("./handler");

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    command: null,
    mods: [],
    flags: {}
  };

  if (args.length === 0) return out;
  out.command = args[0];

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = args[i + 1];
      if (val == null || val.startsWith("--")) {
        out.flags[key] = true;
      } else {
        out.flags[key] = val;
        i++;
      }
      continue;
    }
    out.mods.push(a);
  }

  return out;
}

function toBoolFlag(v, defaultValue) {
  if (v === undefined) return defaultValue;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (s === "false" || s === "0" || s === "no") return false;
  if (s === "true" || s === "1" || s === "yes") return true;
  return defaultValue;
}

function normalizePathFlag(p) {
  if (!p) return null;
  return path.resolve(process.cwd(), p);
}

function printHelp() {
  console.log(
    [
      "Uso:",
      "  node skill_access_vba_sync/cli.js start [--access <ruta>] [--destination_root <carpeta>]",
      "  node skill_access_vba_sync/cli.js watch [--access <ruta>] [--destination_root <carpeta>] [--debounce_ms <n>]",
      "  node skill_access_vba_sync/cli.js import <Mod...>",
      "  node skill_access_vba_sync/cli.js sync <Mod...>",
      "  node skill_access_vba_sync/cli.js generate-erd [--backend <ruta>] [--erd_path <ruta>]",
      "  node skill_access_vba_sync/cli.js status",
      "  node skill_access_vba_sync/cli.js end",
      "",
      "Flags:",
      "  --access <ruta>                Ruta .accdb/.accde/.mdb/.mde (relativa a CWD o absoluta)",
      "  --backend <ruta>               Ruta al Backend (_Datos) para generate-erd",
      "  --erd_path <ruta>              Carpeta de salida para el ERD",
      "  --destination_root <carpeta>   Carpeta de export/import (default: src)",
      "  --debounce_ms <n>              Debounce/batching para watch (default: 600)",
      "  --auto_export_on_end false     Desactiva export final"
    ].join("\n")
  );
}

async function main() {
  const { command, mods, flags } = parseArgs(process.argv);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    process.exitCode = command ? 0 : 1;
    return;
  }

  const skill = new AccessVbaSyncSkill({
    skillDir: __dirname,
    projectRoot: process.cwd(),
    destinationRoot: flags.destination_root || "src",
    debounceMs: Number.isFinite(Number(flags.debounce_ms)) ? Number(flags.debounce_ms) : 600,
    autoExportOnEnd: toBoolFlag(flags.auto_export_on_end, true)
  });

  const accessPath = normalizePathFlag(flags.access);

  if (command === "start") {
    await skill.start({ accessPath });
    return;
  }

  if (command === "watch") {
    await skill.watch({ accessPath });
    return;
  }

  if (command === "import" || command === "sync") {
    if (mods.length === 0) {
      console.error("Faltan módulos. Ejemplo: node skill_access_vba_sync/cli.js import Utilidades Validaciones");
      process.exitCode = 1;
      return;
    }
    await skill.importModules({ moduleNames: mods, accessPath });
    return;
  }

  if (command === "status") {
    await skill.status();
    return;
  }

  if (command === "end") {
    await skill.end();
    return;
  }

  if (command === "generate-erd") {
    const backendPath = normalizePathFlag(flags.backend);
    const erdPath = normalizePathFlag(flags.erd_path);
    await skill.generateErd({ backendPath, erdPath });
    return;
  }

  console.error(`Comando desconocido: ${command}`);
  printHelp();
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("ERROR:", err && err.message ? err.message : String(err));
  if (err && err.stdout) {
    console.error("\n--- stdout ---\n" + err.stdout);
  }
  if (err && err.stderr) {
    console.error("\n--- stderr ---\n" + err.stderr);
  }
  process.exitCode = 1;
});
