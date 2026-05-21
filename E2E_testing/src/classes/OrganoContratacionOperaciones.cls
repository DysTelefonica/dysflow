VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "OrganoContratacionOperaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public OrganoContratacion As OrganoContratacion

Public Function Registrar( _
                            Optional p_OrganoContratacionAlInicio As OrganoContratacion, _
                            Optional ByRef p_Error As String _
                            ) As String

    Dim m_SQL As String
    Dim rcdDatos As DAO.Recordset
    Dim m_OrganoContratacion As OrganoContratacion
    Dim m_Comprobar As Boolean
    
    On Error GoTo errores
    With Me.OrganoContratacion
        If .OrganoContratacion = "" Then
            p_Error = "Falta el campo OrganoContratacion"
            Err.Raise 1000
        End If
        If Not p_OrganoContratacionAlInicio Is Nothing Then
            If .OrganoContratacion <> p_OrganoContratacionAlInicio.OrganoContratacion Then
                m_Comprobar = True
            End If
        Else
            m_Comprobar = True
        End If
        If m_Comprobar = True Then
            Set m_OrganoContratacion = constructor.getOrganoContratacion(p_OrganoContratacion:=.OrganoContratacion, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If Not m_OrganoContratacion Is Nothing Then
                p_Error = "Ese nombre de OrganoContratacion ya está registrado"
                Err.Raise 1000
            End If
        End If
        If p_OrganoContratacionAlInicio Is Nothing Then
            .IDOrganoContratacion = .IDOrganoContratacionCalculado
            m_SQL = "TbOrganosContratacion"
        Else
            m_SQL = "SELECT * " & _
                "FROM TbOrganosContratacion " & _
                "WHERE IDOrganoContratacion=" & .IDOrganoContratacion & ";"
        End If
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        If p_OrganoContratacionAlInicio Is Nothing Then
            rcdDatos.AddNew
                rcdDatos.Fields("IDOrganoContratacion") = .IDOrganoContratacion
                rcdDatos.Fields("OrganoContratacion") = .OrganoContratacion
                If .DESCRIPCION <> "" Then
                    rcdDatos.Fields("Descripcion") = .DESCRIPCION
                End If
            rcdDatos.Update
        Else
            rcdDatos.Edit
                rcdDatos.Fields("OrganoContratacion") = .OrganoContratacion
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
    Set m_ObjEntorno.ColOrganosContrataciones = Nothing
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método OrganoContratacionOperaciones.Registrar ha producido el error nº: " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If
    
End Function

Public Function Eliminar(Optional ByRef p_Error As String) As String
    
    Dim m_SQL As String
    
    On Error GoTo errores
    With Me.OrganoContratacion
        If .OrganoContratacion = "N/A" Then
            p_Error = "Es una opción Estructural que otras herramientas necesitan.No se puede borrar"
            Err.Raise 1000
        End If
        If Not m_ObjEntorno.ColOrganoContratacioneSEnExpedientes Is Nothing Then
            If m_ObjEntorno.ColOrganoContratacioneSEnExpedientes.exists(CStr(.IDOrganoContratacion)) Then
                p_Error = "Al menos un expediente usa este OrganoContratacion"
                Err.Raise 1000
            End If
        End If
        m_SQL = "DELETE * " & _
                "FROM TbOrganosContratacion " & _
                "WHERE IDOrganoContratacion=" & .IDOrganoContratacion & ";"
        getdb().Execute m_SQL
    End With
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método OrganoContratacionOperaciones.Eliminar ha producido el error nº: " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function



