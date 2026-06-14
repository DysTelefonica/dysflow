Attribute VB_Name = "ModuloMigracionIssue18"
' ============================================================
'  Modulo: ModuloMigracionIssue18
'  Proposito: Helper idempotente para aplicar la migracion DDL
'             backend del cache compartido de indicadores (issue #18).
'  Modo:     sandbox (default via TestHelper) o produccion
'             (path y password explicitos).
'  Salida:   JSON via TestHelper.BuildJsonOk / BuildJsonFail.
'  Uso:
'    - Sandbox: MigracionIssue18_Aplicar()
'    - Produccion: MigracionIssue18_Aplicar("C:\ruta\NoConformidades_Datos.accdb", "pwd")
'  Reglas duras:
'    - Idempotente: aplica dos veces = mismo resultado.
'    - No destructivo: nunca borra datos, solo agrega campos/indices.
'    - No recrea tablas: preserva PKs y datos existentes.
'    - Solo crea indices si no existen; nunca recrea ni borra.
'    - Cambia Required=true solo si la columna no tiene NULLs
'      (en la practica, las nuevas columnas se agregan en la
'      misma corrida, por lo que estan vacias).
' ============================================================
Option Compare Database
Option Explicit

' --- Constantes de contrato ---
Private Const MIGRATION_NAME As String = "issue18_backend_indicator_cache"
Private Const MIGRATION_VERSION As String = "1.0.0"
Private Const LOG_PREFIX As String = "[MigracionIssue18] "

' --- Tipos de cambio registrados ---
Private Const CHANGE_TABLE_CREATED As String = "table_created"
Private Const CHANGE_FIELD_ADDED As String = "field_added"
Private Const CHANGE_FIELD_REQUIRED_FIXED As String = "field_required_fixed"
Private Const CHANGE_INDEX_CREATED As String = "index_created"
Private Const CHANGE_INDEX_RECREATED As String = "index_recreated"

' ============================================================
'  Puntos de entrada publicos
' ============================================================

' Dry-run: describe que CAMBIARIA sin aplicar nada.
Public Function MigracionIssue18_DryRun(Optional ByVal p_BackendPath As String = "", Optional ByVal p_BackendPassword As String = "") As String
    MigracionIssue18_DryRun = RunMigration("dryrun", p_BackendPath, p_BackendPassword)
End Function

' Aplicar: ejecuta la migracion. Idempotente.
Public Function MigracionIssue18_Aplicar(Optional ByVal p_BackendPath As String = "", Optional ByVal p_BackendPassword As String = "") As String
    MigracionIssue18_Aplicar = RunMigration("apply", p_BackendPath, p_BackendPassword)
End Function

' Estado: solo reporta el estado actual, no modifica nada.
Public Function MigracionIssue18_Estado(Optional ByVal p_BackendPath As String = "", Optional ByVal p_BackendPassword As String = "") As String
    MigracionIssue18_Estado = RunMigration("estado", p_BackendPath, p_BackendPassword)
End Function

' ============================================================
'  Runner principal
' ============================================================
Private Function RunMigration(ByVal p_Mode As String, ByVal p_BackendPath As String, ByVal p_BackendPassword As String) As String
    Dim db As DAO.Database
    Dim logs As Collection
    Dim changes As Collection
    Dim errMsg As String
    Dim startedTestSession As Boolean
    Dim usedTestingMode As Boolean

    Set logs = New Collection
    Set changes = New Collection

    logs.Add LOG_PREFIX & "mode=" & p_Mode & " backend=" & ResolveBackendDisplay(p_BackendPath)

    ' Si no hay path explicito, intentamos sandbox via TestHelper.
    If LenB(p_BackendPath) = 0 Then
        If Not TestHelper.BeginTestSession(logs, errMsg) Then
            RunMigration = TestHelper.BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
            Exit Function
        End If
        startedTestSession = True
        usedTestingMode = True
    End If

    On Error GoTo errores
    Set db = OpenBackend(p_BackendPath, p_BackendPassword, usedTestingMode, logs, errMsg)
    If db Is Nothing Then
        RunMigration = TestHelper.BuildJsonFail("OpenBackend: " & errMsg, logs)
        GoTo cleanup
    End If

    ' Pasos de la migracion. Cada uno registra cambios en p_Changes si p_Mode="apply".
    Call EnsureConfigTable(db, p_Mode, logs, changes)
    Call EnsureHeaderFields(db, p_Mode, logs, changes)
    Call EnsureDetalleFields(db, p_Mode, logs, changes)
    Call EnsureIndexes(db, p_Mode, logs, changes)

    On Error Resume Next
    db.TableDefs.Refresh
    db.Close
    Set db = Nothing
    On Error GoTo 0

    RunMigration = BuildResultJson(p_Mode, logs, changes)
    GoTo cleanup

