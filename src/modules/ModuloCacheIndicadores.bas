VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ModuloCacheIndicadores"
Option Compare Database
Option Explicit

' ============================================================
' ModuloCacheIndicadores — Cache global en memoria para
' indicadores de Proyecto y Auditoria.
'
' Cada bucket es un Scripting.Dictionary con objetos domain.
' El cache sobrevive al cierre de formularios porque vive
' en variables de modulo (nivel VBA project), no en objetos.
'
' Para invalidar: llamar a Cache_InvalidarTodo() o
'   Cache_InvalidarProyecto() / Cache_InvalidarAuditoria()
' ============================================================

' — Buckets para PROYECTO —
Public Const BUCKET_TAR_PROY_PTE_REPLAN As String = "TAR_PROY_PTE_REPLAN"
Public Const BUCKET_NC_PROY_REGISTRADAS As String = "NC_PROY_REGISTRADAS"
Public Const BUCKET_NC_PROY_SIN_TAREAS As String = "NC_PROY_SIN_TAREAS"
Public Const BUCKET_NC_PROY_PTE_CE As String = "NC_PROY_PTE_CE"
Public Const BUCKET_NC_PROY_CE_CADUCADA As String = "NC_PROY_CE_CADUCADA"
Public Const BUCKET_NC_PROY_CE_NO_CONFORME As String = "NC_PROY_CE_NO_CONFORME"

' — Buckets para AUDITORIA —
Public Const BUCKET_TAR_AUD_PTE_REPLAN As String = "TAR_AUD_PTE_REPLAN"
Public Const BUCKET_NC_AUD_REGISTRADAS As String = "NC_AUD_REGISTRADAS"
Public Const BUCKET_NC_AUD_SIN_TAREAS As String = "NC_AUD_SIN_TAREAS"
Public Const BUCKET_NC_AUD_PTE_CE As String = "NC_AUD_PTE_CE"
Public Const BUCKET_NC_AUD_CE_CADUCADA As String = "NC_AUD_CE_CADUCADA"
Public Const BUCKET_NC_AUD_CE_NO_CONFORME As String = "NC_AUD_CE_NO_CONFORME"

' — Cache materializado compartido para PROYECTO/AUDITORIA (backend) —
' La tabla conserva nombres legacy de Proyecto, pero IDCacheIndicadorProyecto separa ámbitos:
'   1 = Proyecto, 2 = Auditoria.
Private Const CACHE_PROYECTO_HEADER As String = "TbCacheIndicadoresProyectoHeader"
Private Const CACHE_PROYECTO_DETALLE As String = "TbCacheIndicadoresProyectoDetalle"
Private Const CACHE_PROYECTO_ID As Long = 1
Private Const CACHE_AUDITORIA_ID As Long = 2

' ============================================================
' Variables privadas de modulo (surviven al cierre de forms)
' ============================================================
Private m_CacheProyecto As Scripting.Dictionary
Private m_CacheAuditoria As Scripting.Dictionary

' ============================================================
' Mapa de buckets -> constructor.get*() para PROYECTO
' ============================================================
Private Function Cache_Proyecto_GetConstructorFunc(p_Bucket As String) As String
    Select Case p_Bucket
        Case BUCKET_TAR_PROY_PTE_REPLAN:   Cache_Proyecto_GetConstructorFunc = "getSegsTareasProyectoPteReplanificar"
        Case BUCKET_NC_PROY_REGISTRADAS:    Cache_Proyecto_GetConstructorFunc = "getSegsNCProyectoRegistradas"
        Case BUCKET_NC_PROY_SIN_TAREAS:     Cache_Proyecto_GetConstructorFunc = "getSegsNCProyectoAccionesSinTareas"
        Case BUCKET_NC_PROY_PTE_CE:         Cache_Proyecto_GetConstructorFunc = "getSegsNCProyectoPteCE"
        Case BUCKET_NC_PROY_CE_CADUCADA:   Cache_Proyecto_GetConstructorFunc = "getSegsNCProyectoCECaducada"
        Case BUCKET_NC_PROY_CE_NO_CONFORME: Cache_Proyecto_GetConstructorFunc = "getSegsNCProyectoCENoConforme"
        Case Else
            Cache_Proyecto_GetConstructorFunc = ""
    End Select
End Function

' ============================================================
' Mapa de buckets -> constructor.get*() para AUDITORIA
' ============================================================
Private Function Cache_Auditoria_GetConstructorFunc(p_Bucket As String) As String
    Select Case p_Bucket
        Case BUCKET_TAR_AUD_PTE_REPLAN:     Cache_Auditoria_GetConstructorFunc = "getSegsTareasAuditoriaPteReplanificar"
        Case BUCKET_NC_AUD_REGISTRADAS:     Cache_Auditoria_GetConstructorFunc = "getSegsNCAuditoriaRegistradas"
        Case BUCKET_NC_AUD_SIN_TAREAS:       Cache_Auditoria_GetConstructorFunc = "getSegsNCAuditoriaAccionesSinTareas"
        Case BUCKET_NC_AUD_PTE_CE:          Cache_Auditoria_GetConstructorFunc = "getSegsNCAuditoriaPteCE"
        Case BUCKET_NC_AUD_CE_CADUCADA:     Cache_Auditoria_GetConstructorFunc = "getSegsNCAuditoriaCECaducada"
        Case BUCKET_NC_AUD_CE_NO_CONFORME:  Cache_Auditoria_GetConstructorFunc = "getSegsNCAuditoriaCENoConforme"
        Case Else
            Cache_Auditoria_GetConstructorFunc = ""
    End Select
End Function

' ============================================================
' Inicializacion lazy del diccionario de cache
' ============================================================
Private Sub Cache_EnsureProyecto()
    If m_CacheProyecto Is Nothing Then
        Set m_CacheProyecto = New Scripting.Dictionary
        m_CacheProyecto.CompareMode = TextCompare
    End If
End Sub

Private Sub Cache_EnsureAuditoria()
    If m_CacheAuditoria Is Nothing Then
        Set m_CacheAuditoria = New Scripting.Dictionary
        m_CacheAuditoria.CompareMode = TextCompare
    End If
End Sub

Private Function Cache_TableExists(ByVal p_Db As DAO.Database, ByVal p_TableName As String) As Boolean
    Dim tdf As DAO.TableDef
    On Error GoTo notfound
    Set tdf = p_Db.TableDefs(p_TableName)
    Cache_TableExists = True
    Exit Function
notfound:
    Cache_TableExists = False
End Function

Private Function Cache_FieldExists(ByVal p_Db As DAO.Database, ByVal p_TableName As String, ByVal p_FieldName As String) As Boolean
    Dim tdf As DAO.TableDef
    Dim fld As DAO.Field
    On Error GoTo notfound
    Set tdf = p_Db.TableDefs(p_TableName)
    For Each fld In tdf.Fields
        If StrComp(fld.Name, p_FieldName, vbTextCompare) = 0 Then
            Cache_FieldExists = True
            Exit Function
        End If
    Next fld
    Exit Function
notfound:
    Cache_FieldExists = False
End Function

