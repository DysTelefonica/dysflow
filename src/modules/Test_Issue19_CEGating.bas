Attribute VB_Name = "Test_Issue19_CEGating"
Option Compare Database
Option Explicit

Public Function Test_Issue19_CE_Alta_Si_SinDetalle_NoBloquea() As String
    Dim logs As Collection
    Dim assertError As String
    Dim nc As NCProyecto

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs) Then
        Test_Issue19_CE_Alta_Si_SinDetalle_NoBloquea = TestHelper.BuildJsonFail("Session", logs)
        Exit Function
    End If
    Set nc = Issue19_NewNCBase()
    Set nc.ExpedienteObj = TestHelper.CreateExpedienteFake("900001")
    nc.RequiereControlEficacia = "Sí"
    nc.ControlEficacia = ""
    nc.FechaPrevistaControlEficacia = ""

    TestHelper.AddLog logs, "Arrange: NC requiere CE sin detalle"
    Call TestHelper.AssertTrue(nc.DatosGeneralesOK() = EnumSino.No, "Requiere CE sin detalle no cumple datos generales", logs, assertError)
    Call TestHelper.EndTestSession(logs)
    Test_Issue19_CE_Alta_Si_SinDetalle_NoBloquea = Issue19_Result(assertError, logs, "alta_si_sin_detalle_bloquea")
End Function

Public Function Test_Issue19_CE_Alta_Si_ConDetalle_Pasa() As String
    Dim logs As Collection
    Dim assertError As String
    Dim nc As NCProyecto

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs) Then
        Test_Issue19_CE_Alta_Si_ConDetalle_Pasa = TestHelper.BuildJsonFail("Session", logs)
        Exit Function
    End If
    Set nc = TestIssue19_NCConCECompleta()
    Set nc.ExpedienteObj = TestHelper.CreateExpedienteFake("900001")

    TestHelper.AddLog logs, "Arrange: NC requiere CE con control y fecha prevista"
    Call TestHelper.AssertTrue(nc.DatosGeneralesOK() = EnumSino.Sí, "Requiere CE con detalle cumple datos generales", logs, assertError)
    Call TestHelper.EndTestSession(logs)
    Test_Issue19_CE_Alta_Si_ConDetalle_Pasa = Issue19_Result(assertError, logs, "alta_si_con_detalle")
End Function

Public Function Test_Issue19_CE_Alta_No_IgnoraDetalle() As String
    Dim logs As Collection
    Dim assertError As String
    Dim nc As NCProyecto

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs) Then
        Test_Issue19_CE_Alta_No_IgnoraDetalle = TestHelper.BuildJsonFail("Session", logs)
        Exit Function
    End If
    Set nc = Issue19_NewNCBase()
    Set nc.ExpedienteObj = TestHelper.CreateExpedienteFake("900001")
    nc.RequiereControlEficacia = "No"
    nc.ControlEficacia = ""
    nc.FechaPrevistaControlEficacia = ""
    nc.MotivoNoRequiereControlEficacia = "No aplica por criterio de prueba"

    TestHelper.AddLog logs, "Arrange: NC no requiere CE"
    Call TestHelper.AssertTrue(nc.RequiereControlEficaciaCalculado = EnumSino.No, "RequiereControlEficacia='No' se calcula como No", logs, assertError)
    If assertError = "" Then Call TestHelper.AssertTrue(nc.DatosGeneralesOK() = EnumSino.Sí, "No requiere CE no exige control/fecha prevista", logs, assertError)
    Call TestHelper.EndTestSession(logs)
    Test_Issue19_CE_Alta_No_IgnoraDetalle = Issue19_Result(assertError, logs, "alta_no_ignora_detalle")
End Function

Public Function Test_Issue19_CE_Cierre_SinDetalle_Bloquea() As String
    Dim logs As Collection
    Dim assertError As String
    Dim nc As NCProyecto

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs) Then
        Test_Issue19_CE_Cierre_SinDetalle_Bloquea = TestHelper.BuildJsonFail("Session", logs)
        Exit Function
    End If
    Set nc = TestIssue19_NCConCECompleta()
    Set nc.ExpedienteObj = TestHelper.CreateExpedienteFake("900001")
    nc.FechaControlEficacia = Date
    nc.ResultadoControlEficacia = ""
    nc.ConformeControlEficacia = ""

    TestHelper.AddLog logs, "Arrange: cierre CE con fecha real pero sin resultado/conformidad"
    Call TestHelper.AssertTrue(nc.EficaciaOK = EnumSino.No, "Cierre CE sin resultado/conformidad debe bloquear", logs, assertError)
    Call TestHelper.EndTestSession(logs)
    Test_Issue19_CE_Cierre_SinDetalle_Bloquea = Issue19_Result(assertError, logs, "cierre_sin_detalle_bloquea")
