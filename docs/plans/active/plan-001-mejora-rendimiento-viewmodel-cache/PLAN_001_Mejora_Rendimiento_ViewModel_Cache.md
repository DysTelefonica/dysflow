# PLAN-001: Mejora de Rendimiento con ViewModel y Caché

**Estado:** En revisión → Listo para ejecutar
**Fecha inicio:** 2026-03-14
**Rama Git:** `plan-001-mejora-rendimiento-viewmodel-cache`
**Specs del plan:** 8 specs
**RFC relacionada:** [RFC-001](../../../rfcs/RFC-001_arquitectura-cache-viewmodel.md)

> **STOP 1:** Este Plan NO ha sido aprobado aún. No implementar código hasta recibir aprobación de RFC-001 y este Plan.

---

## Objetivo

> Mejorar el rendimiento de los formularios de gestión y edición de No Conformidades de Proyecto mediante:
> 1. Implementación de ViewModels aplanados para eliminar consultas N+1
> 2. Sistema de caché con invalidación transaccional para mantener coherencia
> 3. Reducción de tiempos de carga en FormNCProyectoGestion (listado/filtrados) y FormNCProyecto (detalle)

**Módulos afectados:**
- `src/forms/Form_FormNCProyectoGestion.cls` - Listado y filtrados
- `src/forms/Form_FormNCProyecto.cls` - Apertura/visualización de detalle
- `src/classes/NCProyecto.cls` - Entidad
- `src/classes/NCProyectoOperaciones.cls` - Operaciones CRUD
- `src/modules/constructor.bas` - Factory de objetos

**Sistema existente a reutilizar:**
- `src/modules/CacheNCProyecto.bas` - Cache de NCs individuales (ya implementado)
- `TbCacheNCProyecto` (ERD línea 78) - Tabla con campos: IDNoConformidad, Version, FechaCache, DatosNC, DatosACs, DatosARs, DatosReplanificaciones, DatosRiesgos, UsuarioCache, CacheValida

> **Nota:** No existe `TbConfiguracion` en la base de datos. Se usará `TbCacheNCProyecto.FechaCache` como timestamp de referencia.

---

## Diagnóstico Técnico

### Causas Raíz Identificadas

| # | Causa | Evidencia |
| :--- | :--- | :--- |
| CR-1 | Carga completa de TbNoConformidades sin filtro SQL | `getNCsProyectosTotales` usa `SELECT * FROM TbNoConformidades` sin WHERE |
| CR-2 | Filtrado en memoria en lugar de SQL | `getNCsFiltrados` itera sobre todos los registros aplica condiciones en VBA |
| CR-3 | Propiedades lazy-load con consultas N+1 | `ResponsableTelefonicaObj`, `ExpedienteObj`, `Riesgos`, `NCProyectoAsociada` ejecutan SQL individuales |
| CR-4 | Sin caché de datos frecuentemente accedidos (listados) | Cada apertura de formulario ejecuta consultas desde cero |
| CR-5 | Sin estrategia de invalidación multiusuario | No hay mecanismo para detectar cambios de otros usuarios |

### Puntos de Lentitud

**FormNCProyectoGestion (Listado):**
- `getNCsProyectosTotales`: Carga TODAS las NCs - sin medición aún, objetivo <3s P95
- `getNCsFiltrados`: Itera sobre colección completa aplicando filtros en memoria
- Cada cambio de filtro: Ejecuta `ActualizarLista` → vuelve a cargar toda la colección

**FormNCProyecto (Edición):**
- `constructor.getNCProyecto`: Carga objeto completo + propiedades lazy-load
- Cada propiedad `.XXXObj`: Consulta SQL adicional a tabla relacionada

---

## Arquitectura Propuesta

