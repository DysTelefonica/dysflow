# RFC-001: Arquitectura de Caché y ViewModel para Mejora de Rendimiento NCProyecto

**Estado:** En revisión
**Fecha:** 2026-03-14
**Autor:** Arquitecto de Software Principal
**Specs relacionadas:** Spec-001 a Spec-010 (16 specs: 001-008 + 007b-007g + 009-010)

---

## 1. Problema

Los formularios de gestión de No Conformidades de Proyecto presentan problemas de rendimiento:

**FormNCProyectoGestion (Listado):**
- Los filtros se aplican en memoria sobre toda la colección cargada

**FormNCProyecto (Detalle con 6 pestañas):**
- El contenedor principal carga 6 subformularios:
  - **General** (FormNCProyectoGeneral) - Datos principales
  - **Acciones** (FormNCProyectoAcciones) - TbNCAccionCorrectivas (ACs)
  - **Control Eficacia** (FormNCProyectoControlEficacia) - ControlEficacia
  - **Notas** (FormNCProyectoNota) - Notas
  - **Documentos** (FormNCProyectoDocumentos) - TbAnexos
  - **Replanificaciones** (FormNCProyectoReplanificaciones) - TbReplanificacionesProyecto

**Causas raíz identificadas:**
1. `getNCsProyectosTotales` carga TODAS las NCs sin filtro SQL
2. `getNCsFiltrados` itera sobre colección completa aplicando filtros en VBA
3. Cada subformulario ejecuta sus propias consultas al cambiar de pestaña
4. Propiedades lazy-load (`ResponsableTelefonicaObj`, `ExpedienteObj`, `ACs`, `ARs`, `Documentos`, `Replanificaciones`, `Riesgos`) ejecutan SQL individuales
5. No existe estrategia de caché para listados ni para detalle
6. No hay mecanismo de detección de cambios de otros usuarios

---

## 2. Contexto

### Módulos afectados

| Módulo | Tipo | Notas |
|--------|------|-------|
| `src/forms/Form_FormNCProyectoGestion.cls` | Formulario | Listado y filtrados |
| `src/forms/Form_FormNCProyecto.cls` | Formulario | Contenedor con navegación por pestañas |
| `src/forms/Form_FormNCProyectoGeneral.cls` | Subformulario | Pestaña General |
| `src/forms/Form_FormNCProyectoAcciones.cls` | Subformulario | Pestaña Acciones (TbNCAccionCorrectivas) |
| `src/forms/FormNCProyectoAR.form.txt` | Subformulario | Detalle de tareas de cada Acción (TbARProyecto) |
| `src/forms/Form_FormNCProyectoControlEficacia.cls` | Subformulario | Pestaña Control Eficacia |
| `src/forms/Form_FormNCProyectoNota.cls` | Subformulario | Pestaña Notas |
| `src/forms/Form_FormNCProyectoDocumentos.cls` | Subformulario | Pestaña Documentos (TbAnexos) |
| `src/forms/Form_FormNCProyectoReplanificaciones.cls` | Subformulario | Pestaña Replanificaciones |
| `src/classes/NCProyecto.cls` | Clase | Entidad principal |
| `src/classes/NCProyectoOperaciones.cls` | Clase | CRUD con invalidación de caché |
| `src/modules/constructor.bas` | Módulo | Factory de objetos |

### Sistema de caché existente
**Ya existe** `src/modules/CacheNCProyecto.bas` que:
- Usa tabla `TbCacheNCProyecto` (almacenamiento en JSON)
- Cachea NCs **individuales** con relaciones (ACs, ARs, Replanificaciones, Riesgos)
- Tiene invalidación y transacciones
- **NO cachea listados** (solo detalle por ID)

---

## 3. Propuesta

### 3.1 ViewModels aplanados

| ViewModel | Propósito | Entidades incluidas |
|-----------|-----------|---------------------|
| `NCProyectoListItemVM` | Datos para listado filtrable | Solo campos del listado |
| `NCProyectoDetailVM` | Datos completos para formulario con 6 pestañas | NC + ACs + ARs + Documentos + Replanificaciones + Riesgos |

### 3.2 Sistema de caché persistida

