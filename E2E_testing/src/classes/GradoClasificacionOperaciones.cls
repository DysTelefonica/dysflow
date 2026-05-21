VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "GradoClasificacionOperaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public GradoClasificacion As GradoClasificacion

Public Function Registrar( _
                            Optional p_GradoClasificacionAlInicio As GradoClasificacion, _
                            Optional ByRef p_Error As String _
                            ) As String

    Dim m_SQL As String
    Dim rcdDatos As DAO.Recordset
    Dim m_GradoClasificacion As GradoClasificacion
    Dim m_Comprobar As Boolean
    
    On Error GoTo errores
    With Me.GradoClasificacion
        If .GradoClasificacion = "" Then
            p_Error = "Falta el campo GradoClasificacion"
            Err.Raise 1000
        End If
        If Not p_GradoClasificacionAlInicio Is Nothing Then
            If .GradoClasificacion <> p_GradoClasificacionAlInicio.GradoClasificacion Then
                m_Comprobar = True
            End If
        Else
            m_Comprobar = True
        End If
        If m_Comprobar = True Then
            Set m_GradoClasificacion = constructor.getGradoClasificacion(p_GradoClasificacion:=.GradoClasificacion, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If Not m_GradoClasificacion Is Nothing Then
                p_Error = "Ese nombre de GradoClasificacion ya está registrado"
                Err.Raise 1000
            End If
        End If
        If p_GradoClasificacionAlInicio Is Nothing Then
            .IdGradoClasificacion = .IdGradoClasificacionCalculado
            m_SQL = "TbGradosClasificacion"
        Else
            m_SQL = "SELECT * " & _
                "FROM TbGradosClasificacion " & _
                "WHERE IDGradoClasificacion=" & .IdGradoClasificacion & ";"
        End If
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        If p_GradoClasificacionAlInicio Is Nothing Then
            rcdDatos.AddNew
                rcdDatos.Fields("IDGradoClasificacion") = .IdGradoClasificacion
                rcdDatos.Fields("GradoClasificacion") = .GradoClasificacion
                If .DESCRIPCION <> "" Then
                    rcdDatos.Fields("Descripcion") = .DESCRIPCION
                End If
            rcdDatos.Update
        Else
            rcdDatos.Edit
                rcdDatos.Fields("GradoClasificacion") = .GradoClasificacion
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
    Set m_ObjEntorno.GradosClasificaciones = Nothing
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método GradoClasificacionOperaciones.Registrar ha producido el error nº: " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If
    
End Function


Public Function Eliminar(Optional ByRef p_Error As String) As String
    
    Dim m_SQL As String
    
    On Error GoTo errores
    With Me.GradoClasificacion
        If .GradoClasificacion = "N/A" Then
            p_Error = "Es una opción Estructural que otras herramientas necesitan.No se puede borrar"
            Err.Raise 1000
        End If
        If Not m_ObjEntorno.ColGradosClasificacionesEnExpedientes Is Nothing Then
            If m_ObjEntorno.ColGradosClasificacionesEnExpedientes.exists(CStr(.IdGradoClasificacion)) Then
                p_Error = "Al menos un expediente usa este grado de clasificación"
                Err.Raise 1000
            End If
        End If
        m_SQL = "DELETE * " & _
                "FROM TbGradosClasificacion " & _
                "WHERE IdGradoClasificacion=" & .IdGradoClasificacion & ";"
        getdb().Execute m_SQL
    End With
    Set m_ObjEntorno.GradosClasificaciones = Nothing
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método GradoClasificacionOperaciones.Eliminar ha producido el error nº: " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If
End Function


