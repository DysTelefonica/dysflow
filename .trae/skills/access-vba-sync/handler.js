"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { spawn } = require("child_process");

function uniq(arr) {
  const out = [];
  const seen = new Set();
  for (const v of arr || []) {
    const k = String(v);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function powershellExe() {
  return process.env.POWERSHELL_EXE || "powershell.exe";
}

function isAccessDbFileName(name) {
  const ext = path.extname(name).toLowerCase();
  return ext === ".accdb" || ext === ".accde" || ext === ".mdb" || ext === ".mde";
}

function isWatchedExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".bas" || ext === ".cls" || ext === ".frm";
}

function moduleNameFromFile(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

class AccessVbaSyncSkill {
  constructor(options = {}) {
    this.skillDir = options.skillDir || __dirname;
    this.projectRoot = options.projectRoot || process.cwd();
    this.destinationRoot = options.destinationRoot || "src";
    this.debounceMs = Number.isFinite(options.debounceMs) ? options.debounceMs : 600;
    this.autoExportOnEnd = options.autoExportOnEnd !== false;

    this.vbaManagerPath = path.join(this.skillDir, "VBAManager.ps1");
    this.stateDir = path.join(this.projectRoot, ".access-vba-skill");
    this.stateFile = path.join(this.stateDir, "session.json");

    this.session = {
      active: false,
      startedAt: null,
      accessPath: null,
      destinationRoot: null,
      modulesPath: null,
      changedModules: [],
      lastSyncAt: null
    };

    this.watcher = null;
    this.pendingModules = new Set();
    this.debounceTimer = null;
    this.importing = false;
    this.fileSignatures = new Map();
    this.lastImportedAtByModule = new Map();
    this.cooldownMs = Number.isFinite(options.cooldownMs) ? options.cooldownMs : 2000;
  }

  async ensureReady() {
    await fsp.mkdir(this.stateDir, { recursive: true });
    await fsp.access(this.vbaManagerPath, fs.constants.F_OK);
  }

  async loadSessionFromDisk() {
    try {
      const raw = await fsp.readFile(this.stateFile, "utf8");
      const parsed = JSON.parse(raw);
      this.session = Object.assign({}, this.session, parsed);
    } catch {
      return;
    }
  }

  async saveSessionToDisk() {
    await fsp.mkdir(this.stateDir, { recursive: true });
    await fsp.writeFile(this.stateFile, JSON.stringify(this.session, null, 2), "utf8");
  }

  async detectAccessPath({ accessPath } = {}) {
    if (accessPath) {
      const resolved = path.resolve(this.projectRoot, accessPath);
      const ext = path.extname(resolved).toLowerCase();
      if (!isAccessDbFileName(resolved)) {
        throw new Error(`--access debe ser .accdb/.accde/.mdb/.mde. Recibido: ${ext || "(sin extensión)"}`);
      }

      if (path.dirname(resolved) !== this.projectRoot) {
        throw new Error(`La BD debe estar en la raíz del proyecto (CWD). Recibido: ${resolved}`);
      }

      try {
        const st = await fsp.stat(resolved);
        if (!st.isFile()) throw new Error("no es archivo");
      } catch {
        throw new Error(`No existe el archivo indicado por --access: ${resolved}`);
      }

      return resolved;
    }

    const entries = await fsp.readdir(this.projectRoot, { withFileTypes: true });
    const candidates = entries
      .filter((e) => e.isFile() && isAccessDbFileName(e.name))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

    if (candidates.length === 0) return null;

    if (candidates.length > 1) {
      console.log("⚠️  Se encontraron varias BDs en CWD; eligiendo determinista (alfabético):");
      for (const c of candidates) console.log(`   - ${c}`);
    }

    return path.join(this.projectRoot, candidates[0]);
  }

  resolveDestinationRoot() {
    return path.resolve(this.projectRoot, this.destinationRoot);
  }

  modulesPathFor(accessPath, destinationRootAbs) {
    return destinationRootAbs;
  }

  runVbaManager({ action, accessPath, destinationRootAbs, moduleNames = [], backendPath, erdPath }) {
    return new Promise((resolve, reject) => {
      const exe = powershellExe();
      const args = [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        this.vbaManagerPath,
        "-Action",
        action,
        "-AccessPath",
        accessPath,
        "-DestinationRoot",
        destinationRootAbs
      ];

      if (backendPath) {
        args.push("-BackendPath", backendPath);
      }
      if (erdPath) {
        args.push("-ErdPath", erdPath);
      }

      if (Array.isArray(moduleNames) && moduleNames.length > 0) {
        args.push("-ModuleName", ...moduleNames);
      }

      const child = spawn(exe, args, {
        cwd: this.projectRoot,
        windowsHide: true
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      child.stderr.on("data", (d) => {
        stderr += d.toString();
      });

      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) return resolve({ code, stdout, stderr });
        const err = new Error(`VBAManager.ps1 terminó con código ${code}`);
        err.code = code;
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      });
    });
  }

  looksLikeModuleArrayNotSupported(err) {
    const stderr = String((err && err.stderr) || "");
    const stdout = String((err && err.stdout) || "");
    const t = (stderr + "\n" + stdout).toLowerCase();
    return (
      t.includes("cannot process argument transformation") ||
      t.includes("a positional parameter cannot be found") ||
      t.includes("parameterbinding")
    );
  }

  async start({ accessPath } = {}) {
    await this.ensureReady();
    await this.loadSessionFromDisk();

    const detectedAccess = await this.detectAccessPath({ accessPath });
    if (!detectedAccess) {
      throw new Error("No se encontró ninguna BD .accdb/.accde/.mdb/.mde en CWD y no se pasó --access.");
    }

    const destinationRootAbs = this.resolveDestinationRoot();
    await fsp.mkdir(destinationRootAbs, { recursive: true });
    const modulesPath = this.modulesPathFor(detectedAccess, destinationRootAbs);

    this.session.active = true;
    this.session.startedAt = new Date().toISOString();
    this.session.accessPath = detectedAccess;
    this.session.destinationRoot = destinationRootAbs;
    this.session.modulesPath = modulesPath;
    this.session.changedModules = Array.isArray(this.session.changedModules) ? this.session.changedModules : [];
    this.session.lastSyncAt = this.session.lastSyncAt || null;
    this.session.pendingModules = [];
    this.session.watcherPid = null;

    await this.saveSessionToDisk();

    console.log("🚀 Export inicial (todos los módulos)...");
    await this.runVbaManager({
      action: "Export",
      accessPath: detectedAccess,
      destinationRootAbs
    });
    console.log("✓ Export inicial completado");
    console.log(`📁 modulesPath: ${modulesPath}`);

    await this.saveSessionToDisk();
  }

  async importModules({ moduleNames, accessPath } = {}) {
    await this.ensureReady();
    await this.loadSessionFromDisk();

    if (!this.session.active) {
      await this.start({ accessPath });
      await this.loadSessionFromDisk();
    }

    const destinationRootAbs = this.session.destinationRoot || this.resolveDestinationRoot();
    const dbPath = this.session.accessPath || (await this.detectAccessPath({ accessPath }));
    if (!dbPath) throw new Error("No hay BD detectada para importar.");

    const mods = uniq((moduleNames || []).map(String).filter(Boolean));
    if (mods.length === 0) throw new Error("No se especificaron módulos para importar.");

    console.log(`🔄 Importando ${mods.length} módulo(s): ${mods.join(", ")}`);

    try {
      await this.runVbaManager({
        action: "Import",
        accessPath: dbPath,
        destinationRootAbs,
        moduleNames: mods
      });
    } catch (err) {
      if (mods.length > 1 && this.looksLikeModuleArrayNotSupported(err)) {
        for (const m of mods) {
          await this.runVbaManager({
            action: "Import",
            accessPath: dbPath,
            destinationRootAbs,
            moduleNames: [m]
          });
        }
      } else {
        throw err;
      }
    }

    const now = new Date().toISOString();
    this.session.lastSyncAt = now;
    this.session.changedModules = uniq([...(this.session.changedModules || []), ...mods]);
    this.session.pendingModules = [];
    await this.saveSessionToDisk();

    console.log("✅ Sync terminado.");
    console.log("Abre Access → VBE → Debug → Compile");
  }

  async flushPendingImports() {
    if (this.importing) return;
    const mods = uniq([...this.pendingModules]);
    if (mods.length === 0) return;

    const now = Date.now();
    const ready = [];
    const blocked = [];
    let minRemainingMs = null;

    for (const m of mods) {
      const last = this.lastImportedAtByModule.get(m) || 0;
      const elapsed = now - last;
      if (elapsed < this.cooldownMs) {
        const remaining = this.cooldownMs - elapsed;
        blocked.push(m);
        if (minRemainingMs == null || remaining < minRemainingMs) minRemainingMs = remaining;
      } else {
        ready.push(m);
      }
    }

    this.pendingModules = new Set(blocked);

    if (ready.length === 0) {
      if (minRemainingMs != null) this.scheduleDebouncedImport(Math.max(50, minRemainingMs));
      return;
    }

    this.importing = true;
    try {
      await this.importModules({ moduleNames: ready });
      const doneAt = Date.now();
      for (const m of ready) this.lastImportedAtByModule.set(m, doneAt);
    } finally {
      this.importing = false;
      if (this.pendingModules.size > 0) this.scheduleDebouncedImport();
    }
  }

  scheduleDebouncedImport(delayMs) {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.session.pendingModules = uniq([...(this.session.pendingModules || []), ...this.pendingModules]);
    this.saveSessionToDisk().catch(() => {});

    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = null;
      try {
        await this.flushPendingImports();
      } catch (err) {
        console.error("ERROR importando lote:");
        console.error(err && err.message ? err.message : String(err));
        if (err && err.stdout) console.error("\n--- stdout ---\n" + err.stdout);
        if (err && err.stderr) console.error("\n--- stderr ---\n" + err.stderr);
      }
    }, Number.isFinite(delayMs) ? delayMs : this.debounceMs);
  }

  async watch({ accessPath } = {}) {
    await this.ensureReady();
    await this.loadSessionFromDisk();

    if (!this.session.active) {
      await this.start({ accessPath });
      await this.loadSessionFromDisk();
    }

    const modulesPath = this.session.modulesPath;
    if (!modulesPath) throw new Error("No se pudo determinar modulesPath.");
    await fsp.mkdir(modulesPath, { recursive: true });

    this.session.watcherPid = process.pid;
    await this.saveSessionToDisk();

    console.log("👀 Watcher activo en:");
    console.log(`   ${modulesPath}\n`);
    console.log("   (Ctrl+C para terminar: se cerrará la sesión)\n");

    const chokidar = require("chokidar");
    this.watcher = chokidar.watch(modulesPath, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 100 }
    });

    const onTouched = (filePath) => {
      if (!isWatchedExt(filePath)) return;
      try {
        const st = fs.statSync(filePath);
        const sig = `${st.size}:${st.mtimeMs}`;
        const prev = this.fileSignatures.get(filePath);
        if (prev === sig) return;
        this.fileSignatures.set(filePath, sig);
      } catch {
        return;
      }
      const mod = moduleNameFromFile(filePath);
      if (!mod) return;
      this.pendingModules.add(mod);
      this.scheduleDebouncedImport();
    };

    this.watcher.on("add", onTouched);
    this.watcher.on("change", onTouched);
    this.watcher.on("unlink", (filePath) => {
      if (!isWatchedExt(filePath)) return;
      console.log(`⚠️  Archivo eliminado: ${path.basename(filePath)} (no se borra el módulo en Access automáticamente)`);
    });

    const shutdown = async () => {
      try {
        await this.end();
      } finally {
        process.exit(0);
      }
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }

  async stopWatching() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  async stopWatcherProcessIfDifferentPid() {
    await this.loadSessionFromDisk();
    const pid = this.session.watcherPid;
    if (!pid) return;
    if (pid === process.pid) return;

    try {
      process.kill(pid, 0);
    } catch {
      this.session.watcherPid = null;
      await this.saveSessionToDisk();
      return;
    }

    try {
      process.kill(pid, "SIGTERM");
      console.log(`🛑 Señal enviada al watcher (pid ${pid})`);
    } catch (err) {
      console.log(`⚠️  No se pudo detener el watcher (pid ${pid}): ${err && err.message ? err.message : String(err)}`);
    }
  }

  async end() {
    await this.ensureReady();
    await this.loadSessionFromDisk();

    if (!this.session.active) {
      console.log("ℹ️  No hay sesión activa.");
      return;
    }

    await this.stopWatcherProcessIfDifferentPid();
    await this.stopWatching();

    const pending = uniq([...(this.session.pendingModules || []), ...this.pendingModules]);
    this.pendingModules.clear();
    this.session.pendingModules = [];
    await this.saveSessionToDisk();

    if (pending.length > 0) {
      console.log(`🔄 Sync final de pendientes: ${pending.join(", ")}`);
      await this.importModules({ moduleNames: pending });
    }

    if (this.autoExportOnEnd) {
      console.log("📦 Export final...");
      await this.runVbaManager({
        action: "Export",
        accessPath: this.session.accessPath,
        destinationRootAbs: this.session.destinationRoot
      });
      console.log("✓ Export final completado");
    } else {
      console.log("ℹ️  Export final desactivado (auto_export_on_end=false)");
    }

    const changed = uniq(this.session.changedModules || []);
    this.session.active = false;
    this.session.watcherPid = null;
    await this.saveSessionToDisk();

    console.log("\n🏁 Sesión finalizada.");
    console.log(`   Módulos sincronizados: ${changed.length}`);
    if (changed.length > 0) console.log("   " + changed.join(", "));
  }

  async generateErd({ backendPath, erdPath } = {}) {
    await this.ensureReady();
    await this.loadSessionFromDisk();

    const destinationRootAbs = this.session.destinationRoot || this.resolveDestinationRoot();
    
    console.log("📊 Generando ERD...");
    await this.runVbaManager({
      action: "Generate-ERD",
      accessPath: "",
      destinationRootAbs,
      backendPath,
      erdPath
    });
    console.log("✅ ERD Generado.");
  }

  async status() {
    await this.ensureReady();
    await this.loadSessionFromDisk();

    if (!this.session.active) {
      console.log("ℹ️  Estado: SIN SESIÓN");
      return;
    }

    const changed = uniq(this.session.changedModules || []);
    console.log("📌 Estado de sesión:");
    console.log(`   Activa: ${this.session.active}`);
    console.log(`   Iniciada: ${this.session.startedAt}`);
    console.log(`   Access: ${this.session.accessPath}`);
    console.log(`   DestinationRoot: ${this.session.destinationRoot}`);
    console.log(`   ModulesPath: ${this.session.modulesPath}`);
    console.log(`   Último sync: ${this.session.lastSyncAt || "—"}`);
    console.log(`   Pendientes: ${uniq(this.session.pendingModules || []).length}`);
    console.log(`   Módulos tocados: ${changed.length}`);
  }
}

module.exports = { AccessVbaSyncSkill };
