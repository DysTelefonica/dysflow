# MCP Real-World Examples Reference

This document contains copy-pasteable, concrete JSON payloads for typical Dysflow MCP operations. Use this reference when you have doubts about how to construct tool calls.

---

### 1. Compare Disk Source vs Access Database (Dry-run/Read-only)

#### Verify the Entire Project (replaces legacy `verify_binary`)
*   **Tool**: `verify_code`
*   **Arguments**:
    ```json
    {
      "projectId": "my-project",
      "diff": true
    }
    ```

#### Verify Specific Modules (replaces legacy `compare_module`)
*   **Tool**: `verify_code`
*   **Arguments**:
    ```json
    {
      "projectId": "my-project",
      "moduleNames": ["Form_Main", "Funciones_Generales"],
      "diff": true
    }
    ```

---

### 2. Sizing and Sourcing Code (Write-gated)

#### Import Specific Modified Modules and Compile Immediately
*   **Tool**: `import_modules`
*   **Arguments**:
    ```json
    {
      "projectId": "my-project",
      "moduleNames": ["Funciones_Generales"],
      "importMode": "auto",
      "compile": true
    }
    ```

#### Mirror Access Binary to Disk (Pruning Deleted Modules)
*   **Tool**: `export_all`
*   **Arguments**:
    ```json
    {
      "projectId": "my-project",
      "prune": true
    }
    ```

---

### 3. Executing SQL & Scripts

#### Run a Read-only Select Query
*   **Tool**: `dysflow_query_execute`
*   **Arguments**:
    ```json
    {
      "projectId": "my-project",
      "sql": "SELECT TOP 10 ID, Nombre FROM Clientes WHERE Activo = -1",
      "mode": "read"
    }
    ```

#### Apply a Database Write Query (Update/Insert)
*   **Tool**: `dysflow_query_execute`
*   **Arguments**:
    ```json
    {
      "projectId": "my-project",
      "sql": "UPDATE Clientes SET Activo = -1 WHERE ID = 42",
      "mode": "write",
      "apply": true
    }
    ```

#### Run a Local SQL Script
*   **Tool**: `run_script`
*   **Arguments**:
    ```json
    {
      "projectId": "my-project",
      "scriptPath": "C:/Proyectos/dysflow/db/migrations/01_update_schema.sql",
      "apply": true
    }
    ```

---

### 4. Running VBA Functions & Tests

#### Call a Public Sub/Function with Arguments
*   **Tool**: `dysflow_vba_execute`
*   **Arguments**:
    ```json
    {
      "projectId": "my-project",
      "procedureName": "RegistrarLog",
      "moduleName": "Modulo_Logger",
      "arguments": ["Info", "Proceso completado exitosamente"]
    }
    ```

#### Run Specific Test Procedures
*   **Tool**: `test_vba`
*   **Arguments**:
    ```json
    {
      "projectId": "my-project",
      "proceduresJson": "[\"Test_Calculo_Descuento\", \"Test_Calculo_Impuesto\"]"
    }
    ```

---

### 5. GUI & Access Forms (Offline)

#### Parse Form Layout Tree
*   **Tool**: `inspect_form`
*   **Arguments**:
    ```json
    {
      "sourcePath": "forms/Form_Main.form.txt"
    }
    ```

#### Lint Form Code-behind vs Layout
*   **Tool**: `lint_form_code`
*   **Arguments**:
    ```json
    {
      "moduleNames": ["Main"],
      "strict": true
    }
    ```

#### Round-trip Serialize a `.form.txt` (Read-only, slice 3)
*   **Tool**: `dysflow_form_serialize`
*   **Arguments**:
    ```json
    {
      "sourcePath": "forms/Form_Customer.form.txt",
      "formName": "Form_Customer"
    }
    ```
*   **Notes**: Returns `{ serialized, byteEqual, byteDiff, metadataReport: { preservedKeys, byteDiff, opaqueCount } }`. Read-only — `apply` is ignored, the binary is never opened, and writes are off by default. Use this to verify that a form has round-trip-safe serialization before any mutation or clone attempt.

