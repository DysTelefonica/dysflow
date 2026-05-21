Attribute VB_Name = "ExpedienteSuministradorRepositorio"
Option Compare Database
Option Explicit

' Obtiene datos para el árbol (Lectura, no requiere transacción normalmente)
Public Function getDatosArbol(p_IDExpediente As String) As DAO.Recordset
    Dim m_SQL As String
    m_SQL = "SELECT IDExpedienteSuministrador, IDSuministrador, IdPadre, " & _
            "ContratistaPrincipal, SubContratista, Descripcon " & _
            "FROM TbExpedientesSuministradores " & _
            "WHERE IDExpediente=" & p_IDExpediente & " " & _
            "ORDER BY Nz(IdPadre,0), IDExpedienteSuministrador;"
    
    ' Para lectura usamos snapshot sobre una nueva conexión para no bloquear
    Set getDatosArbol = getdb().OpenRecordset(m_SQL, dbOpenSnapshot)
End Function

' INSERTAR: Acepta la base de datos transaccional
Public Sub InsertarRelacion(p_ExpSum As ExpedienteSuministrador, p_IdPadre As Variant, Optional p_Db As DAO.Database = Nothing)
    Dim m_SQL As String
    Dim m_IdPadreVal As String
    Dim dbToUse As DAO.Database
    
    ' Gestión de la conexión
    If p_Db Is Nothing Then
        Set dbToUse = getdb()
    Else
        Set dbToUse = p_Db
    End If
    
    If IsNull(p_IdPadre) Or p_IdPadre = "" Then
        m_IdPadreVal = "Null"
    Else
        m_IdPadreVal = p_IdPadre
    End If
    
    m_SQL = "INSERT INTO TbExpedientesSuministradores (" & _
            "IDExpedienteSuministrador, IDExpediente, IDSuministrador, " & _
            "IdPadre, ContratistaPrincipal, SubContratista, Descripcon) " & _
            "VALUES (" & _
            p_ExpSum.IDExpedienteSuministrador & ", " & _
            p_ExpSum.IDExpediente & ", " & _
            p_ExpSum.IDSuministrador & ", " & _
            m_IdPadreVal & ", " & _
            "'" & p_ExpSum.ContratistaPrincipal & "', " & _
            "'" & p_ExpSum.SubContratista & "', " & _
            "'" & Replace(Nz(p_ExpSum.Descripcon, ""), "'", "''") & "');"
            
    dbToUse.Execute m_SQL, dbFailOnError
End Sub

' ELIMINAR: Acepta la base de datos transaccional
Public Sub EliminarRelacion(p_IDRelacion As String, Optional p_Db As DAO.Database = Nothing)
    Dim m_SQL As String
    Dim dbToUse As DAO.Database
    
    If p_Db Is Nothing Then
        Set dbToUse = getdb()
    Else
        Set dbToUse = p_Db
    End If
    
    m_SQL = "DELETE FROM TbExpedientesSuministradores WHERE IDExpedienteSuministrador=" & p_IDRelacion & ";"
    dbToUse.Execute m_SQL, dbFailOnError
End Sub

' COMPROBACIONES (Lectura)
Public Function ExisteSuministradorEnExpediente(p_IDExpediente As String, p_IDSuministrador As String) As Boolean
    Dim m_SQL As String
    Dim rs As DAO.Recordset
    
    m_SQL = "SELECT IDExpedienteSuministrador FROM TbExpedientesSuministradores " & _
            "WHERE IDExpediente=" & p_IDExpediente & " AND IDSuministrador=" & p_IDSuministrador & ";"
            
    Set rs = getdb().OpenRecordset(m_SQL, dbOpenSnapshot)
    ExisteSuministradorEnExpediente = Not rs.EOF
    rs.Close
    Set rs = Nothing
End Function

Public Function ContarHijos(p_IDRelacion As String) As Long
    Dim m_SQL As String
    Dim rs As DAO.Recordset
    
    m_SQL = "SELECT Count(*) as Total FROM TbExpedientesSuministradores WHERE IdPadre=" & p_IDRelacion & ";"
    
    Set rs = getdb().OpenRecordset(m_SQL, dbOpenSnapshot)
    If Not rs.EOF Then
        ContarHijos = rs!total
    Else
        ContarHijos = 0
    End If
    rs.Close
    Set rs = Nothing
End Function
' Añadir al final del módulo ExpedienteSuministradorRepositorio

