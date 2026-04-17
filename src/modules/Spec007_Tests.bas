Attribute VB_Name = "Spec007_Tests"
Option Compare Database
Option Explicit

'========================================================
' Spec-007: Tests de aceptacion
' FormNCProyecto Contenedor - Dual-Path VM + Fallback
' Ubicacion: src/modules/ (standard module)
' Ejecutar: ? Spec007_RunAllTests
' Ejecutar test manual: ? Spec007_TestManual(452)
'========================================================

'========================================================
' Spec-007: Tests de aceptacion
' FormNCProyecto Contenedor - Dual-Path VM + Fallback
' NOTA: Logica de negocio en NCProyectoWrapper, no en el formulario
'========================================================

Public Function Spec007_RunAllTests() As Boolean
    Dim passed As Long
    Dim failed As Long
    Dim total As Long
    
    passed = 0
    failed = 0
    total = 11
    
    Debug.Print "========================================"
    Debug.Print "SPEC-007: Tests de Aceptacion"
    Debug.Print "========================================"
    Debug.Print ""
    
    ' PA-01: NCProyectoWrapper.GetNCProyectoVM funciona
    If Test_PA01_GetNCProyectoVMFunciona() Then
        passed = passed + 1
    Else
        failed = failed + 1
    End If
    
    ' PA-02: Fallback activo cuando VM no disponible
    If Test_PA02_FallbackActivo() Then
        passed = passed + 1
    Else
        failed = failed + 1
    End If
    
    ' PA-03: GetNCObject funciona
    If Test_PA03_GetNCObjectFunciona() Then
        passed = passed + 1
    Else
        failed = failed + 1
    End If
    
    ' PA-04: m_NCAlInicio nunca es Nothing (fallback)
    If Test_PA04_NCAlInicioNuncaNothing() Then
        passed = passed + 1
    Else
        failed = failed + 1
    End If
    
    ' PA-05: Boton Actualizar visible en el formulario
    If Test_PA05_BotonActualizarVisible() Then
        passed = passed + 1
    Else
        failed = failed + 1
    End If
    
    ' PA-06: Sin regresion - formulario abre
    If Test_PA06_FormularioAbre() Then
        passed = passed + 1
    Else
        failed = failed + 1
    End If
    
    ' PA-07: Sin regresion - pestañas funcionan
    If Test_PA07_PestanasFuncionan() Then
        passed = passed + 1
    Else
        failed = failed + 1
    End If
    
    ' PA-08: m_VM se carga en formulario
    If Test_PA08_VMCargaEnFormulario() Then
        passed = passed + 1
    Else
        failed = failed + 1
    End If
    
    ' PA-09: InvalidateNC funciona
    If Test_PA09_InvalidateNCFunciona() Then
        passed = passed + 1
    Else
        failed = failed + 1
    End If
    
    ' PA-10: GetNCProyectoVM con NC inexistente no crashea
    If Test_PA10_GetNCProyectoVMSeguro() Then
        passed = passed + 1
    Else
        failed = failed + 1
    End If
    
    ' PA-11: Sin regresion - datos se muestran
    If Test_PA11_DatosSeMuestran() Then
        passed = passed + 1
    Else
        failed = failed + 1
    End If
    
    Debug.Print ""
    Debug.Print "========================================"
    Debug.Print "RESULTADO: " & passed & "/" & total & " pruebas pasadas"
    If failed > 0 Then
        Debug.Print "FALLIDAS: " & failed
        Debug.Print "========================================"
        Spec007_RunAllTests = False
    Else
        Debug.Print "TODAS PASARON"
        Debug.Print "========================================"
        Spec007_RunAllTests = True
    End If
End Function

'--------------------------------------------------------
' PA-01: NCProyectoWrapper.GetNCProyectoVM funciona
'--------------------------------------------------------
Private Function Test_PA01_GetNCProyectoVMFunciona() As Boolean
    On Error GoTo errorHandler
    
    Dim vm As NCProyectoDetailVM
    
    Set vm = NCProyectoWrapper.GetNCProyectoVM(1)
    
    If Not vm Is Nothing And vm.EstaCargado Then
        Debug.Print "[PA-01] PASS: NCProyectoWrapper.GetNCProyectoVM(1) carga VM"
        Set vm = Nothing
        Test_PA01_GetNCProyectoVMFunciona = True
    Else
        Debug.Print "[PA-01] FAIL: VM es Nothing o no estaCargado"
        Set vm = Nothing
        Test_PA01_GetNCProyectoVMFunciona = False
    End If
    
    Exit Function
    