```
┌─────────────────────────────────────────────────────────────┐
│            CacheNCProyecto.bas (EXTENDIDO)                   │
│  ┌──────────────────────┐  ┌────────────────────────────┐  │
│  │ NCListCache (Dict)   │  │ NCDetailCache (Dict)       │  │
│  │ - Clave: "LISTA"     │  │ - Clave: "NC_" + ID        │  │
│  │ - Valor: Colección   │  │ - Valor: NCProyectoVM     │  │
│  │   NCProyectoListItemVM│  │                             │  │
│  └──────────────────────┘  └────────────────────────────┘  │
│                              │                               │
│  - LastInvalidation: Date    │                               │
│  - ListVersion: Long        │                               │
└─────────────────────────────────────────────────────────────┘
        │                                           │
        ▼                                           ▼
┌───────────────────────┐               ┌───────────────────────┐
│ NCProyectoListItemVM  │               │ NCProyectoDetailVM    │
│ (Aplanado para lista) │               │ (Aplanado para detalle)│
│ - IDNoConformidad     │               │ - Todos los campos    │
│ - CodigoNoConformidad│               │ - ResponsableTelef   │
│ - Descripcion        │               │ - ResponsableCalidad │
│ - CodExp             │               │ - Expediente         │
│ - Nemotecnico        │               │ - Riesgos            │
│ - Estado             │               │ - Documentos         │
│ - FechaApertura      │               │ - ACs                │
│ - FechaCierre        │               │ - etc.               │
└───────────────────────┘               └───────────────────────┘
```

**Decisión arquitectónica (RFC-001):**
- Se **extiende** `CacheNCProyecto.bas` existente en lugar de crear `CacheService` nuevo
- Se **reuse** campo `FechaCache` de `TbCacheNCProyecto` para timestamp global
- **Sin cambio de esquema** de base de datos (tabla ya existe en ERD)

### Estrategia de Consistencia Transaccional

| Mecanismo | Implementación |
|-----------|----------------|
| **Invalidación post-commit** | Después de `CommitTrans` en `NCProyectoOperaciones.Guardar()`, `Eliminar()`, `Habilitar()` → invocar `CacheNCProyecto.InvalidateList()` + `CacheNCProyecto.InvalidateDetail(id)` |
| **Timestamp global** | Campo `FechaCache` existente de `TbCacheNCProyecto` (Date/Time) |
| **Detección de cambios externos** | Al acceder a caché, comparar `CacheNCProyecto.LastInvalidation` vs `Now()` con TTL |
| **TTL** | ListCache: 5 min, DetailCache: 10 min |
| **Versionado** | `ListVersion` se incrementa en cada invalidación |

---

## Specs del Plan

| # | Spec | Módulo principal | Depende de | Estado |
| :--- | :--- | :--- | :--- | :--- |
| 1 | [Spec-001](../../../specs/active/spec-001-viewmodel-listado/Spec-001_ViewModel_Listado.md) | NCProyectoListItemVM | — | ⏳ Pendiente |
| 2 | [Spec-002](../../../specs/active/spec-002-viewmodel-detalle/Spec-002_ViewModel_Detalle.md) | NCProyectoDetailVM | Spec-001 | ⏳ Pendiente |
| 3 | [Spec-003](../../../specs/active/spec-003-cache-listados/Spec-003_Cache_Listados.md) | CacheNCProyecto.bas | — | ⏳ Pendiente |
| 4 | [Spec-004](../../../specs/active/spec-004-getncproyectosfiltrados-vm/Spec-004_GetNCsFiltradosVM.md) | constructor.bas | Spec-001, Spec-003 | ⏳ Pendiente |
| 5 | [Spec-005](../../../specs/active/spec-005-form-gestion-vm/Spec-005_Form_Gestion_VM.md) | FormNCProyectoGestion | Spec-004 | ⏳ Pendiente |
| 6 | [Spec-006](../../../specs/active/spec-006-getncproyecto-vm/Spec-006_GetNCProyectoVM.md) | constructor.bas | Spec-002, Spec-003 | ⏳ Pendiente |
| 7 | [Spec-007](../../../specs/active/spec-007-form-detalle-vm/Spec-007_Form_Detalle_VM.md) | FormNCProyecto | Spec-006 | ⏳ Pendiente |
| 8 | [Spec-008](../../../specs/active/spec-008-invalidacion-transaccional/Spec-008_Invalidacion_Transaccional.md) | NCProyectoOperaciones | Spec-003, Spec-005, Spec-007 | ⏳ Pendiente |