**Estrategia:** Reutilizar tabla existente `TbCacheNCProyecto` + crear nueva tabla `TbCacheListadoNC` + añadir campo `DatosDocumentos`.

| Campo | Tipo | Contenido JSON |
|-------|------|----------------|
| DatosNC | Memo | Datos principales de la NC |
| DatosACs | Memo | Acciones Correctivas (1→N), cada AC incluye sus ARs anidados |
| DatosARs | Memo | Acciones Realizadas/Tareas (1→N) - tareas de cada AC |
| DatosReplanificaciones | Memo | Replanificaciones (1→N) |
| DatosRiesgos | Memo | Riesgos (1→N) |
| DatosDocumentos | Memo | Documentos/Anexos (1→N) |
| FechaCache | Date/Time | Timestamp de última actualización |
| Version | Integer | Versionado para detección de cambios |

### 3.3 Invalidación atómica por entidad

**Principio:** Actualizar solo el campo JSON que corresponde a la entidad modificada.

| Evento | Acción en caché |
|--------|-----------------|
| Cambia NC principal (estado, descripción, etc.) | Regenerar **TODO**: DatosNC + DatosACs + DatosARs + DatosReplanificaciones + DatosRiesgos + DatosDocumentos **+ FilaListado por ID** |
| Añade/Modifica/Elimina **una AC** | Solo actualizar **DatosACs** |
| Añade/Modifica/Elimina **un AR** | Invalidar **DatosARs** + recalcular **AC padre** + impactar **DatosNC** (cascada completa: AR → AC → NC) |
| Añade/Modifica **Replanificación** | Solo actualizar **DatosReplanificaciones** |
| Añade/Modifica **Riesgo** | Solo actualizar **DatosRiesgos** |
| Añade/Modifica **Documento** | Solo actualizar **DatosDocumentos** |
| **Alta nueva NC** | Añadir fila a **ListadoGestion** + generar caché de detalle |
| **Eliminar NC** | Eliminar fila de **ListadoGestion** + invalidar caché de detalle |

### 3.4 Estrategia de consistencia transaccional

**Invalidación post-commit:**
```vba
' En NCProyectoOperaciones.Guardar():
CommitTrans
CacheNCProyecto.InvalidarCache nc.IDNoConformidad, "DatosACs"  ' Solo ACs si cambió
```

**Detección de cambios externos (multiusuario):**
- La herramienta NO fuerza refresco automático de detalle
- El usuario decide cuándo actualizar manualmente mediante botón "Actualizar"
- Se mantiene `FechaCache` para saber cuándo se cacheó la información

---

## 3.6 Consistencia fuerte CRUD + caché (atomicidad)

### 3.6.1 Principio rector

**REQUISITO NO NEGOCIABLE:** "Prefiero no tener caché antes que datos desalineados."

Toda operación CRUD (Create, Read, Update, Delete) sobre NC/AC/AR/hijos debe garantizar atomicidad con la operación mínima de caché. Si falla cualquiera de las dos, se hace rollback total.

### 3.6.2 Operación mínima de caché

| Entidad modificada | Operación mínima obligatoria |
|-------------------|----------------------------|
| NC principal | Marcar `CacheValida = False` + actualizar `Version` + `FechaCache` |
| AC (acción correctiva) | Marcar `CacheValida = False` + actualizar `Version` + `FechaCache` para la NC padre |
| AR (acción realizada/tarea) | Marcar `CacheValida = False` + actualizar `Version` + `FechaCache` para la AC padre y NC abuelo |
| Documento/Anexo | Marcar `CacheValida = False` + actualizar `Version` + `FechaCache` para la NC padre |
| Replanificación | Marcar `CacheValida = False` + actualizar `Version` + `FechaCache` para la NC padre |
| Riesgo | Marcar `CacheValida = False` + actualizar `Version` + `FechaCache` para la NC padre |

### 3.6.3 Flujo transaccional obligatorio

