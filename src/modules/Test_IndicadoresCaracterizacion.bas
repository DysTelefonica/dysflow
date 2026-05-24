Attribute VB_Name = "Test_IndicadoresCaracterizacion"
Option Compare Database
Option Explicit

Public Function Test_Indicadores_Calcular_MixedDataset_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim datos As Scripting.Dictionary
    Dim resultados As Scripting.Dictionary
    Dim usr As usuario
    Dim pError As String
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    Set datos = BuildDatosMixed("QA User", logs)
    Set usr = New usuario
    usr.Nombre = "QA User"

    Set resultados = Indicadores_Calcular(datos, usr, pError)
    Call TestHelper.AssertTrue(pError = "", "Indicadores_Calcular no debe fallar en mixed dataset", logs, assertError)
    Call TestHelper.AssertTrue(CLng(resultados("ProyectoTotal")) = 7, "ProyectoTotal debe ser 7", logs, assertError)
    Call TestHelper.AssertTrue(CLng(resultados("ProyectoUsuario")) = 7, "ProyectoUsuario debe ser 7 incluyendo tareas irregulares de proyecto", logs, assertError)
    Call TestHelper.AssertTrue(CLng(resultados("AuditoriaTotal")) = 6, "AuditoriaTotal debe ser 6", logs, assertError)
    Call TestHelper.AssertTrue(CLng(resultados("AuditoriaUsuario")) = 5, "AuditoriaUsuario debe ser 5", logs, assertError)

    If assertError <> "" Then
        Test_Indicadores_Calcular_MixedDataset_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Indicadores_Calcular_MixedDataset_Atomic = TestHelper.BuildJsonOk(logs, "mixed_ok")
    End If
    Exit Function
errores:
    Test_Indicadores_Calcular_MixedDataset_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

Public Function Test_Indicadores_Calcular_ZeroCase_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim datos As Scripting.Dictionary
    Dim resultados As Scripting.Dictionary
    Dim usr As usuario
    Dim pError As String
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    Set datos = BuildDatosVacios()
    Set usr = New usuario
    usr.Nombre = "QA User"

    Set resultados = Indicadores_Calcular(datos, usr, pError)
    Call TestHelper.AssertTrue(pError = "", "Indicadores_Calcular no debe fallar en zero case", logs, assertError)
    Call TestHelper.AssertTrue(CLng(resultados("ProyectoTotal")) = 0, "ProyectoTotal debe ser 0", logs, assertError)
    Call TestHelper.AssertTrue(CLng(resultados("ProyectoUsuario")) = 0, "ProyectoUsuario debe ser 0", logs, assertError)
    Call TestHelper.AssertTrue(CLng(resultados("AuditoriaTotal")) = 0, "AuditoriaTotal debe ser 0", logs, assertError)
    Call TestHelper.AssertTrue(CLng(resultados("AuditoriaUsuario")) = 0, "AuditoriaUsuario debe ser 0", logs, assertError)

    If assertError <> "" Then
        Test_Indicadores_Calcular_ZeroCase_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Indicadores_Calcular_ZeroCase_Atomic = TestHelper.BuildJsonOk(logs, "zero_ok")
    End If
    Exit Function
errores:
    Test_Indicadores_Calcular_ZeroCase_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

Public Function Test_Indicadores_Calcular_ProyectoSolo_Parcial_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim datos As Scripting.Dictionary
    Dim resultados As Scripting.Dictionary
    Dim usr As usuario
    Dim pError As String
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    Set datos = New Scripting.Dictionary
    datos.CompareMode = TextCompare

    Set datos("ProyectoTareasPteReplanificar") = New Scripting.Dictionary
    Set datos("ProyectoTareasIrregulares") = New Scripting.Dictionary
    Set datos("ProyectoNCRegistradas") = New Scripting.Dictionary
    Set datos("ProyectoNCAccionesSinTareas") = New Scripting.Dictionary
    Set datos("ProyectoNCPteCE") = New Scripting.Dictionary
    Set datos("ProyectoNCCECaducada") = New Scripting.Dictionary
    Set datos("ProyectoNCCENoConforme") = New Scripting.Dictionary

    Call AddSegTareasProyecto(datos("ProyectoTareasPteReplanificar"), "AR-P1", "QA User")
    Call AddSegTareasProyecto(datos("ProyectoTareasIrregulares"), "AR-P2", "QA User")
    Call AddSegNCProyecto(datos("ProyectoNCRegistradas"), "NCP-P1", "QA User")

    Set usr = New usuario
    usr.Nombre = "QA User"

    Set resultados = Indicadores_Calcular(datos, usr, pError, "PROYECTO")
    Call TestHelper.AssertTrue(pError = "", "Proyecto solo no debe fallar con dataset parcial", logs, assertError)
    Call TestHelper.AssertTrue(CLng(resultados("ProyectoTotal")) = 2, "ProyectoTotal debe sumar solo buckets de proyecto", logs, assertError)
    Call TestHelper.AssertTrue(CLng(resultados("ProyectoUsuario")) = 3, "ProyectoUsuario debe incluir irregulares de proyecto", logs, assertError)
    Call TestHelper.AssertTrue(Not resultados.Exists("AuditoriaTotal"), "Proyecto solo no debe calcular AuditoriaTotal", logs, assertError)
    Call TestHelper.AssertTrue(Not resultados.Exists("AuditoriaUsuario"), "Proyecto solo no debe calcular AuditoriaUsuario", logs, assertError)

    If assertError <> "" Then
        Test_Indicadores_Calcular_ProyectoSolo_Parcial_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Indicadores_Calcular_ProyectoSolo_Parcial_Atomic = TestHelper.BuildJsonOk(logs, "proyecto_solo_ok")
    End If
    Exit Function
errores:
    Test_Indicadores_Calcular_ProyectoSolo_Parcial_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

