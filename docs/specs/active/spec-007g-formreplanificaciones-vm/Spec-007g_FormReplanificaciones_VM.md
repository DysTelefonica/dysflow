# Spec-007g: Pestaña Replanificaciones consume NCProyectoDetailVM (Dual-Path)

**Estado:** 🔵 ABIERTA  
**Prioridad:** Media  
**Tipo:** Nueva Funcionalidad  
**Spec padre:** Spec-007  
**Plan origen:** PLAN-002 (T-07g)

---

## Propósito

Implementar patrón dual-path en la pestaña Replanificaciones: **primero desde NCProyectoDetailVM.ColReplanificaciones**, si no está disponible **fallback** a ReplanificacionesProyectoOperaciones.

---

## ADDED Requirements

### Requirement: Carga dual-path de reprogramaciones

El formulario **DEBE** cargar las replanificaciones desde `NCProyectoDetailVM.ColReplanificaciones` si el VM está disponible. **SI** no lo está, **ENTONCES** hacer fallback usando `ReplanificacionesProyectoOperaciones`.

#### Scenario: Carga de Replanificaciones desde VM

- GIVEN `m_VM` no es Nothing Y `m_VM.EstaCargado = True`
- WHEN se cargan las replanificaciones
- THEN iterar sobre `m_VM.ColReplanificaciones` y agregar al listado

#### Scenario: Fallback Replanificaciones

- GIVEN `m_VM` es Nothing O `m_VM.EstaCargado = False`
- WHEN se cargan las replanificaciones
- THEN consultar `TbReplanificacionesProyecto` filtrado por `IDNoConformidad`

---

## Datos disponibles en VM

### ColReplanificaciones (Collection de Arrays)

| Índice | Campo |
|--------|-------|
| 0 | IDReplanificacion |
| 1 | Observaciones |
| 2 | FechaPrevistaAlInicio |
| 3 | FechaPrevistaReplanificada |
| 4 | FechaReprogramacion |

---

## Plan de Intervención

### Intervención 1: Añadir CargarReplanificaciones() con dual-path

**Archivo:** `src/forms/Form_FormNCProyectoReplanificaciones.cls`

```vba
Private Sub CargarReplanificaciones()
    If Not m_VM Is Nothing And m_VM.EstaCargado Then
        Dim vRep As Variant
        For Each vRep In m_VM.ColReplanificaciones
            ' Agregar al subformulario de replanificaciones
            ' vRep(0) = IDReplanificacion, vRep(1) = Observaciones, etc.
        Next vRep
    Else
        ' Path fallback - ReplanificacionesProyectoOperaciones
    End If
End Sub
```

---

## Criterios de Verificación

- [ ] Sin regresiones en Pestaña Replanificaciones
- [ ] VM se usa cuando está disponible
- [ ] Fallback funciona cuando VM no está
- [ ] Access cerrado antes de importar .cls

---

## Importación Access

- **Tipo de cambio:** Solo código (.cls)
- **Comando:** `node cli.js import Form_FormNCProyectoReplanificaciones`
