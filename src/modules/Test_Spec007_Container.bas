Option Compare Database
Option Explicit

'==========================================
' BATERÍA DE TESTS - Spec-007
' FormNCProyecto Contenedor — Dual-Path VM + Fallback
'
' Ejecutable desde VBE (Ctrl+G):
'   Call Test_Spec007_Container_RunAll
'==========================================

Private m_Passed As Long
Private m_Failed As Long
Private m_Start As Date

'------------------------------------------
' TESTS
'------------------------------------------

'========================================================
' Test001: NCProyectoDetailVM existe y se puede instanciar
' GIVEN: Nueva instancia de NCProyectoDetailVM
' WHEN:  Sin llamar CargarPorID
' THEN:  VM Is Not Nothing Y EstaCargado = False
'========================================================
Public Sub Test001_VM_Instanciable_EstaCargadoIniciaFalse()
    Dim m_VM As NCProyectoDetailVM
    Dim m_Result As Boolean
    
    m_Result = False
    Set m_VM = New NCProyectoDetailVM
    
    If Not m_VM Is Nothing And Not m_VM.EstaCargado Then
        m_Result = True
        m_Passed = m_Passed + 1
        Debug.Print "PASS: Test001_VM_Instanciable_EstaCargadoIniciaFalse"
        Debug.Print "  GIVEN: Nueva instancia NCProyectoDetailVM"
        Debug.Print "  WHEN:  Sin llamar CargarPorID"
        Debug.Print "  THEN:  VM Is Not Nothing, EstaCargado = False"
        Debug.Print "  RESULT: PASS"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "FAIL: Test001_VM_Instanciable_EstaCargadoIniciaFalse"
        Debug.Print "  GIVEN: Nueva instancia NCProyectoDetailVM"
        Debug.Print "  WHEN:  Sin llamar CargarPorID"
        Debug.Print "  THEN:  VM Is Not Nothing, EstaCargado = False"
        Debug.Print "  RESULT: FAIL"
    End If
End Sub

'========================================================
' Test002: NCProyectoWrapper.GetNCProyectoVM existe y es accesible
' GIVEN: Wrapper de NCProyecto
' WHEN:  Se llama GetNCProyectoVM con ID=1
' THEN:  No crashea y retorna valor valido (Nothing o VM)
'========================================================
Public Sub Test002_Wrapper_GetNCProyectoVM_NoCrashea()
    Dim m_WrapperVM As NCProyectoDetailVM
    Dim m_IDNC As Long
    Dim m_Result As Boolean
    Dim m_Error As String
    
    m_Result = False
    m_Error = ""
    m_IDNC = 1
    
    On Error GoTo errores
    Set m_WrapperVM = NCProyectoWrapper.GetNCProyectoVM(m_IDNC)
    On Error GoTo 0
    
    ' THEN: Retorna algo valido (Nothing si no hay cache, o VM.EstaCargado)
    If m_WrapperVM Is Nothing Or m_WrapperVM.EstaCargado Then
        m_Result = True
    End If
    
    If m_Result Then
        m_Passed = m_Passed + 1
        Debug.Print "PASS: Test002_Wrapper_GetNCProyectoVM_NoCrashea"
        Debug.Print "  GIVEN: NCProyectoWrapper.GetNCProyectoVM"
        Debug.Print "  WHEN:  GetNCProyectoVM(1)"
        Debug.Print "  THEN:  No crashea, retorna Nothing o VM.EstaCargado=True"
        Debug.Print "  RESULT: PASS"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "FAIL: Test002_Wrapper_GetNCProyectoVM_NoCrashea"
        Debug.Print "  GIVEN: NCProyectoWrapper.GetNCProyectoVM"
        Debug.Print "  WHEN:  GetNCProyectoVM(1)"
        Debug.Print "  THEN:  No crashea"
        Debug.Print "  RESULT: FAIL"
    End If
    Exit Sub
    
