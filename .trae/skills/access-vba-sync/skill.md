# Access VBA Sync — Skill Documentation

## Overview

This skill provides bidirectional synchronization between Microsoft Access VBA modules and a local `src/` directory. It enables version control, code review, and IDE-like editing workflows for Access VBA projects.

## Prerequisites

- **Microsoft Access must be CLOSED** before running Export or Import operations
- PowerShell 5.1+ (Windows)
- Node.js 18+ (for the CLI)
- Dependencies installed: `npm install` in the skill directory

## Directory Structure

```
project/
├── .trae/skills/access-vba-sync/
│   ├── cli.js          # Entry point
│   ├── handler.js      # Core logic
│   ├── VBAManager.ps1 # PowerShell automation for Access COM
│   └── package.json
├── NoConformidades.accdb        # Frontend DB (VBA modules)
├── NoConformidades_Datos.accdb # Backend DB (data tables)
├── src/                         # Exported VBA modules
│   ├── modules/    # .bas files
│   ├── classes/    # .cls files
│   └── forms/      # .form.txt + .cls files
└── ERD/           # Generated ERD documentation
```

## Commands

### 1. Start Session (Export)

Initializes a sync session and exports all VBA modules from Access to the local `src/` directory.

```bash
node .trae/skills/access-vba-sync/cli.js start --access <db_name> --destination_root src
```

**Parameters:**
- `--access` (optional): Path to .accdb/.accde/.mdb/.mde file. If omitted, auto-detects the first DB in CWD.
- `--destination_root` (optional): Destination folder (default: `src`)

**Behavior:**
- Opens Access via COM (requires Access installed)
- Exports all modules to the destination folder
- Creates session state in `.access-vba-skill/session.json`
- Generates `.form.txt` files for forms (contains control metadata)

**Example:**
```bash
node .trae/skills/access-vba-sync/cli.js start --access NoConformidades.accdb
```

### 2. Import Modules

Imports specific VBA modules from local `src/` back into the Access database.

```bash
node .trae/skills/access-vba-sync/cli.js import <ModuleName1> <ModuleName2> ... [--access <db>]
```

**Parameters:**
- `ModuleName*`: One or more module names (without extension)
- `--access` (optional): Path to Access DB

**Behavior:**
- Requires an active session (run `start` first if none exists)
- Imports each module to Access via COM
- Updates session state with changed modules
- **Important:** After import, user must open Access → VBE → Debug → Compile

**Example:**
```bash
node .trae/skills/access-vba-sync/cli.js import NCAuditoria NCProyecto
```

### 3. Watch Mode

Monitors the `src/` directory for file changes and auto-imports modified modules.

```bash
node .trae/skills/access-vba-sync/cli.js watch [--access <db>] [--destination_root src] [--debounce_ms <ms>]
```

**Parameters:**
- `--access` (optional): Path to Access DB
- `--destination_root` (optional): Folder to watch (default: `src`)
- `--debounce_ms` (optional): Debounce delay in ms (default: 600)

**Behavior:**
- Starts a session automatically if none exists
- Uses chokidar to monitor file changes
- Auto-imports modified files after debounce delay
- Handles module arrays if PowerShell doesn't support them
- **Important:** Access must remain CLOSED during watch mode

**Example:**
```bash
node .trae/skills/access-vba-sync/cli.js watch --debounce_ms 1000
```

### 4. End Session

Closes the sync session, performs final sync of pending imports, and optionally exports final state.

```bash
node .trae/skills/access-vba-sync/cli.js end
```

**Behavior:**
- Imports any pending modules
- Runs final export (to capture any changes made in Access)
- Clears session state
- Stops watcher if running

**Flags:**
- `--auto_export_on_end false`: Disable final export (not recommended)

### 5. Generate ERD

Extracts table structure from a backend Access database and generates markdown documentation.

```bash
node .trae/skills/access-vba-sync/cli.js generate-erd --backend <backend_db> --erd_path <output_folder>
```

**Parameters:**
- `--backend`: Path to the backend .accdb file (data tables)
- `--erd_path`: Output folder for ERD markdown (default: `ERD`)

**Behavior:**
- Uses DAO to read table schema
- Generates `Estructura_Datos.md` with:
  - Table names
  - Field names, types, and lengths
  - Linked table indicators

**Example:**
```bash
node .trae/skills/access-vba-sync/cli.js generate-erd --backend NoConformidades_Datos.accdb --erd_path ERD
```

### 6. Status

Shows current session status.

```bash
node .trae/skills/access-vba-sync/cli.js status
```

## Module Naming Convention

The skill uses module names without extensions:
- **Modules:** `NCAuditoria`, `NCProyecto`, `Funciones Generales`
- **Classes:** `Usuario`, `Auditoria`, `NCProyectoOperaciones`
- **Forms:** `FormNCAuditoria`, `FormNCProyectoGestion` (auto-paired with `.form.txt`)

## File Types

| Extension | Type | Description |
|-----------|------|-------------|
| `.bas` | Module | Standard VBA modules |
| `.cls` | Class | VBA class modules |
| `.form.txt` | Form Metadata | Control definitions (generated on export) |
| `.cls` (in forms/) | Form Code-behind | VBA code for form modules |

## Error Handling

### "Access is not installed"
- The skill requires Microsoft Access with VBA support
- DAO automation needs Access runtime or full installation

### "Cannot process argument transformation"
- PowerShell version issue with module arrays
- Handler retries with individual imports

### "No se encontró ninguna BD"
- No .accdb/.accde/.mdb/.mde in CWD
- Use `--access` flag to specify explicitly

### "La BD debe estar en la raíz del proyecto"
- Access DB must be in the project root (CWD), not in subdirectories

## Important Notes

1. **Always close Access before Export/Import**: COM automation requires Access to be closed
2. **Compile after Import**: Open Access → VBE → Debug → Compile to verify
3. **Password handling**: Default password is `dpddpd` (hardcoded in VBAManager.ps1)
4. **Linked tables**: ERD generation marks linked tables but doesn't follow them
5. **Transaction safety**: The skill uses DAO transactions for import safety

## Session State

State is persisted in `.access-vba-skill/session.json`:
```json
{
  "active": true,
  "startedAt": "2024-01-01T00:00:00.000Z",
  "accessPath": "C:/path/to/project/NoConformidades.accdb",
  "destinationRoot": "C:/path/to/project/src",
  "modulesPath": "C:/path/to/project/src",
  "changedModules": ["NCAuditoria", "NCProyecto"],
  "lastSyncAt": "2024-01-01T01:00:00.000Z"
}
```

## Workflow Example

```bash
# 1. Initial export (get code from Access)
node .trae/skills/access-vba-sync/cli.js start --access NoConformidades.accdb

# 2. Edit files in src/ (your IDE)

# 3. Import changes back to Access
node .trae/skills/access-vba-sync/cli.js import NCAuditoria

# 4. Generate ERD from backend
node .trae/skills/access-vba-sync/cli.js generate-erd --backend NoConformidades_Datos.accdb

# 5. Close session
node .trae/skills/access-vba-sync/cli.js end
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Export fails with "Access busy" | Ensure Access is fully closed, not minimized |
| Import doesn't appear in VBE | Run Debug → Compile in Access VBE |
| Watch doesn't detect changes | Check file extension (.bas, .cls, .frm) |
| ERD missing tables | Backend DB may have password protection |
