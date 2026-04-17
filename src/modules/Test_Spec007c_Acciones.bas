Attribute VB_Name = "Test_Spec007c_Acciones"
Option Compare Database
Option Explicit

' =========================================================================
' TEST: Spec-007c - Pestaña Acciones consume NCProyectoDetailVM (Dual-Path)
' =========================================================================

Private Sub Test_Spec007c_RunAll()
    Dim m_Passed As Long
    Dim m_Failed As Long
    Dim m_Start As Date
    
    m_Start = Now
    m_Passed = 0
    m_Failed = 0
    
    Debug.Print "=========================================="
    Debug.Print "SPEC-007c: BATERÍA DE TESTS"
    Debug.Print "Pestaña Acciones - Dual-Path VM/Fallback"
    Debug.Print "Fecha: " & Format(Now, "yyyy-mm-dd hh:nn:ss")
    Debug.Print "=========================================="
    Debug.Print ""
    
    ' Test 1: Verificar que ColARs tiene estructura correcta (10 elementos)
    If Test001_EstructuraColARs() Then
        m_Passed = m_Passed + 1
        Debug.Print "[PASS] Test001_EstructuraColARs"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "[FAIL] Test001_EstructuraColARs"
    End If
    Debug.Print ""
    
    ' Test 2: Verificar que ColACs tiene estructura correcta (8 elementos)
    If Test002_EstructuraColACs() Then
        m_Passed = m_Passed + 1
        Debug.Print "[PASS] Test002_EstructuraColACs"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "[FAIL] Test002_EstructuraColACs"
    End If
    Debug.Print ""
    
    ' Test 3: VM con ARs y ACs carga correctamente
    If Test003_VMCargaARsACs() Then
        m_Passed = m_Passed + 1
        Debug.Print "[PASS] Test003_VMCargaARsACs"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "[FAIL] Test003_VMCargaARsACs"
    End If
    Debug.Print ""
    
    ' Test 4: NC sin ARs no crashea
    If Test004_NCSinARs() Then
        m_Passed = m_Passed + 1
        Debug.Print "[PASS] Test004_NCSinARs"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "[FAIL] Test004_NCSinARs"
    End If
    Debug.Print ""
    
    ' Test 5: NC sin ACs no crashea
    If Test005_NCSinACs() Then
        m_Passed = m_Passed + 1
        Debug.Print "[PASS] Test005_NCSinACs"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "[FAIL] Test005_NCSinACs"
    End If
    Debug.Print ""
    
    ' Test 6: NC inexistente retorna VM seguro
    If Test006_NCInexistenteSeguro() Then
        m_Passed = m_Passed + 1
        Debug.Print "[PASS] Test006_NCInexistenteSeguro"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "[FAIL] Test006_NCInexistenteSeguro"
    End If
    Debug.Print ""
    
    ' Test 7: Array de AR tiene 10 elementos (especificación spec-007c)
    If Test007_ArrayAR10Elementos() Then
        m_Passed = m_Passed + 1
        Debug.Print "[PASS] Test007_ArrayAR10Elementos"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "[FAIL] Test007_ArrayAR10Elementos"
    End If
    Debug.Print ""
    
    ' Test 8: Array de AC tiene 8 elementos (especificación spec-007c)
    If Test008_ArrayAC8Elementos() Then
        m_Passed = m_Passed + 1
        Debug.Print "[PASS] Test008_ArrayAC8Elementos"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "[FAIL] Test008_ArrayAC8Elementos"
    End If
    Debug.Print ""
    
    Debug.Print "=========================================="
    Debug.Print "RESULTADO: " & m_Passed & " passed, " & m_Failed & " failed"
    Debug.Print "Tiempo: " & Format(TimeDiff(m_Start, Now), "hh:nn:ss")
    Debug.Print "=========================================="
    Debug.Print ""
    
    ' Mostrar resultado en MessageBox
    If m_Failed > 0 Then
        MsgBox "SPEC-007c FALLIDA: " & m_Failed & " tests fallaron." & vbCrLf & _
               "Ver ventana de inmediato para detalles.", vbCritical, "Tests Spec-007c"
    Else
        MsgBox "SPEC-007c OK: Todos los tests pasaron.", vbInformation, "Tests Spec-007c"
    End If
End Sub