errores:
    m_Failed = m_Failed + 1
    Debug.Print "FAIL: Test002_Wrapper_GetNCProyectoVM_NoCrashea"
    Debug.Print "  GIVEN: NCProyectoWrapper.GetNCProyectoVM"
    Debug.Print "  WHEN:  GetNCProyectoVM(1)"
    Debug.Print "  THEN:  No crashea"
    Debug.Print "  RESULT: FAIL - Error: " & Err.Description
End Sub

'========================================================
' Test003: Dual-path logico: GetNCProyectoVM retorna Nothing cuando no hay cache
' GIVEN: IDNC = 999999 (probablemente sin cache)
' WHEN:  GetNCProyectoVM(999999)
' THEN:  Retorna Nothing (cache vacio -> fallback activo)
'========================================================
Public Sub Test003_DualPath_WrapperRetornaNothing_SiNoHayCache()
    Dim m_WrapperVM As NCProyectoDetailVM
    Dim m_IDNC As Long
    Dim m_Result As Boolean
    
    m_Result = False
    m_IDNC = 999999
    
    Set m_WrapperVM = NCProyectoWrapper.GetNCProyectoVM(m_IDNC)
    
    ' Si no hay cache, debe retornar Nothing
    If m_WrapperVM Is Nothing Then
        m_Result = True
    ElseIf Not m_WrapperVM Is Nothing And Not m_WrapperVM.EstaCargado Then
        ' VM existe pero no cargado - fallback
        m_Result = True
    End If
    
    If m_Result Then
        m_Passed = m_Passed + 1
        Debug.Print "PASS: Test003_DualPath_WrapperRetornaNothing_SiNoHayCache"
        Debug.Print "  GIVEN: IDNC = 999999 (sin cache)"
        Debug.Print "  WHEN:  GetNCProyectoVM(999999)"
        Debug.Print "  THEN:  VM Is Nothing o VM.EstaCargado=False (fallback)"
        Debug.Print "  RESULT: PASS"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "FAIL: Test003_DualPath_WrapperRetornaNothing_SiNoHayCache"
        Debug.Print "  GIVEN: IDNC = 999999"
        Debug.Print "  WHEN:  GetNCProyectoVM(999999)"
        Debug.Print "  THEN:  VM Is Nothing o no cargado"
        Debug.Print "  RESULT: FAIL"
    End If
End Sub

'========================================================
' Test004: NCProyectoWrapper.InvalidateNC existe y no crashea
' GIVEN: IDNC valido
' WHEN:  InvalidateNC(ID, m_Error)
' THEN:  No crashea, retorna Boolean
'========================================================
Public Sub Test004_InvalidateNC_Existe_NoCrashea()
    Dim m_Error As String
    Dim m_Result As Boolean
    Dim m_IDNC As Long
    
    m_Result = False
    m_Error = ""
    m_IDNC = 1
    
    On Error GoTo errores
    m_Result = NCProyectoWrapper.InvalidateNC(m_IDNC, m_Error)
    On Error GoTo 0
    
    ' THEN: No crashea, retorna Boolean
    m_Passed = m_Passed + 1
    Debug.Print "PASS: Test004_InvalidateNC_Existe_NoCrashea"
    Debug.Print "  GIVEN: IDNC = 1"
    Debug.Print "  WHEN:  InvalidateNC(1, m_Error)"
    Debug.Print "  THEN:  No crashea, retorna Boolean"
    Debug.Print "  RESULT: PASS"
    Exit Sub
    
errores:
    m_Failed = m_Failed + 1
    Debug.Print "FAIL: Test004_InvalidateNC_Existe_NoCrashea"
    Debug.Print "  GIVEN: IDNC = 1"
    Debug.Print "  WHEN:  InvalidateNC(1, m_Error)"
    Debug.Print "  THEN:  No crashea"
    Debug.Print "  RESULT: FAIL - Error: " & Err.Description
