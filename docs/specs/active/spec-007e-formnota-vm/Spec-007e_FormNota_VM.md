# Spec-007e: Pestaña Nota consume NCProyectoDetailVM (Dual-Path)

**Estado:** 🔵 ABIERTA  
**Prioridad:** Media  
**Tipo:** Nueva Funcionalidad  
**Spec padre:** Spec-007  
**Plan origen:** PLAN-002 (T-07e)

---

## Propósito

Implementar patrón dual-path en la pestaña Nota: **primero desde NCProyectoDetailVM.Notas**, si no está disponible **fallback** a NCProyectoOperaciones.

---

## ADDED Requirements

### Requirement: Carga dual-path del campo Notas

El formulario **DEBE** cargar el campo `Notas` desde `NCProyectoDetailVM.Notas` si el VM está disponible. **SI** no lo está, **ENTONCES** hacer fallback a `NCProyectoOperaciones`.

#### Scenario: Carga de Notas desde VM

- GIVEN `m_VM` no es Nothing Y `m_VM.EstaCargado = True`
- WHEN se carga la pestaña Notas
- THEN `Me.txtNotas = m_VM.Notas`

#### Scenario: Fallback Notas

- GIVEN `m_VM` es Nothing O `m_VM.EstaCargado = False`
- WHEN se carga la pestaña
- THEN usar `NCProyectoOperaciones` para obtener `Notas`

---

## Plan de Intervención

### Intervención 1: Añadir CargarNotas() con dual-path

**Archivo:** `src/forms/Form_FormNCProyectoNota.cls`

```vba
Private Sub CargarNotas()
    If Not m_VM Is Nothing And m_VM.EstaCargado Then
        Me.txtNotas = m_VM.Notas
    Else
        Dim objNC As NCProyecto
        Set objNC = constructor.getNCProyecto(p_IDNC:=m_IDNCActiva)
        Me.txtNotas = objNC.Notas
    End If
End Sub
```

---

## Criterios de Verificación

- [ ] Sin regresiones en Pestaña Nota
- [ ] VM se usa cuando está disponible
- [ ] Fallback funciona cuando VM no está
- [ ] Access cerrado antes de importar .cls

---

## Importación Access

- **Tipo de cambio:** Solo código (.cls)
- **Comando:** `node cli.js import Form_FormNCProyectoNota`
