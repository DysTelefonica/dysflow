VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "CacheNCCacheRepositorio"
Option Compare Database
Option Explicit

Public Enum EnumCampoCache
    Campo_DatosNC = 1
    Campo_DatosACs = 2
    Campo_DatosDocumentos = 3
    Campo_DatosRiesgos = 4
    Campo_DatosReplanificaciones = 5
    Campo_Cerrado = 6
End Enum

Private Const NOMBRE_TABLA_CACHE_DETALLE As String = "TbCacheNCProyecto"
Private Const NOMBRE_TABLA_CACHE_LISTADO As String = "TbCacheListadoNC"

Public Function UpsertDetalle(ByVal p_IDNC As Long, ByRef p_Valores As Scripting.Dictionary, Optional ByRef p_Error As String) As Boolean
    Dim db As Dao.Database
    Dim rs As Dao.Recordset
    Dim SQL As String
    Dim key As Variant
    
    On Error GoTo errores
    p_Error = ""
    UpsertDetalle = False
    
    Set db = getdb()
    
    SQL = "SELECT * FROM " & NOMBRE_TABLA_CACHE_DETALLE & " WHERE IDNoConformidad = " & p_IDNC
    Set rs = db.OpenRecordset(SQL, dbOpenDynaset)
    
    If rs.EOF Then
        rs.AddNew
        rs!IDNoConformidad = p_IDNC
        rs!Version = 1
    Else
        rs.Edit
        rs!Version = rs!Version + 1
    End If
    
    rs!FechaCache = Now()
    rs!CacheValida = True
    
    For Each key In p_Valores.Keys
        Select Case LCase(key)
            Case "datosnc"
                rs!DatosNC = p_Valores(key)
            Case "datosacs"
                rs!DatosACs = p_Valores(key)
            Case "datosdocumentos"
                rs!DatosDocumentos = p_Valores(key)
            Case "datosriesgos"
                rs!DatosRiesgos = p_Valores(key)
            Case "datosreplanificaciones"
                rs!DatosReplanificaciones = p_Valores(key)
            Case "cerrado"
                rs!Cerrado = p_Valores(key)
        End Select
    Next key
    
    rs.Update
    rs.Close
    Set rs = Nothing
    
    UpsertDetalle = True
    Exit Function
    
errores:
    If Not rs Is Nothing Then
        rs.Close
        Set rs = Nothing
    End If
    p_Error = "CacheNCCacheRepositorio.UpsertDetalle: " & Err.Description
End Function

Public Function ActualizarCampoDetalle(ByVal p_IDNC As Long, ByVal p_Campo As EnumCampoCache, ByVal p_Valor As Variant, Optional ByRef p_Error As String) As Boolean
    Dim db As Dao.Database
    Dim rs As Dao.Recordset
    Dim SQL As String
    
    On Error GoTo errores
    p_Error = ""
    ActualizarCampoDetalle = False
    
    Set db = getdb()
    
    SQL = "SELECT * FROM " & NOMBRE_TABLA_CACHE_DETALLE & " WHERE IDNoConformidad = " & p_IDNC
    Set rs = db.OpenRecordset(SQL, dbOpenDynaset)
    
    If rs.EOF Then
        rs.AddNew
        rs!IDNoConformidad = p_IDNC
        rs!Version = 1
        rs!FechaCache = Now()
        rs!CacheValida = True
    Else
        rs.Edit
        rs!Version = rs!Version + 1
        rs!FechaCache = Now()
    End If
    
    Select Case p_Campo
        Case Campo_DatosNC
            rs!DatosNC = p_Valor
        Case Campo_DatosACs
            rs!DatosACs = p_Valor
        Case Campo_DatosDocumentos
            rs!DatosDocumentos = p_Valor
        Case Campo_DatosRiesgos
            rs!DatosRiesgos = p_Valor
        Case Campo_DatosReplanificaciones
            rs!DatosReplanificaciones = p_Valor
        Case Campo_Cerrado
            rs!Cerrado = p_Valor
    End Select
    
    rs.Update
    rs.Close
    Set rs = Nothing
    
    ActualizarCampoDetalle = True
    Exit Function
    