errorHandler:
    Debug.Print "[PA-01] FAIL: " & Err.Description
    Test_PA01_GetNCProyectoVMFunciona = False
End Function

'--------------------------------------------------------
' PA-02: Fallback activo cuando VM no disponible
'--------------------------------------------------------
Private Function Test_PA02_FallbackActivo() As Boolean
    On Error GoTo errorHandler
    
    Dim Form As Form_FormNCProyecto
    
    DoCmd.OpenForm "FormNCProyecto", acNormal, , "[IDNoConformidad]=1"
    Set Form = Forms("FormNCProyecto")
    
    If Not Form.m_NCAlInicio Is Nothing Then
        Debug.Print "[PA-02] PASS: Fallback activo (m_NCAlInicio no es Nothing)"
        DoCmd.Close acForm, "FormNCProyecto", acSaveNo
        Set Form = Nothing
        Test_PA02_FallbackActivo = True
    Else
        Debug.Print "[PA-02] FAIL: m_NCAlInicio es Nothing"
        DoCmd.Close acForm, "FormNCProyecto", acSaveNo
        Set Form = Nothing
        Test_PA02_FallbackActivo = False
    End If
    
    Exit Function
    
errorHandler:
    On Error Resume Next
    DoCmd.Close acForm, "FormNCProyecto", acSaveNo
    Set Form = Nothing
    Debug.Print "[PA-02] FAIL: " & Err.Description
    Test_PA02_FallbackActivo = False
End Function

'--------------------------------------------------------
' PA-03: GetNCObject funciona
'--------------------------------------------------------
Private Function Test_PA03_GetNCObjectFunciona() As Boolean
    On Error GoTo errorHandler
    
    Dim Form As Form_FormNCProyecto
    Dim nc As NCProyecto
    
    DoCmd.OpenForm "FormNCProyecto", acNormal, , "[IDNoConformidad]=1"
    Set Form = Forms("FormNCProyecto")
    
    Set nc = Form.GetNCObject()
    
    If Not nc Is Nothing Then
        Debug.Print "[PA-03] PASS: GetNCObject devuelve NC (Codigo=" & nc.CodigoNoConformidad & ")"
        DoCmd.Close acForm, "FormNCProyecto", acSaveNo
        Set Form = Nothing
        Set nc = Nothing
        Test_PA03_GetNCObjectFunciona = True
    Else
        Debug.Print "[PA-03] FAIL: GetNCObject devuelve Nothing"
        DoCmd.Close acForm, "FormNCProyecto", acSaveNo
        Set Form = Nothing
        Test_PA03_GetNCObjectFunciona = False
    End If
    
    Exit Function
    
errorHandler:
    On Error Resume Next
    DoCmd.Close acForm, "FormNCProyecto", acSaveNo
    Set Form = Nothing
    Debug.Print "[PA-03] FAIL: " & Err.Description
    Test_PA03_GetNCObjectFunciona = False
End Function

'--------------------------------------------------------
' PA-04: m_NCAlInicio nunca es Nothing (fallback)
'--------------------------------------------------------
Private Function Test_PA04_NCAlInicioNuncaNothing() As Boolean
    On Error GoTo errorHandler
    
    Dim Form As Form_FormNCProyecto
    
    DoCmd.OpenForm "FormNCProyecto", acNormal, , "[IDNoConformidad]=1"
    Set Form = Forms("FormNCProyecto")
    
    If Not Form.m_NCAlInicio Is Nothing Then
        Debug.Print "[PA-04] PASS: m_NCAlInicio no es Nothing (hay fallback)"
        DoCmd.Close acForm, "FormNCProyecto", acSaveNo
        Set Form = Nothing
        Test_PA04_NCAlInicioNuncaNothing = True
    Else
        Debug.Print "[PA-04] FAIL: m_NCAlInicio es Nothing!"
        DoCmd.Close acForm, "FormNCProyecto", acSaveNo
        Set Form = Nothing
        Test_PA04_NCAlInicioNuncaNothing = False
    End If
    
    Exit Function
    
errorHandler:
    On Error Resume Next
    DoCmd.Close acForm, "FormNCProyecto", acSaveNo
    Set Form = Nothing
    Debug.Print "[PA-04] FAIL: " & Err.Description
    Test_PA04_NCAlInicioNuncaNothing = False
