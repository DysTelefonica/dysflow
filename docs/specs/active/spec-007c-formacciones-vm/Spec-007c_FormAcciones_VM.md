# Spec-007c: Pestaña Acciones consume NCProyectoDetailVM (Dual-Path)

**Estado:** 🔵 ABIERTA  
**Prioridad:** Alta  
**Tipo:** Nueva Funcionalidad  
**Spec padre:** Spec-007  
**Plan origen:** PLAN-002 (T-07c)

---

## Propósito

Implementar patrón dual-path en la pestaña Acciones de FormNCProyecto para cargar ARs y ACs: **primero desde NCProyectoDetailVM**, si no está disponible **fallback** a acceso directo por BD.

---

## ADDED Requirements

### Requirement: Carga dual-path para ARs (Auditorías de Resultados)

El formulario **DEBE** intentar cargar la lista de ARs desde `NCProyectoDetailVM.ColARs` cuando esté disponible. **SI** el VM no está cargado, **ENTONCES** hacer fallback consultando la BD directamente.

#### Scenario: Carga de ARs desde VM

- GIVEN `m_VM` no es Nothing Y `m_VM.EstaCargado = True`
- WHEN se cargan las ARs
- THEN iterar sobre `m_VM.ColARs` y agregar cada AR al subformulario/listado

#### Scenario: Fallback de ARs a BD

- GIVEN `m_VM` es Nothing O `m_VM.EstaCargado = False`
- WHEN se cargan las ARs
- THEN usar SQL joins entre `TbNCAccionesRealizadas` y `TbNCAccionCorrectivas`

### Requirement: Carga dual-path para ACs (Acciones Correctivas)

El formulario **DEBE** intentar cargar la lista de ACs desde `NCProyectoDetailVM.ColACs` cuando esté disponible. **SI** el VM no está cargado, **ENTONCES** hacer fallback usando `ACProyectoOperaciones`.

---

## Datos disponibles en VM

### ColARs (Collection de Arrays)
| Índice | Campo |
|--------|-------|
| 0 | IDAccionRealizada |
| 1 | NAccion |
| 2 | AccionRealizada |
| 3 | Responsable |
| 4 | Estado |
| 5 | FechaAccionRealizada |
| 6 | FechaInicio |
| 7 | FechaFinPrevista |
| 8 | FechaFinReal |
| 9 | Notas |

### ColACs (Collection de Arrays)
| Índice | Campo |
|--------|-------|
| 0 | IDAccionCorrectiva |
| 1 | NAccion |
| 2 | AccionCorrectiva |
| 3 | Responsable |
| 4 | Estado |
| 5 | FechaAccionCorrectiva |
| 6 | FechaFinPrevistaUltima |
| 7 | FechaFinalUltima |

---

## Plan de Intervención

### Intervención 1: Añadir CargarARs() y CargarACs() con dual-path

**Archivo:** `src/forms/Form_FormNCProyectoAcciones.cls`

```vba
Private Sub CargarARs()
    If Not m_VM Is Nothing And m_VM.EstaCargado Then
        ' Path VM
        Dim vAR As Variant
        For Each vAR In m_VM.ColARs
            ' Agregar al subformulario de ARs
        Next vAR
    Else
        ' Path fallback - SQL directo
    End If
End Sub

Private Sub CargarACs()
    If Not m_VM Is Nothing And m_VM.EstaCargado Then
        ' Path VM
        Dim vAC As Variant
        For Each vAC In m_VM.ColACs
            ' Agregar al subformulario de ACs
        Next vAC
    Else
        ' Path fallback - ACProyectoOperaciones
    End If
End Sub
```

---

## Criterios de Verificación

- [ ] Sin regresiones en pestaña Acciones
- [ ] ARs se cargan desde VM cuando disponible
- [ ] ACs se cargan desde VM cuando disponible
- [ ] Fallback funciona correctamente
- [ ] Access cerrado antes de importar .cls

---

## Importación Access

- **Tipo de cambio:** Solo código (.cls)
- **Comando:** `node cli.js import Form_FormNCProyectoAcciones`
