Option Compare Database
Option Explicit

Public Function NotificarCambioNC(ByVal p_IDNC As Long, ByVal p_Campo As EnumCampoCache, Optional ByRef p_Error As String) As Boolean
    Dim blnResultado As Boolean
    Dim m_Wrk As DAO.Workspace
    Dim m_HayTransaccion As Boolean
    
    On Error GoTo errores
    p_Error = ""
    NotificarCambioNC = False
    m_HayTransaccion = False
    
    Set m_Wrk = DBEngine.Workspaces(0)
    
    m_Wrk.BeginTrans
    m_HayTransaccion = True
    
    blnResultado = CacheNCProyecto.GenerarCacheCompleto(CStr(p_IDNC), p_Error)
    If Not blnResultado Then
        m_Wrk.Rollback
        m_HayTransaccion = False
        Exit Function
    End If
    
    blnResultado = CacheNCCacheRepositorio.UpsertListado(p_IDNC, p_Error)
    If Not blnResultado Then
        m_Wrk.Rollback
        m_HayTransaccion = False
        Exit Function
    End If
    
    m_Wrk.CommitTrans
    m_HayTransaccion = False
    
    NotificarCambioNC = True
    Exit Function
    
errores:
    If m_HayTransaccion Then
        On Error Resume Next
        m_Wrk.Rollback
        On Error GoTo 0
    End If
    p_Error = "CacheNCService.NotificarCambioNC: " & Err.Description
End Function

Public Function NotificarCambioMultiCampo(ByVal p_IDNC As Long, ByRef p_Campos As Collection, Optional ByRef p_Error As String) As Boolean
    Dim blnResultado As Boolean
    Dim m_Wrk As DAO.Workspace
    Dim m_HayTransaccion As Boolean
    
    On Error GoTo errores
    p_Error = ""
    NotificarCambioMultiCampo = False
    m_HayTransaccion = False
    
    If p_Campos Is Nothing Then
        p_Error = "La coleccion de campos no puede ser Nothing"
        Exit Function
    End If
    
    If p_Campos.Count = 0 Then
        p_Error = "La coleccion de campos no puede estar vacia"
        Exit Function
    End If
    
    Set m_Wrk = DBEngine.Workspaces(0)
    
    m_Wrk.BeginTrans
    m_HayTransaccion = True
    
    blnResultado = CacheNCProyecto.GenerarCacheCompleto(CStr(p_IDNC), p_Error)
    If Not blnResultado Then
        m_Wrk.Rollback
        m_HayTransaccion = False
        Exit Function
    End If
    
    blnResultado = CacheNCCacheRepositorio.UpsertListado(p_IDNC, p_Error)
    If Not blnResultado Then
        m_Wrk.Rollback
        m_HayTransaccion = False
        Exit Function
    End If
    
    m_Wrk.CommitTrans
    m_HayTransaccion = False
    
    NotificarCambioMultiCampo = True
    Exit Function
    
errores:
    If m_HayTransaccion Then
        On Error Resume Next
        m_Wrk.Rollback
        On Error GoTo 0
    End If
    p_Error = "CacheNCService.NotificarCambioMultiCampo: " & Err.Description
End Function

Public Function NotificarEliminacionNC_Impl(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
    Dim blnResultado As Boolean
    Dim m_Wrk As DAO.Workspace
    Dim m_HayTransaccion As Boolean
    
    On Error GoTo errores
    p_Error = ""
    NotificarEliminacionNC_Impl = False
    m_HayTransaccion = False
    
    Set m_Wrk = DBEngine.Workspaces(0)
    
    m_Wrk.BeginTrans
    m_HayTransaccion = True
    
    blnResultado = CacheNCCacheRepositorio.EliminarDetalle(p_IDNC, p_Error)
    If Not blnResultado Then
        m_Wrk.Rollback
        m_HayTransaccion = False
        Exit Function
    End If
    
    blnResultado = CacheNCCacheRepositorio.EliminarListado(p_IDNC, p_Error)
    If Not blnResultado Then
        m_Wrk.Rollback
        m_HayTransaccion = False
        Exit Function
    End If
    
    m_Wrk.CommitTrans
    m_HayTransaccion = False
    
    NotificarEliminacionNC_Impl = True
    Exit Function
    
errores:
    If m_HayTransaccion Then
        On Error Resume Next
        m_Wrk.Rollback
        On Error GoTo 0
    End If
    p_Error = "CacheNCService.NotificarEliminacionNC_Impl: " & Err.Description
End Function

Public Function NotificarAltaNC_Impl(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
    Dim blnResultado As Boolean
    Dim m_Wrk As DAO.Workspace
    Dim m_HayTransaccion As Boolean
    
    On Error GoTo errores
    p_Error = ""
    NotificarAltaNC_Impl = False
    m_HayTransaccion = False
    
    Set m_Wrk = DBEngine.Workspaces(0)
    
    m_Wrk.BeginTrans
    m_HayTransaccion = True
    
    blnResultado = CacheNCProyecto.GenerarCacheCompleto(CStr(p_IDNC), p_Error)
    If Not blnResultado Then
        m_Wrk.Rollback
        m_HayTransaccion = False
        Exit Function
    End If
    
    blnResultado = CacheNCCacheRepositorio.UpsertListado(p_IDNC, p_Error)
    If Not blnResultado Then
        m_Wrk.Rollback
        m_HayTransaccion = False
        Exit Function
    End If
    
    m_Wrk.CommitTrans
    m_HayTransaccion = False
    
    NotificarAltaNC_Impl = True
    Exit Function
    
errores:
    If m_HayTransaccion Then
        On Error Resume Next
        m_Wrk.Rollback
        On Error GoTo 0
    End If
    p_Error = "CacheNCService.NotificarAltaNC_Impl: " & Err.Description
End Function

Public Function SincronizarCacheNC(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
    Dim blnResultado As Boolean
    Dim m_Wrk As DAO.Workspace
    Dim m_HayTransaccion As Boolean
    
    On Error GoTo errores
    p_Error = ""
    SincronizarCacheNC = False
    m_HayTransaccion = False
    
    Set m_Wrk = DBEngine.Workspaces(0)
    
    m_Wrk.BeginTrans
    m_HayTransaccion = True
    
    blnResultado = CacheNCProyecto.GenerarCacheCompleto(CStr(p_IDNC), p_Error)
    If Not blnResultado Then
        m_Wrk.Rollback
        m_HayTransaccion = False
        Exit Function
    End If
    
    blnResultado = CacheNCCacheRepositorio.UpsertListado(p_IDNC, p_Error)
    If Not blnResultado Then
        m_Wrk.Rollback
        m_HayTransaccion = False
        Exit Function
    End If
    
    m_Wrk.CommitTrans
    m_HayTransaccion = False
    
    SincronizarCacheNC = True
    Exit Function
    
errores:
    If m_HayTransaccion Then
        On Error Resume Next
        m_Wrk.Rollback
        On Error GoTo 0
    End If
    p_Error = "CacheNCService.SincronizarCacheNC: " & Err.Description
End Function