Private Function Cache_ProyectoMaterializadoSchemaReady(ByVal p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    p_Error = ""
    If Not Cache_TableExists(p_Db, CACHE_PROYECTO_HEADER) Then
        p_Error = "Schema requerido no encontrado: falta tabla backend " & CACHE_PROYECTO_HEADER
        Exit Function
    End If
    If Not Cache_TableExists(p_Db, CACHE_PROYECTO_DETALLE) Then
        p_Error = "Schema requerido no encontrado: falta tabla backend " & CACHE_PROYECTO_DETALLE
        Exit Function
    End If
    If Not Cache_FieldExists(p_Db, CACHE_PROYECTO_HEADER, "IDCacheIndicadorProyecto") Then
        p_Error = "Schema requerido no encontrado: falta campo " & CACHE_PROYECTO_HEADER & ".IDCacheIndicadorProyecto"
        Exit Function
    End If
    If Not Cache_FieldExists(p_Db, CACHE_PROYECTO_DETALLE, "Bucket") Then
        p_Error = "Schema requerido no encontrado: falta campo " & CACHE_PROYECTO_DETALLE & ".Bucket"
        Exit Function
    End If
    If Not Cache_FieldExists(p_Db, CACHE_PROYECTO_DETALLE, "TipoFila") Then
        p_Error = "Schema requerido no encontrado: falta campo " & CACHE_PROYECTO_DETALLE & ".TipoFila"
        Exit Function
    End If
    If Not Cache_FieldExists(p_Db, CACHE_PROYECTO_DETALLE, "IDEntidad") Then
        p_Error = "Schema requerido no encontrado: falta campo " & CACHE_PROYECTO_DETALLE & ".IDEntidad"
        Exit Function
    End If
    If Not Cache_FieldExists(p_Db, CACHE_PROYECTO_DETALLE, "IDNoConformidad") Then
        p_Error = "Schema requerido no encontrado: falta campo " & CACHE_PROYECTO_DETALLE & ".IDNoConformidad"
        Exit Function
    End If
    If Not Cache_FieldExists(p_Db, CACHE_PROYECTO_DETALLE, "ResponsableCalidad") Then
        p_Error = "Schema requerido no encontrado: falta campo " & CACHE_PROYECTO_DETALLE & ".ResponsableCalidad"
        Exit Function
    End If
    If Not Cache_FieldExists(p_Db, CACHE_PROYECTO_DETALLE, "FechaSnapshot") Then
        p_Error = "Schema requerido no encontrado: falta campo " & CACHE_PROYECTO_DETALLE & ".FechaSnapshot"
        Exit Function
    End If
    Cache_ProyectoMaterializadoSchemaReady = True
End Function

' ============================================================
' Llama a constructor.getXXX() por nombre de funcion
' Devuelve el Dictionary resultado
' ============================================================
Private Function Cache_EjecutarConstructor(p_FuncName As String, ByRef p_Error As String) As Scripting.Dictionary
    Dim m_Result As Scripting.Dictionary
    On Error GoTo errores
    p_Error = ""
    
    Select Case p_FuncName
        Case "getSegsTareasProyectoPteReplanificar"
            Set m_Result = constructor.getSegsTareasProyectoPteReplanificar(p_Error:=p_Error)
        Case "getSegsNCProyectoRegistradas"
            Set m_Result = constructor.getSegsNCProyectoRegistradas(p_Error:=p_Error)
        Case "getSegsNCProyectoAccionesSinTareas"
            Set m_Result = constructor.getSegsNCProyectoAccionesSinTareas(p_Error:=p_Error)
        Case "getSegsNCProyectoPteCE"
            Set m_Result = constructor.getSegsNCProyectoPteCE(p_Error:=p_Error)
        Case "getSegsNCProyectoCECaducada"
            Set m_Result = constructor.getSegsNCProyectoCECaducada(p_Error:=p_Error)
        Case "getSegsNCProyectoCENoConforme"
            Set m_Result = constructor.getSegsNCProyectoCENoConforme(p_Error:=p_Error)
        Case "getSegsTareasAuditoriaPteReplanificar"
            Set m_Result = constructor.getSegsTareasAuditoriaPteReplanificar(p_Error:=p_Error)
        Case "getSegsNCAuditoriaRegistradas"
            Set m_Result = constructor.getSegsNCAuditoriaRegistradas(p_Error:=p_Error)
        Case "getSegsNCAuditoriaAccionesSinTareas"
            Set m_Result = constructor.getSegsNCAuditoriaAccionesSinTareas(p_Error:=p_Error)
        Case "getSegsNCAuditoriaPteCE"
            Set m_Result = constructor.getSegsNCAuditoriaPteCE(p_Error:=p_Error)
        Case "getSegsNCAuditoriaCECaducada"
            Set m_Result = constructor.getSegsNCAuditoriaCECaducada(p_Error:=p_Error)
        Case "getSegsNCAuditoriaCENoConforme"
            Set m_Result = constructor.getSegsNCAuditoriaCENoConforme(p_Error:=p_Error)
        Case Else
            p_Error = "Cache_EjecutarConstructor: funcion desconocida '" & p_FuncName & "'"
            Set m_Result = Nothing
    End Select
    
    Set Cache_EjecutarConstructor = m_Result
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "Cache_EjecutarConstructor: " & Err.Description
    End If
    Set m_Result = Nothing
End Function

' ============================================================
' API PUBLICA — CACHE MATERIALIZADO PROYECTO
' ============================================================

Public Function Cache_IndicadoresProyectoMaterializado_CargarConteos( _
                        ByVal p_Usuario As usuario, _
                        Optional ByRef p_Error As String _
                    ) As Scripting.Dictionary
    Dim db As DAO.Database
    Dim conteos As Scripting.Dictionary

    On Error GoTo errores
    p_Error = ""
    If p_Usuario Is Nothing Then
        p_Error = "Cache_IndicadoresProyectoMaterializado_CargarConteos requiere usuario."
        Exit Function
    End If

    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then GoTo salir
    If Not Cache_ProyectoMaterializadoSchemaReady(db, p_Error) Then GoTo salir
    If Not Cache_ProyectoMaterializado_HeaderReady(db, p_Error) Then GoTo salir

    Set conteos = New Scripting.Dictionary
    conteos.CompareMode = TextCompare
    conteos("ProyectoTareasPteReplanificarTotal") = Cache_ProyectoMaterializado_Count(db, BUCKET_TAR_PROY_PTE_REPLAN, vbNullString, p_Error)
    conteos("ProyectoTareasPteReplanificarUsuario") = Cache_ProyectoMaterializado_Count(db, BUCKET_TAR_PROY_PTE_REPLAN, p_Usuario.Nombre, p_Error)
    conteos("ProyectoTareasIrregularesUsuario") = Cache_ProyectoMaterializado_Count(db, "TAR_PROY_IRREGULARES", p_Usuario.Nombre, p_Error)
    conteos("ProyectoNCRegistradasTotal") = Cache_ProyectoMaterializado_Count(db, BUCKET_NC_PROY_REGISTRADAS, vbNullString, p_Error)
    conteos("ProyectoNCRegistradasUsuario") = Cache_ProyectoMaterializado_Count(db, BUCKET_NC_PROY_REGISTRADAS, p_Usuario.Nombre, p_Error)
    conteos("ProyectoNCAccionesSinTareasTotal") = Cache_ProyectoMaterializado_Count(db, BUCKET_NC_PROY_SIN_TAREAS, vbNullString, p_Error)
    conteos("ProyectoNCAccionesSinTareasUsuario") = Cache_ProyectoMaterializado_Count(db, BUCKET_NC_PROY_SIN_TAREAS, p_Usuario.Nombre, p_Error)
    conteos("ProyectoNCPteCETotal") = Cache_ProyectoMaterializado_Count(db, BUCKET_NC_PROY_PTE_CE, vbNullString, p_Error)
    conteos("ProyectoNCPteCEUsuario") = Cache_ProyectoMaterializado_Count(db, BUCKET_NC_PROY_PTE_CE, p_Usuario.Nombre, p_Error)
    conteos("ProyectoNCCECaducadaTotal") = Cache_ProyectoMaterializado_Count(db, BUCKET_NC_PROY_CE_CADUCADA, vbNullString, p_Error)
    conteos("ProyectoNCCECaducadaUsuario") = Cache_ProyectoMaterializado_Count(db, BUCKET_NC_PROY_CE_CADUCADA, p_Usuario.Nombre, p_Error)
    conteos("ProyectoNCCENoConformeTotal") = Cache_ProyectoMaterializado_Count(db, BUCKET_NC_PROY_CE_NO_CONFORME, vbNullString, p_Error)
    conteos("ProyectoNCCENoConformeUsuario") = Cache_ProyectoMaterializado_Count(db, BUCKET_NC_PROY_CE_NO_CONFORME, p_Usuario.Nombre, p_Error)
    If p_Error <> "" Then GoTo salir

    Set Cache_IndicadoresProyectoMaterializado_CargarConteos = conteos

salir:
    Set db = Nothing
    Exit Function
errores:
    p_Error = "Cache_IndicadoresProyectoMaterializado_CargarConteos: " & Err.Description
    Resume salir
End Function

Public Function Cache_IndicadoresAuditoriaMaterializado_CargarConteos( _
                        ByVal p_Usuario As usuario, _
                        Optional ByRef p_Error As String _
                    ) As Scripting.Dictionary
    Dim db As DAO.Database
    Dim conteos As Scripting.Dictionary

    On Error GoTo errores
    p_Error = ""
    If p_Usuario Is Nothing Then
        p_Error = "Cache_IndicadoresAuditoriaMaterializado_CargarConteos requiere usuario."
        Exit Function
    End If

    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then GoTo salir
    If Not Cache_ProyectoMaterializadoSchemaReady(db, p_Error) Then GoTo salir
    If Not Cache_AuditoriaMaterializado_HeaderReady(db, p_Error) Then GoTo salir

    Set conteos = New Scripting.Dictionary
    conteos.CompareMode = TextCompare
    conteos("AuditoriaTareasPteReplanificarTotal") = Cache_Materializado_Count(db, CACHE_AUDITORIA_ID, BUCKET_TAR_AUD_PTE_REPLAN, vbNullString, p_Error)
    conteos("AuditoriaTareasPteReplanificarUsuario") = Cache_Materializado_Count(db, CACHE_AUDITORIA_ID, BUCKET_TAR_AUD_PTE_REPLAN, p_Usuario.Nombre, p_Error)
    conteos("AuditoriaNCRegistradasTotal") = Cache_Materializado_Count(db, CACHE_AUDITORIA_ID, BUCKET_NC_AUD_REGISTRADAS, vbNullString, p_Error)
    conteos("AuditoriaNCRegistradasUsuario") = Cache_Materializado_Count(db, CACHE_AUDITORIA_ID, BUCKET_NC_AUD_REGISTRADAS, p_Usuario.Nombre, p_Error)
    conteos("AuditoriaNCAccionesSinTareasTotal") = Cache_Materializado_Count(db, CACHE_AUDITORIA_ID, BUCKET_NC_AUD_SIN_TAREAS, vbNullString, p_Error)
    conteos("AuditoriaNCAccionesSinTareasUsuario") = Cache_Materializado_Count(db, CACHE_AUDITORIA_ID, BUCKET_NC_AUD_SIN_TAREAS, p_Usuario.Nombre, p_Error)
    conteos("AuditoriaNCPteCETotal") = Cache_Materializado_Count(db, CACHE_AUDITORIA_ID, BUCKET_NC_AUD_PTE_CE, vbNullString, p_Error)
    conteos("AuditoriaNCPteCEUsuario") = Cache_Materializado_Count(db, CACHE_AUDITORIA_ID, BUCKET_NC_AUD_PTE_CE, p_Usuario.Nombre, p_Error)
    conteos("AuditoriaNCCECaducadaTotal") = Cache_Materializado_Count(db, CACHE_AUDITORIA_ID, BUCKET_NC_AUD_CE_CADUCADA, vbNullString, p_Error)
    conteos("AuditoriaNCCECaducadaUsuario") = Cache_Materializado_Count(db, CACHE_AUDITORIA_ID, BUCKET_NC_AUD_CE_CADUCADA, p_Usuario.Nombre, p_Error)
    conteos("AuditoriaNCCENoConformeTotal") = Cache_Materializado_Count(db, CACHE_AUDITORIA_ID, BUCKET_NC_AUD_CE_NO_CONFORME, vbNullString, p_Error)
    conteos("AuditoriaNCCENoConformeUsuario") = Cache_Materializado_Count(db, CACHE_AUDITORIA_ID, BUCKET_NC_AUD_CE_NO_CONFORME, p_Usuario.Nombre, p_Error)
    If p_Error <> "" Then GoTo salir

    Set Cache_IndicadoresAuditoriaMaterializado_CargarConteos = conteos

salir:
    Set db = Nothing
    Exit Function
errores:
    p_Error = "Cache_IndicadoresAuditoriaMaterializado_CargarConteos: " & Err.Description
    Resume salir
End Function

Private Function Cache_ProyectoMaterializado_HeaderReady(ByVal p_Db As DAO.Database, ByRef p_Error As String) As Boolean
    Cache_ProyectoMaterializado_HeaderReady = Cache_Materializado_HeaderReady(p_Db, CACHE_PROYECTO_ID, "Proyecto", p_Error)
End Function

Private Function Cache_AuditoriaMaterializado_HeaderReady(ByVal p_Db As DAO.Database, ByRef p_Error As String) As Boolean
    Cache_AuditoriaMaterializado_HeaderReady = Cache_Materializado_HeaderReady(p_Db, CACHE_AUDITORIA_ID, "Auditoria", p_Error)
End Function

Private Function Cache_Materializado_HeaderReady( _
                        ByVal p_Db As DAO.Database, _
                        ByVal p_CacheId As Long, _
                        ByVal p_NombreCache As String, _
                        ByRef p_Error As String _
                    ) As Boolean
    Dim rs As DAO.Recordset
    Dim sql As String
    Dim estado As String
    Dim detailCount As Long
    Dim headerCount As Long

    On Error GoTo errores
    p_Error = ""
    sql = "SELECT Estado FROM " & CACHE_PROYECTO_HEADER & _
          " WHERE IDCacheIndicadorProyecto=" & CStr(p_CacheId)
    Set rs = p_Db.OpenRecordset(sql, dbOpenSnapshot)
    Do Until rs.EOF
        headerCount = headerCount + 1
        estado = UCase$(Trim$(Nz(rs.Fields("Estado").Value, vbNullString)))
        rs.MoveNext
    Loop
    If headerCount = 0 Then
        p_Error = "Cache materializado de " & p_NombreCache & " sin cabecera de snapshot."
        GoTo salir
    End If
    If headerCount <> 1 Then
        p_Error = "Cache materializado de " & p_NombreCache & " invalido: se esperaba una unica cabecera y hay " & CStr(headerCount) & "."
        GoTo salir
    End If
    If estado <> "OK" Then
        p_Error = "Cache materializado de " & p_NombreCache & " no valido: Estado='" & estado & "'."
        GoTo salir
    End If
    rs.Close
    Set rs = Nothing

    sql = "SELECT COUNT(*) AS Total FROM " & CACHE_PROYECTO_DETALLE & _
          " WHERE IDCacheIndicadorProyecto=" & CStr(p_CacheId)
    Set rs = p_Db.OpenRecordset(sql, dbOpenSnapshot)
    If Not rs.EOF Then detailCount = CLng(Nz(rs.Fields("Total").Value, 0))
    If detailCount = 0 Then
        p_Error = "Cache materializado de " & p_NombreCache & " ambiguo: cabecera OK sin filas de detalle."
        GoTo salir
    End If

    Cache_Materializado_HeaderReady = True

salir:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Exit Function
errores:
    p_Error = "Cache_Materializado_HeaderReady: " & Err.Description
    Resume salir
End Function

Public Function Cache_IndicadoresProyectoMaterializado_Sincronizar(Optional ByRef p_Error As String) As Boolean
    Dim db As DAO.Database
    Dim ws As DAO.Workspace
    Dim snapFecha As Date
    Dim detailCount As Long

    On Error GoTo errores
    p_Error = ""
    Cache_IndicadoresProyectoMaterializado_Sincronizar = False

    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then GoTo salir
    If Not Cache_ProyectoMaterializadoSchemaReady(db, p_Error) Then GoTo salir

    Set ws = DBEngine.Workspaces(0)
    snapFecha = Now()
    ws.BeginTrans
    db.Execute "DELETE FROM " & CACHE_PROYECTO_DETALLE & " WHERE IDCacheIndicadorProyecto=" & CStr(CACHE_PROYECTO_ID), dbFailOnError
    db.Execute "DELETE FROM " & CACHE_PROYECTO_HEADER & " WHERE IDCacheIndicadorProyecto=" & CStr(CACHE_PROYECTO_ID), dbFailOnError
    db.Execute "INSERT INTO " & CACHE_PROYECTO_HEADER & _
               " (IDCacheIndicadorProyecto, FechaSincronizacion, UsuarioSincronizacion, Estado) VALUES (" & _
               CStr(CACHE_PROYECTO_ID) & ", Now(), " & Cache_ProyectoMaterializado_SqlText(getNombreUsuarioConectado()) & ", 'SYNCING')", dbFailOnError

    Cache_ProyectoMaterializado_InsertBucket db, BUCKET_TAR_PROY_PTE_REPLAN, "TAREA", constructor.getSegsTareasProyectoPteReplanificar(db, p_Error), snapFecha, p_Error
    Cache_ProyectoMaterializado_InsertBucket db, "TAR_PROY_IRREGULARES", "TAREA", constructor.getSegsTareasProyecto(db, p_Error), snapFecha, p_Error
    Cache_ProyectoMaterializado_InsertBucket db, BUCKET_NC_PROY_REGISTRADAS, "NC", constructor.getSegsNCProyectoRegistradas(db, p_Error), snapFecha, p_Error
    Cache_ProyectoMaterializado_InsertBucket db, BUCKET_NC_PROY_SIN_TAREAS, "NC", constructor.getSegsNCProyectoAccionesSinTareas(db, p_Error), snapFecha, p_Error
    Cache_ProyectoMaterializado_InsertBucket db, BUCKET_NC_PROY_PTE_CE, "NC", constructor.getSegsNCProyectoPteCE(db, p_Error), snapFecha, p_Error
    Cache_ProyectoMaterializado_InsertBucket db, BUCKET_NC_PROY_CE_CADUCADA, "NC", constructor.getSegsNCProyectoCECaducada(db, p_Error), snapFecha, p_Error
    Cache_ProyectoMaterializado_InsertBucket db, BUCKET_NC_PROY_CE_NO_CONFORME, "NC", constructor.getSegsNCProyectoCENoConforme(db, p_Error), snapFecha, p_Error
    If p_Error <> "" Then Err.Raise 1000

    detailCount = Cache_ProyectoMaterializado_DetailCount(db, p_Error)
    If p_Error <> "" Then Err.Raise 1000
    If detailCount = 0 Then
        p_Error = "Cache_IndicadoresProyectoMaterializado_Sincronizar: snapshot vacio no se puede marcar OK."
        Err.Raise 1000
    End If

    db.Execute "UPDATE " & CACHE_PROYECTO_HEADER & _
               " SET FechaSincronizacion=Now(), Estado='OK', ErrorUltimaSincronizacion=Null" & _
               " WHERE IDCacheIndicadorProyecto=" & CStr(CACHE_PROYECTO_ID), dbFailOnError
    ws.CommitTrans
    Cache_IndicadoresProyectoMaterializado_Sincronizar = True

salir:
    Set db = Nothing
    Set ws = Nothing
    Exit Function
errores:
    On Error Resume Next
    If Not ws Is Nothing Then ws.Rollback
    On Error GoTo 0
    If p_Error = "" Then p_Error = "Cache_IndicadoresProyectoMaterializado_Sincronizar: " & Err.Description
    Resume salir
End Function

Public Function Cache_IndicadoresAuditoriaMaterializado_Sincronizar(Optional ByRef p_Error As String) As Boolean
    Dim db As DAO.Database
    Dim ws As DAO.Workspace
    Dim snapFecha As Date
    Dim detailCount As Long

    On Error GoTo errores
    p_Error = ""
    Cache_IndicadoresAuditoriaMaterializado_Sincronizar = False

    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then GoTo salir
    If Not Cache_ProyectoMaterializadoSchemaReady(db, p_Error) Then GoTo salir

    Set ws = DBEngine.Workspaces(0)
    snapFecha = Now()
    ws.BeginTrans
    db.Execute "DELETE FROM " & CACHE_PROYECTO_DETALLE & " WHERE IDCacheIndicadorProyecto=" & CStr(CACHE_AUDITORIA_ID), dbFailOnError
    db.Execute "DELETE FROM " & CACHE_PROYECTO_HEADER & " WHERE IDCacheIndicadorProyecto=" & CStr(CACHE_AUDITORIA_ID), dbFailOnError
    db.Execute "INSERT INTO " & CACHE_PROYECTO_HEADER & _
               " (IDCacheIndicadorProyecto, FechaSincronizacion, UsuarioSincronizacion, Estado) VALUES (" & _
               CStr(CACHE_AUDITORIA_ID) & ", Now(), " & Cache_ProyectoMaterializado_SqlText(getNombreUsuarioConectado()) & ", 'SYNCING')", dbFailOnError

    Cache_ProyectoMaterializado_InsertBucket db, BUCKET_TAR_AUD_PTE_REPLAN, "TAREA", constructor.getSegsTareasAuditoriaPteReplanificar(db, p_Error), snapFecha, p_Error, CACHE_AUDITORIA_ID
    Cache_ProyectoMaterializado_InsertBucket db, BUCKET_NC_AUD_REGISTRADAS, "NC", constructor.getSegsNCAuditoriaRegistradas(db, p_Error), snapFecha, p_Error, CACHE_AUDITORIA_ID
    Cache_ProyectoMaterializado_InsertBucket db, BUCKET_NC_AUD_SIN_TAREAS, "NC", constructor.getSegsNCAuditoriaAccionesSinTareas(db, p_Error), snapFecha, p_Error, CACHE_AUDITORIA_ID
    Cache_ProyectoMaterializado_InsertBucket db, BUCKET_NC_AUD_PTE_CE, "NC", constructor.getSegsNCAuditoriaPteCE(db, p_Error), snapFecha, p_Error, CACHE_AUDITORIA_ID
    Cache_ProyectoMaterializado_InsertBucket db, BUCKET_NC_AUD_CE_CADUCADA, "NC", constructor.getSegsNCAuditoriaCECaducada(db, p_Error), snapFecha, p_Error, CACHE_AUDITORIA_ID
    Cache_ProyectoMaterializado_InsertBucket db, BUCKET_NC_AUD_CE_NO_CONFORME, "NC", constructor.getSegsNCAuditoriaCENoConforme(db, p_Error), snapFecha, p_Error, CACHE_AUDITORIA_ID
    If p_Error <> "" Then Err.Raise 1000

    detailCount = Cache_Materializado_DetailCount(db, CACHE_AUDITORIA_ID, p_Error)
    If p_Error <> "" Then Err.Raise 1000
    If detailCount = 0 Then
        p_Error = "Cache_IndicadoresAuditoriaMaterializado_Sincronizar: snapshot vacio no se puede marcar OK."
        Err.Raise 1000
    End If

    db.Execute "UPDATE " & CACHE_PROYECTO_HEADER & _
               " SET FechaSincronizacion=Now(), Estado='OK', ErrorUltimaSincronizacion=Null" & _
               " WHERE IDCacheIndicadorProyecto=" & CStr(CACHE_AUDITORIA_ID), dbFailOnError
    ws.CommitTrans
    Cache_InvalidarAuditoria p_Error
    If p_Error <> "" Then GoTo salir
    Cache_IndicadoresAuditoriaMaterializado_Sincronizar = True

salir:
    Set db = Nothing
    Set ws = Nothing
    Exit Function
errores:
    On Error Resume Next
    If Not ws Is Nothing Then ws.Rollback
    On Error GoTo 0
    If p_Error = "" Then p_Error = "Cache_IndicadoresAuditoriaMaterializado_Sincronizar: " & Err.Description
    Resume salir
End Function

Public Function Cache_IndicadoresProyectoMaterializado_SincronizarNC( _
                        ByVal p_IDNoConformidad As Long, _
                        Optional ByRef p_Error As String _
                    ) As Boolean
    Dim db As DAO.Database
    Dim ws As DAO.Workspace
    Dim snapFecha As Date

    On Error GoTo errores
    p_Error = ""
    Cache_IndicadoresProyectoMaterializado_SincronizarNC = False

    If p_IDNoConformidad <= 0 Then
        p_Error = "Cache_IndicadoresProyectoMaterializado_SincronizarNC requiere IDNoConformidad valido."
        GoTo salir
    End If

    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then GoTo salir
    If Not Cache_ProyectoMaterializadoSchemaReady(db, p_Error) Then GoTo salir
    If Not Cache_ProyectoMaterializado_HeaderReady(db, p_Error) Then GoTo salir

    Set ws = DBEngine.Workspaces(0)
    snapFecha = Now()
    ws.BeginTrans

    db.Execute "DELETE FROM " & CACHE_PROYECTO_DETALLE & _
               " WHERE IDCacheIndicadorProyecto=" & CStr(CACHE_PROYECTO_ID) & _
               " AND IDNoConformidad=" & CStr(p_IDNoConformidad), dbFailOnError

    Cache_ProyectoMaterializado_InsertBucketParaNC db, BUCKET_TAR_PROY_PTE_REPLAN, "TAREA", constructor.getSegsTareasProyectoPteReplanificar(db, p_Error), p_IDNoConformidad, snapFecha, p_Error
    Cache_ProyectoMaterializado_InsertBucketParaNC db, "TAR_PROY_IRREGULARES", "TAREA", constructor.getSegsTareasProyecto(db, p_Error), p_IDNoConformidad, snapFecha, p_Error
    Cache_ProyectoMaterializado_InsertBucketParaNC db, BUCKET_NC_PROY_REGISTRADAS, "NC", constructor.getSegsNCProyectoRegistradas(db, p_Error), p_IDNoConformidad, snapFecha, p_Error
    Cache_ProyectoMaterializado_InsertBucketParaNC db, BUCKET_NC_PROY_SIN_TAREAS, "NC", constructor.getSegsNCProyectoAccionesSinTareas(db, p_Error), p_IDNoConformidad, snapFecha, p_Error
    Cache_ProyectoMaterializado_InsertBucketParaNC db, BUCKET_NC_PROY_PTE_CE, "NC", constructor.getSegsNCProyectoPteCE(db, p_Error), p_IDNoConformidad, snapFecha, p_Error
    Cache_ProyectoMaterializado_InsertBucketParaNC db, BUCKET_NC_PROY_CE_CADUCADA, "NC", constructor.getSegsNCProyectoCECaducada(db, p_Error), p_IDNoConformidad, snapFecha, p_Error
    Cache_ProyectoMaterializado_InsertBucketParaNC db, BUCKET_NC_PROY_CE_NO_CONFORME, "NC", constructor.getSegsNCProyectoCENoConforme(db, p_Error), p_IDNoConformidad, snapFecha, p_Error
    If p_Error <> "" Then Err.Raise 1000

    db.Execute "UPDATE " & CACHE_PROYECTO_HEADER & _
               " SET FechaSincronizacion=Now(), Estado='OK', ErrorUltimaSincronizacion=Null" & _
               " WHERE IDCacheIndicadorProyecto=" & CStr(CACHE_PROYECTO_ID), dbFailOnError

    ws.CommitTrans
    Cache_InvalidarProyecto p_Error
    If p_Error <> "" Then GoTo salir
    Cache_IndicadoresProyectoMaterializado_SincronizarNC = True

salir:
    Set db = Nothing
    Set ws = Nothing
    Exit Function
errores:
    On Error Resume Next
    If Not ws Is Nothing Then ws.Rollback
    On Error GoTo 0
    If p_Error = "" Then p_Error = "Cache_IndicadoresProyectoMaterializado_SincronizarNC: " & Err.Description
    Resume salir
End Function

Public Function Cache_IndicadoresProyectoMaterializado_SincronizarAC( _
                        ByVal p_IDAccionCorrectiva As Long, _
                        Optional ByRef p_Error As String _
                    ) As Boolean
    Dim db As DAO.Database
    Dim idNC As Long

    On Error GoTo errores
    p_Error = ""
    Cache_IndicadoresProyectoMaterializado_SincronizarAC = False

    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then GoTo salir
    idNC = Cache_ProyectoMaterializado_ResolverNCDesdeAC(db, p_IDAccionCorrectiva, p_Error)
    If p_Error <> "" Then GoTo salir

    Cache_IndicadoresProyectoMaterializado_SincronizarAC = Cache_IndicadoresProyectoMaterializado_SincronizarNC(idNC, p_Error)

salir:
    Set db = Nothing
    Exit Function
errores:
    p_Error = "Cache_IndicadoresProyectoMaterializado_SincronizarAC: " & Err.Description
    Resume salir
End Function

Public Function Cache_IndicadoresProyectoMaterializado_SincronizarAR( _
                        ByVal p_IDAccionRealizada As Long, _
                        Optional ByRef p_Error As String _
                    ) As Boolean
    Dim db As DAO.Database
    Dim idNC As Long

    On Error GoTo errores
    p_Error = ""
    Cache_IndicadoresProyectoMaterializado_SincronizarAR = False

    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then GoTo salir
    idNC = Cache_ProyectoMaterializado_ResolverNCDesdeAR(db, p_IDAccionRealizada, p_Error)
    If p_Error <> "" Then GoTo salir

    Cache_IndicadoresProyectoMaterializado_SincronizarAR = Cache_IndicadoresProyectoMaterializado_SincronizarNC(idNC, p_Error)

salir:
    Set db = Nothing
    Exit Function
errores:
    p_Error = "Cache_IndicadoresProyectoMaterializado_SincronizarAR: " & Err.Description
    Resume salir
End Function

Private Sub Cache_ProyectoMaterializado_InsertBucketParaNC( _
                        ByVal p_Db As DAO.Database, _
                        ByVal p_Bucket As String, _
                        ByVal p_TipoFila As String, _
                        ByVal p_Items As Scripting.Dictionary, _
                        ByVal p_IDNoConformidad As Long, _
                        ByVal p_FechaSnapshot As Date, _
                        ByRef p_Error As String _
                    )
    Dim key As Variant

    On Error GoTo errores
    If p_Error <> "" Then Exit Sub
    If p_Items Is Nothing Then Exit Sub

    For Each key In p_Items.Keys
        If Cache_ProyectoMaterializado_ItemPerteneceNC(p_Items(key), p_IDNoConformidad, p_Error) Then
            Cache_ProyectoMaterializado_InsertItem p_Db, p_Bucket, p_TipoFila, p_Items(key), p_FechaSnapshot, p_Error
            If p_Error <> "" Then Exit Sub
        End If
    Next key
    Exit Sub
errores:
    p_Error = "Cache_ProyectoMaterializado_InsertBucketParaNC: " & Err.Description
End Sub

Private Function Cache_ProyectoMaterializado_ItemPerteneceNC( _
                        ByVal p_Item As Object, _
                        ByVal p_IDNoConformidad As Long, _
                        ByRef p_Error As String _
                    ) As Boolean
    Dim tarea As SegTareasProyecto
    Dim nc As SegNCProyecto
    Dim itemID As Long

    On Error GoTo errores
    If p_Item Is Nothing Then Exit Function

    If TypeOf p_Item Is SegTareasProyecto Then
        Set tarea = p_Item
        itemID = CLng(Nz(tarea.IDNoConformidad, 0))
    ElseIf TypeOf p_Item Is SegNCProyecto Then
        Set nc = p_Item
        itemID = CLng(Nz(nc.IDNoConformidad, 0))
    Else
        p_Error = "Tipo de fila no soportado para cache materializado incremental."
        Exit Function
    End If

    Cache_ProyectoMaterializado_ItemPerteneceNC = (itemID = p_IDNoConformidad)
    Exit Function
errores:
    p_Error = "Cache_ProyectoMaterializado_ItemPerteneceNC: " & Err.Description
End Function

Private Function Cache_ProyectoMaterializado_ResolverNCDesdeAC( _
                        ByVal p_Db As DAO.Database, _
                        ByVal p_IDAccionCorrectiva As Long, _
                        ByRef p_Error As String _
                    ) As Long
    Dim rs As DAO.Recordset
    Dim sql As String

    On Error GoTo errores
    p_Error = ""
    If p_IDAccionCorrectiva <= 0 Then
        p_Error = "Cache_IndicadoresProyectoMaterializado_SincronizarAC requiere IDAccionCorrectiva valido."
        GoTo salir
    End If

    sql = "SELECT IDNoConformidad FROM TbNCAccionCorrectivas WHERE IDAccionCorrectiva=" & CStr(p_IDAccionCorrectiva)
    Set rs = p_Db.OpenRecordset(sql, dbOpenSnapshot)
    If rs.EOF Then
        p_Error = "No se encontro accion correctiva de proyecto ID=" & CStr(p_IDAccionCorrectiva)
        GoTo salir
    End If
    Cache_ProyectoMaterializado_ResolverNCDesdeAC = CLng(Nz(rs.Fields("IDNoConformidad").Value, 0))
    If Cache_ProyectoMaterializado_ResolverNCDesdeAC <= 0 Then
        p_Error = "La accion correctiva no tiene IDNoConformidad asociado."
    End If

salir:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Exit Function
errores:
    p_Error = "Cache_ProyectoMaterializado_ResolverNCDesdeAC: " & Err.Description
    Resume salir
End Function

Private Function Cache_ProyectoMaterializado_ResolverNCDesdeAR( _
                        ByVal p_Db As DAO.Database, _
                        ByVal p_IDAccionRealizada As Long, _
                        ByRef p_Error As String _
                    ) As Long
    Dim rs As DAO.Recordset
    Dim sql As String

    On Error GoTo errores
    p_Error = ""
    If p_IDAccionRealizada <= 0 Then
        p_Error = "Cache_IndicadoresProyectoMaterializado_SincronizarAR requiere IDAccionRealizada valido."
        GoTo salir
    End If

    sql = "SELECT AC.IDNoConformidad " & _
          "FROM TbNCAccionesRealizadas AS AR " & _
          "INNER JOIN TbNCAccionCorrectivas AS AC ON AR.IDAccionCorrectiva=AC.IDAccionCorrectiva " & _
          "WHERE AR.IDAccionRealizada=" & CStr(p_IDAccionRealizada)
    Set rs = p_Db.OpenRecordset(sql, dbOpenSnapshot)
    If rs.EOF Then
        p_Error = "No se encontro accion realizada de proyecto ID=" & CStr(p_IDAccionRealizada)
        GoTo salir
    End If
    Cache_ProyectoMaterializado_ResolverNCDesdeAR = CLng(Nz(rs.Fields("IDNoConformidad").Value, 0))
    If Cache_ProyectoMaterializado_ResolverNCDesdeAR <= 0 Then
        p_Error = "La accion realizada no resuelve IDNoConformidad asociado."
    End If

salir:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Exit Function
errores:
    p_Error = "Cache_ProyectoMaterializado_ResolverNCDesdeAR: " & Err.Description
    Resume salir
End Function

Private Function Cache_ProyectoMaterializado_DetailCount(ByVal p_Db As DAO.Database, ByRef p_Error As String) As Long
    Cache_ProyectoMaterializado_DetailCount = Cache_Materializado_DetailCount(p_Db, CACHE_PROYECTO_ID, p_Error)
End Function

Private Function Cache_Materializado_DetailCount(ByVal p_Db As DAO.Database, ByVal p_CacheId As Long, ByRef p_Error As String) As Long
    Dim rs As DAO.Recordset
    Dim sql As String

    On Error GoTo errores
    If p_Error <> "" Then Exit Function

    sql = "SELECT COUNT(*) AS Total FROM " & CACHE_PROYECTO_DETALLE & _
          " WHERE IDCacheIndicadorProyecto=" & CStr(p_CacheId)
    Set rs = p_Db.OpenRecordset(sql, dbOpenSnapshot)
    If Not rs.EOF Then Cache_Materializado_DetailCount = CLng(Nz(rs.Fields("Total").Value, 0))

salir:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Exit Function
errores:
    p_Error = "Cache_Materializado_DetailCount: " & Err.Description
    Resume salir
End Function

Public Function Cache_Test_IndicadoresAuditoriaMaterializado_Limpiar(Optional ByRef p_Error As String) As Boolean
    Dim db As DAO.Database

    On Error GoTo errores
    p_Error = ""
    Cache_Test_IndicadoresAuditoriaMaterializado_Limpiar = False

    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then GoTo salir
    If Not Cache_ProyectoMaterializadoSchemaReady(db, p_Error) Then GoTo salir
    db.Execute "DELETE FROM " & CACHE_PROYECTO_DETALLE & " WHERE IDCacheIndicadorProyecto=" & CStr(CACHE_AUDITORIA_ID), dbFailOnError
    db.Execute "DELETE FROM " & CACHE_PROYECTO_HEADER & " WHERE IDCacheIndicadorProyecto=" & CStr(CACHE_AUDITORIA_ID), dbFailOnError
    Cache_Test_IndicadoresAuditoriaMaterializado_Limpiar = True

salir:
    Set db = Nothing
    Exit Function
errores:
    p_Error = "Cache_Test_IndicadoresAuditoriaMaterializado_Limpiar: " & Err.Description
    Resume salir
End Function

Public Function Cache_Test_IndicadoresProyectoMaterializado_Limpiar(Optional ByRef p_Error As String) As Boolean
    Dim db As DAO.Database

    On Error GoTo errores
    p_Error = ""
    Cache_Test_IndicadoresProyectoMaterializado_Limpiar = False

    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then GoTo salir
    If Not Cache_ProyectoMaterializadoSchemaReady(db, p_Error) Then GoTo salir
    db.Execute "DELETE FROM " & CACHE_PROYECTO_DETALLE & " WHERE IDCacheIndicadorProyecto=" & CStr(CACHE_PROYECTO_ID), dbFailOnError
    db.Execute "DELETE FROM " & CACHE_PROYECTO_HEADER & " WHERE IDCacheIndicadorProyecto=" & CStr(CACHE_PROYECTO_ID), dbFailOnError
    Cache_Test_IndicadoresProyectoMaterializado_Limpiar = True

salir:
    Set db = Nothing
    Exit Function
errores:
    p_Error = "Cache_Test_IndicadoresProyectoMaterializado_Limpiar: " & Err.Description
    Resume salir
End Function

Private Function Cache_ProyectoMaterializado_Count( _
                        ByVal p_Db As DAO.Database, _
                        ByVal p_Bucket As String, _
                        ByVal p_Responsable As String, _
                        ByRef p_Error As String _
                    ) As Long
    Cache_ProyectoMaterializado_Count = Cache_Materializado_Count(p_Db, CACHE_PROYECTO_ID, p_Bucket, p_Responsable, p_Error)
End Function

Private Function Cache_Materializado_Count( _
                        ByVal p_Db As DAO.Database, _
                        ByVal p_CacheId As Long, _
                        ByVal p_Bucket As String, _
                        ByVal p_Responsable As String, _
                        ByRef p_Error As String _
                    ) As Long
    Dim rs As DAO.Recordset
    Dim sql As String

    On Error GoTo errores
    If p_Error <> "" Then Exit Function

    sql = "SELECT COUNT(*) AS Total FROM " & CACHE_PROYECTO_DETALLE & _
          " WHERE IDCacheIndicadorProyecto=" & CStr(p_CacheId) & _
          " AND Bucket=" & Cache_ProyectoMaterializado_SqlText(p_Bucket)
    If p_Responsable <> vbNullString Then
        sql = sql & " AND ResponsableCalidad=" & Cache_ProyectoMaterializado_SqlText(p_Responsable)
    End If

    Set rs = p_Db.OpenRecordset(sql, dbOpenSnapshot)
    If Not rs.EOF Then Cache_Materializado_Count = CLng(Nz(rs.Fields("Total").Value, 0))

salir:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Exit Function
errores:
    p_Error = "Cache_Materializado_Count: " & Err.Description
    Resume salir
End Function

Private Sub Cache_ProyectoMaterializado_InsertBucket( _
                        ByVal p_Db As DAO.Database, _
                        ByVal p_Bucket As String, _
                        ByVal p_TipoFila As String, _
                        ByVal p_Items As Scripting.Dictionary, _
                        ByVal p_FechaSnapshot As Date, _
                        ByRef p_Error As String, _
                        Optional ByVal p_CacheId As Long = CACHE_PROYECTO_ID _
                    )
    Dim key As Variant

    On Error GoTo errores
    If p_Error <> "" Then Exit Sub
    If p_Items Is Nothing Then Exit Sub

    For Each key In p_Items.Keys
        Cache_ProyectoMaterializado_InsertItem p_Db, p_Bucket, p_TipoFila, p_Items(key), p_FechaSnapshot, p_Error, p_CacheId
        If p_Error <> "" Then Exit Sub
    Next key
    Exit Sub
errores:
    p_Error = "Cache_ProyectoMaterializado_InsertBucket: " & Err.Description
End Sub

Private Sub Cache_ProyectoMaterializado_InsertItem( _
                        ByVal p_Db As DAO.Database, _
                        ByVal p_Bucket As String, _
                        ByVal p_TipoFila As String, _
                        ByVal p_Item As Object, _
                        ByVal p_FechaSnapshot As Date, _
                        ByRef p_Error As String, _
                        Optional ByVal p_CacheId As Long = CACHE_PROYECTO_ID _
                    )
    Dim rs As DAO.Recordset
    Dim tarea As SegTareasProyecto
    Dim nc As SegNCProyecto
    Dim tareaAud As SegTareasAuditoria
    Dim ncAud As SegNCAuditoria

    On Error GoTo errores
    If p_Item Is Nothing Then Exit Sub

    Set rs = p_Db.OpenRecordset(CACHE_PROYECTO_DETALLE, dbOpenDynaset)
    rs.AddNew
    rs!IDCacheIndicadorProyecto = p_CacheId
    rs!Bucket = p_Bucket
    rs!TipoFila = p_TipoFila
    rs!FechaSnapshot = p_FechaSnapshot

    If TypeOf p_Item Is SegTareasProyecto Then
        Set tarea = p_Item
        Cache_ProyectoMaterializado_MapTarea rs, tarea
    ElseIf TypeOf p_Item Is SegNCProyecto Then
        Set nc = p_Item
        Cache_ProyectoMaterializado_MapNC rs, nc
    ElseIf TypeOf p_Item Is SegTareasAuditoria Then
        Set tareaAud = p_Item
        Cache_ProyectoMaterializado_MapTareaAuditoria rs, tareaAud
    ElseIf TypeOf p_Item Is SegNCAuditoria Then
        Set ncAud = p_Item
        Cache_ProyectoMaterializado_MapNCAuditoria rs, ncAud
    Else
        p_Error = "Tipo de fila no soportado para cache materializado."
        GoTo salir
    End If

    rs.Update

salir:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Exit Sub
errores:
    p_Error = "Cache_ProyectoMaterializado_InsertItem: " & Err.Description
    Resume salir
End Sub

Private Sub Cache_ProyectoMaterializado_MapTarea(ByVal p_Rs As DAO.Recordset, ByVal p_Item As SegTareasProyecto)
    p_Rs!IDEntidad = CLng(Nz(p_Item.IDAccionRealizada, 0))
    p_Rs!IDAccionRealizada = CLng(Nz(p_Item.IDAccionRealizada, 0))
    p_Rs!IDAccionCorrectiva = CLng(Nz(p_Item.IdAccionCorrectiva, 0))
    p_Rs!IDNoConformidad = CLng(Nz(p_Item.IDNoConformidad, 0))
    p_Rs!ResponsableCalidad = Nz(p_Item.RespCalidad, vbNullString)
    p_Rs!Tarea = Nz(p_Item.Tarea, vbNullString)
    p_Rs!Estado = Nz(p_Item.Estado, vbNullString)
    p_Rs!Tecnico = Nz(p_Item.Tecnico, vbNullString)
    p_Rs!TipoNC = Nz(p_Item.TipoNC, vbNullString)
    p_Rs!IDExpediente = CLng(Nz(p_Item.IDExpediente, 0))
    p_Rs!NAccion = Nz(p_Item.NAccion, vbNullString)
    Cache_ProyectoMaterializado_SetDate p_Rs, "FechaInicio", p_Item.FechaInicio
    Cache_ProyectoMaterializado_SetDate p_Rs, "FechaFinPrevista", p_Item.FechaFinPrevista
    Cache_ProyectoMaterializado_SetDate p_Rs, "FechaFinReal", p_Item.FechaFinReal
End Sub

Private Sub Cache_ProyectoMaterializado_MapNC(ByVal p_Rs As DAO.Recordset, ByVal p_Item As SegNCProyecto)
    p_Rs!IDEntidad = CLng(Nz(p_Item.IDNoConformidad, 0))
    p_Rs!IDNoConformidad = CLng(Nz(p_Item.IDNoConformidad, 0))
    p_Rs!ResponsableCalidad = Nz(p_Item.NombreCalidad, vbNullString)
    p_Rs!CodigoNoConformidad = Nz(p_Item.CodigoNoConformidad, vbNullString)
    p_Rs!Descripcion = Nz(p_Item.Descripcion, vbNullString)
    p_Rs!Nemotecnico = Nz(p_Item.Nemotecnico, vbNullString)
    p_Rs!Estado = Nz(p_Item.Estado, vbNullString)
    p_Rs!Tecnico = Nz(p_Item.Tecnico, vbNullString)
    p_Rs!IDExpediente = CLng(Nz(p_Item.IDExpediente, 0))
    p_Rs!RequiereControlEficacia = Nz(p_Item.RequiereControlEficacia, vbNullString)
    p_Rs!ResultadoControlEficacia = Nz(p_Item.ResultadoControlEficacia, vbNullString)
    Cache_ProyectoMaterializado_SetDate p_Rs, "FechaCierre", p_Item.FECHACIERRE
End Sub

Private Sub Cache_ProyectoMaterializado_MapTareaAuditoria(ByVal p_Rs As DAO.Recordset, ByVal p_Item As SegTareasAuditoria)
    p_Rs!IDEntidad = CLng(Nz(p_Item.IDAccionRealizada, 0))
    p_Rs!IDAccionRealizada = CLng(Nz(p_Item.IDAccionRealizada, 0))
    p_Rs!IDAccionCorrectiva = CLng(Nz(p_Item.IdAccionCorrectiva, 0))
    p_Rs!IDNoConformidad = CLng(Nz(p_Item.id, 0))
    p_Rs!ResponsableCalidad = Nz(p_Item.Responsable, vbNullString)
    p_Rs!Tarea = Nz(p_Item.Tarea, vbNullString)
    p_Rs!Estado = Nz(p_Item.Estado, vbNullString)
    p_Rs!TipoNC = Nz(p_Item.TipoNC, vbNullString)
    p_Rs!NAccion = Nz(p_Item.NAccion, vbNullString)
    p_Rs!CodigoNoConformidad = Nz(p_Item.Numero, vbNullString)
    p_Rs!Nemotecnico = Nz(p_Item.Auditoria, vbNullString)
    Cache_ProyectoMaterializado_SetDate p_Rs, "FechaInicio", p_Item.FechaInicio
    Cache_ProyectoMaterializado_SetDate p_Rs, "FechaFinPrevista", p_Item.FechaFinPrevista
    Cache_ProyectoMaterializado_SetDate p_Rs, "FechaFinReal", p_Item.FechaFinReal
End Sub

Private Sub Cache_ProyectoMaterializado_MapNCAuditoria(ByVal p_Rs As DAO.Recordset, ByVal p_Item As SegNCAuditoria)
    p_Rs!IDEntidad = CLng(Nz(p_Item.id, 0))
    p_Rs!IDNoConformidad = CLng(Nz(p_Item.id, 0))
    p_Rs!ResponsableCalidad = Nz(p_Item.Responsable, vbNullString)
    p_Rs!CodigoNoConformidad = Nz(p_Item.Numero, vbNullString)
    p_Rs!Descripcion = Nz(p_Item.Descripcion, vbNullString)
    p_Rs!Estado = Nz(p_Item.Estado, vbNullString)
    p_Rs!Nemotecnico = Nz(p_Item.Auditoria, vbNullString)
    Cache_ProyectoMaterializado_SetDate p_Rs, "FechaCierre", p_Item.FECHACIERRE
End Sub

Private Sub Cache_ProyectoMaterializado_SetDate(ByVal p_Rs As DAO.Recordset, ByVal p_FieldName As String, ByVal p_Value As Variant)
    If IsDate(p_Value) Then p_Rs.Fields(p_FieldName).Value = CDate(p_Value)
End Sub

Private Function Cache_ProyectoMaterializado_SqlText(ByVal p_Value As String) As String
    Cache_ProyectoMaterializado_SqlText = "'" & Replace(Nz(p_Value, vbNullString), "'", "''") & "'"
End Function

' ============================================================
' API PUBLICA — PROYECTO
' ============================================================

' Obtener bucket cacheado de proyecto.
' Si p_Reset = True o no existe, ejecuta constructor y guarda.
Public Function Cache_Indicadores_Proyecto( _
                        ByVal p_Bucket As String, _
                        Optional ByVal p_Reset As Boolean = False, _
                        Optional ByRef p_Error As String _
                    ) As Scripting.Dictionary
    Dim m_FuncName As String
    Dim m_Result As Scripting.Dictionary
    
    On Error GoTo errores
    p_Error = ""
    
    If m_CacheProyecto Is Nothing Then
        Set m_CacheProyecto = New Scripting.Dictionary
        m_CacheProyecto.CompareMode = TextCompare
    End If
    
    ' Si se pide reset o no existe, recalcular
    If p_Reset Or Not m_CacheProyecto.Exists(p_Bucket) Then
        m_FuncName = Cache_Proyecto_GetConstructorFunc(p_Bucket)
        If m_FuncName = "" Then
            p_Error = "Cache_Indicadores_Proyecto: bucket desconocido '" & p_Bucket & "'"
            Set Cache_Indicadores_Proyecto = Nothing
            Exit Function
        End If
        Set m_Result = Cache_EjecutarConstructor(m_FuncName, p_Error)
        If p_Error <> "" Then
            Set Cache_Indicadores_Proyecto = Nothing
            Exit Function
        End If
        ' Guardar incluso si es Nothing (para no reintentar)
        If m_Result Is Nothing Then
            ' Marcar con clave pero sin objeto — cuenta como existente
            If Not m_CacheProyecto.Exists(p_Bucket) Then
                ' No guardar Nothing para permitir reintento la proxima vez
            End If
        Else
            m_CacheProyecto(p_Bucket) = m_Result
        End If
    End If
    
    If m_CacheProyecto.Exists(p_Bucket) Then
        Set Cache_Indicadores_Proyecto = m_CacheProyecto(p_Bucket)
    Else
        Set Cache_Indicadores_Proyecto = Nothing
    End If
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "Cache_Indicadores_Proyecto: " & Err.Description
    End If
    Set Cache_Indicadores_Proyecto = Nothing
End Function

' ============================================================
' API PUBLICA — AUDITORIA
' ============================================================

Public Function Cache_Indicadores_Auditoria( _
                        ByVal p_Bucket As String, _
                        Optional ByVal p_Reset As Boolean = False, _
                        Optional ByRef p_Error As String _
                    ) As Scripting.Dictionary
    Dim m_FuncName As String
    Dim m_Result As Scripting.Dictionary
    
    On Error GoTo errores
    p_Error = ""
    
    If m_CacheAuditoria Is Nothing Then
        Set m_CacheAuditoria = New Scripting.Dictionary
        m_CacheAuditoria.CompareMode = TextCompare
    End If
    
    If p_Reset Or Not m_CacheAuditoria.Exists(p_Bucket) Then
        m_FuncName = Cache_Auditoria_GetConstructorFunc(p_Bucket)
        If m_FuncName = "" Then
            p_Error = "Cache_Indicadores_Auditoria: bucket desconocido '" & p_Bucket & "'"
            Set Cache_Indicadores_Auditoria = Nothing
            Exit Function
        End If
        Set m_Result = Cache_EjecutarConstructor(m_FuncName, p_Error)
        If p_Error <> "" Then
            Set Cache_Indicadores_Auditoria = Nothing
            Exit Function
        End If
        If Not m_Result Is Nothing Then
            m_CacheAuditoria(p_Bucket) = m_Result
        End If
    End If
    
    If m_CacheAuditoria.Exists(p_Bucket) Then
        Set Cache_Indicadores_Auditoria = m_CacheAuditoria(p_Bucket)
    Else
        Set Cache_Indicadores_Auditoria = Nothing
    End If
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "Cache_Indicadores_Auditoria: " & Err.Description
    End If
    Set Cache_Indicadores_Auditoria = Nothing
End Function

' ============================================================
' API PUBLICA — INVALIDACION
' ============================================================

' Invalida TODOS los caches (proyecto y auditoria)
Public Sub Cache_InvalidarTodo(Optional ByRef p_Error As String)
    On Error GoTo errores
    p_Error = ""
    Set m_CacheProyecto = Nothing
    Set m_CacheAuditoria = Nothing
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        p_Error = "Cache_InvalidarTodo: " & Err.Description
    End If
End Sub

' Invalida solo proyecto
Public Sub Cache_InvalidarProyecto(Optional ByRef p_Error As String)
    On Error GoTo errores
    p_Error = ""
    Set m_CacheProyecto = Nothing
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        p_Error = "Cache_InvalidarProyecto: " & Err.Description
    End If
End Sub

' Invalida solo auditoria
Public Sub Cache_InvalidarAuditoria(Optional ByRef p_Error As String)
    On Error GoTo errores
    p_Error = ""
    Set m_CacheAuditoria = Nothing
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        p_Error = "Cache_InvalidarAuditoria: " & Err.Description
    End If
End Sub

' ============================================================
' API PUBLICA — HELPERS TEST-ONLY
' ============================================================

' Helpers estrechos para tests unitarios/in-memory de cache.
' No ejecutan constructores ni acceden a backend.
Public Sub Cache_Test_ResetAll(Optional ByRef p_Error As String)
    On Error GoTo errores
    p_Error = ""
    Set m_CacheProyecto = Nothing
    Set m_CacheAuditoria = Nothing
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        p_Error = "Cache_Test_ResetAll: " & Err.Description
    End If
End Sub

Public Sub Cache_Test_SeedProyectoBucket( _
                        ByVal p_Bucket As String, _
                        ByVal p_Data As Scripting.Dictionary, _
                        Optional ByRef p_Error As String _
                    )
    On Error GoTo errores
    p_Error = ""

    If p_Data Is Nothing Then
        p_Error = "Cache_Test_SeedProyectoBucket: p_Data no puede ser Nothing"
        Exit Sub
    End If

    If Cache_Proyecto_GetConstructorFunc(p_Bucket) = "" Then
        p_Error = "Cache_Test_SeedProyectoBucket: bucket desconocido '" & p_Bucket & "'"
        Exit Sub
    End If

    Cache_EnsureProyecto
    If m_CacheProyecto.Exists(p_Bucket) Then m_CacheProyecto.Remove p_Bucket
    m_CacheProyecto.Add p_Bucket, p_Data
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        p_Error = "Cache_Test_SeedProyectoBucket: " & Err.Description
    End If
End Sub

Public Sub Cache_Test_SeedAuditoriaBucket( _
                        ByVal p_Bucket As String, _
                        ByVal p_Data As Scripting.Dictionary, _
                        Optional ByRef p_Error As String _
                    )
    On Error GoTo errores
    p_Error = ""

    If p_Data Is Nothing Then
        p_Error = "Cache_Test_SeedAuditoriaBucket: p_Data no puede ser Nothing"
        Exit Sub
    End If

    If Cache_Auditoria_GetConstructorFunc(p_Bucket) = "" Then
        p_Error = "Cache_Test_SeedAuditoriaBucket: bucket desconocido '" & p_Bucket & "'"
        Exit Sub
    End If

    Cache_EnsureAuditoria
    If m_CacheAuditoria.Exists(p_Bucket) Then m_CacheAuditoria.Remove p_Bucket
    m_CacheAuditoria.Add p_Bucket, p_Data
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        p_Error = "Cache_Test_SeedAuditoriaBucket: " & Err.Description
    End If
End Sub

' ============================================================
' API PUBLICA — CONSULTA DE ESTADO
' ============================================================

' Devuelve True si el cache de proyecto esta cargado
Public Function Cache_Proyecto_EstaCargado() As Boolean
    If m_CacheProyecto Is Nothing Then
        Cache_Proyecto_EstaCargado = False
    Else
        Cache_Proyecto_EstaCargado = (m_CacheProyecto.Count > 0)
    End If
End Function

Public Function Cache_Auditoria_EstaCargado() As Boolean
    If m_CacheAuditoria Is Nothing Then
        Cache_Auditoria_EstaCargado = False
    Else
        Cache_Auditoria_EstaCargado = (m_CacheAuditoria.Count > 0)
    End If
End Function
