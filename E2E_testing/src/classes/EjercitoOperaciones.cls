VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "EjercitoOperaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public Ejercito As Ejercito

Public Function Registrar( _
                            Optional p_EjercitoAlInicio As Ejercito, _
                            Optional ByRef p_Error As String _
                            ) As String

    Dim m_SQL As String
    Dim rcdDatos As DAO.Recordset
    Dim m_Ejercito As Ejercito
    Dim m_Comprobar As Boolean
    
    On Error GoTo errores
    With Me.Ejercito
        If .Ejercito = "" Then
            p_Error = "Falta el campo Ejercito"
            Err.Raise 1000
        End If
        If Not p_EjercitoAlInicio Is Nothing Then
            If .Ejercito <> p_EjercitoAlInicio.Ejercito Then
                m_Comprobar = True
            End If
        Else
            m_Comprobar = True
        End If
        If m_Comprobar = True Then
            Set m_Ejercito = constructor.getEjercito(p_Ejercito:=.Ejercito, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If Not m_Ejercito Is Nothing Then
                p_Error = "Ese nombre de Ejercito ya está registrado"
                Err.Raise 1000
            End If
        End If
        If p_EjercitoAlInicio Is Nothing Then
            .IDEjercito = .IDEjercitoCalculado
            m_SQL = "TbEjercitos"
        Else
            m_SQL = "SELECT * " & _
                "FROM TbEjercitos " & _
                "WHERE IDEjercito=" & .IDEjercito & ";"
        End If
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        If p_EjercitoAlInicio Is Nothing Then
            rcdDatos.AddNew
                rcdDatos.Fields("IDEjercito") = .IDEjercito
                rcdDatos.Fields("Ejercito") = .Ejercito
                If .DESCRIPCION <> "" Then
                    rcdDatos.Fields("Descripcion") = .DESCRIPCION
                End If
            rcdDatos.Update
        Else
            rcdDatos.Edit
                rcdDatos.Fields("Ejercito") = .Ejercito
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
    Set m_ObjEntorno.Ejercitos = Nothing
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EjercitoOperaciones.Registrar ha producido el error nº: " & Err.Number & _
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
    With Me.Ejercito
        If .Ejercito = "N/A" Then
            p_Error = "Es una opción Estructural que otras herramientas necesitan.No se puede borrar"
            Err.Raise 1000
        End If
        Set m_Col = constructor.getExpedientesConEjercito(.IDEjercito, p_Error)
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
            p_Error = "Ese RAC forma parte de estos expedientes " & vbNewLine & m_CadenaExpedientes
            Err.Raise 1000
        End If

        m_SQL = "DELETE * " & _
                "FROM TbEjercitos " & _
                "WHERE IDEjercito=" & .IDEjercito & ";"
        getdb().Execute m_SQL
    End With
    Set m_ObjEntorno.Ejercitos = Nothing
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EjercitoOperaciones.Eliminar ha producido el error nº: " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function