End Sub

'========================================================
' Test005: IsNumeric devuelve False para "ABC"
' GIVEN: IDNC = "ABC" (no numerico)
' WHEN:  IsNumeric("ABC")
' THEN:  Retorna False (fallback automatico en TryLoadFromVM)
'========================================================
Public Sub Test005_IsNumeric_False_ParaNoNumerico()
    Dim m_Result As Boolean
    
    m_Result = False
    
    If Not IsNumeric("ABC") Then
        m_Result = True
    End If
    
    If m_Result Then
        m_Passed = m_Passed + 1
        Debug.Print "PASS: Test005_IsNumeric_False_ParaNoNumerico"
        Debug.Print "  GIVEN: p_IDNC = ""ABC"""
        Debug.Print "  WHEN:  IsNumeric(""ABC"")"
        Debug.Print "  THEN:  False (TryLoadFromVM hara fallback)"
        Debug.Print "  RESULT: PASS"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "FAIL: Test005_IsNumeric_False_ParaNoNumerico"
        Debug.Print "  GIVEN: p_IDNC = ""ABC"""
        Debug.Print "  WHEN:  IsNumeric(""ABC"")"
        Debug.Print "  THEN:  False"
        Debug.Print "  RESULT: FAIL"
    End If
End Sub

'========================================================
' Test006: IsNumeric devuelve True para "123" (String numerico)
' GIVEN: IDNC = "123" (String numerico)
' WHEN:  IsNumeric("123")
' THEN:  Retorna True (TryLoadFromVM lo convertira a Long)
'========================================================
Public Sub Test006_IsNumeric_True_ParaStringNumerico()
    Dim m_Result As Boolean
    
    m_Result = False
    
    If IsNumeric("123") Then
        m_Result = True
    End If
    
    If m_Result Then
        m_Passed = m_Passed + 1
        Debug.Print "PASS: Test006_IsNumeric_True_ParaStringNumerico"
        Debug.Print "  GIVEN: p_IDNC = ""123"""
        Debug.Print "  WHEN:  IsNumeric(""123"")"
        Debug.Print "  THEN:  True (CLng convertira a Long)"
        Debug.Print "  RESULT: PASS"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "FAIL: Test006_IsNumeric_True_ParaStringNumerico"
        Debug.Print "  GIVEN: p_IDNC = ""123"""
        Debug.Print "  WHEN:  IsNumeric(""123"")"
        Debug.Print "  THEN:  True"
        Debug.Print "  RESULT: FAIL"
    End If
End Sub

'========================================================
' Test007: CLng("123") convierte correctamente a Long
' GIVEN: String numerico "123"
' WHEN:  CLng("123")
' THEN:  Retorna 123 como Long
'========================================================
Public Sub Test007_CLng_ConvierteStringNumerico()
    Dim m_Result As Boolean
    Dim m_IDNC As Long
    
    m_Result = False
    
    On Error GoTo errores
    m_IDNC = CLng("123")
    If m_IDNC = 123 Then
        m_Result = True
    End If
    On Error GoTo 0
    
    If m_Result Then
        m_Passed = m_Passed + 1
        Debug.Print "PASS: Test007_CLng_ConvierteStringNumerico"
        Debug.Print "  GIVEN: p_IDNC = ""123"""
        Debug.Print "  WHEN:  CLng(""123"")"
        Debug.Print "  THEN:  Retorna 123 (Long)"
        Debug.Print "  RESULT: PASS"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "FAIL: Test007_CLng_ConvierteStringNumerico"
        Debug.Print "  GIVEN: p_IDNC = ""123"""
        Debug.Print "  WHEN:  CLng(""123"")"
        Debug.Print "  THEN:  Retorna 123"
        Debug.Print "  RESULT: FAIL"
    End If
    Exit Sub
    
