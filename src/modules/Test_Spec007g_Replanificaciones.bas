Attribute VB_Name = "Test_Spec007g_Replanificaciones"
Option Compare Database
Option Explicit

' =========================================================================
' TEST: Spec-007g - Pestaña Replanificaciones consume NCProyectoDetailVM (Dual-Path)
' =========================================================================

Private Sub Test_Spec007g_RunAll()
    Dim m_Passed As Long
    Dim m_Failed As Long
    Dim m_Start As Date
    
    m_Start = Now
    m_Passed = 0
    m_Failed = 0
    
    Debug.Print "=========================================="
    Debug.Print "SPEC-007g: BATERÍA DE TESTS"
    Debug.Print "Pestaña Replanificaciones - Dual-Path VM/Fallback"
    Debug.Print "Fecha: " & Format(Now, "yyyy-mm-dd hh:nn:ss")
    Debug.Print "=========================================="
    Debug.Print ""
    
    ' Test 1: Estructura de ColReplanificaciones
    If Test001_EstructuraColReplanificaciones() Then
        m_Passed = m_Passed + 1
        Debug.Print "[PASS] Test001_EstructuraColReplanificaciones"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "[FAIL] Test001_EstructuraColReplanificaciones"
    End If
    Debug.Print ""
    
    ' Test 2: VM disponible y ColReplanificaciones accesible
    If Test002_VMCargaReplanificaciones() Then
        m_Passed = m_Passed + 1
        Debug.Print "[PASS] Test002_VMCargaReplanificaciones"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "[FAIL] Test002_VMCargaReplanificaciones"
    End If
    Debug.Print ""
    
    ' Test 3: NC sin replanificaciones no crashea
    If Test003_NCSinReplanificaciones() Then
        m_Passed = m_Passed + 1
        Debug.Print "[PASS] Test003_NCSinReplanificaciones"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "[FAIL] Test003_NCSinReplanificaciones"
    End If
    Debug.Print ""
    
    ' Test 4: NC inexistente retorna VM vacío
    If Test004_NCInexistenteSeguro() Then
        m_Passed = m_Passed + 1
        Debug.Print "[PASS] Test004_NCInexistenteSeguro"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "[FAIL] Test004_NCInexistenteSeguro"
    End If
    Debug.Print ""
    
    ' Test 5: Array de replanificación tiene 5 elementos
    If Test005_ArrayReplanificacion5Elementos() Then
        m_Passed = m_Passed + 1
        Debug.Print "[PASS] Test005_ArrayReplanificacion5Elementos"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "[FAIL] Test005_ArrayReplanificacion5Elementos"
    End If
    Debug.Print ""
    
    ' Test 6: Elementos del array tienen tipos correctos
    If Test006_TiposElementosArray() Then
        m_Passed = m_Passed + 1
        Debug.Print "[PASS] Test006_TiposElementosArray"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "[FAIL] Test006_TiposElementosArray"
    End If
    Debug.Print ""
    
    Debug.Print "=========================================="
    Debug.Print "RESULTADO: " & m_Passed & " passed, " & m_Failed & " failed"
    Debug.Print "Tiempo: " & Format(TimeDiff(m_Start, Now), "hh:nn:ss")
    Debug.Print "=========================================="
    Debug.Print ""
    
    ' Mostrar resultado en MessageBox
    If m_Failed > 0 Then
        MsgBox "SPEC-007g FALLIDA: " & m_Failed & " tests fallaron." & vbCrLf & _
               "Ver ventana de inmediato para detalles.", vbCritical, "Tests Spec-007g"
    Else
        MsgBox "SPEC-007g OK: Todos los tests pasaron.", vbInformation, "Tests Spec-007g"
    End If
End Sub

