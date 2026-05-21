VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "OficinaProgramaOperaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public OficinaPrograma As OficinaPrograma

Public Function Registrar( _
                            Optional p_OficinaProgramaAlInicio As OficinaPrograma, _
                            Optional ByRef p_Error As String _
                            ) As String

    Dim m_SQL As String
    Dim rcdDatos As DAO.Recordset
    Dim m_OficinaPrograma As OficinaPrograma
    Dim m_Comprobar As Boolean
    On Error GoTo errores
    With Me.OficinaPrograma
        If .OficinaPrograma = "" Then
            p_Error = "Falta el campo OficinaPrograma"
            Err.Raise 1000
        End If
        If Not p_OficinaProgramaAlInicio Is Nothing Then
            If .OficinaPrograma <> p_OficinaProgramaAlInicio.OficinaPrograma Then
                m_Comprobar = True
            End If
        Else
            m_Comprobar = True
        End If
        If m_Comprobar = True Then
            Set m_OficinaPrograma = constructor.getOficinaPrograma(p_OficinaPrograma:=.OficinaPrograma, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If Not m_OficinaPrograma Is Nothing Then
                p_Error = "Ese nombre de OficinaPrograma ya está registrado"
                Err.Raise 1000
            End If
        End If
        If p_OficinaProgramaAlInicio Is Nothing Then
            .IDOficinaPrograma = .IDOficinaProgramaCalculado
            m_SQL = "TbOficinasPrograma"
        Else
            m_SQL = "SELECT * " & _
                "FROM TbOficinasPrograma " & _
                "WHERE IDOficinaPrograma=" & .IDOficinaPrograma & ";"
        End If
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        If p_OficinaProgramaAlInicio Is Nothing Then
            rcdDatos.AddNew
                rcdDatos.Fields("IDOficinaPrograma") = .IDOficinaPrograma
                rcdDatos.Fields("OficinaPrograma") = .OficinaPrograma
                If .DESCRIPCION <> "" Then
                    rcdDatos.Fields("Descripcion") = .DESCRIPCION
                End If
            rcdDatos.Update
        Else
            rcdDatos.Edit
                rcdDatos.Fields("OficinaPrograma") = .OficinaPrograma
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
    Set m_ObjEntorno.OficinasDePrograma = Nothing
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método OficinaProgramaOperaciones.Registrar ha producido el error nº: " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If
    
End Function

Public Function Eliminar(Optional ByRef p_Error As String) As String
    Dim m_SQL As String
    
    On Error GoTo errores
    With Me.OficinaPrograma
        If .OficinaPrograma = "N/A" Then
            p_Error = "Es una opción Estructural que otras herramientas necesitan.No se puede borrar"
            Err.Raise 1000
        End If
        If Not m_ObjEntorno.ColOficinaProgramaSEnExpedientes Is Nothing Then
            If m_ObjEntorno.ColOficinaProgramaSEnExpedientes.exists(CStr(.IDOficinaPrograma)) Then
                p_Error = "Al menos un expediente usa este OficinaPrograma"
                Err.Raise 1000
            End If
        End If
        m_SQL = "DELETE * " & _
                "FROM TbOficinasPrograma " & _
                "WHERE IDOficinaPrograma=" & .IDOficinaPrograma & ";"
        getdb().Execute m_SQL
    End With
    Set m_ObjEntorno.OficinasDePrograma = Nothing
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método OficinaProgramaOperaciones.Eliminar ha producido el error nº: " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function