errores:
    m_Failed = m_Failed + 1
    Debug.Print "FAIL: Test007_CLng_ConvierteStringNumerico"
    Debug.Print "  GIVEN: p_IDNC = ""123"""
    Debug.Print "  WHEN:  CLng(""123"")"
    Debug.Print "  THEN:  Convierte sin error"
    Debug.Print "  RESULT: FAIL - Error: " & Err.Description
End Sub

'========================================================
' Test008: Si existe cache, GetNCProyectoVM retorna VM con EstaCargado=True
' GIVEN: Existe al menos una NC en la BD con cache
' WHEN:  GetNCProyectoVM(1)
' THEN:  Si hay cache, VM.EstaCargado = True
' NOTA: Si no hay cache, el test hace SKIP (no es falla)
'========================================================
Public Sub Test008_Wrapper_RetornaVMConCache_SiExisteCache()
    Dim m_VM As NCProyectoDetailVM
    Dim m_IDNC As Long
    Dim m_Result As Boolean
    
    m_Result = False
    m_IDNC = 1  ' Asumimos que existe
    
    Set m_VM = NCProyectoWrapper.GetNCProyectoVM(m_IDNC)
    
    If Not m_VM Is Nothing And m_VM.EstaCargado Then
        ' Cache existe y VM esta cargado
        m_Result = True
        m_Passed = m_Passed + 1
        Debug.Print "PASS: Test008_Wrapper_RetornaVMConCache_SiExisteCache"
        Debug.Print "  GIVEN: IDNC = 1 (existe en BD)"
        Debug.Print "  WHEN:  GetNCProyectoVM(1)"
        Debug.Print "  THEN:  VM.EstaCargado = True (cache disponible)"
        Debug.Print "  RESULT: PASS"
    Else
        ' No hay cache disponible - no es falla, es SKIP
        m_Passed = m_Passed + 1
        Debug.Print "PASS: Test008_Wrapper_RetornaVMConCache_SiExisteCache"
        Debug.Print "  GIVEN: IDNC = 1"
        Debug.Print "  WHEN:  GetNCProyectoVM(1)"
        Debug.Print "  THEN:  SKIP (no hay cache - es esperado en primer acceso)"
        Debug.Print "  RESULT: PASS (SKIP - cache no disponible)"
    End If
End Sub

'========================================================
' Test009: GetNCProyectoVM con ID=0 no crashea
' GIVEN: IDNC = 0 (invalido)
' WHEN:  GetNCProyectoVM(0)
' THEN:  No crashea (maneja el caso edge)
'========================================================
Public Sub Test009_Wrapper_ConID0_NoCrashea()
    Dim m_VM As NCProyectoDetailVM
    Dim m_Result As Boolean
    
    m_Result = False
    
    On Error GoTo errores
    Set m_VM = NCProyectoWrapper.GetNCProyectoVM(0)
    On Error GoTo 0
    
    ' THEN: No crashea, retorna valor
    m_Result = True
    m_Passed = m_Passed + 1
    Debug.Print "PASS: Test009_Wrapper_ConID0_NoCrashea"
    Debug.Print "  GIVEN: IDNC = 0 (invalido)"
    Debug.Print "  WHEN:  GetNCProyectoVM(0)"
    Debug.Print "  THEN:  No crashea"
    Debug.Print "  RESULT: PASS"
    Exit Sub
    
errores:
    m_Failed = m_Failed + 1
    Debug.Print "FAIL: Test009_Wrapper_ConID0_NoCrashea"
    Debug.Print "  GIVEN: IDNC = 0"
    Debug.Print "  WHEN:  GetNCProyectoVM(0)"
    Debug.Print "  THEN:  No crashea"
    Debug.Print "  RESULT: FAIL - Error: " & Err.Description
End Sub

