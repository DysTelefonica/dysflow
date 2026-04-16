# Spec-011: Fix Gap G-001 - ExpedienteCalculadoTexto en ListItemVM

**Estado:** 🔵 ABIERTA
**Prioridad:** Alta
**Tipo:** Bugfix / Extension
**Módulos PRD afectados:** PRD-01_NC_Proyectos
**Spec padre:** Spec-004 (GetNCsFiltradosVM)
**Specs relacionadas:** Spec-005 (FormGestion usa VM)
**RFC origen:** RFC-001
**Plan origen:** PLAN-002 (T-05)
**Fecha de creación:** 2026-03-16

---

## 1. Problema

NCProyectoListItemVM usa campo simple `Expediente`, pero FormNCProyectoGestion espera `ExpedienteCalculadoTexto` que incluye nemotécnico.

**Origen del cálculo** (de [Expediente.cls](file:///c:/Users/adm1/Telefonica/Aplicaciones_dys.TMETF%20-%20Aplicaciones%20PpD/No%20Conformidades/00_NoConformidades/src/classes/Expediente.cls#L109-L135)):

```vba
If m_sTextoExpediente <> "" Then
    TextoExpediente = m_sTextoExpediente
ElseIf Me.Nemotecnico <> "" And Me.CodExp <> "" Then
    m_sTextoExpediente = Me.Nemotecnico & " (" & Me.CodExp & ")"
ElseIf Me.Nemotecnico <> "" Then
    m_sTextoExpediente = Me.Nemotecnico
Else
    m_sTextoExpediente = Me.CodExp
End If
```

---

## 2. Solución Propuesta

Extender NCProyectoListItemVM con:

1. **Nuevos campos** (cargados desde TbNoConformidades):
   - `Nemotecnico` (Text)
   - `CodExp` (Text)

2. **Nueva propiedad**:
   - `ExpedienteCalculadoTexto` - calcula el texto basado en Nemotecnico/CodExp

3. **Actualizar constructor.bas**:
   - `getNCsFiltradosVM` debe cargar estos campos adicionales

4. **Actualizar Form_FormNCProyectoGestion.cls**:
   - `RellenarListaConVM` debe usar `ExpedienteCalculadoTexto` en lugar de `Expediente`

---

## 3. Campos a Añadir en NCProyectoListItemVM

| Campo | Tipo | Origen (TbNoConformidades) |
|-------|------|---------------------------|
| Nemotecnico | String | Nemotecnico |
| CodExp | String | CodExp |
| ExpedienteCalculadoTexto | String | (calculado) |

---

## 4. SQL Actualizado para getNCsFiltradosVM

```sql
SELECT IDNoConformidad, CodigoNoConformidad, Descripcion, EXPEDIENTE, 
       Estado, FECHAAPERTURA, FECHACIERRE, PROYECTO, VEHICULO, 
       RESPONSABLETELEFONICA, RESPONSABLECALIDAD, Cerrada, RequiereACR, ACR, 
       RequiereControlEficacia, Nemotecnico, CodExp
FROM TbNoConformidades 
WHERE Borrado = 0 
ORDER BY IDNoConformidad DESC
```

---

## 5. Criterios de Éxito

- [x] NCProyectoListItemVM tiene propiedades Nemotecnico, CodExp, ExpedienteCalculadoTexto
- [x] getNCsFiltradosVM carga Nemotecnico y CodExp desde la BD
- [x] RellenarListaConVM usa ExpedienteCalculadoTexto
- [ ] Test pasa: los datos mostrados incluyen nemotécnico cuando existe

---

## 6. Notas de Implementación

- El cálculo de ExpedienteCalculadoTexto debe replicar la lógica de Expediente.cls
- No requiere acceso a objeto Expediente, solo a los campos Nemotecnico y CodExp
