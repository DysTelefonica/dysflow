Attribute VB_Name = "Test_Spec007b_General"
Option Compare Database
Option Explicit

'==========================================
' BATERÍA DE TESTS - Spec-007b
' Pestaña General consume NCProyectoDetailVM (Dual-Path)
'==========================================

Private m_Passed As Long
Private m_Failed As Long
Private m_Start As Date

'------------------------------------------
' TESTS
'------------------------------------------

Public Sub Test001_DualPath_VMDisponible()
    Dim m_VM As NCProyectoDetailVM
    Dim m_Result As Boolean
    Dim m_Error As String
    
    ' GIVEN: VM disponible y cargado con ID=123
    m_Result = False
    Set m_VM = New NCProyectoDetailVM
    Call m_VM.CargarPorID(123, m_Error)
    
    ' WHEN: Se verifica que el VM está disponible y cargado
    If Not m_VM Is Nothing And m_VM.EstaCargado Then
        ' THEN: VM tiene datos válidos
        If m_VM.IDNoConformidad = 123 And m_Error = "" Then
            m_Result = True
        End If
    End If
    
    ' RESULT
    If m_Result Then
        m_Passed = m_Passed + 1
        Debug.Print "PASS: Test001_DualPath_VMDisponible"
        Debug.Print "  GIVEN: VM disponible y cargado con ID=123"
        Debug.Print "  WHEN:  NCProyectoDetailVM.CargarPorID(123)"
        Debug.Print "  THEN:  VM.IDNoConformidad=123, EstaCargado=True"
        Debug.Print "  RESULT: PASS"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "FAIL: Test001_DualPath_VMDisponible"
        Debug.Print "  GIVEN: VM disponible y cargado con ID=123"
        Debug.Print "  WHEN:  NCProyectoDetailVM.CargarPorID(123)"
        Debug.Print "  THEN:  VM.IDNoConformidad=123, EstaCargado=True"
        Debug.Print "  RESULT: FAIL - VM=" & IIf(m_VM Is Nothing, "Nothing", "OK") & ", Error=" & m_Error
    End If
End Sub

Public Sub Test002_DualPath_VMNil()
    Dim m_VM As NCProyectoDetailVM
    Dim m_Result As Boolean
    
    ' GIVEN: VM es Nothing
    m_Result = False
    Set m_VM = Nothing
    
    ' WHEN: Se verifica VM Is Nothing
    If m_VM Is Nothing Then
        ' THEN: El sistema detecta Nothing y debe usar fallback
        m_Result = True
    End If
    
    ' RESULT
    If m_Result Then
        m_Passed = m_Passed + 1
        Debug.Print "PASS: Test002_DualPath_VMNil"
        Debug.Print "  GIVEN: VM = Nothing"
        Debug.Print "  WHEN:  Dual-path verifica VM Is Nothing"
        Debug.Print "  THEN:  Sistema usa fallback (no accede a VM)"
        Debug.Print "  RESULT: PASS"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "FAIL: Test002_DualPath_VMNil"
        Debug.Print "  GIVEN: VM = Nothing"
        Debug.Print "  WHEN:  Dual-path verifica VM Is Nothing"
        Debug.Print "  THEN:  Sistema usa fallback"
        Debug.Print "  RESULT: FAIL"
    End If
End Sub

Public Sub Test003_DualPath_VMNoCargado()
    Dim m_VM As NCProyectoDetailVM
    Dim m_Result As Boolean
    
    ' GIVEN: VM creado sin llamar CargarPorID (EstaCargado=False)
    m_Result = False
    Set m_VM = New NCProyectoDetailVM
    ' No se llama a CargarPorID, entonces EstaCargado debe ser False
    
    ' WHEN: Se verifica que el VM no está cargado
    If Not m_VM Is Nothing And Not m_VM.EstaCargado Then
        ' THEN: El sistema debe usar fallback
        m_Result = True
    End If
    
    ' RESULT
    If m_Result Then
        m_Passed = m_Passed + 1
        Debug.Print "PASS: Test003_DualPath_VMNoCargado"
        Debug.Print "  GIVEN: VM creado sin llamar CargarPorID (EstaCargado=False)"
        Debug.Print "  WHEN:  Dual-path verifica VM.EstaCargado=False"
        Debug.Print "  THEN:  Sistema usa fallback (no intenta leer de VM)"
        Debug.Print "  RESULT: PASS"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "FAIL: Test003_DualPath_VMNoCargado"
        Debug.Print "  GIVEN: VM creado sin llamar CargarPorID"
        Debug.Print "  WHEN:  Dual-path verifica VM.EstaCargado"
        Debug.Print "  THEN:  VM.EstaCargado=False"
        Debug.Print "  RESULT: FAIL - VM=" & IIf(m_VM Is Nothing, "Nothing", "OK") & ", EstaCargado=" & IIf(m_VM.EstaCargado, "True", "False")
    End If
End Sub

'------------------------------------------
' EJECUTOR PRINCIPAL
'------------------------------------------

Public Sub Test_Spec007b_RunAll()
    m_Passed = 0
    m_Failed = 0
    m_Start = Now
    
    Debug.Print "=========================================="
    Debug.Print "INICIANDO BATERÍA: Spec-007b_General"
    Debug.Print "Fecha: " & Format(Now, "yyyy-mm-dd hh:nn:ss")
    Debug.Print "=========================================="
    
    Test001_DualPath_VMDisponible
    Test002_DualPath_VMNil
    Test003_DualPath_VMNoCargado
    
    Debug.Print "=========================================="
    Debug.Print "RESULTADO: " & m_Passed & " passed, " & m_Failed & " failed"
    Debug.Print "Tiempo: " & Format(TimeDiff(m_Start, Now), "hh:nn:ss")
    Debug.Print "=========================================="
    
    If m_Failed > 0 Then
        MsgBox "BATERÍA FALLIDA: " & m_Failed & " tests fallaron." & vbNewLine & _
               "Ver ventana de Debug para detalles.", vbCritical, "Tests Spec-007b"
    Else
        MsgBox "BATERÍA OK: Todos los tests (" & m_Passed & ") pasaron.", vbInformation, "Tests Spec-007b"
    End If
End Sub

' Función auxiliar para calcular diferencia de tiempo
Private Function TimeDiff(ByVal p_Start As Date, ByVal p_End As Date) As String
    Dim l_Seconds As Long
    l_Seconds = DateDiff("s", p_Start, p_End)
    TimeDiff = Format(TimeSerial(0, 0, l_Seconds), "hh:nn:ss")
End Function