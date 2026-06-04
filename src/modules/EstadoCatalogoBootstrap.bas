Attribute VB_Name = "EstadoCatalogoBootstrap"
Option Compare Database
Option Explicit

Private Const CATALOG_TABLE As String = "TbEstadoCatalogo"
Private Const CATALOG_INDEX_TIPO_CODIGO As String = "UX_TbEstadoCatalogo_Tipo_Codigo"

Public Function BootstrapEstadoCatalogo(Optional ByRef p_Error As String = "") As Boolean
    On Error GoTo EH

    Dim db As DAO.Database

    p_Error = ""
    BootstrapEstadoCatalogo = False

    If Not AssertEstadoBootstrapEnvironment(p_Error) Then Exit Function

    Set db = getdb(p_Error)
    If db Is Nothing Then
        If p_Error = "" Then p_Error = "BootstrapEstadoCatalogo: no se pudo abrir el backend activo"
        Exit Function
    End If

    If Not EnsureEstadoCatalogoSchema(db, p_Error) Then GoTo Cleanup
    If Not UpsertEstadoCatalogo(db, p_Error) Then GoTo Cleanup
    If Not ValidateEstadoCatalogoParity(db, p_Error) Then GoTo Cleanup
    If Not BootstrapEstadoCacheWarmup(p_Error) Then GoTo Cleanup

    BootstrapEstadoCatalogo = True

Cleanup:
    Set db = Nothing
    Exit Function

EH:
    p_Error = "BootstrapEstadoCatalogo: " & Err.Number & " - " & Err.Description
    Resume Cleanup
End Function

Public Function EnsureEstadoCatalogoSchema(ByVal p_Db As DAO.Database, Optional ByRef p_Error As String = "") As Boolean
    On Error GoTo EH

    p_Error = ""
    EnsureEstadoCatalogoSchema = False

    If p_Db Is Nothing Then
        p_Error = "EnsureEstadoCatalogoSchema: database is Nothing"
        Exit Function
    End If

    If Not TableExists(p_Db, CATALOG_TABLE) Then
        p_Db.Execute "CREATE TABLE " & CATALOG_TABLE & " (" & _
            "TipoEntidad TEXT(10), " & _
            "EnumValor LONG, " & _
            "Codigo TEXT(100), " & _
            "Titulo TEXT(255), " & _
            "Texto TEXT(100), " & _
            "Version LONG, " & _
            "Activo YESNO, " & _
            "FechaBootstrap DATETIME, " & _
            "UsuarioBootstrap TEXT(255))", dbFailOnError
        p_Db.TableDefs.Refresh
    End If

    If Not EnsureField(p_Db, CATALOG_TABLE, "TipoEntidad", dbText, 10, p_Error) Then Exit Function
    If Not EnsureField(p_Db, CATALOG_TABLE, "EnumValor", dbLong, 0, p_Error) Then Exit Function
    If Not EnsureField(p_Db, CATALOG_TABLE, "Codigo", dbText, 100, p_Error) Then Exit Function
    If Not EnsureField(p_Db, CATALOG_TABLE, "Titulo", dbText, 255, p_Error) Then Exit Function
    If Not EnsureField(p_Db, CATALOG_TABLE, "Texto", dbText, 100, p_Error) Then Exit Function
    If Not EnsureField(p_Db, CATALOG_TABLE, "Version", dbLong, 0, p_Error) Then Exit Function
    If Not EnsureField(p_Db, CATALOG_TABLE, "Activo", dbBoolean, 0, p_Error) Then Exit Function
    If Not EnsureField(p_Db, CATALOG_TABLE, "FechaBootstrap", dbDate, 0, p_Error) Then Exit Function
    If Not EnsureField(p_Db, CATALOG_TABLE, "UsuarioBootstrap", dbText, 255, p_Error) Then Exit Function

    If Not IndexExists(p_Db, CATALOG_TABLE, CATALOG_INDEX_TIPO_CODIGO) Then
        p_Db.Execute "CREATE UNIQUE INDEX " & CATALOG_INDEX_TIPO_CODIGO & " ON " & CATALOG_TABLE & " (TipoEntidad, Codigo)", dbFailOnError
        p_Db.TableDefs.Refresh
    End If

    EnsureEstadoCatalogoSchema = True
    Exit Function

EH:
    p_Error = "EnsureEstadoCatalogoSchema: " & Err.Number & " - " & Err.Description
End Function

