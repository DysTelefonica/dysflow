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

Public Function Test_Indicadores_AuditoriaFastCounts_RuntimeUsaConteos_Atomic() As String
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
    conteos("AuditoriaTareasPteReplanificarTotal") = 2
    conteos("AuditoriaNCAccionesSinTareasTotal") = 3
    conteos("AuditoriaNCRegistradasTotal") = 5
    conteos("AuditoriaNCPteCETotal") = 7
    conteos("AuditoriaNCCECaducadaTotal") = 11
    conteos("AuditoriaNCCENoConformeTotal") = 13
    conteos("AuditoriaTareasPteReplanificarUsuario") = 1
    conteos("AuditoriaNCRegistradasUsuario") = 2
    conteos("AuditoriaNCAccionesSinTareasUsuario") = 3
    conteos("AuditoriaNCPteCEUsuario") = 4
    conteos("AuditoriaNCCECaducadaUsuario") = 5
    conteos("AuditoriaNCCENoConformeUsuario") = 6

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
                    "AUDITORIA", _
                    pError, _
                    Nothing, _
                    conteos)

    Call TestHelper.AssertTrue(pError = "", "Runtime Auditoria con conteos rapidos no debe fallar", logs, assertError)
    Call TestHelper.AssertTrue(CLng(resultados("AuditoriaTotal")) = 41, "AuditoriaTotal debe salir de conteos rapidos", logs, assertError)
    Call TestHelper.AssertTrue(CLng(resultados("AuditoriaUsuario")) = 21, "AuditoriaUsuario debe salir de conteos rapidos", logs, assertError)
    Call TestHelper.AssertTrue(Not resultados.Exists("ProyectoTotal"), "Runtime fast AUDITORIA no debe devolver ProyectoTotal", logs, assertError)

    If assertError <> "" Then
        Test_Indicadores_AuditoriaFastCounts_RuntimeUsaConteos_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Indicadores_AuditoriaFastCounts_RuntimeUsaConteos_Atomic = TestHelper.BuildJsonOk(logs, "runtime_auditoria_fast_counts_ok")
    End If
    Exit Function
errores:
    Test_Indicadores_AuditoriaFastCounts_RuntimeUsaConteos_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
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

Private Sub CacheMaterializado_Cleanup(ByRef p_Logs As Collection, ByRef p_AssertError As String)
    Dim pError As String
    Dim db As DAO.Database

    Set db = getdb(pError)
    If pError <> "" Or db Is Nothing Then
        TestHelper.AddLog p_Logs, "Cleanup materialized indicator cache blocked: no se pudo abrir backend sandbox"
        If p_AssertError = "" Then p_AssertError = "TESTS BLOCKED: no se pudo abrir backend sandbox para limpiar cache materializado"
        Exit Sub
    End If

    If Not CacheMaterializado_SchemaExiste(db, pError) Then
        TestHelper.AddLog p_Logs, "Cleanup materialized indicator cache blocked: " & pError
        If p_AssertError = "" Then p_AssertError = pError
        Exit Sub
    End If

    If Not Cache_Test_IndicadoresProyectoMaterializado_Limpiar(pError) Then
        TestHelper.AddLog p_Logs, "Cleanup materialized indicator cache failed: " & pError
        If p_AssertError = "" Then p_AssertError = pError
    Else
        TestHelper.AddLog p_Logs, "Cleanup materialized indicator cache OK"
    End If
End Sub

Private Sub CacheMaterializadoAuditoria_Cleanup(ByRef p_Logs As Collection, ByRef p_AssertError As String)
    Dim pError As String
    Dim db As DAO.Database

    Set db = getdb(pError)
    If pError <> "" Or db Is Nothing Then
        TestHelper.AddLog p_Logs, "Cleanup auditoria materialized indicator cache blocked: no se pudo abrir backend sandbox"
        If p_AssertError = "" Then p_AssertError = "TESTS BLOCKED: no se pudo abrir backend sandbox para limpiar cache materializado auditoria"
        Exit Sub
    End If

    If Not CacheMaterializado_SchemaExiste(db, pError) Then
        TestHelper.AddLog p_Logs, "Cleanup auditoria materialized indicator cache blocked: " & pError
        If p_AssertError = "" Then p_AssertError = pError
        Exit Sub
    End If

    If Not Cache_Test_IndicadoresAuditoriaMaterializado_Limpiar(pError) Then
        TestHelper.AddLog p_Logs, "Cleanup auditoria materialized indicator cache failed: " & pError
        If p_AssertError = "" Then p_AssertError = pError
    Else
        TestHelper.AddLog p_Logs, "Cleanup auditoria materialized indicator cache OK"
    End If
End Sub

