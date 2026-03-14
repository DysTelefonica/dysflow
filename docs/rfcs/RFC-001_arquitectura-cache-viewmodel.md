# RFC-001: Arquitectura de Caché y ViewModel para Mejora de Rendimiento NCProyecto

**Estado:** En revisión → Aprobado
**Fecha:** 2026-03-14
**Autor:** Arquitecto de Software Principal
**Specs relacionadas:** Spec-001 a Spec-008 (Plan-001)

---

## 1. Problema

Los formularios de gestión de No Conformidades de Proyecto presentan problemas de rendimiento:
- **FormNCProyectoGestion**: Los filtros se aplican en memoria sobre toda la colección cargada
- **FormNCProyecto**: Consultas N+1 por propiedades lazy-load

**Causas raíz identificadas:**
1. `getNCsProyectosTotales` carga TODAS las NCs sin filtro SQL
2. `getNCsFiltrados` itera sobre colección completa aplicando filtros en VBA
3. Propiedades lazy-load (`ResponsableTelefonicaObj`, `ExpedienteObj`, etc.) ejecutan SQL individuales
4. No existe estrategia de caché para listados
5. No hay mecanismo de detección de cambios de otros usuarios

---

## 2. Contexto

### Módulos afectados
- `src/forms/Form_FormNCProyectoGestion.cls` - Listado y filtrados
- `src/forms/Form_FormNCProyecto.cls` - Detalle/edición
- `src/forms/Form_FormNCProyectoGeneral.cls` - Datos generales
- `src/classes/NCProyecto.cls` - Entidad
- `src/classes/NCProyectoOperaciones.cls` - CRUD
- `src/modules/constructor.bas` - Factory

### Sistema de caché existente
**Ya existe** `src/modules/CacheNCProyecto.bas` que:
- Usa tabla `TbCacheNCProyecto` (almacenamiento en JSON)
- Cachea NCs **individuales** con relaciones (ACs, ARs, Replanificaciones, Riesgos)
- Tiene invalidación y transacciones
- **NO cachea listados** (solo detalle por ID)

### Decisiones previas relevantes
- CacheNCProyecto existente usa JSON en campos Memo de Access
- No existe tabla `TbConfiguracion` en la base de datos

---

## 3. Propuesta

### 3.1 ViewModels aplanados

| ViewModel | Propósito | Ruta |
|-----------|-----------|------|
| `NCProyectoListItemVM` | Datos para listado filtrable | `src/classes/NCProyectoListItemVM.cls` |
| `NCProyectoDetailVM` | Datos completos para formulario edición | `src/classes/NCProyectoDetailVM.cls` |

### 3.2 Sistema de caché para listados

**Opción A (RECOMENDADA):** Extender `CacheNCProyecto.bas` existente
- Añadir cache de listados (`Dictionary` en memoria, no tabla)
- TTL en memoria (no persistir a BD)
- Integración con invalidación transaccional

### 3.3 Estrategia de consistencia transaccional

**Invalidación post-commit:**
```vba
' En NCProyectoOperaciones.Guardar():
CommitTrans
CacheNCProyecto.InvalidarCache nc.IDNoConformidad
CacheNCProyecto.InvalidateList
```

**Detección de cambios externos (multiusuario):**
- Usar campo `FechaCache` de `TbCacheNCProyecto` como timestamp
- Al abrir formulario, comparar con `Now()` si TTL expiró

---

## 4. Alternativas consideradas

| Alternativa | Descripción | Pros | Contras | Resultado |
|-------------|-------------|------|---------|-----------|
| **A** | Extender CacheNCProyecto.bas existente | Ya funciona, menos código nuevo | Acoplar más lógica | **RECOMENDADA** |
| **B** | Nueva tabla TbCacheListados | Persistente | Más complejo, cambio esquema | DESCARTADA |
| **C** | Solo ViewModels sin caché | Simple | Sin mejora real de rendimiento | DESCARTADA |
| **D** | Redis/Memcached externo | Potente | Access no soporta, sobreingeniería | DESCARTADA |

### Evaluación de cambio de esquema

| Opción | Descripción | Pros | Contras |
|--------|-------------|------|---------|
| **1** | Usar `TbCacheNCProyecto.FechaCache` existente | Sin cambio esquema | Solo para detalle |
| **2** | Añadir campo a `TbCacheNCProyecto` | Centralizado | Cambio esquema mínimo |
| **3** | Crear `TbConfiguracion` nueva | Genérico | Cambio esquema, nueva tabla |

**DECISIÓN:** Opción 1 - Usar `FechaCache` existente de `TbCacheNCProyecto` como timestamp global. Esta tabla YA existe en la base de datos (ver ERD línea 78) con campos: IDNoConformidad, Version, FechaCache, DatosNC, DatosACs, DatosARs, DatosReplanificaciones, DatosRiesgos, UsuarioCache, CacheValida.

