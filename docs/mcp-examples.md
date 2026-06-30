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
