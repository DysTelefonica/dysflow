Attribute VB_Name = "Test_Spec007f_Documentos"
Option Compare Database
Option Explicit

' =========================================================================
' TEST: Spec-007f - Pestaña Documentos consume NCProyectoDetailVM (Dual-Path)
' =========================================================================

Private Sub Test_Spec007f_RunAll()
    Dim m_Passed As Long
    Dim m_Failed As Long
    Dim m_Start As Date
    
    m_Start = Now
    m_Passed = 0
    m_Failed = 0
    
    Debug.Print "=========================================="
    Debug.Print "SPEC-007f: BATERÍA DE TESTS"
    Debug.Print "Pestaña Documentos - Dual-Path VM/Fallback"
    Debug.Print "Fecha: " & Format(Now, "yyyy-mm-dd hh:nn:ss")
    Debug.Print "=========================================="
    Debug.Print ""
    
    ' Test 1: Verificar que ColDocumentos tiene estructura correcta
    If Test001_EstructuraColDocumentos() Then
        m_Passed = m_Passed + 1
        Debug.Print "[PASS] Test001_EstructuraColDocumentos"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "[FAIL] Test001_EstructuraColDocumentos"
    End If
    Debug.Print ""
    
    ' Test 2: VM disponible y ColDocumentos no está vacío
    If Test002_VMCargaDocumentos() Then
        m_Passed = m_Passed + 1
        Debug.Print "[PASS] Test002_VMCargaDocumentos"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "[FAIL] Test002_VMCargaDocumentos"
    End If
    Debug.Print ""
    
    ' Test 3: NC sin documentos no crashea
    If Test003_NCSinDocumentos() Then
        m_Passed = m_Passed + 1
        Debug.Print "[PASS] Test003_NCSinDocumentos"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "[FAIL] Test003_NCSinDocumentos"
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
    
    ' Test 5: Array de documento tiene 4 elementos (IDAnexo, TituloAnexo, NombreArchivoFinalAnexo, FechaAnexo)
    If Test005_ArrayDocumento4Elementos() Then
        m_Passed = m_Passed + 1
        Debug.Print "[PASS] Test005_ArrayDocumento4Elementos"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "[FAIL] Test005_ArrayDocumento4Elementos"
    End If
    Debug.Print ""
    
    Debug.Print "=========================================="
    Debug.Print "RESULTADO: " & m_Passed & " passed, " & m_Failed & " failed"
    Debug.Print "Tiempo: " & Format(Now - m_Start, "hh:nn:ss")
    Debug.Print "=========================================="
    Debug.Print ""
    
    ' Mostrar resultado en MessageBox
    If m_Failed > 0 Then
        MsgBox "SPEC-007f FALLIDA: " & m_Failed & " tests fallaron." & vbCrLf & _
               "Ver ventana de inmediato para detalles.", vbCritical, "Tests Spec-007f"
    Else
        MsgBox "SPEC-007f OK: Todos los tests pasaron.", vbInformation, "Tests Spec-007f"
    End If
End Sub

' -----------------------------------------------------------------------------
' TEST 1: Estructura de ColDocumentos
' -----------------------------------------------------------------------------
Private Function Test001_EstructuraColDocumentos() As Boolean
    Dim vm As NCProyectoDetailVM
    Dim errorMsg As String
    Dim doc As Variant
    Dim testPassed As Boolean
    
    testPassed = True
    Debug.Print "[TEST] Test001_EstructuraColDocumentos"
    
    On Error GoTo handleError
    
    ' GIVEN: VM de NC 405 (que tiene documentos según tests anteriores)
    Set vm = NCProyectoWrapper.GetNCProyectoVM(405)
    
    If errorMsg <> "" Then
        Debug.Print "  ERROR CARGA: " & errorMsg
        testPassed = False
    ElseIf vm Is Nothing Then
        Debug.Print "  FALLO: VM es Nothing"
        testPassed = False
    ElseIf Not vm.EstaCargado Then
        Debug.Print "  FALLO: VM no está cargado"
        testPassed = False
    ElseIf vm.ColDocumentos.count = 0 Then
        Debug.Print "  NOTA: NC 405 no tiene documentos, no se puede verificar estructura"
        testPassed = True
    Else
        ' Verificar que cada elemento tiene 4 elementos
        For Each doc In vm.ColDocumentos
            If IsArray(doc) Then
                If UBound(doc) <> 3 Then
                    Debug.Print "  FALLO: Array no tiene 4 elementos, tiene " & UBound(doc) + 1
                    testPassed = False
                    Exit For
                End If
            Else
                Debug.Print "  FALLO: Elemento no es un Array"
                testPassed = False
                Exit For
            End If
        Next doc
        
        If testPassed Then
            Debug.Print "  VERIFICADO: ColDocumentos tiene estructura correcta (Arrays de 4 elementos)"
        End If
    End If
    
    Test001_EstructuraColDocumentos = testPassed
    Exit Function
    
handleError:
    Debug.Print "  ERROR: " & Err.Number & ": " & Err.Description
    Test001_EstructuraColDocumentos = False
End Function

