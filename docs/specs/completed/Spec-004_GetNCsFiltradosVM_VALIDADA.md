# Spec-004: GetNCsFiltradosVM

**Estado:** ✅ CERRADA
**Prioridad:** Alta
**Tipo:** Nueva Funcionalidad
**Módulos PRD afectados:** PRD-01_NC_Proyectos
**Spec padre:** —
**Specs relacionadas:** Spec-001, Spec-003, Spec-005
**RFC origen:** RFC-001
**Plan origen:** PLAN-002 (T-04)
**Fecha de creación:** 2026-03-14
**Fecha de cierre:** 2026-03-16
**Validación:** ✅ VALIDADA EN ACCESS por usuario

---

## 1. Resumen Técnico

- **Problema / Necesidad:** Constructor de NCProyecto no tiene método que devuelva Colección de ViewModels aplanados para listados.
- **Causa raíz:** Constructor actual devuelve Colección de NCProyecto (entidades completas con hijos).
- **Solución propuesta:** Crear método GetNCsFiltradosVM que devuelve Colección de NCProyectoListItemVM.
- **Dependencias:** Spec-001 (NCProyectoListItemVM), Spec-003 (caché de listados).

---

## 2. Historia de Usuario

> Como sistema, quiero poder obtener listados aplanados de NCs filtradas para mostrar en FormNCProyectoGestion sin cargar entidades completas.

---

## 3. Análisis de Impacto

### 3.1 Módulos afectados

| PRD | Módulo / Clase | Tipo de impacto | Notas |
| :--- | :--- | :--- | :--- |
| PRD-01_NC_Proyectos | constructor.bas | Nuevo método | GetNCsFiltradosVM |

### 3.2 Archivos a modificar

| Archivo | Tipo de cambio | Descripción del cambio |
| :--- | :--- | :--- |
| `src/modules/constructor.bas` | Nuevo método | GetNCsFiltradosVM(filtros) As Collection |

### 3.3 Tablas / Entidades de datos afectadas

| Tabla | Cambio | Detalle |
| :--- | :--- | :--- |
| TbNoConformidades | Solo lectura | Consulta aplanada con filtros |

### 3.4 Formularios / UI afectados

Ninguno.

### 3.5 Deuda técnica relacionada

| ID | Descripción | Relación |
| :--- | :--- | :--- |
| DT-001 | ViewModels para optimización rendimiento | Genera |

### 3.6 Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
| :--- | :--- | :--- | :--- |
| R-1: Filtros no cubiertos | Baja | Medio | Mapear todos los filtros existentes |

---

## 4. Plan de Intervención

### Intervención 1: Añadir GetNCsFiltradosVM

**Archivo:** `src/modules/constructor.bas`
**Tipo:** Nuevo método
**Precondición:** Spec-001 completada

**Descripción:**
Añadir método que devuelve Colección de NCProyectoListItemVM:

```vba
Public Function GetNCsFiltradosVM(Optional filtros As Variant) As Collection
    ' Ejecutar query aplanada
    ' Instanciar NCProyectoListItemVM para cada registro
    ' Devolver Colección de ViewModels
End Function
```

**Postcondición:** Método compila y devuelve Colección de VMs.

---

## 5. Criterios de Verificación

### 5.1 Auto-verificación

- [ ] Método GetNCsFiltradosVM existe en constructor.bas
- [ ] Devuelve Colección (no Nil)
- [ ] Elementos son NCProyectoListItemVM

### 5.2 Validación en Access

- [ ] Llamar GetNCsFiltradosVM → devuelve colección con datos
- [ ] Datos coherentes con NCProyecto original

### 5.3 Criterios de aceptación

- [ ] Método compila sin errores
- [ ] Rendimiento <1s P95 para ~5000 NCs

---

## 6. Informe de Cambios UI

Sin cambios de UI.

---

## 7. Gaps y Decisiones

Ninguno identificado.

---

## 8. Notas de Implementación

Método sin caché propio. Usa caché de Spec-003 si está disponible.