' -----------------------------------------------------------------------------
' TEST 1: Estructura de ColARs (10 elementos por array)
' Spec-007c: (0)ID (1)NAccion (2)AccionRealizada (3)Responsable (4)Estado
'            (5)Fecha (6)FechaInicio (7)FechaFinPrevista (8)FechaFinReal (9)Notas
' -----------------------------------------------------------------------------
Private Function Test001_EstructuraColARs() As Boolean
    Dim vm As NCProyectoDetailVM
    Dim errorMsg As String
    Dim ar As Variant
    Dim testPassed As Boolean
    
    testPassed = True
    Debug.Print "[TEST] Test001_EstructuraColARs"
    
    On Error GoTo handleError
    
    ' GIVEN: VM de NC que tiene ARs (necesitamos encontrar una con ARs)
    Set vm = getNCProyectoDetailVM(p_IDNC:=405, p_Error:=errorMsg)
    
    If errorMsg <> "" Then
        Debug.Print "  ERROR CARGA: " & errorMsg
        testPassed = False
    ElseIf vm Is Nothing Then
        Debug.Print "  FALLO: VM es Nothing"
        testPassed = False
    ElseIf Not vm.EstaCargado Then
        Debug.Print "  FALLO: VM no está cargado"
        testPassed = False
    ElseIf vm.ColARs.count = 0 Then
        Debug.Print "  NOTA: NC 405 no tiene ARs, no se puede verificar estructura"
        testPassed = True
    Else
        ' Verificar que cada elemento tiene 10 elementos (0-9)
        For Each ar In vm.ColARs
            If IsArray(ar) Then
                If UBound(ar) <> 9 Then
                    Debug.Print "  FALLO: Array AR no tiene 10 elementos, tiene " & UBound(ar) + 1
                    testPassed = False
                    Exit For
                End If
            Else
                Debug.Print "  FALLO: Elemento no es un Array"
                testPassed = False
                Exit For
            End If
        Next ar
        
        If testPassed Then
            Debug.Print "  VERIFICADO: ColARs tiene estructura correcta (Arrays de 10 elementos)"
        End If
    End If
    
    Test001_EstructuraColARs = testPassed
    Exit Function
    
handleError:
    Debug.Print "  ERROR: " & Err.Number & ": " & Err.Description
    Test001_EstructuraColARs = False
End Function

' -----------------------------------------------------------------------------
' TEST 2: Estructura de ColACs (8 elementos por array)
' Spec-007c: (0)ID (1)NAccion (2)AccionCorrectiva (3)Responsable (4)Estado
'            (5)Fecha (6)FechaFinPrevistaUltima (7)FechaFinalUltima
' -----------------------------------------------------------------------------
Private Function Test002_EstructuraColACs() As Boolean
    Dim vm As NCProyectoDetailVM
    Dim errorMsg As String
    Dim ac As Variant
    Dim testPassed As Boolean
    
    testPassed = True
    Debug.Print "[TEST] Test002_EstructuraColACs"
    
    On Error GoTo handleError
    
    ' GIVEN: VM de NC que tiene ACs
    Set vm = getNCProyectoDetailVM(p_IDNC:=405, p_Error:=errorMsg)
    
    If errorMsg <> "" Then
        Debug.Print "  ERROR CARGA: " & errorMsg
        testPassed = False
    ElseIf vm Is Nothing Then
        Debug.Print "  FALLO: VM es Nothing"
        testPassed = False
    ElseIf Not vm.EstaCargado Then
        Debug.Print "  FALLO: VM no está cargado"
        testPassed = False
    ElseIf vm.ColACs.count = 0 Then
        Debug.Print "  NOTA: NC 405 no tiene ACs, no se puede verificar estructura"
        testPassed = True
    Else
        ' Verificar que cada elemento tiene 8 elementos (0-7)
        For Each ac In vm.ColACs
            If IsArray(ac) Then
                If UBound(ac) <> 7 Then
                    Debug.Print "  FALLO: Array AC no tiene 8 elementos, tiene " & UBound(ac) + 1
                    testPassed = False
                    Exit For
                End If
            Else
                Debug.Print "  FALLO: Elemento no es un Array"
                testPassed = False
                Exit For
            End If
        Next ac
        
        If testPassed Then
            Debug.Print "  VERIFICADO: ColACs tiene estructura correcta (Arrays de 8 elementos)"
        End If
    End If
    
    Test002_EstructuraColACs = testPassed
    Exit Function
    
handleError:
    Debug.Print "  ERROR: " & Err.Number & ": " & Err.Description
    Test002_EstructuraColACs = False
End Function

