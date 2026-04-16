# Spec-003: Cache de Listados (Lógica de Caché)

**Estado:** 🔵 ABIERTA
**Prioridad:** Alta
**Tipo:** Nueva Funcionalidad
**Módulos PRD afectados:** PRD-01_NC_Proyectos
**Spec padre:** —
**Specs relacionadas:** Spec-00c, Spec-005
**RFC origen:** RFC-001
**Plan origen:** PLAN-002 (T-03)
**Fecha de creación:** 2026-03-16
**Fecha límite:** Sin límite
**Cierre:** Pendiente

---

## 1. Resumen Técnico

- **Problema / Necesidad:** FormNCProyectoGestion tarda mucho en cargar y filtrar NCs.
- **Causa raíz:** Filtrado en memoria sobre colección completa de objetos.
- **Solución propuesta:**
  - Implementar lógica de caché con campos aplanados (un registro por NC)
  - Filtrado mediante **consultas SQL directas** sobre la tabla de caché
  - **Invalidación transaccional**: si falla caché, rollback total del CRUD
- **Dependencias:** Spec-00c (migración de esquema)

---

## 2. Historia de Usuario

> Como sistema, quiero almacenar cada NC con campos aplanados en una tabla de caché para que FormNCProyectoGestion pueda filtrar directamente con SQL y el rendimiento sea óptimo.

---

## 3. Análisis de Impacto

### 3.1 Módulos afectados

| PRD | Módulo / Clase | Tipo de impacto | Notas |
| :--- | :--- | :--- | :--- |
| PRD-01_NC_Proyectos | CacheNCProyecto.bas | Extender | Métodos para listados con SQL |
| PRD-01_NC_Proyectos | constructor.bas | Modificar | GetListadoFiltradoSQL |

### 3.2 Archivos a modificar

| Archivo | Tipo de cambio | Descripción del cambio |
| :--- | :--- | :--- |
| `src/modules/CacheNCProyecto.bas` | Nuevos métodos | RegenerarRegistro, FiltrarConSQL, InvalidarRegistro, RebuildCompleto |
| `src/modules/constructor.bas` | Modificar | GetListadoFiltradoSQL usa caché |

### 3.3 Tablas / Entidades de datos afectadas

| Tabla | Cambio | Detalle |
| :--- | :--- | :--- |
| TbCacheListadoNC | Usar estructura de Spec-00c | Un registro por NC con campos aplanados |

> **Nota:** El esquema de TbCacheListadoNC está definido en Spec-00c. Esta spec asume que la tabla ya existe.

---

## 4. Diseño de la Solución

### 4.1 Invariante de Caché

**La fuente de verdad es TbNoConformidades. La tabla de caché debe contener exactamente los mismos IDNoConformidad.**

```
Invariante: IDs en TbNoConformidades = IDs en TbCacheListadoNC
```

### 4.2 Métodos a implementar

| Método | Descripción |
| :--- | :--- |
| `SincronizarCache()` | Compara IDs entre fuente y caché, inserta faltantes, elimina sobrantes |
| `RegenerarRegistro(idNC)` | DELETE + INSERT para una NC específica |
| `GetListadoFiltradoSQL(filtros)` | Sincroniza + SELECT con filtros SQL |
| `RebuildCompleto()` | DELETE FROM TbCacheListadoNC + INSERT de todas las NCs |
| `ObtenerTodos()` | SELECT * FROM TbCacheListadoNC |

### 4.3 Flujo de Sincronización

```
GetListadoFiltradoSQL(filtros)
  │
  └─► SincronizarCache()
        │
        ├─ IDs_Fuente = SELECT IDNoConformidad FROM TbNoConformidades
        ├─ IDs_Cache = SELECT IDNoConformidad FROM TbCacheListadoNC
        │
        ├─ Faltan = IDs_Fuente - IDs_Cache
        │   └─ Para cada ID que falta → RegenerarRegistro(ID)
        │
        └─ Sobran = IDs_Cache - IDs_Fuente
            └─ Para cada ID que sobra → DELETE WHERE IDNoConformidad = ID

  └─► SELECT * FROM TbCacheListadoNC WHERE 1=1 [filtros]
```

### 4.4 Filtros SQL soportados

