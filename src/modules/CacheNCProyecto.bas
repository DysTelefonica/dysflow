Attribute VB_Name = "CacheNCProyecto"
Option Compare Database
Option Explicit

' ============================================
' MÓDULO DE CACHÉ PARA NO CONFORMIDADES DE PROYECTO
' ============================================
' Propósito: Reducir el número de consultas SQL al cargar NCs
' con sus relaciones (ACs, ARs, Replanificaciones, Riesgos)
'
' Estrategia:
' - Cache completa en tabla TbCacheNCProyecto
' - Datos almacenados en campos JSON separados
' - Invalidación automática al modificar datos
' - Transaccionalidad garantizada
' - Integración mínima con código existente
'
' Fecha creación: 12/01/2026
' ============================================

' ============================================
' VARIABLES PRIVADAS
' ============================================

Public Enum EnumOperacionCache
    Actualizar = 1
    Eliminar = 2
    Insertar = 3
End Enum

Private m_Db As DAO.Database
Private m_Transacciones As Collection
Public Const NOMBRE_TABLA_CACHE As String = "TbCacheNCProyecto"
Public Const NOMBRE_TABLA_LISTADO As String = "TbCacheListadoNC"
Private Const NOMBRE_TABLA_LOG As String = "TbLogCache"
Private Const CAMPO_CACHE_HABILITADA As String = "CacheHabilitada"
Private Const CAMPO_FECHA_CAMBIO_CACHE As String = "FechaCambioCache"
Private Const CAMPO_USUARIO_CAMBIO_CACHE As String = "UsuarioCambioCache"
Private Const CAMPO_MOTIVO_CAMBIO_CACHE As String = "MotivoCambioCache"

' ============================================
' KILL-SWITCH DE CACHÉ
' ============================================
' Lee/escribe el flag de habilitación de caché desde TbConfiguracion.
' Si la tabla o el registro no existen, devuelve False (caché desactivada por defecto).

Public Function IsCacheEnabled() As Boolean
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim SQL As String
    Dim ensureErr As String
    
    On Error GoTo errores
    IsCacheEnabled = False
    
    ensureErr = ""
    If Not EnsureCacheSchemaReadiness(ensureErr) Then
        IsCacheEnabled = False
        Exit Function
    End If

    Set db = getdb()
    SQL = "SELECT " & CAMPO_CACHE_HABILITADA & " FROM TbConfiguracion WHERE ID = 1"
    Set rs = db.OpenRecordset(SQL, dbOpenSnapshot)
    
    If Not rs.EOF Then
        If Not IsNull(rs.Fields(CAMPO_CACHE_HABILITADA).Value) Then
            IsCacheEnabled = (rs.Fields(CAMPO_CACHE_HABILITADA).Value = True)
        End If
    End If
    
    rs.Close
    Set rs = Nothing
    Set db = Nothing
    Exit Function
    
errores:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Set db = Nothing
    IsCacheEnabled = False  ' Fail-safe: si hay error, cache desactivada
End Function

Public Function SetCacheEnabled(ByVal p_Enabled As Boolean, Optional ByRef p_Error As String) As Boolean
    Dim db As DAO.Database
    Dim SQL As String
    Dim nowSql As String
    Dim userSql As String
    Dim motivoSql As String
    
    On Error GoTo errores
    p_Error = ""
    SetCacheEnabled = False
    
    If Not EnsureCacheSchemaReadiness(p_Error) Then
        SetCacheEnabled = False
        Exit Function
    End If

    Set db = getdb()
    nowSql = "#" & Format$(Now, "yyyy-mm-dd hh:nn:ss") & "#"
    userSql = "'" & Replace$(Nz(Environ$("USERNAME"), "SYSTEM"), "'", "''") & "'"
    motivoSql = "'" & Replace$("Toggle cache via SetCacheEnabled", "'", "''") & "'"
    SQL = "UPDATE TbConfiguracion SET " & _
          CAMPO_CACHE_HABILITADA & " = " & IIf(p_Enabled, "-1", "0") & ", " & _
          CAMPO_FECHA_CAMBIO_CACHE & " = " & nowSql & ", " & _
          CAMPO_USUARIO_CAMBIO_CACHE & " = " & userSql & ", " & _
          CAMPO_MOTIVO_CAMBIO_CACHE & " = " & motivoSql & _
          " WHERE ID = 1"
    db.Execute SQL, dbFailOnError
    
    SetCacheEnabled = True
    Set db = Nothing
    Exit Function
    
errores:
    p_Error = "SetCacheEnabled: " & Err.Description
    Set db = Nothing
End Function

Public Function EnsureCacheSchemaReadiness(Optional ByRef p_Error As String) As Boolean
    Dim db As DAO.Database

    On Error GoTo errores
    p_Error = ""
    EnsureCacheSchemaReadiness = False

    Set db = getdb()

    If Not EnsureTbConfiguracion(db, p_Error) Then Err.Raise 1000
    If Not EnsureTbCacheListadoNC(db, p_Error) Then Err.Raise 1000

    EnsureCacheSchemaReadiness = True

salida:
    Set db = Nothing
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "EnsureCacheSchemaReadiness: " & Err.Description
    ElseIf p_Error = "" Then
        p_Error = Err.Description
    End If
    Set db = Nothing
    EnsureCacheSchemaReadiness = False
End Function

Public Function MigrarConfigCoreTbConfiguracion(Optional ByRef p_Error As String) As Boolean
    Dim db As DAO.Database

    On Error GoTo errores
    p_Error = ""
    MigrarConfigCoreTbConfiguracion = False

    Set db = getdb()
    If Not EnsureTbConfiguracion(db, p_Error) Then Err.Raise 1000

    MigrarConfigCoreTbConfiguracion = True

salida:
    Set db = Nothing
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "MigrarConfigCoreTbConfiguracion: " & Err.Description
    ElseIf p_Error = "" Then
        p_Error = Err.Description
    End If
    Set db = Nothing
    MigrarConfigCoreTbConfiguracion = False
End Function

