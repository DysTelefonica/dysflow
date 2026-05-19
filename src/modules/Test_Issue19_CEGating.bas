Attribute VB_Name = "Test_Issue19_CEGating"
Option Compare Database
Option Explicit

Public Function Test_Issue19_CE_Alta_Si_SinDetalle_NoBloquea() As String
    Dim logs As Collection
    Dim assertError As String
    Dim motivo As String
    Set logs = TestHelper.NewLogs

    motivo = Issue19_InvokeMotivoAlta("Sí", "", "")
    Call TestHelper.AssertTrue(motivo = "", "Alta con CE='Sí' y sin detalle NO debe bloquear", logs, assertError)

    Test_Issue19_CE_Alta_Si_SinDetalle_NoBloquea = Issue19_Result(assertError, logs, "alta_si_sin_detalle")
End Function

Public Function Test_Issue19_CE_Alta_Si_ConDetalle_Pasa() As String
    Dim logs As Collection
    Dim assertError As String
    Dim motivo As String
    Set logs = TestHelper.NewLogs

    motivo = Issue19_InvokeMotivoAlta("Sí", "Detalle CE completo", Date + 7)
    Call TestHelper.AssertTrue(motivo = "", "Alta con CE='Sí' y detalle completo debe pasar", logs, assertError)

    Test_Issue19_CE_Alta_Si_ConDetalle_Pasa = Issue19_Result(assertError, logs, "alta_si_con_detalle")
End Function

Public Function Test_Issue19_CE_Alta_No_IgnoraDetalle() As String
    Dim logs As Collection
    Dim assertError As String
    Dim motivo As String
    Set logs = TestHelper.NewLogs

    motivo = Issue19_InvokeMotivoAlta("No", "", "")
    Call TestHelper.AssertTrue(motivo = "", "Alta con CE='No' debe ignorar detalle CE", logs, assertError)

    Test_Issue19_CE_Alta_No_IgnoraDetalle = Issue19_Result(assertError, logs, "alta_no_ignora_detalle")
End Function

Public Function Test_Issue19_CE_Cierre_SinDetalle_Bloquea() As String
    Dim logs As Collection
    Dim assertError As String
    Dim motivo As String
    Set logs = TestHelper.NewLogs

    motivo = Issue19_InvokeMotivoCierre("Sí", "", "")
    Call TestHelper.AssertTrue(motivo <> "", "Cierre con CE pendiente y sin detalle debe bloquear", logs, assertError)

    Test_Issue19_CE_Cierre_SinDetalle_Bloquea = Issue19_Result(assertError, logs, "cierre_sin_detalle_bloquea")
End Function

Public Function Test_Issue19_CE_Cierre_ConDetalle_PermiteCierre() As String
    Dim logs As Collection
    Dim assertError As String
    Dim motivo As String
    Set logs = TestHelper.NewLogs

    motivo = Issue19_InvokeMotivoCierre("Sí", "Detalle CE completo", Date + 7)
    Call TestHelper.AssertTrue(motivo = "", "Cierre con CE detalle completo debe permitir cierre", logs, assertError)

    Test_Issue19_CE_Cierre_ConDetalle_PermiteCierre = Issue19_Result(assertError, logs, "cierre_con_detalle_ok")
End Function

Public Function Test_Issue19_CE_EstadoCalculado_Pendiente() As String
    Dim logs As Collection
    Dim assertError As String
    Dim estado As String
    Set logs = TestHelper.NewLogs

    estado = Issue19_InvokeEstadoCalculado("Sí", "", "", True)
    Call TestHelper.AssertTrue(estado = "CERRADAPTECE" Or estado = "CERRADAPTECECADUCADA", _
                               "EstadoCalculado debe resolver pendiente CE cuando acciones están completas y detalle CE incompleto", _
                               logs, assertError)

    Test_Issue19_CE_EstadoCalculado_Pendiente = Issue19_Result(assertError, logs, "estado_pendiente_ce")
End Function