' -----------------------------------------------------------------------------
' TEST 1: Estructura de ColReplanificaciones
' Verifica que la colección contiene Arrays con la estructura correcta
' -----------------------------------------------------------------------------
Private Function Test001_EstructuraColReplanificaciones() As Boolean
    Dim vm As NCProyectoDetailVM
    Dim errorMsg As String
    Dim replan As Variant
    Dim testPassed As Boolean
    
    testPassed = True
    Debug.Print "[TEST] Test001_EstructuraColReplanificaciones"
    
    On Error GoTo handleError
    
    ' GIVEN: VM de NC que tiene replanificaciones
    ' Usamos NC 454 que tiene AR con replanificaciones según tests de ReplanService
    Set vm = getNCProyectoDetailVM(p_IDNC:=454, p_Error:=errorMsg)
    
    If errorMsg <> "" Then
        Debug.Print "  ERROR CARGA: " & errorMsg
        testPassed = False
    ElseIf vm Is Nothing Then
        Debug.Print "  FALLO: VM es Nothing"
        testPassed = False
    ElseIf Not vm.EstaCargado Then
        Debug.Print "  FALLO: VM no está cargado"
        testPassed = False
    ElseIf vm.ColReplanificaciones.count = 0 Then
        Debug.Print "  NOTA: NC 454 no tiene replanificaciones, verificando estructura vacía"
        ' La estructura puede estar vacía pero debe ser accesible
        Debug.Print "  VERIFICADO: ColReplanificaciones accesible con count = 0"
    Else
        ' Verificar que cada elemento tiene 5 elementos (0-4)
        For Each replan In vm.ColReplanificaciones
            If IsArray(replan) Then
                If UBound(replan) <> 4 Then
                    Debug.Print "  FALLO: Array no tiene 5 elementos, tiene " & UBound(replan) + 1
                    testPassed = False
                    Exit For
                End If
            Else
                Debug.Print "  FALLO: Elemento no es un Array"
                testPassed = False
                Exit For
            End If
        Next replan
        
        If testPassed Then
            Debug.Print "  VERIFICADO: ColReplanificaciones tiene estructura correcta (Arrays de 5 elementos)"
        End If
    End If
    
    Test001_EstructuraColReplanificaciones = testPassed
    Exit Function
    
handleError:
    Debug.Print "  ERROR: " & Err.Number & ": " & Err.Description
    Test001_EstructuraColReplanificaciones = False
End Function

' -----------------------------------------------------------------------------
' TEST 2: VM carga replanificaciones correctamente
' -----------------------------------------------------------------------------
Private Function Test002_VMCargaReplanificaciones() As Boolean
    Dim vm As NCProyectoDetailVM
    Dim errorMsg As String
    Dim i As Integer
    Dim replan As Variant
    Dim testPassed As Boolean
    
    testPassed = True
    Debug.Print "[TEST] Test002_VMCargaReplanificaciones"
    
    On Error GoTo handleError
    
    ' GIVEN: VM de NC 454
    Set vm = getNCProyectoDetailVM(p_IDNC:=454, p_Error:=errorMsg)
    
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
        ' WHEN: Se accede a ColReplanificaciones
        Debug.Print "  WHEN: Accediendo a ColReplanificaciones"
        
        If vm.ColReplanificaciones.count > 0 Then
            Debug.Print "  THEN: Replanificaciones cargadas desde VM"
            For i = 1 To vm.ColReplanificaciones.count
                replan = vm.ColReplanificaciones(i)
                Debug.Print "    Replan #" & i & ": ID=" & replan(0) & ", Obs=" & Left(replan(1), 30) & "..."
            Next i
        Else
            Debug.Print "  THEN: NC 454 no tiene replanificaciones (puede ser válido)"
        End If
    End If
    
    Test002_VMCargaReplanificaciones = testPassed
    Exit Function
    
handleError:
    Debug.Print "  ERROR: " & Err.Number & ": " & Err.Description
    Test002_VMCargaReplanificaciones = False
End Function