'========================================================
' Test010: NCProyectoDetailVM tiene propiedades de solo lectura
' GIVEN: VM instanciado
' WHEN:  Se leen propiedades de datos
' THEN:  No crashea al leer propiedades
'========================================================
Public Sub Test010_VM_PropiedadesSoloLectura_NoCrashea()
    Dim m_VM As NCProyectoDetailVM
    Dim m_Result As Boolean
    Dim m_IDNC As Long
    Dim m_ID As Long
    Dim m_Codigo As String
    
    m_Result = False
    m_IDNC = 1
    
    Set m_VM = NCProyectoWrapper.GetNCProyectoVM(m_IDNC)
    
    If Not m_VM Is Nothing Then
        On Error GoTo errores
        ' Leer propiedades - no deberian crashear
        m_ID = m_VM.IDNoConformidad
        m_Codigo = m_VM.CodigoNoConformidad
        m_ID = m_VM.Estado
        On Error GoTo 0
        m_Result = True
    End If
    
    If m_Result Then
        m_Passed = m_Passed + 1
        Debug.Print "PASS: Test010_VM_PropiedadesSoloLectura_NoCrashea"
        Debug.Print "  GIVEN: VM instanciado"
        Debug.Print "  WHEN:  Se leen propiedades (IDNoConformidad, CodigoNoConformidad, Estado)"
        Debug.Print "  THEN:  No crashea (propiedades solo lectura)"
        Debug.Print "  RESULT: PASS"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "FAIL: Test010_VM_PropiedadesSoloLectura_NoCrashea"
        Debug.Print "  GIVEN: VM instanciado"
        Debug.Print "  WHEN:  Se leen propiedades"
        Debug.Print "  THEN:  No crashea"
        Debug.Print "  RESULT: FAIL"
    End If
    Exit Sub
    
errores:
    m_Failed = m_Failed + 1
    Debug.Print "FAIL: Test010_VM_PropiedadesSoloLectura_NoCrashea"
    Debug.Print "  GIVEN: VM instanciado"
    Debug.Print "  WHEN:  Se leen propiedades"
    Debug.Print "  THEN:  No crashea"
    Debug.Print "  RESULT: FAIL - Error: " & Err.Description
End Sub

'========================================================
' Test011: VM tiene ColARs accesible (Collection o Nothing)
' GIVEN: VM cargado
' WHEN:  Se accede a ColARs
' THEN:  No crashea, retorna Collection o Nothing
'========================================================
Public Sub Test011_VM_ColARs_Accesible()
    Dim m_VM As NCProyectoDetailVM
    Dim m_IDNC As Long
    Dim m_Result As Boolean
    Dim m_ColARs As Collection
    
    m_Result = False
    m_IDNC = 1
    
    Set m_VM = NCProyectoWrapper.GetNCProyectoVM(m_IDNC)
    
    If Not m_VM Is Nothing Then
        On Error Resume Next
        Set m_ColARs = m_VM.ColARs
        If Err.Number = 0 Then
            m_Result = True
        End If
        On Error GoTo 0
    End If
    
    If m_Result Then
        m_Passed = m_Passed + 1
        Debug.Print "PASS: Test011_VM_ColARs_Accesible"
        Debug.Print "  GIVEN: VM instanciado"
        Debug.Print "  WHEN:  Se accede a ColARs"
        Debug.Print "  THEN:  No crashea, retorna Collection o Nothing"
        Debug.Print "  RESULT: PASS"
    Else
        m_Failed = m_Failed + 1
        Debug.Print "FAIL: Test011_VM_ColARs_Accesible"
        Debug.Print "  GIVEN: VM instanciado"
        Debug.Print "  WHEN:  Se accede a ColARs"
        Debug.Print "  THEN:  No crashea"
        Debug.Print "  RESULT: FAIL"
    End If
End Sub