Public Function Test_Indicadores_FormatearCaption_Totales_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim caption As String
    Set logs = TestHelper.NewLogs

    caption = Indicadores_FormatearCaption(3, 9)
    Call TestHelper.AssertTrue(caption = "Seguimiento 3 / 9", "Caption debe respetar formato Seguimiento X / Y", logs, assertError)

    If assertError <> "" Then
        Test_Indicadores_FormatearCaption_Totales_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Indicadores_FormatearCaption_Totales_Atomic = TestHelper.BuildJsonOk(logs, caption)
    End If
End Function

Public Function Test_Indicadores_FormatearCaption_ZeroCase_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim caption As String
    Set logs = TestHelper.NewLogs

    caption = Indicadores_FormatearCaption(0, 0)
    Call TestHelper.AssertTrue(caption = "Seguimiento 0 / 0", "Caption cero debe ser Seguimiento 0 / 0", logs, assertError)

    If assertError <> "" Then
        Test_Indicadores_FormatearCaption_ZeroCase_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Indicadores_FormatearCaption_ZeroCase_Atomic = TestHelper.BuildJsonOk(logs, caption)
    End If
End Function

Public Function Test_Indicadores_MensajeAvance_Proyecto_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim mensaje As String
    Set logs = TestHelper.NewLogs

    mensaje = Indicadores_MensajeAvance("PROYECTO", "INICIO")
    Call TestHelper.AssertTrue(mensaje = "Calculando indicadores de proyectos...", "Mensaje de inicio PROYECTO inválido", logs, assertError)

    mensaje = Indicadores_MensajeAvance("PROYECTO", "APLICAR")
    Call TestHelper.AssertTrue(mensaje = "Actualizando seguimiento de proyectos...", "Mensaje de aplicar PROYECTO inválido", logs, assertError)

    If assertError <> "" Then
        Test_Indicadores_MensajeAvance_Proyecto_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Indicadores_MensajeAvance_Proyecto_Atomic = TestHelper.BuildJsonOk(logs, "msg_proyecto_ok")
    End If
End Function

Public Function Test_Indicadores_MensajeAvance_AuditoriaYDefault_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim mensaje As String
    Set logs = TestHelper.NewLogs

    mensaje = Indicadores_MensajeAvance("AUDITORIA", "INICIO")
    Call TestHelper.AssertTrue(mensaje = "Calculando indicadores de auditorías...", "Mensaje de inicio AUDITORIA inválido", logs, assertError)

    mensaje = Indicadores_MensajeAvance("AUDITORIA", "APLICAR")
    Call TestHelper.AssertTrue(mensaje = "Actualizando seguimiento de auditorías...", "Mensaje de aplicar AUDITORIA inválido", logs, assertError)

    mensaje = Indicadores_MensajeAvance("", "X")
    Call TestHelper.AssertTrue(mensaje = "Calculando indicadores...", "Mensaje default inválido", logs, assertError)

    If assertError <> "" Then
        Test_Indicadores_MensajeAvance_AuditoriaYDefault_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Indicadores_MensajeAvance_AuditoriaYDefault_Atomic = TestHelper.BuildJsonOk(logs, "msg_auditoria_ok")
    End If
End Function

Public Function Test_Indicadores_BuildDatos_ProyectoSolo_Objetos_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim pError As String
    Dim datos As Scripting.Dictionary
    Dim col As Scripting.Dictionary
    Dim key As Variant
    On Error GoTo errores

    Set logs = TestHelper.NewLogs

    Set datos = Indicadores_BuildDatos( _
                    New Scripting.Dictionary, _
                    New Scripting.Dictionary, _
                    New Scripting.Dictionary, _
                    New Scripting.Dictionary, _
                    New Scripting.Dictionary, _
                    New Scripting.Dictionary, _
                    New Scripting.Dictionary, _
                    New Scripting.Dictionary, _
                    New Scripting.Dictionary, _
                    New Scripting.Dictionary, _
                    New Scripting.Dictionary, _
                    New Scripting.Dictionary, _
                    New Scripting.Dictionary, _
                    "PROYECTO", _
                    pError)

    Call TestHelper.AssertTrue(pError = "", "Indicadores_BuildDatos no debe fallar en modo PROYECTO", logs, assertError)
    Call TestHelper.AssertTrue(datos.Exists("ProyectoTareasPteReplanificar"), "Debe incluir ProyectoTareasPteReplanificar", logs, assertError)
    Call TestHelper.AssertTrue(datos.Exists("ProyectoTareasIrregulares"), "Debe incluir ProyectoTareasIrregulares", logs, assertError)
    Call TestHelper.AssertTrue(datos.Exists("ProyectoNCRegistradas"), "Debe incluir ProyectoNCRegistradas", logs, assertError)
    Call TestHelper.AssertTrue(datos.Exists("ProyectoNCAccionesSinTareas"), "Debe incluir ProyectoNCAccionesSinTareas", logs, assertError)
    Call TestHelper.AssertTrue(datos.Exists("ProyectoNCPteCE"), "Debe incluir ProyectoNCPteCE", logs, assertError)
    Call TestHelper.AssertTrue(datos.Exists("ProyectoNCCECaducada"), "Debe incluir ProyectoNCCECaducada", logs, assertError)
    Call TestHelper.AssertTrue(datos.Exists("ProyectoNCCENoConforme"), "Debe incluir ProyectoNCCENoConforme", logs, assertError)
    Call TestHelper.AssertTrue(Not datos.Exists("AuditoriaTareasPteReplanificar"), "No debe incluir claves de auditoría en modo PROYECTO", logs, assertError)

    For Each key In datos.Keys
        Set col = datos(CStr(key))
        Call TestHelper.AssertTrue(TypeName(col) = "Dictionary", "Cada valor debe ser un objeto Dictionary: " & CStr(key), logs, assertError)
    Next key

    If assertError <> "" Then
        Test_Indicadores_BuildDatos_ProyectoSolo_Objetos_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Indicadores_BuildDatos_ProyectoSolo_Objetos_Atomic = TestHelper.BuildJsonOk(logs, "build_datos_proyecto_ok")
    End If
    Exit Function
errores:
    Test_Indicadores_BuildDatos_ProyectoSolo_Objetos_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

