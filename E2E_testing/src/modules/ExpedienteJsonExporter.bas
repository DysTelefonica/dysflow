Attribute VB_Name = "ExpedienteJsonExporter"
Option Compare Database
Option Explicit

' ==========================================================================================
' Módulo: ExpedienteJsonExporter
' Descripción: Genera JSON completo de Expedientes siguiendo mejores prácticas (meta/data, camelCase).
' Dependencias: JsonConverter.bas, Variables Globales.bas (para getdb)
' ==========================================================================================

' ------------------------------------------------------------------------------------------
' Genera el JSON completo de un expediente incluyendo sus tablas relacionadas.
' Estructura:
' {
'   "meta": { ... },
'   "data": {
'      "idExpediente": 123,
'      "titulo": "...",
'      "gradoClasificacion": { ... },
'      "anualidades": [ ... ]
'   }
' }
' ------------------------------------------------------------------------------------------
Public Function GenerarJsonExpediente(ByVal IDExpediente As Long) As String
    Dim expedienteDict As Object
    Dim finalDict As Object
    
    Set expedienteDict = GetExpedienteDictionary(IDExpediente)
    
    If expedienteDict Is Nothing Then
        GenerarJsonExpediente = "{}"
        Exit Function
    End If
    
    Set finalDict = CreateObject("Scripting.Dictionary")
    
    ' Meta information
    finalDict.Add "meta", GetMetadataDictionary()
    
    ' Data payload (The entity itself)
    finalDict.Add "data", expedienteDict
    
    GenerarJsonExpediente = JsonConverter.ConvertToJson(finalDict, "  ")
End Function

' ------------------------------------------------------------------------------------------
' Genera el JSON a partir de una consulta SQL personalizada.
' La consulta debe devolver al menos una columna con el ID del expediente (IDExpediente).
' Si no se encuentra la columna 'IDExpediente', se intentará usar la primera columna.
' ------------------------------------------------------------------------------------------
Public Function GenerarJsonDesdeSQL(ByVal sqlQuery As String) As String
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim col As New Collection
    Dim dict As Object
    Dim finalDict As Object
    Dim ID As Long
    
    On Error GoTo ErrorHandler
    
    Set db = getdb()
    Set rs = db.OpenRecordset(sqlQuery, dbOpenSnapshot)
    
    Do While Not rs.EOF
        ' Intenta obtener IDExpediente, o el primer campo si falla
        On Error Resume Next
        ID = 0
        ID = rs!IDExpediente
        If Err.Number <> 0 Then
            Err.Clear
            ' Fallback: Primer campo si es numérico
            If IsNumeric(rs.Fields(0).value) Then
                ID = rs.Fields(0).value
            End If
        End If
        On Error GoTo ErrorHandler
        
        If ID <> 0 Then
            Set dict = GetExpedienteDictionary(ID)
            If Not dict Is Nothing Then
                col.Add dict
            End If
        End If
        rs.MoveNext
    Loop
    
    rs.Close
    Set rs = Nothing
    Set db = Nothing
    
    Set finalDict = CreateObject("Scripting.Dictionary")
    finalDict.Add "meta", GetMetadataDictionary()
    finalDict.Add "data", col
    
    GenerarJsonDesdeSQL = JsonConverter.ConvertToJson(finalDict, "  ")
    Exit Function

