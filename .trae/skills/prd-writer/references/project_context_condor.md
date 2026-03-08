# project_context.md — Proyecto CONDOR

> **Propósito**: Este archivo provee el vocabulario concreto del proyecto CONDOR a la IA que genera PRDs.
> La IA debe leer SIEMPRE este archivo junto con `references/prd_template.md` antes de escribir cualquier PRD.
> La plantilla dice *cómo* estructurarlo. Este archivo dice *con qué* hacerlo.

---

## 1. Identificación del proyecto

| Campo | Valor |
| :--- | :--- |
| Nombre del proyecto | CONDOR |
| Tipo de aplicación | VBA/Access |
| Versión de Access | Access 365 (Telefónica) |
| Entorno de despliegue | Red corporativa Telefónica |
| Ruta raíz del repositorio | Repositorio exportado con estructura `src/` / `docs/` |

---

## 2. Estructura de carpetas del proyecto

```
src/
  classes/         ← Clases VBA (.cls)
  modules/         ← Módulos VBA (.bas)
  forms/           ← Formularios exportados (.form.txt)
docs/
  PRD/             ← PRDs del proyecto (ej: 16_Workflow_Validacion_RAC.md)
  sdd/             ← Protocolo SDD y specs
  DISCOVERY_MAP.md ← Mapa físico→lógico del proyecto
  DEUDA_TECNICA.md ← Consolidado de deuda técnica
references/
  prd_template.md        ← Plantilla genérica VBA/Access
  project_context.md     ← Este archivo
```

---

## 3. Convenciones de nomenclatura

### Módulos y clases
```
- Repositorios:  [Entidad]Repositorio.bas      → ValidacionRevisionRepositorio.bas
- Servicios:     [Entidad]Servicio.bas          → WorkflowServicio.bas
- Helpers:       [Nombre]Helper.bas             → SnapshotHelper.bas, HashHelper.bas
- Formularios:   Form_frm[Nombre].form.txt      → Form_frmGestionSolicitud.form.txt
- Subformularios:Form_sfrm[Nombre].form.txt     → Form_subfrmDatosPC_Propuesta.form.txt
- Clases DTO:    C[Entidad].cls                 → CSolicitud.cls
```

### Tablas de base de datos
```
- Tablas de datos:     tb[Entidad]         → tbSolicitudes, tbValidacionRevision, tbDatosPC
- Tablas de log:       tbLog[Tipo]         → tbLogErrores
- Tablas de config:    tbCfg[Nombre]       → tbCfgFases
```

### IDs de módulos PRD
```
IDs numéricos secuenciales asignados en DISCOVERY_MAP.md.
Ejemplo: módulo 16 = Workflow Validación RAC → archivo: 16_Workflow_Validacion_RAC.md
```

### Nomenclatura de PRDs
```
Título:   # 📑 PR-{ID}: {Descripción} ({fecha YYYY-MM-DD})
Archivo:  docs/PRD/{ID}_{Nombre_Modulo}.md
```

---

## 4. Patrones de arquitectura del proyecto

### Capas de la aplicación
```
UI          → Formularios Access (Form_frm*.form.txt)
Servicios   → Módulos .bas con lógica de negocio (WorkflowServicio, etc.)
Repositorios→ Módulos .bas con acceso a datos DAO ([Entidad]Repositorio.bas)
Helpers     → Módulos .bas de utilidades (HashHelper, SnapshotHelper)
DTOs        → Clases .cls para transferencia de datos (C[Entidad].cls)
```

### Patrón de error handling
```
- Errores de negocio/bloqueo: Err.Raise [número] con mensaje descriptivo (ver sección 6)
- Captura en formulario: Select Case Err.Number → MsgBox específico por código
- Errores no esperados: ManejadorErroresFormulario → LogErrorUI → tbLogErrores
- Rollback: siempre en el servicio (WorkflowServicio), nunca en el repositorio
- Relanzado: CondorError encapsula errores para propagación
```

### Patrón de transacciones DAO
```vba
Dim ws As DAO.Workspace
Dim db As DAO.Database
Set ws = DBEngine.Workspaces(0)
Set db = ws.OpenDatabase(CurrentDb.Name)
ws.BeginTrans
    ' operaciones atómicas aquí
ws.CommitTrans
' En error:
ws.Rollback
LogErrorUI "NombreMetodo", Err.Number, Err.Description
```

### Propagación de `db`
```
db se abre en el servicio (WorkflowServicio) y se pasa como ByRef a los repositorios.
Los formularios no abren conexiones directamente.
Firma estándar del parámetro: Optional ByRef db As DAO.Database
```

### Patrón de comunicación UI → Servicio (Form_Timer)
```
Los botones HTML del Timeline no invocan VBA directamente.
Patrón: onclick="window.colaComandos = 'COMANDO:param';"
Form_frmGestionSolicitud.Form_Timer recupera el comando → EjecutarAccionPendiente → Servicio.Metodo
```