Private Function CacheMaterializado_SchemaExiste(ByVal p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    On Error GoTo noSchema

    p_Error = ""
    p_Db.TableDefs.Refresh
    If Not CacheMaterializado_FieldReady(p_Db, "TbCacheIndicadoresProyectoHeader", "IDCacheIndicadorProyecto", dbLong, False, p_Error) Then Exit Function
    If Not CacheMaterializado_FieldReady(p_Db, "TbCacheIndicadoresProyectoHeader", "FechaSincronizacion", dbDate, True, p_Error) Then Exit Function
    If Not CacheMaterializado_FieldReady(p_Db, "TbCacheIndicadoresProyectoHeader", "UsuarioSincronizacion", dbText, False, p_Error) Then Exit Function
    If Not CacheMaterializado_FieldReady(p_Db, "TbCacheIndicadoresProyectoHeader", "Estado", dbText, False, p_Error) Then Exit Function

    If Not CacheMaterializado_FieldReady(p_Db, "TbCacheIndicadoresProyectoDetalle", "IDCacheIndicadorProyecto", dbLong, True, p_Error) Then Exit Function
    If Not CacheMaterializado_FieldReady(p_Db, "TbCacheIndicadoresProyectoDetalle", "Bucket", dbText, True, p_Error) Then Exit Function
    If Not CacheMaterializado_FieldReady(p_Db, "TbCacheIndicadoresProyectoDetalle", "TipoFila", dbText, True, p_Error) Then Exit Function
    If Not CacheMaterializado_FieldReady(p_Db, "TbCacheIndicadoresProyectoDetalle", "IDEntidad", dbLong, True, p_Error) Then Exit Function
    If Not CacheMaterializado_FieldReady(p_Db, "TbCacheIndicadoresProyectoDetalle", "ResponsableCalidad", dbText, False, p_Error) Then Exit Function
    If Not CacheMaterializado_FieldReady(p_Db, "TbCacheIndicadoresProyectoDetalle", "FechaSnapshot", dbDate, True, p_Error) Then Exit Function

    CacheMaterializado_SchemaExiste = True
    Exit Function

noSchema:
    p_Error = "TESTS BLOCKED: schema de cache materializado no inspeccionable: " & Err.Description
    CacheMaterializado_SchemaExiste = False
End Function

Private Function CacheMaterializado_FieldReady( _
                        ByVal p_Db As DAO.Database, _
                        ByVal p_TableName As String, _
                        ByVal p_FieldName As String, _
                        ByVal p_ExpectedType As Integer, _
                        ByVal p_Required As Boolean, _
                        ByRef p_Error As String _
                    ) As Boolean
    Dim tdf As DAO.TableDef
    Dim fld As DAO.Field
    Dim rs As DAO.Recordset
    On Error GoTo noSchema

    Set rs = p_Db.OpenRecordset("SELECT [" & p_FieldName & "] FROM [" & p_TableName & "] WHERE 1=0", dbOpenSnapshot)
    Set fld = rs.Fields(0)

    If fld.Type <> p_ExpectedType Then
        p_Error = "TESTS BLOCKED: tipo inesperado en " & p_TableName & "." & p_FieldName & " esperado=" & CStr(p_ExpectedType) & " real=" & CStr(fld.Type)
        GoTo salir
    End If

    CacheMaterializado_FieldReady = True

salir:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Exit Function

noSchema:
    p_Error = "TESTS BLOCKED: falta schema requerido " & p_TableName & "." & p_FieldName & " — " & Err.Description
    CacheMaterializado_FieldReady = False
    Resume salir
End Function

Private Function CacheMaterializado_RequireSchema(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection, ByRef p_AssertError As String) As Boolean
    Dim schemaError As String

    CacheMaterializado_RequireSchema = CacheMaterializado_SchemaExiste(p_Db, schemaError)
    If Not CacheMaterializado_RequireSchema Then
        TestHelper.AddLog p_Logs, schemaError
        If p_AssertError = "" Then p_AssertError = schemaError
    Else
        TestHelper.AddLog p_Logs, "Schema cache materializado OK: header/detalle backend inspeccionados"
    End If
End Function

Private Sub CacheMaterializado_InsertFixtureRow( _
                        ByVal p_Db As DAO.Database, _
                        ByVal p_Bucket As String, _
                        ByVal p_TipoFila As String, _
                        ByVal p_IDEntidad As Long, _
                        ByVal p_Responsable As String, _
                        Optional ByVal p_CacheId As Long = 1 _
                    )
    Dim rs As DAO.Recordset

    Set rs = p_Db.OpenRecordset("TbCacheIndicadoresProyectoDetalle", dbOpenDynaset)
    rs.AddNew
    rs!IDCacheIndicadorProyecto = p_CacheId
    rs!Bucket = p_Bucket
    rs!TipoFila = p_TipoFila
    rs!IDEntidad = p_IDEntidad
    rs!IDNoConformidad = p_IDEntidad
    rs!ResponsableCalidad = p_Responsable
    rs!FechaSnapshot = Now()
    rs.Update
    rs.Close
    Set rs = Nothing
End Sub

Private Sub CacheMaterializado_InsertHeader(ByVal p_Db As DAO.Database)
    CacheMaterializado_InsertHeaderEstado p_Db, "OK"
End Sub

Private Sub CacheMaterializado_InsertHeaderEstado(ByVal p_Db As DAO.Database, ByVal p_Estado As String, Optional ByVal p_CacheId As Long = 1)
    p_Db.Execute "DELETE FROM TbCacheIndicadoresProyectoHeader WHERE IDCacheIndicadorProyecto=" & CStr(p_CacheId), dbFailOnError
    p_Db.Execute "INSERT INTO TbCacheIndicadoresProyectoHeader (IDCacheIndicadorProyecto, FechaSincronizacion, UsuarioSincronizacion, Estado) VALUES (" & CStr(p_CacheId) & ", Now(), 'TEST', " & TestHelper.SqlText(p_Estado) & ")", dbFailOnError
End Sub

Private Function CacheMaterializado_TestUsuario(ByVal p_Nombre As String) As usuario
    Dim usr As New usuario

    usr.Nombre = p_Nombre
    Set CacheMaterializado_TestUsuario = usr
End Function

Private Function CacheMaterializado_CountRows(ByVal p_Db As DAO.Database, ByVal p_SQL As String) As Long
    Dim rs As DAO.Recordset

    Set rs = p_Db.OpenRecordset(p_SQL, dbOpenSnapshot)
    If Not rs.EOF Then CacheMaterializado_CountRows = CLng(Nz(rs.Fields("Total").Value, 0))
    rs.Close
    Set rs = Nothing
End Function

Private Function CacheMaterializado_RequireProyectoBusinessSchema(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection, ByRef p_AssertError As String) As Boolean
    Dim schemaError As String

    CacheMaterializado_RequireProyectoBusinessSchema = False
    If Not CacheMaterializado_FieldReady(p_Db, "TbExpedientes", "IDExpediente", dbLong, True, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbExpedientes", "Nemotecnico", dbText, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidades", "IDNoConformidad", dbLong, True, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidades", "CodigoNoConformidad", dbText, True, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidades", "EXPEDIENTE", dbText, True, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidades", "RESPONSABLETELEFONICA", dbText, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidades", "RESPONSABLECALIDAD", dbText, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidades", "IDExpediente", dbLong, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidades", "Nemotecnico", dbText, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidades", "ConformeControlEficacia", dbText, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidades", "FechaControlEficacia", dbDate, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidades", "FechaPrevistaControlEficacia", dbDate, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNCAccionCorrectivas", "IDAccionCorrectiva", dbLong, True, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNCAccionCorrectivas", "IDNoConformidad", dbLong, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNCAccionesRealizadas", "IDAccionRealizada", dbLong, True, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNCAccionesRealizadas", "IDAccionCorrectiva", dbLong, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbUsuariosAplicaciones", "CorreoUsuario", dbText, True, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbUsuariosAplicaciones", "UsuarioRed", dbText, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbUsuariosAplicaciones", "Nombre", dbText, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbUsuariosAplicaciones", "Id", dbInteger, True, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbTiposNCProyectos", "IDTipo", dbLong, True, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbTiposNCProyectos", "Tipologia", dbText, False, schemaError) Then GoTo blocked

    TestHelper.AddLog p_Logs, "Schema negocio Proyecto OK: Expedientes/NC/AC/AR/usuarios/tipos inspeccionados"
    CacheMaterializado_RequireProyectoBusinessSchema = True
    Exit Function

blocked:
    TestHelper.AddLog p_Logs, schemaError
    If p_AssertError = "" Then p_AssertError = schemaError
End Function

Private Sub CacheMaterializado_ProyectoBusinessCleanup(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection)
    On Error Resume Next
    p_Db.Execute "DELETE FROM TbNCAccionesRealizadas WHERE IDAccionRealizada IN (992021)", dbFailOnError
    p_Db.Execute "DELETE FROM TbNCAccionCorrectivas WHERE IDAccionCorrectiva IN (992011)", dbFailOnError
    p_Db.Execute "DELETE FROM TbNoConformidades WHERE IDNoConformidad IN (992001)", dbFailOnError
    p_Db.Execute "DELETE FROM TbExpedientes WHERE IDExpediente IN (992001)", dbFailOnError
    p_Db.Execute "DELETE FROM TbTiposNCProyectos WHERE IDTipo=992001", dbFailOnError
    p_Db.Execute "DELETE FROM TbUsuariosAplicaciones WHERE UsuarioRed='TEST_ISSUE18_USER' OR CorreoUsuario='TEST_ISSUE18_USER@local.test'", dbFailOnError
    TestHelper.AddLog p_Logs, "Teardown negocio Proyecto: filas TEST_ISSUE18 eliminadas en orden inverso FK"
    On Error GoTo 0
End Sub

Private Sub CacheMaterializado_SeedProyectoBusinessFixture(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection)
    Call CacheMaterializado_ProyectoBusinessCleanup(p_Db, p_Logs)

    p_Db.Execute "INSERT INTO TbTiposNCProyectos (IDTipo, Tipologia) VALUES (992001, 'TEST_ISSUE18_TIPO')", dbFailOnError
    p_Db.Execute "INSERT INTO TbUsuariosAplicaciones (CorreoUsuario, UsuarioRed, Nombre, Id, Activado) VALUES ('TEST_ISSUE18_USER@local.test', 'TEST_ISSUE18_USER', 'QA User', 32760, True)", dbFailOnError
    p_Db.Execute "INSERT INTO TbExpedientes (IDExpediente, Nemotecnico, Titulo) VALUES (992001, 'TEST-ISSUE18-NEMO', 'TEST ISSUE18 EXPEDIENTE')", dbFailOnError
    p_Db.Execute "INSERT INTO TbNoConformidades (IDNoConformidad, CodigoNoConformidad, EXPEDIENTE, DESCRIPCION, RESPONSABLETELEFONICA, RESPONSABLECALIDAD, IDExpediente, Nemotecnico, Borrado, RequiereControlEficacia, ResultadoControlEficacia, ConformeControlEficacia, FechaControlEficacia, FechaPrevistaControlEficacia, IDTipo, ESTADO) " & _
                 "VALUES (992001, 'TEST-ISSUE18-NC-992001', 'TEST-ISSUE18-EXP', 'Fixture incremental Proyecto Issue 18', 'TEST_ISSUE18_USER', 'QA User', 992001, 'TEST-ISSUE18-NEMO', False, 'Sí', 'No conforme', 'No', Date(), Date()-1, 992001, 'Abierta')", dbFailOnError
    p_Db.Execute "INSERT INTO TbNCAccionCorrectivas (IDAccionCorrectiva, IDNoConformidad, NAccion, AccionCorrectiva, FechaAccionCorrectiva, ESTADO, Responsable) VALUES (992011, 992001, 1, 'TEST ISSUE18 AC', Date(), 'Abierta', 'TEST_ISSUE18_USER')", dbFailOnError
    p_Db.Execute "INSERT INTO TbNCAccionesRealizadas (IDAccionRealizada, IDAccionCorrectiva, NAccion, AccionRealizada, FechaAccionRealizada, FechaInicio, FechaFinPrevista, FechaFinReal, ESTADO, Responsable) VALUES (992021, 992011, 1, 'TEST ISSUE18 AR cerrada', Date(), Date()-3, Date()-1, Date(), 'Cerrada', 'TEST_ISSUE18_USER')", dbFailOnError

    TestHelper.AddLog p_Logs, "Arrange negocio Proyecto: seeded NC=992001, AC=992011, AR=992021, usuario y tipo deterministicos"
End Sub

Private Function CacheMaterializado_RequireAuditoriaBusinessSchema(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection, ByRef p_AssertError As String) As Boolean
    Dim schemaError As String

    CacheMaterializado_RequireAuditoriaBusinessSchema = False
    If Not CacheMaterializado_FieldReady(p_Db, "TbAuditorias", "IDAuditoria", dbLong, True, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbAuditorias", "Tipo", dbText, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbAuditorias", "FechaInicio", dbDate, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidadesAuditoria", "ID", dbLong, True, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidadesAuditoria", "IDAuditoria", dbLong, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidadesAuditoria", "Numero", dbText, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidadesAuditoria", "DESCRIPCION", dbMemo, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidadesAuditoria", "CAUSARAIZ", dbMemo, True, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidadesAuditoria", "RESPONSABLEIMPLANTACION", dbText, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidadesAuditoria", "RequiereControlEficacia", dbText, True, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidadesAuditoria", "FechaControlEficacia", dbDate, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidadesAuditoria", "ResultadoControlEficacia", dbMemo, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidadesAuditoria", "ConformeControlEficacia", dbText, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidadesAuditoria", "RequiereAccionCorrectiva", dbText, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidadesAuditoria", "ESTADO", dbText, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNoConformidadesAuditoria", "Borrado", dbBoolean, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNCAuditoriaAccionCorrectivas", "IDAccionCorrectiva", dbLong, True, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNCAuditoriaAccionCorrectivas", "ID", dbLong, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNCAuditoriaAccionCorrectivas", "NAccion", dbLong, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNCAuditoriaAccionCorrectivas", "AccionCorrectiva", dbMemo, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNCAuditoriaAccionCorrectivas", "Responsable", dbText, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNCAuditoriaAccionesRealizadas", "IDAccionRealizada", dbLong, True, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNCAuditoriaAccionesRealizadas", "IDAccionCorrectiva", dbLong, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNCAuditoriaAccionesRealizadas", "NAccion", dbLong, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNCAuditoriaAccionesRealizadas", "AccionRealizada", dbMemo, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNCAuditoriaAccionesRealizadas", "FechaFinReal", dbDate, False, schemaError) Then GoTo blocked
    If Not CacheMaterializado_FieldReady(p_Db, "TbNCAuditoriaAccionesRealizadas", "Responsable", dbText, False, schemaError) Then GoTo blocked

    TestHelper.AddLog p_Logs, "Schema negocio Auditoria OK: Auditoria/NC/AC/AR inspeccionados con FKs Auditoria->NC->AC->AR"
    CacheMaterializado_RequireAuditoriaBusinessSchema = True
    Exit Function

blocked:
    TestHelper.AddLog p_Logs, schemaError
    If p_AssertError = "" Then p_AssertError = schemaError
End Function

Private Sub CacheMaterializado_AuditoriaBusinessCleanup(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection)
    On Error Resume Next
    p_Db.Execute "DELETE FROM TbNCAuditoriaAccionesRealizadas WHERE IDAccionRealizada IN (992221)", dbFailOnError
    p_Db.Execute "DELETE FROM TbNCAuditoriaAccionCorrectivas WHERE IDAccionCorrectiva IN (992211)", dbFailOnError
    p_Db.Execute "DELETE FROM TbNoConformidadesAuditoria WHERE ID IN (992201, 992202)", dbFailOnError
    p_Db.Execute "DELETE FROM TbAuditorias WHERE IDAuditoria IN (992201)", dbFailOnError
    TestHelper.AddLog p_Logs, "Teardown negocio Auditoria: filas TEST_ISSUE18_AUD eliminadas en orden inverso FK"
    On Error GoTo 0
End Sub

Private Sub CacheMaterializado_SeedAuditoriaBusinessFixture(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection)
    Call CacheMaterializado_AuditoriaBusinessCleanup(p_Db, p_Logs)

    p_Db.Execute "INSERT INTO TbAuditorias (IDAuditoria, Tipo, FechaInicio, FechaFin) VALUES (992201, 'TEST_ISSUE18_AUD', Date(), Date())", dbFailOnError
    p_Db.Execute "INSERT INTO TbNoConformidadesAuditoria (ID, IDAuditoria, FechaApertura, Numero, DESCRIPCION, CAUSARAIZ, RESPONSABLEIMPLANTACION, RequiereControlEficacia, FechaControlEficacia, FechaPrevistaControlEficacia, ResultadoControlEficacia, ConformeControlEficacia, RequiereAccionCorrectiva, Tipo, ESTADO, Borrado) " & _
                 "VALUES (992202, 992201, Date(), 'TEST-AUD-NC-992202', 'Fixture Auditoria Issue 18', 'Fixture root cause', 'QA User', 'Sí', Date(), Date()-1, 'No conforme', 'No', 'Sí', 'TEST_AUD', 'Abierta', False)", dbFailOnError
    p_Db.Execute "INSERT INTO TbNCAuditoriaAccionCorrectivas (IDAccionCorrectiva, ID, NAccion, AccionCorrectiva, FechaAccionCorrectiva, ESTADO, Responsable) VALUES (992211, 992202, 1, 'TEST ISSUE18 AUD AC', Date(), 'Abierta', 'QA User')", dbFailOnError
    p_Db.Execute "INSERT INTO TbNCAuditoriaAccionesRealizadas (IDAccionRealizada, IDAccionCorrectiva, NAccion, AccionRealizada, FechaAccionRealizada, FechaInicio, FechaFinPrevista, FechaFinReal, ESTADO, Responsable) VALUES (992221, 992211, 1, 'TEST ISSUE18 AUD AR cerrada', Date(), Date()-3, Date()-1, Date(), 'Cerrada', 'QA User')", dbFailOnError

    TestHelper.AddLog p_Logs, "Arrange negocio Auditoria: seeded Auditoria=992201, NC=992202, AC=992211, AR=992221 para CE no conforme"
End Sub

Public Function Test_CacheIndicadoresMaterializado_CountsDesdeDetalleCompartido_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim pError As String
    Dim errMsg As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean
    Dim db As DAO.Database
    Dim usr As usuario
    Dim conteos As Scripting.Dictionary
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_CacheIndicadoresMaterializado_CountsDesdeDetalleCompartido_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True
    Call CacheMaterializado_Cleanup(logs, assertError)
    If assertError <> "" Then GoTo finalizar

    Set db = getdb(pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange obtiene backend sandbox", logs, assertError)
    If pError <> "" Then GoTo finalizar
    If Not CacheMaterializado_RequireSchema(db, logs, assertError) Then
        GoTo finalizar
    End If
    Call CacheMaterializado_InsertHeader(db)
    Call CacheMaterializado_InsertFixtureRow(db, BUCKET_TAR_PROY_PTE_REPLAN, "TAREA", 990001, "QA User")
    Call CacheMaterializado_InsertFixtureRow(db, BUCKET_TAR_PROY_PTE_REPLAN, "TAREA", 990002, "Otro User")
    Call CacheMaterializado_InsertFixtureRow(db, BUCKET_NC_PROY_REGISTRADAS, "NC", 990003, "QA User")
    TestHelper.AddLog logs, "Arrange: seeded 3 shared backend detail rows"

    Set usr = CacheMaterializado_TestUsuario("QA User")
    Set conteos = Cache_IndicadoresProyectoMaterializado_CargarConteos(usr, pError)
    Call TestHelper.AssertTrue(pError = "", "Cargar conteos desde detalle materializado no debe fallar", logs, assertError)
    Call TestHelper.AssertTrue(Not conteos Is Nothing, "Debe devolver conteos derivados del detalle backend", logs, assertError)
    If Not conteos Is Nothing Then
        Call TestHelper.AssertTrue(CLng(conteos("ProyectoTareasPteReplanificarTotal")) = 2, "Total tarea pte replanificar debe contar todas las filas compartidas", logs, assertError)
        Call TestHelper.AssertTrue(CLng(conteos("ProyectoTareasPteReplanificarUsuario")) = 1, "Usuario debe filtrar por ResponsableCalidad", logs, assertError)
        Call TestHelper.AssertTrue(CLng(conteos("ProyectoNCRegistradasTotal")) = 1, "Total NC registradas debe derivar del bucket cacheado", logs, assertError)
        Call TestHelper.AssertTrue(CLng(conteos("ProyectoNCRegistradasUsuario")) = 1, "Usuario NC registradas debe derivar del bucket cacheado", logs, assertError)
    End If

finalizar:
    Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    If assertError <> "" Then
        Test_CacheIndicadoresMaterializado_CountsDesdeDetalleCompartido_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_CacheIndicadoresMaterializado_CountsDesdeDetalleCompartido_Atomic = TestHelper.BuildJsonOk(logs, "materialized_counts_ok")
    End If
    Exit Function
errores:
    errMsg = Err.Description
    On Error Resume Next
    If sessionStarted Then Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
    Test_CacheIndicadoresMaterializado_CountsDesdeDetalleCompartido_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
End Function

Public Function Test_CacheIndicadoresMaterializado_SyncLimpiaSnapshotAnterior_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim pError As String
    Dim errMsg As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean
    Dim db As DAO.Database
    Dim rowsBefore As Long
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_CacheIndicadoresMaterializado_SyncLimpiaSnapshotAnterior_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True
    Call CacheMaterializado_Cleanup(logs, assertError)
    If assertError <> "" Then GoTo finalizar

    Set db = getdb(pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange obtiene backend sandbox", logs, assertError)
    If pError <> "" Then GoTo finalizar
    If Not CacheMaterializado_RequireSchema(db, logs, assertError) Then
        GoTo finalizar
    End If
    Call CacheMaterializado_InsertHeader(db)
    Call CacheMaterializado_InsertFixtureRow(db, BUCKET_NC_PROY_REGISTRADAS, "NC", 990010, "QA User")
    rowsBefore = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=1")
    Call TestHelper.AssertTrue(rowsBefore = 1, "Precondicion: existe una fila fixture de cache materializado", logs, assertError)

    Call TestHelper.AssertTrue(Cache_Test_IndicadoresProyectoMaterializado_Limpiar(pError), "Act: limpieza controlada elimina snapshot compartido", logs, assertError)
    Call TestHelper.AssertTrue(pError = "", "Limpieza de snapshot no debe fallar", logs, assertError)
    rowsBefore = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=1")
    Call TestHelper.AssertTrue(rowsBefore = 0, "Assert: snapshot compartido queda vacío sin semántica CacheValida", logs, assertError)

finalizar:
    Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    If assertError <> "" Then
        Test_CacheIndicadoresMaterializado_SyncLimpiaSnapshotAnterior_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_CacheIndicadoresMaterializado_SyncLimpiaSnapshotAnterior_Atomic = TestHelper.BuildJsonOk(logs, "materialized_cleanup_ok")
    End If
    Exit Function
errores:
    errMsg = Err.Description
    On Error Resume Next
    If sessionStarted Then Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
    Test_CacheIndicadoresMaterializado_SyncLimpiaSnapshotAnterior_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
End Function

Public Function Test_CacheIndicadoresMaterializado_SinHeaderFalla_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim pError As String
    Dim errMsg As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean
    Dim db As DAO.Database
    Dim usr As usuario
    Dim conteos As Scripting.Dictionary
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_CacheIndicadoresMaterializado_SinHeaderFalla_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True
    Call CacheMaterializado_Cleanup(logs, assertError)
    If assertError <> "" Then GoTo finalizar

    Set db = getdb(pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange obtiene backend sandbox", logs, assertError)
    If pError <> "" Then GoTo finalizar
    If Not CacheMaterializado_RequireSchema(db, logs, assertError) Then GoTo finalizar
    Call CacheMaterializado_InsertFixtureRow(db, BUCKET_NC_PROY_REGISTRADAS, "NC", 990020, "QA User")
    TestHelper.AddLog logs, "Arrange: detalle fixture sin cabecera de cache"

    Set usr = CacheMaterializado_TestUsuario("QA User")
    Set conteos = Cache_IndicadoresProyectoMaterializado_CargarConteos(usr, pError)
    Call TestHelper.AssertTrue(pError <> "", "Debe fallar si falta cabecera de snapshot", logs, assertError)
    Call TestHelper.AssertTrue(conteos Is Nothing, "No debe devolver conteos cuando falta cabecera", logs, assertError)

finalizar:
    Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    If assertError <> "" Then
        Test_CacheIndicadoresMaterializado_SinHeaderFalla_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_CacheIndicadoresMaterializado_SinHeaderFalla_Atomic = TestHelper.BuildJsonOk(logs, "materialized_missing_header_fails")
    End If
    Exit Function
errores:
    errMsg = Err.Description
    On Error Resume Next
    If sessionStarted Then Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
    Test_CacheIndicadoresMaterializado_SinHeaderFalla_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
End Function

Public Function Test_Issue36_PintarIndicadoresProyecto_SinHeaderInicializaSinError_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim pError As String
    Dim errMsg As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean
    Dim db As DAO.Database
    Dim previousUser As usuario
    Dim previousEntorno As Entorno
    Dim headerBefore As Long
    Dim headerOKAfter As Long
    Dim rowsAfter As Long
    Dim poisonRowsAfter As Long
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_Issue36_PintarIndicadoresProyecto_SinHeaderInicializaSinError_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True
    Call CacheMaterializado_Cleanup(logs, assertError)
    If assertError <> "" Then GoTo finalizar

    Set db = getdb(pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange obtiene backend sandbox", logs, assertError)
    If pError <> "" Then GoTo finalizar
    If Not CacheMaterializado_RequireSchema(db, logs, assertError) Then GoTo finalizar
    If Not CacheMaterializado_RequireProyectoBusinessSchema(db, logs, assertError) Then GoTo finalizar

    Call CacheMaterializado_SeedProyectoBusinessFixture(db, logs)
    Call CacheMaterializado_InsertFixtureRow(db, BUCKET_NC_PROY_REGISTRADAS, "NC", 993601, "QA User")
    headerBefore = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoHeader WHERE IDCacheIndicadorProyecto=1")
    Call TestHelper.AssertTrue(headerBefore = 0, "Precondicion Issue36: detalle poison sin cabecera, cache materializado no puede ser HIT", logs, assertError)
    If assertError <> "" Then GoTo finalizar

    Set previousUser = m_ObjUsuarioConectado
    Set previousEntorno = m_ObjEntorno
    If m_ObjEntorno Is Nothing Then
        Set m_ObjEntorno = New Entorno
        TestHelper.AddLog logs, "Arrange Issue36: Entorno inicializado para PintarIndicadores"
    End If
    Set m_ObjUsuarioConectado = CacheMaterializado_TestUsuario("QA User")
    pError = ""
    Call PintarIndicadores(p_Reiniciando:=EnumSino.Sí, p_Modo:="PROYECTO", p_Error:=pError)
    TestHelper.AddLog logs, "Act Issue36: PintarIndicadores manual PROYECTO devuelve pError='" & pError & "'"

    headerOKAfter = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoHeader WHERE IDCacheIndicadorProyecto=1 AND Estado='OK'")
    rowsAfter = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=1")
    poisonRowsAfter = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=1 AND IDEntidad=993601")
    Call TestHelper.AssertTrue(pError = "", "PintarIndicadores manual no debe fallar por cabecera ausente al refrescar Proyecto", logs, assertError)
    Call TestHelper.AssertTrue(headerOKAfter = 1, "Debe inicializar una cabecera OK unica tras MISS inicial", logs, assertError)
    Call TestHelper.AssertTrue(rowsAfter > 0, "Debe materializar detalle desde fixture negocio controlada", logs, assertError)
    Call TestHelper.AssertTrue(poisonRowsAfter = 0, "No debe tratar el detalle poison sin cabecera como HIT reutilizable", logs, assertError)

finalizar:
    Set m_ObjUsuarioConectado = previousUser
    Set m_ObjEntorno = previousEntorno
    If Not db Is Nothing Then Call CacheMaterializado_ProyectoBusinessCleanup(db, logs)
    Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    If assertError <> "" Then
        Test_Issue36_PintarIndicadoresProyecto_SinHeaderInicializaSinError_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Issue36_PintarIndicadoresProyecto_SinHeaderInicializaSinError_Atomic = TestHelper.BuildJsonOk(logs, "issue36_pintar_proyecto_sync_ok")
    End If
    Exit Function
errores:
    errMsg = Err.Description
    On Error Resume Next
    Set m_ObjUsuarioConectado = previousUser
    Set m_ObjEntorno = previousEntorno
    If Not db Is Nothing Then Call CacheMaterializado_ProyectoBusinessCleanup(db, logs)
    If sessionStarted Then Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
    Test_Issue36_PintarIndicadoresProyecto_SinHeaderInicializaSinError_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
End Function

Public Function Test_Issue37_PintarIndicadoresAuditoria_SinHeaderInicializaSinError_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim pError As String
    Dim errMsg As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean
    Dim db As DAO.Database
    Dim previousUser As usuario
    Dim previousEntorno As Entorno
    Dim headerBefore As Long
    Dim headerOKAfter As Long
    Dim rowsAfter As Long
    Dim poisonRowsAfter As Long
    Dim targetAuditRows As Long
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_Issue37_PintarIndicadoresAuditoria_SinHeaderInicializaSinError_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True
    Call CacheMaterializado_Cleanup(logs, assertError)
    Call CacheMaterializadoAuditoria_Cleanup(logs, assertError)
    If assertError <> "" Then GoTo finalizar

    Set db = getdb(pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange obtiene backend sandbox", logs, assertError)
    If pError <> "" Then GoTo finalizar
    If Not CacheMaterializado_RequireSchema(db, logs, assertError) Then GoTo finalizar
    If Not CacheMaterializado_RequireAuditoriaBusinessSchema(db, logs, assertError) Then GoTo finalizar

    Call CacheMaterializado_SeedAuditoriaBusinessFixture(db, logs)
    Call CacheMaterializado_InsertFixtureRow(db, BUCKET_NC_AUD_REGISTRADAS, "NC", 993701, "QA User", 2)
    headerBefore = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoHeader WHERE IDCacheIndicadorProyecto=2")
    Call TestHelper.AssertTrue(headerBefore = 0, "Precondicion Issue37: detalle poison Auditoria sin cabecera, cache materializado no puede ser HIT", logs, assertError)
    If assertError <> "" Then GoTo finalizar

    Set previousUser = m_ObjUsuarioConectado
    Set previousEntorno = m_ObjEntorno
    If m_ObjEntorno Is Nothing Then
        Set m_ObjEntorno = New Entorno
        TestHelper.AddLog logs, "Arrange Issue37: Entorno inicializado para PintarIndicadores"
    End If
    Set m_ObjUsuarioConectado = CacheMaterializado_TestUsuario("QA User")
    pError = ""
    Call PintarIndicadores(p_Reiniciando:=EnumSino.Sí, p_Modo:="AUDITORIA", p_Error:=pError)
    TestHelper.AddLog logs, "Act Issue37: PintarIndicadores manual AUDITORIA devuelve pError='" & pError & "'"

    headerOKAfter = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoHeader WHERE IDCacheIndicadorProyecto=2 AND Estado='OK'")
    rowsAfter = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=2")
    poisonRowsAfter = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=2 AND IDEntidad=993701")
    targetAuditRows = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=2 AND IDNoConformidad=992202")
    Call TestHelper.AssertTrue(pError = "", "PintarIndicadores manual no debe fallar por cabecera ausente al refrescar Auditoria", logs, assertError)
    Call TestHelper.AssertTrue(headerOKAfter = 1, "Debe inicializar una cabecera Auditoria OK unica tras MISS inicial", logs, assertError)
    Call TestHelper.AssertTrue(rowsAfter > 0, "Debe materializar detalle Auditoria desde fixture negocio controlada", logs, assertError)
    Call TestHelper.AssertTrue(poisonRowsAfter = 0, "No debe tratar el detalle poison Auditoria sin cabecera como HIT reutilizable", logs, assertError)
    Call TestHelper.AssertTrue(targetAuditRows = 1, "Debe materializar la NC Auditoria fixture con ID distinto de IDAuditoria", logs, assertError)

finalizar:
    Set m_ObjUsuarioConectado = previousUser
    Set m_ObjEntorno = previousEntorno
    If Not db Is Nothing Then Call CacheMaterializado_AuditoriaBusinessCleanup(db, logs)
    Call CacheMaterializadoAuditoria_Cleanup(logs, assertError)
    Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    If assertError <> "" Then
        Test_Issue37_PintarIndicadoresAuditoria_SinHeaderInicializaSinError_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Issue37_PintarIndicadoresAuditoria_SinHeaderInicializaSinError_Atomic = TestHelper.BuildJsonOk(logs, "issue37_pintar_auditoria_sync_ok")
    End If
    Exit Function
errores:
    errMsg = Err.Description
    On Error Resume Next
    Set m_ObjUsuarioConectado = previousUser
    Set m_ObjEntorno = previousEntorno
    If Not db Is Nothing Then Call CacheMaterializado_AuditoriaBusinessCleanup(db, logs)
    If sessionStarted Then Call CacheMaterializadoAuditoria_Cleanup(logs, assertError)
    If sessionStarted Then Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
    Test_Issue37_PintarIndicadoresAuditoria_SinHeaderInicializaSinError_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
End Function

Public Function Test_CacheIndicadoresMaterializado_EstadoNoOKConDetalleFalla_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim pError As String
    Dim errMsg As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean
    Dim db As DAO.Database
    Dim usr As usuario
    Dim conteos As Scripting.Dictionary
    Dim estado As Variant
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_CacheIndicadoresMaterializado_EstadoNoOKConDetalleFalla_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True
    Call CacheMaterializado_Cleanup(logs, assertError)
    If assertError <> "" Then GoTo finalizar

    Set db = getdb(pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange obtiene backend sandbox", logs, assertError)
    If pError <> "" Then GoTo finalizar
    If Not CacheMaterializado_RequireSchema(db, logs, assertError) Then GoTo finalizar
    Set usr = CacheMaterializado_TestUsuario("QA User")

    For Each estado In Array("ERROR", "SYNCING")
        Call CacheMaterializado_Cleanup(logs, assertError)
        If assertError <> "" Then GoTo finalizar
        Call CacheMaterializado_InsertHeaderEstado(db, CStr(estado))
        Call CacheMaterializado_InsertFixtureRow(db, BUCKET_NC_PROY_REGISTRADAS, "NC", 990030, "QA User")
        TestHelper.AddLog logs, "Arrange: cabecera " & CStr(estado) & " con detalle fixture"

        pError = ""
        Set conteos = Cache_IndicadoresProyectoMaterializado_CargarConteos(usr, pError)
        Call TestHelper.AssertTrue(pError <> "", "Debe fallar con Estado=" & CStr(estado), logs, assertError)
        Call TestHelper.AssertTrue(conteos Is Nothing, "No debe contar detalle si Estado=" & CStr(estado), logs, assertError)
        If assertError <> "" Then GoTo finalizar
    Next estado

finalizar:
    Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    If assertError <> "" Then
        Test_CacheIndicadoresMaterializado_EstadoNoOKConDetalleFalla_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_CacheIndicadoresMaterializado_EstadoNoOKConDetalleFalla_Atomic = TestHelper.BuildJsonOk(logs, "materialized_non_ok_state_fails")
    End If
    Exit Function
errores:
    errMsg = Err.Description
    On Error Resume Next
    If sessionStarted Then Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
    Test_CacheIndicadoresMaterializado_EstadoNoOKConDetalleFalla_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
End Function

Public Function Test_CacheIndicadoresMaterializado_HeaderOKSinDetalleFalla_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim pError As String
    Dim errMsg As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean
    Dim db As DAO.Database
    Dim usr As usuario
    Dim conteos As Scripting.Dictionary
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_CacheIndicadoresMaterializado_HeaderOKSinDetalleFalla_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True
    Call CacheMaterializado_Cleanup(logs, assertError)
    If assertError <> "" Then GoTo finalizar

    Set db = getdb(pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange obtiene backend sandbox", logs, assertError)
    If pError <> "" Then GoTo finalizar
    If Not CacheMaterializado_RequireSchema(db, logs, assertError) Then GoTo finalizar
    Call CacheMaterializado_InsertHeaderEstado(db, "OK")
    TestHelper.AddLog logs, "Arrange: cabecera OK sin filas detalle"

    Set usr = CacheMaterializado_TestUsuario("QA User")
    Set conteos = Cache_IndicadoresProyectoMaterializado_CargarConteos(usr, pError)
    Call TestHelper.AssertTrue(pError <> "", "Debe fallar con cabecera OK sin detalle", logs, assertError)
    Call TestHelper.AssertTrue(conteos Is Nothing, "No debe devolver conteos para snapshot vacío ambiguo", logs, assertError)

finalizar:
    Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    If assertError <> "" Then
        Test_CacheIndicadoresMaterializado_HeaderOKSinDetalleFalla_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_CacheIndicadoresMaterializado_HeaderOKSinDetalleFalla_Atomic = TestHelper.BuildJsonOk(logs, "materialized_empty_snapshot_fails")
    End If
    Exit Function
errores:
    errMsg = Err.Description
    On Error Resume Next
    If sessionStarted Then Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
    Test_CacheIndicadoresMaterializado_HeaderOKSinDetalleFalla_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
End Function

Public Function Test_CacheIndicadoresAuditoriaMaterializado_CountsDesdeDetalleCompartido_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim pError As String
    Dim errMsg As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean
    Dim db As DAO.Database
    Dim usr As usuario
    Dim conteos As Scripting.Dictionary
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_CacheIndicadoresAuditoriaMaterializado_CountsDesdeDetalleCompartido_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True
    Call CacheMaterializado_Cleanup(logs, assertError)
    Call CacheMaterializadoAuditoria_Cleanup(logs, assertError)
    If assertError <> "" Then GoTo finalizar

    Set db = getdb(pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange obtiene backend sandbox", logs, assertError)
    If pError <> "" Then GoTo finalizar
    If Not CacheMaterializado_RequireSchema(db, logs, assertError) Then GoTo finalizar
    Call CacheMaterializado_InsertHeaderEstado(db, "OK", 2)
    Call CacheMaterializado_InsertFixtureRow(db, BUCKET_TAR_AUD_PTE_REPLAN, "TAREA", 991001, "QA User", 2)
    Call CacheMaterializado_InsertFixtureRow(db, BUCKET_TAR_AUD_PTE_REPLAN, "TAREA", 991002, "Otro User", 2)
    Call CacheMaterializado_InsertFixtureRow(db, BUCKET_NC_AUD_REGISTRADAS, "NC", 991003, "QA User", 2)
    Call CacheMaterializado_InsertFixtureRow(db, BUCKET_NC_AUD_SIN_TAREAS, "NC", 991004, "Otro User", 2)
    TestHelper.AddLog logs, "Arrange: seeded 4 auditoria backend detail rows bajo IDCache=2"

    Set usr = CacheMaterializado_TestUsuario("QA User")
    Set conteos = Cache_IndicadoresAuditoriaMaterializado_CargarConteos(usr, pError)
    Call TestHelper.AssertTrue(pError = "", "Cargar conteos auditoria desde detalle materializado no debe fallar", logs, assertError)
    Call TestHelper.AssertTrue(Not conteos Is Nothing, "Debe devolver conteos auditoria derivados del detalle backend", logs, assertError)
    If Not conteos Is Nothing Then
        Call TestHelper.AssertTrue(CLng(conteos("AuditoriaTareasPteReplanificarTotal")) = 2, "Total tarea auditoria pte replanificar debe contar todas las filas IDCache=2", logs, assertError)
        Call TestHelper.AssertTrue(CLng(conteos("AuditoriaTareasPteReplanificarUsuario")) = 1, "Usuario auditoria debe filtrar por ResponsableCalidad", logs, assertError)
        Call TestHelper.AssertTrue(CLng(conteos("AuditoriaNCRegistradasTotal")) = 1, "Total NC auditoria registradas debe derivar del bucket cacheado", logs, assertError)
        Call TestHelper.AssertTrue(CLng(conteos("AuditoriaNCRegistradasUsuario")) = 1, "Usuario NC auditoria registradas debe derivar del bucket cacheado", logs, assertError)
        Call TestHelper.AssertTrue(CLng(conteos("AuditoriaNCAccionesSinTareasTotal")) = 1, "Total NC auditoria sin tareas debe derivar del bucket cacheado", logs, assertError)
        Call TestHelper.AssertTrue(CLng(conteos("AuditoriaNCAccionesSinTareasUsuario")) = 0, "Usuario NC auditoria sin tareas debe respetar filtro", logs, assertError)
    End If

finalizar:
    Call CacheMaterializadoAuditoria_Cleanup(logs, assertError)
    Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    If assertError <> "" Then
        Test_CacheIndicadoresAuditoriaMaterializado_CountsDesdeDetalleCompartido_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_CacheIndicadoresAuditoriaMaterializado_CountsDesdeDetalleCompartido_Atomic = TestHelper.BuildJsonOk(logs, "auditoria_materialized_counts_ok")
    End If
    Exit Function
errores:
    errMsg = Err.Description
    On Error Resume Next
    If sessionStarted Then Call CacheMaterializadoAuditoria_Cleanup(logs, assertError)
    If sessionStarted Then Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
    Test_CacheIndicadoresAuditoriaMaterializado_CountsDesdeDetalleCompartido_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
End Function

Public Function Test_CacheIndicadoresAuditoriaMaterializado_EstadoNoOKConDetalleFalla_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim pError As String
    Dim errMsg As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean
    Dim db As DAO.Database
    Dim usr As usuario
    Dim conteos As Scripting.Dictionary
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_CacheIndicadoresAuditoriaMaterializado_EstadoNoOKConDetalleFalla_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True
    Call CacheMaterializadoAuditoria_Cleanup(logs, assertError)
    If assertError <> "" Then GoTo finalizar

    Set db = getdb(pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange obtiene backend sandbox", logs, assertError)
    If pError <> "" Then GoTo finalizar
    If Not CacheMaterializado_RequireSchema(db, logs, assertError) Then GoTo finalizar
    Call CacheMaterializado_InsertHeaderEstado(db, "ERROR", 2)
    Call CacheMaterializado_InsertFixtureRow(db, BUCKET_NC_AUD_REGISTRADAS, "NC", 991020, "QA User", 2)
    TestHelper.AddLog logs, "Arrange: cabecera auditoria ERROR con detalle fixture"

    Set usr = CacheMaterializado_TestUsuario("QA User")
    Set conteos = Cache_IndicadoresAuditoriaMaterializado_CargarConteos(usr, pError)
    Call TestHelper.AssertTrue(pError <> "", "Debe fallar si Auditoria tiene Estado=ERROR", logs, assertError)
    Call TestHelper.AssertTrue(conteos Is Nothing, "No debe devolver conteos auditoria si Estado=ERROR", logs, assertError)

finalizar:
    Call CacheMaterializadoAuditoria_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    If assertError <> "" Then
        Test_CacheIndicadoresAuditoriaMaterializado_EstadoNoOKConDetalleFalla_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_CacheIndicadoresAuditoriaMaterializado_EstadoNoOKConDetalleFalla_Atomic = TestHelper.BuildJsonOk(logs, "auditoria_materialized_non_ok_state_fails")
    End If
    Exit Function
errores:
    errMsg = Err.Description
    On Error Resume Next
    If sessionStarted Then Call CacheMaterializadoAuditoria_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
    Test_CacheIndicadoresAuditoriaMaterializado_EstadoNoOKConDetalleFalla_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
End Function

Public Function Test_CacheIndicadoresAuditoriaMaterializado_SincronizarDesdeNegocio_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim pError As String
    Dim errMsg As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean
    Dim db As DAO.Database
    Dim syncOk As Boolean
    Dim projectRowsBefore As Long
    Dim projectRowsAfter As Long
    Dim auditHeaderOK As Long
    Dim auditRows As Long
    Dim targetAuditRows As Long
    Dim ceNoConformeRows As Long
    Dim registradasRows As Long
    Dim sinTareasRows As Long
    Dim pteCERows As Long
    Dim ceCaducadaRows As Long
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_CacheIndicadoresAuditoriaMaterializado_SincronizarDesdeNegocio_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True
    Call CacheMaterializado_Cleanup(logs, assertError)
    Call CacheMaterializadoAuditoria_Cleanup(logs, assertError)
    If assertError <> "" Then GoTo finalizar

    Set db = getdb(pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange obtiene backend sandbox", logs, assertError)
    If pError <> "" Then GoTo finalizar
    If Not CacheMaterializado_RequireSchema(db, logs, assertError) Then GoTo finalizar
    If Not CacheMaterializado_RequireAuditoriaBusinessSchema(db, logs, assertError) Then GoTo finalizar

    Call CacheMaterializado_SeedAuditoriaBusinessFixture(db, logs)
    Call CacheMaterializado_InsertHeaderEstado(db, "OK", 1)
    Call CacheMaterializado_InsertFixtureRow(db, BUCKET_NC_PROY_REGISTRADAS, "NC", 992301, "QA User", 1)
    projectRowsBefore = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=1")
    Call TestHelper.AssertTrue(projectRowsBefore = 1, "Precondicion: scope Proyecto tiene una fila control", logs, assertError)
    If assertError <> "" Then GoTo finalizar

    syncOk = Cache_IndicadoresAuditoriaMaterializado_Sincronizar(pError)
    TestHelper.AddLog logs, "Act: sync full Auditoria devuelve " & CStr(syncOk) & "; pError=" & pError
    Call TestHelper.AssertTrue(syncOk, "Act: productor Auditoria debe finalizar OK con fixture negocio legal", logs, assertError)
    Call TestHelper.AssertTrue(pError = "", "Act: productor Auditoria no debe reportar pError", logs, assertError)

    auditHeaderOK = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoHeader WHERE IDCacheIndicadorProyecto=2 AND Estado='OK'")
    auditRows = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=2")
    targetAuditRows = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=2 AND IDNoConformidad=992202")
    ceNoConformeRows = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=2 AND IDNoConformidad=992202 AND Bucket='" & BUCKET_NC_AUD_CE_NO_CONFORME & "'")
    registradasRows = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=2 AND IDNoConformidad=992202 AND Bucket='" & BUCKET_NC_AUD_REGISTRADAS & "'")
    sinTareasRows = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=2 AND IDNoConformidad=992202 AND Bucket='" & BUCKET_NC_AUD_SIN_TAREAS & "'")
    pteCERows = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=2 AND IDNoConformidad=992202 AND Bucket='" & BUCKET_NC_AUD_PTE_CE & "'")
    ceCaducadaRows = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=2 AND IDNoConformidad=992202 AND Bucket='" & BUCKET_NC_AUD_CE_CADUCADA & "'")
    projectRowsAfter = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=1")
    TestHelper.AddLog logs, "Assert diagnostics Auditoria: auditRows=" & CStr(auditRows) & "; targetAuditRows=" & CStr(targetAuditRows) & "; CE_NO_CONF=" & CStr(ceNoConformeRows) & "; REG=" & CStr(registradasRows) & "; SIN_TAREAS=" & CStr(sinTareasRows) & "; PTE_CE=" & CStr(pteCERows) & "; CE_CAD=" & CStr(ceCaducadaRows)
    Call TestHelper.AssertTrue(auditHeaderOK = 1, "Assert: cabecera Auditoria queda unica y OK", logs, assertError)
    Call TestHelper.AssertTrue(targetAuditRows = 1, "Assert: snapshot Auditoria contiene exactamente la fila esperada para la NC fixture", logs, assertError)
    Call TestHelper.AssertTrue(ceNoConformeRows = 1, "Assert: CE no conforme Auditoria se materializa desde negocio", logs, assertError)
    Call TestHelper.AssertTrue(registradasRows = 0, "Assert: NC Auditoria con AC no queda en registradas", logs, assertError)
    Call TestHelper.AssertTrue(sinTareasRows = 0, "Assert: NC Auditoria con AR no queda en acciones sin tareas", logs, assertError)
    Call TestHelper.AssertTrue(pteCERows = 0, "Assert: CE ya resuelto no queda pendiente", logs, assertError)
    Call TestHelper.AssertTrue(ceCaducadaRows = 0, "Assert: CE con fecha realizada no queda caducada", logs, assertError)
    Call TestHelper.AssertTrue(projectRowsAfter = projectRowsBefore, "Assert: sync Auditoria no toca detalle scope Proyecto", logs, assertError)

finalizar:
    If Not db Is Nothing Then Call CacheMaterializado_AuditoriaBusinessCleanup(db, logs)
    Call CacheMaterializadoAuditoria_Cleanup(logs, assertError)
    Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    If assertError <> "" Then
        Test_CacheIndicadoresAuditoriaMaterializado_SincronizarDesdeNegocio_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_CacheIndicadoresAuditoriaMaterializado_SincronizarDesdeNegocio_Atomic = TestHelper.BuildJsonOk(logs, "auditoria_materialized_sync_business_ok")
    End If
    Exit Function
errores:
    errMsg = Err.Description
    On Error Resume Next
    If Not db Is Nothing Then Call CacheMaterializado_AuditoriaBusinessCleanup(db, logs)
    If sessionStarted Then Call CacheMaterializadoAuditoria_Cleanup(logs, assertError)
    If sessionStarted Then Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
    Test_CacheIndicadoresAuditoriaMaterializado_SincronizarDesdeNegocio_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
End Function

Public Function Test_CacheIndicadoresMaterializado_SeparaProyectoYAuditoria_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim pError As String
    Dim errMsg As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean
    Dim db As DAO.Database
    Dim usr As usuario
    Dim conteosProyecto As Scripting.Dictionary
    Dim conteosAuditoria As Scripting.Dictionary
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_CacheIndicadoresMaterializado_SeparaProyectoYAuditoria_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True
    Call CacheMaterializado_Cleanup(logs, assertError)
    Call CacheMaterializadoAuditoria_Cleanup(logs, assertError)
    If assertError <> "" Then GoTo finalizar

    Set db = getdb(pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange obtiene backend sandbox", logs, assertError)
    If pError <> "" Then GoTo finalizar
    If Not CacheMaterializado_RequireSchema(db, logs, assertError) Then GoTo finalizar
    Call CacheMaterializado_InsertHeaderEstado(db, "OK", 1)
    Call CacheMaterializado_InsertHeaderEstado(db, "OK", 2)
    Call CacheMaterializado_InsertFixtureRow(db, BUCKET_TAR_PROY_PTE_REPLAN, "TAREA", 991101, "QA User", 1)
    Call CacheMaterializado_InsertFixtureRow(db, BUCKET_TAR_AUD_PTE_REPLAN, "TAREA", 991102, "QA User", 2)
    Call CacheMaterializado_InsertFixtureRow(db, BUCKET_TAR_AUD_PTE_REPLAN, "TAREA", 991103, "QA User", 1)
    Call CacheMaterializado_InsertFixtureRow(db, BUCKET_TAR_PROY_PTE_REPLAN, "TAREA", 991104, "QA User", 2)
    TestHelper.AddLog logs, "Arrange: seeded filas cruzadas para probar separacion por IDCache y bucket"

    Set usr = CacheMaterializado_TestUsuario("QA User")
    Set conteosProyecto = Cache_IndicadoresProyectoMaterializado_CargarConteos(usr, pError)
    Call TestHelper.AssertTrue(pError = "", "Proyecto materializado no debe fallar", logs, assertError)
    pError = ""
    Set conteosAuditoria = Cache_IndicadoresAuditoriaMaterializado_CargarConteos(usr, pError)
    Call TestHelper.AssertTrue(pError = "", "Auditoria materializado no debe fallar", logs, assertError)
    If Not conteosProyecto Is Nothing Then
        Call TestHelper.AssertTrue(CLng(conteosProyecto("ProyectoTareasPteReplanificarTotal")) = 1, "Proyecto no debe contar fila AUD ni fila IDCache=2", logs, assertError)
    End If
    If Not conteosAuditoria Is Nothing Then
        Call TestHelper.AssertTrue(CLng(conteosAuditoria("AuditoriaTareasPteReplanificarTotal")) = 1, "Auditoria no debe contar fila PROY ni fila IDCache=1", logs, assertError)
    End If

finalizar:
    Call CacheMaterializadoAuditoria_Cleanup(logs, assertError)
    Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    If assertError <> "" Then
        Test_CacheIndicadoresMaterializado_SeparaProyectoYAuditoria_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_CacheIndicadoresMaterializado_SeparaProyectoYAuditoria_Atomic = TestHelper.BuildJsonOk(logs, "materialized_scope_separation_ok")
    End If
    Exit Function
errores:
    errMsg = Err.Description
    On Error Resume Next
    If sessionStarted Then Call CacheMaterializadoAuditoria_Cleanup(logs, assertError)
    If sessionStarted Then Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
    Test_CacheIndicadoresMaterializado_SeparaProyectoYAuditoria_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
End Function

Public Function Test_CacheIndicadoresMaterializado_IncrementalNC_AcotaMutacion_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim pError As String
    Dim errMsg As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean
    Dim db As DAO.Database
    Dim syncOk As Boolean
    Dim targetBefore As Long
    Dim otherBefore As Long
    Dim targetAfter As Long
    Dim otherAfter As Long
    Dim headerCount As Long
    Dim targetPteReplanAfter As Long
    Dim targetRegistradasAfter As Long
    Dim targetSinTareasAfter As Long
    Dim targetPteCEAfter As Long
    Dim targetIrregularAfter As Long
    Dim targetCECaducadaAfter As Long
    Dim targetCENoConformeAfter As Long
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_CacheIndicadoresMaterializado_IncrementalNC_AcotaMutacion_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True
    Call CacheMaterializado_Cleanup(logs, assertError)
    If assertError <> "" Then GoTo finalizar

    Set db = getdb(pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange obtiene backend sandbox", logs, assertError)
    If pError <> "" Then GoTo finalizar
    If Not CacheMaterializado_RequireSchema(db, logs, assertError) Then GoTo finalizar
    If Not CacheMaterializado_RequireProyectoBusinessSchema(db, logs, assertError) Then GoTo finalizar
    Call CacheMaterializado_SeedProyectoBusinessFixture(db, logs)
    Call CacheMaterializado_InsertHeaderEstado(db, "OK", 1)
    Call CacheMaterializado_InsertFixtureRow(db, BUCKET_NC_PROY_REGISTRADAS, "NC", 992001, "QA User", 1)
    Call CacheMaterializado_InsertFixtureRow(db, BUCKET_NC_PROY_PTE_CE, "NC", 992001, "QA User", 1)
    Call CacheMaterializado_InsertFixtureRow(db, BUCKET_NC_PROY_REGISTRADAS, "NC", 992002, "Otro User", 1)
    TestHelper.AddLog logs, "Arrange: seeded cache stale target NC=992001 y control NC=992002"

    targetBefore = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=1 AND IDNoConformidad=992001")
    otherBefore = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=1 AND IDNoConformidad=992002")
    Call TestHelper.AssertTrue(targetBefore = 2, "Precondicion: target NC tiene 2 filas de detalle", logs, assertError)
    Call TestHelper.AssertTrue(otherBefore = 1, "Precondicion: otra NC tiene 1 fila de detalle", logs, assertError)
    If assertError <> "" Then GoTo finalizar

    syncOk = Cache_IndicadoresProyectoMaterializado_SincronizarNC(992001, pError)
    TestHelper.AddLog logs, "Act: sincronizacion incremental NC con fixture negocio devuelve " & CStr(syncOk) & "; pError=" & pError
    Call TestHelper.AssertTrue(syncOk, "Act: con fixture de negocio la sincronizacion incremental NC debe finalizar OK", logs, assertError)
    Call TestHelper.AssertTrue(pError = "", "Act: no debe reportar pError con fixture legal", logs, assertError)

    targetAfter = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=1 AND IDNoConformidad=992001")
    otherAfter = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=1 AND IDNoConformidad=992002")
    headerCount = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoHeader WHERE IDCacheIndicadorProyecto=1 AND Estado='OK'")
    targetPteReplanAfter = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=1 AND IDNoConformidad=992001 AND Bucket='" & BUCKET_TAR_PROY_PTE_REPLAN & "'")
    targetRegistradasAfter = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=1 AND IDNoConformidad=992001 AND Bucket='" & BUCKET_NC_PROY_REGISTRADAS & "'")
    targetSinTareasAfter = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=1 AND IDNoConformidad=992001 AND Bucket='" & BUCKET_NC_PROY_SIN_TAREAS & "'")
    targetPteCEAfter = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=1 AND IDNoConformidad=992001 AND Bucket='" & BUCKET_NC_PROY_PTE_CE & "'")
    targetIrregularAfter = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=1 AND IDNoConformidad=992001 AND Bucket='TAR_PROY_IRREGULARES'")
    targetCECaducadaAfter = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=1 AND IDNoConformidad=992001 AND Bucket='" & BUCKET_NC_PROY_CE_CADUCADA & "'")
    targetCENoConformeAfter = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=1 AND IDNoConformidad=992001 AND Bucket='" & BUCKET_NC_PROY_CE_NO_CONFORME & "'")
    TestHelper.AddLog logs, "Assert diagnostics target buckets: TAR_PTE_REPLAN=" & CStr(targetPteReplanAfter) & "; NC_REG=" & CStr(targetRegistradasAfter) & "; NC_SIN_TAREAS=" & CStr(targetSinTareasAfter) & "; NC_PTE_CE=" & CStr(targetPteCEAfter) & "; TAR_IRREG_USR=" & CStr(targetIrregularAfter) & "; NC_CE_CAD=" & CStr(targetCECaducadaAfter) & "; NC_CE_NO_CONF=" & CStr(targetCENoConformeAfter)
    Call TestHelper.AssertTrue(targetAfter = 1, "Assert: target NC queda reemplazada por la unica fila recalculada esperada", logs, assertError)
    Call TestHelper.AssertTrue(targetPteReplanAfter = 0, "Assert: AR cerrada no queda en tareas pendientes de replanificar", logs, assertError)
    Call TestHelper.AssertTrue(targetRegistradasAfter = 0, "Assert: bucket stale NC registradas del target fue eliminado", logs, assertError)
    Call TestHelper.AssertTrue(targetSinTareasAfter = 0, "Assert: NC con AR no queda en acciones sin tareas", logs, assertError)
    Call TestHelper.AssertTrue(targetPteCEAfter = 0, "Assert: bucket stale NC pte CE del target fue eliminado", logs, assertError)
    Call TestHelper.AssertTrue(targetIrregularAfter = 0, "Assert: TAR_PROY_IRREGULARES no se exige como fila total para AR cerrada; el indicador expuesto es usuario-only", logs, assertError)
    Call TestHelper.AssertTrue(targetCECaducadaAfter = 0, "Assert: NC con CE ya realizada no queda en CE caducada", logs, assertError)
    Call TestHelper.AssertTrue(targetCENoConformeAfter = 1, "Assert: CE no conforme target se materializa desde negocio", logs, assertError)
    Call TestHelper.AssertTrue(otherAfter = otherBefore, "Assert: otra NC de scope Proyecto queda preservada", logs, assertError)
    Call TestHelper.AssertTrue(headerCount = 1, "Assert: cabecera Proyecto sigue unica y OK tras sync incremental", logs, assertError)

finalizar:
    If Not db Is Nothing Then Call CacheMaterializado_ProyectoBusinessCleanup(db, logs)
    Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    If assertError <> "" Then
        Test_CacheIndicadoresMaterializado_IncrementalNC_AcotaMutacion_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_CacheIndicadoresMaterializado_IncrementalNC_AcotaMutacion_Atomic = TestHelper.BuildJsonOk(logs, "materialized_incremental_nc_scoped_ok")
    End If
    Exit Function
errores:
    errMsg = Err.Description
    On Error Resume Next
    If Not db Is Nothing Then Call CacheMaterializado_ProyectoBusinessCleanup(db, logs)
    If sessionStarted Then Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
    Test_CacheIndicadoresMaterializado_IncrementalNC_AcotaMutacion_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
End Function

Public Function Test_CacheIndicadoresMaterializado_IncrementalNC_HeaderInvalidoNoMuta_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim pError As String
    Dim errMsg As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean
    Dim db As DAO.Database
    Dim syncOk As Boolean
    Dim targetBefore As Long
    Dim otherBefore As Long
    Dim targetAfter As Long
    Dim otherAfter As Long
    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_CacheIndicadoresMaterializado_IncrementalNC_HeaderInvalidoNoMuta_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True
    Call CacheMaterializado_Cleanup(logs, assertError)
    If assertError <> "" Then GoTo finalizar

    Set db = getdb(pError)
    Call TestHelper.AssertTrue(pError = "", "Arrange obtiene backend sandbox", logs, assertError)
    If pError <> "" Then GoTo finalizar
    If Not CacheMaterializado_RequireSchema(db, logs, assertError) Then GoTo finalizar
    Call CacheMaterializado_InsertHeaderEstado(db, "ERROR", 1)
    Call CacheMaterializado_InsertFixtureRow(db, BUCKET_NC_PROY_REGISTRADAS, "NC", 992101, "QA User", 1)
    Call CacheMaterializado_InsertFixtureRow(db, BUCKET_NC_PROY_REGISTRADAS, "NC", 992102, "Otro User", 1)
    TestHelper.AddLog logs, "Arrange: cabecera ERROR con detalle target y control"

    targetBefore = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=1 AND IDNoConformidad=992101")
    otherBefore = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=1 AND IDNoConformidad=992102")
    Call TestHelper.AssertTrue(targetBefore = 1, "Precondicion: target NC existe antes del intento", logs, assertError)
    Call TestHelper.AssertTrue(otherBefore = 1, "Precondicion: otra NC existe antes del intento", logs, assertError)
    If assertError <> "" Then GoTo finalizar

    syncOk = Cache_IndicadoresProyectoMaterializado_SincronizarNC(992101, pError)
    Call TestHelper.AssertTrue(Not syncOk, "Act: header no OK bloquea sincronizacion incremental", logs, assertError)
    Call TestHelper.AssertTrue(pError <> "", "Act: header no OK debe reportar error", logs, assertError)

    targetAfter = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=1 AND IDNoConformidad=992101")
    otherAfter = CacheMaterializado_CountRows(db, "SELECT COUNT(*) AS Total FROM TbCacheIndicadoresProyectoDetalle WHERE IDCacheIndicadorProyecto=1 AND IDNoConformidad=992102")
    Call TestHelper.AssertTrue(targetAfter = targetBefore, "Assert: target NC queda intacta si header invalido", logs, assertError)
    Call TestHelper.AssertTrue(otherAfter = otherBefore, "Assert: otra NC queda intacta si header invalido", logs, assertError)

finalizar:
    Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    If assertError <> "" Then
        Test_CacheIndicadoresMaterializado_IncrementalNC_HeaderInvalidoNoMuta_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_CacheIndicadoresMaterializado_IncrementalNC_HeaderInvalidoNoMuta_Atomic = TestHelper.BuildJsonOk(logs, "materialized_incremental_header_invalid_no_mutation")
    End If
    Exit Function
errores:
    errMsg = Err.Description
    On Error Resume Next
    If sessionStarted Then Call CacheMaterializado_Cleanup(logs, assertError)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
    Test_CacheIndicadoresMaterializado_IncrementalNC_HeaderInvalidoNoMuta_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
End Function

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

Public Function Test_Indicadores_FormularioProyecto_CargaDiferida_Contract() As String
    Test_Indicadores_FormularioProyecto_CargaDiferida_Contract = AssertIndicadoresFormularioCargaDiferida( _
        "Form_Form0BDOpcionesParteProyectos", _
        "PROYECTO")
End Function

Public Function Test_Indicadores_FormularioAuditoria_CargaDiferida_Contract() As String
    Test_Indicadores_FormularioAuditoria_CargaDiferida_Contract = AssertIndicadoresFormularioCargaDiferida( _
        "Form_Form0BDOpcionesAuditorias", _
        "AUDITORIA")
End Function

Public Function Test_Issue38_SeguimientoProyecto_ActualizarModoProyecto_Contract() As String
    Test_Issue38_SeguimientoProyecto_ActualizarModoProyecto_Contract = AssertIssue38SeguimientoActualizarModo( _
        "Form_FormNCProyectoSeguimiento", _
        "PROYECTO")
End Function

Public Function Test_Issue50_SeguimientoProyecto_CargaDiferidaHelper_Contract() As String
    Dim logs As Collection
    Dim assertError As String
    Dim clsText As String
    Dim formText As String
    Dim clsPath As String
    Dim formPath As String
    Dim loadBody As String

    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    clsPath = CurrentProject.Path & "\src\forms\Form_FormNCProyectoSeguimiento.cls"
    formPath = CurrentProject.Path & "\src\forms\Form_FormNCProyectoSeguimiento.form.txt"

    clsText = ReadTextFileForIndicatorContract(clsPath)
    formText = ReadTextFileForIndicatorContract(formPath)
    loadBody = ExtractIndicatorFormOpenBody(clsText)

    TestHelper.AddLog logs, "Arrange: leído seguimiento proyecto " & clsPath
    TestHelper.AddLog logs, "Arrange: leída definición " & formPath
    Call TestHelper.AssertTrue(InStr(1, clsText, "Private m_CargaInicialIndicadoresPendiente As Boolean", vbTextCompare) > 0, "Seguimiento debe conservar flag de carga diferida", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, clsText, "Private m_CargandoIndicadores As Boolean", vbTextCompare) > 0, "Seguimiento debe evitar cargas concurrentes", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, clsText, "Private Sub Form_Timer()", vbTextCompare) > 0, "Seguimiento debe cargar desde Form_Timer", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, formText, "OnTimer =""[Event Procedure]""", vbTextCompare) > 0, "El .form.txt debe enlazar OnTimer", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, loadBody, "PintarIndicadores", vbTextCompare) = 0, "Form_Load no debe ejecutar PintarIndicadores directamente", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, loadBody, "Me.TimerInterval = 100", vbTextCompare) > 0, "Form_Load debe programar timer para pintar primero", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, clsText, "NCProyectoSeguimientoHelper.CargarIndicadoresSeguimientoProyecto", vbTextCompare) > 0, "El timer debe delegar lógica al helper de seguimiento", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, clsText, "p_DuracionSegundos:=m_UltimaDuracionIndicadores", vbTextCompare) > 0, "El helper debe devolver duración para diagnosticar lentitud", logs, assertError)

    If assertError <> "" Then
        Test_Issue50_SeguimientoProyecto_CargaDiferidaHelper_Contract = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Issue50_SeguimientoProyecto_CargaDiferidaHelper_Contract = TestHelper.BuildJsonOk(logs, "issue50_seguimiento_deferred_helper_ok")
    End If
    Exit Function

errores:
    Test_Issue50_SeguimientoProyecto_CargaDiferidaHelper_Contract = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

Public Function Test_Issue38_SeguimientoAuditoria_ActualizarModoAuditoria_Contract() As String
    Test_Issue38_SeguimientoAuditoria_ActualizarModoAuditoria_Contract = AssertIssue38SeguimientoActualizarModo( _
        "Form_FormNCAuditoriaSeguimiento", _
        "AUDITORIA")
End Function

Public Function Test_Issue38_ResetearColTareas_LimpiaAuditoriaCE_Contract() As String
    Dim logs As Collection
    Dim assertError As String
    Dim moduleText As String
    Dim modulePath As String
    Dim resetBody As String

    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    modulePath = CurrentProject.Path & "\src\modules\Funciones Generales.bas"
    moduleText = ReadTextFileForIndicatorContract(modulePath)
    resetBody = ExtractFunctionBody(moduleText, "Public Function ResetearColTareas")

    TestHelper.AddLog logs, "Arrange: leído módulo " & modulePath
    Call TestHelper.AssertTrue(resetBody <> "", "Debe existir ResetearColTareas", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, resetBody, "Set .ColSegsNCAuditoriaPteCE = Nothing", vbTextCompare) > 0, "Reset debe limpiar Auditoria PteCE", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, resetBody, "Set .ColSegsNCAuditoriaCECaducada = Nothing", vbTextCompare) > 0, "Reset debe limpiar Auditoria CE caducada", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, resetBody, "Set .ColSegsNCAuditoriaCENoConforme = Nothing", vbTextCompare) > 0, "Reset debe limpiar Auditoria CE no conforme", logs, assertError)

    If assertError <> "" Then
        Test_Issue38_ResetearColTareas_LimpiaAuditoriaCE_Contract = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Issue38_ResetearColTareas_LimpiaAuditoriaCE_Contract = TestHelper.BuildJsonOk(logs, "issue38_reset_auditoria_ce_ok")
    End If
    Exit Function

errores:
    Test_Issue38_ResetearColTareas_LimpiaAuditoriaCE_Contract = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

Private Function AssertIndicadoresFormularioCargaDiferida( _
    ByVal p_FormName As String, _
    ByVal p_ModoEsperado As String _
) As String
    Dim logs As Collection
    Dim assertError As String
    Dim clsText As String
    Dim formText As String
    Dim clsPath As String
    Dim formPath As String
    Dim openBody As String

    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    clsPath = CurrentProject.Path & "\src\forms\" & p_FormName & ".cls"
    formPath = CurrentProject.Path & "\src\forms\" & p_FormName & ".form.txt"

    clsText = ReadTextFileForIndicatorContract(clsPath)
    formText = ReadTextFileForIndicatorContract(formPath)

    TestHelper.AddLog logs, "Arrange: leído code-behind " & clsPath
    TestHelper.AddLog logs, "Arrange: leído form definition " & formPath

    Call TestHelper.AssertTrue(InStr(1, clsText, "Private m_CargaInicialIndicadoresPendiente As Boolean", vbTextCompare) > 0, "El formulario debe conservar flag de carga diferida", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, clsText, "Private m_CargandoIndicadores As Boolean", vbTextCompare) > 0, "El formulario debe evitar cargas concurrentes", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, clsText, "Private Sub Form_Timer()", vbTextCompare) > 0, "El formulario debe cargar indicadores desde Form_Timer", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, formText, "OnTimer =""[Event Procedure]""", vbTextCompare) > 0, "El .form.txt debe mantener binding OnTimer", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, formText, "Name =""lblEstado""", vbTextCompare) > 0, "El .form.txt debe mantener lblEstado para progreso", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, clsText, "PintarIndicadores p_Reiniciando:=l_Reiniciando, p_Modo:=l_Modo", vbTextCompare) > 0, "PintarIndicadores debe ejecutarse con modo diferido desde timer", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, clsText, "m_IndicadoresModo = """ & p_ModoEsperado & """", vbTextCompare) > 0, "El formulario debe programar modo " & p_ModoEsperado, logs, assertError)

    openBody = ExtractIndicatorFormOpenBody(clsText)
    Call TestHelper.AssertTrue(InStr(1, openBody, "PintarIndicadores", vbTextCompare) = 0, "La apertura del formulario no debe ejecutar PintarIndicadores directamente", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, openBody, "Me.TimerInterval = 100", vbTextCompare) > 0, "La apertura debe programar el timer para diferir la carga", logs, assertError)

    If assertError <> "" Then
        AssertIndicadoresFormularioCargaDiferida = TestHelper.BuildJsonFail(assertError, logs)
    Else
        AssertIndicadoresFormularioCargaDiferida = TestHelper.BuildJsonOk(logs, "deferred_indicator_load_" & LCase$(p_ModoEsperado))
    End If
    Exit Function

errores:
    AssertIndicadoresFormularioCargaDiferida = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

Private Function AssertIssue38SeguimientoActualizarModo( _
    ByVal p_FormName As String, _
    ByVal p_ModoEsperado As String _
) As String
    Dim logs As Collection
    Dim assertError As String
    Dim clsText As String
    Dim formText As String
    Dim clsPath As String
    Dim formPath As String
    Dim clickBody As String

    On Error GoTo errores

    Set logs = TestHelper.NewLogs
    clsPath = CurrentProject.Path & "\src\forms\" & p_FormName & ".cls"
    formPath = CurrentProject.Path & "\src\forms\" & p_FormName & ".form.txt"

    clsText = ReadTextFileForIndicatorContract(clsPath)
    formText = ReadTextFileForIndicatorContract(formPath)
    clickBody = ExtractSubBody(clsText, "Private Sub ComandoActualizar_Click")

    TestHelper.AddLog logs, "Arrange: leído seguimiento " & clsPath
    TestHelper.AddLog logs, "Arrange: leído definición " & formPath
    Call TestHelper.AssertTrue(clickBody <> "", "Debe existir ComandoActualizar_Click", logs, assertError)
    If p_FormName = "Form_FormNCProyectoSeguimiento" Then
        Call TestHelper.AssertTrue(InStr(1, clickBody, "m_CargaInicialIndicadoresPendiente = True", vbTextCompare) > 0, "ComandoActualizar debe programar carga diferida", logs, assertError)
        Call TestHelper.AssertTrue(InStr(1, clickBody, "Me.TimerInterval = 100", vbTextCompare) > 0, "ComandoActualizar debe activar timer", logs, assertError)
        Call TestHelper.AssertTrue(InStr(1, clsText, "NCProyectoSeguimientoHelper.CargarIndicadoresSeguimientoProyecto", vbTextCompare) > 0, "Seguimiento Proyecto debe delegar lógica al helper", logs, assertError)
    Else
        Call TestHelper.AssertTrue(InStr(1, clickBody, "PintarIndicadores", vbTextCompare) > 0, "ComandoActualizar debe llamar PintarIndicadores", logs, assertError)
        Call TestHelper.AssertTrue(InStr(1, clickBody, "p_Modo:=", vbTextCompare) > 0, "ComandoActualizar debe pasar p_Modo explícito", logs, assertError)
        Call TestHelper.AssertTrue(InStr(1, clickBody, p_ModoEsperado, vbTextCompare) > 0, "ComandoActualizar debe forzar modo " & p_ModoEsperado, logs, assertError)
        Call TestHelper.AssertTrue(InStr(1, clickBody, "PintarIndicadores p_Reiniciando:=EnumSino.Sí, p_Error:=m_Error", vbTextCompare) = 0, "ComandoActualizar no debe usar modo AMBOS implícito", logs, assertError)
    End If
    If p_FormName = "Form_FormNCProyectoSeguimiento" Then
        Call TestHelper.AssertTrue(InStr(1, formText, "OnTimer =""[Event Procedure]""", vbTextCompare) > 0, "El .form.txt debe conservar solo el binding OnTimer", logs, assertError)
    Else
        Call TestHelper.AssertTrue(InStr(1, formText, "PintarIndicadores", vbTextCompare) > 0, "El .form.txt debe conservar llamada a PintarIndicadores", logs, assertError)
        Call TestHelper.AssertTrue(InStr(1, formText, "p_Modo:=", vbTextCompare) > 0, "El .form.txt debe conservar p_Modo explícito", logs, assertError)
        Call TestHelper.AssertTrue(InStr(1, formText, p_ModoEsperado, vbTextCompare) > 0, "El .form.txt debe conservar modo " & p_ModoEsperado, logs, assertError)
    End If

    If assertError <> "" Then
        AssertIssue38SeguimientoActualizarModo = TestHelper.BuildJsonFail(assertError, logs)
    Else
        AssertIssue38SeguimientoActualizarModo = TestHelper.BuildJsonOk(logs, "issue38_refresh_" & LCase$(p_ModoEsperado))
    End If
    Exit Function