Public Function Test_Indicadores_CalcularDesdeColecciones_ProyectoSolo_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim pError As String
    Dim usr As usuario
    Dim resultados As Scripting.Dictionary
    Dim colPte As Scripting.Dictionary
    Dim colIrr As Scripting.Dictionary
    Dim colReg As Scripting.Dictionary
    Dim colSin As Scripting.Dictionary
    Dim colCE As Scripting.Dictionary
    Dim colCad As Scripting.Dictionary
    Dim colNoConf As Scripting.Dictionary
    On Error GoTo errores

    Set logs = TestHelper.NewLogs

    Set colPte = New Scripting.Dictionary
    Set colIrr = New Scripting.Dictionary
    Set colReg = New Scripting.Dictionary
    Set colSin = New Scripting.Dictionary
    Set colCE = New Scripting.Dictionary
    Set colCad = New Scripting.Dictionary
    Set colNoConf = New Scripting.Dictionary

    Call AddSegTareasProyecto(colPte, "AR-P1", "QA User")
    Call AddSegTareasProyecto(colIrr, "AR-P2", "QA User")
    Call AddSegNCProyecto(colReg, "NCP-P1", "QA User")

    Set usr = New usuario
    usr.Nombre = "QA User"

    Set resultados = Indicadores_CalcularDesdeColecciones( _
                    usr, _
                    colPte, _
                    colIrr, _
                    colReg, _
                    colSin, _
                    colCE, _
                    colCad, _
                    colNoConf, _
                    New Scripting.Dictionary, _
                    New Scripting.Dictionary, _
                    New Scripting.Dictionary, _
                    New Scripting.Dictionary, _
                    New Scripting.Dictionary, _
                    New Scripting.Dictionary, _
                    "PROYECTO", _
                    pError)

    Call TestHelper.AssertTrue(pError = "", "Indicadores_CalcularDesdeColecciones no debe fallar en PROYECTO", logs, assertError)
    Call TestHelper.AssertTrue(CLng(resultados("ProyectoTotal")) = 2, "ProyectoTotal debe sumar solo buckets de proyecto", logs, assertError)
    Call TestHelper.AssertTrue(CLng(resultados("ProyectoUsuario")) = 3, "ProyectoUsuario debe incluir irregulares de proyecto", logs, assertError)
    Call TestHelper.AssertTrue(Not resultados.Exists("AuditoriaTotal"), "No debe devolver AuditoriaTotal en modo PROYECTO", logs, assertError)
    Call TestHelper.AssertTrue(Not resultados.Exists("AuditoriaUsuario"), "No debe devolver AuditoriaUsuario en modo PROYECTO", logs, assertError)

    If assertError <> "" Then
        Test_Indicadores_CalcularDesdeColecciones_ProyectoSolo_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Indicadores_CalcularDesdeColecciones_ProyectoSolo_Atomic = TestHelper.BuildJsonOk(logs, "calcular_desde_colecciones_ok")
    End If
    Exit Function
errores:
    Test_Indicadores_CalcularDesdeColecciones_ProyectoSolo_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

Public Function Test_Indicadores_ProyectoFastCounts_ParityMixedDataset_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim datos As Scripting.Dictionary
    Dim conteos As Scripting.Dictionary
    Dim legacy As Scripting.Dictionary
    Dim fast As Scripting.Dictionary
    Dim usr As usuario
    Dim pError As String
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    Set datos = BuildDatosMixed("QA User", logs)
    Set usr = New usuario
    usr.Nombre = "QA User"

    Set legacy = Indicadores_Calcular(datos, usr, pError, "PROYECTO")
    Call TestHelper.AssertTrue(pError = "", "Legacy Proyecto no debe fallar", logs, assertError)

    Set conteos = BuildConteosProyectoDesdeDatos(datos, usr, pError)
    Call TestHelper.AssertTrue(pError = "", "Fixture de conteos Proyecto no debe fallar", logs, assertError)

    Set fast = Indicadores_CalcularProyectoDesdeConteos(conteos, pError)
    Call TestHelper.AssertTrue(pError = "", "Fast counts Proyecto no debe fallar", logs, assertError)
    Call TestHelper.AssertTrue(CLng(fast("ProyectoTotal")) = CLng(legacy("ProyectoTotal")), "ProyectoTotal fast debe igualar legacy", logs, assertError)
    Call TestHelper.AssertTrue(CLng(fast("ProyectoUsuario")) = CLng(legacy("ProyectoUsuario")), "ProyectoUsuario fast debe igualar legacy", logs, assertError)

    If assertError <> "" Then
        Test_Indicadores_ProyectoFastCounts_ParityMixedDataset_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Indicadores_ProyectoFastCounts_ParityMixedDataset_Atomic = TestHelper.BuildJsonOk(logs, "fast_counts_parity_ok")
    End If
    Exit Function
errores:
    Test_Indicadores_ProyectoFastCounts_ParityMixedDataset_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

Public Function Test_Indicadores_ProyectoFastCounts_NoAuditoriaKeys_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim datos As Scripting.Dictionary
    Dim conteos As Scripting.Dictionary
    Dim legacy As Scripting.Dictionary
    Dim fast As Scripting.Dictionary
    Dim usr As usuario
    Dim pError As String
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    Set datos = BuildDatosMixed("QA User", logs)
    Set usr = New usuario
    usr.Nombre = "QA User"

    Set legacy = Indicadores_Calcular(datos, usr, pError, "AMBOS")
    Call TestHelper.AssertTrue(pError = "", "Legacy AMBOS no debe fallar", logs, assertError)
    Set conteos = BuildConteosProyectoDesdeDatos(datos, usr, pError)
    Call TestHelper.AssertTrue(pError = "", "Fixture de conteos Proyecto no debe fallar", logs, assertError)
    Set fast = Indicadores_CalcularProyectoDesdeConteos(conteos, pError)
    Call TestHelper.AssertTrue(pError = "", "Fast counts Proyecto no debe fallar", logs, assertError)

    Call TestHelper.AssertTrue(Not fast.Exists("AuditoriaTotal"), "Fast counts Proyecto no debe devolver AuditoriaTotal", logs, assertError)
    Call TestHelper.AssertTrue(Not fast.Exists("AuditoriaUsuario"), "Fast counts Proyecto no debe devolver AuditoriaUsuario", logs, assertError)
    Call TestHelper.AssertTrue(CLng(legacy("AuditoriaTotal")) = 6, "Legacy AuditoriaTotal debe seguir intacto", logs, assertError)
    Call TestHelper.AssertTrue(CLng(legacy("AuditoriaUsuario")) = 5, "Legacy AuditoriaUsuario debe seguir intacto", logs, assertError)

    If assertError <> "" Then
        Test_Indicadores_ProyectoFastCounts_NoAuditoriaKeys_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Indicadores_ProyectoFastCounts_NoAuditoriaKeys_Atomic = TestHelper.BuildJsonOk(logs, "fast_counts_no_auditoria_ok")
    End If
    Exit Function