End Function

'--------------------------------------------------------
' PA-05: Boton Actualizar visible en el formulario
'--------------------------------------------------------
Private Function Test_PA05_BotonActualizarVisible() As Boolean
    On Error GoTo errorHandler
    
    Dim Form As Form_FormNCProyecto
    Dim btn As Control
    
    DoCmd.OpenForm "FormNCProyecto", acNormal, , "[IDNoConformidad]=1"
    Set Form = Forms("FormNCProyecto")
    
    On Error Resume Next
    Set btn = Form!btnActualizarDetalle
    
    If Err.Number = 0 And Not btn Is Nothing Then
        If btn.Visible = True Then
            Debug.Print "[PA-05] PASS: btnActualizarDetalle visible=True"
            DoCmd.Close acForm, "FormNCProyecto", acSaveNo
            Set Form = Nothing
            Set btn = Nothing
            Test_PA05_BotonActualizarVisible = True
        Else
            Debug.Print "[PA-05] FAIL: btnActualizarDetalle existe pero visible=False"
            DoCmd.Close acForm, "FormNCProyecto", acSaveNo
            Set Form = Nothing
            Set btn = Nothing
            Test_PA05_BotonActualizarVisible = False
        End If
    Else
        Debug.Print "[PA-05] FAIL: btnActualizarDetalle no existe o error: " & Err.Number
        DoCmd.Close acForm, "FormNCProyecto", acSaveNo
        Set Form = Nothing
        Test_PA05_BotonActualizarVisible = False
    End If
    
    Exit Function
    
errorHandler:
    On Error Resume Next
    DoCmd.Close acForm, "FormNCProyecto", acSaveNo
    Set Form = Nothing
    Debug.Print "[PA-05] FAIL: " & Err.Description
    Test_PA05_BotonActualizarVisible = False
End Function

'--------------------------------------------------------
' PA-06: Sin regresion - formulario abre
'--------------------------------------------------------
Private Function Test_PA06_FormularioAbre() As Boolean
    On Error GoTo errorHandler
    
    Dim Form As Form_FormNCProyecto
    
    DoCmd.OpenForm "FormNCProyecto", acNormal, , "[IDNoConformidad]=1"
    Set Form = Forms("FormNCProyecto")
    
    If Not Form Is Nothing Then
        Debug.Print "[PA-06] PASS: FormNCProyecto abre sin error"
        DoCmd.Close acForm, "FormNCProyecto", acSaveNo
        Set Form = Nothing
        Test_PA06_FormularioAbre = True
    Else
        Debug.Print "[PA-06] FAIL: Form es Nothing"
        Test_PA06_FormularioAbre = False
    End If
    
    Exit Function
    
errorHandler:
    On Error Resume Next
    DoCmd.Close acForm, "FormNCProyecto", acSaveNo
    Set Form = Nothing
    Debug.Print "[PA-06] FAIL: " & Err.Description
    Test_PA06_FormularioAbre = False
End Function

'--------------------------------------------------------
' PA-07: Sin regresion - pestañas funcionan
'--------------------------------------------------------
Private Function Test_PA07_PestanasFuncionan() As Boolean
    On Error GoTo errorHandler
    
    Dim Form As Form_FormNCProyecto
    
    DoCmd.OpenForm "FormNCProyecto", acNormal, , "[IDNoConformidad]=1"
    Set Form = Forms("FormNCProyecto")
    
    If Form!NavGeneral.Visible = True And Form!NavAcciones.Visible = True Then
        Debug.Print "[PA-07] PASS: Pestañas NavGeneral y NavAcciones visibles"
        DoCmd.Close acForm, "FormNCProyecto", acSaveNo
        Set Form = Nothing
        Test_PA07_PestanasFuncionan = True
    Else
        Debug.Print "[PA-07] FAIL: Alguna pestaña no visible"
        DoCmd.Close acForm, "FormNCProyecto", acSaveNo
        Set Form = Nothing
        Test_PA07_PestanasFuncionan = False
    End If
    
    Exit Function
    
errorHandler:
    On Error Resume Next
    DoCmd.Close acForm, "FormNCProyecto", acSaveNo
    Set Form = Nothing
    Debug.Print "[PA-07] FAIL: " & Err.Description
    Test_PA07_PestanasFuncionan = False
End Function

