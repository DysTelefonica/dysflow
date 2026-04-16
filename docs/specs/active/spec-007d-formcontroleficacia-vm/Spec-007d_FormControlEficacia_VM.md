# Spec-007d: Pestaña ControlEficacia consume NCProyectoDetailVM (Dual-Path)

**Estado:** 🔵 ABIERTA  
**Prioridad:** Alta  
**Tipo:** Nueva Funcionalidad  
**Spec padre:** Spec-007  
**Plan origen:** PLAN-002 (T-07d)

---

## Propósito

Implementar patrón dual-path en la pestaña Control de Eficacia: **primero desde NCProyectoDetailVM**, si no está disponible **fallback** a NCProyectoOperaciones.

---

## ADDED Requirements

### Requirement: Carga dual-path desde ViewModel para Control de Eficacia

El formulario **DEBE** cargar `ControlEficacia`, `FechaControlEficacia` y `ConformeControlEficacia` desde `NCProyectoDetailVM` si está disponible. **SI** no lo está, **ENTONCES** hacer fallback a `NCProyectoOperaciones`.

#### Scenario: Carga de ControlEficacia desde VM

- GIVEN `m_VM` no es Nothing Y `m_VM.EstaCargado = True`
- WHEN se carga la pestaña ControlEficacia
- THEN cargar campos desde VM

#### Scenario: Fallback ControlEficacia

- GIVEN `m_VM` es Nothing O `m_VM.EstaCargado = False`
- WHEN se carga la pestaña
- THEN usar `NCProyectoOperaciones` para obtener el valor

---

## Datos disponibles en VM

| Propiedad | Descripción |
|----------|-------------|
| `ControlEficacia` | Estado del control de eficacia |
| `FechaControlEficacia` | Fecha del control |
| `ConformeControlEficacia` | Si fue conforme o no |
| `RequiereControlEficacia` | Si requiere control |

---

## Plan de Intervención

### Intervención 1: Añadir CargarControlEficacia() con dual-path

**Archivo:** `src/forms/Form_FormNCProyectoControlEficacia.cls`

```vba
Private Sub CargarControlEficacia()
    If Not m_VM Is Nothing And m_VM.EstaCargado Then
        Me.txtControlEficacia = m_VM.ControlEficacia
        Me.txtFechaControlEficacia = m_VM.FechaControlEficacia
        Me.cboConforme = m_VM.ConformeControlEficacia
        Me.chkRequiereCE = (m_VM.RequiereControlEficacia = "Sí")
    Else
        ' Path fallback usando NCProyectoOperaciones
        Dim objNC As NCProyecto
        Set objNC = constructor.getNCProyecto(p_IDNC:=m_IDNCActiva)
        Me.txtControlEficacia = objNC.ControlEficacia
        ' ... etc
    End If
End Sub
```

---

## Criterios de Verificación

- [ ] Sin regresiones en ControlEficacia
- [ ] VM se usa cuando está disponible
- [ ] Fallback funciona cuando VM no está
- [ ] Access cerrado antes de importar .cls

---

## Importación Access

- **Tipo de cambio:** Solo código (.cls)
- **Comando:** `node cli.js import Form_FormNCProyectoControlEficacia`