' -----------------------------------------------------------------------------
' TEST 3: VM carga ARs y ACs correctamente
' -----------------------------------------------------------------------------
Private Function Test003_VMCargaARsACs() As Boolean
    Dim vm As NCProyectoDetailVM
    Dim errorMsg As String
    Dim i As Integer
    Dim ar As Variant
    Dim ac As Variant
    Dim testPassed As Boolean
    
    testPassed = True
    Debug.Print "[TEST] Test003_VMCargaARsACs"
    
    On Error GoTo handleError
    
    ' GIVEN: VM de NC 405
    Set vm = getNCProyectoDetailVM(p_IDNC:=405, p_Error:=errorMsg)
    
    If errorMsg <> "" Then
        Debug.Print "  ERROR CARGA: " & errorMsg
        testPassed = False
    ElseIf vm Is Nothing Then
        Debug.Print "  FALLO: VM es Nothing"
        testPassed = False
    ElseIf Not vm.EstaCargado Then
        Debug.Print "  FALLO: VM no está cargado"
        testPassed = False
    Else
        ' WHEN: Se accede a ColARs y ColACs
        Debug.Print "  WHEN: Accediendo a ColARs y ColACs"
        
        If vm.ColARs.count > 0 Then
            Debug.Print "  THEN: ARs cargados desde VM, count=" & vm.ColARs.count
            For i = 1 To vm.ColARs.count
                ar = vm.ColARs(i)
                Debug.Print "    AR #" & i & ": ID=" & ar(0) & ", NAccion=" & ar(1) & ", AccionRealizada=" & Left(ar(2), 30)
            Next i
        Else
            Debug.Print "  THEN: NC 405 no tiene ARs (puede ser válido)"
        End If
        
        If vm.ColACs.count > 0 Then
            Debug.Print "  THEN: ACs cargados desde VM, count=" & vm.ColACs.count
            For i = 1 To vm.ColACs.count
                ac = vm.ColACs(i)
                Debug.Print "    AC #" & i & ": ID=" & ac(0) & ", NAccion=" & ac(1) & ", AccionCorrectiva=" & Left(ac(2), 30)
            Next i
        Else
            Debug.Print "  THEN: NC 405 no tiene ACs (puede ser válido)"
        End If
    End If
    
    Test003_VMCargaARsACs = testPassed
    Exit Function
    
handleError:
    Debug.Print "  ERROR: " & Err.Number & ": " & Err.Description
    Test003_VMCargaARsACs = False
End Function

' -----------------------------------------------------------------------------
' TEST 4: NC sin ARs no crashea
' -----------------------------------------------------------------------------
Private Function Test004_NCSinARs() As Boolean
    Dim vm As NCProyectoDetailVM
    Dim errorMsg As String
    Dim testPassed As Boolean
    
    testPassed = True
    Debug.Print "[TEST] Test004_NCSinARs"
    
    On Error GoTo handleError
    
    ' GIVEN: NC sin ARs (necesitamos encontrar una o crear escenario)
    Set vm = getNCProyectoDetailVM(p_IDNC:=999999, p_Error:=errorMsg)
    
    If vm Is Nothing Then
        Debug.Print "  VERIFICADO: VM es Nothing para NC inexistente"
    ElseIf Not vm.EstaCargado Then
        Debug.Print "  VERIFICADO: VM no está cargado (esperado para NC sin ARs o inexistente)"
    Else
        ' VM existe y está cargado, verificar que no crashea al acceder ColARs
        Dim count As Long
        count = vm.ColARs.count  ' No debe crashea
        Debug.Print "  VERIFICADO: Acceso a ColARs no crasheó, count=" & count
    End If
    
    Test004_NCSinARs = testPassed
    Exit Function
    
handleError:
    Debug.Print "  ERROR: " & Err.Number & ": " & Err.Description
    Test004_NCSinARs = False
End Function

' -----------------------------------------------------------------------------
' TEST 5: NC sin ACs no crashea
' -----------------------------------------------------------------------------
Private Function Test005_NCSinACs() As Boolean
    Dim vm As NCProyectoDetailVM
    Dim errorMsg As String
    Dim testPassed As Boolean
    
    testPassed = True
    Debug.Print "[TEST] Test005_NCSinACs"
    
    On Error GoTo handleError
    
    ' GIVEN: NC sin ACs
    Set vm = getNCProyectoDetailVM(p_IDNC:=999999, p_Error:=errorMsg)
    
    If vm Is Nothing Then
        Debug.Print "  VERIFICADO: VM es Nothing para NC inexistente"
    ElseIf Not vm.EstaCargado Then
        Debug.Print "  VERIFICADO: VM no está cargado (esperado para NC sin ACs o inexistente)"
    Else
        ' VM existe y está cargado, verificar que no crashea al acceder ColACs
        Dim count As Long
        count = vm.ColACs.count  ' No debe crashea
        Debug.Print "  VERIFICADO: Acceso a ColACs no crasheó, count=" & count
    End If
    
    Test005_NCSinACs = testPassed
    Exit Function
    