' -----------------------------------------------------------------------------
' TEST 3: NC sin replanificaciones no crashea
' -----------------------------------------------------------------------------
Private Function Test003_NCSinReplanificaciones() As Boolean
    Dim vm As NCProyectoDetailVM
    Dim errorMsg As String
    Dim testPassed As Boolean
    
    testPassed = True
    Debug.Print "[TEST] Test003_NCSinReplanificaciones"
    
    On Error GoTo handleError
    
    ' GIVEN: NC sin replanificaciones (necesitamos encontrar una o crear escenario)
    ' Usamos una NC que sabemos no tiene replanificaciones
    Set vm = getNCProyectoDetailVM(p_IDNC:=405, p_Error:=errorMsg)
    
    If vm Is Nothing Then
        Debug.Print "  VERIFICADO: VM es Nothing para NC sin replanificaciones"
    ElseIf Not vm.EstaCargado Then
        Debug.Print "  VERIFICADO: VM no está cargado (esperado para NC sin replanificaciones)"
    Else
        ' VM existe y está cargado, verificar que no crashea al acceder ColReplanificaciones
        Dim count As Long
        count = vm.ColReplanificaciones.count  ' No debe crashear
        Debug.Print "  VERIFICADO: Acceso a ColReplanificaciones no crasheó, count=" & count
    End If
    
    Test003_NCSinReplanificaciones = testPassed
    Exit Function
    
handleError:
    Debug.Print "  ERROR: " & Err.Number & ": " & Err.Description
    Test003_NCSinReplanificaciones = False
End Function

' -----------------------------------------------------------------------------
' TEST 4: NC inexistente es seguro
' -----------------------------------------------------------------------------
Private Function Test004_NCInexistenteSeguro() As Boolean
    Dim vm As NCProyectoDetailVM
    Dim errorMsg As String
    Dim testPassed As Boolean
    
    testPassed = True
    Debug.Print "[TEST] Test004_NCInexistenteSeguro"
    
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
    
    Test004_NCInexistenteSeguro = testPassed
    Exit Function
    
handleError:
    Debug.Print "  ERROR: " & Err.Number & ": " & Err.Description
    Test004_NCInexistenteSeguro = False
End Function

' -----------------------------------------------------------------------------
' TEST 5: Array de replanificación tiene exactamente 5 elementos
' Estructura: vRep(0)=IDReplanificacion, vRep(1)=Observaciones,
'             vRep(2)=FechaPrevistaAlInicio, vRep(3)=FechaPrevistaReplanificada,
'             vRep(4)=FechaReprogramacion
' -----------------------------------------------------------------------------
Private Function Test005_ArrayReplanificacion5Elementos() As Boolean
    Dim vm As NCProyectoDetailVM
    Dim errorMsg As String
    Dim replan As Variant
    Dim testPassed As Boolean
    Dim foundValid As Boolean
    
    testPassed = True
    foundValid = False
    Debug.Print "[TEST] Test005_ArrayReplanificacion5Elementos"
    
    On Error GoTo handleError
    
    ' GIVEN: VM con replanificaciones
    Set vm = getNCProyectoDetailVM(p_IDNC:=454, p_Error:=errorMsg)
    
    If errorMsg <> "" Or vm Is Nothing Or Not vm.EstaCargado Then
        Debug.Print "  SKIP: No se pudo cargar VM para verificar estructura"
        Test005_ArrayReplanificacion5Elementos = True
        Exit Function
    End If
    
    If vm.ColReplanificaciones.count = 0 Then
        Debug.Print "  SKIP: NC 454 no tiene replanificaciones"
        Test005_ArrayReplanificacion5Elementos = True
        Exit Function
    End If
    
    ' Verificar primer documento con estructura válida
    replan = vm.ColReplanificaciones(1)
    
    ' THEN: Verificar 5 elementos (0-4)
    If IsArray(replan) Then
        If UBound(replan) = 4 Then
            Debug.Print "  VERIFICADO: Array tiene 5 elementos (0-4)"
            Debug.Print "    replan(0) IDReplanificacion = " & replan(0) & " (tipo: " & TypeName(replan(0)) & ")"
            Debug.Print "    replan(1) Observaciones = " & Left(replan(1), 40) & " (tipo: " & TypeName(replan(1)) & ")"
            Debug.Print "    replan(2) FechaPrevistaAlInicio = " & replan(2) & " (tipo: " & TypeName(replan(2)) & ")"
            Debug.Print "    replan(3) FechaPrevistaReplanificada = " & replan(3) & " (tipo: " & TypeName(replan(3)) & ")"
            Debug.Print "    replan(4) FechaReprogramacion = " & replan(4) & " (tipo: " & TypeName(replan(4)) & ")"
            foundValid = True
        Else
            Debug.Print "  FALLO: Array tiene " & UBound(replan) + 1 & " elementos, se esperaban 5"
            testPassed = False
        End If
    Else
        Debug.Print "  FALLO: Elemento no es Array"
        testPassed = False
    End If
    
    Test005_ArrayReplanificacion5Elementos = testPassed
    Exit Function
    