Public Function UpsertEstadoCatalogo(ByVal p_Db As DAO.Database, Optional ByRef p_Error As String = "") As Boolean
    On Error GoTo EH

    p_Error = ""
    UpsertEstadoCatalogo = False

    If p_Db Is Nothing Then
        p_Error = "UpsertEstadoCatalogo: database is Nothing"
        Exit Function
    End If

    UpsertEstadoRow p_Db, "NC", EnumEstadoNC.BORRADA, "BORRADA", "BORRADA", "BORRADA"
    UpsertEstadoRow p_Db, "NC", EnumEstadoNC.REGISTRADA, "REGISTRADA", "REGISTRADA", "REGISTRADA"
    UpsertEstadoRow p_Db, "NC", EnumEstadoNC.PLANIFICADA, "PLANIFICADA", "PLANIFICADA", "PLANIFICADA"
    UpsertEstadoRow p_Db, "NC", EnumEstadoNC.ENEJECUCION, "ENEJECUCION", "ENEJECUCION", "ENEJECUCION"
    UpsertEstadoRow p_Db, "NC", EnumEstadoNC.ENEJECUCIONFUERADEPLAZO, "ENEJECUCIONFUERADEPLAZO", "ENEJECUCIONFUERADEPLAZO", "ENEJECUCIONFUERADEPLAZO"
    UpsertEstadoRow p_Db, "NC", EnumEstadoNC.ACSSINTAREAS, "ACSSINTAREAS", "ACSSINTAREAS", "ACSSINTAREAS"
    UpsertEstadoRow p_Db, "NC", EnumEstadoNC.Cerrada, "Cerrada", "Cerrada", "Cerrada"
    UpsertEstadoRow p_Db, "NC", EnumEstadoNC.CERRADAPTECE, "CERRADAPTECE", "CERRADAPTECE", "CERRADAPTECE"
    UpsertEstadoRow p_Db, "NC", EnumEstadoNC.CERRADAPTECECADUCADA, "CERRADAPTECECADUCADA", "CERRADAPTECECADUCADA", "CERRADAPTECECADUCADA"
    UpsertEstadoRow p_Db, "NC", EnumEstadoNC.CERRADACENOCONFORME, "CERRADACENOCONFORME", "CERRADACENOCONFORME", "CERRADACENOCONFORME"

    UpsertEstadoRow p_Db, "AC", EnumEstadoAC.ACTIVA, "ACTIVA", "ACTIVA", "ACTIVA"
    UpsertEstadoRow p_Db, "AC", EnumEstadoAC.SINACCIONES, "SINACCIONES", "SINACCIONES", "SINACCIONES"
    UpsertEstadoRow p_Db, "AC", EnumEstadoAC.FINALIZADA, "FINALIZADA", "FINALIZADA", "FINALIZADA"
    UpsertEstadoRow p_Db, "AC", EnumEstadoAC.PTEREPLANIFICAR, "PTEREPLANIFICAR", "PTEREPLANIFICAR", "PTEREPLANIFICAR"
    UpsertEstadoRow p_Db, "AC", EnumEstadoAC.PTEREREGULARIZAR, "PTEREREGULARIZAR", "PTEREREGULARIZAR", "PTEREREGULARIZAR"
    UpsertEstadoRow p_Db, "AC", EnumEstadoAC.REGISTRADA, "REGISTRADA", "REGISTRADA", "REGISTRADA"

    UpsertEstadoRow p_Db, "AR", EnumEstadoAR.ACTIVA, "ACTIVA", "ACTIVA", "ACTIVA"
    UpsertEstadoRow p_Db, "AR", EnumEstadoAR.FINALIZADA, "FINALIZADA", "FINALIZADA", "FINALIZADA"
    UpsertEstadoRow p_Db, "AR", EnumEstadoAR.PTEREPLANIFICAR, "PTEREPLANIFICAR", "PTEREPLANIFICAR", "PTEREPLANIFICAR"
    UpsertEstadoRow p_Db, "AR", EnumEstadoAR.IRREGULAR, "IRREGULAR", "IRREGULAR", "IRREGULAR"
    UpsertEstadoRow p_Db, "AR", EnumEstadoAR.REGISTRADA, "REGISTRADA", "REGISTRADA", "REGISTRADA"

    UpsertEstadoCatalogo = True
    Exit Function

EH:
    p_Error = "UpsertEstadoCatalogo: " & Err.Number & " - " & Err.Description
End Function