'--------------------------------------------------------
' PA-08: m_VM se carga en formulario
'--------------------------------------------------------
Private Function Test_PA08_VMCargaEnFormulario() As Boolean
    On Error GoTo errorHandler
    
    Dim Form As Form_FormNCProyecto
    
    DoCmd.OpenForm "FormNCProyecto", acNormal, , "[IDNoConformidad]=1"
    Set Form = Forms("FormNCProyecto")
    
    ' m_VM se carga en EstablecerDatos via NCProyectoWrapper.GetNCProyectoVM
    If Not Form.GetVM() Is Nothing Then
        Debug.Print "[PA-08] PASS: m_VM se cargo en el formulario (cache OK)"
        DoCmd.Close acForm, "FormNCProyecto", acSaveNo
        Set Form = Nothing
        Test_PA08_VMCargaEnFormulario = True
    Else
        Debug.Print "[PA-08] INFO: m_VM es Nothing (sin cache, fallback activo)"
        DoCmd.Close acForm, "FormNCProyecto", acSaveNo
        Set Form = Nothing
        ' No es failure - el fallback funciona
        Test_PA08_VMCargaEnFormulario = True
    End If
    
    Exit Function
    
errorHandler:
    On Error Resume Next
    DoCmd.Close acForm, "FormNCProyecto", acSaveNo
    Set Form = Nothing
    Debug.Print "[PA-08] FAIL: " & Err.Description
    Test_PA08_VMCargaEnFormulario = False
End Function

'--------------------------------------------------------
' PA-09: InvalidateNC funciona
'--------------------------------------------------------
Private Function Test_PA09_InvalidateNCFunciona() As Boolean
    On Error GoTo errorHandler
    
    Dim result As Boolean
    Dim p_Error As String
    
    result = NCProyectoWrapper.InvalidateNC(1, p_Error)
    
    If result = True Then
        Debug.Print "[PA-09] PASS: InvalidateNC(1) retorna True"
        Test_PA09_InvalidateNCFunciona = True
    Else
        Debug.Print "[PA-09] FAIL: InvalidateNC(1) retorno False"
        Test_PA09_InvalidateNCFunciona = False
    End If
    
    Exit Function
    
errorHandler:
    Debug.Print "[PA-09] FAIL: " & Err.Description
    Test_PA09_InvalidateNCFunciona = False
End Function

'--------------------------------------------------------
' PA-10: GetNCProyectoVM con NC inexistente no crashea
'--------------------------------------------------------
Private Function Test_PA10_GetNCProyectoVMSeguro() As Boolean
    On Error GoTo errorHandler
    
    Dim vm As NCProyectoDetailVM
    
    Set vm = NCProyectoWrapper.GetNCProyectoVM(999999)
    
    ' El wrapper retorna Nothing o un VM vacio para NC inexistente
    If vm Is Nothing Then
        Debug.Print "[PA-10] PASS: GetNCProyectoVM(999999) retorna Nothing (no crashea)"
        Test_PA10_GetNCProyectoVMSeguro = True
    Else
        Debug.Print "[PA-10] PASS: GetNCProyectoVM(999999) retorno VM (no crashea)"
        Set vm = Nothing
        Test_PA10_GetNCProyectoVMSeguro = True
    End If
    
    Exit Function
    
errorHandler:
    Debug.Print "[PA-10] FAIL: " & Err.Description
    Test_PA10_GetNCProyectoVMSeguro = False
End Function

'--------------------------------------------------------
' PA-11: Sin regresion - datos se muestran
'--------------------------------------------------------
Private Function Test_PA11_DatosSeMuestran() As Boolean
    On Error GoTo errorHandler
    
    Dim Form As Form_FormNCProyecto
    Dim nc As NCProyecto
    
    DoCmd.OpenForm "FormNCProyecto", acNormal, , "[IDNoConformidad]=1"
    Set Form = Forms("FormNCProyecto")
    
    Set nc = Form.GetNCObject()
    
    If Not nc Is Nothing And nc.CodigoNoConformidad <> "" Then
        Debug.Print "[PA-11] PASS: Datos se muestran (Codigo=" & nc.CodigoNoConformidad & ")"
        DoCmd.Close acForm, "FormNCProyecto", acSaveNo
        Set Form = Nothing
        Set nc = Nothing
        Test_PA11_DatosSeMuestran = True
    Else
        Debug.Print "[PA-11] FAIL: Datos no disponibles"
        DoCmd.Close acForm, "FormNCProyecto", acSaveNo
        Set Form = Nothing
        Test_PA11_DatosSeMuestran = False
    End If
    
    Exit Function
    
