Attribute VB_Name = "RiesgoRepositorio"

Option Compare Database
Option Explicit

' Obtiene los riesgos asociados a una NC específica desde la tabla de unión local
Public Function GetRiesgosAsociados(ByVal p_IDNC As Long, ByRef p_Error As String) As Scripting.Dictionary
    Dim rcd As DAO.Recordset
    Dim m_SQL As String
    Dim m_Riesgo As riesgo
    Dim m_Col As Scripting.Dictionary
    
    On Error GoTo errores
    Set m_Col = New Scripting.Dictionary
    m_Col.CompareMode = TextCompare
    
    ' Nota: Consultamos la tabla de unión TbRiesgosNC en la BD local de NC
    ' pero traemos los datos descriptivos de la BD de Riesgos mediante getdbRiesgos
    m_SQL = "SELECT R.* FROM TbRiesgos AS R " & _
            "INNER JOIN TbRiesgosNC AS L ON R.IDRiesgo = L.IDRiesgo " & _
            "WHERE L.IDNC = " & p_IDNC
            
    Set rcd = getdbRiesgos().OpenRecordset(m_SQL)
    
    Do While Not rcd.EOF
        Set m_Riesgo = New riesgo
        ' Hidratamos usando el patrón de tu clase Riesgo
        m_Riesgo.idRiesgo = rcd!idRiesgo
        m_Riesgo.CodigoRiesgo = Nz(rcd!CodigoRiesgo, "")
        m_Riesgo.Descripcion = Nz(rcd!Descripcion, "")
        m_Riesgo.IDEdicion = rcd!IDEdicion
        
        m_Col.Add CStr(m_Riesgo.idRiesgo), m_Riesgo
        rcd.MoveNext
    Loop
    
    Set GetRiesgosAsociados = m_Col
    rcd.Close
    Set rcd = Nothing
    Exit Function

errores:
    p_Error = "Error en RiesgoRepositorio.GetRiesgosAsociados: " & Err.Description
End Function

' Obtiene los riesgos candidatos de la ÚLTIMA edición del proyecto vinculado al expediente
Public Function GetRiesgosDisponibles(ByVal p_IDExpediente As Long, ByRef p_Error As String) As Scripting.Dictionary
    Dim rcd As DAO.Recordset
    Dim m_SQL As String
    Dim m_Riesgo As riesgo
    Dim m_Col As Scripting.Dictionary
    
    On Error GoTo errores
    Set m_Col = New Scripting.Dictionary
    
    ' SQL para buscar riesgos de la última edición del proyecto asociado al expediente
    m_SQL = "SELECT R.* FROM TbRiesgos AS R " & _
            "WHERE (((R.IDEdicion)=(SELECT MAX(E.IDEdicion) " & _
                    "FROM TbProyectosEdiciones AS E INNER JOIN TbProyectos AS P " & _
                    "ON E.IDProyecto = P.IDProyecto WHERE P.IDExpediente =" & p_IDExpediente & ")) " & _
                    "AND ((R.FechaRetirado) Is Null));"
    
    Set rcd = getdbRiesgos().OpenRecordset(m_SQL)
    
    Do While Not rcd.EOF
        Set m_Riesgo = New riesgo
        m_Riesgo.idRiesgo = rcd!idRiesgo
        m_Riesgo.CodigoRiesgo = rcd!CodigoRiesgo
        m_Riesgo.Descripcion = rcd!Descripcion
        
        m_Col.Add CStr(m_Riesgo.idRiesgo), m_Riesgo
        rcd.MoveNext
    Loop
    
    Set GetRiesgosDisponibles = m_Col
    rcd.Close
    Set rcd = Nothing
    Exit Function

errores:
    p_Error = "Error en RiesgoRepositorio.GetRiesgosDisponibles: " & Err.Description
End Function

Public Sub GuardarAsociaciones(ByVal p_IDNC As Long, ByRef p_ColIDs As Collection, ByRef p_Error As String)
    Dim dbRiesgos As DAO.Database
    Dim varIDRiesgo As Variant
    Dim nuevoID As Long
    Dim m_Fecha As String
    On Error GoTo errores
    
    ' 1. Obtener conexión al repositorio externo (Fuente: 03_Environment_Config)
    Set dbRiesgos = getdbRiesgos()
    
    ' 2. Limpiar asociaciones previas
    ' Nota: Validar si el campo es IDNC o IDNoConformidad según el esquema físico
    dbRiesgos.Execute "DELETE FROM TbRiesgosNC WHERE IDNC = " & p_IDNC, dbFailOnError
    m_Fecha = "#" & Format(Now, "mm/dd/yyyy") & "#"
    ' 3. Insertar nuevas asociaciones con ID generado manualmente
    If Not p_ColIDs Is Nothing Then
        For Each varIDRiesgo In p_ColIDs
            ' Obtener nuevo ID para la tabla de unión (Fuente: 07_Constructor)
            nuevoID = constructor.getID("TbRiesgosNC", "ID", dbRiesgos)
            
            dbRiesgos.Execute "INSERT INTO TbRiesgosNC (ID, IDNC, IDRiesgo, FechaRegistro,ParaNC,FechaDecison) " & _
                              "VALUES (" & nuevoID & ", " & p_IDNC & ", " & varIDRiesgo & "," & _
                              m_Fecha & ",'Sí'," & m_Fecha & ")", dbFailOnError
        Next varIDRiesgo
    End If
    
    Exit Sub

errores:
    p_Error = "Error en RiesgoRepositorio.GuardarAsociaciones: " & Err.Description
    ' No se hace Raise para permitir que el servicio (RiesgoServicio) gestione el booleano
End Sub