ErrorHandler:
    GenerarJsonDesdeSQL = "{ ""error"": """ & Err.Description & """ }"
End Function

' ------------------------------------------------------------------------------------------
' Genera el JSON de una lista de expedientes (Wrapper para GenerarJsonDesdeSQL).
' Estructura:
' {
'   "meta": { ... },
'   "data": [
'      { "idExpediente": 123, ... },
'      { "idExpediente": 124, ... }
'   ]
' }
' ------------------------------------------------------------------------------------------
Public Function GenerarJsonListaExpedientes(Optional ByVal strWhere As String = "") As String
    Dim sql As String
    sql = "SELECT IDExpediente FROM TbExpedientes"
    If strWhere <> "" Then
        sql = sql & " WHERE " & strWhere
    End If
    
    GenerarJsonListaExpedientes = GenerarJsonDesdeSQL(sql)
End Function

' ------------------------------------------------------------------------------------------
' Exportación E2E scaffold (meta + data[]) para expedientes elegibles por OrdinalE2E.
' ------------------------------------------------------------------------------------------
Public Function ExportAllE2E(Optional ByVal p_GeneratedAt As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo ErrorHandler

    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim finalDict As Object
    Dim dataRows As Collection
    Dim rowDict As Object
    Dim sql As String
    Dim total As Long
    Dim generatedAt As String

    p_Error = ""
    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then GoTo SafeExit

    ' Nota: se usan aliases E/G/O para evitar ambigüedad de Jet/ACE con campos
    ' que existen en más de una tabla (ej. IDGradoClasificacion en TbExpedientes y TbGradosClasificacion).
    ' El OUTER JOIN anidado con paréntesis es requerido para que Jet resuelva correctamente.
    sql = "SELECT E.IDExpediente, E.OrdinalE2E, E.Nemotecnico, E.Titulo, " & _
           "E.IDExpedientePadre, E.ImporteLicitacion, E.ImporteContratacion, " & _
           "E.CodProyecto, E.CodExp, E.CodExpLargo, E.CodS4H, " & _
           "E.EsAM, E.EsLote, E.EsBasado, E.EsExpediente, E.[Ordinal], E.AccesoSharePoint, " & _
           "E.Observaciones, E.Ambito, E.NPedido, E.Adjudicado, E.EnPeriodoDeAdjudicacion, " & _
           "E.Tipo, E.GarantiaMeses, E.Estado, E.ObjetoContrato, " & _
           "E.IDGradoClasificacion, E.IDOrganoContratacion, " & _
           "G.GradoClasificacion AS GradoClasificacionTexto, " & _
           "O.OrganoContratacion AS OrganoContratacionTexto, " & _
           "E.FechaInicioContrato, E.FechaFinContrato, E.FechaFinGarantia, E.FechaPreOferta, " & _
           "E.FechaInicioLicitacion, E.FechaOferta, E.FechaAdjudicacion, E.FechaFirmaContrato, " & _
           "E.FechaCertificacion, E.FechaPerdida, E.FechaDesestimada " & _
           "FROM ((TbExpedientes AS E " & _
           "LEFT JOIN TbGradosClasificacion AS G ON E.IDGradoClasificacion = G.IDGradoClasificacion) " & _
           "LEFT JOIN TbOrganosContratacion AS O ON E.IDOrganoContratacion = O.IDOrganoContratacion) " & _
           "WHERE E.OrdinalE2E Is Not Null " & _
           "ORDER BY E.OrdinalE2E, E.IDExpediente"

    Set rs = db.OpenRecordset(sql, dbOpenSnapshot)
    Set dataRows = New Collection

    Do While Not rs.EOF
        Set rowDict = BuildE2ERowDict(rs)
        dataRows.Add rowDict
        total = total + 1
        rs.MoveNext
    Loop

    generatedAt = ResolveGeneratedAtIso8601(p_GeneratedAt)

    Set finalDict = CreateObject("Scripting.Dictionary")
    finalDict.Add "meta", GetE2EMetadataDictionary(total, generatedAt)
    finalDict.Add "data", dataRows

    ExportAllE2E = JsonConverter.ConvertToJson(finalDict, "  ")

SafeExit:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Set db = Nothing
    Exit Function

ErrorHandler:
    p_Error = "ExportAllE2E: " & Err.Description
    ExportAllE2E = ""
    Resume SafeExit
End Function

' ------------------------------------------------------------------------------------------
' Genera JSON E2E canónico para una lista CSV de IDExpediente.
' Root exacto: {"meta": {...}, "data": [...]}
' ------------------------------------------------------------------------------------------
Public Function GenerarJsonE2ECanonicoPorLista(ByVal p_IDExpedientesCsv As String, Optional ByRef p_Error As String) As String
    On Error GoTo ErrorHandler

    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim sql As String
    Dim inClause As String
    Dim finalDict As Object
    Dim dataRows As Collection
    Dim rowDict As Object
    Dim total As Long

    p_Error = ""
    inClause = BuildSqlInClauseFromCsvIds(p_IDExpedientesCsv)
    If inClause = "" Then
        p_Error = "GenerarJsonE2ECanonicoPorLista: lista de IDs vacía o inválida"
        GenerarJsonE2ECanonicoPorLista = ""
        Exit Function
    End If

    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then GoTo SafeExit

    sql = "SELECT TbExpedientes.*, " & _
          "Null AS GradoClasificacionTexto, Null AS OrganoContratacionTexto, " & _
          "Null AS CorreoResponsableCalidad, Null AS NombreResponsableCalidad, " & _
          "Null AS CorreoResponsableSeguridad, Null AS NombreResponsableSeguridad " & _
          "FROM TbExpedientes " & _
          "WHERE TbExpedientes.IDExpediente IN (" & inClause & ") " & _
          "ORDER BY TbExpedientes.OrdinalE2E, TbExpedientes.IDExpediente"

    Set rs = db.OpenRecordset(sql, dbOpenSnapshot)
    Set dataRows = New Collection

    Do While Not rs.EOF
        Set rowDict = BuildE2ECanonicalRowDict(db, rs)
        dataRows.Add rowDict
        total = total + 1
        rs.MoveNext
    Loop

    Set finalDict = CreateObject("Scripting.Dictionary")
    finalDict.Add "meta", GetE2ECanonicalMetadataDictionary(total)
    finalDict.Add "data", dataRows

    GenerarJsonE2ECanonicoPorLista = JsonConverter.ConvertToJson(finalDict, "  ")

SafeExit:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Set db = Nothing
    Exit Function

ErrorHandler:
    p_Error = "GenerarJsonE2ECanonicoPorLista: " & Err.Description
    GenerarJsonE2ECanonicoPorLista = ""
    Resume SafeExit
End Function

Private Function BuildSqlInClauseFromCsvIds(ByVal p_Csv As String) As String
    Dim parts() As String
    Dim i As Long
    Dim token As String
    Dim normalized As String

    normalized = Replace(Replace(p_Csv, vbCr, ""), vbLf, "")
    normalized = Trim$(normalized)
    If Len(normalized) = 0 Then Exit Function

    parts = Split(normalized, ",")
    For i = LBound(parts) To UBound(parts)
        token = Trim$(parts(i))
        If Len(token) > 0 And IsNumeric(token) Then
            If BuildSqlInClauseFromCsvIds <> "" Then BuildSqlInClauseFromCsvIds = BuildSqlInClauseFromCsvIds & ","
            BuildSqlInClauseFromCsvIds = BuildSqlInClauseFromCsvIds & CLng(token)
        End If
    Next i
End Function

Private Function BuildE2ECanonicalRowDict(ByVal p_Db As DAO.Database, ByVal p_rs As DAO.Recordset) As Object
    Dim rowDict As Object
    Dim responsableCalidad As Object
    Dim responsableSeguridad As Object

    Set rowDict = CreateObject("Scripting.Dictionary")

    rowDict.Add "idexpediente", SafeDbNullField(p_rs, "IDExpediente")
    rowDict.Add "idexpedientepadre", DBNullValue(SafeDbNullField(p_rs, "IDExpedientePadre"))
    rowDict.Add "OrdinalE2E", DBNullValue(SafeDbNullField(p_rs, "OrdinalE2E"))
    rowDict.Add "nemotecnico", DBNullValue(SafeDbNullField(p_rs, "Nemotecnico"))
    rowDict.Add "titulo", DBNullValue(SafeDbNullField(p_rs, "Titulo"))
    rowDict.Add "importelicitacion", DBNullValue(SafeDbNullField(p_rs, "ImporteLicitacion"))
    rowDict.Add "importecontratacion", DBNullValue(SafeDbNullField(p_rs, "ImporteContratacion"))
    rowDict.Add "codproyecto", DBNullValue(SafeDbNullField(p_rs, "CodProyecto"))
    rowDict.Add "codexp", DBNullValue(SafeDbNullField(p_rs, "CodExp"))
    rowDict.Add "codexplargo", DBNullValue(SafeDbNullField(p_rs, "CodExpLargo"))
    rowDict.Add "cods4h", DBNullValue(SafeDbNullField(p_rs, "CodS4H"))
    rowDict.Add "fechainiciocontrato", DBDateValueIsoZ(SafeDbNullField(p_rs, "FechaInicioContrato"))
    rowDict.Add "fechafincontrato", DBDateValueIsoZ(SafeDbNullField(p_rs, "FechaFinContrato"))
    rowDict.Add "fechafingarantia", DBDateValueIsoZ(SafeDbNullField(p_rs, "FechaFinGarantia"))
    rowDict.Add "esam", DBNullValue(SafeDbNullField(p_rs, "EsAM"))
    rowDict.Add "eslote", DBNullValue(SafeDbNullField(p_rs, "EsLote"))
    rowDict.Add "esbasado", DBNullValue(SafeDbNullField(p_rs, "EsBasado"))
    rowDict.Add "esexpediente", DBNullValue(SafeDbNullField(p_rs, "EsExpediente"))
    rowDict.Add "ordinal", DBNullValue(SafeDbNullField(p_rs, "Ordinal"))
    rowDict.Add "accesosharepoint", DBNullValue(SafeDbNullField(p_rs, "AccesoSharePoint"))
    rowDict.Add "observaciones", DBNullValue(SafeDbNullField(p_rs, "Observaciones"))
    rowDict.Add "ambito", DBNullValue(SafeDbNullField(p_rs, "Ambito"))
    rowDict.Add "npedido", DBNullValue(SafeDbNullField(p_rs, "NPedido"))
    rowDict.Add "adjudicado", DBNullValue(SafeDbNullField(p_rs, "Adjudicado"))
    rowDict.Add "enperiododeadjudicacion", DBNullValue(SafeDbNullField(p_rs, "EnPeriodoDeAdjudicacion"))
    rowDict.Add "tipo", DBNullValue(SafeDbNullField(p_rs, "Tipo"))
    rowDict.Add "fechapreoferta", DBDateValueIsoZ(SafeDbNullField(p_rs, "FechaPreOferta"))
    rowDict.Add "fechainiciolicitacion", DBDateValueIsoZ(SafeDbNullField(p_rs, "FechaInicioLicitacion"))
    rowDict.Add "fechaoferta", DBDateValueIsoZ(SafeDbNullField(p_rs, "FechaOferta"))
    rowDict.Add "fechaadjudicacion", DBDateValueIsoZ(SafeDbNullField(p_rs, "FechaAdjudicacion"))
    rowDict.Add "fechafirmacontrato", DBDateValueIsoZ(SafeDbNullField(p_rs, "FechaFirmaContrato"))
    rowDict.Add "garantiameses", DBNullValue(SafeDbNullField(p_rs, "GarantiaMeses"))
    rowDict.Add "fechacertificacion", DBDateValueIsoZ(SafeDbNullField(p_rs, "FechaCertificacion"))
    rowDict.Add "fechaperdida", DBDateValueIsoZ(SafeDbNullField(p_rs, "FechaPerdida"))
    rowDict.Add "fechadesestimada", DBDateValueIsoZ(SafeDbNullField(p_rs, "FechaDesestimada"))
    rowDict.Add "estado", DBNullValue(SafeDbNullField(p_rs, "Estado"))
    rowDict.Add "objetocontrato", DBNullValue(SafeDbNullField(p_rs, "ObjetoContrato"))
    rowDict.Add "gradoclasificacion", DBNullValue(SafeDbNullField(p_rs, "GradoClasificacionTexto"))
    rowDict.Add "organocontratacion", DBNullValue(SafeDbNullField(p_rs, "OrganoContratacionTexto"))

    Set responsableCalidad = CreateObject("Scripting.Dictionary")
    responsableCalidad.Add "correousuario", DBNullValue(SafeDbNullField(p_rs, "CorreoResponsableCalidad"))
    responsableCalidad.Add "nombre", DBNullValue(SafeDbNullField(p_rs, "NombreResponsableCalidad"))
    rowDict.Add "responsableCalidad", responsableCalidad

    Set responsableSeguridad = CreateObject("Scripting.Dictionary")
    responsableSeguridad.Add "correousuario", DBNullValue(SafeDbNullField(p_rs, "CorreoResponsableSeguridad"))
    responsableSeguridad.Add "nombre", DBNullValue(SafeDbNullField(p_rs, "NombreResponsableSeguridad"))
    rowDict.Add "responsableSeguridad", responsableSeguridad

    rowDict.Add "anualidades", SafeGetE2ECanonicalCollection("anualidades", p_Db, CLng(Nz(SafeDbNullField(p_rs, "IDExpediente"), 0)))
    rowDict.Add "comerciales", SafeGetE2ECanonicalCollection("comerciales", p_Db, CLng(Nz(SafeDbNullField(p_rs, "IDExpediente"), 0)))
    rowDict.Add "lugaresEjecucion", SafeGetE2ECanonicalCollection("lugaresEjecucion", p_Db, CLng(Nz(SafeDbNullField(p_rs, "IDExpediente"), 0)))
    rowDict.Add "pecal", SafeGetE2ECanonicalCollection("pecal", p_Db, CLng(Nz(SafeDbNullField(p_rs, "IDExpediente"), 0)))
    rowDict.Add "racs", SafeGetE2ECanonicalCollection("racs", p_Db, CLng(Nz(SafeDbNullField(p_rs, "IDExpediente"), 0)))
    rowDict.Add "responsables", SafeGetE2ECanonicalCollection("responsables", p_Db, CLng(Nz(SafeDbNullField(p_rs, "IDExpediente"), 0)))
    rowDict.Add "suministradores", SafeGetE2ECanonicalCollection("suministradores", p_Db, CLng(Nz(SafeDbNullField(p_rs, "IDExpediente"), 0)))
    rowDict.Add "modificados", SafeGetE2ECanonicalCollection("modificados", p_Db, CLng(Nz(SafeDbNullField(p_rs, "IDExpediente"), 0)))
    rowDict.Add "hitos", SafeGetE2ECanonicalCollection("hitos", p_Db, CLng(Nz(SafeDbNullField(p_rs, "IDExpediente"), 0)))

    Set BuildE2ECanonicalRowDict = rowDict
End Function

Private Function SafeGetE2ECanonicalCollection(ByVal p_CollectionName As String, ByVal p_Db As DAO.Database, ByVal p_IDExpediente As Long) As Collection
    On Error GoTo ReturnEmpty

    Select Case LCase$(p_CollectionName)
        Case "anualidades"
            Set SafeGetE2ECanonicalCollection = GetE2ECanonicalAnualidades(p_Db, p_IDExpediente)
        Case "comerciales"
            Set SafeGetE2ECanonicalCollection = GetE2ECanonicalComerciales(p_Db, p_IDExpediente)
        Case "lugaresejecucion"
            Set SafeGetE2ECanonicalCollection = GetE2ECanonicalLugaresEjecucion(p_Db, p_IDExpediente)
        Case "pecal"
            Set SafeGetE2ECanonicalCollection = GetE2ECanonicalPecal(p_Db, p_IDExpediente)
        Case "racs"
            Set SafeGetE2ECanonicalCollection = GetE2ECanonicalRacs(p_Db, p_IDExpediente)
        Case "responsables"
            Set SafeGetE2ECanonicalCollection = GetE2ECanonicalResponsables(p_Db, p_IDExpediente)
        Case "suministradores"
            Set SafeGetE2ECanonicalCollection = GetE2ECanonicalSuministradores(p_Db, p_IDExpediente)
        Case "modificados"
            Set SafeGetE2ECanonicalCollection = GetE2ECanonicalModificados(p_Db, p_IDExpediente)
        Case "hitos"
            Set SafeGetE2ECanonicalCollection = GetE2ECanonicalHitos(p_Db, p_IDExpediente)
        Case Else
            GoTo ReturnEmpty
    End Select

    Exit Function

ReturnEmpty:
    Err.Clear
    Set SafeGetE2ECanonicalCollection = New Collection
End Function

Private Function SafeDbNullField(ByVal p_rs As DAO.Recordset, ByVal p_FieldName As String) As Variant
    On Error GoTo MissingField
    SafeDbNullField = p_rs.Fields(p_FieldName).value
    Exit Function
MissingField:
    Err.Clear
    SafeDbNullField = Null
End Function

Private Function GetE2ECanonicalMetadataDictionary(ByVal p_Total As Long) As Object
    Dim metadata As Object
    Set metadata = CreateObject("Scripting.Dictionary")
    metadata.Add "apiVersion", "1.0"
    metadata.Add "generatedAt", Format$(Now, "yyyy-mm-dd\Thh:nn:ss") & ".000Z"
    metadata.Add "generator", "ExportadorJSON v1.0"
    metadata.Add "user", Environ$("USERNAME")
    metadata.Add "totalExpedientes", p_Total
    Set GetE2ECanonicalMetadataDictionary = metadata
End Function

Private Function DBDateValueIsoZ(ByVal p_Value As Variant) As Variant
    If IsNull(p_Value) Then
        DBDateValueIsoZ = Null
    Else
        DBDateValueIsoZ = Format$(CDate(p_Value), "yyyy-mm-dd\Thh:nn:ss") & ".000Z"
    End If
End Function

Private Function GetE2ECanonicalAnualidades(ByVal p_Db As DAO.Database, ByVal p_IDExpediente As Long) As Collection
    Dim rs As DAO.Recordset
    Dim row As Object
    Set GetE2ECanonicalAnualidades = New Collection

    Set rs = p_Db.OpenRecordset("SELECT [Año], BIIVA, BIIPSI, BIIGIC, BIExenta FROM TbExpedientesAnualidades WHERE IDExpediente=" & p_IDExpediente & " ORDER BY [Año]", dbOpenSnapshot)
    Do While Not rs.EOF
        Set row = CreateObject("Scripting.Dictionary")
        row.Add "año", DBNullValue(rs.Fields("Año").value)
        row.Add "biiva", DBNullValue(rs.Fields("BIIVA").value)
        row.Add "biipsi", DBNullValue(rs.Fields("BIIPSI").value)
        row.Add "biigic", DBNullValue(rs.Fields("BIIGIC").value)
        row.Add "biexenta", DBNullValue(rs.Fields("BIExenta").value)
        GetE2ECanonicalAnualidades.Add row
        rs.MoveNext
    Loop
    rs.Close
End Function

Private Function GetE2ECanonicalComerciales(ByVal p_Db As DAO.Database, ByVal p_IDExpediente As Long) As Collection
    Dim rs As DAO.Recordset
    Dim row As Object
    Set GetE2ECanonicalComerciales = New Collection

    Set rs = p_Db.OpenRecordset("SELECT C.Comercial FROM TbExpedientesComerciales EC LEFT JOIN TbComerciales C ON EC.IDComercial=C.IDComercial WHERE EC.IDExpediente=" & p_IDExpediente, dbOpenSnapshot)
    Do While Not rs.EOF
        Set row = CreateObject("Scripting.Dictionary")
        row.Add "comercial", DBNullValue(rs.Fields("Comercial").value)
        GetE2ECanonicalComerciales.Add row
        rs.MoveNext
    Loop
    rs.Close
End Function

Private Function GetE2ECanonicalLugaresEjecucion(ByVal p_Db As DAO.Database, ByVal p_IDExpediente As Long) As Collection
    Dim rs As DAO.Recordset
    Dim row As Object
    Set GetE2ECanonicalLugaresEjecucion = New Collection

    Set rs = p_Db.OpenRecordset("SELECT LugarEjecucion FROM TbExpedientesLugaresEjecucion WHERE IDExpediente=" & p_IDExpediente, dbOpenSnapshot)
    Do While Not rs.EOF
        Set row = CreateObject("Scripting.Dictionary")
        row.Add "LugarEjecucion", DBNullValue(rs.Fields("LugarEjecucion").value)
        GetE2ECanonicalLugaresEjecucion.Add row
        rs.MoveNext
    Loop
    rs.Close
End Function

Private Function GetE2ECanonicalPecal(ByVal p_Db As DAO.Database, ByVal p_IDExpediente As Long) As Collection
    Dim rs As DAO.Recordset
    Dim row As Object
    Set GetE2ECanonicalPecal = New Collection

    Set rs = p_Db.OpenRecordset("SELECT P.PECAL FROM TbExpedientesPECAL EP LEFT JOIN TbPECAL P ON EP.IDPECAL=P.IDPECAL WHERE EP.IDExpediente=" & p_IDExpediente, dbOpenSnapshot)
    Do While Not rs.EOF
        Set row = CreateObject("Scripting.Dictionary")
        row.Add "pecal", DBNullValue(rs.Fields("PECAL").value)
        GetE2ECanonicalPecal.Add row
        rs.MoveNext
    Loop
    rs.Close
End Function

Private Function GetE2ECanonicalRacs(ByVal p_Db As DAO.Database, ByVal p_IDExpediente As Long) As Collection
    Dim rs As DAO.Recordset
    Dim row As Object
    Set GetE2ECanonicalRacs = New Collection

    Set rs = p_Db.OpenRecordset("SELECT R.RAC, R.CORREO FROM TbExpedientesRACS ER LEFT JOIN TbRACS R ON ER.IDRAC=R.IDRAC WHERE ER.IDExpediente=" & p_IDExpediente, dbOpenSnapshot)
    Do While Not rs.EOF
        Set row = CreateObject("Scripting.Dictionary")
        row.Add "rac", DBNullValue(rs.Fields("RAC").value)
        row.Add "correo", DBNullValue(rs.Fields("CORREO").value)
        GetE2ECanonicalRacs.Add row
        rs.MoveNext
    Loop
    rs.Close
End Function

Private Function GetE2ECanonicalResponsables(ByVal p_Db As DAO.Database, ByVal p_IDExpediente As Long) As Collection
    Dim rs As DAO.Recordset
    Dim row As Object
    Set GetE2ECanonicalResponsables = New Collection

    Set rs = p_Db.OpenRecordset("SELECT ER.CorreoSiempre, ER.EsJefeProyecto, ER.EsPreventa, U.CorreoUsuario, U.Nombre FROM TbExpedientesResponsables ER LEFT JOIN TbUsuariosAplicaciones U ON ER.IdUsuario=U.Id WHERE ER.IDExpediente=" & p_IDExpediente, dbOpenSnapshot)
    Do While Not rs.EOF
        Set row = CreateObject("Scripting.Dictionary")
        row.Add "correosiempre", DBNullValue(rs.Fields("CorreoSiempre").value)
        row.Add "esjefeproyecto", DBNullValue(rs.Fields("EsJefeProyecto").value)
        row.Add "esPreventa", DBNullValue(rs.Fields("EsPreventa").value)
        row.Add "correousuario", DBNullValue(rs.Fields("CorreoUsuario").value)
        row.Add "nombre", DBNullValue(rs.Fields("Nombre").value)
        GetE2ECanonicalResponsables.Add row
        rs.MoveNext
    Loop
    rs.Close
End Function

Private Function GetE2ECanonicalSuministradores(ByVal p_Db As DAO.Database, ByVal p_IDExpediente As Long) As Collection
    Dim rs As DAO.Recordset
    Dim row As Object
    Set GetE2ECanonicalSuministradores = New Collection

    Set rs = p_Db.OpenRecordset("SELECT ES.IDSuministrador, ES.IDPadre, S.Nombre FROM TbExpedientesSuministradores ES LEFT JOIN TbSuministradores S ON ES.IDSuministrador=S.IDSuministrador WHERE ES.IDExpediente=" & p_IDExpediente, dbOpenSnapshot)
    Do While Not rs.EOF
        Set row = CreateObject("Scripting.Dictionary")
        row.Add "idsuministrador", DBNullValue(rs.Fields("IDSuministrador").value)
        row.Add "idpadre", DBNullValue(rs.Fields("IDPadre").value)
        row.Add "nombre", DBNullValue(rs.Fields("Nombre").value)
        GetE2ECanonicalSuministradores.Add row
        rs.MoveNext
    Loop
    rs.Close
End Function

Private Function GetE2ECanonicalModificados(ByVal p_Db As DAO.Database, ByVal p_IDExpediente As Long) As Collection
    Dim rs As DAO.Recordset
    Dim row As Object
    Set GetE2ECanonicalModificados = New Collection

    Set rs = p_Db.OpenRecordset("SELECT NModificado, FechaFirmaModificado, FechaFinModificado, Descripcion FROM TbExpedientesModificados WHERE IDExpediente=" & p_IDExpediente & " ORDER BY NModificado", dbOpenSnapshot)
    Do While Not rs.EOF
        Set row = CreateObject("Scripting.Dictionary")
        row.Add "nmodificado", DBNullValue(rs.Fields("NModificado").value)
        row.Add "fechafirmamodificado", DBDateValueIsoZ(rs.Fields("FechaFirmaModificado").value)
        row.Add "fechafinmodificado", DBDateValueIsoZ(rs.Fields("FechaFinModificado").value)
        row.Add "descripcion", DBNullValue(rs.Fields("Descripcion").value)
        GetE2ECanonicalModificados.Add row
        rs.MoveNext
    Loop
    rs.Close
End Function

Private Function GetE2ECanonicalHitos(ByVal p_Db As DAO.Database, ByVal p_IDExpediente As Long) As Collection
    Dim rs As DAO.Recordset
    Dim row As Object
    Set GetE2ECanonicalHitos = New Collection

    Set rs = p_Db.OpenRecordset("SELECT Descripcion, FechaHito, FechaGarantiaHito, Importe FROM TbExpedientesHitos WHERE IDExpediente=" & p_IDExpediente & " ORDER BY FechaHito", dbOpenSnapshot)
    Do While Not rs.EOF
        Set row = CreateObject("Scripting.Dictionary")
        row.Add "descripcion", DBNullValue(rs.Fields("Descripcion").value)
        row.Add "fechahito", DBDateValueIsoZ(rs.Fields("FechaHito").value)
        row.Add "fechagarantiahito", DBDateValueIsoZ(rs.Fields("FechaGarantiaHito").value)
        row.Add "importe", DBNullValue(rs.Fields("Importe").value)
        GetE2ECanonicalHitos.Add row
        rs.MoveNext
    Loop
    rs.Close
End Function

Private Function BuildE2ERowDict(ByVal p_rs As DAO.Recordset) As Object
    Dim rowDict As Object
    Dim responsableCalidad As Object
    Dim responsableSeguridad As Object

    Set rowDict = CreateObject("Scripting.Dictionary")

    rowDict.Add "idexpediente", p_rs.Fields("IDExpediente").value
    rowDict.Add "OrdinalE2E", p_rs.Fields("OrdinalE2E").value
    rowDict.Add "nemotecnico", DBNullValue(p_rs.Fields("Nemotecnico").value)
    rowDict.Add "titulo", DBNullValue(p_rs.Fields("Titulo").value)
    rowDict.Add "idexpedientepadre", DBNullValue(p_rs.Fields("IDExpedientePadre").value)
    rowDict.Add "importelicitacion", DBNullValue(p_rs.Fields("ImporteLicitacion").value)
    rowDict.Add "importecontratacion", DBNullValue(p_rs.Fields("ImporteContratacion").value)
    rowDict.Add "codproyecto", DBNullValue(p_rs.Fields("CodProyecto").value)
    rowDict.Add "codexp", DBNullValue(p_rs.Fields("CodExp").value)
    rowDict.Add "codexplargo", DBNullValue(p_rs.Fields("CodExpLargo").value)
    rowDict.Add "cods4h", DBNullValue(p_rs.Fields("CodS4H").value)
    rowDict.Add "esam", DBNullValue(p_rs.Fields("EsAM").value)
    rowDict.Add "eslote", DBNullValue(p_rs.Fields("EsLote").value)
    rowDict.Add "esbasado", DBNullValue(p_rs.Fields("EsBasado").value)
    rowDict.Add "esexpediente", DBNullValue(p_rs.Fields("EsExpediente").value)
    rowDict.Add "ordinal", DBNullValue(p_rs.Fields("Ordinal").value)
    rowDict.Add "accesosharepoint", DBNullValue(p_rs.Fields("AccesoSharePoint").value)
    rowDict.Add "observaciones", DBNullValue(p_rs.Fields("Observaciones").value)
    rowDict.Add "ambito", DBNullValue(p_rs.Fields("Ambito").value)
    rowDict.Add "npedido", DBNullValue(p_rs.Fields("NPedido").value)
    rowDict.Add "adjudicado", DBNullValue(p_rs.Fields("Adjudicado").value)
    rowDict.Add "enperiododeadjudicacion", DBNullValue(p_rs.Fields("EnPeriodoDeAdjudicacion").value)
    rowDict.Add "tipo", DBNullValue(p_rs.Fields("Tipo").value)
    rowDict.Add "garantiameses", DBNullValue(p_rs.Fields("GarantiaMeses").value)
    rowDict.Add "estado", DBNullValue(p_rs.Fields("Estado").value)
    rowDict.Add "objetocontrato", DBNullValue(p_rs.Fields("ObjetoContrato").value)
    rowDict.Add "gradoclasificacion", DBNullValue(p_rs.Fields("GradoClasificacionTexto").value)
    rowDict.Add "organocontratacion", DBNullValue(p_rs.Fields("OrganoContratacionTexto").value)
    rowDict.Add "fechainiciocontrato", DBDateValue(p_rs.Fields("FechaInicioContrato").value)
    rowDict.Add "fechafincontrato", DBDateValue(p_rs.Fields("FechaFinContrato").value)
    rowDict.Add "fechafingarantia", DBDateValue(p_rs.Fields("FechaFinGarantia").value)
    rowDict.Add "fechapreoferta", DBDateValue(p_rs.Fields("FechaPreOferta").value)
    rowDict.Add "fechainiciolicitacion", DBDateValue(p_rs.Fields("FechaInicioLicitacion").value)
    rowDict.Add "fechaoferta", DBDateValue(p_rs.Fields("FechaOferta").value)
    rowDict.Add "fechaadjudicacion", DBDateValue(p_rs.Fields("FechaAdjudicacion").value)
    rowDict.Add "fechafirmacontrato", DBDateValue(p_rs.Fields("FechaFirmaContrato").value)
    rowDict.Add "fechacertificacion", DBDateValue(p_rs.Fields("FechaCertificacion").value)
    rowDict.Add "fechaperdida", DBDateValue(p_rs.Fields("FechaPerdida").value)
    rowDict.Add "fechadesestimada", DBDateValue(p_rs.Fields("FechaDesestimada").value)

    Set responsableCalidad = CreateObject("Scripting.Dictionary")
    responsableCalidad.Add "correousuario", Null
    responsableCalidad.Add "nombre", Null
    rowDict.Add "responsableCalidad", responsableCalidad

    Set responsableSeguridad = CreateObject("Scripting.Dictionary")
    responsableSeguridad.Add "correousuario", Null
    responsableSeguridad.Add "nombre", Null
    rowDict.Add "responsableSeguridad", responsableSeguridad

    rowDict.Add "anualidades", New Collection
    rowDict.Add "comerciales", New Collection
    rowDict.Add "lugaresEjecucion", New Collection
    rowDict.Add "pecal", New Collection
    rowDict.Add "racs", New Collection
    rowDict.Add "responsables", New Collection
    rowDict.Add "suministradores", New Collection
    rowDict.Add "modificados", New Collection
    rowDict.Add "hitos", New Collection

    Set BuildE2ERowDict = rowDict
End Function

Private Function GetE2EMetadataDictionary(ByVal p_Total As Long, ByVal p_GeneratedAt As String) As Object
    Dim metadata As Object

    Set metadata = CreateObject("Scripting.Dictionary")
    metadata.Add "apiVersion", "1.0"
    metadata.Add "generatedAt", p_GeneratedAt
    metadata.Add "generator", "ExpedienteJsonExporter"
    metadata.Add "user", Environ$("USERNAME")
    metadata.Add "totalExpedientes", p_Total

    Set GetE2EMetadataDictionary = metadata
End Function

Private Function ResolveGeneratedAtIso8601(ByVal p_GeneratedAt As Variant) As String
    If IsMissing(p_GeneratedAt) Then
        ResolveGeneratedAtIso8601 = Format$(Now, "yyyy-mm-dd\Thh:nn:ss") & "Z"
    ElseIf IsNull(p_GeneratedAt) Then
        ResolveGeneratedAtIso8601 = Format$(Now, "yyyy-mm-dd\Thh:nn:ss") & "Z"
    ElseIf Len(Trim$(CStr(p_GeneratedAt))) = 0 Then
        ResolveGeneratedAtIso8601 = Format$(Now, "yyyy-mm-dd\Thh:nn:ss") & "Z"
    Else
        ResolveGeneratedAtIso8601 = CStr(p_GeneratedAt)
    End If
End Function

Private Function DBNullValue(ByVal p_Value As Variant) As Variant
    If IsNull(p_Value) Then
        DBNullValue = Null
    Else
        DBNullValue = p_Value
    End If
End Function

Private Function DBDateValue(ByVal p_Value As Variant) As Variant
    If IsNull(p_Value) Then
        DBDateValue = Null
    Else
        DBDateValue = Format$(CDate(p_Value), "yyyy-mm-dd")
    End If
End Function

' ------------------------------------------------------------------------------------------
' Helper: Construye el diccionario con todos los datos del expediente (Flat & CamelCase)
' ------------------------------------------------------------------------------------------
Private Function GetExpedienteDictionary(ByVal IDExpediente As Long) As Object
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim mainDict As Object
    Dim sql As String
    Dim fld As DAO.Field
    
    Set db = getdb()
    
    ' 1. Datos principales de TbExpedientes
    sql = "SELECT * FROM TbExpedientes WHERE IDExpediente = " & IDExpediente
    Set rs = db.OpenRecordset(sql, dbOpenSnapshot)
    
    If rs.EOF Then
        Set GetExpedienteDictionary = Nothing
        Exit Function
    End If
    
    Set mainDict = CreateObject("Scripting.Dictionary")
    
    ' Añadir campos del expediente (convertidos a camelCase)
    For Each fld In rs.Fields
        mainDict.Add ToCamelCase(fld.Name), fld.value
    Next fld
    
    ' 2. Datos extendidos (Relaciones 1:0..1) - Objetos relacionados (Keys en camelCase)
    ' Nota: Usamos una lógica que permite sobrescribir claves si ya existen (ej: 'estado' vs 'Estado' en tabla)
    
    ' TbGradosClasificacion
    Call AddRelatedObject(mainDict, db, "gradoClasificacion", "TbGradosClasificacion", "IdGradoClasificacion", rs!IdGradoClasificacion, False)
    
    ' TbOrganosContratacion
    Call AddRelatedObject(mainDict, db, "organoContratacion", "TbOrganosContratacion", "IDOrganoContratacion", rs!IDOrganoContratacion, False)
    
    ' TbOficinasPrograma
    Call AddRelatedObject(mainDict, db, "oficinaPrograma", "TbOficinasPrograma", "IDOficinaPrograma", rs!IDOficinaPrograma, False)
    
    ' TbEjercitos
    Call AddRelatedObject(mainDict, db, "ejercito", "TbEjercitos", "IDEjercito", rs!IDEjercito, False)
    
    ' TbEstados
    Call AddRelatedObject(mainDict, db, "estado", "TbEstados", "IDEstado", rs!IDEstado, False)
    
    ' TbUsuariosAplicaciones (Creación)
    Call AddRelatedObject(mainDict, db, "usuarioCreacion", "TbUsuariosAplicaciones", "Id", rs!IDUsuarioCreacion, False, "Id, CorreoUsuario, Nombre, Matricula")
    
    ' TbUsuariosAplicaciones (Último Cambio)
    Call AddRelatedObject(mainDict, db, "usuarioUltimoCambio", "TbUsuariosAplicaciones", "Id", rs!IDUsuarioUltimoCambio, False, "Id, CorreoUsuario, Nombre, Matricula")
    
    ' TbUsuariosAplicaciones (Responsable Calidad)
    Call AddRelatedObject(mainDict, db, "responsableCalidad", "TbUsuariosAplicaciones", "Id", rs!IDResponsableCalidad, False, "Id, CorreoUsuario, Nombre, Matricula")
    
    ' TbUsuariosAplicaciones (Responsable Seguridad)
    Call AddRelatedObject(mainDict, db, "responsableSeguridad", "TbUsuariosAplicaciones", "Id", rs!IDResponsableSeguridad, False, "Id, CorreoUsuario, Nombre, Matricula")
    
    ' TbExpedientes (Padre) - Tratamiento explícito similar a expedientesHijos
    If Not IsNull(rs!IDExpedientePadre) And Not IsEmpty(rs!IDExpedientePadre) Then
        Dim parentList As Collection
        Set parentList = GetListFromSQL(db, "SELECT * FROM TbExpedientes WHERE IDExpediente = " & rs!IDExpedientePadre)
        If parentList.Count > 0 Then
            SafeAdd mainDict, "expedientePadre", parentList(1)
        Else
            SafeAdd mainDict, "expedientePadre", Nothing
        End If
    Else
        SafeAdd mainDict, "expedientePadre", Nothing
    End If
    
    rs.Close

    ' TbDatosEconomicosExpedientes
    AddSingleRelatedRecord mainDict, db, "datosEconomicos", "SELECT * FROM TbDatosEconomicosExpedientes WHERE IDExpediente = " & IDExpediente
    
    ' 3. Datos relacionados (Relaciones 1:N)
    
    ' TbExpedientesJefaturas
    SafeAdd mainDict, "jefaturas", GetListFromSQL(db, "SELECT * FROM TbExpedientesJefaturas WHERE IDExpediente = " & IDExpediente)
    
    ' TbExpedientesAnualidades (Logica especial para extraer impuestos)
    Call AddAnualidadesAndTaxes(mainDict, db, IDExpediente)
    
    ' TbExpedientesCodigoCompras
    SafeAdd mainDict, "codigosCompras", GetListFromSQL(db, "SELECT * FROM TbExpedientesCodigoCompras WHERE IDExpediente = " & IDExpediente)
    
    ' TbExpedientesComerciales (Join para nombre)
    SafeAdd mainDict, "comerciales", GetListFromSQL(db, "SELECT T1.*, T2.Comercial FROM TbExpedientesComerciales T1 LEFT JOIN TbComerciales T2 ON T1.IDComercial = T2.IDComercial WHERE T1.IDExpediente = " & IDExpediente)
    
    ' TbExpedientesCPVs (Join para codigo/desc)
    SafeAdd mainDict, "cpvs", GetListFromSQL(db, "SELECT T1.*, T2.* FROM TbExpedientesCPVs T1 LEFT JOIN TbCPV T2 ON T1.IDCPV = T2.IDCPV WHERE T1.IDExpediente = " & IDExpediente)
    
    ' TbExpedientesJuridicas (REMOVED per user request)
    ' SafeAdd mainDict, "juridicas", GetListFromSQL(db, "SELECT T1.*, T2.Juridica, T3.Nombre AS NombreSuministrador FROM (TbExpedientesJuridicas T1 LEFT JOIN TbJuridicas T2 ON T1.IDJuridica = T2.IDJuridica) LEFT JOIN TbSuministradores T3 ON T2.IDSuministrador = T3.IDSuministrador WHERE T1.IDExpediente = " & IDExpediente)
    
    ' TbExpedientesLugaresEjecucion
    SafeAdd mainDict, "lugaresEjecucion", GetListFromSQL(db, "SELECT * FROM TbExpedientesLugaresEjecucion WHERE IDExpediente = " & IDExpediente)
    
    ' TbExpedientesPECAL
    SafeAdd mainDict, "pecal", GetListFromSQL(db, "SELECT T1.*, T2.PECAL, T2.DESCRIPCION FROM TbExpedientesPECAL T1 LEFT JOIN TbPECAL T2 ON T1.IDPECAL = T2.IDPECAL WHERE T1.IDExpediente = " & IDExpediente)
    
    ' TbExpedientesRACS
    SafeAdd mainDict, "racs", GetListFromSQL(db, "SELECT T1.*, T2.RAC, T2.CORREO, T2.DESCRIPCION FROM TbExpedientesRACS T1 LEFT JOIN TbRACS T2 ON T1.IDRAC = T2.IDRAC WHERE T1.IDExpediente = " & IDExpediente)
    
    ' TbExpedientesResponsables
    SafeAdd mainDict, "responsables", GetListFromSQL(db, "SELECT T1.*, T2.Id, T2.CorreoUsuario, T2.Nombre, T2.Matricula FROM TbExpedientesResponsables T1 LEFT JOIN TbUsuariosAplicaciones T2 ON T1.IdUsuario = T2.Id WHERE T1.IDExpediente = " & IDExpediente)
    
    ' TbExpedientesSuministradores (Flat list by default per user request, Hierarchy function available if needed)
    ' To use hierarchy: SafeAdd mainDict, "suministradores", GetSuministradoresHierarchy(db, IDExpediente)
    SafeAdd mainDict, "suministradores", GetListFromSQL(db, "SELECT T1.*, T2.Nombre FROM TbExpedientesSuministradores T1 LEFT JOIN TbSuministradores T2 ON T1.IDSuministrador = T2.IDSuministrador WHERE T1.IDExpediente = " & IDExpediente)
    
    ' TbExpedientesModificados
    SafeAdd mainDict, "modificados", GetListFromSQL(db, "SELECT * FROM TbExpedientesModificados WHERE IDExpediente = " & IDExpediente)
    
    ' TbExpedientesHitos
    SafeAdd mainDict, "hitos", GetListFromSQL(db, "SELECT * FROM TbExpedientesHitos WHERE IDExpediente = " & IDExpediente)
    
    ' TbExpedientes (Hijos)
    SafeAdd mainDict, "expedientesHijos", GetListFromSQL(db, "SELECT * FROM TbExpedientes WHERE IDExpedientePadre = " & IDExpediente)
    
    Set GetExpedienteDictionary = mainDict
End Function

' ------------------------------------------------------------------------------------------
' Helper: Procesa anualidades extrayendo impuestos comunes al nivel superior
' ------------------------------------------------------------------------------------------
Private Sub AddAnualidadesAndTaxes(parentDict As Object, db As DAO.Database, IDExpediente As Long)
    Dim rs As DAO.Recordset
    Dim col As New Collection
    Dim dict As Object
    Dim impuestosDict As Object
    Dim sql As String
    Dim fld As DAO.Field
    Dim extractedTaxes As Boolean
    
    ' Definir campos a excluir de la lista de anualidades (porque se suben de nivel)
    ' Asumimos que IVA, IPSI, IGIC son constantes para el expediente
    
    sql = "SELECT * FROM TbExpedientesAnualidades WHERE IDExpediente = " & IDExpediente
    Set rs = db.OpenRecordset(sql, dbOpenSnapshot)
    
    extractedTaxes = False
    
    Do While Not rs.EOF
        Set dict = CreateObject("Scripting.Dictionary")
        
        ' Extraer impuestos del primer registro
        If Not extractedTaxes Then
            Set impuestosDict = CreateObject("Scripting.Dictionary")
            ' Intentar capturar campos de impuestos si existen
            On Error Resume Next
            
            Dim valIVA As Variant, valIPSI As Variant, valIGIC As Variant
            valIVA = rs!IVA
            valIPSI = rs!IPSI
            valIGIC = rs!IGIC
            
            If IsNull(valIVA) Or IsEmpty(valIVA) Then valIVA = 0
            If IsNull(valIPSI) Or IsEmpty(valIPSI) Then valIPSI = 0
            If IsNull(valIGIC) Or IsEmpty(valIGIC) Then valIGIC = 0
            
            impuestosDict.Add "iva", valIVA
            impuestosDict.Add "ipsi", valIPSI
            impuestosDict.Add "igic", valIGIC
            
            On Error GoTo 0
            
            ' Añadir impuestos al padre
            SafeAdd parentDict, "impuestos", impuestosDict
            extractedTaxes = True
        End If
        
        ' Construir objeto anualidad excluyendo los campos de impuestos
        For Each fld In rs.Fields
            Dim key As String
            key = ToCamelCase(fld.Name)
            
            ' Filtrar campos que ya están en 'impuestos'
            If key <> "iva" And key <> "ipsi" And key <> "igic" Then
                dict.Add key, fld.value
            End If
        Next fld
        
        col.Add dict
        rs.MoveNext
    Loop
    rs.Close
    
    SafeAdd parentDict, "anualidades", col
End Sub

' ------------------------------------------------------------------------------------------
' Helper: Obtiene la jerarquía de suministradores (Padres -> Subcontratistas)
' ------------------------------------------------------------------------------------------
Private Function GetSuministradoresHierarchy(db As DAO.Database, IDExpediente As Long) As Collection
    Dim rs As DAO.Recordset
    Dim allItems As Object ' Dictionary of IDExpedienteSuministrador -> DictionaryObject
    Dim rootItems As New Collection
    Dim dict As Object
    Dim fld As DAO.Field
    Dim sql As String
    Dim idKey As String
    Dim parentKey As String
    Dim currentId As String
    Dim parentId As String
    Dim item As Object
    Dim parentItem As Object
    Dim key As Variant
    
    Set allItems = CreateObject("Scripting.Dictionary")
    
    ' Obtener todos los suministradores del expediente
    sql = "SELECT T1.*, T2.Nombre FROM TbExpedientesSuministradores T1 LEFT JOIN TbSuministradores T2 ON T1.IDSuministrador = T2.IDSuministrador WHERE T1.IDExpediente = " & IDExpediente
    Set rs = db.OpenRecordset(sql, dbOpenSnapshot)
    
    ' Paso 1: Cargar todos los elementos en un diccionario plano
    Do While Not rs.EOF
        Set dict = CreateObject("Scripting.Dictionary")
        For Each fld In rs.Fields
            SafeAdd dict, ToCamelCase(fld.Name), fld.value
        Next fld
        
        ' Asumimos que la PK es IDExpedienteSuministrador
        ' ToCamelCase("IDExpedienteSuministrador") -> "idExpedienteSuministrador"
        idKey = "idExpedienteSuministrador"
        
        If dict.exists(idKey) Then
            currentId = CStr(dict(idKey))
            If Not allItems.exists(currentId) Then
                allItems.Add currentId, dict
            End If
        End If
        
        rs.MoveNext
    Loop
    rs.Close
    
    ' Paso 2: Construir la jerarquía
    parentKey = "idPadre" ' ToCamelCase("IDPadre")
    
    For Each key In allItems.keys
        Set item = allItems(key)
        
        parentId = ""
        If item.exists(parentKey) Then
            If Not IsNull(item(parentKey)) And Not IsEmpty(item(parentKey)) Then
                parentId = CStr(item(parentKey))
            End If
        End If
        
        If parentId <> "" And parentId <> "0" And allItems.exists(parentId) Then
            ' Es un hijo, añadir al padre
            Set parentItem = allItems(parentId)
            
            If Not parentItem.exists("subcontratistas") Then
                parentItem.Add "subcontratistas", New Collection
            End If
            
            parentItem("subcontratistas").Add item
        Else
            ' Es un nodo raíz (o padre no encontrado en este set)
            rootItems.Add item
        End If
    Next key
    
    Set GetSuministradoresHierarchy = rootItems
End Function

' ------------------------------------------------------------------------------------------
' Helper: Obtiene una colección de diccionarios desde una consulta SQL (CamelCase keys)
' ------------------------------------------------------------------------------------------
Private Function GetListFromSQL(db As DAO.Database, sql As String) As Collection
    Dim rs As DAO.Recordset
    Dim col As New Collection
    Dim dict As Object
    Dim fld As DAO.Field
    
    Set rs = db.OpenRecordset(sql, dbOpenSnapshot)
    Do While Not rs.EOF
        Set dict = CreateObject("Scripting.Dictionary")
        For Each fld In rs.Fields
            dict.Add ToCamelCase(fld.Name), fld.value
        Next fld
        col.Add dict
        rs.MoveNext
    Loop
    rs.Close
    Set GetListFromSQL = col
End Function

' ------------------------------------------------------------------------------------------
' Helper: Añade un único registro relacionado como sub-objeto (CamelCase keys)
' ------------------------------------------------------------------------------------------
Private Sub AddSingleRelatedRecord(parentDict As Object, db As DAO.Database, keyName As String, sql As String)
    Dim rs As DAO.Recordset
    Dim dict As Object
    Dim fld As DAO.Field
    
    Set rs = db.OpenRecordset(sql, dbOpenSnapshot)
    If Not rs.EOF Then
        Set dict = CreateObject("Scripting.Dictionary")
        For Each fld In rs.Fields
            dict.Add ToCamelCase(fld.Name), fld.value
        Next fld
        SafeAdd parentDict, keyName, dict
    Else
        SafeAdd parentDict, keyName, Nothing
    End If
    rs.Close
End Sub

' ------------------------------------------------------------------------------------------
' Helper: Añade o sobrescribe una clave en el diccionario de forma segura
' ------------------------------------------------------------------------------------------
Private Sub SafeAdd(dict As Object, key As String, value As Variant)
    If dict.exists(key) Then dict.Remove key
    dict.Add key, value
End Sub

' ------------------------------------------------------------------------------------------
' Helper: Busca y añade un objeto relacionado por su ID (CamelCase keys)
' ------------------------------------------------------------------------------------------
Private Sub AddRelatedObject(parentDict As Object, db As DAO.Database, keyName As String, tableName As String, pkName As String, idValue As Variant, isString As Boolean, Optional selectFields As String = "*")
    Dim sql As String
    Dim rs As DAO.Recordset
    Dim dict As Object
    Dim fld As DAO.Field
    
    ' Validaciones de ID
    If IsNull(idValue) Then
        If parentDict.exists(keyName) Then parentDict.Remove keyName
        parentDict.Add keyName, Nothing
        Exit Sub
    End If
    
    If IsEmpty(idValue) Then
        If parentDict.exists(keyName) Then parentDict.Remove keyName
        parentDict.Add keyName, Nothing
        Exit Sub
    End If
    
    If CStr(idValue) = "" Or CStr(idValue) = "0" Then
        If parentDict.exists(keyName) Then parentDict.Remove keyName
        parentDict.Add keyName, Nothing
        Exit Sub
    End If
    
    On Error GoTo ErrorHandler
    
    If isString Then
        sql = "SELECT " & selectFields & " FROM " & tableName & " WHERE " & pkName & " = '" & Replace(idValue, "'", "''") & "'"
    Else
        sql = "SELECT " & selectFields & " FROM " & tableName & " WHERE " & pkName & " = " & idValue
    End If
    
    Set rs = db.OpenRecordset(sql, dbOpenSnapshot)
    
    If Not rs.EOF Then
        Set dict = CreateObject("Scripting.Dictionary")
        For Each fld In rs.Fields
            dict.Add ToCamelCase(fld.Name), fld.value
        Next fld
        
        ' Sobrescribir si ya existe (para evitar error 457)
        If parentDict.exists(keyName) Then
            Set parentDict.item(keyName) = dict
        Else
            parentDict.Add keyName, dict
        End If
    Else
        If parentDict.exists(keyName) Then parentDict.Remove keyName
        parentDict.Add keyName, Nothing
    End If
    
    rs.Close
    Exit Sub

ErrorHandler:
    If parentDict.exists(keyName) Then parentDict.Remove keyName
    parentDict.Add keyName, Nothing
    Resume Next
End Sub

' ------------------------------------------------------------------------------------------
' Helper: Convierte una cadena a camelCase (ej: IDExpediente -> idExpediente)
' ------------------------------------------------------------------------------------------
Private Function ToCamelCase(ByVal str As String) As String
    If Len(str) = 0 Then ToCamelCase = "": Exit Function
    
    ' Caso especial: Si todo es mayúsculas (ej: PECAL, CPV), lo pasamos a minúsculas
    If UCase(str) = str Then
        ToCamelCase = LCase(str)
        Exit Function
    End If
    
    ' Caso especial: ID al principio (IDExpediente -> idExpediente)
    If Left(str, 2) = "ID" And Len(str) > 2 Then
        ToCamelCase = "id" & Mid(str, 3)
        Exit Function
    End If
    
    ' Por defecto: Primera letra minúscula
    ToCamelCase = LCase(Left(str, 1)) & Mid(str, 2)
End Function

' ------------------------------------------------------------------------------------------
' Guarda una cadena JSON en un archivo de texto (UTF-8).
' ------------------------------------------------------------------------------------------
Public Sub GuardarJsonEnArchivo(ByVal jsonContent As String, ByVal filePath As String)
    Dim stream As Object
    Dim unescapedContent As String
    
    On Error GoTo ErrorHandler
    
    unescapedContent = UnescapeUnicode(jsonContent)
    
    Set stream = CreateObject("ADODB.Stream")
    stream.Open
    stream.Type = 2 ' adTypeText
    stream.Charset = "utf-8"
    stream.WriteText unescapedContent
    
    stream.SaveToFile filePath, 2
    stream.Close
    Set stream = Nothing
    
    Exit Sub

ErrorHandler:
    Err.Raise Err.Number, "GuardarJsonEnArchivo", "Error al guardar el archivo JSON: " & Err.Description
End Sub

' ------------------------------------------------------------------------------------------
' Helper: Desescapa secuencias Unicode
' ------------------------------------------------------------------------------------------
Private Function UnescapeUnicode(ByVal str As String) As String
    Dim regex As Object
    Dim matches As Object
    Dim match As Object
    Dim charCode As Long
    Dim charStr As String
    
    Set regex = CreateObject("VBScript.RegExp")
    regex.Global = True
    regex.IgnoreCase = True
    regex.Pattern = "\\u([0-9A-Fa-f]{4})"
    
    If regex.TEST(str) Then
        Set matches = regex.Execute(str)
        For Each match In matches
            charCode = CLng("&H" & match.SubMatches(0))
            charStr = ChrW(charCode)
            str = Replace(str, match.value, charStr)
        Next match
    End If
    
    UnescapeUnicode = str
End Function

' ------------------------------------------------------------------------------------------
' Helper: Genera metadatos estándar para el JSON
' ------------------------------------------------------------------------------------------
Private Function GetMetadataDictionary() As Object
    Dim meta As Object
    Set meta = CreateObject("Scripting.Dictionary")
    
    meta.Add "apiVersion", "1.0"
    meta.Add "generatedAt", Format(Now, "yyyy-mm-ddTHH:nn:ss")
    meta.Add "generator", "Aplicaciones PpD - ExpedienteJsonExporter"
    meta.Add "user", Environ("USERNAME")
    
    Set GetMetadataDictionary = meta
End Function




