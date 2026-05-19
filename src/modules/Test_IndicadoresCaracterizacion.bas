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

' ============================================================
' TESTS DE SINCRONIZACION DE CACHE — ModuloCacheIndicadores
' Verifica que el cache global de indicadores funciona correctamente
' y no corrompe datos al invalidar/recargar.
' ============================================================

Public Function Test_Cache_Proyecto_Delegacion_Y_Reset_Atomic() As String
    ' Test: el cache delegate en Entorno devuelve el mismo resultado
    ' que el constructor, y resetear fuerza recalculado.
    Dim logs As Collection
    Dim assertError As String
    Dim usr As usuario
    Dim col1 As Scripting.Dictionary
    Dim col2 As Scripting.Dictionary
    Dim col3 As Scripting.Dictionary
    Dim pError As String
    Dim dict1 As Scripting.Dictionary
    Dim dict2 As Scripting.Dictionary
    On Error GoTo errores
    
    Set logs = TestHelper.NewLogs
    Set usr = New usuario
    usr.Nombre = "QA User"
    
    ' 1.Primera carga via Entorno (delega a cache)
    Set col1 = m_ObjEntorno.ColSegsTareasProyectoPteReplanificar
    AddLog logs, "Primera carga via Entorno, count=" & col1.Count
    
    ' 2.Segunda carga via cache directo (debe ser la misma referencia)
    Set dict1 = Cache_Indicadores_Proyecto(BUCKET_TAR_PROY_PTE_REPLAN, p_Reset:=False, p_Error:=pError)
    Call TestHelper.AssertTrue(pError = "", "Cache_Indicadores_Proyecto no debe fallar", logs, assertError)
    Call TestHelper.AssertTrue(Not dict1 Is Nothing, "Cache no debe ser Nothing tras carga via Entorno", logs, assertError)
    Call TestHelper.AssertTrue(col1 Is dict1, "Cache directo y via Entorno deben devolver la misma referencia", logs, assertError)
    
    ' 3.Resetear cache
    Call Cache_InvalidarProyecto(pError:=pError)
    Call TestHelper.AssertTrue(pError = "", "Cache_InvalidarProyecto no debe fallar", logs, assertError)
    AddLog logs, "Cache invalidado"
    
    ' 4.Reset=True obliga a recalcular (nueva referencia)
    Set dict2 = Cache_Indicadores_Proyecto(BUCKET_TAR_PROY_PTE_REPLAN, p_Reset:=True, p_Error:=pError)
    Call TestHelper.AssertTrue(pError = "", "Recalculo con reset no debe fallar", logs, assertError)
    Call TestHelper.AssertTrue(Not dict2 Is Nothing, "Tras reset, cache debe tener datos", logs, assertError)
    
    ' 5.Loading indicator state
    Call TestHelper.AssertTrue(Cache_Proyecto_EstaCargado(), "Cache debe estar marcado como cargado", logs, assertError)
    
    If assertError <> "" Then
        Test_Cache_Proyecto_Delegacion_Y_Reset_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Cache_Proyecto_Delegacion_Y_Reset_Atomic = TestHelper.BuildJsonOk(logs, "cache_delegacion_reset_ok")
    End If
    Exit Function
errores:
    Test_Cache_Proyecto_Delegacion_Y_Reset_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

Public Function Test_Cache_InvalidarTodo_SeparaProyectosYAuditorias_Atomic() As String
    ' Test: InvalidarTodo limpia ambos caches independientemente.
    ' Cada cache debe poder existir sin interferir con el otro.
    Dim logs As Collection
    Dim assertError As String
    Dim pError As String
    Dim dictProy As Scripting.Dictionary
    Dim dictAud As Scripting.Dictionary
    On Error GoTo errores
    
    Set logs = TestHelper.NewLogs
    
    ' Cargar ambos caches
    Set dictProy = Cache_Indicadores_Proyecto(BUCKET_TAR_PROY_PTE_REPLAN, p_Reset:=False, p_Error:=pError)
    If pError <> "" Then GoTo errores
    Set dictAud = Cache_Indicadores_Auditoria(BUCKET_TAR_AUD_PTE_REPLAN, p_Reset:=False, p_Error:=pError)
    If pError <> "" Then GoTo errores
    
    AddLog logs, "Ambos caches cargados. EstaCargado proy=" & Cache_Proyecto_EstaCargado() & _
                 " aud=" & Cache_Auditoria_EstaCargado()
    
    ' Invalidar TODO
    Call Cache_InvalidarTodo(pError:=pError)
    Call TestHelper.AssertTrue(pError = "", "Cache_InvalidarTodo no debe fallar", logs, assertError)
    
    ' Ambos deben estar limpiados
    Call TestHelper.AssertTrue(Not Cache_Proyecto_EstaCargado(), _
        "Tras InvalidarTodo, proyecto no debe estar cargado", logs, assertError)
    Call TestHelper.AssertTrue(Not Cache_Auditoria_EstaCargado(), _
        "Tras InvalidarTodo, auditoria no debe estar cargada", logs, assertError)
    
    If assertError <> "" Then
        Test_Cache_InvalidarTodo_SeparaProyectosYAuditorias_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Cache_InvalidarTodo_SeparaProyectosYAuditorias_Atomic = TestHelper.BuildJsonOk(logs, "invalidate_todo_separation_ok")
    End If
    Exit Function
