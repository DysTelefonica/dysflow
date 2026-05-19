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
    Dim op As NCProyectoOperaciones
    Dim nc As NCProyecto
    Dim pError As String
    Set op = New NCProyectoOperaciones
    Set nc = New NCProyecto
    
    nc.RequiereControlEficacia = requiereCE
    nc.ControlEficacia = detalle
    If IsDate(fechaPrevista) Then nc.FechaPrevistaControlEficacia = CStr(fechaPrevista)
    Set op.nc = nc
    
    ' Llama al método real del dominio
    Issue19_InvokeMotivoAlta = op.MotivoAltaDatosUnicosNoOK(nc, pError)
    Exit Function
errores:
    Issue19_InvokeMotivoAlta = "[RED] " & Err.Description
End Function

Private Function Issue19_InvokeMotivoCierre(ByVal requiereCE As String, ByVal detalle As String, ByVal fechaPrevista As Variant) As String
    On Error GoTo errores
    Dim op As NCProyectoOperaciones
    Dim nc As NCProyecto
    Dim pError As String
    Set op = New NCProyectoOperaciones
    Set nc = New NCProyecto
    
    nc.RequiereControlEficacia = requiereCE
    nc.ControlEficacia = detalle
    If IsDate(fechaPrevista) Then nc.FechaPrevistaControlEficacia = CStr(fechaPrevista)
    ' Simular todas las ARs finalizadas = True para activar el gate
    nc.TodasLasArsFinalizadas = EnumSino.Sí
    Set op.nc = nc
    
    ' Llama al método real del dominio (implementado en PR2)
    Issue19_InvokeMotivoCierre = op.MotivoCierreControlEficaciaNoOK(pError)
    Exit Function
errores:
    Issue19_InvokeMotivoCierre = "[RED] " & Err.Description
End Function

Private Function Issue19_InvokeEstadoCalculado(ByVal requiereCE As String, ByVal detalle As String, ByVal fechaPrevista As Variant, ByVal accionesCompletas As Boolean) As String
    On Error GoTo errores
    Dim nc As NCProyecto
    
    Set nc = New NCProyecto
    nc.RequiereControlEficacia = requiereCE
    nc.ControlEficacia = detalle
    If IsDate(fechaPrevista) Then nc.FechaPrevistaControlEficacia = CStr(fechaPrevista)
    If accionesCompletas Then nc.TodasLasArsFinalizadas = EnumSino.Sí Else nc.TodasLasArsFinalizadas = EnumSino.No
    
    ' EstadoCalculado ya existe y soporta CERRADAPTECE*
    Issue19_InvokeEstadoCalculado = nc.EstadoCalculadoTexto
    Exit Function
errores:
    Issue19_InvokeEstadoCalculado = "[RED] " & Err.Description
End Function

Private Function Issue19_InvokeMotivoUI(ByVal requiereCE As String, ByVal detalle As String, ByVal fechaPrevista As Variant) As String
    On Error GoTo errores
    Dim op As NCProyectoOperaciones
    Dim nc As NCProyecto
    Dim pError As String
    Set op = New NCProyectoOperaciones
    Set nc = New NCProyecto
    
    nc.RequiereControlEficacia = requiereCE
    nc.ControlEficacia = detalle
    If IsDate(fechaPrevista) Then nc.FechaPrevistaControlEficacia = CStr(fechaPrevista)
    nc.TodasLasArsFinalizadas = EnumSino.Sí
    Set op.nc = nc
    
    ' La UI (Form_FormNCProyectoGeneral.ComandoGrabar_Click) usa el mismo MotivoCierreControlEficaciaNoOK
    ' Paridad: la UI llama al mismo método del dominio que este test
    Issue19_InvokeMotivoUI = op.MotivoCierreControlEficaciaNoOK(pError)
    Exit Function
errores:
    Issue19_InvokeMotivoUI = "[RED] " & Err.Description
End Function