errores:
    Test_Indicadores_ProyectoFastCounts_NoAuditoriaKeys_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

Public Function Test_Indicadores_ProyectoFastCounts_RuntimeUsaConteos_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim conteos As Scripting.Dictionary
    Dim resultados As Scripting.Dictionary
    Dim usr As usuario
    Dim pError As String
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    Set conteos = New Scripting.Dictionary
    conteos.CompareMode = TextCompare
    conteos("ProyectoTareasPteReplanificarTotal") = 2
    conteos("ProyectoNCAccionesSinTareasTotal") = 3
    conteos("ProyectoNCRegistradasTotal") = 5
    conteos("ProyectoNCPteCETotal") = 7
    conteos("ProyectoNCCECaducadaTotal") = 11
    conteos("ProyectoNCCENoConformeTotal") = 13
    conteos("ProyectoTareasPteReplanificarUsuario") = 1
    conteos("ProyectoTareasIrregularesUsuario") = 2
    conteos("ProyectoNCRegistradasUsuario") = 3
    conteos("ProyectoNCAccionesSinTareasUsuario") = 4
    conteos("ProyectoNCPteCEUsuario") = 5
    conteos("ProyectoNCCECaducadaUsuario") = 6
    conteos("ProyectoNCCENoConformeUsuario") = 7

    Set usr = New usuario
    usr.Nombre = "QA User"

    Set resultados = Indicadores_CalcularDesdeColecciones( _
                    usr, _
                    Nothing, _
                    Nothing, _
                    Nothing, _
                    Nothing, _
                    Nothing, _
                    Nothing, _
                    Nothing, _
                    Nothing, _
                    Nothing, _
                    Nothing, _
                    Nothing, _
                    Nothing, _
                    Nothing, _
                    "PROYECTO", _
                    pError, _
                    conteos)

    Call TestHelper.AssertTrue(pError = "", "Runtime Proyecto con conteos rápidos no debe fallar", logs, assertError)
    Call TestHelper.AssertTrue(CLng(resultados("ProyectoTotal")) = 41, "ProyectoTotal debe salir de conteos rápidos", logs, assertError)
    Call TestHelper.AssertTrue(CLng(resultados("ProyectoUsuario")) = 28, "ProyectoUsuario debe salir de conteos rápidos", logs, assertError)
    Call TestHelper.AssertTrue(Not resultados.Exists("AuditoriaTotal"), "Runtime fast PROYECTO no debe devolver AuditoriaTotal", logs, assertError)

    If assertError <> "" Then
        Test_Indicadores_ProyectoFastCounts_RuntimeUsaConteos_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Indicadores_ProyectoFastCounts_RuntimeUsaConteos_Atomic = TestHelper.BuildJsonOk(logs, "runtime_fast_counts_ok")
    End If
    Exit Function
errores:
    Test_Indicadores_ProyectoFastCounts_RuntimeUsaConteos_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

Public Function Test_Indicadores_ProyectoFastCounts_RuntimeNoAfectaAuditoria_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim conteos As Scripting.Dictionary
    Dim resultados As Scripting.Dictionary
    Dim usr As usuario
    Dim audPte As Scripting.Dictionary
    Dim audReg As Scripting.Dictionary
    Dim pError As String
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    Set conteos = New Scripting.Dictionary
    conteos.CompareMode = TextCompare
    conteos("ProyectoTareasPteReplanificarTotal") = 99
    conteos("ProyectoTareasPteReplanificarUsuario") = 99

    Set usr = New usuario
    usr.Nombre = "QA User"
    Set audPte = New Scripting.Dictionary
    Set audReg = New Scripting.Dictionary
    Call AddSegTareasAuditoria(audPte, "AAR-1", "QA User")
    Call AddSegTareasAuditoria(audPte, "AAR-2", "Otro")
    Call AddSegNCAuditoria(audReg, "NCA-1", "QA User")

    Set resultados = Indicadores_CalcularDesdeColecciones( _
                    usr, _
                    Nothing, _
                    Nothing, _
                    Nothing, _
                    Nothing, _
                    Nothing, _
                    Nothing, _
                    Nothing, _
                    audPte, _
                    audReg, _
                    New Scripting.Dictionary, _
                    New Scripting.Dictionary, _
                    New Scripting.Dictionary, _
                    New Scripting.Dictionary, _
                    "AUDITORIA", _
                    pError, _
                    conteos)

    Call TestHelper.AssertTrue(pError = "", "Runtime AUDITORIA no debe fallar con conteos Proyecto presentes", logs, assertError)
    Call TestHelper.AssertTrue(CLng(resultados("AuditoriaTotal")) = 3, "AuditoriaTotal debe conservar ruta legacy", logs, assertError)
    Call TestHelper.AssertTrue(CLng(resultados("AuditoriaUsuario")) = 2, "AuditoriaUsuario debe conservar ruta legacy", logs, assertError)
    Call TestHelper.AssertTrue(Not resultados.Exists("ProyectoTotal"), "AUDITORIA no debe consumir conteos Proyecto", logs, assertError)

    If assertError <> "" Then
        Test_Indicadores_ProyectoFastCounts_RuntimeNoAfectaAuditoria_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Indicadores_ProyectoFastCounts_RuntimeNoAfectaAuditoria_Atomic = TestHelper.BuildJsonOk(logs, "runtime_fast_counts_auditoria_ok")
    End If
    Exit Function