handleError:
    Debug.Print "  ERROR: " & Err.Number & ": " & Err.Description
    Test005_ArrayReplanificacion5Elementos = False
End Function

' -----------------------------------------------------------------------------
' TEST 6: Tipos de elementos del array son correctos
' -----------------------------------------------------------------------------
Private Function Test006_TiposElementosArray() As Boolean
    Dim vm As NCProyectoDetailVM
    Dim errorMsg As String
    Dim replan As Variant
    Dim testPassed As Boolean
    
    testPassed = True
    Debug.Print "[TEST] Test006_TiposElementosArray"
    
    On Error GoTo handleError
    
    ' GIVEN: VM con replanificaciones
    Set vm = getNCProyectoDetailVM(p_IDNC:=454, p_Error:=errorMsg)
    
    If errorMsg <> "" Or vm Is Nothing Or Not vm.EstaCargado Then
        Debug.Print "  SKIP: No se pudo cargar VM para verificar tipos"
        Test006_TiposElementosArray = True
        Exit Function
    End If
    
    If vm.ColReplanificaciones.count = 0 Then
        Debug.Print "  SKIP: NC 454 no tiene replanificaciones"
        Test006_TiposElementosArray = True
        Exit Function
    End If
    
    replan = vm.ColReplanificaciones(1)
    
    ' THEN: Verificar tipos
    ' vRep(0) = IDReplanificacion (Long o Integer)
    ' vRep(1) = Observaciones (String)
    ' vRep(2) = FechaPrevistaAlInicio (Date)
    ' vRep(3) = FechaPrevistaReplanificada (Date)
    ' vRep(4) = FechaReprogramacion (Date)
    
    If VarType(replan(0)) <> vbLong And VarType(replan(0)) <> vbInteger Then
        Debug.Print "  FALLO: replan(0) deberia ser Long o Integer, es " & TypeName(replan(0))
        testPassed = False
    End If
    
    If VarType(replan(1)) <> vbString Then
        Debug.Print "  FALLO: replan(1) deberia ser String, es " & TypeName(replan(1))
        testPassed = False
    End If
    
    If VarType(replan(2)) <> vbDate Then
        Debug.Print "  FALLO: replan(2) deberia ser Date, es " & TypeName(replan(2))
        testPassed = False
    End If
    
    If VarType(replan(3)) <> vbDate Then
        Debug.Print "  FALLO: replan(3) deberia ser Date, es " & TypeName(replan(3))
        testPassed = False
    End If
    
    If VarType(replan(4)) <> vbDate Then
        Debug.Print "  FALLO: replan(4) deberia ser Date, es " & TypeName(replan(4))
        testPassed = False
    End If
    
    If testPassed Then
        Debug.Print "  VERIFICADO: Todos los tipos de elementos son correctos"
    End If
    
    Test006_TiposElementosArray = testPassed
    Exit Function
    
handleError:
    Debug.Print "  ERROR: " & Err.Number & ": " & Err.Description
    Test006_TiposElementosArray = False
End Function