Public Function ValidateEstadoCatalogoParity(ByVal p_Db As DAO.Database, Optional ByRef p_Error As String = "") As Boolean
    On Error GoTo EH

    p_Error = ""
    ValidateEstadoCatalogoParity = False

    If CountCatalogRows(p_Db, "NC") <> ESTADO_CATALOGO_NC_COUNT Then
        p_Error = "Estado catalogo parity failed: NC active count <> " & ESTADO_CATALOGO_NC_COUNT
        Exit Function
    End If
    If CountCatalogRows(p_Db, "AC") <> ESTADO_CATALOGO_AC_COUNT Then
        p_Error = "Estado catalogo parity failed: AC active count <> " & ESTADO_CATALOGO_AC_COUNT
        Exit Function
    End If
    If CountCatalogRows(p_Db, "AR") <> ESTADO_CATALOGO_AR_COUNT Then
        p_Error = "Estado catalogo parity failed: AR active count <> " & ESTADO_CATALOGO_AR_COUNT
        Exit Function
    End If
    If CountDuplicateStableCodes(p_Db) <> 0 Then
        p_Error = "Estado catalogo parity failed: duplicate stable codes"
        Exit Function
    End If
    If Not ExpectedCodeExists(p_Db, "NC", EnumEstadoNC.ENEJECUCION, "ENEJECUCION") Then
        p_Error = "Estado catalogo parity failed: NC/ENEJECUCION missing"
        Exit Function
    End If

    ValidateEstadoCatalogoParity = True
    Exit Function

EH:
    p_Error = "ValidateEstadoCatalogoParity: " & Err.Number & " - " & Err.Description
End Function

Public Function AssertEstadoBootstrapEnvironment(Optional ByRef p_Error As String = "") As Boolean
    On Error GoTo EH

    Dim backendActivo As String
    Dim backendPath As String

    p_Error = ""
    AssertEstadoBootstrapEnvironment = False

    If m_TestingMode Then
        backendPath = Trim$(Nz(m_BackendSandboxURL, ""))
        If backendPath = "" Then backendPath = Trim$(Nz(Application.TempVars("BackendPathSandbox"), ""))
        ' Testing mode requires an explicitly resolved sandbox path — empty string is not safe.
        If backendPath = "" Then
            p_Error = "unsafe test backend: no sandbox path resolved (m_BackendSandboxURL and BackendPathSandbox are both empty)"
            Exit Function
        End If
        If IsUnsafeBackendPath(backendPath) Then
            p_Error = "unsafe test backend path: " & backendPath
            Exit Function
        End If
        AssertEstadoBootstrapEnvironment = True
        Exit Function
    End If

    backendActivo = UCase$(Trim$(Nz(Application.TempVars("BackendActivo"), "")))
    backendPath = Trim$(Nz(Application.TempVars("BackendPathConfigurado"), ""))

    If backendActivo = "" Then
        p_Error = "unsafe backend: BackendActivo is not resolved"
        Exit Function
    End If
    If backendActivo = "PROD" Then
        p_Error = "production backend blocked: BackendActivo=PROD"
        Exit Function
    End If
    If Not (backendActivo = "LOCAL" Or backendActivo = "SANDBOX" Or backendActivo = "STAGING") Then
        p_Error = "unsafe backend: BackendActivo=" & backendActivo
        Exit Function
    End If
    If IsUnsafeBackendPath(backendPath) Then
        p_Error = "unsafe backend path blocked: " & backendPath
        Exit Function
    End If

    AssertEstadoBootstrapEnvironment = True
    Exit Function

EH:
    p_Error = "AssertEstadoBootstrapEnvironment: " & Err.Number & " - " & Err.Description
End Function

Private Sub UpsertEstadoRow(ByVal p_Db As DAO.Database, ByVal p_TipoEntidad As String, ByVal p_EnumValor As Long, ByVal p_Codigo As String, ByVal p_Titulo As String, ByVal p_Texto As String)
    Dim rs As DAO.Recordset
    Dim sql As String

    sql = "SELECT * FROM " & CATALOG_TABLE & " WHERE TipoEntidad = " & SqlText(p_TipoEntidad) & " AND Codigo = " & SqlText(p_Codigo)
    Set rs = p_Db.OpenRecordset(sql, dbOpenDynaset)

    If rs.EOF Then
        rs.AddNew
        rs.Fields("TipoEntidad").Value = p_TipoEntidad
        rs.Fields("Codigo").Value = p_Codigo
    Else
        rs.Edit
    End If

    rs.Fields("EnumValor").Value = p_EnumValor
    rs.Fields("Titulo").Value = p_Titulo
    rs.Fields("Texto").Value = p_Texto
    rs.Fields("Version").Value = ESTADO_CATALOGO_VERSION
    rs.Fields("Activo").Value = True
    rs.Fields("FechaBootstrap").Value = Now()
    rs.Fields("UsuarioBootstrap").Value = Environ$("USERNAME")
    rs.Update

    rs.Close
    Set rs = Nothing
End Sub

