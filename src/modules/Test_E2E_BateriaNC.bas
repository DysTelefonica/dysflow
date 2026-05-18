Attribute VB_Name = "Test_E2E_BateriaNC"
Option Compare Database
Option Explicit

Private Const TEST_ID_NC_PROY As Long = 900001
Private Const TEST_ID_NC_AUD As Long = 900002
Private Const TEST_ID_AUDITORIA As Long = 900003
Private Const TEST_MOTIVO As String = "Motivo E2E control eficacia no requerido"


Public Function Test_E2E_EnvConfig_AplicaBackendActivo_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim originalBackendActivo As String
    Dim originalBackendProduccion As String
    Dim originalBackendSandbox As String
    Dim originalEnPruebas As String
    Dim originalIDAplicacion As Variant
    Dim originalRutaProd As String
    Dim originalRutaLocal As String
    Dim cfgErr As String
    Dim assertError As String

    Set logs = TestHelper.NewLogs
    Set db = CurrentDb
    Set rs = db.OpenRecordset("SELECT TOP 1 * FROM TbConfiguracionBackends ORDER BY ID", dbOpenDynaset)

    If rs.EOF Then
        Test_E2E_EnvConfig_AplicaBackendActivo_Atomic = TestHelper.BuildJsonFail("TbConfiguracionBackends sin filas", logs)
        GoTo Cleanup
    End If

    originalBackendActivo = Trim$(Nz(rs.Fields("BackendActivo").Value, ""))
    originalBackendProduccion = Trim$(Nz(rs.Fields("BackendProduccion").Value, ""))
    originalBackendSandbox = Trim$(Nz(rs.Fields("BackendSandbox").Value, ""))
    originalEnPruebas = Trim$(Nz(rs.Fields("EnPruebas").Value, ""))
    originalIDAplicacion = Nz(rs.Fields("IDAplicacion").Value, Null)
    originalRutaProd = Trim$(Nz(rs.Fields("RutaDirectorioAplicacion_PROD").Value, ""))
    originalRutaLocal = Trim$(Nz(rs.Fields("RutaDirectorioAplicacion_LOCAL").Value, ""))

    If originalBackendProduccion = "" Or originalBackendSandbox = "" Then
        TestHelper.AddLog logs, "Se omite validación activa: BackendProduccion/BackendSandbox vacío"
        Test_E2E_EnvConfig_AplicaBackendActivo_Atomic = TestHelper.BuildJsonFail("Config incompleta para validar BackendActivo", logs)
        GoTo Cleanup
    End If

    rs.Edit
    rs.Fields("BackendActivo").Value = "PROD"
    rs.Fields("EnPruebas").Value = "No"
    rs.Update
    TestHelper.AddLog logs, "Configurado BackendActivo=PROD, EnPruebas=No"

    cfgErr = ""
    Call LeeConfiguracionLocal(cfgErr)
    Call TestHelper.AssertTrue(cfgErr = "", "LeeConfiguracionLocal(PROD) sin error", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(Nz(Application.TempVars("DatosEnLocal"), "") = "No", "DatosEnLocal debe ser 'No' para PROD", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(Nz(Application.TempVars("BackendPathConfigurado"), "") = originalBackendProduccion, "BackendPathConfigurado debe usar BackendProduccion", logs, assertError)
    If assertError <> "" Then GoTo Fail

    rs.Edit
    rs.Fields("BackendActivo").Value = "LOCAL"
    rs.Fields("EnPruebas").Value = "Sí"
    rs.Update
    TestHelper.AddLog logs, "Configurado BackendActivo=LOCAL, EnPruebas=Sí"

    cfgErr = ""
    Call LeeConfiguracionLocal(cfgErr)
    Call TestHelper.AssertTrue(cfgErr = "", "LeeConfiguracionLocal(LOCAL) sin error", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(Nz(Application.TempVars("DatosEnLocal"), "") = "Sí", "DatosEnLocal debe ser 'Sí' para LOCAL", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(Nz(Application.TempVars("BackendPathConfigurado"), "") = originalBackendSandbox, "BackendPathConfigurado debe usar BackendSandbox", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call RestoreTbConfiguracionBackends(rs, originalBackendActivo, originalBackendProduccion, originalBackendSandbox, originalEnPruebas, originalIDAplicacion, originalRutaProd, originalRutaLocal, logs)
    Test_E2E_EnvConfig_AplicaBackendActivo_Atomic = TestHelper.BuildJsonOk(logs, "backend_switch_ok")
    GoTo Cleanup

Fail:
    Call RestoreTbConfiguracionBackends(rs, originalBackendActivo, originalBackendProduccion, originalBackendSandbox, originalEnPruebas, originalIDAplicacion, originalRutaProd, originalRutaLocal, logs)
    Test_E2E_EnvConfig_AplicaBackendActivo_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    Call RestoreTbConfiguracionBackends(rs, originalBackendActivo, originalBackendProduccion, originalBackendSandbox, originalEnPruebas, originalIDAplicacion, originalRutaProd, originalRutaLocal, logs)
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_E2E_EnvConfig_AplicaBackendActivo_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Set db = Nothing
End Function

Public Function Test_E2E_EnvConfig_EnPruebasInvalido_Bloquea_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim originalBackendActivo As String
    Dim originalBackendProduccion As String
    Dim originalBackendSandbox As String
    Dim originalEnPruebas As String
    Dim originalIDAplicacion As Variant
    Dim originalRutaProd As String
    Dim originalRutaLocal As String
    Dim cfgErr As String
    Dim assertError As String

    Set logs = TestHelper.NewLogs
    Set db = CurrentDb
    Set rs = db.OpenRecordset("SELECT TOP 1 * FROM TbConfiguracionBackends ORDER BY ID", dbOpenDynaset)

    If rs.EOF Then
        Test_E2E_EnvConfig_EnPruebasInvalido_Bloquea_Atomic = TestHelper.BuildJsonFail("TbConfiguracionBackends sin filas", logs)
        GoTo Cleanup
    End If

    originalBackendActivo = Trim$(Nz(rs.Fields("BackendActivo").Value, ""))
    originalBackendProduccion = Trim$(Nz(rs.Fields("BackendProduccion").Value, ""))
    originalBackendSandbox = Trim$(Nz(rs.Fields("BackendSandbox").Value, ""))
    originalEnPruebas = Trim$(Nz(rs.Fields("EnPruebas").Value, ""))
    originalIDAplicacion = Nz(rs.Fields("IDAplicacion").Value, Null)
    originalRutaProd = Trim$(Nz(rs.Fields("RutaDirectorioAplicacion_PROD").Value, ""))
    originalRutaLocal = Trim$(Nz(rs.Fields("RutaDirectorioAplicacion_LOCAL").Value, ""))

    rs.Edit
    rs.Fields("BackendActivo").Value = "LOCAL"
    rs.Fields("EnPruebas").Value = "XX"
    rs.Update
    TestHelper.AddLog logs, "Configurado EnPruebas inválido='XX'"

    cfgErr = ""
    Call LeeConfiguracionLocal(cfgErr)
    Call TestHelper.AssertTrue(cfgErr <> "", "LeeConfiguracionLocal debe reportar error con EnPruebas inválido", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(InStr(1, cfgErr, "EnPruebas debe ser texto 'Sí' o 'No'", vbTextCompare) > 0, "Mensaje de error debe indicar restricción de EnPruebas", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call RestoreTbConfiguracionBackends(rs, originalBackendActivo, originalBackendProduccion, originalBackendSandbox, originalEnPruebas, originalIDAplicacion, originalRutaProd, originalRutaLocal, logs)
    Test_E2E_EnvConfig_EnPruebasInvalido_Bloquea_Atomic = TestHelper.BuildJsonOk(logs, "invalid_enpruebas_blocked")
    GoTo Cleanup

Fail:
    Call RestoreTbConfiguracionBackends(rs, originalBackendActivo, originalBackendProduccion, originalBackendSandbox, originalEnPruebas, originalIDAplicacion, originalRutaProd, originalRutaLocal, logs)
    Test_E2E_EnvConfig_EnPruebasInvalido_Bloquea_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    Dim errDescription As String
    errDescription = Err.Description
    Call RestoreTbConfiguracionBackends(rs, originalBackendActivo, originalBackendProduccion, originalBackendSandbox, originalEnPruebas, originalIDAplicacion, originalRutaProd, originalRutaLocal, logs)
    TestHelper.AddLog logs, "Error: " & errDescription
    Test_E2E_EnvConfig_EnPruebasInvalido_Bloquea_Atomic = TestHelper.BuildJsonFail(errDescription, logs)

Cleanup:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Set db = Nothing
End Function

Public Function Test_E2E_EnvConfig_ResuelveSandboxSeguro_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim backendActivo As String
    Dim backendSandbox As String
    Dim enPruebas As String
    Dim assertError As String

    Set logs = TestHelper.NewLogs
    Set db = CurrentDb
    Set rs = db.OpenRecordset("SELECT TOP 1 BackendActivo, BackendSandbox, EnPruebas FROM TbConfiguracionBackends ORDER BY ID", dbOpenSnapshot)

    If rs.EOF Then
        Test_E2E_EnvConfig_ResuelveSandboxSeguro_Atomic = TestHelper.BuildJsonFail("TbConfiguracionBackends sin filas", logs)
        GoTo Cleanup
    End If

    backendActivo = UCase$(Trim$(Nz(rs.Fields("BackendActivo").Value, "")))
    backendSandbox = Trim$(Nz(rs.Fields("BackendSandbox").Value, ""))
    enPruebas = Trim$(Nz(rs.Fields("EnPruebas").Value, ""))

    TestHelper.AddLog logs, "BackendActivo=" & backendActivo
    TestHelper.AddLog logs, "BackendSandbox=" & backendSandbox
    TestHelper.AddLog logs, "EnPruebas=" & enPruebas

    Call TestHelper.AssertTrue(backendActivo = "LOCAL" Or backendActivo = "SANDBOX", "BackendActivo debe ser LOCAL/SANDBOX para testing seguro", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call TestHelper.AssertTrue(backendSandbox <> "", "BackendSandbox no puede estar vacío", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call TestHelper.AssertTrue(InStr(1, backendSandbox, "\\datoste\\", vbTextCompare) = 0, "BackendSandbox no debe apuntar a UNC productivo", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call TestHelper.AssertTrue(enPruebas = "Sí" Or enPruebas = "No", "EnPruebas debe ser 'Sí' o 'No'", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Test_E2E_EnvConfig_ResuelveSandboxSeguro_Atomic = TestHelper.BuildJsonOk(logs, backendSandbox)
    GoTo Cleanup

Fail:
    Test_E2E_EnvConfig_ResuelveSandboxSeguro_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_E2E_EnvConfig_ResuelveSandboxSeguro_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Set db = Nothing
End Function

Public Function Test_E2E_EnvConfig_RutaAplicacionLocal_NoEstandar_Normalizada_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim originalBackendActivo As String
    Dim originalBackendProduccion As String
    Dim originalBackendSandbox As String
    Dim originalEnPruebas As String
    Dim originalIDAplicacion As Variant
    Dim originalRutaProd As String
    Dim originalRutaLocal As String
    Dim cfgErr As String
    Dim assertError As String
    Dim rutaNoEstandar As String

    Set logs = TestHelper.NewLogs
    Set db = CurrentDb
    Set rs = db.OpenRecordset("SELECT TOP 1 * FROM TbConfiguracionBackends ORDER BY ID", dbOpenDynaset)

    If rs.EOF Then
        Test_E2E_EnvConfig_RutaAplicacionLocal_NoEstandar_Normalizada_Atomic = TestHelper.BuildJsonFail("TbConfiguracionBackends sin filas", logs)
        GoTo Cleanup
    End If

    originalBackendActivo = Trim$(Nz(rs.Fields("BackendActivo").Value, ""))
    originalBackendProduccion = Trim$(Nz(rs.Fields("BackendProduccion").Value, ""))
    originalBackendSandbox = Trim$(Nz(rs.Fields("BackendSandbox").Value, ""))
    originalEnPruebas = Trim$(Nz(rs.Fields("EnPruebas").Value, ""))
    originalIDAplicacion = Nz(rs.Fields("IDAplicacion").Value, Null)
    originalRutaProd = Trim$(Nz(rs.Fields("RutaDirectorioAplicacion_PROD").Value, ""))
    originalRutaLocal = Trim$(Nz(rs.Fields("RutaDirectorioAplicacion_LOCAL").Value, ""))

    rutaNoEstandar = Trim$(Nz(originalRutaLocal, ""))
    If rutaNoEstandar = "" Then rutaNoEstandar = Trim$(Nz(originalRutaProd, ""))
    If rutaNoEstandar = "" Then
        Test_E2E_EnvConfig_RutaAplicacionLocal_NoEstandar_Normalizada_Atomic = TestHelper.BuildJsonFail("Sin ruta base configurada para validar normalización", logs)
        GoTo Cleanup
    End If
    If Right$(rutaNoEstandar, 1) = "\" Then rutaNoEstandar = Left$(rutaNoEstandar, Len(rutaNoEstandar) - 1)
    rs.Edit
    rs.Fields("BackendActivo").Value = "LOCAL"
    rs.Fields("EnPruebas").Value = "Sí"
    rs.Fields("RutaDirectorioAplicacion_LOCAL").Value = rutaNoEstandar
    rs.Update
    TestHelper.AddLog logs, "Configurada ruta local no estándar sin barra final=" & rutaNoEstandar

    cfgErr = ""
    Call LeeConfiguracionLocal(cfgErr)
    Call TestHelper.AssertTrue(cfgErr = "", "LeeConfiguracionLocal(LOCAL) sin error", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(m_URLRutaAplicacionLocal = rutaNoEstandar & "\", "Ruta local efectiva debe quedar normalizada con barra final y sin hardcode", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call RestoreTbConfiguracionBackends(rs, originalBackendActivo, originalBackendProduccion, originalBackendSandbox, originalEnPruebas, originalIDAplicacion, originalRutaProd, originalRutaLocal, logs)
    Test_E2E_EnvConfig_RutaAplicacionLocal_NoEstandar_Normalizada_Atomic = TestHelper.BuildJsonOk(logs, "ruta_local_normalizada")
    GoTo Cleanup

Fail:
    Call RestoreTbConfiguracionBackends(rs, originalBackendActivo, originalBackendProduccion, originalBackendSandbox, originalEnPruebas, originalIDAplicacion, originalRutaProd, originalRutaLocal, logs)
    Test_E2E_EnvConfig_RutaAplicacionLocal_NoEstandar_Normalizada_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    Call RestoreTbConfiguracionBackends(rs, originalBackendActivo, originalBackendProduccion, originalBackendSandbox, originalEnPruebas, originalIDAplicacion, originalRutaProd, originalRutaLocal, logs)
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_E2E_EnvConfig_RutaAplicacionLocal_NoEstandar_Normalizada_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Set db = Nothing
End Function

Public Function Test_E2E_EnvConfig_EntornoURLDirAplicacion_UsaRutaConfigurada_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim originalBackendActivo As String
    Dim originalBackendProduccion As String
    Dim originalBackendSandbox As String
    Dim originalEnPruebas As String
    Dim originalIDAplicacion As Variant
    Dim originalRutaProd As String
    Dim originalRutaLocal As String
    Dim cfgErr As String
    Dim assertError As String
    Dim rutaNoEstandar As String
    Dim rutaEsperada As String
    Dim entorno As Entorno
    Dim rutaEntorno As String

    Set logs = TestHelper.NewLogs
    Set db = CurrentDb
    Set rs = db.OpenRecordset("SELECT TOP 1 * FROM TbConfiguracionBackends ORDER BY ID", dbOpenDynaset)

    If rs.EOF Then
        Test_E2E_EnvConfig_EntornoURLDirAplicacion_UsaRutaConfigurada_Atomic = TestHelper.BuildJsonFail("TbConfiguracionBackends sin filas", logs)
        GoTo Cleanup
    End If

    originalBackendActivo = Trim$(Nz(rs.Fields("BackendActivo").Value, ""))
    originalBackendProduccion = Trim$(Nz(rs.Fields("BackendProduccion").Value, ""))
    originalBackendSandbox = Trim$(Nz(rs.Fields("BackendSandbox").Value, ""))
    originalEnPruebas = Trim$(Nz(rs.Fields("EnPruebas").Value, ""))
    originalIDAplicacion = Nz(rs.Fields("IDAplicacion").Value, Null)
    originalRutaProd = Trim$(Nz(rs.Fields("RutaDirectorioAplicacion_PROD").Value, ""))
    originalRutaLocal = Trim$(Nz(rs.Fields("RutaDirectorioAplicacion_LOCAL").Value, ""))

    rutaNoEstandar = Trim$(Nz(originalRutaLocal, ""))
    If rutaNoEstandar = "" Then rutaNoEstandar = Trim$(Nz(originalRutaProd, ""))
    If rutaNoEstandar = "" Then
        Test_E2E_EnvConfig_EntornoURLDirAplicacion_UsaRutaConfigurada_Atomic = TestHelper.BuildJsonFail("Sin ruta base configurada para validar Entorno.URLDirAplicacion", logs)
        GoTo Cleanup
    End If
    If Right$(rutaNoEstandar, 1) = "\" Then rutaNoEstandar = Left$(rutaNoEstandar, Len(rutaNoEstandar) - 1)
    rutaEsperada = rutaNoEstandar & "\"

    rs.Edit
    rs.Fields("BackendActivo").Value = "LOCAL"
    rs.Fields("EnPruebas").Value = "Sí"
    rs.Fields("RutaDirectorioAplicacion_LOCAL").Value = rutaNoEstandar
    rs.Update
    TestHelper.AddLog logs, "Configurada ruta local exacta para Entorno.URLDirAplicacion=" & rutaNoEstandar

    cfgErr = ""
    Call LeeConfiguracionLocal(cfgErr)
    Call TestHelper.AssertTrue(cfgErr = "", "LeeConfiguracionLocal(LOCAL) sin error", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Set entorno = New Entorno
    rutaEntorno = entorno.URLDirAplicacion
    Call TestHelper.AssertTrue(rutaEntorno = rutaEsperada, "Entorno.URLDirAplicacion debe devolver la ruta exacta configurada y normalizada", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call TestHelper.AssertTrue(InStr(1, rutaEntorno, "No Conformidades\No Conformidades\", vbTextCompare) = 0, "Entorno.URLDirAplicacion no debe reconstruir carpeta duplicada por hardcode", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call RestoreTbConfiguracionBackends(rs, originalBackendActivo, originalBackendProduccion, originalBackendSandbox, originalEnPruebas, originalIDAplicacion, originalRutaProd, originalRutaLocal, logs)
    Test_E2E_EnvConfig_EntornoURLDirAplicacion_UsaRutaConfigurada_Atomic = TestHelper.BuildJsonOk(logs, rutaEntorno)
    GoTo Cleanup

Fail:
    Call RestoreTbConfiguracionBackends(rs, originalBackendActivo, originalBackendProduccion, originalBackendSandbox, originalEnPruebas, originalIDAplicacion, originalRutaProd, originalRutaLocal, logs)
    Test_E2E_EnvConfig_EntornoURLDirAplicacion_UsaRutaConfigurada_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    Call RestoreTbConfiguracionBackends(rs, originalBackendActivo, originalBackendProduccion, originalBackendSandbox, originalEnPruebas, originalIDAplicacion, originalRutaProd, originalRutaLocal, logs)
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_E2E_EnvConfig_EntornoURLDirAplicacion_UsaRutaConfigurada_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set entorno = Nothing
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Set db = Nothing
End Function

Public Function Test_E2E_EnvConfig_EnPruebas_NoRuteaInfra_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim originalBackendActivo As String
    Dim originalBackendProduccion As String
    Dim originalBackendSandbox As String
    Dim originalEnPruebas As String
    Dim originalIDAplicacion As Variant
    Dim originalRutaProd As String
    Dim originalRutaLocal As String
    Dim cfgErr As String
    Dim assertError As String
    Dim backendSi As String
    Dim backendNo As String
    Dim rutaSi As String
    Dim rutaNo As String

    Set logs = TestHelper.NewLogs
    Set db = CurrentDb
    Set rs = db.OpenRecordset("SELECT TOP 1 * FROM TbConfiguracionBackends ORDER BY ID", dbOpenDynaset)

    If rs.EOF Then
        Test_E2E_EnvConfig_EnPruebas_NoRuteaInfra_Atomic = TestHelper.BuildJsonFail("TbConfiguracionBackends sin filas", logs)
        GoTo Cleanup
    End If

    originalBackendActivo = Trim$(Nz(rs.Fields("BackendActivo").Value, ""))
    originalBackendProduccion = Trim$(Nz(rs.Fields("BackendProduccion").Value, ""))
    originalBackendSandbox = Trim$(Nz(rs.Fields("BackendSandbox").Value, ""))
    originalEnPruebas = Trim$(Nz(rs.Fields("EnPruebas").Value, ""))
    originalIDAplicacion = Nz(rs.Fields("IDAplicacion").Value, Null)
    originalRutaProd = Trim$(Nz(rs.Fields("RutaDirectorioAplicacion_PROD").Value, ""))
    originalRutaLocal = Trim$(Nz(rs.Fields("RutaDirectorioAplicacion_LOCAL").Value, ""))

    rs.Edit
    rs.Fields("BackendActivo").Value = "LOCAL"
    rs.Fields("EnPruebas").Value = "Sí"
    rs.Update
    cfgErr = ""
    Call LeeConfiguracionLocal(cfgErr)
    Call TestHelper.AssertTrue(cfgErr = "", "LeeConfiguracionLocal con EnPruebas=Sí", logs, assertError)
    If assertError <> "" Then GoTo Fail
    backendSi = Nz(Application.TempVars("BackendPathConfigurado"), "")
    rutaSi = m_URLRutaAplicacionLocal

    rs.Edit
    rs.Fields("EnPruebas").Value = "No"
    rs.Update
    cfgErr = ""
    Call LeeConfiguracionLocal(cfgErr)
    Call TestHelper.AssertTrue(cfgErr = "", "LeeConfiguracionLocal con EnPruebas=No", logs, assertError)
    If assertError <> "" Then GoTo Fail
    backendNo = Nz(Application.TempVars("BackendPathConfigurado"), "")
    rutaNo = m_URLRutaAplicacionLocal

    Call TestHelper.AssertTrue(backendSi = backendNo, "BackendPathConfigurado no debe variar por EnPruebas", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(rutaSi = rutaNo, "Ruta de aplicación no debe variar por EnPruebas", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call RestoreTbConfiguracionBackends(rs, originalBackendActivo, originalBackendProduccion, originalBackendSandbox, originalEnPruebas, originalIDAplicacion, originalRutaProd, originalRutaLocal, logs)
    Test_E2E_EnvConfig_EnPruebas_NoRuteaInfra_Atomic = TestHelper.BuildJsonOk(logs, "enpruebas_no_rutea")
    GoTo Cleanup

Fail:
    Call RestoreTbConfiguracionBackends(rs, originalBackendActivo, originalBackendProduccion, originalBackendSandbox, originalEnPruebas, originalIDAplicacion, originalRutaProd, originalRutaLocal, logs)
    Test_E2E_EnvConfig_EnPruebas_NoRuteaInfra_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    Call RestoreTbConfiguracionBackends(rs, originalBackendActivo, originalBackendProduccion, originalBackendSandbox, originalEnPruebas, originalIDAplicacion, originalRutaProd, originalRutaLocal, logs)
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_E2E_EnvConfig_EnPruebas_NoRuteaInfra_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Set db = Nothing
End Function

Public Function Test_E2E_EnvConfig_FailFast_BackendInaccesible_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim originalBackendActivo As String
    Dim originalBackendProduccion As String
    Dim originalBackendSandbox As String
    Dim originalEnPruebas As String
    Dim originalIDAplicacion As Variant
    Dim originalRutaProd As String
    Dim originalRutaLocal As String
    Dim cfgErr As String
    Dim assertError As String
    Dim backendInaccesible As String

    Set logs = TestHelper.NewLogs
    Set db = CurrentDb
    Set rs = db.OpenRecordset("SELECT TOP 1 * FROM TbConfiguracionBackends ORDER BY ID", dbOpenDynaset)

    If rs.EOF Then
        Test_E2E_EnvConfig_FailFast_BackendInaccesible_Atomic = TestHelper.BuildJsonFail("TbConfiguracionBackends sin filas", logs)
        GoTo Cleanup
    End If

    originalBackendActivo = Trim$(Nz(rs.Fields("BackendActivo").Value, ""))
    originalBackendProduccion = Trim$(Nz(rs.Fields("BackendProduccion").Value, ""))
    originalBackendSandbox = Trim$(Nz(rs.Fields("BackendSandbox").Value, ""))
    originalEnPruebas = Trim$(Nz(rs.Fields("EnPruebas").Value, ""))
    originalIDAplicacion = Nz(rs.Fields("IDAplicacion").Value, Null)
    originalRutaProd = Trim$(Nz(rs.Fields("RutaDirectorioAplicacion_PROD").Value, ""))
    originalRutaLocal = Trim$(Nz(rs.Fields("RutaDirectorioAplicacion_LOCAL").Value, ""))

    backendInaccesible = "C:\__nc_test_missing__\NoConformidades_Datos.accdb"

    rs.Edit
    rs.Fields("BackendActivo").Value = "LOCAL"
    rs.Fields("EnPruebas").Value = "Sí"
    rs.Fields("BackendSandbox").Value = backendInaccesible
    rs.Update
    TestHelper.AddLog logs, "Configurado BackendSandbox inaccesible=" & backendInaccesible

    cfgErr = ""
    Call LeeConfiguracionLocal(cfgErr)
    Call TestHelper.AssertTrue(cfgErr <> "", "Debe bloquear por backend inaccesible", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(InStr(1, cfgErr, "INFRA CONFIG FAIL-FAST:", vbTextCompare) > 0, "Diagnóstico debe incluir prefijo fail-fast", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(InStr(1, cfgErr, "Campo=BackendSandbox", vbTextCompare) > 0, "Diagnóstico debe incluir el campo de backend", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(InStr(1, cfgErr, backendInaccesible, vbTextCompare) > 0, "Diagnóstico debe incluir ruta configurada", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call RestoreTbConfiguracionBackends(rs, originalBackendActivo, originalBackendProduccion, originalBackendSandbox, originalEnPruebas, originalIDAplicacion, originalRutaProd, originalRutaLocal, logs)
    Test_E2E_EnvConfig_FailFast_BackendInaccesible_Atomic = TestHelper.BuildJsonOk(logs, "failfast_backend")
    GoTo Cleanup

Fail:
    Call RestoreTbConfiguracionBackends(rs, originalBackendActivo, originalBackendProduccion, originalBackendSandbox, originalEnPruebas, originalIDAplicacion, originalRutaProd, originalRutaLocal, logs)
    Test_E2E_EnvConfig_FailFast_BackendInaccesible_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    Call RestoreTbConfiguracionBackends(rs, originalBackendActivo, originalBackendProduccion, originalBackendSandbox, originalEnPruebas, originalIDAplicacion, originalRutaProd, originalRutaLocal, logs)
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_E2E_EnvConfig_FailFast_BackendInaccesible_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Set db = Nothing
End Function

Public Function Test_E2E_EnvConfig_FailFast_DiagnosticoAgregado_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim originalBackendActivo As String
    Dim originalBackendProduccion As String
    Dim originalBackendSandbox As String
    Dim originalEnPruebas As String
    Dim originalIDAplicacion As Variant
    Dim originalRutaProd As String
    Dim originalRutaLocal As String
    Dim cfgErr As String
    Dim assertError As String
    Dim backendInaccesible As String
    Dim rutaLocalInaccesible As String

    Set logs = TestHelper.NewLogs
    Set db = CurrentDb
    Set rs = db.OpenRecordset("SELECT TOP 1 * FROM TbConfiguracionBackends ORDER BY ID", dbOpenDynaset)

    If rs.EOF Then
        Test_E2E_EnvConfig_FailFast_DiagnosticoAgregado_Atomic = TestHelper.BuildJsonFail("TbConfiguracionBackends sin filas", logs)
        GoTo Cleanup
    End If

    originalBackendActivo = Trim$(Nz(rs.Fields("BackendActivo").Value, ""))
    originalBackendProduccion = Trim$(Nz(rs.Fields("BackendProduccion").Value, ""))
    originalBackendSandbox = Trim$(Nz(rs.Fields("BackendSandbox").Value, ""))
    originalEnPruebas = Trim$(Nz(rs.Fields("EnPruebas").Value, ""))
    originalIDAplicacion = Nz(rs.Fields("IDAplicacion").Value, Null)
    originalRutaProd = Trim$(Nz(rs.Fields("RutaDirectorioAplicacion_PROD").Value, ""))
    originalRutaLocal = Trim$(Nz(rs.Fields("RutaDirectorioAplicacion_LOCAL").Value, ""))

    backendInaccesible = "C:\__nc_test_missing__\NoConformidades_Datos2.accdb"
    rutaLocalInaccesible = "C:\__nc_test_missing__\Ruta NC"

    rs.Edit
    rs.Fields("BackendActivo").Value = "LOCAL"
    rs.Fields("EnPruebas").Value = "No"
    rs.Fields("BackendSandbox").Value = backendInaccesible
    rs.Fields("RutaDirectorioAplicacion_LOCAL").Value = rutaLocalInaccesible
    rs.Update
    TestHelper.AddLog logs, "Configuración invalida doble backend+app"

    cfgErr = ""
    Call LeeConfiguracionLocal(cfgErr)
    Call TestHelper.AssertTrue(cfgErr <> "", "Debe fallar con dependencias múltiples inaccesibles", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(InStr(1, cfgErr, "Campo=BackendSandbox", vbTextCompare) > 0, "Debe listar BackendSandbox", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(InStr(1, cfgErr, "Campo=RutaDirectorioAplicacion_LOCAL", vbTextCompare) > 0, "Debe listar RutaDirectorioAplicacion_LOCAL", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(InStr(1, cfgErr, "Causa=", vbTextCompare) > 0, "Cada entrada debe incluir causa", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call RestoreTbConfiguracionBackends(rs, originalBackendActivo, originalBackendProduccion, originalBackendSandbox, originalEnPruebas, originalIDAplicacion, originalRutaProd, originalRutaLocal, logs)
    Test_E2E_EnvConfig_FailFast_DiagnosticoAgregado_Atomic = TestHelper.BuildJsonOk(logs, "failfast_agregado")
    GoTo Cleanup

Fail:
    Call RestoreTbConfiguracionBackends(rs, originalBackendActivo, originalBackendProduccion, originalBackendSandbox, originalEnPruebas, originalIDAplicacion, originalRutaProd, originalRutaLocal, logs)
    Test_E2E_EnvConfig_FailFast_DiagnosticoAgregado_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    Call RestoreTbConfiguracionBackends(rs, originalBackendActivo, originalBackendProduccion, originalBackendSandbox, originalEnPruebas, originalIDAplicacion, originalRutaProd, originalRutaLocal, logs)
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_E2E_EnvConfig_FailFast_DiagnosticoAgregado_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Set db = Nothing
End Function

Public Function Test_E2E_KillSwitch_EscribeYRestauraTbConfiguracion_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim originalCache As Variant
    Dim originalFecha As Variant
    Dim originalUsuario As Variant
    Dim originalMotivo As Variant
    Dim nuevoValor As Boolean
    Dim actual As Boolean
    Dim assertError As String

    Set logs = TestHelper.NewLogs
    Set db = getdb()
    Set rs = db.OpenRecordset("SELECT * FROM TbConfiguracion WHERE ID = 1", dbOpenDynaset)

    If rs.EOF Then
        Test_E2E_KillSwitch_EscribeYRestauraTbConfiguracion_Atomic = TestHelper.BuildJsonFail("TbConfiguracion no tiene fila ID=1", logs)
        GoTo Cleanup
    End If

    originalCache = rs.Fields("CacheHabilitada").Value
    originalFecha = rs.Fields("FechaCambioCache").Value
    originalUsuario = rs.Fields("UsuarioCambioCache").Value
    originalMotivo = rs.Fields("MotivoCambioCache").Value

    nuevoValor = Not CBool(Nz(originalCache, False))
    rs.Edit
    rs.Fields("CacheHabilitada").Value = nuevoValor
    rs.Fields("FechaCambioCache").Value = Now
    rs.Fields("UsuarioCambioCache").Value = "TEST_E2E"
    rs.Fields("MotivoCambioCache").Value = "E2E toggle controlado"
    rs.Update
    TestHelper.AddLog logs, "Toggle aplicado: " & CStr(nuevoValor)

    rs.Requery
    actual = CBool(Nz(rs.Fields("CacheHabilitada").Value, False))
    Call TestHelper.AssertTrue(actual = nuevoValor, "TbConfiguracion.CacheHabilitada debe reflejar toggle", logs, assertError)
    If assertError <> "" Then GoTo Fail

    rs.Edit
    rs.Fields("CacheHabilitada").Value = originalCache
    rs.Fields("FechaCambioCache").Value = originalFecha
    rs.Fields("UsuarioCambioCache").Value = originalUsuario
    rs.Fields("MotivoCambioCache").Value = originalMotivo
    rs.Update
    TestHelper.AddLog logs, "Estado original restaurado"

    Test_E2E_KillSwitch_EscribeYRestauraTbConfiguracion_Atomic = TestHelper.BuildJsonOk(logs, "restore_ok")
    GoTo Cleanup

Fail:
    Call RestaurarConfiguracionDesdeSnapshot(rs, originalCache, originalFecha, originalUsuario, originalMotivo, logs)
    Test_E2E_KillSwitch_EscribeYRestauraTbConfiguracion_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    Call RestaurarConfiguracionDesdeSnapshot(rs, originalCache, originalFecha, originalUsuario, originalMotivo, logs)
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_E2E_KillSwitch_EscribeYRestauraTbConfiguracion_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Set db = Nothing
End Function

Public Function Test_E2E_KillSwitch_OffOnOff_Restore_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim originalState As Boolean
    Dim assertError As String
    Dim opError As String
    Dim restoreErr As String

    Set logs = TestHelper.NewLogs
    originalState = IsCacheEnabled()
    TestHelper.AddLog logs, "Estado original=" & CStr(originalState)

    opError = ""
    Call TestHelper.AssertTrue(CacheConfig_SetEnabled(False, opError), "OFF inicial OK", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(IsCacheEnabled() = False, "OFF inicial persistido", logs, assertError)
    If assertError <> "" Then GoTo Fail

    opError = ""
    Call TestHelper.AssertTrue(CacheConfig_SetEnabled(True, opError), "ON intermedio OK", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(IsCacheEnabled() = True, "ON intermedio persistido", logs, assertError)
    If assertError <> "" Then GoTo Fail

    opError = ""
    Call TestHelper.AssertTrue(CacheConfig_SetEnabled(False, opError), "OFF final OK", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(IsCacheEnabled() = False, "OFF final persistido", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call RestoreCacheStateE2E(originalState, logs, restoreErr)
    If restoreErr <> "" Then
        Test_E2E_KillSwitch_OffOnOff_Restore_Atomic = TestHelper.BuildJsonFail(restoreErr, logs)
    Else
        Test_E2E_KillSwitch_OffOnOff_Restore_Atomic = TestHelper.BuildJsonOk(logs, "off_on_off_restore_ok")
    End If
    Exit Function

Fail:
    Call RestoreCacheStateE2E(originalState, logs, restoreErr)
    If restoreErr <> "" Then assertError = assertError & " | Restore: " & restoreErr
    Test_E2E_KillSwitch_OffOnOff_Restore_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Exit Function

EH:
    Call RestoreCacheStateE2E(originalState, logs, restoreErr)
    TestHelper.AddLog logs, "Error: " & Err.Description
    If restoreErr <> "" Then
        Test_E2E_KillSwitch_OffOnOff_Restore_Atomic = TestHelper.BuildJsonFail(Err.Description & " | Restore: " & restoreErr, logs)
    Else
        Test_E2E_KillSwitch_OffOnOff_Restore_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
    End If
End Function

Public Function Test_E2E_ConfigCore_LeeConfiguracionLocal_SincronizaAplicarCache_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim originalState As Boolean
    Dim opErr As String
    Dim cfgErr As String
    Dim assertError As String

    Set logs = TestHelper.NewLogs
    Call TestHelper.AssertTrue(ReadCacheHabilitadaMandatory(originalState, opErr), "Precondición: TbConfiguracion.CacheHabilitada obligatorio y legible", logs, assertError)
    If assertError <> "" Then GoTo Fail
    TestHelper.AddLog logs, "Estado original cache=" & CStr(originalState)

    opErr = ""
    Call TestHelper.AssertTrue(SetCacheHabilitadaMandatory(True, opErr), "Set CacheHabilitada=True para RED/GREEN", logs, assertError)
    If assertError <> "" Then GoTo Fail

    AplicarCache = False
    TestHelper.AddLog logs, "Precondición determinística: AplicarCache=False antes de LeeConfiguracionLocal"

    cfgErr = ""
    Call LeeConfiguracionLocal(cfgErr)
    Call TestHelper.AssertTrue(cfgErr = "", "LeeConfiguracionLocal sin error", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call TestHelper.AssertTrue(AplicarCache = True, "AplicarCache debe sincronizarse desde TbConfiguracion.CacheHabilitada", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call RestoreCacheStateMandatory(originalState, logs, opErr)
    If opErr <> "" Then
        Test_E2E_ConfigCore_LeeConfiguracionLocal_SincronizaAplicarCache_Atomic = TestHelper.BuildJsonFail(opErr, logs)
    Else
        Test_E2E_ConfigCore_LeeConfiguracionLocal_SincronizaAplicarCache_Atomic = TestHelper.BuildJsonOk(logs, "cache_mirror_ok")
    End If
    Exit Function

Fail:
    Call RestoreCacheStateMandatory(originalState, logs, opErr)
    If opErr <> "" Then assertError = assertError & " | Restore: " & opErr
    Test_E2E_ConfigCore_LeeConfiguracionLocal_SincronizaAplicarCache_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Exit Function

EH:
    Call RestoreCacheStateMandatory(originalState, logs, opErr)
    TestHelper.AddLog logs, "Error: " & Err.Description
    If opErr <> "" Then
        Test_E2E_ConfigCore_LeeConfiguracionLocal_SincronizaAplicarCache_Atomic = TestHelper.BuildJsonFail(Err.Description & " | Restore: " & opErr, logs)
    Else
        Test_E2E_ConfigCore_LeeConfiguracionLocal_SincronizaAplicarCache_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
    End If
End Function

Public Function Test_E2E_ConfigCore_EVE_NoSobreEscribeAplicarCache_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim originalState As Boolean
    Dim opErr As String
    Dim eveErr As String
    Dim assertError As String

    Set logs = TestHelper.NewLogs
    Call TestHelper.AssertTrue(ReadCacheHabilitadaMandatory(originalState, opErr), "Precondición: TbConfiguracion.CacheHabilitada obligatorio y legible", logs, assertError)
    If assertError <> "" Then GoTo Fail
    TestHelper.AddLog logs, "Estado original cache=" & CStr(originalState)

    opErr = ""
    Call TestHelper.AssertTrue(SetCacheHabilitadaMandatory(True, opErr), "Set CacheHabilitada=True previo a EVE", logs, assertError)
    If assertError <> "" Then GoTo Fail

    AplicarCache = False
    TestHelper.AddLog logs, "Precondición determinística: AplicarCache=False antes de EVE"

    eveErr = ""
    Call EVE(eveErr)
    If eveErr <> "" Then TestHelper.AddLog logs, "Detalle eveErr: " & eveErr
    Call TestHelper.AssertTrue(eveErr = "", "EVE debe ejecutarse sin error para validar sincronización de cache", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call TestHelper.AssertTrue(AplicarCache = True, "EVE no debe sobreescribir AplicarCache si configuración indica True", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call RestoreCacheStateMandatory(originalState, logs, opErr)
    If opErr <> "" Then
        Test_E2E_ConfigCore_EVE_NoSobreEscribeAplicarCache_Atomic = TestHelper.BuildJsonFail(opErr, logs)
    Else
        Test_E2E_ConfigCore_EVE_NoSobreEscribeAplicarCache_Atomic = TestHelper.BuildJsonOk(logs, "eve_cache_respected")
    End If
    Exit Function

Fail:
    Call RestoreCacheStateMandatory(originalState, logs, opErr)
    If opErr <> "" Then assertError = assertError & " | Restore: " & opErr
    Test_E2E_ConfigCore_EVE_NoSobreEscribeAplicarCache_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Exit Function

EH:
    Call RestoreCacheStateMandatory(originalState, logs, opErr)
    TestHelper.AddLog logs, "Error: " & Err.Description
    If opErr <> "" Then
        Test_E2E_ConfigCore_EVE_NoSobreEscribeAplicarCache_Atomic = TestHelper.BuildJsonFail(Err.Description & " | Restore: " & opErr, logs)
    Else
        Test_E2E_ConfigCore_EVE_NoSobreEscribeAplicarCache_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
    End If
End Function

Public Function Test_E2E_MotivoPersistencia_NCProyecto_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim sqlInsert As String
    Dim sqlDelete As String
    Dim motivoLeido As String
    Dim requiere As String
    Dim assertError As String

    Set logs = TestHelper.NewLogs
    Set db = getdb()

    sqlDelete = "DELETE FROM TbNoConformidades WHERE IDNoConformidad = " & TEST_ID_NC_PROY
    db.Execute sqlDelete, dbFailOnError

    sqlInsert = "INSERT INTO TbNoConformidades (IDNoConformidad, CodigoNoConformidad, EXPEDIENTE, PROYECTO, DESCRIPCION, CAUSA, FECHAAPERTURA, TIPO, RequiereControlEficacia, MotivoNoRequiereControlEficacia, Borrado) " & _
                "VALUES (" & TEST_ID_NC_PROY & ", " & TestHelper.SqlText("E2E-PROY-900001") & ", " & TestHelper.SqlText("E2E-EXP") & ", " & TestHelper.SqlText("E2E-PROY") & ", " & TestHelper.SqlText("Fixture E2E NC Proyecto") & ", " & TestHelper.SqlText("Causa E2E") & ", Date(), " & TestHelper.SqlText("Proyecto") & ", 'No', " & TestHelper.SqlText(TEST_MOTIVO) & ", 0)"
    db.Execute sqlInsert, dbFailOnError
    TestHelper.AddLog logs, "Fixture NC Proyecto insertado"

    Set rs = db.OpenRecordset("SELECT RequiereControlEficacia, MotivoNoRequiereControlEficacia FROM TbNoConformidades WHERE IDNoConformidad=" & TEST_ID_NC_PROY, dbOpenSnapshot)
    If rs.EOF Then
        Test_E2E_MotivoPersistencia_NCProyecto_Atomic = TestHelper.BuildJsonFail("No se encontró fixture proyecto", logs)
        GoTo Cleanup
    End If

    requiere = Trim$(Nz(rs.Fields("RequiereControlEficacia").Value, ""))
    motivoLeido = Trim$(Nz(rs.Fields("MotivoNoRequiereControlEficacia").Value, ""))

    Call TestHelper.AssertTrue(requiere = "No", "RequiereControlEficacia debe persistir en 'No'", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(motivoLeido = TEST_MOTIVO, "MotivoNoRequiereControlEficacia debe persistir texto exacto", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Test_E2E_MotivoPersistencia_NCProyecto_Atomic = TestHelper.BuildJsonOk(logs, motivoLeido)
    GoTo Cleanup

Fail:
    Test_E2E_MotivoPersistencia_NCProyecto_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_E2E_MotivoPersistencia_NCProyecto_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    db.Execute "DELETE FROM TbNoConformidades WHERE IDNoConformidad = " & TEST_ID_NC_PROY, dbFailOnError
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Set db = Nothing
End Function

Public Function Test_E2E_MotivoPersistencia_NCAuditoria_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim sqlInsert As String
    Dim motivoLeido As String
    Dim requiere As String
    Dim assertError As String

    Set logs = TestHelper.NewLogs
    Set db = getdb()

    db.Execute "DELETE FROM TbNoConformidadesAuditoria WHERE ID = " & TEST_ID_NC_AUD, dbFailOnError
    db.Execute "DELETE FROM TbAuditorias WHERE IDAuditoria = " & TEST_ID_AUDITORIA, dbFailOnError
    db.Execute "INSERT INTO TbAuditorias (IDAuditoria, Tipo, FechaInicio, FechaFin) VALUES (" & TEST_ID_AUDITORIA & ", " & TestHelper.SqlText("E2E") & ", Date(), Date())", dbFailOnError
    TestHelper.AddLog logs, "Fixture padre TbAuditorias insertado"

    sqlInsert = "INSERT INTO TbNoConformidadesAuditoria (ID, IDAuditoria, FechaApertura, Numero, DESCRIPCION, CAUSARAIZ, RESPONSABLEIMPLANTACION, RequiereAccionCorrectiva, Tipo, RequiereControlEficacia, MotivoNoRequiereControlEficacia, Borrado) " & _
                "VALUES (" & TEST_ID_NC_AUD & ", " & TEST_ID_AUDITORIA & ", Date(), " & TestHelper.SqlText("E2E-AUD-900002") & ", " & TestHelper.SqlText("Fixture E2E NC Auditoria") & ", " & TestHelper.SqlText("Causa raíz E2E") & ", " & TestHelper.SqlText("adm") & ", 'No', " & TestHelper.SqlText("Auditoria") & ", 'No', " & TestHelper.SqlText(TEST_MOTIVO) & ", 0)"
    db.Execute sqlInsert, dbFailOnError
    TestHelper.AddLog logs, "Fixture NC Auditoría insertado"

    Set rs = db.OpenRecordset("SELECT RequiereControlEficacia, MotivoNoRequiereControlEficacia FROM TbNoConformidadesAuditoria WHERE ID=" & TEST_ID_NC_AUD, dbOpenSnapshot)
    If rs.EOF Then
        Test_E2E_MotivoPersistencia_NCAuditoria_Atomic = TestHelper.BuildJsonFail("No se encontró fixture auditoría", logs)
        GoTo Cleanup
    End If

    requiere = Trim$(Nz(rs.Fields("RequiereControlEficacia").Value, ""))
    motivoLeido = Trim$(Nz(rs.Fields("MotivoNoRequiereControlEficacia").Value, ""))

    Call TestHelper.AssertTrue(requiere = "No", "RequiereControlEficacia auditoría debe persistir en 'No'", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(motivoLeido = TEST_MOTIVO, "MotivoNoRequiereControlEficacia auditoría debe persistir texto exacto", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Test_E2E_MotivoPersistencia_NCAuditoria_Atomic = TestHelper.BuildJsonOk(logs, motivoLeido)
    GoTo Cleanup

Fail:
    Test_E2E_MotivoPersistencia_NCAuditoria_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_E2E_MotivoPersistencia_NCAuditoria_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    db.Execute "DELETE FROM TbNoConformidadesAuditoria WHERE ID = " & TEST_ID_NC_AUD, dbFailOnError
    db.Execute "DELETE FROM TbAuditorias WHERE IDAuditoria = " & TEST_ID_AUDITORIA, dbFailOnError
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Set db = Nothing
End Function

Public Function Test_E2E_Cache_PrecalentarSincronizar_LogEvidence_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim idNC As Long
    Dim originalState As Boolean
    Dim opErr As String
    Dim assertError As String
    Dim ok As Boolean
    Dim cacheCount As Long
    Dim logCount As Long

    Set logs = TestHelper.NewLogs
    Set db = getdb()

    idNC = ObtenerIDNCControlado(db)
    Call TestHelper.AssertTrue(idNC > 0, "Debe existir al menos una NC activa para test controlado", logs, assertError)
    If assertError <> "" Then GoTo Fail

    originalState = IsCacheEnabled()
    opErr = ""
    ok = CacheConfig_SetEnabled(True, opErr)
    Call TestHelper.AssertTrue(ok, "Cache ON para validación funcional", logs, assertError)
    If assertError <> "" Then GoTo Fail

    opErr = ""
    ok = SincronizarCache(opErr)
    Call TestHelper.AssertTrue(ok, "SincronizarCache debe completar en ON", logs, assertError)
    If assertError <> "" Then GoTo Fail

    opErr = ""
    ok = PrecalentarCacheCompleto(20, True, "", True, opErr)
    Call TestHelper.AssertTrue(ok, "PrecalentarCacheCompleto debe completar en ON", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC", dbOpenSnapshot)
    cacheCount = CLng(Nz(rs.Fields("Total").Value, 0))
    rs.Close: Set rs = Nothing
    Call TestHelper.AssertTrue(cacheCount > 0, "TbCacheListadoNC debe quedar poblada", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbLogCache WHERE TipoOperacion IN ('Sincronizar','PrecalentarCache')", dbOpenSnapshot)
    logCount = CLng(Nz(rs.Fields("Total").Value, 0))
    rs.Close: Set rs = Nothing
    Call TestHelper.AssertTrue(logCount > 0, "TbLogCache debe registrar evidencia de sincronización/precalentado", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call RestoreCacheStateE2E(originalState, logs, opErr)
    If opErr <> "" Then
        Test_E2E_Cache_PrecalentarSincronizar_LogEvidence_Atomic = TestHelper.BuildJsonFail(opErr, logs)
    Else
        Test_E2E_Cache_PrecalentarSincronizar_LogEvidence_Atomic = TestHelper.BuildJsonOk(logs, cacheCount)
    End If
    Exit Function

Fail:
    Call RestoreCacheStateE2E(originalState, logs, opErr)
    If opErr <> "" Then assertError = assertError & " | Restore: " & opErr
    Test_E2E_Cache_PrecalentarSincronizar_LogEvidence_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Exit Function

EH:
    Call RestoreCacheStateE2E(originalState, logs, opErr)
    TestHelper.AddLog logs, "Error: " & Err.Description
    If opErr <> "" Then
        Test_E2E_Cache_PrecalentarSincronizar_LogEvidence_Atomic = TestHelper.BuildJsonFail(Err.Description & " | Restore: " & opErr, logs)
    Else
        Test_E2E_Cache_PrecalentarSincronizar_LogEvidence_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
    End If
End Function

Public Function Test_E2E_Cache_Invalidate_NoStaleListado_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim idNC As Long
    Dim originalState As Boolean
    Dim originalDesc As String
    Dim mutatedDesc As String
    Dim cacheDesc As String
    Dim opErr As String
    Dim assertError As String
    Dim ok As Boolean

    Set logs = TestHelper.NewLogs
    Set db = getdb()

    idNC = ObtenerIDNCControlado(db)
    Call TestHelper.AssertTrue(idNC > 0, "Debe existir una NC activa para invalidación controlada", logs, assertError)
    If assertError <> "" Then GoTo Fail

    originalState = IsCacheEnabled()
    originalDesc = ObtenerDescripcionNC(db, idNC)
    mutatedDesc = "E2E-CACHE-" & CStr(idNC) & "-" & Format$(Now, "yyyymmddhhnnss")

    opErr = ""
    ok = CacheConfig_SetEnabled(True, opErr)
    Call TestHelper.AssertTrue(ok, "Cache ON para escenario no-stale", logs, assertError)
    If assertError <> "" Then GoTo Fail

    opErr = ""
    ok = SincronizarCache(opErr)
    Call TestHelper.AssertTrue(ok, "Sincronización base previa", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call ActualizarDescripcionNC(db, idNC, mutatedDesc)
    opErr = ""
    ok = InvalidateListItem(idNC, opErr)
    Call TestHelper.AssertTrue(ok, "InvalidateListItem debe regenerar registro listado", logs, assertError)
    If assertError <> "" Then GoTo Fail

    cacheDesc = ObtenerDescripcionCacheListado(db, idNC)
    Call TestHelper.AssertTrue(cacheDesc = mutatedDesc, "TbCacheListadoNC debe reflejar descripción actualizada", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call ActualizarDescripcionNC(db, idNC, originalDesc)
    opErr = ""
    Call InvalidateListItem(idNC, opErr)
    Call RestoreCacheStateE2E(originalState, logs, opErr)
    If opErr <> "" Then
        Test_E2E_Cache_Invalidate_NoStaleListado_Atomic = TestHelper.BuildJsonFail(opErr, logs)
    Else
        Test_E2E_Cache_Invalidate_NoStaleListado_Atomic = TestHelper.BuildJsonOk(logs, cacheDesc)
    End If
    Exit Function

Fail:
    On Error Resume Next
    If idNC > 0 Then Call ActualizarDescripcionNC(db, idNC, originalDesc)
    On Error GoTo 0
    Call RestoreCacheStateE2E(originalState, logs, opErr)
    If opErr <> "" Then assertError = assertError & " | Restore: " & opErr
    Test_E2E_Cache_Invalidate_NoStaleListado_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Exit Function

EH:
    On Error Resume Next
    If idNC > 0 Then Call ActualizarDescripcionNC(db, idNC, originalDesc)
    On Error GoTo 0
    Call RestoreCacheStateE2E(originalState, logs, opErr)
    TestHelper.AddLog logs, "Error: " & Err.Description
    If opErr <> "" Then
        Test_E2E_Cache_Invalidate_NoStaleListado_Atomic = TestHelper.BuildJsonFail(Err.Description & " | Restore: " & opErr, logs)
    Else
        Test_E2E_Cache_Invalidate_NoStaleListado_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
    End If
End Function

Private Function ObtenerIDNCControlado(ByVal p_Db As DAO.Database) As Long
    Dim rs As DAO.Recordset
    On Error GoTo EH

    Set rs = p_Db.OpenRecordset("SELECT TOP 1 IDNoConformidad FROM TbNoConformidades WHERE Nz(Borrado,0)=0 ORDER BY IDNoConformidad", dbOpenSnapshot)
    If Not rs.EOF Then ObtenerIDNCControlado = CLng(Nz(rs.Fields("IDNoConformidad").Value, 0))
    rs.Close: Set rs = Nothing
    Exit Function
EH:
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    ObtenerIDNCControlado = 0
End Function

Private Function ObtenerDescripcionNC(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long) As String
    Dim rs As DAO.Recordset
    Set rs = p_Db.OpenRecordset("SELECT TOP 1 Descripcion FROM TbNoConformidades WHERE IDNoConformidad=" & p_IDNC, dbOpenSnapshot)
    If Not rs.EOF Then ObtenerDescripcionNC = Nz(rs.Fields("Descripcion").Value, "")
    rs.Close: Set rs = Nothing
End Function

Private Function ObtenerDescripcionCacheListado(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long) As String
    Dim rs As DAO.Recordset
    Set rs = p_Db.OpenRecordset("SELECT TOP 1 Descripcion FROM TbCacheListadoNC WHERE IDNoConformidad=" & p_IDNC, dbOpenSnapshot)
    If Not rs.EOF Then ObtenerDescripcionCacheListado = Nz(rs.Fields("Descripcion").Value, "")
    rs.Close: Set rs = Nothing
End Function

Private Sub ActualizarDescripcionNC(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long, ByVal p_Descripcion As String)
    p_Db.Execute "UPDATE TbNoConformidades SET Descripcion='" & Replace$(p_Descripcion, "'", "''") & "' WHERE IDNoConformidad=" & p_IDNC, dbFailOnError
End Sub

Private Sub RestaurarConfiguracionDesdeSnapshot(ByRef p_Rs As DAO.Recordset, ByVal p_Cache As Variant, ByVal p_Fecha As Variant, ByVal p_Usuario As Variant, ByVal p_Motivo As Variant, ByRef p_Logs As Collection)
    On Error Resume Next
    If p_Rs Is Nothing Then Exit Sub
    If p_Rs.EOF Then Exit Sub
    p_Rs.Edit
    p_Rs.Fields("CacheHabilitada").Value = p_Cache
    p_Rs.Fields("FechaCambioCache").Value = p_Fecha
    p_Rs.Fields("UsuarioCambioCache").Value = p_Usuario
    p_Rs.Fields("MotivoCambioCache").Value = p_Motivo
    p_Rs.Update
    TestHelper.AddLog p_Logs, "Rollback defensivo de TbConfiguracion aplicado"
End Sub

Private Sub RestoreCacheStateE2E(ByVal p_Enabled As Boolean, ByRef p_Logs As Collection, ByRef p_Error As String)
    Dim opError As String
    Dim ok As Boolean

    opError = ""
    ok = CacheConfig_SetEnabled(p_Enabled, opError)
    If ok Then
        p_Error = ""
        TestHelper.AddLog p_Logs, "Estado restaurado a " & CStr(p_Enabled)
    Else
        p_Error = "No se pudo restaurar estado de caché"
        If opError <> "" Then p_Error = p_Error & " | " & opError
        TestHelper.AddLog p_Logs, p_Error
    End If
End Sub

Private Sub RestoreTbConfiguracionBackends(ByRef p_Rs As DAO.Recordset, ByVal p_BackendActivo As String, ByVal p_BackendProduccion As String, ByVal p_BackendSandbox As String, ByVal p_EnPruebas As String, ByVal p_IDAplicacion As Variant, ByVal p_RutaProd As String, ByVal p_RutaLocal As String, ByRef p_Logs As Collection)
    On Error Resume Next
    If p_Rs Is Nothing Then Exit Sub
    If p_Rs.EOF Then Exit Sub

    p_Rs.Edit
    p_Rs.Fields("BackendActivo").Value = p_BackendActivo
    p_Rs.Fields("BackendProduccion").Value = p_BackendProduccion
    p_Rs.Fields("BackendSandbox").Value = p_BackendSandbox
    p_Rs.Fields("EnPruebas").Value = p_EnPruebas
    p_Rs.Fields("IDAplicacion").Value = p_IDAplicacion
    p_Rs.Fields("RutaDirectorioAplicacion_PROD").Value = p_RutaProd
    p_Rs.Fields("RutaDirectorioAplicacion_LOCAL").Value = p_RutaLocal
    p_Rs.Update
    TestHelper.AddLog p_Logs, "Rollback defensivo de TbConfiguracionBackends aplicado"
End Sub

Private Function ReadCacheHabilitadaMandatory(ByRef p_Value As Boolean, ByRef p_Error As String) As Boolean
    Dim db As DAO.Database
    Dim rs As DAO.Recordset

    On Error GoTo EH
    ReadCacheHabilitadaMandatory = False
    p_Error = ""
    p_Value = False

    Set db = getdb(p_Error)
    If db Is Nothing Then
        If p_Error = "" Then p_Error = "No se pudo abrir backend configurado vía getdb()"
        GoTo CleanExit
    End If

    Set rs = db.OpenRecordset("SELECT TOP 1 CacheHabilitada FROM TbConfiguracion WHERE ID=1", dbOpenSnapshot)

    If rs.EOF Then
        p_Error = "Contrato obligatorio incumplido: falta TbConfiguracion.ID=1"
        GoTo CleanExit
    End If

    p_Value = CBool(Nz(rs.Fields("CacheHabilitada").Value, False))
    ReadCacheHabilitadaMandatory = True

CleanExit:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    If Not db Is Nothing Then db.Close
    Set db = Nothing
    Exit Function

EH:
    p_Error = "Contrato obligatorio incumplido en TbConfiguracion.CacheHabilitada: " & Err.Description
    Resume CleanExit
End Function

Private Function SetCacheHabilitadaMandatory(ByVal p_Enabled As Boolean, ByRef p_Error As String) As Boolean
    Dim db As DAO.Database
    Dim rowsAffected As Long

    On Error GoTo EH
    SetCacheHabilitadaMandatory = False
    p_Error = ""

    Set db = getdb(p_Error)
    If db Is Nothing Then
        If p_Error = "" Then p_Error = "No se pudo abrir backend configurado vía getdb()"
        GoTo CleanExit
    End If

    db.Execute "UPDATE TbConfiguracion SET CacheHabilitada=" & CStr(Abs(p_Enabled)) & " WHERE ID=1", dbFailOnError
    rowsAffected = db.RecordsAffected
    If rowsAffected <> 1 Then
        p_Error = "Contrato obligatorio incumplido: UPDATE TbConfiguracion.ID=1 afectó " & CStr(rowsAffected) & " fila(s)"
        GoTo CleanExit
    End If

    SetCacheHabilitadaMandatory = True

CleanExit:
    On Error Resume Next
    If Not db Is Nothing Then db.Close
    Set db = Nothing
    Exit Function

EH:
    p_Error = "Contrato obligatorio incumplido al escribir TbConfiguracion.CacheHabilitada: " & Err.Description
    Resume CleanExit
End Function

Private Sub RestoreCacheStateMandatory(ByVal p_Enabled As Boolean, ByRef p_Logs As Collection, ByRef p_Error As String)
    Dim opError As String
    Dim ok As Boolean

    opError = ""
    ok = SetCacheHabilitadaMandatory(p_Enabled, opError)
    If ok Then
        p_Error = ""
        TestHelper.AddLog p_Logs, "Estado restaurado a " & CStr(p_Enabled)
    Else
        p_Error = "No se pudo restaurar estado de caché"
        If opError <> "" Then p_Error = p_Error & " | " & opError
        TestHelper.AddLog p_Logs, p_Error
    End If
End Sub
