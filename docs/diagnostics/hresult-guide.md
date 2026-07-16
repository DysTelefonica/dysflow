# Microsoft Access VBA HRESULT Reference Guide

This guide documents common HRESULT error codes encountered during MS Access VBA synchronization, compilation, or execution operations, along with remediation steps.

---

## 1. HRESULT: `0x800ADEB9` (or `-2146824519`)

### Description
* **English:** Access object cannot be deleted or modified.
* **Spanish:** No se puede eliminar/modificar el objeto de Access.

### Common Causes
This error usually occurs when the Access database engine prevents modification or deletion of an object (Form, Report, Module, or Class) due to a lock or open designer:
1. The target object (form, report, or module) is currently open in **Design View** or active in a user session.
2. The **VBA Editor (VBE)** window is active and has a lock on the project or module.
3. The database is in an inconsistent state and requires a **Compact & Repair** operation to clear internal object locks.
4. Another process holds a lock on the `.accdb` file.

### Remediation Steps
* **Close Active Designers:** Ensure the object is not open in Design View within Access.
* **Close the VBA Editor:** Close the VBA Editor window (VBE) and restart the sync operation.
* **Compact & Repair:** Run the "Compact and Repair Database" utility in MS Access, or invoke it programmatically via `compact_repair` tool.
* **Process Cleanup:** Run `list_access_operations`, then reconcile tracked stale operations with
  `cleanup_access_operation`. For a verified headless orphan, use
  `access_force_cleanup_orphaned` with the exact confirmed PID. Never kill `MSACCESS.EXE` by
  process name.

---

## 2. HRESULT: `0x800A09D5` (or `-2146823723`)

### Description
* **English:** Name conflicts with an existing module, project, or object library.
* **Spanish:** El nombre entra en conflicto con un módulo, proyecto o biblioteca de objetos existente.

### Common Causes
This error occurs during imports or creation of new modules when there is a name collision:
1. **Case-Insensitive Identifier Collision:** Access is case-insensitive for identifiers. Trying to import `MyModule` when `mymodule` or `MYMODULE` already exists (or is used as a table, query, form, or global variable name) triggers this conflict.
2. **Library reference name overlap:** The proposed module name conflicts with a name inside an active Object Library reference (e.g. `DAO`, `Access`, `VBA`).
3. **Ghost module/class records:** Occasionally, Access fails to clean up references to a deleted component. A database compact & repair will clear these references.

### Remediation Steps
* **Rename Module:** Choose a unique module name that does not conflict with existing database objects, query names, tables, or libraries.
* **Verify Case Parity:** Check existing modules and global variables to ensure you aren't adding a duplicate name with different casing.
* **Run Compact & Repair:** If the module has just been deleted and import still fails with this error, compact and repair the database to flush the VBE name cache.