errores:
    Test_Cache_InvalidarTodo_SeparaProyectosYAuditorias_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

Public Function Test_Cache_InvalidacionSelectiva_Atomic() As String
    ' Test: InvalidarProyecto solo limpia cache proyecto,
    ' invalidar auditoria solo limpia cache auditoria.
    Dim logs As Collection
    Dim assertError As String
    Dim pError As String
    Dim dictProy As Scripting.Dictionary
    Dim dictAud As Scripting.Dictionary
    On Error GoTo errores
    
    Set logs = TestHelper.NewLogs
    
    ' Cargar ambos
    Set dictProy = Cache_Indicadores_Proyecto(BUCKET_TAR_PROY_PTE_REPLAN, p_Reset:=False, p_Error:=pError)
    If pError <> "" Then GoTo errores
    Set dictAud = Cache_Indicadores_Auditoria(BUCKET_TAR_AUD_PTE_REPLAN, p_Reset:=False, p_Error:=pError)
    If pError <> "" Then GoTo errores
    
    ' Invalidar solo proyecto
    Call Cache_InvalidarProyecto(pError:=pError)
    Call TestHelper.AssertTrue(pError = "", "Cache_InvalidarProyecto no debe fallar", logs, assertError)
    
    Call TestHelper.AssertTrue(Not Cache_Proyecto_EstaCargado(), _
        "Proyecto debe estar descargado", logs, assertError)
    Call TestHelper.AssertTrue(Cache_Auditoria_EstaCargado(), _
        "Auditoria debe seguir cargada (inval. selectiva)", logs, assertError)
    
    ' Recargar proyecto
    Set dictProy = Cache_Indicadores_Proyecto(BUCKET_TAR_PROY_PTE_REPLAN, p_Reset:=True, p_Error:=pError)
    Call TestHelper.AssertTrue(pError = "", "Recarga proyecto no debe fallar", logs, assertError)
    
    ' Invalidar solo auditoria
    Call Cache_InvalidarAuditoria(pError:=pError)
    Call TestHelper.AssertTrue(pError = "", "Cache_InvalidarAuditoria no debe fallar", logs, assertError)
    
    Call TestHelper.AssertTrue(Cache_Proyecto_EstaCargado(), _
        "Proyecto sigue cargado", logs, assertError)
    Call TestHelper.AssertTrue(Not Cache_Auditoria_EstaCargado(), _
        "Auditoria debe estar descargada", logs, assertError)
    
    If assertError <> "" Then
        Test_Cache_InvalidacionSelectiva_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Cache_InvalidacionSelectiva_Atomic = TestHelper.BuildJsonOk(logs, "inval_selectiva_ok")
    End If
    Exit Function
errores:
    Test_Cache_InvalidacionSelectiva_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

Public Function Test_Cache_ConsistenciaConEntorno_Atomic() As String
    ' Test: los datos devueltos por cache y por Entorno son consistentes.
    ' Tras cargar via Entorno, el cache debe tener los mismos datos.
    Dim logs As Collection
    Dim assertError As String
    Dim usr As usuario
    Dim colEntorno As Scripting.Dictionary
    Dim colCache As Scripting.Dictionary
    Dim resultadosEntorno As Scripting.Dictionary
    Dim resultadosCache As Scripting.Dictionary
    Dim pError As String
    On Error GoTo errores
    
    Set logs = TestHelper.NewLogs
    Set usr = New usuario
    usr.Nombre = "QA User"
    
    ' Limpiar cache primero para test limpio
    Call Cache_InvalidarProyecto(pError:=pError)
    
    ' Cargar via Entorno (delega a cache internamente)
    Set colEntorno = m_ObjEntorno.ColSegsNCProyectoRegistradas
    AddLog logs, "Entorno carga NCProyectoRegistradas, count=" & colEntorno.Count
    
    ' Obtener via cache directo
    Set colCache = Cache_Indicadores_Proyecto(BUCKET_NC_PROY_REGISTRADAS, p_Reset:=False, p_Error:=pError)
    Call TestHelper.AssertTrue(pError = "", "Cache no debe fallar", logs, assertError)
    Call TestHelper.AssertTrue(Not colCache Is Nothing, "Cache no debe ser Nothing", logs, assertError)
    
    ' Deben ser la misma referencia
    Call TestHelper.AssertTrue(colEntorno Is colCache, _
        "Entorno y Cache deben devolver misma referencia para mismo bucket", logs, assertError)
    
    If assertError <> "" Then
        Test_Cache_ConsistenciaConEntorno_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Cache_ConsistenciaConEntorno_Atomic = TestHelper.BuildJsonOk(logs, "consistencia_entorno_cache_ok")
    End If
    Exit Function
errores:
    Test_Cache_ConsistenciaConEntorno_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
End Function