End Function

Public Function Test_Issue19_CE_Cierre_ConDetalle_PermiteCierre() As String
    Dim logs As Collection
    Dim assertError As String
    Dim nc As NCProyecto

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs) Then
        Test_Issue19_CE_Cierre_ConDetalle_PermiteCierre = TestHelper.BuildJsonFail("Session", logs)
        Exit Function
    End If
    Set nc = TestIssue19_NCConCECompleta()
    Set nc.ExpedienteObj = TestHelper.CreateExpedienteFake("900001")
    nc.FechaControlEficacia = Date
    nc.ResultadoControlEficacia = "Resultado verificado"
    nc.ConformeControlEficacia = "Sí"

    TestHelper.AddLog logs, "Arrange: cierre CE completo"
    Call TestHelper.AssertTrue(nc.EficaciaOK = EnumSino.Sí, "Cierre CE con resultado y conformidad debe permitir", logs, assertError)
    Call TestHelper.EndTestSession(logs)
    Test_Issue19_CE_Cierre_ConDetalle_PermiteCierre = Issue19_Result(assertError, logs, "cierre_con_detalle_ok")
End Function

Public Function Test_Issue19_CE_EstadoCalculado_Pendiente() As String
    Dim logs As Collection
    Dim assertError As String
    Dim nc As NCProyecto

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs) Then
        Test_Issue19_CE_EstadoCalculado_Pendiente = TestHelper.BuildJsonFail("Session", logs)
        Exit Function
    End If
    Set nc = TestIssue19_NCConCECompleta()
    Set nc.ExpedienteObj = TestHelper.CreateExpedienteFake("900001")
    nc.FechaControlEficacia = ""
    nc.ResultadoControlEficacia = ""
    nc.ConformeControlEficacia = ""

    TestHelper.AddLog logs, "Arrange: CE prevista pero no ejecutada"
    Call TestHelper.AssertTrue(nc.EficaciaOK = EnumSino.Sí, "CE prevista sin resultado aún es un estado intermedio válido", logs, assertError)
    Call TestHelper.EndTestSession(logs)
    Test_Issue19_CE_EstadoCalculado_Pendiente = Issue19_Result(assertError, logs, "estado_pendiente_ce")
End Function

Public Function Test_Issue19_CE_EstadoCalculado_SinPendiente() As String
    Dim logs As Collection
    Dim assertError As String
    Dim nc As NCProyecto

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs) Then
        Test_Issue19_CE_EstadoCalculado_SinPendiente = TestHelper.BuildJsonFail("Session", logs)
        Exit Function
    End If
    Set nc = Issue19_NewNCBase()
    Set nc.ExpedienteObj = TestHelper.CreateExpedienteFake("900001")
    nc.RequiereControlEficacia = "No"

    TestHelper.AddLog logs, "Arrange: NC sin CE pendiente"
    Call TestHelper.AssertTrue(nc.RequiereControlEficaciaCalculado = EnumSino.No, "No requiere CE no queda pendiente de CE", logs, assertError)
    Call TestHelper.EndTestSession(logs)
    Test_Issue19_CE_EstadoCalculado_SinPendiente = Issue19_Result(assertError, logs, "estado_sin_pendiente_ce")
End Function

Public Function Test_Issue19_Paridad_UI_Dominio() As String
    Dim logs As Collection
    Dim assertError As String
    Dim nc As NCProyecto

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs) Then
        Test_Issue19_Paridad_UI_Dominio = TestHelper.BuildJsonFail("Session", logs)
        Exit Function
    End If
    Set nc = TestIssue19_NCConCECompleta()
    Set nc.ExpedienteObj = TestHelper.CreateExpedienteFake("900001")

    TestHelper.AddLog logs, "Arrange: dominio CE con los mismos campos que expone UI"
    Call TestHelper.AssertTrue(nc.DatosGeneralesOK() = EnumSino.Sí, "Dominio acepta Requiere/Control/FechaPrevista coherentes con UI", logs, assertError)
    If assertError = "" Then Call TestHelper.AssertTrue(nc.EficaciaOK = EnumSino.Sí, "Dominio acepta estado CE pendiente sin resultado hasta ejecutar control", logs, assertError)
    Call TestHelper.EndTestSession(logs)
    Test_Issue19_Paridad_UI_Dominio = Issue19_Result(assertError, logs, "paridad_ui_dominio")
End Function

