Option Compare Database
Option Explicit

'========================================================
' Test Spec-007d: ControlEficacia Dual-Path
' Valida que NCProyectoDetailVM proporciona datos de ControlEficacia
' y que el formulario puede consumirlos correctamente
'========================================================

Private Sub Test001_PropiedadesControlEficaciaEnVM()
    '====================================================
    '[TEST] Test001_PropiedadesControlEficaciaEnVM
    ' GIVEN: NCProyectoDetailVM cargado para NC con ControlEficacia
    ' WHEN:  Se leen propiedades del VM
    ' THEN:  ControlEficacia, FechaControlEficacia, ConformeControlEficacia,
    '        RequiereControlEficacia deben ser accesibles
    ' RESULT: PASS si todas las propiedades son legibles
    '====================================================
    Dim m_VM As NCProyectoDetailVM
    Dim m_Error As String
    Dim m_Result As Boolean
    Dim m_Passed As Boolean
    
    m_Passed = True
    m_Result = False
    
    Debug.Print ""
    Debug.Print "[TEST] Test001_PropiedadesControlEficaciaEnVM"
    Debug.Print "  GIVEN: NCProyectoDetailVM cargado para NC=405"
    Debug.Print "  WHEN:  Se leen propiedades ControlEficacia del VM"
    Debug.Print "  THEN:  VM.ControlEficacia, VM.FechaControlEficacia,"
    Debug.Print "         VM.ConformeControlEficacia, VM.RequiereControlEficacia accesibles"
    
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
    
    ' THEN: Verificar propiedades accesibles (no produce error)
    Dim m_CE As String
    Dim m_FCE As Date
    Dim m_CCE As String
    Dim m_RCE As String
    
    m_CE = m_VM.ControlEficacia
    m_FCE = m_VM.FechaControlEficacia
    m_CCE = m_VM.ConformeControlEficacia
    m_RCE = m_VM.RequiereControlEficacia
    
    Debug.Print "  ControlEficacia: " & m_CE
    Debug.Print "  FechaControlEficacia: " & IIf(m_FCE = 0, "(vacio)", Format(m_FCE, "yyyy-mm-dd"))
    Debug.Print "  ConformeControlEficacia: " & m_CCE
    Debug.Print "  RequiereControlEficacia: " & m_RCE
    
    m_Result = True
    Debug.Print "  RESULT: PASS"
    Exit Sub
    
testFail:
    Debug.Print "  RESULT: FAIL - Error: " & Err.Number & ": " & Err.Description
End Sub

Private Sub Test002_VMNoDisponible_ChequeaPropiedadEstaCargado()
    '====================================================
    '[TEST] Test002_VMNoDisponible_ChequeaPropiedadEstaCargado
    ' GIVEN: NCProyectoDetailVM sin cargar (sin ID)
    ' WHEN:  Se verifica EstaCargado
    ' THEN:  EstaCargado = False
    ' RESULT: PASS si el fallback es triggereable
    '====================================================
    Dim m_VM As NCProyectoDetailVM
    Dim m_Error As String
    Dim m_Passed As Boolean
    
    m_Passed = True
    
    Debug.Print ""
    Debug.Print "[TEST] Test002_VMNoDisponible_ChequeaPropiedadEstaCargado"
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
    
    Debug.Print "  RESULT: PASS - VM no cargado, fallback disparado"
    Exit Sub
    
testFail:
    Debug.Print "  RESULT: FAIL - Error: " & Err.Number & ": " & Err.Description
End Sub

Private Sub Test003_VerificaRutaDual_CargaVMvsFallback()
    '====================================================
    '[TEST] Test003_VerificaRutaDual_CargaVMvsFallback
    ' GIVEN: Dos VMs, uno cargado y uno no
    ' WHEN:  Se evalua la condicion dual-path
    ' THEN:  VM1 dispara path VM, VM2 dispara path fallback
    ' RESULT: PASS si la logica dual-path es correcta
    '====================================================
    Dim m_VMCargado As NCProyectoDetailVM
    Dim m_VMNoCargado As NCProyectoDetailVM
    Dim m_Error As String
    Dim m_PathVM As Boolean
    Dim m_PathFallback As Boolean
    
    Debug.Print ""
    Debug.Print "[TEST] Test003_VerificaRutaDual_CargaVMvsFallback"
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

