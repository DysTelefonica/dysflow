# Spec-012: Gap - Property Let en NCProyectoListItemVM para caché

**Estado:** 🔵 ABIERTA
**Prioridad:** Alta
**Tipo:** Corrección (Gap)
**Spec padre:** Spec-003 (Cache de listados)
**Fecha de creación:** 2026-03-16
**Cierre:** Pendiente

---

## 1. Resumen del Gap

- **Problema:** NCProyectoListItemVM tiene propiedades de solo lectura (solo Property Get).
- **Necesidad:** CacheNCProyecto.GetListDesdeCache necesita asignar valores a las propiedades del VM al recuperar datos de la caché.
- **Causa raíz:** El diseño original del VM era solo lectura, pero la recuperación desde caché requiere escritura.

---

## 2. Propiedades afectadas

| Propiedad | Tipo |
| :--- | :--- |
| IDNoConformidad | Long |
| CodigoNoConformidad | String |
| Descripcion | String |
| Estado | String |
| FechaApertura | Date |
| FechaCierre | Date |
| Nemotecnico | String |
| CodExp | String |

---

## 3. Solución implementada

Se añadieron Property Let a las propiedades necesarias en NCProyectoListItemVM.cls.

---

## 4. Criterios de Aceptación

- [x] Property Let añadidas para todas las propiedades afectadas
- [ ] Test en Access pasa
- [ ] VALIDADO EN ACCESS: Spec-012