Private Function EnsureTbConfiguracion(ByVal p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    Dim rsSeed As DAO.Recordset
    On Error GoTo errores

    EnsureTbConfiguracion = False
    p_Error = ""

    If Not TableExists(p_Db, "TbConfiguracion") Then
        p_Db.Execute "CREATE TABLE TbConfiguracion (ID LONG CONSTRAINT PK_TbConfiguracion PRIMARY KEY)", dbFailOnError
    End If

    If Not FieldExists(p_Db, "TbConfiguracion", CAMPO_CACHE_HABILITADA) Then
        p_Db.Execute "ALTER TABLE TbConfiguracion ADD COLUMN " & CAMPO_CACHE_HABILITADA & " YESNO", dbFailOnError
    End If
    If Not FieldExists(p_Db, "TbConfiguracion", CAMPO_FECHA_CAMBIO_CACHE) Then
        p_Db.Execute "ALTER TABLE TbConfiguracion ADD COLUMN " & CAMPO_FECHA_CAMBIO_CACHE & " DATETIME", dbFailOnError
    End If
    If Not FieldExists(p_Db, "TbConfiguracion", CAMPO_USUARIO_CAMBIO_CACHE) Then
        p_Db.Execute "ALTER TABLE TbConfiguracion ADD COLUMN " & CAMPO_USUARIO_CAMBIO_CACHE & " TEXT(255)", dbFailOnError
    End If
    If Not FieldExists(p_Db, "TbConfiguracion", CAMPO_MOTIVO_CAMBIO_CACHE) Then
        p_Db.Execute "ALTER TABLE TbConfiguracion ADD COLUMN " & CAMPO_MOTIVO_CAMBIO_CACHE & " LONGTEXT", dbFailOnError
    End If

    Set rsSeed = p_Db.OpenRecordset("SELECT ID FROM TbConfiguracion WHERE ID=1", dbOpenSnapshot)
    If rsSeed.EOF Then
        p_Db.Execute "INSERT INTO TbConfiguracion (ID, " & CAMPO_CACHE_HABILITADA & ") VALUES (1, 0)", dbFailOnError
    Else
        p_Db.Execute "UPDATE TbConfiguracion SET " & CAMPO_CACHE_HABILITADA & " = 0 WHERE ID=1 AND " & CAMPO_CACHE_HABILITADA & " IS NULL", dbFailOnError
    End If
    rsSeed.Close
    Set rsSeed = Nothing

    EnsureTbConfiguracion = True
    Exit Function

errores:
    On Error Resume Next
    If Not rsSeed Is Nothing Then rsSeed.Close
    Set rsSeed = Nothing
    p_Error = "EnsureTbConfiguracion: " & Err.Description
    EnsureTbConfiguracion = False
End Function

Private Function EnsureTbCacheListadoNC(ByVal p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    Dim pkExists As Boolean

    On Error GoTo errores
    EnsureTbCacheListadoNC = False
    p_Error = ""

    If Not TableExists(p_Db, NOMBRE_TABLA_LISTADO) Then
        p_Db.Execute "CREATE TABLE " & NOMBRE_TABLA_LISTADO & " (IDNoConformidad LONG)", dbFailOnError
    End If

    EnsureListadoField p_Db, "Version", "LONG"
    EnsureListadoField p_Db, "CodigoNoConformidad", "TEXT(255)"
    EnsureListadoField p_Db, "IDExpediente", "LONG"
    EnsureListadoField p_Db, "Nemotecnico", "TEXT(255)"
    EnsureListadoField p_Db, "CodExp", "TEXT(255)"
    EnsureListadoField p_Db, "JuridicaExp", "TEXT(255)"
    EnsureListadoField p_Db, "IDTipo", "LONG"
    EnsureListadoField p_Db, "Descripcion", "LONGTEXT"
    EnsureListadoField p_Db, "Notas", "LONGTEXT"
    EnsureListadoField p_Db, "Estado", "TEXT(100)"
    EnsureListadoField p_Db, "FechaApertura", "DATETIME"
    EnsureListadoField p_Db, "FechaCierre", "DATETIME"
    EnsureListadoField p_Db, "RequiereControlEficacia", "TEXT(10)"
    EnsureListadoField p_Db, "ControlEficacia", "TEXT(255)"
    EnsureListadoField p_Db, "ResponsableTelefonica", "TEXT(255)"
    EnsureListadoField p_Db, "RESPONSABLECALIDAD", "TEXT(255)"
    EnsureListadoField p_Db, "ACR", "TEXT(255)"
    EnsureListadoField p_Db, "Cerrada", "TEXT(10)"
    EnsureListadoField p_Db, "FechaCache", "DATETIME"
    EnsureListadoField p_Db, "CacheValida", "YESNO"

    pkExists = IndexExists(p_Db, NOMBRE_TABLA_LISTADO, "PrimaryKey") Or IndexExists(p_Db, NOMBRE_TABLA_LISTADO, "PK_TbCacheListadoNC")
    If Not pkExists Then
        p_Db.Execute "CREATE UNIQUE INDEX PK_TbCacheListadoNC ON " & NOMBRE_TABLA_LISTADO & " (IDNoConformidad)", dbFailOnError
    End If

    EnsureTbCacheListadoNC = True
    Exit Function

errores:
    p_Error = "EnsureTbCacheListadoNC: " & Err.Description
    EnsureTbCacheListadoNC = False
End Function

Private Sub EnsureListadoField(ByVal p_Db As DAO.Database, ByVal p_FieldName As String, ByVal p_FieldTypeDDL As String)
    If Not FieldExists(p_Db, NOMBRE_TABLA_LISTADO, p_FieldName) Then
        p_Db.Execute "ALTER TABLE " & NOMBRE_TABLA_LISTADO & " ADD COLUMN " & p_FieldName & " " & p_FieldTypeDDL, dbFailOnError
    End If
End Sub

Private Function TableExists(ByVal p_Db As DAO.Database, ByVal p_TableName As String) As Boolean
    Dim tdf As DAO.TableDef
    On Error GoTo notfound
    Set tdf = p_Db.TableDefs(p_TableName)
    TableExists = True
    Exit Function
notfound:
    TableExists = False
End Function

Private Function FieldExists(ByVal p_Db As DAO.Database, ByVal p_TableName As String, ByVal p_FieldName As String) As Boolean
    Dim tdf As DAO.TableDef
    Dim fld As DAO.Field
    On Error GoTo notfound
    Set tdf = p_Db.TableDefs(p_TableName)
    For Each fld In tdf.Fields
        If StrComp(fld.Name, p_FieldName, vbTextCompare) = 0 Then
            FieldExists = True
            Exit Function
        End If
    Next fld
    FieldExists = False
    Exit Function
notfound:
    FieldExists = False
End Function

Private Function IndexExists(ByVal p_Db As DAO.Database, ByVal p_TableName As String, ByVal p_IndexName As String) As Boolean
    Dim tdf As DAO.TableDef
    Dim idx As DAO.Index
    On Error GoTo notfound
    Set tdf = p_Db.TableDefs(p_TableName)
    For Each idx In tdf.Indexes
        If StrComp(idx.Name, p_IndexName, vbTextCompare) = 0 Then
            IndexExists = True
            Exit Function
        End If
    Next idx
    IndexExists = False
    Exit Function
notfound:
    IndexExists = False
End Function

' Alias para los tests
Public Function CacheConfig_SetEnabled(ByVal p_Enabled As Boolean, Optional ByRef p_Error As String) As Boolean
    CacheConfig_SetEnabled = SetCacheEnabled(p_Enabled, p_Error)
End Function

' ============================================
' FUNCIONES PÚBLICAS PRINCIPALES
' ============================================

' Obtiene NC desde caché (o genera si no existe)
Public Function ObtenerNCConCache( _
                                    p_IDNC As String, _
                                    Optional p_ForceUpdate As Boolean = False, _
                                    Optional ByRef p_Error As String _
                                ) As NCProyecto
    
    Dim inicio As Long
    Dim duracion As Long
    Dim nc As NCProyecto
    Dim existeCache As Boolean
    Dim esValido As Boolean
    
    On Error GoTo errores
    
    inicio = Timer
    
    p_Error = ""
    
    ' Verificar si existe caché y es válido
    existeCache = CacheExiste(p_IDNC)
    If existeCache Then
        esValido = CacheValida(p_IDNC)
    End If
    
    ' Si no existe, no es válido o force update, generar caché
    If Not existeCache Or Not esValido Or p_ForceUpdate Then
        If GenerarCacheCompleto(p_IDNC, p_Error) Then
            LogCacheOperacion p_IDNC, "Generar", "Cache generado exitosamente", "Sistema", True
        Else
            LogCacheOperacion p_IDNC, "Error", p_Error, "Sistema", False
            ' Error de caché no es fatal, continuar con carga desde BD
            p_Error = ""
            Set ObtenerNCConCache = Nothing
            Exit Function
        End If
    End If
    
    ' Obtener desde caché
    Set nc = ObtenerNCDesdeCache(p_IDNC, p_Error)
    
    If nc Is Nothing Or p_Error <> "" Then
        ' Si falla caché, retornar Nothing (se cargará desde BD)
        Set ObtenerNCConCache = Nothing
        Exit Function
    End If
    
    duracion = (Timer - inicio) * 1000
    LogCacheOperacion p_IDNC, "Consultar", "NC cargada desde caché en " & duracion & "ms", "Sistema", True, duracion
    
    Set ObtenerNCConCache = nc
    Exit Function
    
errores:
    p_Error = "Error en CacheNCProyecto.ObtenerNCConCache: " & Err.Description
    Set ObtenerNCConCache = Nothing
End Function

' Obtiene NC directamente desde caché (sin generar)
Public Function ObtenerNCDesdeCache( _
    p_IDNC As String, _
    Optional ByRef p_Error As String _
) As NCProyecto
    
    Dim rcd As DAO.Recordset
    Dim SQL As String
    Dim nc As NCProyecto
    Dim jsonNC As String
    Dim jsonACs As String
    Dim jsonARs As String
    Dim jsonReplanif As String
    Dim jsonRiesgos As String
    
    On Error GoTo errores
    
    p_Error = ""
    
    ' Consultar caché
    SQL = "SELECT * FROM " & NOMBRE_TABLA_CACHE & " " & _
           "WHERE IDNoConformidad=" & p_IDNC & " AND CacheValida=True;"
    
    Set rcd = getdb().OpenRecordset(SQL)
    
    If rcd.EOF Then
        rcd.Close
        Set rcd = Nothing
        Exit Function
    End If
    
    ' Crear objeto NC
    Set nc = New NCProyecto
    nc.IDNoConformidad = p_IDNC
    
    ' Parsear JSON de NC
    jsonNC = Nz(rcd!DatosNC, "")
    If jsonNC <> "" Then
        ParseJSONToNC nc, jsonNC, p_Error
        If p_Error <> "" Then
            rcd.Close
            Set rcd = Nothing
            Exit Function
        End If
    End If
    
    ' Parsear JSON de ACs
    jsonACs = Nz(rcd!DatosACs, "")
    If jsonACs <> "" Then
        Set nc.ACs = ParseJSONToACs(jsonACs, p_IDNC, p_Error)
        If p_Error <> "" Then
            rcd.Close
            Set rcd = Nothing
            Exit Function
        End If
    End If
    
    ' Parsear JSON de ARs
    jsonARs = Nz(rcd!DatosARs, "")
    If jsonARs <> "" Then
        Set nc.ACs = Nothing ' Se reasignará al parsear ARs
        ParseJSONToARsEnACs nc, jsonARs, p_Error
        If p_Error <> "" Then
            rcd.Close
            Set rcd = Nothing
            Exit Function
        End If
    End If
    
    ' Parsear JSON de Replanificaciones
    jsonReplanif = Nz(rcd!DatosReplanificaciones, "")
    If jsonReplanif <> "" Then
        Set nc.Replanificaciones = ParseJSONToReplanificaciones(jsonReplanif, p_IDNC, p_Error)
        If p_Error <> "" Then
            rcd.Close
            Set rcd = Nothing
            Exit Function
        End If
    End If
    
    ' Parsear JSON de Riesgos
    jsonRiesgos = Nz(rcd!DatosRiesgos, "")
    If jsonRiesgos <> "" Then
        Set nc.Riesgos = ParseJSONToRiesgos(jsonRiesgos, p_Error)
        If p_Error <> "" Then
            rcd.Close
            Set rcd = Nothing
            Exit Function
        End If
    End If
    
    rcd.Close
    Set rcd = Nothing
    
    Set ObtenerNCDesdeCache = nc
    Exit Function
    
errores:
    p_Error = "Error en CacheNCProyecto.ObtenerNCDesdeCache: " & Err.Description
    Set ObtenerNCDesdeCache = Nothing
End Function

' Verifica si existe caché para una NC
Private Function CacheExiste( _
    p_IDNC As String _
) As Boolean
    
    Dim rcd As DAO.Recordset
    Dim SQL As String
    
    On Error GoTo errores
    
    SQL = "SELECT IDNoConformidad FROM " & NOMBRE_TABLA_CACHE & " " & _
           "WHERE IDNoConformidad=" & p_IDNC & ";"
    
    Set rcd = getdb().OpenRecordset(SQL)
    CacheExiste = Not rcd.EOF
    rcd.Close
    Set rcd = Nothing
    Exit Function
    
errores:
    CacheExiste = False
End Function

' Verifica si el caché está marcado como válido
Private Function CacheValida( _
    p_IDNC As String _
) As Boolean
    
    Dim rcd As DAO.Recordset
    Dim SQL As String
    
    On Error GoTo errores
    
    SQL = "SELECT CacheValida FROM " & NOMBRE_TABLA_CACHE & " " & _
           "WHERE IDNoConformidad=" & p_IDNC & ";"
    
    Set rcd = getdb().OpenRecordset(SQL)
    
    If rcd.EOF Then
        CacheValida = False
    Else
        CacheValida = (rcd!CacheValida = True)
    End If
    
    rcd.Close
    Set rcd = Nothing
    Exit Function
    
errores:
    CacheValida = False
End Function

' Genera caché completo para una NC
Public Function GenerarCacheCompleto( _
    p_IDNC As String, _
    Optional ByRef p_Error As String _
) As Boolean
    
    Dim inicio As Long
    Dim jsonNC As String, jsonACs As String, jsonARs As String
    Dim jsonReplanif As String, jsonRiesgos As String
    Dim rcd As DAO.Recordset
    Dim tamanioBytes As Long
    Dim usuario As String
    Dim idLong As Long
    Dim sqlSelect As String
    
    On Error GoTo errores
    
    inicio = Timer
    p_Error = ""
    
    ' 1. Validación de seguridad
    If Not IsNumeric(p_IDNC) Then
        p_Error = "El ID de No Conformidad debe ser numérico."
        Exit Function
    End If
    idLong = CLng(p_IDNC)
    
    ' Obtener usuario y recortar a 50 caracteres (según tu ERD: UsuarioCache Text(50))
    usuario = ObtenerUsuarioConectado()
    If Len(usuario) > 50 Then usuario = Left(usuario, 50)
    
    ' 2. Generar todos los JSONs
    jsonNC = GenerarJSONNC(p_IDNC, p_Error)
    If p_Error <> "" Then Err.Raise 1000
    
    jsonACs = GenerarJSONACs(p_IDNC, p_Error)
    If p_Error <> "" Then Err.Raise 1000
    
    jsonARs = GenerarJSONARs(p_IDNC, p_Error)
    If p_Error <> "" Then Err.Raise 1000
    
    jsonReplanif = GenerarJSONReplanificaciones(p_IDNC, p_Error)
    If p_Error <> "" Then Err.Raise 1000
    
    jsonRiesgos = GenerarJSONRiesgos(p_IDNC, p_Error)
    If p_Error <> "" Then Err.Raise 1000
    
    ' Calcular tamaño para el log
    tamanioBytes = Len(jsonNC) + Len(jsonACs) + Len(jsonARs) + _
                   Len(jsonReplanif) + Len(jsonRiesgos)
    
    ' ---------------------------------------------------------
    ' 3. MÉTODO CLÁSICO (DAO Recordset)
    ' ---------------------------------------------------------
    
    ' Seleccionamos solo el registro que nos interesa
    sqlSelect = "SELECT * FROM " & NOMBRE_TABLA_CACHE & " WHERE IDNoConformidad = " & idLong
    
    ' Abrimos el recordset en modo Dynaset (lectura/escritura)
    Set rcd = getdb().OpenRecordset(sqlSelect, dbOpenDynaset)
    
    With rcd
        If .EOF Then
            ' -- NO EXISTE: Crear nuevo (INSERT implícito) --
            .AddNew
            !IDNoConformidad = idLong
            !Version = 1
        Else
            ' -- SÍ EXISTE: Editar (UPDATE implícito) --
            .Edit
            !Version = !Version + 1
        End If
        
        ' -- Asignación de campos comunes --
        !FechaCache = Now()
        !UsuarioCache = usuario
        !CacheValida = True
        
        ' Asignación directa a campos Memo (Access gestiona la longitud automáticamente)
        !DatosNC = jsonNC
        !DatosACs = jsonACs
        !DatosARs = jsonARs
        !DatosReplanificaciones = jsonReplanif
        !DatosRiesgos = jsonRiesgos
        
        ' Guardar cambios
        .Update
        .Close
    End With
    
    Set rcd = Nothing
    
    ' 4. Log de éxito
    Dim duracion As Long
    duracion = (Timer - inicio) * 1000
    LogCacheOperacion p_IDNC, "Generar Completo", "Cache generado (" & tamanioBytes & " bytes) en " & duracion & "ms", usuario, True, duracion
    
    GenerarCacheCompleto = True
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "Error en CacheNCProyecto.GenerarCacheCompleto (DAO): " & Err.Description
    ElseIf p_Error = "" Then
        p_Error = Err.Description
    End If
    
    ' Limpieza segura
    If Not rcd Is Nothing Then
        ' Si el error ocurrió durante .Edit o .AddNew, se cancela automáticamente al cerrar
        rcd.Close
        Set rcd = Nothing
    End If
    
    GenerarCacheCompleto = False
End Function

' Invalida caché de una NC
Public Function InvalidarCache( _
    p_IDNC As String, _
    Optional p_Razon As String = "", _
    Optional ByRef p_Error As String _
) As Boolean
    
    Dim SQL As String
    Dim usuario As String
    Dim qdf As DAO.QueryDef
    Dim syncError As String
    
    On Error GoTo errores
    
    p_Error = ""
    
    usuario = ObtenerUsuarioConectado()
    
    Set qdf = getdb().CreateQueryDef("")
    qdf.SQL = "UPDATE " & NOMBRE_TABLA_CACHE & " SET CacheValida=False WHERE IDNoConformidad=[pIDNC];"
    qdf.Parameters("pIDNC") = p_IDNC
    qdf.Execute
    qdf.Close
    Set qdf = Nothing
    
    LogCacheOperacion p_IDNC, "Invalidar", p_Razon, usuario, True
    If Not Cache_IndicadoresProyectoMaterializado_Sincronizar(syncError) Then
        p_Error = "CacheNCProyecto.InvalidarCache no pudo sincronizar indicadores de Proyecto: " & syncError
        InvalidarCache = False
        Exit Function
    End If
    
    InvalidarCache = True
    Exit Function
    
errores:
    p_Error = "Error en CacheNCProyecto.InvalidarCache: " & Err.Description
    InvalidarCache = False
End Function

' Elimina caché de una NC
Public Function BorrarCache( _
    p_IDNC As String, _
    Optional ByRef p_Error As String _
) As Boolean
    
    Dim SQL As String
    Dim usuario As String
    Dim qdf As DAO.QueryDef
    
    On Error GoTo errores
    
    p_Error = ""
    
    usuario = ObtenerUsuarioConectado()
    
    Set qdf = getdb().CreateQueryDef("")
    qdf.SQL = "DELETE FROM " & NOMBRE_TABLA_CACHE & " WHERE IDNoConformidad=[pIDNC];"
    qdf.Parameters("pIDNC") = p_IDNC
    qdf.Execute
    qdf.Close
    Set qdf = Nothing
    
    LogCacheOperacion p_IDNC, "Borrar", "Caché eliminado", usuario, True
    
    BorrarCache = True
    Exit Function
    
errores:
    p_Error = "Error en CacheNCProyecto.BorrarCache: " & Err.Description
    BorrarCache = False
End Function

' Actualiza caché cuando se modifican datos de NC
Public Function ActualizarCacheNC( _
    p_NC As NCProyecto, _
    Optional p_CamposModificados As String = "*", _
    Optional ByRef p_Error As String _
) As Boolean
    
    Dim SQL As String
    Dim jsonNC As String
    
    On Error GoTo errores
    
    p_Error = ""
    
    If p_NC Is Nothing Then
        p_Error = "NC es Nothing"
        ActualizarCacheNC = False
        Exit Function
    End If
    
    ' Verificar si existe caché
    If Not CacheExiste(p_NC.IDNoConformidad) Then
        ' Si no existe, generar completo
        ActualizarCacheNC = GenerarCacheCompleto(p_NC.IDNoConformidad, p_Error)
        Exit Function
    End If
    
    ' Invalidar caché (se regenerará en la siguiente consulta)
    InvalidarCache p_NC.IDNoConformidad, "NC modificada (campos: " & p_CamposModificados & ")", p_Error
    If p_Error <> "" Then
        ActualizarCacheNC = False
        Exit Function
    End If
    
    ActualizarCacheNC = True
    Exit Function
    
errores:
    p_Error = "Error en CacheNCProyecto.ActualizarCacheNC: " & Err.Description
    ActualizarCacheNC = False
End Function

' Actualiza caché cuando se modifica AC
Public Function ActualizarCacheAC( _
    p_AC As ACProyecto, _
    Optional p_Operacion As EnumOperacionCache = EnumOperacionCache.Actualizar, _
    Optional ByRef p_Error As String _
) As Boolean
    
    On Error GoTo errores
    
    p_Error = ""
    
    If p_AC Is Nothing Then
        p_Error = "AC es Nothing"
        ActualizarCacheAC = False
        Exit Function
    End If
    
    ' Invalidar caché completo de la NC
    InvalidarCache p_AC.IDNoConformidad, "AC " & p_Operacion & " (ID: " & p_AC.IdAccionCorrectiva & ")", p_Error
    If p_Error <> "" Then
        ActualizarCacheAC = False
        Exit Function
    End If
    
    ActualizarCacheAC = True
    Exit Function
    
errores:
    p_Error = "Error en CacheNCProyecto.ActualizarCacheAC: " & Err.Description
    ActualizarCacheAC = False
End Function

' Actualiza caché cuando se modifica AR
Public Function ActualizarCacheAR( _
    p_AR As ARProyecto, _
    Optional p_Operacion As EnumOperacionCache = EnumOperacionCache.Actualizar, _
    Optional ByRef p_Error As String _
) As Boolean
    
    On Error GoTo errores
    
    p_Error = ""
    
    If p_AR Is Nothing Then
        p_Error = "AR es Nothing"
        ActualizarCacheAR = False
        Exit Function
    End If
    
    ' Invalidar caché completo de la NC (AR está ligada a NC a través de AC)
    InvalidarCache p_AR.AC.IDNoConformidad, "AR " & p_Operacion & " (ID: " & p_AR.IDAccionRealizada & ")", p_Error
    If p_Error <> "" Then
        ActualizarCacheAR = False
        Exit Function
    End If
    
    ActualizarCacheAR = True
    Exit Function
    
errores:
    p_Error = "Error en CacheNCProyecto.ActualizarCacheAR: " & Err.Description
    ActualizarCacheAR = False
End Function

' Actualiza caché cuando se modifica replanificación
Public Function ActualizarCacheReplanificacion( _
    p_Replanificacion As ReplanificacionesProyecto, _
    Optional p_Operacion As EnumOperacionCache = EnumOperacionCache.Actualizar, _
    Optional ByRef p_Error As String _
) As Boolean
    
    On Error GoTo errores
    
    p_Error = ""
    
    If p_Replanificacion Is Nothing Then
        p_Error = "Replanificación es Nothing"
        ActualizarCacheReplanificacion = False
        Exit Function
    End If
    
    ' Invalidar caché completo de la NC
    InvalidarCache p_Replanificacion.IDNoConformidad, "Replanificación " & p_Operacion & " (ID: " & p_Replanificacion.IDReplanificacion & ")", p_Error
    If p_Error <> "" Then
        ActualizarCacheReplanificacion = False
        Exit Function
    End If
    
    ActualizarCacheReplanificacion = True
    Exit Function
    
errores:
    p_Error = "Error en CacheNCProyecto.ActualizarCacheReplanificacion: " & Err.Description
    ActualizarCacheReplanificacion = False
End Function

' Actualiza sección de riesgos en caché
Public Function ActualizarCacheRiesgos( _
    p_IDNC As String, _
    p_Riesgos As Scripting.Dictionary, _
    Optional ByRef p_Error As String _
) As Boolean
    
    On Error GoTo errores
    
    p_Error = ""
    
    If p_Riesgos Is Nothing Then
        p_Error = "Riesgos es Nothing"
        ActualizarCacheRiesgos = False
        Exit Function
    End If
    
    ' Invalidar caché completo de la NC
    InvalidarCache p_IDNC, "Riesgos modificados", p_Error
    If p_Error <> "" Then
        ActualizarCacheRiesgos = False
        Exit Function
    End If
    
    ActualizarCacheRiesgos = True
    Exit Function
    
errores:
    p_Error = "Error en CacheNCProyecto.ActualizarCacheRiesgos: " & Err.Description
    ActualizarCacheRiesgos = False
End Function

' ============================================
' FUNCIONES TRANSACCIONALES
' ============================================

' Inicia una transacción para operaciones de caché
Public Function IniciarTransaccionCache( _
    p_IDNC As String, _
    Optional ByRef p_Error As String _
) As Long
    
    Static transCounter As Long
    Dim transID As Long
    
    On Error GoTo errores
    
    p_Error = ""
    
    transCounter = transCounter + 1
    transID = transCounter
    
    ' Guardar información de transacción
    If m_Transacciones Is Nothing Then
        Set m_Transacciones = New Collection
    End If
    
    Dim transInfo As Scripting.Dictionary
    Set transInfo = New Scripting.Dictionary
    transInfo.CompareMode = TextCompare
    transInfo.Add "IDNC", p_IDNC
    transInfo.Add "Inicio", Now()
    transInfo.Add "InvalidadoOriginal", CacheValida(p_IDNC)
    
    m_Transacciones.Add CStr(transID), transInfo
    
    IniciarTransaccionCache = transID
    Exit Function
    
errores:
    p_Error = "Error en IniciarTransaccionCache: " & Err.Description
    IniciarTransaccionCache = 0
End Function

' Confirma transacción de caché
Public Function CommitTransaccionCache( _
    p_TransID As Long, _
    Optional ByRef p_Error As String _
) As Boolean
    
    On Error GoTo errores
    
    p_Error = ""
    
    If m_Transacciones Is Nothing Then
        p_Error = "No hay transacciones activas"
        CommitTransaccionCache = False
        Exit Function
    End If
    
    If Not m_Transacciones.Exists(CStr(p_TransID)) Then
        p_Error = "Transacción no encontrada"
        CommitTransaccionCache = False
        Exit Function
    End If
    
    Dim transInfo As Scripting.Dictionary
    Set transInfo = m_Transacciones(CStr(p_TransID))
    
    ' Regenerar caché al final de la transacción
    GenerarCacheCompleto transInfo("IDNC"), p_Error
    If p_Error <> "" Then
        CommitTransaccionCache = False
        Exit Function
    End If
    
    ' Eliminar transacción de la colección
    m_Transacciones.Remove CStr(p_TransID)
    
    CommitTransaccionCache = True
    Exit Function
    
errores:
    p_Error = "Error en CommitTransaccionCache: " & Err.Description
    CommitTransaccionCache = False
End Function

' Revierte transacción de caché
Public Function RollbackTransaccionCache( _
    p_TransID As Long, _
    Optional ByRef p_Error As String _
) As Boolean
    
    On Error GoTo errores
    
    p_Error = ""
    
    If m_Transacciones Is Nothing Then
        p_Error = "No hay transacciones activas"
        RollbackTransaccionCache = False
        Exit Function
    End If
    
    If Not m_Transacciones.Exists(CStr(p_TransID)) Then
        p_Error = "Transacción no encontrada"
        RollbackTransaccionCache = False
        Exit Function
    End If
    
    Dim transInfo As Scripting.Dictionary
    Set transInfo = m_Transacciones(CStr(p_TransID))
    
    ' Si originalmente era válido, restaurar validez
    If transInfo("InvalidadoOriginal") = True Then
        Dim qdf As DAO.QueryDef
        Set qdf = getdb().CreateQueryDef("")
        qdf.SQL = "UPDATE " & NOMBRE_TABLA_CACHE & " SET CacheValida=True WHERE IDNoConformidad=[pIDNC];"
        qdf.Parameters("pIDNC") = transInfo("IDNC")
        qdf.Execute
        qdf.Close
        Set qdf = Nothing
    End If
    
    ' Log del rollback
    LogCacheOperacion transInfo("IDNC"), "Rollback", "Transacción rollback (ID: " & p_TransID & ")", "Sistema", True
    
    ' Eliminar transacción de la colección
    m_Transacciones.Remove CStr(p_TransID)
    
    RollbackTransaccionCache = True
    Exit Function
    
errores:
    p_Error = "Error en RollbackTransaccionCache: " & Err.Description
    RollbackTransaccionCache = False
End Function

' ============================================
' FUNCIONES DE GENERACIÓN DE JSON
' ============================================

Private Function GenerarJSONNC( _
                                p_IDNC As String, _
                                ByRef p_Error As String _
                            ) As String
    
    Dim nc As NCProyecto
    Dim SQL As String
    Dim rcd As DAO.Recordset
    Dim campo As Variant
    Dim dictNC As Scripting.Dictionary
    
    On Error GoTo errores
    
    ' Obtener NC desde BD
    SQL = "SELECT * FROM TbNoConformidades " & _
           "WHERE IDNoConformidad=" & p_IDNC & ";"
    
    Set rcd = getdb().OpenRecordset(SQL)
    
    If rcd.EOF Then
        rcd.Close
        Set rcd = Nothing
        p_Error = "NC no encontrada"
        GenerarJSONNC = ""
        Exit Function
    End If
    
    ' Crear objeto NC para obtener ColCampos
    Set nc = New NCProyecto
    Set dictNC = New Scripting.Dictionary
    dictNC.CompareMode = TextCompare
    
    For Each campo In nc.ColCampos
        dictNC.Add campo, Nz(rcd.Fields(campo).Value, "")
    Next
    
    rcd.Close
    Set rcd = Nothing
    Set nc = Nothing
    
    ' Convertir a JSON usando JsonConverter
    GenerarJSONNC = JsonConverter.ConvertToJson(dictNC)
    
    Exit Function
    
errores:
    p_Error = "Error en GenerarJSONNC: " & Err.Description
    GenerarJSONNC = "{}"
End Function

Private Function GenerarJSONACs( _
                                p_IDNC As String, _
                                ByRef p_Error As String _
                            ) As String
    
    Dim SQL As String
    Dim rcd As DAO.Recordset
    Dim AC As ACProyecto
    Dim col As Scripting.Dictionary
    Dim dictAC As Scripting.Dictionary
    Dim campo As Variant
    
    On Error GoTo errores
    
    ' Obtener ACs desde BD
    SQL = "SELECT * FROM TbNCAccionCorrectivas " & _
           "WHERE IDNoConformidad=" & p_IDNC & " " & _
           "ORDER BY IdAccionCorrectiva;"
    
    Set rcd = getdb().OpenRecordset(SQL)
    
    Set col = New Scripting.Dictionary
    col.CompareMode = TextCompare
    
    If Not rcd.EOF Then
        rcd.MoveFirst
        Do While Not rcd.EOF
            Set AC = New ACProyecto
            Set dictAC = New Scripting.Dictionary
            dictAC.CompareMode = TextCompare
            
            For Each campo In AC.ColCampos
                dictAC.Add campo, Nz(rcd.Fields(campo).Value, "")
            Next campo
            
            col.Add CStr(dictAC("IdAccionCorrectiva")), dictAC
            
            Set AC = Nothing
            rcd.MoveNext
        Loop
    End If
    
    rcd.Close
    Set rcd = Nothing
    
    ' Convertir a JSON usando JsonConverter
    GenerarJSONACs = JsonConverter.ConvertToJson(col)
    
    Exit Function
    
errores:
    p_Error = "Error en GenerarJSONACs: " & Err.Description
    GenerarJSONACs = "[]"
End Function

Private Function GenerarJSONARs( _
    p_IDNC As String, _
    ByRef p_Error As String _
) As String
    
    Dim SQL As String
    Dim rcd As DAO.Recordset
    Dim AR As ARProyecto
    Dim col As Scripting.Dictionary
    Dim dictARs As Scripting.Dictionary
    Dim dictAR As Scripting.Dictionary
    Dim campo As Variant
    
    On Error GoTo errores
    
    ' Obtener ARs desde BD (unidas con ACs)
    SQL = "SELECT TbNCAccionesRealizadas.* " & _
           "FROM TbNCAccionesRealizadas INNER JOIN TbNCAccionCorrectivas " & _
           "ON TbNCAccionesRealizadas.IdAccionCorrectiva = TbNCAccionCorrectivas.IdAccionCorrectiva " & _
           "WHERE TbNCAccionCorrectivas.IDNoConformidad=" & p_IDNC & " " & _
           "ORDER BY TbNCAccionesRealizadas.IdAccionCorrectiva, TbNCAccionesRealizadas.IDAccionRealizada;"
    
    Set rcd = getdb().OpenRecordset(SQL)
    
    Set col = New Scripting.Dictionary
    col.CompareMode = TextCompare
    
    If Not rcd.EOF Then
        rcd.MoveFirst
        Dim idAC As String
        
        Do While Not rcd.EOF
            idAC = CStr(rcd!IdAccionCorrectiva)
            
            ' Crear diccionario para este AC si no existe
            If Not col.Exists(idAC) Then
                Set dictARs = New Scripting.Dictionary
                dictARs.CompareMode = TextCompare
                col.Add idAC, dictARs
            Else
                Set dictARs = col(idAC)
            End If
            
            Set AR = New ARProyecto
            Set dictAR = New Scripting.Dictionary
            dictAR.CompareMode = TextCompare
            
            For Each campo In AR.ColCampos
                dictAR.Add campo, Nz(rcd.Fields(campo).Value, "")
            Next campo
            
            dictARs.Add CStr(rcd!IDAccionRealizada), dictAR
            
            Set AR = Nothing
            rcd.MoveNext
        Loop
    End If
    
    rcd.Close
    Set rcd = Nothing
    
    ' Convertir a JSON usando JsonConverter
    GenerarJSONARs = JsonConverter.ConvertToJson(col)
    
    Exit Function
    
errores:
    p_Error = "Error en GenerarJSONARs: " & Err.Description
    GenerarJSONARs = "{}"
End Function

Private Function GenerarJSONReplanificaciones( _
    p_IDNC As String, _
    ByRef p_Error As String _
) As String
    
    Dim SQL As String
    Dim rcd As DAO.Recordset
    Dim replanif As ReplanificacionesProyecto
    Dim col As Scripting.Dictionary
    Dim dictReplanif As Scripting.Dictionary
    Dim campo As Variant
    
    On Error GoTo errores
    
    ' Obtener Replanificaciones desde BD
    SQL = "SELECT * FROM TbReplanificacionesProyecto " & _
           "WHERE IDNoConformidad=" & p_IDNC & " " & _
           "ORDER BY IDReplanificacion;"
    
    Set rcd = getdb().OpenRecordset(SQL)
    
    Set col = New Scripting.Dictionary
    col.CompareMode = TextCompare
    
    If Not rcd.EOF Then
        rcd.MoveFirst
        Do While Not rcd.EOF
            Set replanif = New ReplanificacionesProyecto
            Set dictReplanif = New Scripting.Dictionary
            dictReplanif.CompareMode = TextCompare
            
            For Each campo In replanif.ColCampos
                dictReplanif.Add campo, Nz(rcd.Fields(campo).Value, "")
            Next campo
            
            col.Add CStr(dictReplanif("IDReplanificacion")), dictReplanif
            
            Set replanif = Nothing
            rcd.MoveNext
        Loop
    End If
    
    rcd.Close
    Set rcd = Nothing
    
    ' Convertir a JSON usando JsonConverter
    GenerarJSONReplanificaciones = JsonConverter.ConvertToJson(col)
    
    Exit Function
    
errores:
    p_Error = "Error en GenerarJSONReplanificaciones: " & Err.Description
    GenerarJSONReplanificaciones = "[]"
End Function

Private Function GenerarJSONRiesgos( _
    p_IDNC As String, _
    ByRef p_Error As String _
) As String
    
    Dim SQL As String
    Dim rcd As DAO.Recordset
    Dim dbRiesgos As DAO.Database
    Dim errRiesgos As String
    Dim riesgo As riesgo
    Dim col As Scripting.Dictionary
    Dim dictRiesgo As Scripting.Dictionary
    Dim campo As Variant
    
    On Error GoTo errores
    
    ' Obtener Riesgos asociados a la NC
    ' Basado en RiesgoRepositorio.GetRiesgosAsociados
    SQL = "SELECT R.* FROM TbRiesgos AS R " & _
          "INNER JOIN TbRiesgosNC AS L ON R.IDRiesgo = L.IDRiesgo " & _
          "WHERE L.IDNC = " & p_IDNC
    
    ' Usamos getdb() para acceder al backend configurado.
    ' Si el backend vinculado de Riesgos no está disponible, la caché de NC no debe bloquearse:
    ' se cachean los datos principales y se deja Riesgos como objeto vacío.
    Set dbRiesgos = getdb(errRiesgos)
    If dbRiesgos Is Nothing Then
        p_Error = ""
        GenerarJSONRiesgos = "{}"
        Exit Function
    End If

    Set rcd = dbRiesgos.OpenRecordset(SQL)
    
    Set col = New Scripting.Dictionary
    col.CompareMode = TextCompare
    
    If Not rcd.EOF Then
        rcd.MoveFirst
        Do While Not rcd.EOF
            Set riesgo = New riesgo
            Set dictRiesgo = New Scripting.Dictionary
            dictRiesgo.CompareMode = TextCompare
            
            ' Hidratamos el diccionario con los campos del objeto Riesgo
            ' Nota: Se asume que el objeto Riesgo tiene una propiedad ColCampos similar a NCProyecto/ACProyecto
            ' Si no la tiene, usamos los campos específicos que vimos en RiesgoRepositorio
            
            dictRiesgo.Add "idRiesgo", rcd!idRiesgo
            dictRiesgo.Add "CodigoRiesgo", Nz(rcd!CodigoRiesgo, "")
            dictRiesgo.Add "Descripcion", Nz(rcd!Descripcion, "")
            dictRiesgo.Add "IDEdicion", rcd!IDEdicion
            
            col.Add CStr(rcd!idRiesgo), dictRiesgo
            
            Set riesgo = Nothing
            rcd.MoveNext
        Loop
    End If
    
    rcd.Close
    Set rcd = Nothing
    Set dbRiesgos = Nothing
    
    ' Convertir a JSON usando JsonConverter
    GenerarJSONRiesgos = JsonConverter.ConvertToJson(col)
    
    Exit Function
    
errores:
    If Not rcd Is Nothing Then rcd.Close
    Set rcd = Nothing
    Set dbRiesgos = Nothing
    ' Riesgos es una dependencia externa/vinculada. Si no está disponible,
    ' no debe bloquear la generación del caché de No Conformidades.
    p_Error = ""
    GenerarJSONRiesgos = "{}"
End Function

' ============================================
' FUNCIONES DE PARSEO DE JSON
' ============================================

Private Function ParseJSONToNC( _
    p_NC As NCProyecto, _
    p_JSON As String, _
    ByRef p_Error As String _
) As Boolean
    
    Dim obj As Object
    Dim campo As Variant
    
    On Error GoTo errores
    
    Set obj = JsonConverter.ParseJson(p_JSON)
    If obj Is Nothing Then
        p_Error = "Error parseando JSON de NC"
        ParseJSONToNC = False
        Exit Function
    End If
    
    ' Cargar campos desde JSON a NC
    For Each campo In obj.Keys
        p_NC.SetPropiedad campo, obj(campo), p_Error
        If p_Error <> "" Then Exit For
    Next campo
    
    ParseJSONToNC = (p_Error = "")
    Exit Function
    
errores:
    p_Error = "Error en ParseJSONToNC: " & Err.Description
    ParseJSONToNC = False
End Function

Private Function ParseJSONToACs( _
    p_JSON As String, _
    p_IDNC As String, _
    ByRef p_Error As String _
) As Scripting.Dictionary
    
    Dim arr As Object
    Dim i As Variant
    Dim AC As ACProyecto
    Dim col As Scripting.Dictionary
    
    On Error GoTo errores
    
    Set arr = JsonConverter.ParseJson(p_JSON)
    If arr Is Nothing Then
        Set ParseJSONToACs = Nothing
        Exit Function
    End If
    
    Set col = New Scripting.Dictionary
    col.CompareMode = TextCompare
    
    ' Iteramos sobre el diccionario (que contiene los ACs con ID como clave)
    For Each i In arr.Keys
        Set AC = New ACProyecto
        AC.IDNoConformidad = p_IDNC
        
        Dim objAC As Object
        Set objAC = arr(i)
        
        Dim campo As Variant
        For Each campo In objAC.Keys
            AC.SetPropiedad campo, objAC(campo), p_Error
            If p_Error <> "" Then Exit For
        Next campo
        
        If p_Error = "" Then
            col.Add CStr(AC.IdAccionCorrectiva), AC
        End If
    Next i
    
    Set ParseJSONToACs = col
    Exit Function
    
errores:
    p_Error = "Error en ParseJSONToACs: " & Err.Description
    Set ParseJSONToACs = Nothing
End Function

Private Function ParseJSONToARsEnACs( _
                                    p_NC As NCProyecto, _
                                    p_JSON As String, _
                                    ByRef p_Error As String _
                                ) As Boolean
    
    Dim obj As Object
    Dim idAC As Variant
    Dim arrARs As Object
    Dim i As Variant
    Dim AR As ARProyecto
    
    On Error GoTo errores
    
    Set obj = JsonConverter.ParseJson(p_JSON)
    If obj Is Nothing Then
        p_Error = "Error parseando JSON de ARs"
        ParseJSONToARsEnACs = False
        Exit Function
    End If
    
    ' El objeto principal tiene claves = ID de AC
    For Each idAC In obj.Keys
        If p_NC.ACs.Exists(idAC) Then
            Dim AC As ACProyecto
            Set AC = p_NC.ACs(idAC)
            
            Dim colARs As Scripting.Dictionary
            Set colARs = New Scripting.Dictionary
            colARs.CompareMode = TextCompare
            
            Set arrARs = obj(idAC)
            
            For Each i In arrARs.Keys
                Set AR = New ARProyecto
                ' ARProyecto no tiene IDNoConformidad, se vincula a través de AC
                
                Dim objAR As Object
                Set objAR = arrARs(i)
                
                Dim campo As Variant
                For Each campo In objAR.Keys
                    AR.SetPropiedad campo, objAR(campo), p_Error
                    If p_Error <> "" Then Exit For
                Next campo
                
                Set AR.AC = AC
                colARs.Add CStr(AR.IDAccionRealizada), AR
            Next i
            
            Set AC.ARs = colARs
        End If
    Next idAC
    
    ParseJSONToARsEnACs = True
    Exit Function
    
errores:
    p_Error = "Error en ParseJSONToARsEnACs: " & Err.Description
    ParseJSONToARsEnACs = False
End Function

Private Function ParseJSONToReplanificaciones( _
    p_JSON As String, _
    p_IDNC As String, _
    ByRef p_Error As String _
) As Scripting.Dictionary
    
    Dim arr As Object
    Dim i As Variant
    Dim replanif As ReplanificacionesProyecto
    Dim col As Scripting.Dictionary
    
    On Error GoTo errores
    
    Set arr = JsonConverter.ParseJson(p_JSON)
    If arr Is Nothing Then
        Set ParseJSONToReplanificaciones = Nothing
        Exit Function
    End If
    
    Set col = New Scripting.Dictionary
    col.CompareMode = TextCompare
    
    For Each i In arr.Keys
        Set replanif = New ReplanificacionesProyecto
        replanif.IDNoConformidad = p_IDNC
        
        Dim objReplanif As Object
        Set objReplanif = arr(i)
        
        Dim campo As Variant
        For Each campo In objReplanif.Keys
            replanif.SetPropiedad campo, objReplanif(campo), p_Error
            If p_Error <> "" Then Exit For
        Next campo
        
        If p_Error = "" Then
            col.Add CStr(replanif.IDReplanificacion), replanif
        End If
    Next i
    
    Set ParseJSONToReplanificaciones = col
    Exit Function
    
errores:
    p_Error = "Error en ParseJSONToReplanificaciones: " & Err.Description
    Set ParseJSONToReplanificaciones = Nothing
End Function

Private Function ParseJSONToRiesgos( _
    p_JSON As String, _
    ByRef p_Error As String _
) As Scripting.Dictionary
    
    Dim arrRiesgos As Object
    Dim i As Variant
    Dim riesgo As riesgo
    Dim col As Scripting.Dictionary
    
    On Error GoTo errores
    
    Set arrRiesgos = JsonConverter.ParseJson(p_JSON)
    If arrRiesgos Is Nothing Then
        Set ParseJSONToRiesgos = Nothing
        Exit Function
    End If
    
    Set col = New Scripting.Dictionary
    col.CompareMode = TextCompare
    
            For Each i In arrRiesgos.Keys
                Set riesgo = New riesgo
                
                Dim objRiesgo As Object
                Set objRiesgo = arrRiesgos(i)
                
                Dim campo As Variant
                For Each campo In objRiesgo.Keys
                    riesgo.SetPropiedad campo, objRiesgo(campo), p_Error
                    If p_Error <> "" Then Exit For
                Next campo
                
                If p_Error = "" Then
                    col.Add CStr(riesgo.idRiesgo), riesgo
                End If
            Next i
    
    Set ParseJSONToRiesgos = col
    Exit Function
    
errores:
    p_Error = "Error en ParseJSONToRiesgos: " & Err.Description
    Set ParseJSONToRiesgos = Nothing
End Function

' ============================================
' MÉTODOS DE LISTADO CON FILTROS (Spec-003)
' ============================================

' Obtiene listado filtrado de NCs como ViewModels (ListItem)
' Retorna Collection de NCProyectoListItemVM
Public Function GetListadoFiltradoSQL( _
                                Optional ByVal p_Codigo As String = "", _
                                Optional ByVal p_IDExpediente As Long = 0, _
                                Optional ByVal p_IDTipo As Long = 0, _
                                Optional ByVal p_Estado As String = "", _
                                Optional ByVal p_Descripcion As String = "", _
                                Optional ByVal p_Notas As String = "", _
                                Optional ByVal p_RequiereCE As String = "", _
                                Optional ByVal p_ControlEficacia As String = "", _
                                Optional ByVal p_ResponsableCalidad As String = "", _
                                Optional ByVal p_RegistrosCerrados As String = "", _
                                Optional ByVal p_ResponsableTelefonica As String = "", _
                                Optional ByVal p_Google As String = "", _
                                Optional ByRef p_Error As String _
                            ) As Collection

    Dim rs As DAO.Recordset
    Dim SQL As String
    Dim col As Collection
    Dim vm As NCProyectoListItemVM
    Dim filtros As String
    
    On Error GoTo errores
    
    p_Error = ""
    Set col = New Collection
    
    ' Verificar kill-switch (Spec-010)
    If Not IsCacheEnabled() Then
        Set GetListadoFiltradoSQL = col
        Exit Function
    End If
    
    ' Construir WHERE dinámico
    SQL = "SELECT n.IDNoConformidad, n.CodigoNoConformidad, n.IDExpediente, " & _
          "n.Descripcion, n.Estado, n.FechaApertura, n.FECHACIERRE, " & _
          "n.Proyecto, n.Vehiculo, n.ResponsableTelefonica, n.ResponsableCalidad, " & _
          "n.Cerrada, n.RequiereACR, n.ACR, n.RequiereControlEficacia, " & _
          "e.Nemotecnico, e.CodExp " & _
          "FROM TbNoConformidades n " & _
          "LEFT JOIN TbExpedientes e ON n.IDExpediente = e.IDExpediente " & _
          "WHERE 1=1 "
    
    If p_Codigo <> "" Then
        SQL = SQL & "AND n.CodigoNoConformidad LIKE '%" & Replace(p_Codigo, "'", "''") & "%' "
    End If
    
    If p_IDExpediente > 0 Then
        SQL = SQL & "AND n.IDExpediente = " & p_IDExpediente & " "
    End If
    
    If p_IDTipo > 0 Then
        SQL = SQL & "AND n.IDTipo = " & p_IDTipo & " "
    End If
    
    If p_Estado <> "" Then
        SQL = SQL & "AND n.Estado = '" & Replace(p_Estado, "'", "''") & "' "
    End If
    
    If p_Descripcion <> "" Then
        SQL = SQL & "AND n.Descripcion LIKE '%" & Replace(p_Descripcion, "'", "''") & "%' "
    End If
    
    If p_Notas <> "" Then
        SQL = SQL & "AND n.Notas LIKE '%" & Replace(p_Notas, "'", "''") & "%' "
    End If
    
    If p_RequiereCE <> "" Then
        SQL = SQL & "AND n.RequiereCE = '" & Replace(p_RequiereCE, "'", "''") & "' "
    End If
    
    If p_ControlEficacia <> "" Then
        SQL = SQL & "AND n.RequiereControlEficacia = '" & Replace(p_ControlEficacia, "'", "''") & "' "
    End If
    
    If p_ResponsableCalidad <> "" Then
        SQL = SQL & "AND n.ResponsableCalidad LIKE '%" & Replace(p_ResponsableCalidad, "'", "''") & "%' "
    End If
    
    If p_ResponsableTelefonica <> "" Then
        SQL = SQL & "AND n.ResponsableTelefonica LIKE '%" & Replace(p_ResponsableTelefonica, "'", "''") & "%' "
    End If
    
    ' Filtro de registros cerrados
    If p_RegistrosCerrados = "0" Then
        SQL = SQL & "AND n.Cerrada = 0 "
    ElseIf p_RegistrosCerrados = "1" Then
        SQL = SQL & "AND n.Cerrada = 1 "
    End If
    
    SQL = SQL & "ORDER BY n.FechaApertura DESC"
    
    Set rs = getdb().OpenRecordset(SQL, dbOpenSnapshot)
    
    If Not rs.EOF Then
        rs.MoveFirst
        Do While Not rs.EOF
            Set vm = New NCProyectoListItemVM
            vm.CargarDesdeRecordset rs, p_Error
            If p_Error = "" Then
                col.Add vm
            End If
            Set vm = Nothing
            rs.MoveNext
        Loop
    End If
    
    rs.Close
    Set rs = Nothing
    
    Set GetListadoFiltradoSQL = col
    Exit Function
    
errores:
    p_Error = "Error en CacheNCProyecto.GetListadoFiltradoSQL: " & Err.Description
    If Not rs Is Nothing Then rs.Close: Set rs = Nothing
    Set GetListadoFiltradoSQL = col
End Function

' ============================================
' INVALIDACIÓN DE LISTA (Spec-008 / Spec-010)
' ============================================

' Invalida el caché de listados
' p_Razon: descripción del motivo de invalidación
Public Function InvalidateList_Cache( _
                            Optional ByVal p_Razon As String = "", _
                            Optional ByRef p_Error As String _
                        ) As Boolean
    
    Dim qdf As DAO.QueryDef
    
    On Error GoTo errores
    
    p_Error = ""
    InvalidateList_Cache = False
    
    ' Verificar kill-switch
    If Not IsCacheEnabled() Then
        InvalidateList_Cache = True
        Exit Function
    End If
    
    ' Invalidar todos los registros de caché de lista
    ' (TbCacheNCProyecto tiene CacheValida que se invalida por NC individual)
    ' Esta función marca todas como inválidas para forzar rebuild lazy
    Set qdf = getdb().CreateQueryDef("")
    qdf.SQL = "UPDATE " & NOMBRE_TABLA_CACHE & " SET CacheValida=False WHERE CacheValida=True;"
    qdf.Execute
    qdf.Close
    Set qdf = Nothing
    
    LogCacheOperacion "0", "InvalidateList", p_Razon, ObtenerUsuarioConectado(), True
    
    InvalidateList_Cache = True
    Exit Function
    
errores:
    p_Error = "Error en CacheNCProyecto.InvalidateList_Cache: " & Err.Description
    If Not qdf Is Nothing Then qdf.Close: Set qdf = Nothing
    InvalidateList_Cache = False
End Function

' Invalida un item específico del caché de listados (TbCacheListadoNC)
' y lo regenera inmediatamente (Spec-008: DELETE + REGENERATE para listados)
Public Function InvalidateListItem( _
                            ByVal p_IDNC As Long, _
                            Optional ByRef p_Error As String _
                        ) As Boolean
    
    Dim qdf As DAO.QueryDef
    Dim rs As DAO.Recordset
    Dim SQL As String
    
    On Error GoTo errores
    
    p_Error = ""
    InvalidateListItem = False
    
    ' Verificar kill-switch
    If Not IsCacheEnabled() Then
        InvalidateListItem = True
        Exit Function
    End If
    
    ' Eliminar el registro de listado
    Set qdf = getdb().CreateQueryDef("")
    qdf.SQL = "DELETE FROM " & NOMBRE_TABLA_LISTADO & " WHERE IDNoConformidad=[pIDNC];"
    qdf.Parameters("pIDNC") = p_IDNC
    qdf.Execute
    qdf.Close
    Set qdf = Nothing
    
    ' Regenerar el item en el caché de listado
    ' Usamos CacheNCCacheRepositorio para esto
    Dim cacheRepo As New CacheNCCacheRepositorio
    If Not cacheRepo.UpsertListado(p_IDNC, p_Error) Then
        Exit Function
    End If
    
    LogCacheOperacion CStr(p_IDNC), "InvalidateListItem", "Item listado invalidado y regenerado", ObtenerUsuarioConectado(), True
    
    InvalidateListItem = True
    Exit Function
    
errores:
    p_Error = "Error en CacheNCProyecto.InvalidateListItem: " & Err.Description
    If Not qdf Is Nothing Then qdf.Close: Set qdf = Nothing
    InvalidateListItem = False
End Function

' ============================================
' REBUILD DE LISTA (Spec-009 Precalentado)
' ============================================

' Rebuild completo del caché de listados
' Recorre todas las NCs y regenera su caché
Public Function RebuildCacheLista( _
                            Optional ByRef p_Error As String _
                        ) As Boolean
    
    Dim rs As DAO.Recordset
    Dim SQL As String
    Dim contador As Long
    Dim inicio As Long
    Dim erroresRebuild As Long
    
    On Error GoTo errores
    
    p_Error = ""
    RebuildCacheLista = False
    
    ' Verificar kill-switch
    If Not IsCacheEnabled() Then
        RebuildCacheLista = True
        Exit Function
    End If
    
    inicio = Timer
    contador = 0
    erroresRebuild = 0
    
    ' Obtener todos los IDs de NC
    SQL = "SELECT IDNoConformidad FROM TbNoConformidades ORDER BY IDNoConformidad"
    Set rs = getdb().OpenRecordset(SQL, dbOpenSnapshot)
    
    If Not rs.EOF Then
        rs.MoveFirst
        Do While Not rs.EOF
            Dim idNC As String
            Dim errItem As String
            
            idNC = CStr(rs!IDNoConformidad)
            
            If GenerarCacheCompleto(idNC, errItem) Then
                contador = contador + 1
            Else
                erroresRebuild = erroresRebuild + 1
            End If
            
            rs.MoveNext
        Loop
    End If
    
    rs.Close
    Set rs = Nothing
    
    LogCacheOperacion "0", "RebuildLista", "Rebuild completado: " & contador & " NCs, " & erroresRebuild & " errores", ObtenerUsuarioConectado(), True
    
    RebuildCacheLista = True
    Exit Function
    
errores:
    p_Error = "Error en CacheNCProyecto.RebuildCacheLista: " & Err.Description
    If Not rs Is Nothing Then rs.Close: Set rs = Nothing
    RebuildCacheLista = False
End Function

' ============================================
' INVALIDACIÓN EN CASCADA (Spec-008)
' ============================================

' Sincroniza el caché en cascada según tipo de entidad
' p_TipoEntidad: "NC", "AC", "AR", "Replanificacion", "Riesgo"
' p_ID: ID de la entidad afectada
' La llamada a InvalidarCache conserva el nombre legacy, pero sincroniza indicadores de Proyecto inmediatamente.
Public Function InvalidateCascada( _
                            ByVal p_TipoEntidad As String, _
                            ByVal p_ID As Long, _
                            Optional ByRef p_Error As String _
                        ) As Boolean
    
    Dim idNC As String
    Dim errItem As String
    
    On Error GoTo errores
    
    p_Error = ""
    InvalidateCascada = False
    
    ' Verificar kill-switch
    If Not IsCacheEnabled() Then
        InvalidateCascada = True
        Exit Function
    End If
    
    ' Determinar qué NC se ve afectada según el tipo de entidad
    Select Case LCase(p_TipoEntidad)
        Case "nc"
            ' Invalidación directa de la NC
            idNC = CStr(p_ID)
            
        Case "ac"
            ' AC pertenece a una NC - obtener el ID de NC padre
            idNC = ObtenerIDNCDesdeAC(p_ID)
            
        Case "ar"
            ' AR pertenece a una NC a través de AC
            idNC = ObtenerIDNCDesdeAR(p_ID)
            
        Case "replanificacion"
            ' La replanificación tiene IDNoConformidad directo
            idNC = CStr(p_ID)
            
        Case "riesgo"
            ' El riesgo se asocia a NC a través de tabla de link
            idNC = ObtenerIDNCDesdeRiesgo(p_ID)
            
        Case Else
            p_Error = "TipoEntidad desconocido: " & p_TipoEntidad
            Exit Function
    End Select
    
    If idNC = "" Then
        ' No se encontró NC asociada - no hay nada que invalidar
        InvalidateCascada = True
        Exit Function
    End If
    
    ' Sincronizar el caché afectado de la NC padre e indicadores de Proyecto.
    If Not InvalidarCache(idNC, "Invalidacion cascada (" & p_TipoEntidad & " ID:" & p_ID & ")", errItem) Then
        p_Error = errItem
        Exit Function
    End If
    
    LogCacheOperacion idNC, "InvalidateCascada", "Cascada (" & p_TipoEntidad & " ID:" & p_ID & ")", ObtenerUsuarioConectado(), True
    
    InvalidateCascada = True
    Exit Function
    
errores:
    p_Error = "Error en CacheNCProyecto.InvalidateCascada: " & Err.Description
    InvalidateCascada = False
End Function

' Helper: Obtiene ID de NC padre desde un AC
Private Function ObtenerIDNCDesdeAC(ByVal p_IDAC As Long) As String
    Dim rs As DAO.Recordset
    Dim SQL As String
    
    On Error GoTo errores
    
    SQL = "SELECT IDNoConformidad FROM TbNCAccionCorrectivas WHERE IdAccionCorrectiva = " & p_IDAC
    Set rs = getdb().OpenRecordset(SQL, dbOpenSnapshot)
    
    If Not rs.EOF Then
        ObtenerIDNCDesdeAC = CStr(Nz(rs!IDNoConformidad, ""))
    Else
        ObtenerIDNCDesdeAC = ""
    End If
    
    rs.Close
    Set rs = Nothing
    Exit Function
    
errores:
    ObtenerIDNCDesdeAC = ""
    If Not rs Is Nothing Then rs.Close: Set rs = Nothing
End Function

' Helper: Obtiene ID de NC padre desde un AR
Private Function ObtenerIDNCDesdeAR(ByVal p_IDAR As Long) As String
    Dim rs As DAO.Recordset
    Dim SQL As String
    
    On Error GoTo errores
    
    SQL = "SELECT AC.IDNoConformidad FROM TbNCAccionesRealizadas AR " & _
          "INNER JOIN TbNCAccionCorrectivas AC ON AR.IdAccionCorrectiva = AC.IdAccionCorrectiva " & _
          "WHERE AR.IDAccionRealizada = " & p_IDAR
    Set rs = getdb().OpenRecordset(SQL, dbOpenSnapshot)
    
    If Not rs.EOF Then
        ObtenerIDNCDesdeAR = CStr(Nz(rs!IDNoConformidad, ""))
    Else
        ObtenerIDNCDesdeAR = ""
    End If
    
    rs.Close
    Set rs = Nothing
    Exit Function
    
errores:
    ObtenerIDNCDesdeAR = ""
    If Not rs Is Nothing Then rs.Close: Set rs = Nothing
End Function

' ============================================
' SINCRONIZACIÓN DE CACHÉ (Spec-003 §4.2)
' ============================================

' Regenera un registro específico en ambas tablas de caché
' Detalle: TbCacheNCProyecto (GenerarCacheCompleto)
' Listado: TbCacheListadoNC (UpsertListado via CacheNCCacheRepositorio)
Public Function RegenerarRegistro( _
    ByVal p_IDNC As String, _
    Optional ByRef p_Error As String _
) As Boolean
    
    Dim cacheRepo As CacheNCCacheRepositorio
    Dim errDetalle As String
    Dim errListado As String
    
    On Error GoTo errores
    
    p_Error = ""
    RegenerarRegistro = False
    
    ' 1. Generar/regenerar caché de DETALLE (TbCacheNCProyecto)
    If Not GenerarCacheCompleto(p_IDNC, errDetalle) Then
        p_Error = "Error generando cache detalle: " & errDetalle
        Exit Function
    End If
    
    ' 2. Upsert en caché de LISTADO (TbCacheListadoNC)
    Set cacheRepo = New CacheNCCacheRepositorio
    If Not cacheRepo.UpsertListado(CLng(p_IDNC), errListado) Then
        p_Error = "Error actualizando cache listado: " & errListado
        Exit Function
    End If
    
    LogCacheOperacion p_IDNC, "Regenerar", "Registro regenerado en detalle y listado", ObtenerUsuarioConectado(), True
    
    RegenerarRegistro = True
    Exit Function
    
errores:
    p_Error = "Error en CacheNCProyecto.RegenerarRegistro: " & Err.Description
    RegenerarRegistro = False
End Function

' Sincroniza el caché de listados con la fuente de verdad
' Invariante: TbCacheListadoNC.IDs == TbNoConformidades.IDs (no orphans, no missing)
' Spec: §4.2
Public Function SincronizarCache(Optional ByRef p_Error As String) As Boolean
    
    Dim rsFuente As DAO.Recordset
    Dim rsCache As DAO.Recordset
    Dim SQL As String
    Dim colFuente As New Collection
    Dim colCache As New Collection
    Dim colFaltan As New Collection
    Dim colSobran As New Collection
    Dim idNC As Variant
    Dim errItem As String
    Dim inicio As Long
    Dim erroresCount As Long
    Dim i As Long
    Dim usuarios As String
    
    On Error GoTo errores
    
    p_Error = ""
    SincronizarCache = False
    erroresCount = 0
    
    ' 1. Kill-switch: si cache desactivada, retornar True (NOOP)
    If Not IsCacheEnabled() Then
        LogCacheOperacion "0", "Sincronizar", "Cache desactivada - NOOP", "Sistema", True
        SincronizarCache = True
        Exit Function
    End If
    
    inicio = Timer
    usuarios = ObtenerUsuarioConectado()
    
    ' 2. Obtener IDs de la FUENTE (TbNoConformidades WHERE Borrado=0)
    SQL = "SELECT IDNoConformidad FROM TbNoConformidades WHERE Nz(Borrado, 0) = 0 ORDER BY IDNoConformidad"
    Set rsFuente = getdb().OpenRecordset(SQL, dbOpenSnapshot)
    
    Do While Not rsFuente.EOF
        colFuente.Add CStr(rsFuente!IDNoConformidad)
        rsFuente.MoveNext
    Loop
    rsFuente.Close
    Set rsFuente = Nothing
    
    ' 3. Obtener IDs del CACHÉ de listado (TbCacheListadoNC)
    SQL = "SELECT IDNoConformidad FROM " & NOMBRE_TABLA_LISTADO & " ORDER BY IDNoConformidad"
    Set rsCache = getdb().OpenRecordset(SQL, dbOpenSnapshot)
    
    Do While Not rsCache.EOF
        colCache.Add CStr(rsCache!IDNoConformidad)
        rsCache.MoveNext
    Loop
    rsCache.Close
    Set rsCache = Nothing
    
    ' 4. Calcular FALTAN (IDs en fuente pero no en caché)
    For Each idNC In colFuente
        If NotExisteEnColeccion(colCache, CStr(idNC)) Then
            colFaltan.Add idNC
        End If
    Next idNC
    
    ' 5. Calcular SOBRAN (IDs en caché pero no en fuente)
    For Each idNC In colCache
        If NotExisteEnColeccion(colFuente, CStr(idNC)) Then
            colSobran.Add idNC
        End If
    Next idNC
    
    ' 6. Procesar FALTAN: regenerar registro en detalle + upsert en listado
    For i = 1 To colFaltan.count
        idNC = colFaltan(i)
        If Not RegenerarRegistro(CStr(idNC), errItem) Then
            erroresCount = erroresCount + 1
            LogCacheOperacion CStr(idNC), "Sync-Faltan", "Error: " & errItem, usuarios, False
        Else
            LogCacheOperacion CStr(idNC), "Sync-Faltan", "Registrado en cache", usuarios, True
        End If
    Next i
    
    ' 7. Procesar SOBRAN: eliminar de ambas tablas de caché
    Dim cacheRepo As CacheNCCacheRepositorio
    Set cacheRepo = New CacheNCCacheRepositorio
    
    For i = 1 To colSobran.count
        idNC = colSobran(i)
        
        ' DELETE de TbCacheNCProyecto (detalle)
        If Not cacheRepo.EliminarDetalle(CLng(idNC), errItem) Then
            erroresCount = erroresCount + 1
            LogCacheOperacion CStr(idNC), "Sync-Sobran-Detalle", "Error: " & errItem, usuarios, False
        End If
        
        ' DELETE de TbCacheListadoNC (listado)
        If Not cacheRepo.EliminarListado(CLng(idNC), errItem) Then
            erroresCount = erroresCount + 1
            LogCacheOperacion CStr(idNC), "Sync-Sobran-Listado", "Error: " & errItem, usuarios, False
        End If
        
        If erroresCount = 0 Then
            LogCacheOperacion CStr(idNC), "Sync-Sobran", "Eliminado de cache", usuarios, True
        End If
    Next i
    
    Set cacheRepo = Nothing
    
    ' 8. Log del resultado global
    Dim duracion As Long
    duracion = (Timer - inicio) * 1000
    
    Dim detalleLog As String
    detalleLog = "Sincronizacion completada. Faltan: " & colFaltan.count & ", Sobran: " & colSobran.count & ", Errores: " & erroresCount
    
    If erroresCount = 0 Then
        LogCacheOperacion "0", "Sincronizar", detalleLog, usuarios, True, duracion
        SincronizarCache = True
    Else
        p_Error = erroresCount & " errores durante sincronizacion"
        LogCacheOperacion "0", "Sincronizar", detalleLog, usuarios, False, duracion
        SincronizarCache = False
    End If
    
    Exit Function
    
errores:
    p_Error = "Error en CacheNCProyecto.SincronizarCache: " & Err.Description
    If Not rsFuente Is Nothing Then rsFuente.Close: Set rsFuente = Nothing
    If Not rsCache Is Nothing Then rsCache.Close: Set rsCache = Nothing
    SincronizarCache = False
End Function

' Helper: verifica si un ID no existe en la colección
Private Function NotExisteEnColeccion( _
    ByRef p_col As Collection, _
    ByVal p_ID As String _
) As Boolean
    
    Dim item As Variant
    NotExisteEnColeccion = True
    
    For Each item In p_col
        If CStr(item) = p_ID Then
            NotExisteEnColeccion = False
            Exit Function
        End If
    Next item
End Function

' Helper: Obtiene ID de NC desde un Riesgo (vía tabla de link TbRiesgosNC)
Private Function ObtenerIDNCDesdeRiesgo(ByVal p_IDRiesgo As Long) As String
    Dim rs As DAO.Recordset
    Dim SQL As String
    
    On Error GoTo errores
    
    SQL = "SELECT IDNC FROM TbRiesgosNC WHERE IDRiesgo = " & p_IDRiesgo
    Set rs = getdb().OpenRecordset(SQL, dbOpenSnapshot)
    
    If Not rs.EOF Then
        ObtenerIDNCDesdeRiesgo = CStr(Nz(rs!idNC, ""))
    Else
        ObtenerIDNCDesdeRiesgo = ""
    End If
    
    rs.Close
    Set rs = Nothing
    Exit Function
    
errores:
    ObtenerIDNCDesdeRiesgo = ""
    If Not rs Is Nothing Then rs.Close: Set rs = Nothing
End Function

' ============================================
' PRECALENTADO MANUAL DE CACHÉ (Spec-009)
' ============================================

' Precalienta el caché completo (detalle + listado) de todas las NCs
' Parámetros:
'   p_BatchSize: Cantidad de NCs a procesar por lote (default 50)
'   p_IncluirListado: Si True, precalienta también el caché de listado (default True)
'   p_FiltrosListado: Lista de filtros baseline a precalentar (separados por comma)
'   p_ForceOverwrite: Si True, regenera incluso si ya existe caché válida (default False)
'   p_Error: Variable de salida para mensaje de error
' Retorna: True si el proceso completó exitosamente, False si hubo errores
Public Function PrecalentarCacheCompleto( _
    Optional ByVal p_BatchSize As Long = 50, _
    Optional ByVal p_IncluirListado As Boolean = True, _
    Optional ByVal p_FiltrosListado As String = "", _
    Optional ByVal p_ForceOverwrite As Boolean = False, _
    Optional ByRef p_Error As String _
) As Boolean
    
    Dim rs As DAO.Recordset
    Dim SQL As String
    Dim cacheRepo As CacheNCCacheRepositorio
    Dim contadorTotal As Long
    Dim contadorExitosas As Long
    Dim contadorOmitidas As Long
    Dim contadorErrores As Long
    Dim inicio As Long
    Dim duracionTotal As Double
    Dim idNC As Long
    Dim errItem As String
    Dim enBatch As Long
    Dim totalNCs As Long
    
    On Error GoTo errores
    
    p_Error = ""
    PrecalentarCacheCompleto = False
    
    ' Verificar kill-switch
    If Not IsCacheEnabled() Then
        LogCacheOperacion "0", "PrecalentarCache", "Caché deshabilitada - NOOP", ObtenerUsuarioConectado(), True
        PrecalentarCacheCompleto = True
        Exit Function
    End If
    
    inicio = Timer
    
    ' Obtener total de NCs
    SQL = "SELECT COUNT(*) AS Total FROM TbNoConformidades"
    Set rs = getdb().OpenRecordset(SQL, dbOpenSnapshot)
    totalNCs = rs!total
    rs.Close
    Set rs = Nothing
    
    If totalNCs = 0 Then
        LogCacheOperacion "0", "PrecalentarCache", "No hay NCs para precalentar", ObtenerUsuarioConectado(), True
        PrecalentarCacheCompleto = True
        Exit Function
    End If
    
    ' Inicializar contadores
    contadorTotal = 0
    contadorExitosas = 0
    contadorOmitidas = 0
    contadorErrores = 0
    enBatch = 0
    
    ' Obtener todos los IDs de NCs
    SQL = "SELECT IDNoConformidad FROM TbNoConformidades ORDER BY IDNoConformidad"
    Set rs = getdb().OpenRecordset(SQL, dbOpenSnapshot)
    
    ' Crear instancia del repositorio de caché
    Set cacheRepo = New CacheNCCacheRepositorio
    
    If Not rs.EOF Then
        rs.MoveFirst
        
        Do While Not rs.EOF
            idNC = rs!IDNoConformidad
            contadorTotal = contadorTotal + 1
            enBatch = enBatch + 1
            
            ' Verificar si debemos procesar esta NC
            Dim skipNC As Boolean
            skipNC = False
            
            If Not p_ForceOverwrite Then
                ' Si no forzamos overwrite, verificar si ya tiene caché válida en ambas tablas
                Dim cacheDetalleValida As Boolean
                Dim cacheListadoValida As Boolean
                
                cacheDetalleValida = CacheValida(CStr(idNC))
                
                If p_IncluirListado Then
                    cacheListadoValida = cacheRepo.GetListadoValido(idNC, errItem)
                Else
                    cacheListadoValida = True  ' Si no incluimos listado, no importa
                End If
                
                If cacheDetalleValida And cacheListadoValida Then
                    skipNC = True
                    contadorOmitidas = contadorOmitidas + 1
                End If
            End If
            
            If skipNC Then
                ' No hacer nada - ya tiene caché válida
            Else
                ' Generar caché de detalle
                If GenerarCacheCompleto(CStr(idNC), errItem) Then
                    contadorExitosas = contadorExitosas + 1
                    
                    ' Si incluye listado, generar también el caché de listado
                    If p_IncluirListado Then
                        cacheRepo.UpsertListado idNC, errItem
                    End If
                Else
                    contadorErrores = contadorErrores + 1
                    LogCacheOperacion CStr(idNC), "PrecalentarError", errItem, ObtenerUsuarioConectado(), False
                End If
            End If
            
            ' Mostrar progreso cada batch
            If enBatch >= p_BatchSize Then
                Debug.Print "Procesando NCs: " & contadorTotal & "/" & totalNCs & _
                            " | Exitosas: " & contadorExitosas & _
                            " | Omitidas: " & contadorOmitidas & _
                            " | Errores: " & contadorErrores
                enBatch = 0
            End If
            
            rs.MoveNext
        Loop
    End If
    
    rs.Close
    Set rs = Nothing
    Set cacheRepo = Nothing
    
    duracionTotal = Timer - inicio
    
    ' Resumen final
    Debug.Print "=== PRECALENTADO COMPLETO ==="
    Debug.Print "Detalle: " & contadorTotal & " NCs procesadas, " & _
                contadorExitosas & " exitosas, " & _
                contadorOmitidas & " omitidas, " & _
                contadorErrores & " fallidas"
    If p_IncluirListado Then
        Debug.Print "Listado: Precalentado " & IIf(p_ForceOverwrite, "con", "sin") & " overwrite"
    End If
    Debug.Print "Tiempo total: " & Format(duracionTotal, "0.00") & "s"
    Debug.Print "=========================="
    
    LogCacheOperacion "0", "PrecalentarCache", _
        "Completado: " & contadorTotal & " NCs, " & contadorExitosas & " exitosas, " & _
        contadorErrores & " errores, " & Format(duracionTotal, "0.00") & "s", _
        ObtenerUsuarioConectado(), True
    
    PrecalentarCacheCompleto = True
    Exit Function
    
errores:
    p_Error = "Error en PrecalentarCacheCompleto: " & Err.Description
    If Not rs Is Nothing Then rs.Close: Set rs = Nothing
    If Not cacheRepo Is Nothing Then Set cacheRepo = Nothing
    PrecalentarCacheCompleto = False
End Function

' Limpia todo el caché (detalle y listado)
' Uso: CacheNCProyecto.LimpiarCacheCompleta
' Retorna: True si la limpieza se completó exitosamente
Public Function LimpiarCacheCompleta(Optional ByRef p_Error As String) As Boolean
    
    Dim SQL As String
    Dim inicio As Long
    Dim duracion As Double
    Dim registrosDetalle As Long
    Dim registrosListado As Long
    
    On Error GoTo errores
    
    p_Error = ""
    LimpiarCacheCompleta = False
    
    ' Verificar kill-switch
    If Not IsCacheEnabled() Then
        LogCacheOperacion "0", "LimpiarCache", "Caché deshabilitada - NOOP", ObtenerUsuarioConectado(), True
        LimpiarCacheCompleta = True
        Exit Function
    End If
    
    inicio = Timer
    
    ' Contar registros antes de borrar
    Dim rs As DAO.Recordset
    Set rs = getdb().OpenRecordset("SELECT COUNT(*) FROM " & NOMBRE_TABLA_CACHE, dbOpenSnapshot)
    registrosDetalle = rs!total
    rs.Close
    Set rs = Nothing
    
    Set rs = getdb().OpenRecordset("SELECT COUNT(*) FROM " & NOMBRE_TABLA_LISTADO, dbOpenSnapshot)
    registrosListado = rs!total
    rs.Close
    Set rs = Nothing
    
    ' Eliminar todos los registros de caché de detalle
    SQL = "DELETE FROM " & NOMBRE_TABLA_CACHE
    getdb().Execute SQL, dbFailOnError
    
    ' Eliminar todos los registros de caché de listado
    SQL = "DELETE FROM " & NOMBRE_TABLA_LISTADO
    getdb().Execute SQL, dbFailOnError
    
    duracion = Timer - inicio
    
    Debug.Print "=== LIMPIEZA DE CACHÉ ==="
    Debug.Print "TbCacheNCProyecto: " & registrosDetalle & " registros eliminados"
    Debug.Print "TbCacheListadoNC: " & registrosListado & " registros eliminados"
    Debug.Print "Tiempo: " & Format(duracion, "0.00") & "s"
    Debug.Print "========================="
    
    LogCacheOperacion "0", "LimpiarCache", _
        "Cache limpiada: " & registrosDetalle & " detalle, " & registrosListado & " listado", _
        ObtenerUsuarioConectado(), True
    
    LimpiarCacheCompleta = True
    Exit Function
    
errores:
    p_Error = "Error en LimpiarCacheCompleta: " & Err.Description
    Set rs = Nothing
    LimpiarCacheCompleta = False
End Function

' ============================================
' HELPERS
' ============================================

Private Function ObtenerUsuarioConectado() As String
    ' Función auxiliar para obtener usuario
    ' Implementar según necesidades del sistema
    ObtenerUsuarioConectado = Environ("USERNAME")
End Function

Private Function LogCacheOperacion( _
    p_IDNC As String, _
    p_Operacion As String, _
    p_Detalle As String, _
    p_Usuario As String, _
    p_Exito As Boolean, _
    Optional p_Duracion As Long = 0 _
)
    ' Función auxiliar para logging
    ' Implementar inserción en TbLogCache
    Dim SQL As String
    On Error Resume Next
    
    SQL = "INSERT INTO " & NOMBRE_TABLA_LOG & " " & _
           "(IDNoConformidad, TipoOperacion, Detalles, Usuario, Exito, DuracionMs, FechaOperacion) VALUES (" & _
           p_IDNC & ", '" & p_Operacion & "', '" & Replace(p_Detalle, "'", "''") & "', " & _
           "'" & p_Usuario & "', " & IIf(p_Exito, "True", "False") & ", " & p_Duracion & ", Now());"
           
    getdb().Execute SQL
End Function
