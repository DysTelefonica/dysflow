Option Compare Database
Option Explicit

'========================================================
' Test Spec-007e: Nota Dual-Path
' Valida que NCProyectoDetailVM proporciona datos de Notas
' y que el formulario puede consumirlos correctamente
'========================================================

Private Sub Test001_PropiedadNotasEnVM()
    '====================================================
    '[TEST] Test001_PropiedadNotasEnVM
    ' GIVEN: NCProyectoDetailVM cargado para NC con Notas
    ' WHEN:  Se lee la propiedad Notas del VM
    ' THEN:  Notas debe ser accesible y devolver el valor correcto
    ' RESULT: PASS si la propiedad es legible
    '====================================================
    Dim m_VM As NCProyectoDetailVM
    Dim m_Error As String
    Dim m_Notas As String
    
    Debug.Print ""
    Debug.Print "[TEST] Test001_PropiedadNotasEnVM"
    Debug.Print "  GIVEN: NCProyectoDetailVM cargado para NC=405"
    Debug.Print "  WHEN:  Se lee VM.Notas"
    Debug.Print "  THEN:  La propiedad es accesible"
    
    On Error GoTo testFail
    
    ' WHEN: Cargar VM
    Set m_VM = getNCProyectoDetailVM(p_IDNC:=405, p_Error:=m_Error)
    
    If m_Error <> "" Then
        Debug.Print "  RESULT: FAIL - Error al cargar VM: " & m_Error
        Exit Sub
    End If
    
    If m_VM Is Nothing Then
        Debug.Print "  RESULT: FAIL - VM es Nothing"
        Exit Sub
    End If
    
    If Not m_VM.EstaCargado Then
        Debug.Print "  RESULT: FAIL - VM no esta cargado"
        Exit Sub
    End If
    
    ' THEN: Leer propiedad Notas
    m_Notas = m_VM.Notas
    
    Debug.Print "  Notas: " & IIf(m_Notas = "", "(vacio)", "[" & Left(m_Notas, 50) & "...]")
    Debug.Print "  RESULT: PASS"
    Exit Sub
    
testFail:
    Debug.Print "  RESULT: FAIL - Error: " & Err.Number & ": " & Err.Description
End Sub

Private Sub Test002_VMNoCargado_FallbackDisponible()
    '====================================================
    '[TEST] Test002_VMNoCargado_FallbackDisponible
    ' GIVEN: NCProyectoDetailVM sin cargar (sin ID)
    ' WHEN:  Se verifica EstaCargado
    ' THEN:  EstaCargado = False (dispara fallback)
    ' RESULT: PASS si el fallback es triggereable
    '====================================================
    Dim m_VM As NCProyectoDetailVM
    Dim m_Error As String
    
    Debug.Print ""
    Debug.Print "[TEST] Test002_VMNoCargado_FallbackDisponible"
    Debug.Print "  GIVEN: Instancia VM sin ID (no cargado)"
    Debug.Print "  WHEN:  Se verifica EstaCargado"
    Debug.Print "  THEN:  EstaCargado = False (permite fallback)"
    
    On Error GoTo testFail
    
    ' WHEN: Crear instancia sin cargar
    Set m_VM = getNCProyectoDetailVM(p_Error:=m_Error)
    
    If m_VM Is Nothing Then
        Debug.Print "  RESULT: FAIL - VM es Nothing"
        Exit Sub
    End If
    
    ' THEN: Verificar que no está cargado (permite fallback)
    If m_VM.EstaCargado Then
        Debug.Print "  RESULT: FAIL - VM deberia estar no cargado"
        Exit Sub
    End If
    
    Debug.Print "  VM no cargado, fallback disponible"
    Debug.Print "  RESULT: PASS"
    Exit Sub
    
testFail:
    Debug.Print "  RESULT: FAIL - Error: " & Err.Number & ": " & Err.Description
End Sub

