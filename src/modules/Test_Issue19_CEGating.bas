Attribute VB_Name = "Test_Issue19_CEGating"
Option Compare Database
Option Explicit

Public Function Test_Issue19_CE_Alta_Si_SinDetalle_NoBloquea() As String
    Dim logs As Collection
    Dim assertError As String
    Dim nc As NCProyecto

    Set logs = TestHelper.NewLogs
    Set nc = Issue19_NewNCBase()
    nc.RequiereControlEficacia = "Sí"
    nc.ControlEficacia = ""
    nc.FechaPrevistaControlEficacia = ""

    TestHelper.AddLog logs, "Arrange: NC requiere CE sin detalle"
    Call TestHelper.AssertTrue(nc.DatosGeneralesOK() = EnumSino.No, "Requiere CE sin detalle no cumple datos generales", logs, assertError)
    Test_Issue19_CE_Alta_Si_SinDetalle_NoBloquea = Issue19_Result(assertError, logs, "alta_si_sin_detalle_bloquea")
End Function

Public Function Test_Issue19_CE_Alta_Si_ConDetalle_Pasa() As String
    Dim logs As Collection
    Dim assertError As String
    Dim nc As NCProyecto

    Set logs = TestHelper.NewLogs
    Set nc = TestIssue19_NCConCECompleta()

    TestHelper.AddLog logs, "Arrange: NC requiere CE con control y fecha prevista"
    Call TestHelper.AssertTrue(nc.DatosGeneralesOK() = EnumSino.Sí, "Requiere CE con detalle cumple datos generales", logs, assertError)
    Test_Issue19_CE_Alta_Si_ConDetalle_Pasa = Issue19_Result(assertError, logs, "alta_si_con_detalle")
End Function

Public Function Test_Issue19_CE_Alta_No_IgnoraDetalle() As String
    Dim logs As Collection
    Dim assertError As String
    Dim nc As NCProyecto

    Set logs = TestHelper.NewLogs
    Set nc = Issue19_NewNCBase()
    nc.RequiereControlEficacia = "No"
    nc.ControlEficacia = ""
    nc.FechaPrevistaControlEficacia = ""
    nc.MotivoNoRequiereControlEficacia = "No aplica por criterio de prueba"

    TestHelper.AddLog logs, "Arrange: NC no requiere CE"
    Call TestHelper.AssertTrue(nc.RequiereControlEficaciaCalculado = EnumSino.No, "RequiereControlEficacia='No' se calcula como No", logs, assertError)
    If assertError = "" Then Call TestHelper.AssertTrue(nc.DatosGeneralesOK() = EnumSino.Sí, "No requiere CE no exige control/fecha prevista", logs, assertError)
    Test_Issue19_CE_Alta_No_IgnoraDetalle = Issue19_Result(assertError, logs, "alta_no_ignora_detalle")
End Function

Public Function Test_Issue19_CE_Cierre_SinDetalle_Bloquea() As String
    Dim logs As Collection
    Dim assertError As String
    Dim nc As NCProyecto

    Set logs = TestHelper.NewLogs
    Set nc = TestIssue19_NCConCECompleta()
    nc.FechaControlEficacia = Date
    nc.ResultadoControlEficacia = ""
    nc.ConformeControlEficacia = ""

    TestHelper.AddLog logs, "Arrange: cierre CE con fecha real pero sin resultado/conformidad"
    Call TestHelper.AssertTrue(nc.EficaciaOK = EnumSino.No, "Cierre CE sin resultado/conformidad debe bloquear", logs, assertError)
    Test_Issue19_CE_Cierre_SinDetalle_Bloquea = Issue19_Result(assertError, logs, "cierre_sin_detalle_bloquea")
End Function

Public Function Test_Issue19_CE_Cierre_ConDetalle_PermiteCierre() As String
    Dim logs As Collection
    Dim assertError As String
    Dim nc As NCProyecto

    Set logs = TestHelper.NewLogs
    Set nc = TestIssue19_NCConCECompleta()
    nc.FechaControlEficacia = Date
    nc.ResultadoControlEficacia = "Resultado verificado"
    nc.ConformeControlEficacia = "Sí"

    TestHelper.AddLog logs, "Arrange: cierre CE completo"
    Call TestHelper.AssertTrue(nc.EficaciaOK = EnumSino.Sí, "Cierre CE con resultado y conformidad debe permitir", logs, assertError)
    Test_Issue19_CE_Cierre_ConDetalle_PermiteCierre = Issue19_Result(assertError, logs, "cierre_con_detalle_ok")
End Function

Public Function Test_Issue19_CE_EstadoCalculado_Pendiente() As String
    Dim logs As Collection
    Dim assertError As String
    Dim nc As NCProyecto

    Set logs = TestHelper.NewLogs
    Set nc = TestIssue19_NCConCECompleta()
    nc.FechaControlEficacia = ""
    nc.ResultadoControlEficacia = ""
    nc.ConformeControlEficacia = ""

    TestHelper.AddLog logs, "Arrange: CE prevista pero no ejecutada"
    Call TestHelper.AssertTrue(nc.EficaciaOK = EnumSino.Sí, "CE prevista sin resultado aún es un estado intermedio válido", logs, assertError)
    Test_Issue19_CE_EstadoCalculado_Pendiente = Issue19_Result(assertError, logs, "estado_pendiente_ce")
End Function

Public Function Test_Issue19_CE_EstadoCalculado_SinPendiente() As String
    Dim logs As Collection
    Dim assertError As String
    Dim nc As NCProyecto

    Set logs = TestHelper.NewLogs
    Set nc = Issue19_NewNCBase()
    nc.RequiereControlEficacia = "No"

    TestHelper.AddLog logs, "Arrange: NC sin CE pendiente"
    Call TestHelper.AssertTrue(nc.RequiereControlEficaciaCalculado = EnumSino.No, "No requiere CE no queda pendiente de CE", logs, assertError)
    Test_Issue19_CE_EstadoCalculado_SinPendiente = Issue19_Result(assertError, logs, "estado_sin_pendiente_ce")
End Function

Public Function Test_Issue19_Paridad_UI_Dominio() As String
    Dim logs As Collection
    Dim assertError As String
    Dim nc As NCProyecto

    Set logs = TestHelper.NewLogs
    Set nc = TestIssue19_NCConCECompleta()

    TestHelper.AddLog logs, "Arrange: dominio CE con los mismos campos que expone UI"
    Call TestHelper.AssertTrue(nc.DatosGeneralesOK() = EnumSino.Sí, "Dominio acepta Requiere/Control/FechaPrevista coherentes con UI", logs, assertError)
    If assertError = "" Then Call TestHelper.AssertTrue(nc.EficaciaOK = EnumSino.Sí, "Dominio acepta estado CE pendiente sin resultado hasta ejecutar control", logs, assertError)
    Test_Issue19_Paridad_UI_Dominio = Issue19_Result(assertError, logs, "paridad_ui_dominio")
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
