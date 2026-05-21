VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "CPVOperaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public CPV As CPV

Public Function Registrar( _
                            Optional p_CPVAlInicio As CPV, _
                            Optional ByRef p_Error As String _
                            ) As String

    Dim m_SQL As String
    Dim rcdDatos As DAO.Recordset
    Dim m_CPV As CPV
    Dim m_Comprobar As Boolean
    
    On Error GoTo errores
    With Me.CPV
        If .CPV = "" Then
            p_Error = "Falta el campo CPV"
            Err.Raise 1000
        End If
        If Not p_CPVAlInicio Is Nothing Then
            If .CPV <> p_CPVAlInicio.CPV Then
                m_Comprobar = True
            End If
        Else
            m_Comprobar = True
        End If
        If m_Comprobar = True Then
            Set m_CPV = constructor.getCPV(p_CPV:=.CPV, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If Not m_CPV Is Nothing Then
                p_Error = "Ese nombre de CPV ya está registrado"
                Err.Raise 1000
            End If
        End If
        If p_CPVAlInicio Is Nothing Then
            .IDCPV = .IDCPVCalculado
            m_SQL = "TbCPV"
        Else
            m_SQL = "SELECT * " & _
                "FROM TbCPV " & _
                "WHERE IDCPV=" & .IDCPV & ";"
        End If
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        If p_CPVAlInicio Is Nothing Then
            rcdDatos.AddNew
                rcdDatos.Fields("IDCPV") = .IDCPV
                rcdDatos.Fields("CPV") = .CPV
                If .DESCRIPCION <> "" Then
                    rcdDatos.Fields("Descripcion") = .DESCRIPCION
                End If
            rcdDatos.Update
        Else
            rcdDatos.Edit
                rcdDatos.Fields("CPV") = .CPV
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
    Set m_ObjEntorno.CPVs = Nothing
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método CPVOperaciones.Registrar ha producido el error nº: " & Err.Number & _
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
    With Me.CPV
        If .CPV = "N/A" Then
            p_Error = "Es una opción Estructural que otras herramientas necesitan.No se puede borrar"
            Err.Raise 1000
        End If
        Set m_Col = constructor.getExpedientesConCPV(.IDCPV, p_Error)
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
            p_Error = "Ese CPV forma parte de estos expedientes " & vbNewLine & m_CadenaExpedientes
            Err.Raise 1000
        End If

        m_SQL = "DELETE * " & _
                "FROM TbCPV " & _
                "WHERE IDCPV=" & .IDCPV & ";"
        getdb().Execute m_SQL
    End With
    Set m_ObjEntorno.CPVs = Nothing
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método CPVOperaciones.Eliminar ha producido el error nº: " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function