' Actualiza el padre y los roles de una relación (Transaccional)
Public Sub ActualizarPadreRelacion( _
    p_IDRelacion As String, _
    p_NuevoIdPadre As Variant, _
    p_EsContratista As String, _
    p_EsSubcontratista As String, _
    Optional p_Db As DAO.Database = Nothing)
    
    Dim m_SQL As String
    Dim dbToUse As DAO.Database
    Dim sPadreVal As String
    
    If p_Db Is Nothing Then Set dbToUse = getdb() Else Set dbToUse = p_Db
    
    If IsNull(p_NuevoIdPadre) Or p_NuevoIdPadre = "" Then
        sPadreVal = "Null"
    Else
        sPadreVal = p_NuevoIdPadre
    End If
    
    m_SQL = "UPDATE TbExpedientesSuministradores SET " & _
            "IdPadre = " & sPadreVal & ", " & _
            "ContratistaPrincipal = '" & p_EsContratista & "', " & _
            "SubContratista = '" & p_EsSubcontratista & "' " & _
            "WHERE IDExpedienteSuministrador = " & p_IDRelacion & ";"
            
    dbToUse.Execute m_SQL, dbFailOnError
End Sub
' Verifica si hay alguna empresa del consorcio propio como Contratista Principal en este expediente
Public Function HayNuestrasEmpresasComoPrincipal(p_IDExpediente As String) As Boolean
    Dim m_SQL As String
    Dim rs As DAO.Recordset
    
    ' Hacemos un JOIN para ver si los suministradores principales tienen ConsorcioPropio='Sí'
    m_SQL = "SELECT Count(*) as Total " & _
            "FROM TbExpedientesSuministradores INNER JOIN TbSuministradores " & _
            "ON TbExpedientesSuministradores.IDSuministrador = TbSuministradores.IDSuministrador " & _
            "WHERE TbExpedientesSuministradores.IDExpediente=" & p_IDExpediente & " " & _
            "AND TbExpedientesSuministradores.ContratistaPrincipal='Sí' " & _
            "AND TbSuministradores.ConsorcioPropio='Sí';"
            
    Set rs = getdb().OpenRecordset(m_SQL, dbOpenSnapshot)
    If Not rs.EOF Then
        HayNuestrasEmpresasComoPrincipal = (rs!total > 0)
    Else
        HayNuestrasEmpresasComoPrincipal = False
    End If
    rs.Close
    Set rs = Nothing
End Function

' Actualiza el campo ContratistaPrincipal en la tabla padre (TbExpedientes)
Public Sub ActualizarFlagCabecera(p_IDExpediente As String, p_Valor As String, p_Db As DAO.Database)
    Dim m_SQL As String
    ' Validamos que el valor sea Sí o No para evitar errores
    Dim sVal As String
    If p_Valor = "Sí" Or p_Valor = "Si" Then sVal = "Sí" Else sVal = "No"
    
    m_SQL = "UPDATE TbExpedientes SET ContratistaPrincipal = '" & sVal & "' " & _
            "WHERE IDExpediente=" & p_IDExpediente & ";"
    p_Db.Execute m_SQL, dbFailOnError
End Sub

' Devuelve un Recordset con los ID_Relacion de las empresas PROPIAS en un nivel raíz específico
Public Function GetRelacionesPropiasEnRaiz(p_IDExpediente As String, p_EsPrincipal As Boolean) As DAO.Recordset
    Dim m_SQL As String
    Dim sFiltro As String
    
    If p_EsPrincipal Then
        sFiltro = "ContratistaPrincipal='Sí'"
    Else
        sFiltro = "SubContratista='Sí'"
    End If
    
    ' Join para filtrar solo las que tienen ConsorcioPropio = 'Sí'
    m_SQL = "SELECT ES.IDExpedienteSuministrador " & _
            "FROM TbExpedientesSuministradores ES " & _
            "INNER JOIN TbSuministradores S ON ES.IDSuministrador = S.IDSuministrador " & _
            "WHERE ES.IDExpediente=" & p_IDExpediente & " " & _
            "AND ES.IdPadre Is Null " & _
            "AND ES." & sFiltro & " " & _
            "AND S.ConsorcioPropio='Sí';"
            
    Set GetRelacionesPropiasEnRaiz = getdb().OpenRecordset(m_SQL, dbOpenSnapshot)
End Function
' Nueva función para permitir duplicados en el expediente pero no en el mismo nivel
Public Function ExisteSuministradorBajoPadre(p_IDExpediente As String, p_IDSuministrador As String, p_IdPadre As Variant) As Boolean
    Dim m_SQL As String
    Dim rs As DAO.Recordset
    Dim sWherePadre As String
    
    ' PROTECCIÓN: Si no hay ID, no puede existir en la base de datos
    If p_IDExpediente = "" Then
        ExisteSuministradorBajoPadre = False
        Exit Function
    End If
    
    If IsNull(p_IdPadre) Or p_IdPadre = "" Then
        sWherePadre = "IdPadre Is Null"
    Else
        sWherePadre = "IdPadre = " & p_IdPadre
    End If
    
    m_SQL = "SELECT IDExpedienteSuministrador FROM TbExpedientesSuministradores " & _
            "WHERE IDExpediente=" & p_IDExpediente & " AND IDSuministrador=" & p_IDSuministrador & _
            " AND " & sWherePadre & ";"
            
    Set rs = getdb().OpenRecordset(m_SQL, dbOpenSnapshot)
    ExisteSuministradorBajoPadre = Not rs.EOF
    rs.Close
    Set rs = Nothing
End Function