| Campo formulario | Campo tabla caché | Tipo filtro |
| :--- | :--- | :--- |
| ComboCodigo | CodigoNoConformidad | = (exacta) |
| IDExpediente | IDExpediente | = (exacta) |
| ComboJuridica | — | NO | Eliminado por cambio de req. |
| ComboTipo | IDTipo | = (exacta) |
| EstadoNC | Estado | = (exacta) |
| Descripcion | Descripcion | LIKE (contains) |
| Notas | Notas | LIKE (contains) |
| ComboRequiereControlEficacia | RequiereControlEficacia | = (exacta) |
| ComboControlEficaciaRelleno | ControlEficacia | = (vacío/no vacío) |
| RESPONSABLECALIDAD | RESPONSABLECALIDAD | = (exacta) |
| ComboRegistrosCerrados | FechaCierre | IS NULL / IS NOT NULL |
| ResponsableTelefonica | ResponsableTelefonica | = (exacta) |
| Google | (Descripcion + Notas) | LIKE (contains) |

### 4.5 Transaccionalidad CRUD

| Evento | Acción |
|--------|--------|
| CREATE/UPDATE/DELETE en NC | Transacción: CRUD + RegenerarRegistro(idNC) |
| Fallo en RegenerarRegistro | Rollback total del CRUD |

### 4.6 Botón "Actualizar" en FormGestion

```vba
Private Sub btnActualizarListado_Click()
    Cache.RebuildCompleto  ' DELETE + rebuild completo
    Me.Requery
End Sub
```

---

## 5. Criterios de Aceptación

- [ ] SincronizarCache() inserta registros faltantes y elimina sobrantes
- [ ] GetListadoFiltradoSQL(filtros) sincroniza antes de filtrar
- [ ] RegenerarRegistro(idNC) ejecuta DELETE + INSERT en misma transacción
- [ ] RebuildCompleto() borra todos y regenera desde cero
- [ ] Si falla RegenerarRegistro → rollback del CRUD
- [ ] Filtrado mediante SQL sobre TbCacheListadoNC (no en memoria)
- [ ] Invariante: IDs en TbNoConformidades = IDs en TbCacheListadoNC
- [ ] Compila sin errores en VBA Editor
- [ ] VALIDADO EN ACCESS: Spec-003

---

## 6. Tests de Validación en Access

### Test 1: RebuildCompleto

```vba
? CacheNCProyecto.RebuildCompleto
```

**Esperado:** `True`

---

### Test 2: Verificar registros en caché

```vba
Dim db As DAO.Database, rs As DAO.Recordset
Set db = CurrentDb
Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC")
Debug.Print "Total en caché: " & rs!Total
rs.Close
```

**Esperado:** > 0 (número de NCs en el sistema)

---

### Test 3: SincronizarCache (sin cambios)

```vba
? CacheNCProyecto.SincronizarCache
```

**Esperado:** `True`

---

### Test 4: GetListadoFiltradoSQL (sin filtros)

```vba
Dim col As Collection
Set col = CacheNCProyecto.GetListadoFiltradoSQL()
Debug.Print "Total filtrados: " & col.Count
```

**Esperado:** > 0

---

### Test 5: GetListadoFiltradoSQL (con filtros)

```vba
Dim col As Collection
Set col = CacheNCProyecto.GetListadoFiltradoSQL(p_Estado:="Abierta")
Debug.Print "Abiertas: " & col.Count
```

**Esperado:** > 0

---

### Test 6: Verificar sincronización (agregar NC de prueba)

```vba
' 1. Insertar NC de prueba directamente en TbNoConformidades
' 2. Llamar a SincronizarCache
' 3. Verificar que aparece en caché

Dim rs As DAO.Recordset
Set rs = CurrentDb.OpenRecordset("SELECT MAX(IDNoConformidad) AS MaxID FROM TbNoConformidades")
Dim nuevoID As Long
nuevoID = rs!MaxID + 1
rs.Close

CurrentDb.Execute "INSERT INTO TbNoConformidades (IDNoConformidad, CodigoNoConformidad, Estado, FechaApertura) VALUES (" & nuevoID & ", 'TEST-" & nuevoID & "', 'Abierta', #2026-01-01#)"

? CacheNCProyecto.SincronizarCache

Set rs = CurrentDb.OpenRecordset("SELECT COUNT(*) FROM TbCacheListadoNC WHERE IDNoConformidad = " & nuevoID)
Debug.Print "Nueva NC en caché: " & rs!Total
rs.Close

' Limpieza
CurrentDb.Execute "DELETE FROM TbNoConformidades WHERE IDNoConformidad = " & nuevoID
```

**Esperado:** "Nueva NC en caché: 1"

---

## 7. Notas de Implementación

- JOIN con TbExpedientes NO necesario (Juridica eliminada)
- Usar transacciones explícitas: BeginTrans/CommitTrans/Rollback
- Patrón de manejo de errores obligatorio (PRD-006)
- No usar JSON: campos directamente en columnas