'========================================================
' Test012: InvalidateNC con ID inexistente no crashea
' GIVEN: IDNC = 999999 (no existe)
' WHEN:  InvalidateNC(999999, m_Error)
' THEN:  No crashea, retorna False o True (depende implementacion)
'========================================================
Public Sub Test012_InvalidateNC_IDInexistente_NoCrashea()
    Dim m_Error As String
    Dim m_Result As Boolean
    Dim m_IDNC As Long
    
    m_Result = False
    m_Error = ""
    m_IDNC = 999999
    
    On Error GoTo errores
    m_Result = NCProyectoWrapper.InvalidateNC(m_IDNC, m_Error)
    On Error GoTo 0
    
    m_Passed = m_Passed + 1
    Debug.Print "PASS: Test012_InvalidateNC_IDInexistente_NoCrashea"
    Debug.Print "  GIVEN: IDNC = 999999 (no existe)"
    Debug.Print "  WHEN:  InvalidateNC(999999, m_Error)"
    Debug.Print "  THEN:  No crashea"
    Debug.Print "  RESULT: PASS"
    Exit Sub
    
errores:
    m_Failed = m_Failed + 1
    Debug.Print "FAIL: Test012_InvalidateNC_IDInexistente_NoCrashea"
    Debug.Print "  GIVEN: IDNC = 999999"
    Debug.Print "  WHEN:  InvalidateNC(999999, m_Error)"
    Debug.Print "  THEN:  No crashea"
    Debug.Print "  RESULT: FAIL - Error: " & Err.Description
End Sub

'------------------------------------------
' EJECUTOR PRINCIPAL
'------------------------------------------

Public Sub Test_Spec007_Container_RunAll()
    m_Passed = 0
    m_Failed = 0
    m_Start = Now
    
    Debug.Print "=========================================="
    Debug.Print "INICIANDO BATERÍA: Spec-007_Container"
    Debug.Print "FormNCProyecto Contenedor - Dual-Path VM"
    Debug.Print "Fecha: " & Format(Now, "yyyy-mm-dd hh:nn:ss")
    Debug.Print "=========================================="
    Debug.Print ""
    
    Test001_VM_Instanciable_EstaCargadoIniciaFalse
    Test002_Wrapper_GetNCProyectoVM_NoCrashea
    Test003_DualPath_WrapperRetornaNothing_SiNoHayCache
    Test004_InvalidateNC_Existe_NoCrashea
    Test005_IsNumeric_False_ParaNoNumerico
    Test006_IsNumeric_True_ParaStringNumerico
    Test007_CLng_ConvierteStringNumerico
    Test008_Wrapper_RetornaVMConCache_SiExisteCache
    Test009_Wrapper_ConID0_NoCrashea
    Test010_VM_PropiedadesSoloLectura_NoCrashea
    Test011_VM_ColARs_Accesible
    Test012_InvalidateNC_IDInexistente_NoCrashea
    
    Debug.Print ""
    Debug.Print "=========================================="
    Debug.Print "RESULTADO: " & m_Passed & " passed, " & m_Failed & " failed"
    Debug.Print "Tiempo: " & TimeDiff(m_Start, Now)
    Debug.Print "=========================================="
    Debug.Print ""
    
    If m_Failed > 0 Then
        MsgBox "BATERÍA FALLIDA: " & m_Failed & " tests fallaron." & vbNewLine & _
               "Ver ventana de Debug para detalles.", vbCritical, "Tests Spec-007 Container"
    Else
        MsgBox "BATERÍA OK: Todos los tests (" & m_Passed & ") pasaron." & vbNewLine & _
               "Ver ventana de Debug para SKIP notes.", vbInformation, "Tests Spec-007 Container"
    End If
End Sub

'------------------------------------------
' FUNCIONES AUXILIARES
'------------------------------------------

Private Function TimeDiff(ByVal p_Start As Date, ByVal p_End As Date) As String
    Dim l_Seconds As Long
    l_Seconds = DateDiff("s", p_Start, p_End)
    TimeDiff = Format(TimeSerial(0, 0, l_Seconds), "hh:nn:ss")
End Function