Private Function EnsureField(ByVal p_Db As DAO.Database, ByVal p_TableName As String, ByVal p_FieldName As String, ByVal p_FieldType As Integer, ByVal p_Size As Long, ByRef p_Error As String) As Boolean
    On Error GoTo EH

    Dim fld As DAO.Field

    If Not FieldExists(p_Db, p_TableName, p_FieldName) Then
        If p_Size > 0 Then
            Set fld = p_Db.TableDefs(p_TableName).CreateField(p_FieldName, p_FieldType, p_Size)
        Else
            Set fld = p_Db.TableDefs(p_TableName).CreateField(p_FieldName, p_FieldType)
        End If
        p_Db.TableDefs(p_TableName).Fields.Append fld
        p_Db.TableDefs.Refresh
    End If

    EnsureField = True
    Exit Function

EH:
    p_Error = "EnsureField " & p_TableName & "." & p_FieldName & ": " & Err.Number & " - " & Err.Description
End Function

Private Function CountCatalogRows(ByVal p_Db As DAO.Database, ByVal p_TipoEntidad As String) As Long
    CountCatalogRows = CountRowsBySql(p_Db, "SELECT COUNT(*) FROM " & CATALOG_TABLE & " WHERE TipoEntidad = " & SqlText(p_TipoEntidad) & " AND Activo = True AND Version = " & ESTADO_CATALOGO_VERSION)
End Function

Private Function CountDuplicateStableCodes(ByVal p_Db As DAO.Database) As Long
    CountDuplicateStableCodes = CountRowsBySql(p_Db, "SELECT COUNT(*) FROM (SELECT TipoEntidad, Codigo FROM " & CATALOG_TABLE & " WHERE Activo = True GROUP BY TipoEntidad, Codigo HAVING COUNT(*) > 1)")
End Function

Private Function ExpectedCodeExists(ByVal p_Db As DAO.Database, ByVal p_TipoEntidad As String, ByVal p_EnumValor As Long, ByVal p_Codigo As String) As Boolean
    ExpectedCodeExists = (CountRowsBySql(p_Db, "SELECT COUNT(*) FROM " & CATALOG_TABLE & " WHERE TipoEntidad = " & SqlText(p_TipoEntidad) & " AND EnumValor = " & p_EnumValor & " AND Codigo = " & SqlText(p_Codigo) & " AND Activo = True") = 1)
End Function

Private Function CountRowsBySql(ByVal p_Db As DAO.Database, ByVal p_SQL As String) As Long
    Dim rs As DAO.Recordset

    Set rs = p_Db.OpenRecordset(p_SQL, dbOpenSnapshot)
    If Not rs.EOF Then CountRowsBySql = CLng(Nz(rs.Fields(0).Value, 0))
    rs.Close
    Set rs = Nothing
End Function

Private Function TableExists(ByVal p_Db As DAO.Database, ByVal p_TableName As String) As Boolean
    On Error GoTo EH
    Dim tdf As DAO.TableDef
    Set tdf = p_Db.TableDefs(p_TableName)
    TableExists = True
    Exit Function
EH:
    TableExists = False
End Function

Private Function FieldExists(ByVal p_Db As DAO.Database, ByVal p_TableName As String, ByVal p_FieldName As String) As Boolean
    On Error GoTo EH
    Dim fld As DAO.Field
    Set fld = p_Db.TableDefs(p_TableName).Fields(p_FieldName)
    FieldExists = True
    Exit Function
EH:
    FieldExists = False
End Function

Private Function IndexExists(ByVal p_Db As DAO.Database, ByVal p_TableName As String, ByVal p_IndexName As String) As Boolean
    On Error GoTo EH
    Dim idx As DAO.Index
    Set idx = p_Db.TableDefs(p_TableName).Indexes(p_IndexName)
    IndexExists = True
    Exit Function
EH:
    IndexExists = False
End Function

Private Function IsUnsafeBackendPath(ByVal p_BackendPath As String) As Boolean
    Dim normalized As String

    normalized = LCase$(Trim$(Nz(p_BackendPath, "")))
    If normalized = "" Then Exit Function
    If Left$(normalized, 2) = "\\" Then IsUnsafeBackendPath = True: Exit Function
    If InStr(1, normalized, "\datoste\", vbTextCompare) > 0 Then IsUnsafeBackendPath = True: Exit Function
    If InStr(1, normalized, "prod", vbTextCompare) > 0 Then IsUnsafeBackendPath = True: Exit Function
End Function

Private Function SqlText(ByVal p_Value As String) As String
    SqlText = "'" & Replace(p_Value, "'", "''") & "'"
End Function