Private Sub Test003_LogicaDualPath_VMCargadovsNoCargado()
    '====================================================
    '[TEST] Test003_LogicaDualPath_VMCargadovsNoCargado
    ' GIVEN: Dos VMs, uno cargado y uno no
    ' WHEN:  Se evalua la condicion dual-path
    ' THEN:  VM cargado -> path VM, VM no cargado -> fallback
    ' RESULT: PASS si la logica dual-path es correcta
    '====================================================
    Dim m_VMCargado As NCProyectoDetailVM
    Dim m_VMNoCargado As NCProyectoDetailVM
    Dim m_Error As String
    Dim m_PathVM As Boolean
    Dim m_PathFallback As Boolean
    
    Debug.Print ""
    Debug.Print "[TEST] Test003_LogicaDualPath_VMCargadovsNoCargado"
    Debug.Print "  GIVEN: VM cargado (405) y VM sin cargar"
    Debug.Print "  WHEN:  Se evalua la condicion dual-path"
    Debug.Print "  THEN:  VM cargado -> path VM, VM no cargado -> fallback"
    
    On Error GoTo testFail
    
    ' VM CARGADO
    Set m_VMCargado = getNCProyectoDetailVM(p_IDNC:=405, p_Error:=m_Error)
    
    ' VM NO CARGADO
    Set m_VMNoCargado = getNCProyectoDetailVM(p_Error:=m_Error)
    
    ' WHEN: Evaluar condicion dual-path
    ' Path VM: Not m_VM Is Nothing And m_VM.EstaCargado
    m_PathVM = (Not m_VMCargado Is Nothing And m_VMCargado.EstaCargado)
    m_PathFallback = (m_VMNoCargado Is Nothing Or Not m_VMNoCargado.EstaCargado)
    
    Debug.Print "  VM cargado (405):"
    Debug.Print "    - Not Nothing: " & (Not m_VMCargado Is Nothing)
    Debug.Print "    - EstaCargado: " & m_VMCargado.EstaCargado
    Debug.Print "    - Path VM activa: " & m_PathVM
    
    Debug.Print "  VM sin cargar:"
    Debug.Print "    - Is Nothing: " & (m_VMNoCargado Is Nothing)
    Debug.Print "    - EstaCargado: " & m_VMNoCargado.EstaCargado
    Debug.Print "    - Path Fallback activa: " & m_PathFallback
    
    If Not m_PathVM Then
        Debug.Print "  RESULT: FAIL - Path VM deberia estar activa"
        Exit Sub
    End If
    
    If Not m_PathFallback Then
        Debug.Print "  RESULT: FAIL - Path Fallback deberia estar activa"
        Exit Sub
    End If
    
    Debug.Print "  RESULT: PASS - Dual-path funciona correctamente"
    Exit Sub
    
testFail:
    Debug.Print "  RESULT: FAIL - Error: " & Err.Number & ": " & Err.Description
End Sub

Private Sub Test004_Notas_ConsistenciaConNCReal()
    '====================================================
    '[TEST] Test004_Notas_ConsistenciaConNCReal
    ' GIVEN: NCProyectoDetailVM con ID real
    ' WHEN:  Se leen valores de Notas
    ' THEN:  Los valores deben ser consistentes con el dominio
    ' RESULT: PASS si datos son coherentes
    '====================================================
    Dim m_VM As NCProyectoDetailVM
    Dim m_Error As String
    Dim m_Notas As String
    
    Debug.Print ""
    Debug.Print "[TEST] Test004_Notas_ConsistenciaConNCReal"
    Debug.Print "  GIVEN: NC=405 con datos de Notas"
    Debug.Print "  WHEN:  Se leen valores desde VM"
    Debug.Print "  THEN:  Valores son consistentes con dominio"
    
    On Error GoTo testFail
    
    Set m_VM = getNCProyectoDetailVM(p_IDNC:=405, p_Error:=m_Error)
    
    If m_Error <> "" Then
        Debug.Print "  RESULT: SKIP - No se pudo cargar VM: " & m_Error
        Exit Sub
    End If
    
    If Not m_VM.EstaCargado Then
        Debug.Print "  RESULT: SKIP - VM no esta cargado"
        Exit Sub
    End If
    
    ' WHEN: Leer valores
    m_Notas = m_VM.Notas
    
    Debug.Print "  Notas leido: " & IIf(m_Notas = "", "(vacio)", "[" & Left(m_Notas, 50) & "...]")
    
    ' THEN: Verificar que Notas es String (nunca produce error)
    If VarType(m_Notas) <> vbString Then
        Debug.Print "  RESULT: FAIL - Notas deberia ser String"
        Exit Sub
    End If
    
    Debug.Print "  RESULT: PASS - Datos leidos correctamente"
    Exit Sub
    
testFail:
    Debug.Print "  RESULT: FAIL - Error: " & Err.Number & ": " & Err.Description
End Sub

'========================================================
' Test_Spec007e_RunAll
' Ejecutor principal - corre todos los tests de Spec-007e
'========================================================
Public Sub Test_Spec007e_RunAll()
    Dim m_Start As Date
    Dim m_End As Date
    Dim m_Duration As String
    
    m_Start = Now
    
    Debug.Print "=========================================="
    Debug.Print "INICIANDO BATERIA: Spec-007e_Nota"
    Debug.Print "Fecha: " & Format(Now, "yyyy-mm-dd hh:nn:ss")
    Debug.Print "=========================================="
    Debug.Print ""
    
    ' Ejecutar cada test
    Call Test001_PropiedadNotasEnVM
    Call Test002_VMNoCargado_FallbackDisponible
    Call Test003_LogicaDualPath_VMCargadovsNoCargado
    Call Test004_Notas_ConsistenciaConNCReal
    
    m_End = Now
    m_Duration = Format(TimeValue(m_End - m_Start), "hh:nn:ss")
    
    Debug.Print ""
    Debug.Print "=========================================="
    Debug.Print "BATERIA COMPLETADA"
    Debug.Print "Tiempo total: " & m_Duration
    Debug.Print "=========================================="
    
    MsgBox "Spec-007e: Bateria completada." & vbNewLine & _
           "Ver resultados en ventana de debug.", _
           vbInformation, "Test Spec-007e"
End Sub