errores:
    Test_Indicadores_ProyectoFastCounts_RuntimeNoAfectaAuditoria_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

Private Function BuildDatosVacios() As Scripting.Dictionary
    Dim datos As Scripting.Dictionary
    Set datos = New Scripting.Dictionary
    datos.CompareMode = TextCompare

    Set datos("ProyectoTareasPteReplanificar") = New Scripting.Dictionary
    Set datos("ProyectoTareasIrregulares") = New Scripting.Dictionary
    Set datos("ProyectoNCRegistradas") = New Scripting.Dictionary
    Set datos("ProyectoNCAccionesSinTareas") = New Scripting.Dictionary
    Set datos("ProyectoNCPteCE") = New Scripting.Dictionary
    Set datos("ProyectoNCCECaducada") = New Scripting.Dictionary
    Set datos("ProyectoNCCENoConforme") = New Scripting.Dictionary

    Set datos("AuditoriaTareasPteReplanificar") = New Scripting.Dictionary
    Set datos("AuditoriaNCRegistradas") = New Scripting.Dictionary
    Set datos("AuditoriaNCAccionesSinTareas") = New Scripting.Dictionary
    Set datos("AuditoriaNCPteCE") = New Scripting.Dictionary
    Set datos("AuditoriaNCCECaducada") = New Scripting.Dictionary
    Set datos("AuditoriaNCCENoConforme") = New Scripting.Dictionary

    Set BuildDatosVacios = datos
End Function

Private Function BuildDatosMixed(ByVal pNombreUsuario As String, ByRef pLogs As Collection) As Scripting.Dictionary
    Dim datos As Scripting.Dictionary
    Set datos = BuildDatosVacios()

    pLogs.Add "Fixture: ProyectoTareasPteReplanificar"
    Call AddSegTareasProyecto(datos("ProyectoTareasPteReplanificar"), "AR-1", pNombreUsuario)
    Call AddSegTareasProyecto(datos("ProyectoTareasPteReplanificar"), "AR-2", "Otro")
    pLogs.Add "Fixture: ProyectoNCRegistradas"
    Call AddSegNCProyecto(datos("ProyectoNCRegistradas"), "NCP-1", pNombreUsuario)
    pLogs.Add "Fixture: ProyectoNCAccionesSinTareas"
    Call AddSegNCProyecto(datos("ProyectoNCAccionesSinTareas"), "NCP-2", pNombreUsuario)
    pLogs.Add "Fixture: ProyectoNCPteCE"
    Call AddSegNCProyecto(datos("ProyectoNCPteCE"), "NCP-3", pNombreUsuario)
    pLogs.Add "Fixture: ProyectoNCCECaducada"
    Call AddSegNCProyecto(datos("ProyectoNCCECaducada"), "NCP-4", pNombreUsuario)
    pLogs.Add "Fixture: ProyectoNCCENoConforme"
    Call AddSegNCProyecto(datos("ProyectoNCCENoConforme"), "NCP-5", pNombreUsuario)

    pLogs.Add "Fixture: ProyectoTareasIrregulares"
    Call AddSegTareasProyecto(datos("ProyectoTareasIrregulares"), "AR-3", pNombreUsuario)

    pLogs.Add "Fixture: AuditoriaTareasPteReplanificar"
    Call AddSegTareasAuditoria(datos("AuditoriaTareasPteReplanificar"), "AAR-1", pNombreUsuario)
    pLogs.Add "Fixture: AuditoriaNCRegistradas"
    Call AddSegNCAuditoria(datos("AuditoriaNCRegistradas"), "NCA-1", pNombreUsuario)
    pLogs.Add "Fixture: AuditoriaNCAccionesSinTareas"
    Call AddSegNCAuditoria(datos("AuditoriaNCAccionesSinTareas"), "NCA-2", pNombreUsuario)
    pLogs.Add "Fixture: AuditoriaNCPteCE"
    Call AddSegNCAuditoria(datos("AuditoriaNCPteCE"), "NCA-3", pNombreUsuario)
    pLogs.Add "Fixture: AuditoriaNCCECaducada"
    Call AddSegNCAuditoria(datos("AuditoriaNCCECaducada"), "NCA-4", pNombreUsuario)
    pLogs.Add "Fixture: AuditoriaNCCENoConforme"
    Call AddSegNCAuditoria(datos("AuditoriaNCCENoConforme"), "NCA-5", "Otro")

    Set BuildDatosMixed = datos
End Function

Private Sub AddSegTareasProyecto(ByVal pCol As Scripting.Dictionary, ByVal pID As String, ByVal pResp As String)
    Dim item As SegTareasProyecto
    Set item = New SegTareasProyecto
    item.IDAccionRealizada = pID
    item.RespCalidad = pResp
    pCol.Add pID & "|" & CStr(pCol.count + 1), item
End Sub

Private Sub AddSegNCProyecto(ByVal pCol As Scripting.Dictionary, ByVal pID As String, ByVal pResp As String)
    Dim item As SegNCProyecto
    Set item = New SegNCProyecto
    item.IDNoConformidad = pID
    item.NombreCalidad = pResp
    pCol.Add pID & "|" & CStr(pCol.count + 1), item
End Sub

Private Sub AddSegTareasAuditoria(ByVal pCol As Scripting.Dictionary, ByVal pID As String, ByVal pResp As String)
    Dim item As SegTareasAuditoria
    Set item = New SegTareasAuditoria
    item.IDAccionRealizada = pID
    item.Responsable = pResp
    pCol.Add pID & "|" & CStr(pCol.count + 1), item
End Sub

Private Sub AddSegNCAuditoria(ByVal pCol As Scripting.Dictionary, ByVal pID As String, ByVal pResp As String)
    Dim item As SegNCAuditoria
    Set item = New SegNCAuditoria
    item.id = pID
    item.Responsable = pResp
    pCol.Add pID & "|" & CStr(pCol.count + 1), item
End Sub

