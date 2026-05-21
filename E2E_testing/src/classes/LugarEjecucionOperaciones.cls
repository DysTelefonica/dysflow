VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "LugarEjecucionOperaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public LugarEjecucion As LugarEjecucion

Public Function Registrar( _
                            Optional p_LugarEjecucionAlInicio As LugarEjecucion, _
                            Optional ByRef p_Error As String _
                            ) As String

    Dim m_SQL As String
    Dim rcdDatos As DAO.Recordset
    Dim m_LugarEjecucion As LugarEjecucion
    Dim m_Comprobar As Boolean
    
    On Error GoTo errores
    With Me.LugarEjecucion
        If .LugarEjecucion = "" Then
            p_Error = "Falta el campo LugarEjecucion"
            Err.Raise 1000
        End If
        If Not p_LugarEjecucionAlInicio Is Nothing Then
            If .LugarEjecucion <> p_LugarEjecucionAlInicio.LugarEjecucion Then
                m_Comprobar = True
            End If
        Else
            m_Comprobar = True
        End If
        If m_Comprobar = True Then
            Set m_LugarEjecucion = constructor.getLugarEjecucion(p_LugarEjecucion:=.LugarEjecucion, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If Not m_LugarEjecucion Is Nothing Then
                p_Error = "Ese nombre de LugarEjecucion ya está registrado"
                Err.Raise 1000
            End If
        End If
        If p_LugarEjecucionAlInicio Is Nothing Then
            .IDLugarEjecucion = .IDLugarEjecucionCalculado
            m_SQL = "TbLugaresEjecucion"
        Else
            m_SQL = "SELECT * " & _
                "FROM TbLugaresEjecucion " & _
                "WHERE IDLugarEjecucion=" & .IDLugarEjecucion & ";"
        End If
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        If p_LugarEjecucionAlInicio Is Nothing Then
            rcdDatos.AddNew
                rcdDatos.Fields("IDLugarEjecucion") = .IDLugarEjecucion
                rcdDatos.Fields("LugarEjecucion") = .LugarEjecucion
                If .DESCRIPCION <> "" Then
                    rcdDatos.Fields("Descripcion") = .DESCRIPCION
                End If
            rcdDatos.Update
        Else
            rcdDatos.Edit
                rcdDatos.Fields("LugarEjecucion") = .LugarEjecucion
                If .DESCRIPCION <> "" Then
                    rcdDatos.Fields("Descripcion") = .DESCRIPCION
                Else
                    rcdDatos.Fields("Descripcion") = Null
                End If
            rcdDatos.Update
        End If
        rcdDatos.Close
        Set rcdDatos = Nothing
    End With
    Set m_ObjEntorno.LugaresEjecucion = Nothing
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método LugarEjecucionOperaciones.Registrar ha producido el error nº: " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If
    
End Function

Public Function Eliminar(Optional ByRef p_Error As String) As String
    Dim m_SQL As String
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_expediente As Expediente
    Dim m_CadenaExpedientes As String
    On Error GoTo errores
    With Me.LugarEjecucion
        If .LugarEjecucion = "N/A" Then
            p_Error = "Es una opción Estructural que otras herramientas necesitan.No se puede borrar"
            Err.Raise 1000
        End If
        Set m_Col = constructor.getExpedientesConLugarEjecucion(.IDLugarEjecucion, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If Not m_Col Is Nothing Then
            For Each m_ID In m_Col
                Set m_expediente = m_Col(m_ID)
                If m_CadenaExpedientes = "" Then
                    m_CadenaExpedientes = m_expediente.CodExp
                Else
                    m_CadenaExpedientes = m_CadenaExpedientes & vbNewLine & m_expediente.CodExp
                End If
                Set m_expediente = Nothing
            Next
            p_Error = "Ese Lugar de Ejecución forma parte de estos expedientes " & vbNewLine & m_CadenaExpedientes
            Err.Raise 1000
        End If
        m_SQL = "DELETE * " & _
                "FROM TbLugaresEjecucion " & _
                "WHERE IDLugarEjecucion=" & .IDLugarEjecucion & ";"
        getdb().Execute m_SQL
    End With
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método LugarEjecucionOperaciones.Eliminar ha producido el error nº: " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If
    Set m_ObjEntorno.LugaresEjecucion = Nothing
End Function

