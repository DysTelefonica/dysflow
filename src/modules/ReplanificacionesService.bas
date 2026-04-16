Option Compare Database
Option Explicit

Public Function Registrar(ByRef p_Replanificacion As ReplanificacionesProyecto, Optional ByRef p_Error As String) As Boolean
    Dim m_Op As ReplanificacionesProyectoOperaciones
    Dim m_Result As String
    
    On Error GoTo errores
    p_Error = ""
    Registrar = False
    
    If p_Replanificacion Is Nothing Then
        p_Error = "ReplanificacionesService.Registrar: Replanificacion no puede ser Nothing"
        Exit Function
    End If
    
    Set m_Op = New ReplanificacionesProyectoOperaciones
    Set m_Op.ReplanificacionesProyecto = p_Replanificacion
    
    m_Result = m_Op.Registrar(p_Error)
    If p_Error <> "" Then
        Exit Function
    End If
    
    If Not p_Replanificacion.nc Is Nothing Then
        If Not CacheNCCrud.NotificarCambioReplanificaciones(CLng(p_Replanificacion.nc.IDNoConformidad), p_Error) Then
            Exit Function
        End If
    End If
    
    Registrar = True
    Exit Function
    
errores:
    p_Error = "ReplanificacionesService.Registrar: " & Err.Description
End Function

Public Function Eliminar(ByRef p_Replanificacion As ReplanificacionesProyecto, Optional ByRef p_Error As String) As Boolean
    Dim m_Op As ReplanificacionesProyectoOperaciones
    Dim m_Result As String
    
    On Error GoTo errores
    p_Error = ""
    Eliminar = False
    
    If p_Replanificacion Is Nothing Then
        p_Error = "ReplanificacionesService.Eliminar: Replanificacion no puede ser Nothing"
        Exit Function
    End If
    
    Set m_Op = New ReplanificacionesProyectoOperaciones
    Set m_Op.ReplanificacionesProyecto = p_Replanificacion
    
    m_Result = m_Op.Eliminar(p_Error)
    If p_Error <> "" Then
        Exit Function
    End If
    
    If Not p_Replanificacion.nc Is Nothing Then
        If Not CacheNCCrud.NotificarCambioReplanificaciones(CLng(p_Replanificacion.nc.IDNoConformidad), p_Error) Then
            Exit Function
        End If
    End If
    
    Eliminar = True
    Exit Function
    
errores:
    p_Error = "ReplanificacionesService.Eliminar: " & Err.Description
End Function