Private Sub Test004_ControlEficacia_conNCReal()
    '====================================================
    '[TEST] Test004_ControlEficacia_conNCReal
    ' GIVEN: NCProyectoDetailVM con ID real que tiene ControlEficacia
    ' WHEN:  Se leen valores de ControlEficacia
    ' THEN:  Los valores deben ser consistentes con el dominio
    ' RESULT: PASS si datos son coherentes
    '====================================================
    Dim m_VM As NCProyectoDetailVM
    Dim m_Error As String
    Dim m_ControlEficacia As String
    Dim m_FechaCE As Date
    Dim m_ConformeCE As String
    Dim m_RequiereCE As String
    
    Debug.Print ""
    Debug.Print "[TEST] Test004_ControlEficacia_conNCReal"
    Debug.Print "  GIVEN: NC=405 con datos de ControlEficacia"
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
    m_ControlEficacia = m_VM.ControlEficacia
    m_FechaCE = m_VM.FechaControlEficacia
    m_ConformeCE = m_VM.ConformeControlEficacia
    m_RequiereCE = m_VM.RequiereControlEficacia
    
    Debug.Print "  Valores leidos:"
    Debug.Print "    ControlEficacia: " & IIf(m_ControlEficacia = "", "(vacio)", m_ControlEficacia)
    Debug.Print "    FechaControlEficacia: " & IIf(m_FechaCE = 0, "(vacio)", Format(m_FechaCE, "yyyy-mm-dd"))
    Debug.Print "    ConformeControlEficacia: " & IIf(m_ConformeCE = "", "(vacio)", m_ConformeCE)
    Debug.Print "    RequiereControlEficacia: " & IIf(m_RequiereCE = "", "(vacio)", m_RequiereCE)
    
    ' THEN: Verificar consistencia logica
    ' Si FechaControlEficacia tiene valor, ConformeControlEficacia deberia tener valor
    If m_FechaCE <> 0 And m_ConformeCE = "" Then
        Debug.Print "  INCONSISTENCIA: FechaCE tiene valor pero ConformeCE esta vacio"
        Debug.Print "  RESULT: WARN - Datos inconsistentes en origen"
        Exit Sub
    End If
    
    ' Si RequiereControlEficacia = "No" entonces ControlEficacia podria estar vacio
    ' Si RequiereControlEficacia = "Si" entonces ControlEficacia deberia tener valor o estar en proceso
    Debug.Print "  RESULT: PASS - Datos leidos correctamente"
    Exit Sub
    
testFail:
    Debug.Print "  RESULT: FAIL - Error: " & Err.Number & ": " & Err.Description
End Sub

'========================================================
' Test_Spec007d_RunAll
' Ejecutor principal - corre todos los tests de Spec-007d
'========================================================
Public Sub Test_Spec007d_RunAll()
    Dim m_Start As Date
    Dim m_End As Date
    Dim m_Duration As String
    
    m_Start = Now
    
    Debug.Print "=========================================="
    Debug.Print "INICIANDO BATERIA: Spec-007d_ControlEficacia"
    Debug.Print "Fecha: " & Format(Now, "yyyy-mm-dd hh:nn:ss")
    Debug.Print "=========================================="
    Debug.Print ""
    
    ' Ejecutar cada test
    Call Test001_PropiedadesControlEficaciaEnVM
    Call Test002_VMNoDisponible_ChequeaPropiedadEstaCargado
    Call Test003_VerificaRutaDual_CargaVMvsFallback
    Call Test004_ControlEficacia_conNCReal
    
    m_End = Now
    m_Duration = Format(TimeValue(m_End - m_Start), "hh:nn:ss")
    
    Debug.Print ""
    Debug.Print "=========================================="
    Debug.Print "BATERIA COMPLETADA"
    Debug.Print "Tiempo total: " & m_Duration
    Debug.Print "=========================================="
    
    MsgBox "Spec-007d: Bateria completada." & vbNewLine & _
           "Ver resultados en ventana de debug.", _
           vbInformation, "Test Spec-007d"
End Sub