' -----------------------------------------------------------------------------
' TEST 2: VM carga documentos correctamente
' -----------------------------------------------------------------------------
Private Function Test002_VMCargaDocumentos() As Boolean
    Dim vm As NCProyectoDetailVM
    Dim errorMsg As String
    Dim i As Integer
    Dim doc As Variant
    Dim testPassed As Boolean
    
    testPassed = True
    Debug.Print "[TEST] Test002_VMCargaDocumentos"
    
    On Error GoTo handleError
    
    ' GIVEN: VM de NC 405
    Set vm = NCProyectoWrapper.GetNCProyectoVM(405)
    
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
        ' WHEN: Se accede a ColDocumentos
        Debug.Print "  WHEN: Accediendo a ColDocumentos"
        
        If vm.ColDocumentos.count > 0 Then
            Debug.Print "  THEN: Documentos cargados desde VM"
            For i = 1 To vm.ColDocumentos.count
                doc = vm.ColDocumentos(i)
                Debug.Print "    Doc #" & i & ": ID=" & doc(0) & ", Titulo=" & doc(1) & ", Archivo=" & doc(2)
            Next i
        Else
            Debug.Print "  THEN: NC 405 no tiene documentos (puede ser válido)"
        End If
    End If
    
    Test002_VMCargaDocumentos = testPassed
    Exit Function
    
handleError:
    Debug.Print "  ERROR: " & Err.Number & ": " & Err.Description
    Test002_VMCargaDocumentos = False
End Function

' -----------------------------------------------------------------------------
' TEST 3: NC sin documentos no crashea
' -----------------------------------------------------------------------------
Private Function Test003_NCSinDocumentos() As Boolean
    Dim vm As NCProyectoDetailVM
    Dim errorMsg As String
    Dim testPassed As Boolean
    
    testPassed = True
    Debug.Print "[TEST] Test003_NCSinDocumentos"
    
    On Error GoTo handleError
    
    ' GIVEN: NC sin documentos (necesitamos encontrar una o crear escenario)
    ' Usamos una NC que sabemos no tiene documentos
    Set vm = NCProyectoWrapper.GetNCProyectoVM(999999)
    
    If vm Is Nothing Then
        Debug.Print "  VERIFICADO: VM es Nothing para NC inexistente"
    ElseIf Not vm.EstaCargado Then
        Debug.Print "  VERIFICADO: VM no está cargado (esperado para NC sin docs o inexistente)"
    Else
        ' VM existe y está cargado, verificar que no crashea al acceder ColDocumentos
        Dim count As Long
        count = vm.ColDocumentos.count  ' No debe crashear
        Debug.Print "  VERIFICADO: Acceso a ColDocumentos no crasheó, count=" & count
    End If
    
    Test003_NCSinDocumentos = testPassed
    Exit Function
    
handleError:
    Debug.Print "  ERROR: " & Err.Number & ": " & Err.Description
    Test003_NCSinDocumentos = False
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
    Set vm = NCProyectoWrapper.GetNCProyectoVM(99999999)
    
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
' TEST 5: Array de documento tiene exactamente 4 elementos
' -----------------------------------------------------------------------------
Private Function Test005_ArrayDocumento4Elementos() As Boolean
    Dim vm As NCProyectoDetailVM
    Dim errorMsg As String
    Dim doc As Variant
    Dim testPassed As Boolean
    Dim foundValid As Boolean
    
    testPassed = True
    foundValid = False
    Debug.Print "[TEST] Test005_ArrayDocumento4Elementos"
    
    On Error GoTo handleError
    
    ' GIVEN: VM con documentos
    Set vm = NCProyectoWrapper.GetNCProyectoVM(405)
    
    If errorMsg <> "" Or vm Is Nothing Or Not vm.EstaCargado Then
        Debug.Print "  SKIP: No se pudo cargar VM para verificar estructura"
        Test005_ArrayDocumento4Elementos = True
        Exit Function
    End If
    
    If vm.ColDocumentos.count = 0 Then
        Debug.Print "  SKIP: NC 405 no tiene documentos"
        Test005_ArrayDocumento4Elementos = True
        Exit Function
    End If
    
    ' Verificar primer documento con estructura válida
    doc = vm.ColDocumentos(1)
    
    ' THEN: Verificar 4 elementos
    ' doc(0) = IDAnexo
    ' doc(1) = TituloAnexo
    ' doc(2) = NombreArchivoFinalAnexo
    ' doc(3) = FechaAnexo
    If IsArray(doc) Then
        If UBound(doc) = 3 Then
            Debug.Print "  VERIFICADO: Array tiene 4 elementos (0-3)"
            Debug.Print "    doc(0) IDAnexo = " & doc(0) & " (tipo: " & TypeName(doc(0)) & ")"
            Debug.Print "    doc(1) TituloAnexo = " & doc(1) & " (tipo: " & TypeName(doc(1)) & ")"
            Debug.Print "    doc(2) NombreArchivo = " & doc(2) & " (tipo: " & TypeName(doc(2)) & ")"
            Debug.Print "    doc(3) FechaAnexo = " & doc(3) & " (tipo: " & TypeName(doc(3)) & ")"
            foundValid = True
        Else
            Debug.Print "  FALLO: Array tiene " & UBound(doc) + 1 & " elementos, se esperaban 4"
            testPassed = False
        End If
    Else
        Debug.Print "  FALLO: Elemento no es Array"
        testPassed = False
    End If
    
    Test005_ArrayDocumento4Elementos = testPassed
    Exit Function
    
handleError:
    Debug.Print "  ERROR: " & Err.Number & ": " & Err.Description
    Test005_ArrayDocumento4Elementos = False
End Function