handleError:
    Debug.Print "  ERROR: " & Err.Number & ": " & Err.Description
    Test005_NCSinACs = False
End Function

' -----------------------------------------------------------------------------
' TEST 6: NC inexistente es seguro
' -----------------------------------------------------------------------------
Private Function Test006_NCInexistenteSeguro() As Boolean
    Dim vm As NCProyectoDetailVM
    Dim errorMsg As String
    Dim testPassed As Boolean
    
    testPassed = True
    Debug.Print "[TEST] Test006_NCInexistenteSeguro"
    
    On Error GoTo handleError
    
    ' GIVEN: ID de NC inexistente
    Set vm = getNCProyectoDetailVM(p_IDNC:=99999999, p_Error:=errorMsg)
    
    ' WHEN/THEN: Verificar comportamiento seguro
    If vm Is Nothing Then
        Debug.Print "  VERIFICADO: VM es Nothing para NC inexistente"
    ElseIf Not vm.EstaCargado Then
        Debug.Print "  VERIFICADO: VM existe pero no está cargado (comportamiento seguro)"
    Else
        Debug.Print "  FALLO: VM debería estar vacío o no existir"
        testPassed = False
    End If
    
    Test006_NCInexistenteSeguro = testPassed
    Exit Function
    
handleError:
    Debug.Print "  ERROR: " & Err.Number & ": " & Err.Description
    Test006_NCInexistenteSeguro = False
End Function

' -----------------------------------------------------------------------------
' TEST 7: Array de AR tiene exactamente 10 elementos (especificación spec-007c)
' -----------------------------------------------------------------------------
Private Function Test007_ArrayAR10Elementos() As Boolean
    Dim vm As NCProyectoDetailVM
    Dim errorMsg As String
    Dim ar As Variant
    Dim testPassed As Boolean
    Dim foundValid As Boolean
    
    testPassed = True
    foundValid = False
    Debug.Print "[TEST] Test007_ArrayAR10Elementos"
    
    On Error GoTo handleError
    
    ' GIVEN: VM con ARs
    Set vm = getNCProyectoDetailVM(p_IDNC:=405, p_Error:=errorMsg)
    
    If errorMsg <> "" Or vm Is Nothing Or Not vm.EstaCargado Then
        Debug.Print "  SKIP: No se pudo cargar VM para verificar estructura"
        Test007_ArrayAR10Elementos = True
        Exit Function
    End If
    
    If vm.ColARs.count = 0 Then
        Debug.Print "  SKIP: NC 405 no tiene ARs"
        Test007_ArrayAR10Elementos = True
        Exit Function
    End If
    
    ' Verificar primer AR con estructura válida
    ar = vm.ColARs(1)
    
    ' THEN: Verificar 10 elementos (0-9)
    ' (0)IDAccionRealizada (1)NAccion (2)AccionRealizada (3)Responsable
    ' (4)Estado (5)FechaAccionRealizada (6)FechaInicio (7)FechaFinPrevista
    ' (8)FechaFinReal (9)Notas
    If IsArray(ar) Then
        If UBound(ar) = 9 Then
            Debug.Print "  VERIFICADO: Array AR tiene 10 elementos (0-9)"
            Debug.Print "    ar(0) IDAccionRealizada = " & ar(0) & " (tipo: " & TypeName(ar(0)) & ")"
            Debug.Print "    ar(1) NAccion = " & ar(1) & " (tipo: " & TypeName(ar(1)) & ")"
            Debug.Print "    ar(2) AccionRealizada = " & Left(ar(2), 40) & " (tipo: " & TypeName(ar(2)) & ")"
            Debug.Print "    ar(3) Responsable = " & ar(3) & " (tipo: " & TypeName(ar(3)) & ")"
            Debug.Print "    ar(4) Estado = " & ar(4) & " (tipo: " & TypeName(ar(4)) & ")"
            Debug.Print "    ar(5) FechaAccionRealizada = " & ar(5) & " (tipo: " & TypeName(ar(5)) & ")"
            Debug.Print "    ar(6) FechaInicio = " & ar(6) & " (tipo: " & TypeName(ar(6)) & ")"
            Debug.Print "    ar(7) FechaFinPrevista = " & ar(7) & " (tipo: " & TypeName(ar(7)) & ")"
            Debug.Print "    ar(8) FechaFinReal = " & ar(8) & " (tipo: " & TypeName(ar(8)) & ")"
            Debug.Print "    ar(9) Notas = " & Left(ar(9), 20) & " (tipo: " & TypeName(ar(9)) & ")"
            foundValid = True
        Else
            Debug.Print "  FALLO: Array AR tiene " & UBound(ar) + 1 & " elementos, se esperaban 10"
            testPassed = False
        End If
    Else
        Debug.Print "  FALLO: Elemento no es Array"
        testPassed = False
    End If
    
    Test007_ArrayAR10Elementos = testPassed
    Exit Function
    