errores:
    If Not rs Is Nothing Then
        rs.Close
        Set rs = Nothing
    End If
    p_Error = "CacheNCCacheRepositorio.ActualizarCampoDetalle: " & Err.Description
End Function

Public Function EliminarDetalle(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
    Dim db As Dao.Database
    Dim SQL As String
    
    On Error GoTo errores
    p_Error = ""
    EliminarDetalle = False
    
    Set db = getdb()
    
    SQL = "DELETE FROM " & NOMBRE_TABLA_CACHE_DETALLE & " WHERE IDNoConformidad = " & p_IDNC
    db.Execute SQL, dbFailOnError
    
    EliminarDetalle = True
    Exit Function
    
errores:
    p_Error = "CacheNCCacheRepositorio.EliminarDetalle: " & Err.Description
End Function

Public Function UpsertListado(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
    Dim db As Dao.Database
    Dim rsDetalle As Dao.Recordset
    Dim rsListado As Dao.Recordset
    Dim SQL As String
    Dim rsNCSource As Dao.Recordset
    
    On Error GoTo errores
    p_Error = ""
    UpsertListado = False
    
    Set db = getdb()
    
    SQL = "SELECT * FROM " & NOMBRE_TABLA_CACHE_DETALLE & " WHERE IDNoConformidad = " & p_IDNC & " AND CacheValida = True"
    Set rsDetalle = db.OpenRecordset(SQL, dbOpenSnapshot)
    
    If rsDetalle.EOF Then
        rsDetalle.Close
        Set rsDetalle = Nothing
        UpsertListado = False
        p_Error = "No existe cache detalle valido para NC: " & p_IDNC
        Exit Function
    End If
    
    rsDetalle.Close
    Set rsDetalle = Nothing
    
    SQL = "SELECT * FROM " & NOMBRE_TABLA_CACHE_LISTADO & " WHERE IDNoConformidad = " & p_IDNC
    Set rsListado = db.OpenRecordset(SQL, dbOpenDynaset)
    
    If rsListado.EOF Then
        rsListado.AddNew
        rsListado!IDNoConformidad = p_IDNC
        rsListado!Version = 1
    Else
        rsListado.Edit
        rsListado!Version = rsListado!Version + 1
    End If
    
    rsListado!FechaCache = Now()
    rsListado!CacheValida = True
    
    SQL = "SELECT n.IDNoConformidad, n.CodigoNoConformidad, n.IDExpediente, n.Nemotecnico, " & _
          "n.CodExp, n.JuridicaExp, n.IDTipo, n.Descripcion, n.Notas, n.Estado, " & _
          "n.FechaApertura, n.FECHACIERRE, n.RequiereControlEficacia, n.ControlEficacia, " & _
          "n.ResponsableTelefonica, n.RESPONSABLECALIDAD, n.ACR, n.Cerrada " & _
          "FROM TbNoConformidades n WHERE n.IDNoConformidad = " & p_IDNC
    Set rsNCSource = db.OpenRecordset(SQL, dbOpenSnapshot)
    
    If Not rsNCSource.EOF Then
        rsListado!CodigoNoConformidad = Left$(Nz(rsNCSource!CodigoNoConformidad, ""), 255)
        If IsNull(rsNCSource!IDExpediente) Then
            rsListado!IDExpediente = Null
        Else
            rsListado!IDExpediente = rsNCSource!IDExpediente
        End If
        rsListado!Nemotecnico = Left$(Nz(rsNCSource!Nemotecnico, ""), 255)
        rsListado!CodExp = Left$(Nz(rsNCSource!CodExp, ""), 255)
        rsListado!JuridicaExp = Left$(Nz(rsNCSource!JuridicaExp, ""), 255)
        rsListado!IDTipo = Nz(rsNCSource!IDTipo, 0)
        rsListado!Descripcion = Nz(rsNCSource!Descripcion, "")
        rsListado!Notas = Nz(rsNCSource!Notas, "")
        rsListado!Estado = Left$(Nz(rsNCSource!Estado, ""), 100)
        If IsNull(rsNCSource!FechaApertura) Then
            rsListado!FechaApertura = Null
        Else
            rsListado!FechaApertura = rsNCSource!FechaApertura
        End If
        If IsNull(rsNCSource!FECHACIERRE) Then
            rsListado!FECHACIERRE = Null
        Else
            rsListado!FECHACIERRE = rsNCSource!FECHACIERRE
        End If
        rsListado!RequiereControlEficacia = Left$(Nz(rsNCSource!RequiereControlEficacia, ""), 10)
        rsListado!ControlEficacia = Left$(Nz(rsNCSource!ControlEficacia, ""), 255)
        rsListado!ResponsableTelefonica = Left$(Nz(rsNCSource!ResponsableTelefonica, ""), 255)
        rsListado!RESPONSABLECALIDAD = Left$(Nz(rsNCSource!RESPONSABLECALIDAD, ""), 255)
        rsListado!ACR = Left$(Nz(rsNCSource!ACR, ""), 255)
        rsListado!Cerrada = Left$(CStr(Nz(rsNCSource!Cerrada, False)), 10)
    End If
    
    rsNCSource.Close
    Set rsNCSource = Nothing
    
    rsListado.Update
    rsListado.Close
    Set rsListado = Nothing
    
    UpsertListado = True
    Exit Function
    
errores:
    If Not rsDetalle Is Nothing Then rsDetalle.Close: Set rsDetalle = Nothing
    If Not rsListado Is Nothing Then rsListado.Close: Set rsListado = Nothing
    If Not rsNCSource Is Nothing Then rsNCSource.Close: Set rsNCSource = Nothing
    p_Error = "CacheNCCacheRepositorio.UpsertListado: " & Err.Description
End Function

Public Function EliminarListado(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
    Dim db As Dao.Database
    Dim SQL As String
    
    On Error GoTo errores
    p_Error = ""
    EliminarListado = False
    
    Set db = getdb()
    
    SQL = "DELETE FROM " & NOMBRE_TABLA_CACHE_LISTADO & " WHERE IDNoConformidad = " & p_IDNC
    db.Execute SQL, dbFailOnError
    
    EliminarListado = True
    Exit Function
    
errores:
    p_Error = "CacheNCCacheRepositorio.EliminarListado: " & Err.Description
End Function

Public Function GetDetalleValido(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
    Dim db As Dao.Database
    Dim rs As Dao.Recordset
    Dim SQL As String
    
    On Error GoTo errores
    p_Error = ""
    GetDetalleValido = False
    
    Set db = getdb()
    
    SQL = "SELECT CacheValida FROM " & NOMBRE_TABLA_CACHE_DETALLE & " WHERE IDNoConformidad = " & p_IDNC & " AND CacheValida = True"
    Set rs = db.OpenRecordset(SQL, dbOpenSnapshot)
    
    GetDetalleValido = Not rs.EOF
    
    rs.Close
    Set rs = Nothing
    Exit Function
    
errores:
    If Not rs Is Nothing Then rs.Close: Set rs = Nothing
    p_Error = "CacheNCCacheRepositorio.GetDetalleValido: " & Err.Description
End Function

Public Function GetListadoValido(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
    Dim db As Dao.Database
    Dim rs As Dao.Recordset
    Dim SQL As String
    
    On Error GoTo errores
    p_Error = ""
    GetListadoValido = False
    
    Set db = getdb()
    
    SQL = "SELECT CacheValida FROM " & NOMBRE_TABLA_CACHE_LISTADO & " WHERE IDNoConformidad = " & p_IDNC & " AND CacheValida = True"
    Set rs = db.OpenRecordset(SQL, dbOpenSnapshot)
    
    GetListadoValido = Not rs.EOF
    
    rs.Close
    Set rs = Nothing
    Exit Function
    
errores:
    If Not rs Is Nothing Then rs.Close: Set rs = Nothing
    p_Error = "CacheNCCacheRepositorio.GetListadoValido: " & Err.Description
End Function