Private Function BuildConteosProyectoDesdeDatos( _
                                    ByVal pDatos As Scripting.Dictionary, _
                                    ByVal pUsuario As usuario, _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
    Dim conteos As Scripting.Dictionary
    Set conteos = New Scripting.Dictionary
    conteos.CompareMode = TextCompare

    conteos("ProyectoTareasPteReplanificarTotal") = pDatos("ProyectoTareasPteReplanificar").Count
    conteos("ProyectoTareasPteReplanificarUsuario") = CountUsuarioTest(pDatos("ProyectoTareasPteReplanificar"), pUsuario, p_Error)
    conteos("ProyectoTareasIrregularesUsuario") = CountUsuarioTest(pDatos("ProyectoTareasIrregulares"), pUsuario, p_Error)
    conteos("ProyectoNCRegistradasTotal") = pDatos("ProyectoNCRegistradas").Count
    conteos("ProyectoNCRegistradasUsuario") = CountUsuarioTest(pDatos("ProyectoNCRegistradas"), pUsuario, p_Error)
    conteos("ProyectoNCAccionesSinTareasTotal") = pDatos("ProyectoNCAccionesSinTareas").Count
    conteos("ProyectoNCAccionesSinTareasUsuario") = CountUsuarioTest(pDatos("ProyectoNCAccionesSinTareas"), pUsuario, p_Error)
    conteos("ProyectoNCPteCETotal") = pDatos("ProyectoNCPteCE").Count
    conteos("ProyectoNCPteCEUsuario") = CountUsuarioTest(pDatos("ProyectoNCPteCE"), pUsuario, p_Error)
    conteos("ProyectoNCCECaducadaTotal") = pDatos("ProyectoNCCECaducada").Count
    conteos("ProyectoNCCECaducadaUsuario") = CountUsuarioTest(pDatos("ProyectoNCCECaducada"), pUsuario, p_Error)
    conteos("ProyectoNCCENoConformeTotal") = pDatos("ProyectoNCCENoConforme").Count
    conteos("ProyectoNCCENoConformeUsuario") = CountUsuarioTest(pDatos("ProyectoNCCENoConforme"), pUsuario, p_Error)

    Set BuildConteosProyectoDesdeDatos = conteos
End Function

Private Function CountUsuarioTest( _
                                    ByVal pCol As Scripting.Dictionary, _
                                    ByVal pUsuario As usuario, _
                                    Optional ByRef p_Error As String _
                                    ) As Long
    Dim colUsuario As Scripting.Dictionary
    Set colUsuario = getColSeguimientoPorUsuario(pCol, pUsuario, p_Error)
    If p_Error <> "" Then Exit Function
    If Not colUsuario Is Nothing Then CountUsuarioTest = colUsuario.Count
End Function

' ============================================================
' TESTS DE SINCRONIZACION DE CACHE — ModuloCacheIndicadores
' Verifica que el cache global de indicadores funciona correctamente
' y no corrompe datos al invalidar/recargar.
' ============================================================

Private Function CacheTest_NewDict() As Scripting.Dictionary
    Set CacheTest_NewDict = New Scripting.Dictionary
    CacheTest_NewDict.CompareMode = TextCompare
End Function

Private Sub CacheTest_ResetTeardown(ByRef p_Logs As Collection, ByRef p_AssertError As String)
    Dim resetError As String

    Call Cache_Test_ResetAll(p_Error:=resetError)
    If resetError <> "" Then
        AddLog p_Logs, "TEARDOWN ERROR: " & resetError
        If p_AssertError = "" Then p_AssertError = resetError
    Else
        AddLog p_Logs, "Teardown: cache reset"
    End If
End Sub

Public Function Test_Cache_Proyecto_Delegacion_Y_Reset_Atomic() As String
    ' Test puro/in-memory: seed deterministico, cache directo e invalidacion sin backend.
    Dim logs As Collection
    Dim assertError As String
    Dim pError As String
    Dim errMsg As String
    Dim seeded1 As Scripting.Dictionary
    Dim seeded2 As Scripting.Dictionary
    Dim dict1 As Scripting.Dictionary
    Dim dict2 As Scripting.Dictionary
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    Call Cache_Test_ResetAll(p_Error:=pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange limpia cache antes del seed", logs, assertError)
    If pError <> "" Then GoTo finalizar

    Set seeded1 = CacheTest_NewDict()
    Call AddSegTareasProyecto(seeded1, "AR-CACHE-P1", "QA User")
    Call Cache_Test_SeedProyectoBucket(BUCKET_TAR_PROY_PTE_REPLAN, seeded1, pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange seed proyecto pte replan deterministico", logs, assertError)
    If pError <> "" Then GoTo finalizar

    Set dict1 = Cache_Indicadores_Proyecto(BUCKET_TAR_PROY_PTE_REPLAN, p_Reset:=False, p_Error:=pError)
    Call TestHelper.AssertTrue(pError = "", "Act obtiene bucket proyecto sin recalcular", logs, assertError)
    Call TestHelper.AssertTrue(dict1 Is seeded1, "Cache debe devolver la misma referencia seeded", logs, assertError)
    Call TestHelper.AssertTrue(dict1.Count = 1, "Cache seeded inicial debe tener 1 item", logs, assertError)

    Call Cache_InvalidarProyecto(p_Error:=pError)
    Call TestHelper.AssertTrue(pError = "", "Cache_InvalidarProyecto no debe fallar", logs, assertError)
    Call TestHelper.AssertTrue(Not Cache_Proyecto_EstaCargado(), "Proyecto debe quedar descargado tras invalidar", logs, assertError)

    Set seeded2 = CacheTest_NewDict()
    Call AddSegTareasProyecto(seeded2, "AR-CACHE-P2", "QA User")
    Call AddSegTareasProyecto(seeded2, "AR-CACHE-P3", "QA User")
    Call Cache_Test_SeedProyectoBucket(BUCKET_TAR_PROY_PTE_REPLAN, seeded2, pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange re-seed proyecto tras reset", logs, assertError)
    If pError <> "" Then GoTo finalizar

    Set dict2 = Cache_Indicadores_Proyecto(BUCKET_TAR_PROY_PTE_REPLAN, p_Reset:=False, p_Error:=pError)
    Call TestHelper.AssertTrue(pError = "", "Act obtiene bucket re-seeded sin backend", logs, assertError)
    Call TestHelper.AssertTrue(dict2 Is seeded2, "Cache debe devolver la nueva referencia seeded", logs, assertError)
    Call TestHelper.AssertTrue(Not (dict2 Is dict1), "La referencia tras reset debe cambiar", logs, assertError)
    Call TestHelper.AssertTrue(dict2.Count = 2, "Cache re-seeded debe tener 2 items", logs, assertError)
    Call TestHelper.AssertTrue(Cache_Proyecto_EstaCargado(), "Cache proyecto debe quedar cargado", logs, assertError)

finalizar:
    Call CacheTest_ResetTeardown(logs, assertError)
    If assertError <> "" Then
        Test_Cache_Proyecto_Delegacion_Y_Reset_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Cache_Proyecto_Delegacion_Y_Reset_Atomic = TestHelper.BuildJsonOk(logs, "cache_pure_seed_reset_ok")
    End If
    Exit Function
errores:
    errMsg = Err.Description
    On Error Resume Next
    Call CacheTest_ResetTeardown(logs, assertError)
    On Error GoTo 0
    Test_Cache_Proyecto_Delegacion_Y_Reset_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
End Function

Public Function Test_Cache_InvalidarTodo_SeparaProyectosYAuditorias_Atomic() As String
    ' Test puro/in-memory: InvalidarTodo limpia caches seeded de proyecto y auditoria.
    Dim logs As Collection
    Dim assertError As String
    Dim pError As String
    Dim errMsg As String
    Dim seedProy As Scripting.Dictionary
    Dim seedAud As Scripting.Dictionary
    Dim dictProy As Scripting.Dictionary
    Dim dictAud As Scripting.Dictionary
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    Call Cache_Test_ResetAll(p_Error:=pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange limpia cache antes del seed doble", logs, assertError)
    If pError <> "" Then GoTo finalizar

    Set seedProy = CacheTest_NewDict()
    Set seedAud = CacheTest_NewDict()
    Call AddSegTareasProyecto(seedProy, "AR-CACHE-P1", "QA User")
    Call AddSegTareasAuditoria(seedAud, "AAR-CACHE-A1", "QA User")
    Call Cache_Test_SeedProyectoBucket(BUCKET_TAR_PROY_PTE_REPLAN, seedProy, pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange seed proyecto", logs, assertError)
    If pError <> "" Then GoTo finalizar
    Call Cache_Test_SeedAuditoriaBucket(BUCKET_TAR_AUD_PTE_REPLAN, seedAud, pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange seed auditoria", logs, assertError)
    If pError <> "" Then GoTo finalizar

    Set dictProy = Cache_Indicadores_Proyecto(BUCKET_TAR_PROY_PTE_REPLAN, p_Reset:=False, p_Error:=pError)
    Call TestHelper.AssertTrue(pError = "", "Act obtiene proyecto seeded", logs, assertError)
    Set dictAud = Cache_Indicadores_Auditoria(BUCKET_TAR_AUD_PTE_REPLAN, p_Reset:=False, p_Error:=pError)
    Call TestHelper.AssertTrue(pError = "", "Act obtiene auditoria seeded", logs, assertError)
    Call TestHelper.AssertTrue(dictProy Is seedProy, "Proyecto debe conservar referencia seeded", logs, assertError)
    Call TestHelper.AssertTrue(dictAud Is seedAud, "Auditoria debe conservar referencia seeded", logs, assertError)

    Call Cache_InvalidarTodo(p_Error:=pError)
    Call TestHelper.AssertTrue(pError = "", "Cache_InvalidarTodo no debe fallar", logs, assertError)
    Call TestHelper.AssertTrue(Not Cache_Proyecto_EstaCargado(), "Tras InvalidarTodo, proyecto no debe estar cargado", logs, assertError)
    Call TestHelper.AssertTrue(Not Cache_Auditoria_EstaCargado(), "Tras InvalidarTodo, auditoria no debe estar cargada", logs, assertError)

finalizar:
    Call CacheTest_ResetTeardown(logs, assertError)
    If assertError <> "" Then
        Test_Cache_InvalidarTodo_SeparaProyectosYAuditorias_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Cache_InvalidarTodo_SeparaProyectosYAuditorias_Atomic = TestHelper.BuildJsonOk(logs, "invalidate_todo_pure_ok")
    End If
    Exit Function
errores:
    errMsg = Err.Description
    On Error Resume Next
    Call CacheTest_ResetTeardown(logs, assertError)
    On Error GoTo 0
    Test_Cache_InvalidarTodo_SeparaProyectosYAuditorias_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
End Function

Public Function Test_Cache_InvalidacionSelectiva_Atomic() As String
    ' Test puro/in-memory: cada invalidacion selectiva respeta el otro cache seeded.
    Dim logs As Collection
    Dim assertError As String
    Dim pError As String
    Dim errMsg As String
    Dim seedProy As Scripting.Dictionary
    Dim seedProy2 As Scripting.Dictionary
    Dim seedAud As Scripting.Dictionary
    Dim dictProy As Scripting.Dictionary
    Dim dictAud As Scripting.Dictionary
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    Call Cache_Test_ResetAll(p_Error:=pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange limpia cache antes de invalidacion selectiva", logs, assertError)
    If pError <> "" Then GoTo finalizar

    Set seedProy = CacheTest_NewDict()
    Set seedAud = CacheTest_NewDict()
    Call AddSegTareasProyecto(seedProy, "AR-CACHE-P1", "QA User")
    Call AddSegTareasAuditoria(seedAud, "AAR-CACHE-A1", "QA User")
    Call Cache_Test_SeedProyectoBucket(BUCKET_TAR_PROY_PTE_REPLAN, seedProy, pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange seed proyecto", logs, assertError)
    If pError <> "" Then GoTo finalizar
    Call Cache_Test_SeedAuditoriaBucket(BUCKET_TAR_AUD_PTE_REPLAN, seedAud, pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange seed auditoria", logs, assertError)
    If pError <> "" Then GoTo finalizar

    Call Cache_InvalidarProyecto(p_Error:=pError)
    Call TestHelper.AssertTrue(pError = "", "Cache_InvalidarProyecto no debe fallar", logs, assertError)
    Call TestHelper.AssertTrue(Not Cache_Proyecto_EstaCargado(), "Proyecto debe estar descargado", logs, assertError)
    Call TestHelper.AssertTrue(Cache_Auditoria_EstaCargado(), "Auditoria debe seguir cargada", logs, assertError)
    Set dictAud = Cache_Indicadores_Auditoria(BUCKET_TAR_AUD_PTE_REPLAN, p_Reset:=False, p_Error:=pError)
    Call TestHelper.AssertTrue(pError = "", "Auditoria seeded sigue accesible", logs, assertError)
    Call TestHelper.AssertTrue(dictAud Is seedAud, "Auditoria conserva su referencia tras invalidar proyecto", logs, assertError)

    Set seedProy2 = CacheTest_NewDict()
    Call AddSegTareasProyecto(seedProy2, "AR-CACHE-P2", "QA User")
    Call Cache_Test_SeedProyectoBucket(BUCKET_TAR_PROY_PTE_REPLAN, seedProy2, pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange re-seed proyecto", logs, assertError)
    If pError <> "" Then GoTo finalizar

    Call Cache_InvalidarAuditoria(p_Error:=pError)
    Call TestHelper.AssertTrue(pError = "", "Cache_InvalidarAuditoria no debe fallar", logs, assertError)
    Call TestHelper.AssertTrue(Cache_Proyecto_EstaCargado(), "Proyecto debe seguir cargado", logs, assertError)
    Call TestHelper.AssertTrue(Not Cache_Auditoria_EstaCargado(), "Auditoria debe estar descargada", logs, assertError)
    Set dictProy = Cache_Indicadores_Proyecto(BUCKET_TAR_PROY_PTE_REPLAN, p_Reset:=False, p_Error:=pError)
    Call TestHelper.AssertTrue(pError = "", "Proyecto re-seeded sigue accesible", logs, assertError)
    Call TestHelper.AssertTrue(dictProy Is seedProy2, "Proyecto conserva su nueva referencia tras invalidar auditoria", logs, assertError)

finalizar:
    Call CacheTest_ResetTeardown(logs, assertError)
    If assertError <> "" Then
        Test_Cache_InvalidacionSelectiva_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Cache_InvalidacionSelectiva_Atomic = TestHelper.BuildJsonOk(logs, "inval_selectiva_pure_ok")
    End If
    Exit Function
errores:
    errMsg = Err.Description
    On Error Resume Next
    Call CacheTest_ResetTeardown(logs, assertError)
    On Error GoTo 0
    Test_Cache_InvalidacionSelectiva_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
End Function

Public Function Test_Cache_ConsistenciaConEntorno_Atomic() As String
    ' Test puro/in-memory: consistencia de bucket seeded y cache API sin Entorno/backend.
    Dim logs As Collection
    Dim assertError As String
    Dim pError As String
    Dim errMsg As String
    Dim seedReg As Scripting.Dictionary
    Dim colCache As Scripting.Dictionary
    Dim colCache2 As Scripting.Dictionary
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    Call Cache_Test_ResetAll(p_Error:=pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange limpia cache antes de consistencia", logs, assertError)
    If pError <> "" Then GoTo finalizar

    Set seedReg = CacheTest_NewDict()
    Call AddSegNCProyecto(seedReg, "NCP-CACHE-1", "QA User")
    Call AddSegNCProyecto(seedReg, "NCP-CACHE-2", "Otro")
    Call Cache_Test_SeedProyectoBucket(BUCKET_NC_PROY_REGISTRADAS, seedReg, pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange seed NC proyecto registradas", logs, assertError)
    If pError <> "" Then GoTo finalizar

    Set colCache = Cache_Indicadores_Proyecto(BUCKET_NC_PROY_REGISTRADAS, p_Reset:=False, p_Error:=pError)
    Call TestHelper.AssertTrue(pError = "", "Act obtiene bucket NC registradas desde cache", logs, assertError)
    Call TestHelper.AssertTrue(colCache Is seedReg, "Cache debe devolver exactamente el bucket seeded", logs, assertError)
    Call TestHelper.AssertTrue(colCache.Count = 2, "Bucket seeded debe conservar sus 2 elementos", logs, assertError)

    Call Cache_InvalidarAuditoria(p_Error:=pError)
    Call TestHelper.AssertTrue(pError = "", "Invalidar auditoria no debe tocar proyecto", logs, assertError)
    Set colCache2 = Cache_Indicadores_Proyecto(BUCKET_NC_PROY_REGISTRADAS, p_Reset:=False, p_Error:=pError)
    Call TestHelper.AssertTrue(pError = "", "Proyecto sigue accesible tras invalidar auditoria", logs, assertError)
    Call TestHelper.AssertTrue(colCache2 Is seedReg, "Proyecto conserva referencia tras invalidar auditoria", logs, assertError)

    Call Cache_InvalidarProyecto(p_Error:=pError)
    Call TestHelper.AssertTrue(pError = "", "Invalidar proyecto no debe fallar", logs, assertError)
    Call TestHelper.AssertTrue(Not Cache_Proyecto_EstaCargado(), "Proyecto debe quedar descargado al final del Act", logs, assertError)

finalizar:
    Call CacheTest_ResetTeardown(logs, assertError)
    If assertError <> "" Then
        Test_Cache_ConsistenciaConEntorno_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Cache_ConsistenciaConEntorno_Atomic = TestHelper.BuildJsonOk(logs, "consistencia_cache_pure_ok")
    End If
    Exit Function
errores:
    errMsg = Err.Description
    On Error Resume Next
    Call CacheTest_ResetTeardown(logs, assertError)
    On Error GoTo 0
    Test_Cache_ConsistenciaConEntorno_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
End Function
