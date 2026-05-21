VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "RACOperaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public RAC As RAC

Public Function Registrar( _
                            Optional p_RACAlInicio As RAC, _
                            Optional ByRef p_Error As String _
                            ) As String

    Dim m_SQL As String
    Dim rcdDatos As DAO.Recordset
    Dim m_RAC As RAC
    Dim m_Comprobar As Boolean
    On Error GoTo errores
   
    With Me.RAC
        If .RAC = "" Then
            p_Error = "Falta el campo RAC"
            Err.Raise 1000
        End If
        If Not p_RACAlInicio Is Nothing Then
            If .RAC <> p_RACAlInicio.RAC Then
                m_Comprobar = True
            End If
        Else
            m_Comprobar = True
        End If
        If m_Comprobar = True Then
            Set m_RAC = constructor.getRAC(p_RAC:=.RAC, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If Not m_RAC Is Nothing Then
                p_Error = "Ese nombre de RAC ya está registrado"
                Err.Raise 1000
            End If
        End If
        If p_RACAlInicio Is Nothing Then
            .IDRAC = .IDRACCalculado
            m_SQL = "TbRACS"
        Else
            m_SQL = "SELECT * " & _
                "FROM TbRACS " & _
                "WHERE IDRAC=" & .IDRAC & ";"
        End If
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        If p_RACAlInicio Is Nothing Then
            rcdDatos.AddNew
                rcdDatos.Fields("IDRAC") = .IDRAC
                rcdDatos.Fields("RAC") = .RAC
                If .CORREO <> "" Then
                    rcdDatos.Fields("CORREO") = .CORREO
                End If
                If .DESCRIPCION <> "" Then
                    rcdDatos.Fields("Descripcion") = .DESCRIPCION
                End If
            rcdDatos.Update
        Else
            rcdDatos.Edit
                rcdDatos.Fields("RAC") = .RAC
                If .CORREO <> "" Then
                    rcdDatos.Fields("CORREO") = .CORREO
                Else
                    rcdDatos.Fields("CORREO") = Null
                End If
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
    Set m_ObjEntorno.RACs = Nothing
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RACOperaciones.Registrar ha producido el error nº: " & Err.Number & _
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
    
    With Me.RAC
        If .RAC = "N/A" Then
            p_Error = "Es una opción Estructural que otras herramientas necesitan.No se puede borrar"
            Err.Raise 1000
        End If
        Set m_Col = constructor.getExpedientesConRAC(.IDRAC, p_Error)
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
                "FROM TbRACS " & _
                "WHERE IDRAC=" & .IDRAC & ";"
        getdb().Execute m_SQL
    End With
    Set m_ObjEntorno.RACs = Nothing
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RACOperaciones.Eliminar ha producido el error nº: " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function