```vba
Public Function GuardarEntidad(...) As Boolean
    On Error GoTo ErrorHandler
    
    BeginTrans
    
    ' 1) Operación de negocio (CRUD)
    GuardarEnBaseDeDatos ...
    
    ' 2) Operación mínima de caché (OBLIGATORIA)
    MarcarCacheInvalida idEntidad, "DatosNC"
    ActualizarVersionCache idEntidad
    
    ' 3) Commit solo si ambas operaciones exitosas
    CommitTrans
    GuardarEntidad = True
    Exit Function
    
ErrorHandler:
    Rollback
    GuardarEntidad = False
End Function
```

### 3.6.4 Política de fallo

| Escenario | Acción |
|-----------|--------|
| CRUD ok + caché mínima ok | CommitTrans |
| CRUD ok + caché mínima falla | **Rollback total** (incluye CRUD) |
| CRUD falla | Rollback total (caché no se toca) |
| Error en cualquier punto | Rollback total, registrar error |

---

## 3.7 Kill-switch de caché (modo seguro)

### 3.7.1 Propósito

Proporcionar un mecanismo de **kill-switch** para desactivar la caché de forma inmediata en producción si algo va mal.

### 3.7.2 Diseño del flag global

| Elemento | Descripción |
|----------|-------------|
| **Flag** | `CacheEnabled` (Boolean) |
| **Persistencia** | Tabla `TbConfiguracion` (campo `CacheHabilitada`) |
| **Punto único de lectura** | Función `IsCacheEnabled()` en `CacheNCProyecto.bas` |
| **Default** | `True` (caché habilitada) |

### 3.7.3 Comportamiento según estado del flag

| Estado | Lectura de caché | Escritura de caché | Rebuild de caché |
|--------|-----------------|-------------------|------------------|
| **ON** (`True`) | Normal: lee de `TbCacheNCProyecto` | Normal: escribe en caché | Normal: regenera al invalidar |
| **OFF** (`False`) | **NO lee**: consulta directa a BD | **NO escribe**: omite escritura | **NO ejecuta**: salta rebuild |

---

## 4. Alternativas consideradas

| Alternativa | Descripción | Resultado |
|-------------|-------------|-----------|
| **A** | Extender CacheNCProyecto.bas con caché en tabla | **SELECCIONADA** |
| **B** | Caché solo en memoria (Dictionary) | DESCARTADA |
| **C** | Solo ViewModels sin caché | DESCARTADA |
| **D** | Nueva tabla TbCacheListados como complemento de A | **SELECCIONADA como complemento** |

**DECISIÓN:** dos tablas de caché:
1. `TbCacheNCProyecto` - Caché de detalle por NC (ya existe, ampliar con DatosDocumentos)
2. `TbCacheListadoNC` - Caché de listado de gestión (NUEVA tabla)

Invalidación atómica por ID en ambas tablas.

---

## 3.5 Precalentado manual de caché (detalle + gestión)

**Propósito:** Permitir al usuario ejecutar manualmente el populate de caché para que tanto el detalle como el listado estén disponibles desde el primer uso.

**Comando desde Ventana Inmediato:**
```vba
CacheNCProyecto.PrecalentarCacheCompleto
```

---

## 5. Módulos a crear/modificar

### Nuevos
- `src/classes/NCProyectoListItemVM.cls` — ViewModel para listado
- `src/classes/NCProyectoDetailVM.cls` — ViewModel para detalle
- `src/modules/CacheNCCacheRepositorio.bas` — Repositorio de caché de listados
- `src/modules/CacheNCService.bas` — Servicio de notificación de cambios
- `src/modules/CacheNCCrud.bas` — CRUD de caché transaccional
- `src/modules/NCProyectoWrapper.bas` — Kill-switch + fallback

### Modificados
- `src/modules/CacheNCProyecto.bas` — Extender para listados
- `src/modules/constructor.bas` — Añadir GetNCsFiltradosVM, GetNCProyectoVM
- `src/classes/NCProyectoOperaciones.cls` — Invalidación transaccional

---

## 6. Criterios de aceptación

- [ ] ViewModels compilan sin errores
- [ ] Caché se invalida correctamente tras guardar NC
- [ ] Kill-switch desactiva/activa caché sin errores
- [ ] Precalentado manual funciona
- [ ] No hay datos desalineados entre caché y BD
- [ ] Transaccionalidad: si falla caché, no se confirma CRUD