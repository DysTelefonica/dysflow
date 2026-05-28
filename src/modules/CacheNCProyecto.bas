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
Private Const NOMBRE_TABLA_CACHE As String = "TbCacheNCProyecto"
Private Const NOMBRE_TABLA_LOG As String = "TbLogCache"

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
    Dim sql As String
    Dim nc As NCProyecto
    Dim jsonNC As String
    Dim jsonACs As String
    Dim jsonARs As String
    Dim jsonReplanif As String
    Dim jsonRiesgos As String
    
    On Error GoTo errores
    
    p_Error = ""
    
    ' Consultar caché
    sql = "SELECT * FROM " & NOMBRE_TABLA_CACHE & " " & _
           "WHERE IDNoConformidad=" & p_IDNC & " AND CacheValida=True;"
    
    Set rcd = getdb().OpenRecordset(sql)
    
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
    Dim sql As String
    
    On Error GoTo errores
    
    sql = "SELECT IDNoConformidad FROM " & NOMBRE_TABLA_CACHE & " " & _
           "WHERE IDNoConformidad=" & p_IDNC & ";"
    
    Set rcd = getdb().OpenRecordset(sql)
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
    Dim sql As String
    
    On Error GoTo errores
    
    sql = "SELECT CacheValida FROM " & NOMBRE_TABLA_CACHE & " " & _
           "WHERE IDNoConformidad=" & p_IDNC & ";"
    
    Set rcd = getdb().OpenRecordset(sql)
    
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
    If p_Error <> "" Then Exit Function
    
    jsonACs = GenerarJSONACs(p_IDNC, p_Error)
    If p_Error <> "" Then Exit Function
    
    jsonARs = GenerarJSONARs(p_IDNC, p_Error)
    If p_Error <> "" Then Exit Function
    
    jsonReplanif = GenerarJSONReplanificaciones(p_IDNC, p_Error)
    If p_Error <> "" Then Exit Function
    
    jsonRiesgos = GenerarJSONRiesgos(p_IDNC, p_Error)
    If p_Error <> "" Then Exit Function
    
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
    p_Error = "Error en CacheNCProyecto.GenerarCacheCompleto (DAO): " & Err.Description
    
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
    
    Dim sql As String
    Dim usuario As String
    Dim qdf As DAO.QueryDef
    
    On Error GoTo errores
    
    p_Error = ""
    
    usuario = ObtenerUsuarioConectado()
    
    Set qdf = getdb().CreateQueryDef("")
    qdf.sql = "UPDATE " & NOMBRE_TABLA_CACHE & " SET CacheValida=False WHERE IDNoConformidad=[pIDNC];"
    qdf.Parameters("pIDNC") = p_IDNC
    qdf.Execute
    qdf.Close
    Set qdf = Nothing
    
    LogCacheOperacion p_IDNC, "Invalidar", p_Razon, usuario, True
    
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
    
    Dim sql As String
    Dim usuario As String
    Dim qdf As DAO.QueryDef
    
    On Error GoTo errores
    
    p_Error = ""
    
    usuario = ObtenerUsuarioConectado()
    
    Set qdf = getdb().CreateQueryDef("")
    qdf.sql = "DELETE FROM " & NOMBRE_TABLA_CACHE & " WHERE IDNoConformidad=[pIDNC];"
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
    
    Dim sql As String
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
        qdf.sql = "UPDATE " & NOMBRE_TABLA_CACHE & " SET CacheValida=True WHERE IDNoConformidad=[pIDNC];"
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
    Dim sql As String
    Dim rcd As DAO.Recordset
    Dim campo As Variant
    Dim dictNC As Scripting.Dictionary
    
    On Error GoTo errores
    
    ' Obtener NC desde BD
    sql = "SELECT * FROM TbNoConformidades " & _
           "WHERE IDNoConformidad=" & p_IDNC & ";"
    
    Set rcd = getdb().OpenRecordset(sql)
    
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
    
    Dim sql As String
    Dim rcd As DAO.Recordset
    Dim AC As ACProyecto
    Dim col As Scripting.Dictionary
    Dim dictAC As Scripting.Dictionary
    Dim campo As Variant
    
    On Error GoTo errores
    
    ' Obtener ACs desde BD
    sql = "SELECT * FROM TbNCAccionCorrectivas " & _
           "WHERE IDNoConformidad=" & p_IDNC & " " & _
           "ORDER BY IdAccionCorrectiva;"
    
    Set rcd = getdb().OpenRecordset(sql)
    
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
    
    Dim sql As String
    Dim rcd As DAO.Recordset
    Dim AR As ARProyecto
    Dim col As Scripting.Dictionary
    Dim dictARs As Scripting.Dictionary
    Dim dictAR As Scripting.Dictionary
    Dim campo As Variant
    
    On Error GoTo errores
    
    ' Obtener ARs desde BD (unidas con ACs)
    sql = "SELECT TbNCAccionesRealizadas.* " & _
           "FROM TbNCAccionesRealizadas INNER JOIN TbNCAccionCorrectivas " & _
           "ON TbNCAccionesRealizadas.IdAccionCorrectiva = TbNCAccionCorrectivas.IdAccionCorrectiva " & _
           "WHERE TbNCAccionCorrectivas.IDNoConformidad=" & p_IDNC & " " & _
           "ORDER BY TbNCAccionesRealizadas.IdAccionCorrectiva, TbNCAccionesRealizadas.IDAccionRealizada;"
    
    Set rcd = getdb().OpenRecordset(sql)
    
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
    
    Dim sql As String
    Dim rcd As DAO.Recordset
    Dim replanif As ReplanificacionesProyecto
    Dim col As Scripting.Dictionary
    Dim dictReplanif As Scripting.Dictionary
    Dim campo As Variant
    
    On Error GoTo errores
    
    ' Obtener Replanificaciones desde BD
    sql = "SELECT * FROM TbReplanificacionesProyecto " & _
           "WHERE IDNoConformidad=" & p_IDNC & " " & _
           "ORDER BY IDReplanificacion;"
    
    Set rcd = getdb().OpenRecordset(sql)
    
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
    
    Dim sql As String
    Dim rcd As DAO.Recordset
    Dim riesgo As riesgo
    Dim col As Scripting.Dictionary
    Dim dictRiesgo As Scripting.Dictionary
    Dim campo As Variant
    
    On Error GoTo errores
    
    ' Obtener Riesgos asociados a la NC
    ' Basado en RiesgoRepositorio.GetRiesgosAsociados
    sql = "SELECT R.* FROM TbRiesgos AS R " & _
          "INNER JOIN TbRiesgosNC AS L ON R.IDRiesgo = L.IDRiesgo " & _
          "WHERE L.IDNC = " & p_IDNC
    
    ' Usamos getdb() para acceder a la BD de riesgos
    Set rcd = getdb().OpenRecordset(sql)
    
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
    
    ' Convertir a JSON usando JsonConverter
    GenerarJSONRiesgos = JsonConverter.ConvertToJson(col)
    
    Exit Function
    
errores:
    p_Error = "Error en GenerarJSONRiesgos: " & Err.Description
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
    Dim sql As String
    On Error Resume Next
    
    sql = "INSERT INTO " & NOMBRE_TABLA_LOG & " " & _
           "(IDNoConformidad, TipoOperacion, Detalles, Usuario, Exito, DuracionMs, FechaOperacion) VALUES (" & _
           p_IDNC & ", '" & p_Operacion & "', '" & Replace(p_Detalle, "'", "''") & "', " & _
           "'" & p_Usuario & "', " & IIf(p_Exito, "True", "False") & ", " & p_Duracion & ", Now());"
           
    getdb().Execute sql
End Function