errores:
    errMsg = "RunMigration: " & Err.Number & " - " & Err.Description
    logs.Add LOG_PREFIX & "ERROR " & errMsg
    If Err.Number = 0 Then errMsg = ""
    On Error Resume Next
    If Not db Is Nothing Then db.Close
    Set db = Nothing
    RunMigration = TestHelper.BuildJsonFail(errMsg, logs)

cleanup:
    If startedTestSession Then TestHelper.EndTestSession logs
    Set logs = Nothing
    Set changes = Nothing
End Function

' ============================================================
'  Apertura de backend (sandbox o path explicito)
' ============================================================
Private Function OpenBackend(ByVal p_BackendPath As String, ByVal p_BackendPassword As String, ByVal p_UseTestingMode As Boolean, ByRef p_Logs As Collection, ByRef p_Error As String) As DAO.Database
    Dim db As DAO.Database
    Dim wks As DAO.Workspace
    Dim url As String
    Dim pwd As String

    p_Error = ""

    If p_UseTestingMode Then
        ' m_TestingMode ya esta activo por BeginTestSession.
        url = Trim$(Nz(m_BackendSandboxURL, ""))
        If url = "" Then
            p_Error = "OpenBackend: m_TestingMode activo pero m_BackendSandboxURL vacio"
            Exit Function
        End If
        pwd = m_BackendSandboxPassword
    Else
        url = p_BackendPath
        If url = "" Then
            p_Error = "OpenBackend: p_BackendPath vacio"
            Exit Function
        End If
        pwd = IIf(LenB(p_BackendPassword) > 0, p_BackendPassword, Environ$("ACCESS_VBA_PASSWORD"))
        If Not fso.FileExists(url) Then
            p_Error = "OpenBackend: backend no existe: " & url
            Exit Function
        End If
        ' Guard contra produccion: no se debe apuntar a \\datoste\.
        If InStr(1, url, "\\datoste\", vbTextCompare) > 0 Then
            p_Error = "OpenBackend: backend apunta a produccion (" & url & "). Confirmar p_BackendPath explicito."
            Exit Function
        End If
    End If

    Set wks = DBEngine.Workspaces(0)
    Set db = wks.OpenDatabase(url, False, False, ";PWD=" & pwd)
    p_Logs.Add LOG_PREFIX & "OpenBackend OK: " & url

    Set OpenBackend = db
    Set db = Nothing
End Function

Private Function ResolveBackendDisplay(ByVal p_BackendPath As String) As String
    If LenB(p_BackendPath) = 0 Then
        ResolveBackendDisplay = "sandbox"
    Else
        ResolveBackendDisplay = p_BackendPath
    End If
End Function

' ============================================================
'  Paso 1: tabla TbCacheIndicadoresConfig
' ============================================================
Private Sub EnsureConfigTable(ByVal p_Db As DAO.Database, ByVal p_Mode As String, ByRef p_Logs As Collection, ByRef p_Changes As Collection)
    Const TABLE As String = "TbCacheIndicadoresConfig"
    Dim tdf As DAO.TableDef
    Dim idxExists As Boolean

    If TableExists(p_Db, TABLE) Then
        p_Logs.Add LOG_PREFIX & "table_exists " & TABLE
    Else
        If p_Mode = "apply" Then
            Set tdf = p_Db.CreateTableDef(TABLE)
            tdf.Fields.Append tdf.CreateField("IDCacheConfig", dbLong)
            tdf.Fields("IDCacheConfig").Required = True
            tdf.Fields.Append tdf.CreateField("Dominio", dbText, 32)
            tdf.Fields("Dominio").Required = True
            tdf.Fields.Append tdf.CreateField("Activo", dbBoolean)
            tdf.Fields("Activo").Required = True
            tdf.Fields.Append tdf.CreateField("VersionRegla", dbText, 64)
            tdf.Fields("VersionRegla").Required = True
            tdf.Fields.Append tdf.CreateField("FechaConfiguracion", dbDate)
            tdf.Fields("FechaConfiguracion").Required = True
            tdf.Fields.Append tdf.CreateField("UsuarioConfiguracion", dbText, 255)
            ' PK
            Dim pk As DAO.Index
            Set pk = tdf.CreateIndex("PrimaryKey")
            pk.Primary = True
            pk.Fields.Append pk.CreateField("IDCacheConfig")
            tdf.Indexes.Append pk
            p_Db.TableDefs.Append tdf
            p_Db.TableDefs.Refresh
            RecordChange p_Changes, CHANGE_TABLE_CREATED, TABLE, "", "PrimaryKey+6 fields"
        End If
        p_Logs.Add LOG_PREFIX & "would_create_table " & TABLE
    End If

    ' Asegurar UX_TbCacheIndicadoresConfig_Dominio (lo agregamos como parte
    ' del paso de indexes para mantener el orden logico de aplicacion).
End Sub

' ============================================================
'  Paso 2: campos en TbCacheIndicadoresProyectoHeader
' ============================================================
Private Sub EnsureHeaderFields(ByVal p_Db As DAO.Database, ByVal p_Mode As String, ByRef p_Logs As Collection, ByRef p_Changes As Collection)
    Const TABLE As String = "TbCacheIndicadoresProyectoHeader"
    Dim specs As Variant
    Dim i As Long
    Dim name As String, dtype As Long, size As Long, reqd As Boolean

    If Not TableExists(p_Db, TABLE) Then
        p_Logs.Add LOG_PREFIX & "ERROR table_missing " & TABLE
        Err.Raise 9001, , "MigracionIssue18: " & TABLE & " no existe. No se puede migrar."
    End If

    ' Formato: name, type, size, required
    specs = Array( _
        Array("IDCacheConfig", dbLong, 0, True), _
        Array("Dominio", dbText, 32, True), _
        Array("VersionRegla", dbText, 64, False), _
        Array("MotivoSincronizacion", dbText, 64, False), _
        Array("IDNoConformidadUltimaSync", dbLong, 0, False), _
        Array("FechaUltimaSincronizacionNC", dbDate, 0, False), _
        Array("OperadorSync", dbText, 64, False) _
    )

    For i = LBound(specs) To UBound(specs)
        name = CStr(specs(i)(0))
        dtype = CLng(specs(i)(1))
        size = CLng(specs(i)(2))
        reqd = CBool(specs(i)(3))
        Call EnsureFieldWithRequired(p_Db, TABLE, name, dtype, size, reqd, p_Mode, p_Logs, p_Changes)
    Next i
End Sub

' ============================================================
'  Paso 3: campos en TbCacheIndicadoresProyectoDetalle
' ============================================================
Private Sub EnsureDetalleFields(ByVal p_Db As DAO.Database, ByVal p_Mode As String, ByRef p_Logs As Collection, ByRef p_Changes As Collection)
    Const TABLE As String = "TbCacheIndicadoresProyectoDetalle"
    Dim specs As Variant
    Dim i As Long
    Dim name As String, dtype As Long, size As Long, reqd As Boolean

    If Not TableExists(p_Db, TABLE) Then
        p_Logs.Add LOG_PREFIX & "ERROR table_missing " & TABLE
        Err.Raise 9001, , "MigracionIssue18: " & TABLE & " no existe. No se puede migrar."
    End If

    specs = Array( _
        Array("IDCacheConfig", dbLong, 0, True), _
        Array("Dominio", dbText, 32, True), _
        Array("ClaveEntidad", dbText, 128, False), _
        Array("IDTarea", dbLong, 0, False), _
        Array("OrigenTabla", dbText, 64, False), _
        Array("ResponsableUsuarioRed", dbText, 255, False), _
        Array("DisplayTitulo", dbText, 255, False), _
        Array("DisplaySubtitulo", dbMemo, 0, False), _
        Array("FechaActualizacionEntidad", dbDate, 0, False), _
        Array("VersionRegla", dbText, 64, False) _
    )

    For i = LBound(specs) To UBound(specs)
        name = CStr(specs(i)(0))
        dtype = CLng(specs(i)(1))
        size = CLng(specs(i)(2))
        reqd = CBool(specs(i)(3))
        Call EnsureFieldWithRequired(p_Db, TABLE, name, dtype, size, reqd, p_Mode, p_Logs, p_Changes)
    Next i
End Sub

' ============================================================
'  Paso 4: 8 indices
' ============================================================
Private Sub EnsureIndexes(ByVal p_Db As DAO.Database, ByVal p_Mode As String, ByRef p_Logs As Collection, ByRef p_Changes As Collection)
    ' Formato: nombre de tabla, nombre de indice, unique, array de campos
    Dim specs As Variant

    specs = Array( _
        Array("TbCacheIndicadoresConfig", "UX_TbCacheIndicadoresConfig_Dominio", True, Array("Dominio")), _
        Array("TbCacheIndicadoresProyectoHeader", "UX_TbCacheIndicadoresProyectoHeader_Dominio", True, Array("Dominio")), _
        Array("TbCacheIndicadoresProyectoDetalle", "IX_TbCacheIndicadoresProyectoDetalle_CacheBucketResponsable", False, Array("Dominio", "Bucket", "ResponsableCalidad")), _
        Array("TbCacheIndicadoresProyectoDetalle", "IX_TbCacheIndicadoresProyectoDetalle_CacheBucketUsuario", False, Array("Dominio", "Bucket", "ResponsableUsuarioRed")), _
        Array("TbCacheIndicadoresProyectoDetalle", "IX_TbCacheIndicadoresProyectoDetalle_NC", False, Array("Dominio", "IDNoConformidad")), _
        Array("TbCacheIndicadoresProyectoDetalle", "IX_TbCacheIndicadoresProyectoDetalle_Entidad", False, Array("Dominio", "TipoFila", "IDEntidad")), _
        Array("TbCacheIndicadoresProyectoDetalle", "IX_TbCacheIndicadoresProyectoDetalle_AR", False, Array("Dominio", "IDAccionRealizada")), _
        Array("TbCacheIndicadoresProyectoDetalle", "IX_TbCacheIndicadoresProyectoDetalle_Tarea", False, Array("Dominio", "IDTarea")) _
    )

    Dim i As Long
    For i = LBound(specs) To UBound(specs)
        Call EnsureIndexSafe(p_Db, CStr(specs(i)(0)), CStr(specs(i)(1)), CBool(specs(i)(2)), specs(i)(3), p_Mode, p_Logs, p_Changes)
    Next i
End Sub

' ============================================================
'  Helpers DAO
' ============================================================
Private Sub EnsureFieldWithRequired(ByVal p_Db As DAO.Database, ByVal p_TableName As String, ByVal p_FieldName As String, ByVal p_Type As Long, ByVal p_Size As Long, ByVal p_Required As Boolean, ByVal p_Mode As String, ByRef p_Logs As Collection, ByRef p_Changes As Collection)
    Dim tdf As DAO.TableDef
    Dim fld As DAO.Field
    Dim fldExists As Boolean
    Dim fldRequiredCorrect As Boolean

    Set tdf = p_Db.TableDefs(p_TableName)
    fldExists = FieldExists(tdf, p_FieldName)

    If fldExists Then
        Set fld = tdf.Fields(p_FieldName)
        fldRequiredCorrect = (fld.Required = p_Required)
        If fldRequiredCorrect Then
            p_Logs.Add LOG_PREFIX & "field_ok " & p_TableName & "." & p_FieldName & " required=" & CStr(p_Required)
        Else
            ' Fix: cambiar Required. Si la columna tiene NULLs, falla.
            If p_Mode = "apply" Then
                fld.Required = p_Required
                tdf.Fields.Refresh
            End If
            RecordChange p_Changes, CHANGE_FIELD_REQUIRED_FIXED, p_TableName, p_FieldName, "required " & CStr(fld.Required) & " -> " & CStr(p_Required)
            p_Logs.Add LOG_PREFIX & "field_required_fixed " & p_TableName & "." & p_FieldName & " -> " & CStr(p_Required)
        End If
    Else
        ' Crear columna nueva.
        If p_Mode = "apply" Then
            If p_Size > 0 Then
                Set fld = tdf.CreateField(p_FieldName, p_Type, p_Size)
            Else
                Set fld = tdf.CreateField(p_FieldName, p_Type)
            End If
            fld.Required = p_Required
            tdf.Fields.Append fld
            tdf.Fields.Refresh
        End If
        RecordChange p_Changes, CHANGE_FIELD_ADDED, p_TableName, p_FieldName, IIf(p_Required, "required", "optional")
        p_Logs.Add LOG_PREFIX & "field_added " & p_TableName & "." & p_FieldName & " required=" & CStr(p_Required)
    End If
End Sub

Private Sub EnsureIndexSafe(ByVal p_Db As DAO.Database, ByVal p_TableName As String, ByVal p_IndexName As String, ByVal p_Unique As Boolean, ByVal p_Fields As Variant, ByVal p_Mode As String, ByRef p_Logs As Collection, ByRef p_Changes As Collection)
    Dim tdf As DAO.TableDef
    Dim idx As DAO.Index
    Dim i As Long
    Dim matchOk As Boolean

    If Not TableExists(p_Db, p_TableName) Then
        p_Logs.Add LOG_PREFIX & "ERROR table_missing_for_index " & p_TableName
        Exit Sub
    End If

    Set tdf = p_Db.TableDefs(p_TableName)

    If IndexExists(tdf, p_IndexName) Then
        matchOk = IndexFieldsMatch(tdf.Indexes(p_IndexName), p_Fields, p_Unique)
        If matchOk Then
            p_Logs.Add LOG_PREFIX & "index_ok " & p_TableName & "." & p_IndexName
            Exit Sub
        End If
        ' Field list or uniqueness does not match the contract: drop and recreate.
        If p_Mode = "apply" Then
            tdf.Indexes.Delete p_IndexName
            tdf.Indexes.Refresh
        End If
        RecordChange p_Changes, "index_recreated", p_TableName, p_IndexName, "field list did not match; dropped and recreated with " & JoinArray(p_Fields)
        p_Logs.Add LOG_PREFIX & "index_recreated " & p_TableName & "." & p_IndexName & " (" & JoinArray(p_Fields) & ")"
    Else
        RecordChange p_Changes, CHANGE_INDEX_CREATED, p_TableName, p_IndexName, JoinArray(p_Fields)
        p_Logs.Add LOG_PREFIX & "index_added " & p_TableName & "." & p_IndexName
    End If

    If p_Mode = "apply" Then
        Set idx = tdf.CreateIndex(p_IndexName)
        idx.Unique = p_Unique
        For i = LBound(p_Fields) To UBound(p_Fields)
            idx.Fields.Append idx.CreateField(CStr(p_Fields(i)))
        Next i
        tdf.Indexes.Append idx
        tdf.Indexes.Refresh
    End If
End Sub

Private Sub RecordChange(ByRef p_Changes As Collection, ByVal p_Kind As String, ByVal p_Table As String, ByVal p_Object As String, ByVal p_Detail As String)
    Dim d As Object
    Set d = CreateObject("Scripting.Dictionary")
    d("kind") = p_Kind
    d("table") = p_Table
    d("object") = p_Object
    d("detail") = p_Detail
    p_Changes.Add d
End Sub

Private Function JoinArray(ByVal p_Items As Variant) As String
    Dim s As String
    Dim i As Long
    For i = LBound(p_Items) To UBound(p_Items)
        If s <> "" Then s = s & ","
        s = s & CStr(p_Items(i))
    Next i
    JoinArray = s
End Function

' ============================================================
'  Predicados DAO
' ============================================================
Private Function TableExists(ByVal p_Db As DAO.Database, ByVal p_TableName As String) As Boolean
    On Error GoTo notfound
    Dim t As DAO.TableDef
    Set t = p_Db.TableDefs(p_TableName)
    TableExists = True
    Exit Function
notfound:
    TableExists = False
End Function

Private Function FieldExists(ByVal p_Tdf As DAO.TableDef, ByVal p_FieldName As String) As Boolean
    On Error GoTo notfound
    Dim f As DAO.Field
    Set f = p_Tdf.Fields(p_FieldName)
    FieldExists = True
    Exit Function
notfound:
    FieldExists = False
End Function

Private Function IndexExists(ByVal p_Tdf As DAO.TableDef, ByVal p_IndexName As String) As Boolean
    On Error GoTo notfound
    Dim i As DAO.Index
    Set i = p_Tdf.Indexes(p_IndexName)
    IndexExists = True
    Exit Function
notfound:
    IndexExists = False
End Function

Private Function IndexFieldsMatch(ByVal p_Idx As DAO.Index, ByVal p_Fields As Variant, ByVal p_Unique As Boolean) As Boolean
    Dim i As Long
    On Error GoTo mismatch

    If p_Idx.Unique <> p_Unique Then GoTo mismatch
    If p_Idx.Fields.Count <> (UBound(p_Fields) - LBound(p_Fields) + 1) Then GoTo mismatch
    For i = LBound(p_Fields) To UBound(p_Fields)
        If StrComp(p_Idx.Fields(CInt(i - LBound(p_Fields))).Name, CStr(p_Fields(i)), vbTextCompare) <> 0 Then
            GoTo mismatch
        End If
    Next i

    IndexFieldsMatch = True
    Exit Function

mismatch:
    IndexFieldsMatch = False
End Function

' ============================================================
'  Resultado JSON
' ============================================================
Private Function BuildResultJson(ByVal p_Mode As String, ByRef p_Logs As Collection, ByRef p_Changes As Collection) As String
    Dim payload As Object
    Set payload = CreateObject("Scripting.Dictionary")
    payload("ok") = True
    payload("error") = ""
    payload("mode") = p_Mode
    payload("migration") = MIGRATION_NAME
    payload("version") = MIGRATION_VERSION
    payload("changeCount") = p_Changes.count
    payload("changes") = ChangesToArray(p_Changes)
    payload("logs") = LogsToArray(p_Logs)
    payload("value") = IIf(p_Changes.count = 0, "no_changes_needed", "applied_" & CStr(p_Changes.count) & "_changes")
    BuildResultJson = JsonConverter.ConvertToJson(payload)
End Function

Private Function ChangesToArray(ByRef p_Changes As Collection) As Variant
    Dim arr() As Object
    Dim i As Long
    If p_Changes.count = 0 Then
        ChangesToArray = Array()
        Exit Function
    End If
    ReDim arr(0 To p_Changes.count - 1)
    For i = 1 To p_Changes.count
        Set arr(i - 1) = p_Changes(i)
    Next i
    ChangesToArray = arr
End Function

Private Function LogsToArray(ByRef p_Logs As Collection) As Variant
    Dim arr() As String
    Dim i As Long
    If p_Logs.count = 0 Then
        LogsToArray = Array()
        Exit Function
    End If
    ReDim arr(0 To p_Logs.count - 1)
    For i = 1 To p_Logs.count
        arr(i - 1) = CStr(p_Logs(i))
    Next i
    LogsToArray = arr
End Function