> **Estados posibles:** ⏳ Pendiente · 🔄 En curso · ✅ VALIDADO EN ACCESS

---

## Tareas (Desglose de Specs)

### T-00: Baseline de Rendimiento

**Objetivo:** Establecer métricas reproducibles ANTES de implementar cambios.

| Métrica | Método de medición | Objetivo P95 | Protocolo |
|---------|-------------------|--------------|-----------|
| Tiempo apertura FormNCProyectoGestion | `Timer` antes/después de `DoCmd.OpenForm "FormNCProyectoGestion"` | <3 segundos | 20 muestras, Access local, dataset real |
| Tiempo aplicar filtros | `Timer` en `getNCsFiltrados` con filtros típicos | <1 segundo | Mismo dataset, filtros: Estado, Fecha, Responsable |
| Tiempo apertura detalle FormNCProyecto | `Timer` en `constructor.getNCProyecto(id)` | <2 segundos | 20 NCs de diferentes estados |

**Protocolo de medición detallado:**
1. **Dataset:** Mismo entorno con NCs existentes (consultar `SELECT COUNT(*) FROM TbNoConformidades`)
2. **Muestras:** 20 ejecuciones por métrica, descartar outlier máximo
3. **P95:** Percentil 95 de las muestras (ordenadas, posición 19 de 20)
4. **Entorno:** Access local, sin red, mismo equipo
5. **Registro:** Fecha, hora, número de NCs, valores P95 baseline, screenshot de Access

### T-01: NCProyectoListItemVM (Spec-001)
- Crear clase con campos para listado
- Constructor desde NCProyecto
- Constructor desde Recordset (optimizado)

### T-02: NCProyectoDetailVM (Spec-002)
- Crear clase con todos campos formulario edición
- Incluir objetos aplanados (Responsable, Expediente, Riesgos, etc.)
- Constructor desde NCProyecto y Recordset con JOINs

### T-03: CacheNCProyecto para Listados (Spec-003)
- Extender `CacheNCProyecto.bas` con métodos para listados
- Métodos: GetListVM, SetListVM, InvalidateList, IsListValid
- TTL y versionado (sin cambio de esquema)
- **Sin migración de datos** (se usa estructura existente)

### T-04: GetNCsFiltradosVM (Spec-004)
- Nueva función en constructor
- SQL con WHERE dinámico (no carga todo)
- Usa caché condicionalmente

### T-05: FormNCProyectoGestion VM (Spec-005)
- getNCsFiltradosVM()
- RellenarListaConCol con ViewModel
- Cambiar tipo m_ColFiltrado

### T-06: GetNCProyectoVM (Spec-006)
- Nueva función en constructor
- SQL con JOINs (evita N+1)
- Usa caché condicionalmente

### T-07: FormNCProyecto VM (Spec-007)
- Usar NCProyectoDetailVM
- Actualizar EstablecerDatos
- Ajustar accesos a propiedades

### T-08: Invalidación Transaccional (Spec-008)
- Invalidar caché post-commit
- Llamar desde Guardar, Eliminar, Habilitar
- **Sin cambio de esquema**: Usar TbCacheNCProyecto existente

---

## Criterio de Completitud