Public Function Test_Issue19_CE_Alta_MotivoAlta_Bypass_Si() As String
    Dim logs As Collection
    Dim assertError As String
    Dim nc As NCProyecto
    Dim ops As NCProyectoOperaciones
    Dim motivo As String

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs) Then
        Test_Issue19_CE_Alta_MotivoAlta_Bypass_Si = TestHelper.BuildJsonFail("Session", logs)
        Exit Function
    End If
    Set nc = Issue19_NewNCBase()
    Set nc.ExpedienteObj = TestHelper.CreateExpedienteFake("900001")
    nc.RequiereControlEficacia = "Sí"
    nc.ControlEficacia = ""
    nc.FechaPrevistaControlEficacia = ""

    Set ops = New NCProyectoOperaciones
    Set ops.nc = nc
    motivo = ops.MotivoAltaDatosUnicosNoOK(p_MenosCef:=EnumSino.Sí)

    TestHelper.AddLog logs, "Arrange: NC requiere CE sin detalle + bypass p_MenosCef=Sí"
    Call TestHelper.AssertTrue(motivo = "", "Con bypass p_MenosCef=Sí y RequiereCE=Sí sin detalle debe retornar vacío", logs, assertError)
    Call TestHelper.EndTestSession(logs)
    Test_Issue19_CE_Alta_MotivoAlta_Bypass_Si = Issue19_Result(assertError, logs, "alta_motivo_bypass_si")
End Function

Public Function Test_Issue19_CE_Alta_MotivoAlta_Bypass_BlankRequereCE() As String
    Dim logs As Collection
    Dim assertError As String
    Dim nc As NCProyecto
    Dim ops As NCProyectoOperaciones
    Dim motivo As String

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs) Then
        Test_Issue19_CE_Alta_MotivoAlta_Bypass_BlankRequereCE = TestHelper.BuildJsonFail("Session", logs)
        Exit Function
    End If
    Set nc = Issue19_NewNCBase()
    Set nc.ExpedienteObj = TestHelper.CreateExpedienteFake("900001")
    nc.RequiereControlEficacia = ""
    nc.ControlEficacia = ""
    nc.FechaPrevistaControlEficacia = ""

    Set ops = New NCProyectoOperaciones
    Set ops.nc = nc
    motivo = ops.MotivoAltaDatosUnicosNoOK(, assertError, EnumSino.Sí)

    TestHelper.AddLog logs, "Arrange: NC sin RequereCE + bypass p_MenosCef=Sí"
    Call TestHelper.AssertTrue(motivo <> "", "Con RequiereCE en blanco el bypass no debe aplicar", logs, assertError)
    Call TestHelper.EndTestSession(logs)
    Test_Issue19_CE_Alta_MotivoAlta_Bypass_BlankRequereCE = Issue19_Result(assertError, logs, "alta_motivo_bypass_blank_requerece")
End Function

Public Function Test_Issue19_CE_Edicion_MotivoDatosUnicos_Bypass() As String
    Dim logs As Collection
    Dim assertError As String
    Dim nc As NCProyecto
    Dim ops As NCProyectoOperaciones
    Dim motivo As String

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs) Then
        Test_Issue19_CE_Edicion_MotivoDatosUnicos_Bypass = TestHelper.BuildJsonFail("Session", logs)
        Exit Function
    End If
    Set nc = Issue19_NewNCBase()
    Set nc.ExpedienteObj = TestHelper.CreateExpedienteFake("900001")
    nc.RequiereControlEficacia = "Sí"
    nc.ControlEficacia = ""
    nc.FechaPrevistaControlEficacia = ""

    Set ops = New NCProyectoOperaciones
    Set ops.nc = nc
    motivo = ops.MotivoDatosUnicosNoOK(p_MenosCef:=EnumSino.Sí)

    TestHelper.AddLog logs, "Arrange: NCProyecto RequiereCE=Sí sin detalle + bypass p_MenosCef=Sí"
    Call TestHelper.AssertTrue(motivo = "", "Con bypass p_MenosCef=Sí en edición NCProyecto debe retornar vacío", logs, assertError)
    Call TestHelper.EndTestSession(logs)
    Test_Issue19_CE_Edicion_MotivoDatosUnicos_Bypass = Issue19_Result(assertError, logs, "edicion_motivo_bypass_ncproyecto")
End Function

Public Function Test_Issue19_CE_Auditoria_MotivoDatosUnicos_Bypass() As String
    Dim logs As Collection
    Dim assertError As String
    Dim aud As NCAuditoria
    Dim ops As NCaUDITORIAOperaciones
    Dim motivo As String

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs) Then
        Test_Issue19_CE_Auditoria_MotivoDatosUnicos_Bypass = TestHelper.BuildJsonFail("Session", logs)
        Exit Function
    End If
    Set aud = Issue19_NewAuditoriaBase()
    Call Issue19_SeedAuditoria(logs)
    Set ops = New NCaUDITORIAOperaciones
    Set ops.nc = aud
    motivo = ops.MotivoDatosUnicosNoOK(p_MenosCef:=EnumSino.Sí)

    TestHelper.AddLog logs, "Arrange: NCAuditoria RequiereCE=Sí sin detalle + bypass p_MenosCef=Sí"
    Call TestHelper.AssertTrue(motivo = "", "Con bypass p_MenosCef=Sí en NCAuditoria debe retornar vacío", logs, assertError)
    Call TestHelper.EndTestSession(logs)
    Test_Issue19_CE_Auditoria_MotivoDatosUnicos_Bypass = Issue19_Result(assertError, logs, "auditoria_motivo_bypass")