errores:
    AssertIssue38SeguimientoActualizarModo = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

Private Function ReadTextFileForIndicatorContract(ByVal p_Path As String) As String
    Dim fileNumber As Integer

    If Dir$(p_Path) = "" Then
        Err.Raise 1000, "ReadTextFileForIndicatorContract", "No existe el archivo requerido: " & p_Path
    End If

    fileNumber = FreeFile
    Open p_Path For Binary Access Read As #fileNumber
    ReadTextFileForIndicatorContract = Space$(LOF(fileNumber))
    Get #fileNumber, , ReadTextFileForIndicatorContract
    Close #fileNumber
End Function

Private Function ExtractIndicatorFormOpenBody(ByVal p_ClsText As String) As String
    Dim startPos As Long
    Dim endPos As Long

    startPos = InStr(1, p_ClsText, "Private Sub Form_Open", vbTextCompare)
    If startPos = 0 Then startPos = InStr(1, p_ClsText, "Private Sub Form_Load", vbTextCompare)
    If startPos = 0 Then Exit Function

    endPos = InStr(startPos + 1, p_ClsText, "End Sub", vbTextCompare)
    If endPos = 0 Then
        ExtractIndicatorFormOpenBody = Mid$(p_ClsText, startPos)
    Else
        ExtractIndicatorFormOpenBody = Mid$(p_ClsText, startPos, endPos - startPos)
    End If
End Function

Private Function ExtractSubBody( _
    ByVal p_Text As String, _
    ByVal p_SubSignature As String _
) As String
    Dim startPos As Long
    Dim endPos As Long

    startPos = InStr(1, p_Text, p_SubSignature, vbTextCompare)
    If startPos = 0 Then Exit Function

    endPos = InStr(startPos + 1, p_Text, "End Sub", vbTextCompare)
    If endPos = 0 Then
        ExtractSubBody = Mid$(p_Text, startPos)
    Else
        ExtractSubBody = Mid$(p_Text, startPos, endPos - startPos)
    End If
End Function

Private Function ExtractFunctionBody( _
    ByVal p_Text As String, _
    ByVal p_FunctionSignature As String _
) As String
    Dim startPos As Long
    Dim endPos As Long

    startPos = InStr(1, p_Text, p_FunctionSignature, vbTextCompare)
    If startPos = 0 Then Exit Function

    endPos = InStr(startPos + 1, p_Text, "End Function", vbTextCompare)
    If endPos = 0 Then
        ExtractFunctionBody = Mid$(p_Text, startPos)
    Else
        ExtractFunctionBody = Mid$(p_Text, startPos, endPos - startPos)
    End If
End Function