- [ ] T-00: Baseline documentado (métricas P95 antes de cambios)
- [ ] FormNCProyectoGestion abre en <3s (P95) vs baseline actual
- [ ] Aplicar filtros en FormNCProyectoGestion toma <1s (P95) vs baseline actual
- [ ] FormNCProyecto abre en <2s (P95) vs baseline actual
- [ ] Caché se invalida correctamente tras guardar NC (test transaccional)
- [ ] Cambios de otros usuarios se detectan (test de TTL)
- [ ] Test de regresión: funcionalidad idéntica a versión anterior

---

## Archivos a Tocar

| Tarea | Archivos Nuevos | Archivos a Modificar |
|-------|-----------------|---------------------|
| Spec-001 | `src/classes/NCProyectoListItemVM.cls` | — |
| Spec-002 | `src/classes/NCProyectoDetailVM.cls` | — |
| Spec-003 | — | `src/modules/CacheNCProyecto.bas` (extender con GetListVM, SetListVM, InvalidateList, IsListValid) |
| Spec-004 | — | `src/modules/constructor.bas` |
| Spec-005 | — | `src/forms/Form_FormNCProyectoGestion.cls`, `src/forms/FormNCProyectoGestion.form.txt` |
| Spec-006 | — | `src/modules/constructor.bas` |
| Spec-007 | — | `src/forms/Form_FormNCProyecto.cls`, `src/forms/FormNCProyecto.form.txt`, `src/forms/Form_FormNCProyectoGeneral.cls`, `src/forms/FormNCProyectoGeneral.form.txt` |
| Spec-008 | — | `src/classes/NCProyectoOperaciones.cls` |

---

## Riesgos y Mitigaciones

| # | Riesgo | Probabilidad | Impacto | Mitigación |
| :--- | :--- | :--- | :--- | :--- |
| R-1 | Inconsistencia de caché por acceso concurrente | Media | Alto | TTL corto (5 min) + invalidación post-commit |
| R-2 | Memoria excesiva por caché en memoria | Baja | Medio | Límite de itens en caché (500 lista, 50 detalles) |
| R-3 | Regresión funcional en formularios | Media | Alto | Test de regresión manual por spec |
| R-4 | CacheNCProyecto existente tiene bugs | Baja | Medio | Código nuevo es adicional, no reemplaza |
| R-5 | Cambios no visibles si no se invalida | Alta | Alto | Invalidación post-commit OBLIGATORIA |

### Plan de Rollback por Spec

| Spec | Rollback |
| :--- | :--- |
| Spec-001 | Eliminar NCProyectoListItemVM.cls |
| Spec-002 | Eliminar NCProyectoDetailVM.cls |
| Spec-003 | Comentar métodos añadidos a CacheNCProyecto.bas (no borrar) |
| Spec-004 | Revertir constructor.bas |
| Spec-005 | Restaurar versiones anteriores de .cls y .form.txt |
| Spec-006 | Revertir constructor.bas |
| Spec-007 | Restaurar versiones anteriores de todos los archivos |
| Spec-008 | Revertir NCProyectoOperaciones.cls |

---

## Notas de Arquitectura

- **Patrón MVVM adaptado:** ViewModels aplanados separan UI de lógica de datos
- **Reutilización:** Se extiende `CacheNCProyecto.bas` existente (no se crea nuevo módulo)
- **Sin cambio de esquema:** Se usa `TbCacheNCProyecto` y campo `FechaCache` existentes (ERD línea 78)
- **Sin tabla TbConfiguracion:** No existe; se usa TbCacheNCProyecto.FechaCache como timestamp
- **Caché transaccional:** Invalidación solo post-commit garantiza consistencia
- **SQL filtrado vs. memoria:** Consultas con WHERE en lugar de cargar todo y filtrar en VBA
- **RFC obligatoria:** Este Plan depende de RFC-001 aprobada

---

## Historial

| Fecha | Evento |
| :--- | :--- |
| 2026-03-14 | PLAN creado |
| 2026-03-14 | RFC-001 creada para revisión |
| 2026-03-14 | PLAN alineado con ERD regenerate |
