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
