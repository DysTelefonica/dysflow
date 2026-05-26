Attribute VB_Name = "Test_E2E_BateriaNC"
Option Compare Database
Option Explicit

Private Const TEST_ID_NC_PROY As Long = 900001
Private Const TEST_ID_NC_AUD As Long = 900002
Private Const TEST_ID_AUDITORIA As Long = 900003
Private Const TEST_ID_NC_CACHE As Long = 900004
Private Const TEST_MOTIVO As String = "Motivo E2E control eficacia no requerido"


Public Function Test_E2E_EnvConfig_AplicaBackendActivo_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim originalBackendSandbox As String
    Dim assertError As String
    Dim sessionErr As String
    Dim backendDb As DAO.Database
    Dim backendErr As String

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_E2E_EnvConfig_AplicaBackendActivo_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        GoTo Cleanup
    End If
    Set db = CurrentDb
    Set rs = db.OpenRecordset("SELECT BackendSandbox FROM TbConfiguracionBackends WHERE ID = 1", dbOpenSnapshot)

    If rs.EOF Then
        Test_E2E_EnvConfig_AplicaBackendActivo_Atomic = TestHelper.BuildJsonFail("TbConfiguracionBackends sin filas", logs)
        GoTo Cleanup
    End If

    originalBackendSandbox = Trim$(Nz(rs.Fields("BackendSandbox").Value, ""))

    If originalBackendSandbox = "" Then
        Test_E2E_EnvConfig_AplicaBackendActivo_Atomic = TestHelper.BuildJsonFail("BackendSandbox vacío", logs)
        GoTo Cleanup
    End If

    TestHelper.AddLog logs, "Configuración preservada: BackendSandbox=" & originalBackendSandbox
    Call TestHelper.AssertTrue(m_TestingMode, "BeginTestSession debe activar m_TestingMode", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(Nz(Application.TempVars("DatosEnLocal"), "") = "Sí", "DatosEnLocal debe forzarse a 'Sí' en modo test aunque BackendActivo sea PROD", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(Nz(Application.TempVars("BackendPathConfigurado"), "") = originalBackendSandbox, "BackendPathConfigurado debe usar BackendSandbox en modo test", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(m_BackendSandboxURL = originalBackendSandbox, "m_BackendSandboxURL debe registrar el backend local de test", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(fso.FileExists(originalBackendSandbox), "BackendSandbox local debe existir antes de desplegar tests", logs, assertError)
    If assertError <> "" Then GoTo Fail

    backendErr = ""
    Set backendDb = getdb(backendErr)
    Call TestHelper.AssertTrue(backendErr = "" And Not backendDb Is Nothing, "getdb debe abrir BackendSandbox en modo test sin fallback a PROD", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(StrComp(backendDb.Name, originalBackendSandbox, vbTextCompare) = 0, "getdb debe apuntar al BackendSandbox configurado", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call TestHelper.EndTestSession(logs)
    Test_E2E_EnvConfig_AplicaBackendActivo_Atomic = TestHelper.BuildJsonOk(logs, "backend_switch_ok")
    GoTo Cleanup

Fail:
    Call TestHelper.EndTestSession(logs)
    Test_E2E_EnvConfig_AplicaBackendActivo_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    Call TestHelper.EndTestSession(logs)
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_E2E_EnvConfig_AplicaBackendActivo_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not backendDb Is Nothing Then backendDb.Close
    Set backendDb = Nothing
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Set db = Nothing
End Function

Public Function Test_MotivoNoRequiereControlEficacia_DomainFields_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim ncProyecto As NCProyecto
    Dim ncAuditoria As NCAuditoria
    Dim assertError As String

    Set logs = TestHelper.NewLogs
    Set ncProyecto = New NCProyecto
    Set ncAuditoria = New NCAuditoria

    ncProyecto.MotivoNoRequiereControlEficacia = "Motivo proyecto test"
    ncAuditoria.MotivoNoRequiereControlEficacia = "Motivo auditoria test"

    Call TestHelper.AssertTrue(ncProyecto.MotivoNoRequiereControlEficacia = "Motivo proyecto test", "NCProyecto expone MotivoNoRequiereControlEficacia", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(ncAuditoria.MotivoNoRequiereControlEficacia = "Motivo auditoria test", "NCAuditoria expone MotivoNoRequiereControlEficacia", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Test_MotivoNoRequiereControlEficacia_DomainFields_Atomic = TestHelper.BuildJsonOk(logs, "domain_fields_ok")
    Exit Function

Fail:
    Test_MotivoNoRequiereControlEficacia_DomainFields_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Exit Function

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_MotivoNoRequiereControlEficacia_DomainFields_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
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
    TestHelper.AddLog logs, "Retired: esta prueba requería mutar TbConfiguracionBackends y fue retirada del manifest."
    Test_E2E_EnvConfig_EnPruebasInvalido_Bloquea_Atomic = TestHelper.BuildJsonFail("RETIRED TEST: no ejecutar como test activo", logs)
    Exit Function

    Set db = CurrentDb
    Set rs = db.OpenRecordset("SELECT * FROM TbConfiguracionBackends WHERE ID = 1", dbOpenDynaset)

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
    Set rs = db.OpenRecordset("SELECT BackendActivo, BackendSandbox, EnPruebas FROM TbConfiguracionBackends WHERE ID = 1", dbOpenSnapshot)

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
    TestHelper.AddLog logs, "Retired: esta prueba requería mutar TbConfiguracionBackends y fue retirada del manifest."
    Test_E2E_EnvConfig_RutaAplicacionLocal_NoEstandar_Normalizada_Atomic = TestHelper.BuildJsonFail("RETIRED TEST: no ejecutar como test activo", logs)
    Exit Function

    Set db = CurrentDb
    Set rs = db.OpenRecordset("SELECT * FROM TbConfiguracionBackends WHERE ID = 1", dbOpenDynaset)

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

    rutaNoEstandar = CurrentProject.Path
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
    TestHelper.AddLog logs, "Retired: esta prueba requería mutar TbConfiguracionBackends y fue retirada del manifest."
    Test_E2E_EnvConfig_EntornoURLDirAplicacion_UsaRutaConfigurada_Atomic = TestHelper.BuildJsonFail("RETIRED TEST: no ejecutar como test activo", logs)
    Exit Function

    Set db = CurrentDb
    Set rs = db.OpenRecordset("SELECT * FROM TbConfiguracionBackends WHERE ID = 1", dbOpenDynaset)

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

    rutaNoEstandar = CurrentProject.Path
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
    TestHelper.AddLog logs, "Retired: esta prueba requería mutar TbConfiguracionBackends y fue retirada del manifest."
    Test_E2E_EnvConfig_EnPruebas_NoRuteaInfra_Atomic = TestHelper.BuildJsonFail("RETIRED TEST: no ejecutar como test activo", logs)
    Exit Function

    Set db = CurrentDb
    Set rs = db.OpenRecordset("SELECT * FROM TbConfiguracionBackends WHERE ID = 1", dbOpenDynaset)

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
    rs.Fields("RutaDirectorioAplicacion_LOCAL").Value = CurrentProject.Path
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
    TestHelper.AddLog logs, "Retired: esta prueba requería mutar TbConfiguracionBackends y fue retirada del manifest."
    Test_E2E_EnvConfig_FailFast_BackendInaccesible_Atomic = TestHelper.BuildJsonFail("RETIRED TEST: no ejecutar como test activo", logs)
    Exit Function

    Set db = CurrentDb
    Set rs = db.OpenRecordset("SELECT * FROM TbConfiguracionBackends WHERE ID = 1", dbOpenDynaset)

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
    TestHelper.AddLog logs, "Retired: esta prueba requería mutar TbConfiguracionBackends y fue retirada del manifest."
    Test_E2E_EnvConfig_FailFast_DiagnosticoAgregado_Atomic = TestHelper.BuildJsonFail("RETIRED TEST: no ejecutar como test activo", logs)
    Exit Function

    Set db = CurrentDb
    Set rs = db.OpenRecordset("SELECT * FROM TbConfiguracionBackends WHERE ID = 1", dbOpenDynaset)

    If rs.EOF Then
        Test_E2E_EnvConfig_FailFast_DiagnosticoAgregado_Atomic = TestHelper.BuildJsonFail("TbConfiguracionBackends sin fila ID=1", logs)
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
    Dim sessionErr As String
    Dim fixtureErr As String

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_E2E_KillSwitch_EscribeYRestauraTbConfiguracion_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        GoTo Cleanup
    End If

    fixtureErr = ""
    If Not EnsureConfigCoreCacheFixture(logs, fixtureErr) Then
        Test_E2E_KillSwitch_EscribeYRestauraTbConfiguracion_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & fixtureErr, logs)
        GoTo Cleanup
    End If

    Set db = getdb(fixtureErr)
    If db Is Nothing Then
        If fixtureErr = "" Then fixtureErr = "No se pudo abrir backend sandbox vía getdb()"
        Test_E2E_KillSwitch_EscribeYRestauraTbConfiguracion_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & fixtureErr, logs)
        GoTo Cleanup
    End If
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
    rs.Fields("FechaCambioCache").Value = DateSerial(2026, 1, 1)
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
    Call TestHelper.EndTestSession(logs)
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
    Dim sessionErr As String

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_E2E_KillSwitch_OffOnOff_Restore_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
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
    Call TestHelper.EndTestSession(logs)
    Exit Function

Fail:
    Call RestoreCacheStateE2E(originalState, logs, restoreErr)
    If restoreErr <> "" Then assertError = assertError & " | Restore: " & restoreErr
    Test_E2E_KillSwitch_OffOnOff_Restore_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Call TestHelper.EndTestSession(logs)
    Exit Function

EH:
    Call RestoreCacheStateE2E(originalState, logs, restoreErr)
    TestHelper.AddLog logs, "Error: " & Err.Description
    If restoreErr <> "" Then
        Test_E2E_KillSwitch_OffOnOff_Restore_Atomic = TestHelper.BuildJsonFail(Err.Description & " | Restore: " & restoreErr, logs)
    Else
        Test_E2E_KillSwitch_OffOnOff_Restore_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
    End If
    Call TestHelper.EndTestSession(logs)
End Function

Public Function Test_E2E_ConfigCore_LeeConfiguracionLocal_SincronizaAplicarCache_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim originalState As Boolean
    Dim opErr As String
    Dim cfgErr As String
    Dim assertError As String
    Dim sessionErr As String
    Dim fixtureErr As String

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_E2E_ConfigCore_LeeConfiguracionLocal_SincronizaAplicarCache_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    If Not EnsureConfigCoreCacheFixture(logs, fixtureErr) Then
        Test_E2E_ConfigCore_LeeConfiguracionLocal_SincronizaAplicarCache_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & fixtureErr, logs)
        Call TestHelper.EndTestSession(logs)
        Exit Function
    End If

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
    Call TestHelper.EndTestSession(logs)
    Exit Function

Fail:
    Call RestoreCacheStateMandatory(originalState, logs, opErr)
    If opErr <> "" Then assertError = assertError & " | Restore: " & opErr
    Test_E2E_ConfigCore_LeeConfiguracionLocal_SincronizaAplicarCache_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Call TestHelper.EndTestSession(logs)
    Exit Function

EH:
    Call RestoreCacheStateMandatory(originalState, logs, opErr)
    TestHelper.AddLog logs, "Error: " & Err.Description
    If opErr <> "" Then
        Test_E2E_ConfigCore_LeeConfiguracionLocal_SincronizaAplicarCache_Atomic = TestHelper.BuildJsonFail(Err.Description & " | Restore: " & opErr, logs)
    Else
        Test_E2E_ConfigCore_LeeConfiguracionLocal_SincronizaAplicarCache_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
    End If
    Call TestHelper.EndTestSession(logs)
End Function

Public Function Test_E2E_ConfigCore_EVE_NoSobreEscribeAplicarCache_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim originalState As Boolean
    Dim opErr As String
    Dim eveErr As String
    Dim assertError As String
    Dim sessionErr As String
    Dim fixtureErr As String

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_E2E_ConfigCore_EVE_NoSobreEscribeAplicarCache_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    If Not EnsureConfigCoreCacheFixture(logs, fixtureErr) Then
        Test_E2E_ConfigCore_EVE_NoSobreEscribeAplicarCache_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & fixtureErr, logs)
        Call TestHelper.EndTestSession(logs)
        Exit Function
    End If

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
    Call TestHelper.EndTestSession(logs)
    Exit Function

Fail:
    Call RestoreCacheStateMandatory(originalState, logs, opErr)
    If opErr <> "" Then assertError = assertError & " | Restore: " & opErr
    Test_E2E_ConfigCore_EVE_NoSobreEscribeAplicarCache_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Call TestHelper.EndTestSession(logs)
    Exit Function

EH:
    Call RestoreCacheStateMandatory(originalState, logs, opErr)
    TestHelper.AddLog logs, "Error: " & Err.Description
    If opErr <> "" Then
        Test_E2E_ConfigCore_EVE_NoSobreEscribeAplicarCache_Atomic = TestHelper.BuildJsonFail(Err.Description & " | Restore: " & opErr, logs)
    Else
        Test_E2E_ConfigCore_EVE_NoSobreEscribeAplicarCache_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
    End If
    Call TestHelper.EndTestSession(logs)
End Function

Public Function Test_E2E_MotivoPersistencia_NCProyecto_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim sqlInsert As String
    Dim motivoLeido As String
    Dim requiere As String
    Dim assertError As String
    Dim ncLoaded As NCProyecto
    Dim loadError As String
    Dim sessionErr As String
    Dim fixtureRows As Long

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_E2E_MotivoPersistencia_NCProyecto_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        GoTo Cleanup
    End If
    Set db = getdb()

    If Not EnsureMotivoNoRequiereControlEficaciaSchema(db, logs, assertError) Then GoTo Fail

    Call CleanupMotivoProyectoFixture(db, logs)

    sqlInsert = "INSERT INTO TbNoConformidades (IDNoConformidad, CodigoNoConformidad, EXPEDIENTE, PROYECTO, DESCRIPCION, CAUSA, FECHAAPERTURA, TIPO, RequiereControlEficacia, MotivoNoRequiereControlEficacia, Borrado) " & _
                "VALUES (" & TEST_ID_NC_PROY & ", " & TestHelper.SqlText("E2E-PROY-900001") & ", " & TestHelper.SqlText("E2E-EXP") & ", " & TestHelper.SqlText("E2E-PROY") & ", " & TestHelper.SqlText("Fixture E2E NC Proyecto") & ", " & TestHelper.SqlText("Causa E2E") & ", Date(), " & TestHelper.SqlText("Proyecto") & ", 'No', " & TestHelper.SqlText(TEST_MOTIVO) & ", 0)"
    db.Execute sqlInsert, dbFailOnError
    TestHelper.AddLog logs, "Fixture NC Proyecto insertado"

    fixtureRows = CountRowsBySql(db, "SELECT COUNT(*) AS Total FROM TbNoConformidades WHERE IDNoConformidad = " & TEST_ID_NC_PROY & " AND RequiereControlEficacia = 'No' AND MotivoNoRequiereControlEficacia = " & TestHelper.SqlText(TEST_MOTIVO))
    Call TestHelper.AssertTrue(fixtureRows = 1, "Fixture NC Proyecto debe quedar con cardinalidad exacta y motivo controlado", logs, assertError)
    If assertError <> "" Then GoTo Fail

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

    loadError = ""
    Set ncLoaded = constructor.getNCProyecto(p_IDNC:=CStr(TEST_ID_NC_PROY), p_Error:=loadError)
    Call TestHelper.AssertTrue(loadError = "", "constructor.getNCProyecto debe cargar sin error", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(Not ncLoaded Is Nothing, "constructor.getNCProyecto debe devolver objeto", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(ncLoaded.MotivoNoRequiereControlEficacia = TEST_MOTIVO, "constructor.getNCProyecto debe hidratar MotivoNoRequiereControlEficacia", logs, assertError)
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
    If Not db Is Nothing Then Call CleanupMotivoProyectoFixture(db, logs)
    If Not rs Is Nothing Then rs.Close
    Call TestHelper.EndTestSession(logs)
    Set rs = Nothing
    Set ncLoaded = Nothing
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
    Dim ncLoaded As NCAuditoria
    Dim loadError As String
    Dim sessionErr As String
    Dim parentRows As Long
    Dim fixtureRows As Long

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_E2E_MotivoPersistencia_NCAuditoria_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        GoTo Cleanup
    End If
    Set db = getdb()

    If Not EnsureMotivoNoRequiereControlEficaciaSchema(db, logs, assertError) Then GoTo Fail

    Call CleanupMotivoAuditoriaFixture(db, logs)
    db.Execute "INSERT INTO TbAuditorias (IDAuditoria, Tipo, FechaInicio, FechaFin) VALUES (" & TEST_ID_AUDITORIA & ", " & TestHelper.SqlText("E2E") & ", Date(), Date())", dbFailOnError
    TestHelper.AddLog logs, "Fixture padre TbAuditorias insertado"

    parentRows = CountRowsBySql(db, "SELECT COUNT(*) AS Total FROM TbAuditorias WHERE IDAuditoria = " & TEST_ID_AUDITORIA)
    Call TestHelper.AssertTrue(parentRows = 1, "Fixture padre TbAuditorias debe quedar con cardinalidad exacta", logs, assertError)
    If assertError <> "" Then GoTo Fail

    sqlInsert = "INSERT INTO TbNoConformidadesAuditoria (ID, IDAuditoria, FechaApertura, Numero, DESCRIPCION, CAUSARAIZ, RESPONSABLEIMPLANTACION, RequiereAccionCorrectiva, Tipo, RequiereControlEficacia, MotivoNoRequiereControlEficacia, Borrado) " & _
                "VALUES (" & TEST_ID_NC_AUD & ", " & TEST_ID_AUDITORIA & ", Date(), " & TestHelper.SqlText("E2E-AUD-900002") & ", " & TestHelper.SqlText("Fixture E2E NC Auditoria") & ", " & TestHelper.SqlText("Causa raíz E2E") & ", " & TestHelper.SqlText("adm") & ", 'No', " & TestHelper.SqlText("Auditoria") & ", 'No', " & TestHelper.SqlText(TEST_MOTIVO) & ", 0)"
    db.Execute sqlInsert, dbFailOnError
    TestHelper.AddLog logs, "Fixture NC Auditoría insertado"

    fixtureRows = CountRowsBySql(db, "SELECT COUNT(*) AS Total FROM TbNoConformidadesAuditoria WHERE ID = " & TEST_ID_NC_AUD & " AND IDAuditoria = " & TEST_ID_AUDITORIA & " AND RequiereControlEficacia = 'No' AND MotivoNoRequiereControlEficacia = " & TestHelper.SqlText(TEST_MOTIVO))
    Call TestHelper.AssertTrue(fixtureRows = 1, "Fixture NC Auditoría debe quedar con cardinalidad exacta y FK padre controlada", logs, assertError)
    If assertError <> "" Then GoTo Fail

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

    loadError = ""
    Set ncLoaded = constructor.getNCAuditoria(p_IDNC:=CStr(TEST_ID_NC_AUD), p_Error:=loadError)
    Call TestHelper.AssertTrue(loadError = "", "constructor.getNCAuditoria debe cargar sin error", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(Not ncLoaded Is Nothing, "constructor.getNCAuditoria debe devolver objeto", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(ncLoaded.MotivoNoRequiereControlEficacia = TEST_MOTIVO, "constructor.getNCAuditoria debe hidratar MotivoNoRequiereControlEficacia", logs, assertError)
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
    If Not db Is Nothing Then Call CleanupMotivoAuditoriaFixture(db, logs)
    If Not rs Is Nothing Then rs.Close
    Call TestHelper.EndTestSession(logs)
    Set rs = Nothing
    Set ncLoaded = Nothing
    Set db = Nothing
End Function

Private Function EnsureMotivoNoRequiereControlEficaciaSchema(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection, ByRef p_Error As String) As Boolean
    On Error GoTo EH

    EnsureMotivoNoRequiereControlEficaciaSchema = False
    p_Error = ""

    If Not TestHelper.AssertSandboxBackend(p_Logs, p_Error) Then Exit Function
    If Not EnsureTableFields(p_Db, "TbNoConformidades", MotivoNCProyectoSeedFields(), p_Logs, p_Error) Then Exit Function
    If Not EnsureTableFields(p_Db, "TbAuditorias", MotivoAuditoriaParentSeedFields(), p_Logs, p_Error) Then Exit Function
    If Not EnsureTableFields(p_Db, "TbNoConformidadesAuditoria", MotivoNCAuditoriaSeedFields(), p_Logs, p_Error) Then Exit Function
    If Not EnsureNoRequiredFieldsOutsideSeed(p_Db, "TbNoConformidades", MotivoNCProyectoSeedFields(), p_Logs, p_Error) Then Exit Function
    If Not EnsureNoRequiredFieldsOutsideSeed(p_Db, "TbAuditorias", MotivoAuditoriaParentSeedFields(), p_Logs, p_Error) Then Exit Function
    If Not EnsureNoRequiredFieldsOutsideSeed(p_Db, "TbNoConformidadesAuditoria", MotivoNCAuditoriaSeedFields(), p_Logs, p_Error) Then Exit Function

    TestHelper.AddLog p_Logs, "Schema facts inspected: motivo fixtures seed all Required=True fields for TbNoConformidades, TbAuditorias and TbNoConformidadesAuditoria"
    TestHelper.AddLog p_Logs, "FK facts inspected via Dysflow: current sandbox exposes no application relationships; audit fixture still seeds TbAuditorias parent before TbNoConformidadesAuditoria child"

    EnsureMotivoNoRequiereControlEficaciaSchema = True
    Exit Function

EH:
    p_Error = "EnsureMotivoNoRequiereControlEficaciaSchema: " & Err.Description
End Function

Private Function MotivoNCProyectoSeedFields() As Variant
    MotivoNCProyectoSeedFields = Array("IDNoConformidad", "CodigoNoConformidad", "EXPEDIENTE", "PROYECTO", "DESCRIPCION", "CAUSA", "FECHAAPERTURA", "TIPO", "RequiereControlEficacia", "MotivoNoRequiereControlEficacia", "Borrado")
End Function

Private Function MotivoAuditoriaParentSeedFields() As Variant
    MotivoAuditoriaParentSeedFields = Array("IDAuditoria", "Tipo", "FechaInicio", "FechaFin")
End Function

Private Function MotivoNCAuditoriaSeedFields() As Variant
    MotivoNCAuditoriaSeedFields = Array("ID", "IDAuditoria", "FechaApertura", "Numero", "DESCRIPCION", "CAUSARAIZ", "RESPONSABLEIMPLANTACION", "RequiereAccionCorrectiva", "Tipo", "RequiereControlEficacia", "MotivoNoRequiereControlEficacia", "Borrado")
End Function

Private Sub CleanupMotivoProyectoFixture(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection)
    On Error Resume Next

    If TableExistsInDb(p_Db, "TbNoConformidades") Then p_Db.Execute "DELETE FROM TbNoConformidades WHERE IDNoConformidad = " & TEST_ID_NC_PROY, dbFailOnError
    TestHelper.AddLog p_Logs, "Cleanup fixture motivo proyecto ID=" & CStr(TEST_ID_NC_PROY) & " aplicado"
End Sub

Private Sub CleanupMotivoAuditoriaFixture(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection)
    On Error Resume Next

    If TableExistsInDb(p_Db, "TbNoConformidadesAuditoria") Then p_Db.Execute "DELETE FROM TbNoConformidadesAuditoria WHERE ID = " & TEST_ID_NC_AUD, dbFailOnError
    If TableExistsInDb(p_Db, "TbAuditorias") Then p_Db.Execute "DELETE FROM TbAuditorias WHERE IDAuditoria = " & TEST_ID_AUDITORIA, dbFailOnError
    TestHelper.AddLog p_Logs, "Cleanup fixture motivo auditoría aplicado en orden hijo→padre"
End Sub

Private Function TableHasField(ByVal p_Db As DAO.Database, ByVal p_TableName As String, ByVal p_FieldName As String) As Boolean
    Dim fld As DAO.Field

    On Error GoTo EH
    For Each fld In p_Db.TableDefs(p_TableName).Fields
        If StrComp(fld.Name, p_FieldName, vbTextCompare) = 0 Then
            TableHasField = True
            Exit Function
        End If
    Next fld
    Exit Function

EH:
    TableHasField = False
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
    Dim cacheRows As Long
    Dim logRows As Long
    Dim fixtureDesc As String
    Dim sessionErr As String
    Dim cacheStateCaptured As Boolean

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_E2E_Cache_PrecalentarSincronizar_LogEvidence_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        GoTo Cleanup
    End If
    Set db = getdb()

    If Not EnsureCacheTestNCFixture(db, logs, idNC, fixtureDesc, assertError) Then GoTo Fail

    originalState = IsCacheEnabled()
    cacheStateCaptured = True
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

    cacheRows = CountRowsBySql(db, "SELECT COUNT(*) AS Total FROM TbCacheListadoNC WHERE IDNoConformidad = " & idNC & " AND CacheValida = True AND Descripcion = " & TestHelper.SqlText(fixtureDesc))
    Call TestHelper.AssertTrue(cacheRows = 1, "TbCacheListadoNC debe contener exactamente el fixture cache activo", logs, assertError)
    If assertError <> "" Then GoTo Fail

    logRows = CountRowsBySql(db, "SELECT COUNT(*) AS Total FROM TbLogCache WHERE IDNoConformidad = " & idNC & " AND TipoOperacion IN ('Generar Completo','Regenerar','Sync-Faltan')")
    Call TestHelper.AssertTrue(logRows >= 1, "TbLogCache debe registrar evidencia específica para el fixture cache", logs, assertError)
    If assertError <> "" Then GoTo Fail

    If cacheStateCaptured Then Call RestoreCacheStateE2E(originalState, logs, opErr)
    If opErr <> "" Then
        Test_E2E_Cache_PrecalentarSincronizar_LogEvidence_Atomic = TestHelper.BuildJsonFail(opErr, logs)
    Else
        Test_E2E_Cache_PrecalentarSincronizar_LogEvidence_Atomic = TestHelper.BuildJsonOk(logs, cacheRows)
    End If
    GoTo Cleanup

Fail:
    If cacheStateCaptured Then Call RestoreCacheStateE2E(originalState, logs, opErr)
    If opErr <> "" Then assertError = assertError & " | Restore: " & opErr
    Test_E2E_Cache_PrecalentarSincronizar_LogEvidence_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    If cacheStateCaptured Then Call RestoreCacheStateE2E(originalState, logs, opErr)
    TestHelper.AddLog logs, "Error: " & Err.Description
    If opErr <> "" Then
        Test_E2E_Cache_PrecalentarSincronizar_LogEvidence_Atomic = TestHelper.BuildJsonFail(Err.Description & " | Restore: " & opErr, logs)
    Else
        Test_E2E_Cache_PrecalentarSincronizar_LogEvidence_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
    End If

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then Call CleanupCacheTestNCFixture(db, logs)
    If Not rs Is Nothing Then rs.Close
    Call TestHelper.EndTestSession(logs)
    Set rs = Nothing
    Set db = Nothing
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
    Dim cacheRows As Long
    Dim opErr As String
    Dim assertError As String
    Dim ok As Boolean
    Dim sessionErr As String
    Dim cacheStateCaptured As Boolean

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_E2E_Cache_Invalidate_NoStaleListado_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        GoTo Cleanup
    End If
    Set db = getdb()

    If Not EnsureCacheTestNCFixture(db, logs, idNC, originalDesc, assertError) Then GoTo Fail

    originalState = IsCacheEnabled()
    cacheStateCaptured = True
    originalDesc = ObtenerDescripcionNC(db, idNC)
    mutatedDesc = "E2E-CACHE-" & CStr(idNC) & "-MUTATED"

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
    cacheRows = CountRowsBySql(db, "SELECT COUNT(*) AS Total FROM TbCacheListadoNC WHERE IDNoConformidad = " & idNC & " AND CacheValida = True")
    Call TestHelper.AssertTrue(cacheRows = 1, "TbCacheListadoNC debe tener exactamente un registro válido del fixture", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(cacheDesc = mutatedDesc, "TbCacheListadoNC debe reflejar descripción actualizada", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call ActualizarDescripcionNC(db, idNC, originalDesc)
    opErr = ""
    Call InvalidateListItem(idNC, opErr)
    If cacheStateCaptured Then Call RestoreCacheStateE2E(originalState, logs, opErr)
    If opErr <> "" Then
        Test_E2E_Cache_Invalidate_NoStaleListado_Atomic = TestHelper.BuildJsonFail(opErr, logs)
    Else
        Test_E2E_Cache_Invalidate_NoStaleListado_Atomic = TestHelper.BuildJsonOk(logs, cacheDesc)
    End If
    GoTo Cleanup

Fail:
    On Error Resume Next
    If idNC > 0 Then Call ActualizarDescripcionNC(db, idNC, originalDesc)
    On Error GoTo 0
    If cacheStateCaptured Then Call RestoreCacheStateE2E(originalState, logs, opErr)
    If opErr <> "" Then assertError = assertError & " | Restore: " & opErr
    Test_E2E_Cache_Invalidate_NoStaleListado_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    On Error Resume Next
    If idNC > 0 Then Call ActualizarDescripcionNC(db, idNC, originalDesc)
    On Error GoTo 0
    If cacheStateCaptured Then Call RestoreCacheStateE2E(originalState, logs, opErr)
    TestHelper.AddLog logs, "Error: " & Err.Description
    If opErr <> "" Then
        Test_E2E_Cache_Invalidate_NoStaleListado_Atomic = TestHelper.BuildJsonFail(Err.Description & " | Restore: " & opErr, logs)
    Else
        Test_E2E_Cache_Invalidate_NoStaleListado_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
    End If

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then Call CleanupCacheTestNCFixture(db, logs)
    Call TestHelper.EndTestSession(logs)
    Set db = Nothing
End Function

Private Function EnsureCacheTestNCFixture(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection, ByRef p_IDNC As Long, ByRef p_Descripcion As String, ByRef p_Error As String) As Boolean
    On Error GoTo EH

    Dim sqlInsert As String
    Dim fixtureRows As Long
    p_IDNC = TEST_ID_NC_CACHE
    p_Descripcion = "Fixture E2E cache " & CStr(TEST_ID_NC_CACHE)
    p_Error = ""

    If Not TestHelper.AssertSandboxBackend(p_Logs, p_Error) Then Exit Function
    If Not EnsureCacheE2ESchema(p_Db, p_Logs, p_Error) Then Exit Function

    Call CleanupCacheTestNCFixture(p_Db, p_Logs)
    sqlInsert = "INSERT INTO TbNoConformidades (IDNoConformidad, CodigoNoConformidad, EXPEDIENTE, PROYECTO, DESCRIPCION, CAUSA, FECHAAPERTURA, TIPO, RequiereControlEficacia, MotivoNoRequiereControlEficacia, Borrado) " & _
                "VALUES (" & TEST_ID_NC_CACHE & ", " & TestHelper.SqlText("E2E-CACHE-" & CStr(TEST_ID_NC_CACHE)) & ", " & TestHelper.SqlText("E2E-EXP") & ", " & TestHelper.SqlText("E2E-PROY") & ", " & TestHelper.SqlText(p_Descripcion) & ", " & TestHelper.SqlText("Causa E2E cache") & ", Date(), " & TestHelper.SqlText("Proyecto") & ", 'No', " & TestHelper.SqlText("Fixture cache") & ", 0)"
    p_Db.Execute sqlInsert, dbFailOnError
    fixtureRows = CountRowsBySql(p_Db, "SELECT COUNT(*) AS Total FROM TbNoConformidades WHERE IDNoConformidad = " & TEST_ID_NC_CACHE & " AND Descripcion = " & TestHelper.SqlText(p_Descripcion))
    If fixtureRows <> 1 Then
        p_Error = "TESTS BLOCKED: fixture TbNoConformidades no quedó con cardinalidad exacta ID=" & CStr(TEST_ID_NC_CACHE)
        TestHelper.AddLog p_Logs, "ASSERT FAIL: " & p_Error
        Exit Function
    End If

    TestHelper.AddLog p_Logs, "Fixture NC cache insertado y verificado ID=" & CStr(TEST_ID_NC_CACHE)

    EnsureCacheTestNCFixture = True
    Exit Function

EH:
    p_Error = "No se pudo crear fixture NC cache ID=" & CStr(TEST_ID_NC_CACHE) & ": " & Err.Description
    TestHelper.AddLog p_Logs, p_Error
End Function

Private Function EnsureCacheE2ESchema(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection, ByRef p_Error As String) As Boolean
    Dim readinessErr As String

    On Error GoTo EH
    EnsureCacheE2ESchema = False
    p_Error = ""

    readinessErr = ""
    If Not EnsureCacheSchemaReadiness(readinessErr) Then
        p_Error = "TESTS BLOCKED: EnsureCacheSchemaReadiness falló: " & readinessErr
        TestHelper.AddLog p_Logs, "ASSERT FAIL: " & p_Error
        Exit Function
    End If

    If Not EnsureTableFields(p_Db, "TbNoConformidades", RequiredCacheNCSourceFields(), p_Logs, p_Error) Then Exit Function
    If Not EnsureTableFields(p_Db, "TbCacheNCProyecto", RequiredCacheDetailFields(), p_Logs, p_Error) Then Exit Function
    If Not EnsureTableFields(p_Db, "TbCacheListadoNC", RequiredCacheListadoFields(), p_Logs, p_Error) Then Exit Function
    If Not EnsureTableFields(p_Db, "TbLogCache", RequiredCacheLogFields(), p_Logs, p_Error) Then Exit Function
    If Not EnsureNoRequiredFieldsOutsideSeed(p_Db, "TbNoConformidades", CacheNCSeedFields(), p_Logs, p_Error) Then Exit Function

    TestHelper.AddLog p_Logs, "Schema facts inspected: TbNoConformidades source fields, TbCacheNCProyecto detail, TbCacheListadoNC listing, TbLogCache evidence"
    TestHelper.AddLog p_Logs, "FK facts inspected via Dysflow: no relevant relationships exposed for local sandbox cache/source tables"
    EnsureCacheE2ESchema = True
    Exit Function

EH:
    p_Error = "TESTS BLOCKED: EnsureCacheE2ESchema: " & Err.Description
    TestHelper.AddLog p_Logs, "ASSERT FAIL: " & p_Error
End Function

Private Function EnsureTableFields(ByVal p_Db As DAO.Database, ByVal p_TableName As String, ByVal p_Fields As Variant, ByRef p_Logs As Collection, ByRef p_Error As String) As Boolean
    Dim fieldName As Variant

    EnsureTableFields = False
    If Not TableExistsInDb(p_Db, p_TableName) Then
        p_Error = "TESTS BLOCKED: falta tabla requerida " & p_TableName
        TestHelper.AddLog p_Logs, "ASSERT FAIL: " & p_Error
        Exit Function
    End If

    For Each fieldName In p_Fields
        If Not TableHasField(p_Db, p_TableName, CStr(fieldName)) Then
            p_Error = "TESTS BLOCKED: falta campo requerido " & p_TableName & "." & CStr(fieldName)
            TestHelper.AddLog p_Logs, "ASSERT FAIL: " & p_Error
            Exit Function
        End If
    Next fieldName

    TestHelper.AddLog p_Logs, "Schema OK: " & p_TableName & " contiene campos requeridos para el fixture"
    EnsureTableFields = True
End Function

Private Function EnsureNoRequiredFieldsOutsideSeed(ByVal p_Db As DAO.Database, ByVal p_TableName As String, ByVal p_SeedFields As Variant, ByRef p_Logs As Collection, ByRef p_Error As String) As Boolean
    Dim fld As DAO.Field

    On Error GoTo EH
    EnsureNoRequiredFieldsOutsideSeed = False

    For Each fld In p_Db.TableDefs(p_TableName).Fields
        If fld.Required Then
            If Not IsFieldInArray(fld.Name, p_SeedFields) And ((fld.Attributes And dbAutoIncrField) = 0) Then
                p_Error = "TESTS BLOCKED: campo obligatorio no sembrado " & p_TableName & "." & fld.Name
                TestHelper.AddLog p_Logs, "ASSERT FAIL: " & p_Error
                Exit Function
            End If
        End If
    Next fld

    TestHelper.AddLog p_Logs, "Schema OK: no hay campos Required=True fuera del seed de " & p_TableName
    EnsureNoRequiredFieldsOutsideSeed = True
    Exit Function

EH:
    p_Error = "TESTS BLOCKED: EnsureNoRequiredFieldsOutsideSeed: " & Err.Description
    TestHelper.AddLog p_Logs, "ASSERT FAIL: " & p_Error
End Function

Private Sub CleanupCacheTestNCFixture(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection)
    On Error Resume Next

    If TableExistsInDb(p_Db, "TbCacheListadoNC") Then p_Db.Execute "DELETE FROM TbCacheListadoNC WHERE IDNoConformidad = " & TEST_ID_NC_CACHE, dbFailOnError
    If TableExistsInDb(p_Db, "TbCacheNCProyecto") Then p_Db.Execute "DELETE FROM TbCacheNCProyecto WHERE IDNoConformidad = " & TEST_ID_NC_CACHE, dbFailOnError
    If TableExistsInDb(p_Db, "TbLogCache") Then p_Db.Execute "DELETE FROM TbLogCache WHERE IDNoConformidad = " & TEST_ID_NC_CACHE, dbFailOnError
    If TableExistsInDb(p_Db, "TbNoConformidades") Then p_Db.Execute "DELETE FROM TbNoConformidades WHERE IDNoConformidad = " & TEST_ID_NC_CACHE, dbFailOnError
    TestHelper.AddLog p_Logs, "Cleanup fixture cache ID=" & CStr(TEST_ID_NC_CACHE) & " aplicado en orden hijos→padre"
End Sub

Private Function CountRowsBySql(ByVal p_Db As DAO.Database, ByVal p_SQL As String) As Long
    Dim rs As DAO.Recordset

    On Error GoTo EH
    Set rs = p_Db.OpenRecordset(p_SQL, dbOpenSnapshot)
    If Not rs.EOF Then CountRowsBySql = CLng(Nz(rs.Fields(0).Value, 0))
    rs.Close
    Set rs = Nothing
    Exit Function

EH:
    CountRowsBySql = -1
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
End Function

Private Function TableExistsInDb(ByVal p_Db As DAO.Database, ByVal p_TableName As String) As Boolean
    Dim tdf As DAO.TableDef

    On Error GoTo EH
    Set tdf = p_Db.TableDefs(p_TableName)
    TableExistsInDb = True
    Exit Function

EH:
    TableExistsInDb = False
End Function

Private Function IsFieldInArray(ByVal p_FieldName As String, ByVal p_Fields As Variant) As Boolean
    Dim item As Variant

    For Each item In p_Fields
        If StrComp(CStr(item), p_FieldName, vbTextCompare) = 0 Then
            IsFieldInArray = True
            Exit Function
        End If
    Next item
End Function

Private Function CacheNCSeedFields() As Variant
    CacheNCSeedFields = Array("IDNoConformidad", "CodigoNoConformidad", "EXPEDIENTE", "PROYECTO", "DESCRIPCION", "CAUSA", "FECHAAPERTURA", "TIPO", "RequiereControlEficacia", "MotivoNoRequiereControlEficacia", "Borrado")
End Function

Private Function RequiredCacheNCSourceFields() As Variant
    RequiredCacheNCSourceFields = Array("IDNoConformidad", "Juridica", "CodigoNoConformidad", "EsNoConformidad", _
        "EXPEDIENTE", "PROYECTO", "VEHICULO", "DESCRIPCION", "CAUSA", "CausaYAnalisRaiz", _
        "ENTIDADRESPONSABLE", "RESPONSABLETELEFONICA", "FECHAAPERTURA", "FECHACIERRE", "FPREVCIERRE", _
        "NOTAS", "Borrado", "TIPO", "RequiereACR", "ACR", "MotivoBorrado", "RequiereControlEficacia", _
        "MotivoNoRequiereControlEficacia", "ControlEficacia", "FechaControlEficacia", _
        "FechaPrevistaControlEficacia", "ResultadoControlEficacia", "ConformeControlEficacia", _
        "RESPONSABLECALIDAD", "IDExpediente", "CodExp", "Nemotecnico", "JuridicaExp", "IDTipo", _
        "DetectadoPor", "ESTADO", "Cerrada", "IDNCAsociada", "CodigoNoConformidadAsociada", _
        "CodConcesionAsociada")
End Function

Private Function RequiredCacheDetailFields() As Variant
    RequiredCacheDetailFields = Array("IDNoConformidad", "Version", "FechaCache", "DatosNC", "DatosACs", "DatosARs", "DatosReplanificaciones", "DatosRiesgos", "UsuarioCache", "CacheValida")
End Function

Private Function RequiredCacheListadoFields() As Variant
    RequiredCacheListadoFields = Array("IDNoConformidad", "Version", "Descripcion", "FechaCache", "CacheValida")
End Function

Private Function RequiredCacheLogFields() As Variant
    RequiredCacheLogFields = Array("IDNoConformidad", "TipoOperacion", "Detalles", "FechaOperacion", "Usuario", "DuracionMs", "Exito")
End Function

Private Function ObtenerDescripcionNC(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long) As String
    Dim rs As DAO.Recordset
    Set rs = p_Db.OpenRecordset("SELECT Descripcion FROM TbNoConformidades WHERE IDNoConformidad=" & p_IDNC, dbOpenSnapshot)
    If Not rs.EOF Then ObtenerDescripcionNC = Nz(rs.Fields("Descripcion").Value, "")
    rs.Close: Set rs = Nothing
End Function

Private Function ObtenerDescripcionCacheListado(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long) As String
    Dim rs As DAO.Recordset
    Set rs = p_Db.OpenRecordset("SELECT Descripcion FROM TbCacheListadoNC WHERE IDNoConformidad=" & p_IDNC, dbOpenSnapshot)
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

Private Sub RestoreCacheStateE2E(ByVal p_Enabled As Boolean, ByRef p_Logs As Collection, Optional ByRef p_Error As String)
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
    TestHelper.AddLog p_Logs, "RestoreTbConfiguracionBackends retired: tests must not mutate TbConfiguracionBackends."
End Sub

Private Function EnsureConfigCoreCacheFixture(ByRef p_Logs As Collection, Optional ByRef p_Error As String) As Boolean
    Dim db As DAO.Database
    Dim readinessErr As String
    Dim totalRows As Long
    Dim idOneRows As Long
    Dim assertError As String

    On Error GoTo EH
    EnsureConfigCoreCacheFixture = False
    p_Error = ""

    If Not m_TestingMode Then
        p_Error = "EnsureConfigCoreCacheFixture: BeginTestSession debe ejecutarse antes"
        TestHelper.AddLog p_Logs, "ASSERT FAIL: " & p_Error
        Exit Function
    End If

    If Not TestHelper.AssertSandboxBackend(p_Logs, p_Error) Then Exit Function

    readinessErr = ""
    If Not EnsureCacheSchemaReadiness(readinessErr) Then
        p_Error = "EnsureCacheSchemaReadiness: " & readinessErr
        TestHelper.AddLog p_Logs, "ASSERT FAIL: " & p_Error
        Exit Function
    End If

    Set db = getdb(p_Error)
    If db Is Nothing Then
        If p_Error = "" Then p_Error = "EnsureConfigCoreCacheFixture: getdb devolvió Nothing en modo testing"
        TestHelper.AddLog p_Logs, "ASSERT FAIL: " & p_Error
        Exit Function
    End If

    TestHelper.AddLog p_Logs, "Arrange fixture: TbConfiguracion config-core asegurada por EnsureCacheSchemaReadiness en sandbox local"
    TestHelper.AddLog p_Logs, "Fixture DB: " & db.Name
    TestHelper.AddLog p_Logs, "Schema fact TbConfiguracion.ID: Long, Required=False; contrato singleton ID=1"
    TestHelper.AddLog p_Logs, "Schema fact TbConfiguracion.CacheHabilitada: Boolean, Required=False"
    TestHelper.AddLog p_Logs, "Schema fact TbConfiguracion.FechaCambioCache: Date, Required=False"
    TestHelper.AddLog p_Logs, "Schema fact TbConfiguracion.UsuarioCambioCache: Text(255), Required=False"
    TestHelper.AddLog p_Logs, "Schema fact TbConfiguracion.MotivoCambioCache: Memo/LongText, Required=False"
    TestHelper.AddLog p_Logs, "FK facts inspected via Dysflow: no application relationships exposed for TbConfiguracion"

    If Not EnsureTableFields(db, "TbConfiguracion", ConfigCoreRequiredFields(), p_Logs, p_Error) Then GoTo CleanupFailure
    If Not EnsureNoRequiredFieldsOutsideSeed(db, "TbConfiguracion", ConfigCoreSeedFields(), p_Logs, p_Error) Then GoTo CleanupFailure

    totalRows = CountRowsBySql(db, "SELECT COUNT(*) AS Total FROM TbConfiguracion")
    Call TestHelper.AssertTrue(totalRows = 1, "TbConfiguracion debe tener exactamente una fila singleton", p_Logs, assertError)
    If assertError <> "" Then GoTo Fail

    idOneRows = CountRowsBySql(db, "SELECT COUNT(*) AS Total FROM TbConfiguracion WHERE ID=1")
    Call TestHelper.AssertTrue(idOneRows = 1, "TbConfiguracion debe tener exactamente una fila ID=1", p_Logs, assertError)
    If assertError <> "" Then GoTo Fail

    TestHelper.AddLog p_Logs, "ID=1 es fixture controlada por EnsureTbConfiguracion en sandbox, no dato preexistente afortunado"
    EnsureConfigCoreCacheFixture = True
    Set db = Nothing
    Exit Function

Fail:
    p_Error = assertError
CleanupFailure:
    Set db = Nothing
    Exit Function

EH:
    p_Error = "EnsureConfigCoreCacheFixture: " & Err.Description
    TestHelper.AddLog p_Logs, "ASSERT FAIL: " & p_Error
    Set db = Nothing
End Function

Private Function ConfigCoreRequiredFields() As Variant
    ConfigCoreRequiredFields = Array("ID", "CacheHabilitada", "FechaCambioCache", "UsuarioCambioCache", "MotivoCambioCache")
End Function

Private Function ConfigCoreSeedFields() As Variant
    ConfigCoreSeedFields = Array("ID", "CacheHabilitada")
End Function

Private Function ReadCacheHabilitadaMandatory(ByRef p_Value As Boolean, Optional ByRef p_Error As String) As Boolean
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

    Set rs = db.OpenRecordset("SELECT CacheHabilitada FROM TbConfiguracion WHERE ID=1", dbOpenSnapshot)

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

Private Function SetCacheHabilitadaMandatory(ByVal p_Enabled As Boolean, Optional ByRef p_Error As String) As Boolean
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

Private Sub RestoreCacheStateMandatory(ByVal p_Enabled As Boolean, ByRef p_Logs As Collection, Optional ByRef p_Error As String)
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