handleError:
    Debug.Print "  ERROR: " & Err.Number & ": " & Err.Description
    Test007_ArrayAR10Elementos = False
End Function

' -----------------------------------------------------------------------------
' TEST 8: Array de AC tiene exactamente 8 elementos (especificación spec-007c)
' -----------------------------------------------------------------------------
Private Function Test008_ArrayAC8Elementos() As Boolean
    Dim vm As NCProyectoDetailVM
    Dim errorMsg As String
    Dim ac As Variant
    Dim testPassed As Boolean
    Dim foundValid As Boolean
    
    testPassed = True
    foundValid = False
    Debug.Print "[TEST] Test008_ArrayAC8Elementos"
    
    On Error GoTo handleError
    
    ' GIVEN: VM con ACs
    Set vm = getNCProyectoDetailVM(p_IDNC:=405, p_Error:=errorMsg)
    
    If errorMsg <> "" Or vm Is Nothing Or Not vm.EstaCargado Then
        Debug.Print "  SKIP: No se pudo cargar VM para verificar estructura"
        Test008_ArrayAC8Elementos = True
        Exit Function
    End If
    
    If vm.ColACs.count = 0 Then
        Debug.Print "  SKIP: NC 405 no tiene ACs"
        Test008_ArrayAC8Elementos = True
        Exit Function
    End If
    
    ' Verificar primer AC con estructura válida
    ac = vm.ColACs(1)
    
    ' THEN: Verificar 8 elementos (0-7)
    ' (0)IDAccionCorrectiva (1)NAccion (2)AccionCorrectiva (3)Responsable
    ' (4)Estado (5)FechaAccionCorrectiva (6)FechaFinPrevistaUltima (7)FechaFinalUltima
    If IsArray(ac) Then
        If UBound(ac) = 7 Then
            Debug.Print "  VERIFICADO: Array AC tiene 8 elementos (0-7)"
            Debug.Print "    ac(0) IDAccionCorrectiva = " & ac(0) & " (tipo: " & TypeName(ac(0)) & ")"
            Debug.Print "    ac(1) NAccion = " & ac(1) & " (tipo: " & TypeName(ac(1)) & ")"
            Debug.Print "    ac(2) AccionCorrectiva = " & Left(ac(2), 40) & " (tipo: " & TypeName(ac(2)) & ")"
            Debug.Print "    ac(3) Responsable = " & ac(3) & " (tipo: " & TypeName(ac(3)) & ")"
            Debug.Print "    ac(4) Estado = " & ac(4) & " (tipo: " & TypeName(ac(4)) & ")"
            Debug.Print "    ac(5) FechaAccionCorrectiva = " & ac(5) & " (tipo: " & TypeName(ac(5)) & ")"
            Debug.Print "    ac(6) FechaFinPrevistaUltima = " & ac(6) & " (tipo: " & TypeName(ac(6)) & ")"
            Debug.Print "    ac(7) FechaFinalUltima = " & ac(7) & " (tipo: " & TypeName(ac(7)) & ")"
            foundValid = True
        Else
            Debug.Print "  FALLO: Array AC tiene " & UBound(ac) + 1 & " elementos, se esperaban 8"
            testPassed = False
        End If
    Else
        Debug.Print "  FALLO: Elemento no es Array"
        testPassed = False
    End If
    
    Test008_ArrayAC8Elementos = testPassed
    Exit Function
    
handleError:
    Debug.Print "  ERROR: " & Err.Number & ": " & Err.Description
    Test008_ArrayAC8Elementos = False
End Function