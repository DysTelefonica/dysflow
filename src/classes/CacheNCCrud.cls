VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "CacheNCCrud"
Option Compare Database
Option Explicit

Public Function NotificarAltaNC(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
    Dim blnResultado As Boolean
    Dim m_CacheService As New CacheNCService
    
    On Error GoTo errores
    p_Error = ""
    NotificarAltaNC = False
    
    If Not IsCacheEnabled() Then
        NotificarAltaNC = True
        Exit Function
    End If
    
    blnResultado = m_CacheService.NotificarAltaNC_Impl(p_IDNC, p_Error)
    
    NotificarAltaNC = blnResultado
    Exit Function
    
errores:
    p_Error = "CacheNCCrud.NotificarAltaNC: " & Err.Description
End Function

Public Function NotificarModificacionNC(ByVal p_IDNC As Long, ByRef p_Campos As Collection, Optional ByRef p_Error As String) As Boolean
    Dim blnResultado As Boolean
    Dim m_CacheService As New CacheNCService
    
    On Error GoTo errores
    p_Error = ""
    NotificarModificacionNC = False
    
    If Not IsCacheEnabled() Then
        NotificarModificacionNC = True
        Exit Function
    End If
    
    If p_Campos Is Nothing Then
        blnResultado = m_CacheService.NotificarCambioNC(p_IDNC, Campo_DatosNC, p_Error)
    Else
        blnResultado = m_CacheService.NotificarCambioMultiCampo(p_IDNC, p_Campos, p_Error)
    End If
    
    NotificarModificacionNC = blnResultado
    Exit Function
    
errores:
    p_Error = "CacheNCCrud.NotificarModificacionNC: " & Err.Description
End Function

Public Function NotificarEliminacionNC(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
    Dim blnResultado As Boolean
    Dim m_CacheService As New CacheNCService
    
    On Error GoTo errores
    p_Error = ""
    NotificarEliminacionNC = False
    
    If Not IsCacheEnabled() Then
        NotificarEliminacionNC = True
        Exit Function
    End If
    
    blnResultado = m_CacheService.NotificarEliminacionNC_Impl(p_IDNC, p_Error)
    
    NotificarEliminacionNC = blnResultado
    Exit Function
    
errores:
    p_Error = "CacheNCCrud.NotificarEliminacionNC: " & Err.Description
End Function

Public Function NotificarCambioACAR(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
    ' NotificarCambioACAR ahora usa InvalidateCascada para marcar en lugar de rebuild.
    ' Esto resuelve la cascada AR→AC→NC y marca CacheValida=False en detalle/listado.
    ' La regeneracion es lazy: se reconstruye en el siguiente acceso.
    ' Spec-008 §4.3: InvalidateCascada("NC", p_IDNC) equivale a la invalidacion
    ' de los campos DatosACs y DatosNC de la NC padre sin rebuild inmediato.
    
    On Error GoTo errores
    p_Error = ""
    NotificarCambioACAR = False
    
    If Not IsCacheEnabled() Then
        NotificarCambioACAR = True
        Exit Function
    End If
    
    NotificarCambioACAR = CacheNCProyecto.InvalidateCascada("NC", p_IDNC, p_Error)
    
    Exit Function
    
errores:
    p_Error = "CacheNCCrud.NotificarCambioACAR: " & Err.Description
End Function

Public Function NotificarCambioDocumentos(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
    Dim blnResultado As Boolean
    Dim m_Campos As New Collection
    Dim m_CacheService As New CacheNCService
    
    On Error GoTo errores
    p_Error = ""
    NotificarCambioDocumentos = False
    
    If Not IsCacheEnabled() Then
        NotificarCambioDocumentos = True
        Exit Function
    End If
    
    m_Campos.Add Campo_DatosDocumentos
    m_Campos.Add Campo_DatosNC
    
    blnResultado = m_CacheService.NotificarCambioMultiCampo(p_IDNC, m_Campos, p_Error)
    
    NotificarCambioDocumentos = blnResultado
    Exit Function
    
errores:
    p_Error = "CacheNCCrud.NotificarCambioDocumentos: " & Err.Description
End Function

Public Function NotificarCambioRiesgos(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
    Dim blnResultado As Boolean
    Dim m_Campos As New Collection
    Dim m_CacheService As New CacheNCService
    
    On Error GoTo errores
    p_Error = ""
    NotificarCambioRiesgos = False
    
    If Not IsCacheEnabled() Then
        NotificarCambioRiesgos = True
        Exit Function
    End If
    
    m_Campos.Add Campo_DatosRiesgos
    m_Campos.Add Campo_DatosNC
    
    blnResultado = m_CacheService.NotificarCambioMultiCampo(p_IDNC, m_Campos, p_Error)
    
    NotificarCambioRiesgos = blnResultado
    Exit Function
    
errores:
    p_Error = "CacheNCCrud.NotificarCambioRiesgos: " & Err.Description
End Function

Public Function NotificarCambioReplanificaciones(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
    Dim blnResultado As Boolean
    Dim m_CacheService As New CacheNCService
    
    On Error GoTo errores
    p_Error = ""
    NotificarCambioReplanificaciones = False
    
    If Not IsCacheEnabled() Then
        NotificarCambioReplanificaciones = True
        Exit Function
    End If
    
    blnResultado = m_CacheService.NotificarCambioNC(p_IDNC, Campo_DatosReplanificaciones, p_Error)
    
    NotificarCambioReplanificaciones = blnResultado
    Exit Function
    
errores:
    p_Error = "CacheNCCrud.NotificarCambioReplanificaciones: " & Err.Description
End Function

Public Function NotificarCierreNC(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
    Dim blnResultado As Boolean
    Dim m_Campos As New Collection
    Dim m_CacheService As New CacheNCService
    
    On Error GoTo errores
    p_Error = ""
    NotificarCierreNC = False
    
    If Not IsCacheEnabled() Then
        NotificarCierreNC = True
        Exit Function
    End If
    
    m_Campos.Add Campo_DatosNC
    m_Campos.Add Campo_Cerrado
    
    blnResultado = m_CacheService.NotificarCambioMultiCampo(p_IDNC, m_Campos, p_Error)
    
    NotificarCierreNC = blnResultado
    Exit Function
    
errores:
    p_Error = "CacheNCCrud.NotificarCierreNC: " & Err.Description
End Function