---

## 5. Módulos de infraestructura compartidos

### Error handling
```
- `LogErrorUI(ByVal origen As String, ByVal numError As Long, ByVal desc As String)` (módulo `src/modules/ErrorHelper.bas`)
- `ManejadorErroresFormulario(ByVal form As String, ByVal numError As Long)` (módulo `src/modules/ErrorHelper.bas`)
- `CondorError`: clase para encapsular y relanzar errores con contexto adicional
```

### Hash / Snapshot
```
- `HashHelper.CalcularSHA256(ByVal texto As String) → String` (módulo `src/modules/HashHelper.bas`)
  SHA-256 vía CryptoAPI (advapi32.dll). Retorna hex minúsculas, 64 chars. Vacío → "".
  Codificación: StrConv(texto, vbFromUnicode) (ANSI/ACP Windows).

- `SnapshotHelper.CalcularHashFaseValidacion(ByVal idSolicitud As Long, ByVal tipoSolicitud As String) → String`
  (módulo `src/modules/SnapshotHelper.bas`)
- `SnapshotHelper.CalcularHashFaseRevision(ByVal idSolicitud As Long, ByVal tipoSolicitud As String) → String`
  (módulo `src/modules/SnapshotHelper.bas`)

Serialización estándar:
- Separador: , (coma sin espacios). Nombres de campo: LCase.
- Nulos: Nz(..., "") → cadena vacía. Strings: entrecomillados. Numéricos: sin comillas. Boolean: true/false.
```

### Generación de documentos Word
```
- `DocumentoServicio.GenerarDocumentoParaSolicitud(ByVal idSolicitud As Long) → String`
  (módulo `src/modules/DocumentoServicio.bas`)
  Retorna ruta del documento generado o lanza error.
```

### Tabla de log de errores
```
tbLogErrores:
  Id           Long      PK
  FechaHora    Date/Time No  Now()
  Origen       Text(255) No  —
  NumError     Long      No  —
  Descripcion  Memo      Sí  Null
```

---

## 6. Rangos de números de error personalizados

```
513      : Error de generación de documento Word
600      : Bloqueo por hash idéntico (sin cambios detectados)
601      : Ciclo ya cerrado / transición ilegal
3021     : No se encontró registro (DAO nativo)
3211     : Tabla bloqueada por otro proceso (DAO nativo)
```

---

## 7. Convenciones de UX del proyecto

### Íconos MsgBox estándar
```
Éxito:       vbInformation
Warning:     vbExclamation
Error:       vbCritical
Confirmación: vbYesNo + vbQuestion
```

### Prefijos de códigos de mensaje
```
MSG-{NN} secuencial por PRD. Ejemplo: MSG-001, MSG-002 en el PRD-16.
```

### Formulario principal de navegación
```
Form_frmGestionSolicitud: formulario raíz. Contiene el Timeline HTML embebido
y el Form_Timer que procesa la cola de comandos.
```

---

## 8. Archivo DISCOVERY_MAP

```
Ubicación: docs/DISCOVERY_MAP.md
Sección 2: Inventario de módulos (ID, nombre, tipo, archivo principal)
Sección 3: Physical to Logical Map (archivo .cls/.bas/.form.txt → módulo PRD + rol arquitectónico)

Roles arquitectónicos usados: DTO, Service, Repository, Helper, ViewModel, UI
```

---

## 9. Archivo de Deuda Técnica consolidada

```
Ubicación: docs/DEUDA_TECNICA.md
ID de entradas: DT-{idPRD}-{secuencial}  →  DT-16-001
Tras escribir cualquier PRD, copiar las entradas nuevas de la Sección 13 a este archivo.
Al cerrar una Spec que resuelve un hallazgo: actualizar estado a "Resuelto: Spec-XXX".
```

---

## 10. Notas específicas del proyecto

```
- Los formularios principales usan Form_Timer + window.colaComandos para comunicarse
  con el HTML embebido (Timeline). No invocar servicios directamente desde onclick HTML.

- No usar CurrentDb() directamente en servicios/repositorios.
  Siempre abrir con: ws.OpenDatabase(CurrentDb.Name) y propagar db.

- Los nombres de campos en BD están en camelCase (idSolicitud, fechaCreacion).
  Los controles de formulario usan notación húngara (txt, cmd, cmb, chk, lbl).

- El tipo "Solicitud" tiene variantes (tipoSolicitud): impacta qué campos entran
  en el snapshot hash. Siempre verificar en SnapshotHelper qué variante se usa.

- tbDatosPC contiene los campos de Propuesta de Cambio. Es la tabla más referenciada
  en los hashes de Validación/Revisión. Cualquier campo nuevo en tbDatosPC puede
  invalidar hashes históricos si se añade a la serialización.

- Los PRDs se numeran con el ID del módulo en DISCOVERY_MAP, no secuencialmente por fecha.
```
