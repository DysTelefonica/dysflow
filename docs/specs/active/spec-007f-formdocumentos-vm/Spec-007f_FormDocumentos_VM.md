# Spec-007f: Pestaña Documentos consume NCProyectoDetailVM (Dual-Path)

**Estado:** 🔵 ABIERTA  
**Prioridad:** Media  
**Tipo:** Nueva Funcionalidad  
**Spec padre:** Spec-007  
**Plan origen:** PLAN-002 (T-07f)

---

## Propósito

Implementar patrón dual-path en la pestaña Documentos: **primero desde NCProyectoDetailVM.ColDocumentos**, si no está disponible **fallback** a DocumentoProyectoOperaciones.

---

## ADDED Requirements

### Requirement: Carga dual-path de lista de documentos

El formulario **DEBE** cargar la lista de documentos desde `NCProyectoDetailVM.ColDocumentos` si el VM está disponible. **SI** no lo está, **ENTONCES** hacer fallback usando `DocumentoProyectoOperaciones`.

#### Scenario: Carga de Documentos desde VM

- GIVEN `m_VM` no es Nothing Y `m_VM.EstaCargado = True`
- WHEN se cargan los documentos
- THEN iterar sobre `m_VM.ColDocumentos` y agregar al listado

#### Scenario: Fallback Documentos

- GIVEN `m_VM` es Nothing O `m_VM.EstaCargado = False`
- WHEN se cargan los documentos
- THEN consultar `TbAnexos` filtrado por `IDNoConformidad`

---

## Datos disponibles en VM

### ColDocumentos (Collection de Arrays)

| Índice | Campo |
|--------|-------|
| 0 | IDAnexo |
| 1 | TituloAnexo |
| 2 | NombreArchivoFinalAnexo |
| 3 | FechaAnexo |

---

## Plan de Intervención

### Intervención 1: Añadir CargarDocumentos() con dual-path

**Archivo:** `src/forms/Form_FormNCProyectoDocumentos.cls`

```vba
Private Sub CargarDocumentos()
    If Not m_VM Is Nothing And m_VM.EstaCargado Then
        Dim vDoc As Variant
        For Each vDoc In m_VM.ColDocumentos
            ' Agregar al subformulario de documentos
            ' vDoc(0) = IDAnexo, vDoc(1) = TituloAnexo, etc.
        Next vDoc
    Else
        ' Path fallback - DocumentoProyectoOperaciones
    End If
End Sub
```

---

## Criterios de Verificación

- [ ] Sin regresiones en Pestaña Documentos
- [ ] VM se usa cuando está disponible
- [ ] Fallback funciona cuando VM no está
- [ ] Access cerrado antes de importar .cls

---

## Importación Access

- **Tipo de cambio:** Solo código (.cls)
- **Comando:** `node cli.js import Form_FormNCProyectoDocumentos`