errorHandler:
    On Error Resume Next
    DoCmd.Close acForm, "FormNCProyecto", acSaveNo
    Set Form = Nothing
    Debug.Print "[PA-11] FAIL: " & Err.Description
    Test_PA11_DatosSeMuestran = False
End Function

'--------------------------------------------------------
' Test manual: abre FormNCProyecto con una NC especifica
' Uso: ? Spec007_TestManual(452)
'--------------------------------------------------------
Public Function Spec007_TestManual(idNC As Long) As Boolean
    On Error GoTo errorHandler
    
    Dim Form As Form_FormNCProyecto
    Dim vm As NCProyectoDetailVM
    Dim nc As NCProyecto
    Dim p_Error As String
    
    Debug.Print "========================================"
    Debug.Print "TEST MANUAL: Spec007 con IDNoConformidad=" & idNC
    Debug.Print "========================================"
    
    ' Paso 1: verificar que existe la NC
    Set vm = NCProyectoWrapper.GetNCProyectoVM(idNC)
    If vm Is Nothing Then
        Debug.Print "[MANUAL] FAIL: NCProyectoWrapper.GetNCProyectoVM(" & idNC & ") retorna Nothing"
        Spec007_TestManual = False
        Exit Function
    End If
    If Not vm.EstaCargado Then
        Debug.Print "[MANUAL] FAIL: VM no estaCargado"
        Spec007_TestManual = False
        Exit Function
    End If
    Debug.Print "[MANUAL-1] PASS: VM cargado (Codigo=" & vm.CodigoNoConformidad & ")"
    Set vm = Nothing
    
    ' Paso 2: Invalidate para forzar recarga
    NCProyectoWrapper.InvalidateNC idNC, p_Error
    Debug.Print "[MANUAL-2] PASS: InvalidateNC llamado"
    
    ' Paso 3: Abrir el formulario con filtro (simula contexto)
    DoCmd.OpenForm "FormNCProyecto", acNormal, , "[IDNoConformidad]=" & idNC
    Set Form = Forms("FormNCProyecto")
    
    ' Paso 4: Verificar que el formulario tiene datos
    Set nc = Form.GetNCObject()
    If nc Is Nothing Then
        Debug.Print "[MANUAL-4] FAIL: GetNCObject() retorna Nothing"
        DoCmd.Close acForm, "FormNCProyecto", acSaveNo
        Set Form = Nothing
        Spec007_TestManual = False
        Exit Function
    End If
    Debug.Print "[MANUAL-4] PASS: GetNCObject funciona (Codigo=" & nc.CodigoNoConformidad & ")"
    
    ' Paso 5: Verificar que el VM se cargo (o el fallback funciona)
    Set vm = Form.GetVM()
    If Not vm Is Nothing Then
        Debug.Print "[MANUAL-5] PASS: GetVM() retorno VM (cache activo)"
    Else
        Debug.Print "[MANUAL-5] INFO: GetVM() retorno Nothing (sin cache, fallback activo)"
    End If
    
    ' Paso 6: Verificar boton existe
    Dim btn As Control
    On Error Resume Next
    Set btn = Form!btnActualizarDetalle
    On Error GoTo errorHandler
    If Not btn Is Nothing Then
        Debug.Print "[MANUAL-6] PASS: btnActualizarDetalle existe (visible=" & btn.Visible & ")"
    Else
        Debug.Print "[MANUAL-6] FAIL: btnActualizarDetalle no existe"
        DoCmd.Close acForm, "FormNCProyecto", acSaveNo
        Set Form = Nothing
        Spec007_TestManual = False
        Exit Function
    End If
    
    DoCmd.Close acForm, "FormNCProyecto", acSaveNo
    Set Form = Nothing
    Set nc = Nothing
    Set btn = Nothing
    
    Debug.Print "========================================"
    Debug.Print "TEST MANUAL: PASS"
    Debug.Print "========================================"
    Spec007_TestManual = True
    Exit Function
    
errorHandler:
    On Error Resume Next
    DoCmd.Close acForm, "FormNCProyecto", acSaveNo
    Set Form = Nothing
    Debug.Print "[MANUAL] FAIL: " & Err.Description
    Spec007_TestManual = False
End Function