---

## 5. Impacto

### Módulos afectados

| Módulo / Archivo | Tipo de cambio | Notas |
| :--- | :--- | :--- |
| `src/classes/NCProyectoListItemVM.cls` | Nuevo | ViewModel para listados |
| `src/classes/NCProyectoDetailVM.cls` | Nuevo | ViewModel para detalle |
| `src/modules/CacheNCProyecto.bas` | Extender | Añadir métodos para listados (GetListVM, SetListVM, InvalidateList) |
| `src/modules/constructor.bas` | Modificar | Añadir GetNCsFiltradosVM, GetNCProyectoVM |
| `src/forms/Form_FormNCProyectoGestion.cls` | Modificar | Usar ViewModels |
| `src/forms/Form_FormNCProyecto.cls` | Modificar | Usar ViewModel |
| `src/forms/Form_FormNCProyectoGeneral.cls` | Modificar | Usar ViewModel |
| `src/classes/NCProyectoOperaciones.cls` | Modificar | Invalidación post-commit |

### Cambios en modelo de datos

- [x] **No aplica** — Se reutiliza estructura existente de `TbCacheNCProyecto` (ERD línea 78)
- [ ] Sí — descripción:

### Cambios en UI (formularios)

- [x] **No aplica** — Los cambios son internos (lógica), no visuales
- [ ] Sí — descripción:

### Riesgos

| Riesgo | Probabilidad | Mitigación |
| :--- | :--- | :--- |
| R-1: Inconsistencia de caché por acceso concurrente | Media | TTL corto (5 min) + invalidación post-commit |
| R-2: Memoria excesiva por caché en memoria | Baja | Límite de 500 itens en lista, 50 detalles |
| R-3: Regresión funcional | Media | Test de regresión por cada Spec |
| R-4: CacheNCProyecto existente tiene bugs | Baja | El nuevo código es adicional, no reemplaza |

---

## 6. Plan de implementación

- [ ] Una sola Spec: Spec-XXX
- [x] **Múltiples Specs (Plan de Actuación):**
  1. Spec-001: NCProyectoListItemVM (cls nuevo)
  2. Spec-002: NCProyectoDetailVM (cls nuevo)
  3. Spec-003: Extender CacheNCProyecto para listados
  4. Spec-004: GetNCsFiltradosVM en constructor
  5. Spec-005: FormNCProyectoGestion usa VM
  6. Spec-006: GetNCProyectoVM en constructor
  7. Spec-007: FormNCProyecto usa VM
  8. Spec-008: Invalidación transaccional en NCProyectoOperaciones

**Dependencias:** Spec-001 → Spec-002 → Spec-003 → Spec-004 → Spec-005 → Spec-006 → Spec-007 → Spec-008

---

## 7. Criterio de aceptación

- [ ] FormNCProyectoGestion abre en <3s (P95) vs baseline actual
- [ ] Aplicar filtros en FormNCProyectoGestion toma <1s (P95)
- [ ] FormNCProyecto abre en <2s (P95)
- [ ] Caché se invalida correctamente tras guardar NC (test transaccional)
- [ ] Cambios de otros usuarios se detectan (test de timestamp)
- [ ] Test de regresión: funcionalidad idéntica a versión anterior

### Baseline de medición

| Métrica | Método | Entorno |
|---------|--------|---------|
| Tiempo apertura FormNCProyectoGestion | `Timer` antes/después de `DoCmd.OpenForm` | Access local, ~5000 NCs |
| Tiempo aplicar filtros | `Timer` en `getNCsFiltrados` | Mismo dataset |
| Tiempo apertura detalle | `Timer` en `constructor.getNCProyecto` | Mismo dataset |
| P95 | 20 muestras, percentil 95 | Mismo equipo |

---

## 8. Plan de rollback técnico

| Escenario | Acción |
|-----------|--------|
| Spec-001/002 no compila | Eliminar cls nuevo, revertir constructor |
| Spec-003 rompe CacheNCProyecto | Comentar nuevos métodos, no tocar los existentes |
| Spec-005/007 regresión visual | Restaurar versiones anteriores de .form.txt |
| Spec-008 invalida incorrectamente | Comentar líneas de invalidación, dejar solo CommitTrans |
| **ROLLBACK GENERAL** | Eliminar branch `plan-001-xxx`, volver a `develop` |

---

## 9. Decisión

> Completar cuando el RFC sea aprobado o rechazado.

**Decisión:** 
**Fecha:** 
**Justificación:** 

---

> **Cómo usar esta plantilla**
> 1. Guarda el archivo en `docs/rfcs/RFC-001_arquitectura-cache-viewmodel.md`
> 2. Completa las secciones — omite solo las que genuinamente no aplican
> 3. Comparte para revisión
> 4. Una vez aprobado, actualiza el estado y crea las Specs correspondientes
