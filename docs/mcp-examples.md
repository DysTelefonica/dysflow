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
*   **Notes**: `moduleNames` is a true focused export request: Dysflow asks Access to export only the requested modules, then compares only those modules against disk. It is not a whole-project export with a filtered compare. Omit `moduleNames` for a whole-project verify; an explicit empty `moduleNames: []` is rejected with `INVALID_INPUT` so a focused call cannot silently widen to the whole project. If preflight, export, or compare stalls, the failure is typed before the outer MCP timeout: export timeouts use `VBA_MANAGER_TIMEOUT`, preflight/compare timeouts use `VERIFY_CODE_PHASE_TIMEOUT`, and `error.details` identifies `phase`, `moduleName`/`moduleNames`, `operationTimeoutMs`, and `phaseTimeoutMs`. Export-phase errors additionally include `error.details.durationMs` (how long PowerShell ran before stalling). Cleanup after a timeout is bounded; if the post-timeout Access orphan cleanup itself exceeds its bound, the parent export error additionally sets `error.details.cleanupTimedOut: true` and `error.details.cleanupTimeoutMs`, and a warning diagnostic is returned instead of the request waiting indefinitely.
*   **How to read results**: use `summaryStructured` for counts, not ad-hoc counting. Use `bulkImportable` directly as `import_modules.moduleNames` and `bulkExportable` directly as `export_modules.moduleNames`. Read `nonActionableDifferent[].classification` and `.reason` to explain noise (`whitespaceOnly`, `attributeOnly`, `caseOnly`, `formSerializationOnly`, `encodingOnly`) without syncing it. Treat `bothChanged` / `manual_merge` as conflicts for human resolution.
*   **Verification note**: Unit coverage proves this at the PowerShell boundary by asserting that focused `verify_code` requests carry `moduleNamesProvided: true` and that `spawnVbaManager` emits `-ModuleNamesJson`. A real Access COM fixture such as `VBA_TOOLKIT_BENCH` is still the preferred final smoke when available, but it is not required for these fast unit examples.

#### Round 5 / PR5 — `verify_code` returns `bulkImportable` for a drop-in `import_modules` call (v2.4.0+)

Round 5 (PR5, v2.4.0) makes `verify_code` carry the consumer-ready lists
for `import_modules` / `export_modules` directly in the response, so
callers do not have to re-filter `actionableDifferent` themselves.

*   **Step 1 — `verify_code` (semantic mode, no `strict:true`)**:
    ```json
    {
      "projectId": "my-project"
    }
    ```
    Response shape (excerpt — full payload also includes `summary`,
    `actionableDifferent`, `missingInSource` / `missingInBinary`, etc.):
    ```json
    {
      "ok": true,
      "summary": {
        "sourceNewer": 3,
        "binaryNewer": 1,
        "bothChanged": 0,
        "formSerializationOnly": 12
      },
      "summaryStructured": {
        "matched": 228,
        "different": 16,
        "missingInSource": 0,
        "missingInBinary": 1,
        "actionable":   { "sourceNewer": 3, "binaryNewer": 1, "bothChanged": 0, "total": 4 },
        "nonActionable":{ "caseOnly": 0, "whitespaceOnly": 0, "attributeOnly": 0, "formSerializationOnly": 12, "encodingOnly": 0, "total": 12 }
      },
      "bulkImportable": ["Form_Customer", "Modulo_Logger", "Utils_Helpers"],
      "bulkImportableCount": 3,
      "bulkExportable": ["Form_OldLegacy"],
      "bulkExportableCount": 1,
      "recommendedAction": "import_to_binary"
    }
    ```

*   **Step 2 — `import_modules` (write-gated, save-only persistence)**.
    Pass `bulkImportable` straight in — it is pre-sorted lexicographically
    and deduped. `bothChanged` modules are excluded; if any are present
    they ride in `recommendedAction: "manual_merge"` and need human review.
    ```json
    {
      "projectId": "my-project",
      "moduleNames": ["Form_Customer", "Modulo_Logger", "Utils_Helpers"],
      "importMode": "auto"
    }
    ```
*   **Notes**:
    *   `bulkImportable = sourceNewer moduleNames ∪ missingInBinary moduleNames`; `bulkExportable = binaryNewer moduleNames ∪ missingInSource moduleNames`.
    *   `bothChanged` modules are EXCLUDED from both lists — they still need a manual merge, surfaced by `recommendedAction: "manual_merge"`.
    *   Strict mode (`strict:true`) returns none of the four new fields; the schema-level input contract is unchanged.
    *   Persist via save-only (`acCmdSaveAllModules` = RunCommand 280). The human compiles in Access (Debug > Compile) after the import.

---

### 2. Sizing and Sourcing Code (Write-gated)

#### Import Specific Modified Modules (save-only persistence)
*   **Tool**: `import_modules`
*   **Arguments**:
    ```json
    {
      "projectId": "my-project",
      "moduleNames": ["Funciones_Generales"],
      "importMode": "auto"
    }
    ```