#### Write a `FormIR` Back to `.form.txt` Through the LoadFromText Gate (Write-gated, slice 3)
*   **Tool**: `dysflow_form_deserialize`
*   **Arguments**:
    ```json
    {
      "sourcePath": "forms/Form_Customer.form.txt",
      "formName": "Form_Customer",
      "ir": {
        "name": "Form_Customer",
        "kind": "Form",
        "preamble": [],
        "root": { "blockType": "Form", "entries": [], "children": [] },
        "codeBehind": null
      },
      "dryRun": true
    }
    ```
*   **Notes**: `dryRun:true` returns `{ mode: "dry-run", written: false, preview, ... }` and never writes. `apply:true` re-serializes the IR, writes the `.form.txt`, and invokes `import_modules` (the canonical `LoadFromText` gate). On gate failure the original source is restored best-effort, mirroring the slice-4 mutation pattern.

---

### 6. Cycle & Diagnostics

#### Reconcile Operations Registry and Clean Stale PIDs
*   **Tool**: `dysflow_access_cleanup`
*   **Arguments**:
    ```json
    {
      "operationId": "op_123abc456def"
    }
    ```

#### Terminate a Stuck/Locked Access Instance (Write-gated)
*   **Tool**: `dysflow_access_cleanup`
*   **Arguments**:
    ```json
    {
      "operationId": "op_123abc456def",
      "force": true
    }
    ```

#### List Orphan Headless MSACCESS Processes Holding Database Locks
*   **Tool**: `dysflow_access_force_cleanup_orphaned`
*   **Arguments**:
    ```json
    {}
    ```

#### Kill a Specific Orphaned Process by PID (Write-gated)
*   **Tool**: `dysflow_access_force_cleanup_orphaned`
*   **Arguments**:
    ```json
    {
      "confirmPid": 4321
    }
    ```

---

### 7. Dead-Code Analysis (Read-only, #705)

#### Detect Dead Code Across Inline Modules
*   **Tool**: `dysflow_detect_dead_code`
*   **Arguments**:
    ```json
    {
      "scope": "binary",
      "modules": {
        "ModA": "Option Explicit\r\nPublic Sub UnusedProc()\r\nEnd Sub\r\n",
        "ModB": "Option Explicit\r\nPublic Sub Caller()\r\n    Application.Run \"UnusedProc\"\r\nEnd Sub\r\n"
      }
    }
    ```
*   **Notes**: The tool performs a pure string-in / string-out analysis over the supplied `modules` map. It never opens Access, never spawns PowerShell, and never mutates the filesystem. The handler runs in both write-enabled and write-disabled mode (the tool itself is `read-only / writeGate: none`). A successful response shape:

    ```json
    {
      "scope": "binary",
      "scannedModules": ["ModA", "ModB"],
      "scannedAt": "2026-07-04T19:30:00.000Z",
      "findings": [
        {
          "symbol": "UnusedProc",
          "module": "ModA",
          "kind": "sub",
          "line": 2,
          "evidence": {
            "scannedModules": ["ModA", "ModB"],
            "referenceCount": 0,
            "definitionSnippet": "Public Sub UnusedProc()"
          },
          "risk": "Low"
        }
      ],
      "summary": { "total": 1, "low": 1, "med": 0, "high": 0 }
    }
    ```

#### Restrict Detection to a Single Module
*   **Tool**: `dysflow_detect_dead_code`
*   **Arguments**:
    ```json
    {
      "scope": "module",
      "module": "ModB",
      "modules": {
        "ModA": "Option Explicit\r\nPublic Sub UnusedA()\r\nEnd Sub\r\n",
        "ModB": "Option Explicit\r\nPublic Sub UnusedB()\r\nEnd Sub\r\n"
      }
    }
    ```
*   **Notes**: `scope: "module"` echoes the narrowing back on the report and `module: "ModB"` restricts the analysis to that module only. The risk of every surviving finding is elevated to `Med` for private procedures (a narrowed scan can hide references that live outside the chosen module). Access lifecycle and control-event names (`AutoExec`, `Form_Load`, `cmdSave_Click`, …) are filtered out via `EXCLUDED_NAME_PATTERNS` and never appear as findings.