End Function

Public Function Test_Issue19_CE_EficaciaOK_SinCambios() As String
    Dim logs As Collection
    Dim assertError As String
    Dim nc As NCProyecto

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs) Then
        Test_Issue19_CE_EficaciaOK_SinCambios = TestHelper.BuildJsonFail("Session", logs)
        Exit Function
    End If
    Set nc = TestIssue19_NCConCECompleta()
    Set nc.ExpedienteObj = TestHelper.CreateExpedienteFake("900001")
    nc.FechaControlEficacia = ""
    nc.ResultadoControlEficacia = ""
    nc.ConformeControlEficacia = ""

    TestHelper.AddLog logs, "Arrange: CE con fecha prevista pero sin ejecución"
    Call TestHelper.AssertTrue(nc.EficaciaOK = EnumSino.Sí, "EficaciaOK sin cambios tras modificación de Motivo* debe seguir funcionando", logs, assertError)
    Call TestHelper.EndTestSession(logs)
    Test_Issue19_CE_EficaciaOK_SinCambios = Issue19_Result(assertError, logs, "eficacia_ok_sin_cambios")
End Function

Private Sub Issue19_SeedAuditoria(ByRef logs As Collection)
    Dim db As DAO.Database
    Dim qdf As DAO.QueryDef
    Dim rs As DAO.Recordset
    Dim testID As Long

    testID = 999999
    Set db = getdb()
    On Error Resume Next
    Set qdf = db.CreateQueryDef("", "SELECT COUNT(*) FROM TbAuditorias WHERE IDAuditoria=[pID]")
    qdf.Parameters("pID").Value = testID
    Set rs = qdf.OpenRecordset()
    If rs.Fields(0).Value = 0 Then
        rs.Close
        Set rs = db.OpenRecordset("TbAuditorias", dbOpenDynaset)
        rs.AddNew
        rs!IDAuditoria = testID
        rs!Tipo = "Auditoría"
        rs.Update
    End If
    rs.Close
    qdf.Close
    Set rs = Nothing
    Set qdf = Nothing
    On Error GoTo 0
End Sub

Private Function Issue19_NewAuditoriaBase() As NCAuditoria
    Dim aud As NCAuditoria

    Set aud = New NCAuditoria
    aud.Tipo = "Auditoría"
    aud.Descripcion = "Fixture Issue19 Auditoria CE"
    aud.CAUSARAIZ = "Causa Issue19"
    aud.PuntoNorma = "ISO-9001"
    aud.RESPONSABLEIMPLANTACION = "Tester"
    aud.RequiereAccionCorrectiva = "Sí"
    aud.MotivoNoAccionCorrectiva = ""
    aud.RequiereControlEficacia = "Sí"
    aud.ControlEficacia = ""
    aud.FechaPrevistaControlEficacia = ""
    aud.FechaApertura = Date
    aud.IDAuditoria = CStr(999999)

    Set Issue19_NewAuditoriaBase = aud
End Function

Private Function Issue19_NewNCBase() As NCProyecto
    Dim nc As NCProyecto

    Set nc = New NCProyecto
    nc.IDExpediente = "900001"
    nc.Descripcion = "Fixture Issue19 CE"
    nc.CausaYAnalisRaiz = "Causa Issue19"
    nc.IDTipo = "1"
    nc.EntidadResponsable = "Entidad Test"
    nc.DetectadoPor = "Tester"
    nc.ResponsableTelefonica = "adm"
    nc.RESPONSABLECALIDAD = "Responsable Test"
    nc.FechaApertura = Date

    Set Issue19_NewNCBase = nc
End Function

Private Function TestIssue19_NCConCECompleta() As NCProyecto
    Dim nc As NCProyecto

    Set nc = Issue19_NewNCBase()
    nc.RequiereControlEficacia = "Sí"
    nc.ControlEficacia = "Control de eficacia previsto"
    nc.FechaPrevistaControlEficacia = Date + 7

    Set TestIssue19_NCConCECompleta = nc
End Function

Private Function Issue19_Result(ByVal assertError As String, ByRef logs As Collection, ByVal value As String) As String
    If assertError <> "" Then
        Issue19_Result = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Issue19_Result = TestHelper.BuildJsonOk(logs, value)
    End If
End Function