*   The runtime persists via save-only (acCmdSaveAllModules = RunCommand 280). The human
    compiles in Access (Debug > Compile) after the import.

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
*   **Tool**: `query_execute`
*   **Arguments**:
    ```json
    {
      "projectId": "my-project",
      "sql": "SELECT TOP 10 ID, Nombre FROM Clientes WHERE Activo = -1",
      "mode": "read"
    }
    ```

#### Apply a Database Write Query (Update/Insert)
*   **Tool**: `query_execute`
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
*   **Tool**: `form_serialize`
*   **Arguments**:
    ```json
    {
      "sourcePath": "forms/Form_Customer.form.txt",
      "formName": "Form_Customer"
    }
    ```
*   **Notes**: Returns `{ serialized, byteEqual, byteDiff, metadataReport: { preservedKeys, byteDiff, opaqueCount } }`. Read-only — `apply` is ignored, the binary is never opened, and writes are off by default. Use this to verify that a form has round-trip-safe serialization before any mutation or clone attempt.

#### Write a `FormIR` Back to `.form.txt` Through the LoadFromText Gate (Write-gated, slice 3)
*   **Tool**: `form_deserialize`
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
*   **Tool**: `cleanup_access_operation`
*   **Arguments**:
    ```json
    {
      "operationId": "op_123abc456def"
    }
    ```

#### Terminate a Stuck/Locked Access Instance (Write-gated)
*   **Tool**: `cleanup_access_operation`
*   **Arguments**:
    ```json
    {
      "operationId": "op_123abc456def",
      "force": true
    }
    ```

#### List Orphan Headless MSACCESS Processes Holding Database Locks
*   **Tool**: `access_force_cleanup_orphaned`
*   **Arguments**:
    ```json
    {}
    ```

#### Kill a Specific Orphaned Process by PID (Write-gated)
*   **Tool**: `access_force_cleanup_orphaned`
*   **Arguments**:
    ```json
    {
      "confirmPid": 4321
    }
    ```

---

### 7. Dead-Code Analysis (Read-only, #705)

#### Detect Dead Code Across Inline Modules
*   **Tool**: `detect_dead_code`
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
*   **Tool**: `detect_dead_code`
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

---

### 8. AI Form UI Builder

#### Analyze a Form UI (Read-only)
*   **Tool**: `analyze_form_ui`
*   **Arguments**:
    ```json
    {
      "sourcePath": "forms/Form_Customer.form.txt"
    }
    ```

#### Map Behavior with Caller-Supplied CodeGraph Evidence
*   **Tool**: `map_form_behavior`
*   **Arguments**:
    ```json
    {
      "sourcePath": "forms/Form_Customer.form.txt",
      "codegraphEvidence": [
        {
          "handler": "cmdSave_Click",
          "callPath": ["cmdSave_Click", "SaveCustomer"],
          "tables": ["Customers"]
        }
      ]
    }
    ```
*   **Notes**: First iteration boundary: callers provide CodeGraph-VBA evidence payloads. Dysflow does not perform direct MCP-to-MCP invocation. The `codegraphEvidence` array is now optional — you can also call `map_form_behavior` with just `sourcePath` to get the `.form.txt`-only behavior (a "No CodeGraph-VBA evidence was supplied" warning is appended). For the issue #830 opt-in path that invokes codegraph-vba internally, see the next example.

#### Map Behavior with Internal CodeGraph-VBA Fetch (issue #830 opt-in)
*   **Tool**: `map_form_behavior`
*   **Arguments**:
    ```json
    {
      "sourcePath": "forms/Form_Customer.form.txt",
      "autoFetchCodeGraph": true
    }
    ```
*   **Notes**: Pass `autoFetchCodeGraph: true` to relax the no-MCP-to-MCP boundary one-way (dysflow → codegraph-vba). The adapter probes `<project>/.codegraph-vba/` first (fork), then `<project>/.codegraph/` (upstream), and returns the selected absolute directory as `codegraphIndexPath` (`null` when no index was used). It fetches call-path evidence for the form's mapped controls and merges the result with any caller-supplied `codegraphEvidence`. On any invoker failure, the adapter falls back to the `.form.txt`-declared events alone and appends a warning — never throws. Boundary direction: dysflow → codegraph-vba only. The reverse direction (codegraph-vba calling dysflow) is NOT supported.

#### Preview and Verify a Design Plan
*   **Tool**: `apply_form_design_plan`
*   **Arguments**:
    ```json
    {
      "plan": {
        "formName": "Customer",
        "sourceContract": {
          "formName": "Customer",
          "controls": [],
          "formEvents": [],
          "unmappedEvidence": [],
          "warnings": []
        },
        "operations": [],
        "warnings": []
      },
      "dryRun": true
    }
    ```

---

### 7. Import Modules — Verify Functional Control Properties

See [`assets/examples/import-modules.md`](../assets/examples/import-modules.md) for the post-import `verify_code` pattern and the curated ComboBox/ListBox property allow-list. `actionableDifferent` entries with `category: "control-property-mismatch"` identify a control-property value that was not preserved by the binary round-trip.