Public Function Test_Issue19_CE_EstadoCalculado_SinPendiente() As String
    Dim logs As Collection
    Dim assertError As String
    Dim estado As String
    Set logs = TestHelper.NewLogs

    estado = Issue19_InvokeEstadoCalculado("Sí", "Detalle CE completo", Date + 7, True)
    Call TestHelper.AssertTrue(estado <> "CERRADAPTECE" And estado <> "CERRADAPTECECADUCADA", _
                               "EstadoCalculado no debe quedar pendiente CE cuando el detalle está completo", _
                               logs, assertError)

    Test_Issue19_CE_EstadoCalculado_SinPendiente = Issue19_Result(assertError, logs, "estado_sin_pendiente_ce")
End Function

Public Function Test_Issue19_Paridad_UI_Dominio() As String
    Dim logs As Collection
    Dim assertError As String
    Dim motivoDominio As String
    Dim motivoUI As String
    Set logs = TestHelper.NewLogs

    motivoDominio = Issue19_InvokeMotivoCierre("Sí", "", "")
    motivoUI = Issue19_InvokeMotivoUI("Sí", "", "")

    Call TestHelper.AssertTrue((motivoDominio = "" And motivoUI = "") Or (motivoDominio <> "" And motivoUI <> ""), _
                               "UI y dominio deben coincidir en allow/block", logs, assertError)
    Call TestHelper.AssertTrue(motivoDominio = motivoUI, "UI y dominio deben devolver el mismo motivo", logs, assertError)

    Test_Issue19_Paridad_UI_Dominio = Issue19_Result(assertError, logs, "paridad_ui_dominio")
End Function

Private Function Issue19_Result(ByVal assertError As String, ByVal logs As Collection, ByVal payload As String) As String
    If assertError <> "" Then
        Issue19_Result = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Issue19_Result = TestHelper.BuildJsonOk(logs, payload)
    End If
End Function

Private Function Issue19_InvokeMotivoAlta(ByVal requiereCE As String, ByVal detalle As String, ByVal fechaPrevista As Variant) As String
    On Error GoTo errores
    Dim op As Object
    Dim pError As String
    Set op = New NCProyectoOperaciones

    ' RED intencional: contrato nuevo esperado para issue-19 (no implementado en PR1)
    Issue19_InvokeMotivoAlta = CStr(CallByName(op, "MotivoAltaControlEficaciaNoOK", VbMethod, requiereCE, detalle, fechaPrevista, pError))
    Exit Function
errores:
    Issue19_InvokeMotivoAlta = "[RED] " & Err.Description
End Function

Private Function Issue19_InvokeMotivoCierre(ByVal requiereCE As String, ByVal detalle As String, ByVal fechaPrevista As Variant) As String
    On Error GoTo errores
    Dim op As Object
    Dim pError As String
    Set op = New NCProyectoOperaciones

    ' RED intencional: gate de cierre nuevo esperado para issue-19 (PR2)
    Issue19_InvokeMotivoCierre = CStr(CallByName(op, "MotivoCierreControlEficaciaNoOK", VbMethod, requiereCE, detalle, fechaPrevista, pError))
    Exit Function
errores:
    Issue19_InvokeMotivoCierre = "[RED] " & Err.Description
End Function

Private Function Issue19_InvokeEstadoCalculado(ByVal requiereCE As String, ByVal detalle As String, ByVal fechaPrevista As Variant, ByVal accionesCompletas As Boolean) As String
    On Error GoTo errores
    Dim nc As Object
    Set nc = New NCProyecto

    ' RED intencional: método auxiliar nuevo esperado para issue-19 (PR2)
    Issue19_InvokeEstadoCalculado = CStr(CallByName(nc, "EstadoCalculadoPorControlEficacia", VbMethod, requiereCE, detalle, fechaPrevista, accionesCompletas))
    Exit Function
errores:
    Issue19_InvokeEstadoCalculado = "[RED] " & Err.Description
End Function

Private Function Issue19_InvokeMotivoUI(ByVal requiereCE As String, ByVal detalle As String, ByVal fechaPrevista As Variant) As String
    On Error GoTo errores
    Dim frm As Object
    Dim pError As String
    Set frm = New Form_FormNCProyectoGeneral

    ' RED intencional: helper de paridad UI esperado para issue-19 (PR3)
    Issue19_InvokeMotivoUI = CStr(CallByName(frm, "MotivoCierreControlEficaciaNoOK_UI", VbMethod, requiereCE, detalle, fechaPrevista, pError))
    Exit Function
errores:
    Issue19_InvokeMotivoUI = "[RED] " & Err.Description
End Function
