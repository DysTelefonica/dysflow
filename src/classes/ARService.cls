VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ARService"
Option Compare Database
Option Explicit

Private m_ARValidator As New ARValidator
Private m_CacheNCCrud As New CacheNCCrud

Public Function Alta(ByRef p_AR As ARProyecto, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    Dim blnResult As Boolean
    Dim m_Wrk As DAO.Workspace
    Dim m_HayTransaccion As Boolean
    
    On Error GoTo errores
    p_Error = ""
    Alta = False
    
    If Not m_ARValidator.ValidarAlta(p_AR, p_Error) Then
        Exit Function
    End If
    
    If p_Db Is Nothing Then
        p_Error = "ARService.Alta: Database no puede ser Nothing"
        Exit Function
    End If
    
    If Not p_Db.Transactions Then
        p_Error = "ARService.Alta: La base de datos no soporta transacciones"
        Exit Function
    End If
    
    Set m_Wrk = DBEngine.Workspaces(0)
    
    p_AR.IDAccionRealizada = p_AR.IDAccionRealizadaCalculada
    If p_AR.Error <> "" Then
        p_Error = p_AR.Error
        Exit Function
    End If
    
    If p_AR.NAccion = "" Then
        p_AR.NAccion = p_AR.AC.NAccionARCalculado
        If p_AR.Error <> "" Then
            p_Error = p_AR.Error
            Exit Function
        End If
    End If
    
    If p_AR.Responsable = "" Then
        p_AR.Responsable = p_AR.AC.Responsable
    End If
    
    p_AR.AccionRealizada = Replace(p_AR.AccionRealizada, "'", "")
    p_AR.AccionRealizada = Replace(p_AR.AccionRealizada, ";", ":")
    
    p_AR.FechaAccionRealizada = Format(Now, "mm/dd/yyyy")
    
    p_AR.Estado = p_AR.EstadoCalculadoTexto
    If p_AR.Error <> "" Then
        p_Error = p_AR.Error
        Exit Function
    End If
    
    m_Wrk.BeginTrans
    m_HayTransaccion = True
        blnResult = ARRepository.Insert(p_AR, p_Db, p_Error)
        If Not blnResult Then
            m_Wrk.Rollback
            m_HayTransaccion = False
            Exit Function
        End If
        
        ' Notificación intratransaccional de caché (RFC-001 §3.6)
        ' Si falla la cache, rollback total del CRUD
        If Not m_CacheNCCrud.NotificarCambioACAR(CLng(p_AR.AC.IDNoConformidad), p_Error) Then
            m_Wrk.Rollback
            m_HayTransaccion = False
            p_Error = "ARService.Alta: Error en cache. " & p_Error
            Alta = False
            Exit Function
        End If
    m_Wrk.CommitTrans
    m_HayTransaccion = False
    
    Alta = True
    Exit Function
    
errores:
    If m_HayTransaccion Then
        On Error Resume Next
        m_Wrk.Rollback
        On Error GoTo 0
    End If
    p_Error = "ARService.Alta: " & Err.Description
End Function

Public Function Modificar(ByRef p_AR As ARProyecto, ByRef p_AR_Original As ARProyecto, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    Dim blnResult As Boolean
    Dim m_Wrk As DAO.Workspace
    Dim m_HayTransaccion As Boolean
    
    On Error GoTo errores
    p_Error = ""
    Modificar = False
    
    If Not m_ARValidator.ValidarEdicion(p_AR, p_Error) Then
        Exit Function
    End If
    
    If p_Db Is Nothing Then
        p_Error = "ARService.Modificar: Database no puede ser Nothing"
        Exit Function
    End If
    
    If Not p_Db.Transactions Then
        p_Error = "ARService.Modificar: La base de datos no soporta transacciones"
        Exit Function
    End If
    
    Set m_Wrk = DBEngine.Workspaces(0)
    
    p_AR.AccionRealizada = Replace(p_AR.AccionRealizada, "'", "")
    p_AR.AccionRealizada = Replace(p_AR.AccionRealizada, ";", ":")
    
    p_AR.Estado = p_AR.EstadoCalculadoTexto
    If p_AR.Error <> "" Then
        p_Error = p_AR.Error
        Exit Function
    End If
    
    m_Wrk.BeginTrans
    m_HayTransaccion = True
        blnResult = ARRepository.Update(p_AR, p_Db, p_Error)
        If Not blnResult Then
            m_Wrk.Rollback
            m_HayTransaccion = False
            Exit Function
        End If
        
        ' Notificación intratransaccional de caché (RFC-001 §3.6)
        ' Si falla la cache, rollback total del CRUD
        If Not m_CacheNCCrud.NotificarCambioACAR(CLng(p_AR.AC.IDNoConformidad), p_Error) Then
            m_Wrk.Rollback
            m_HayTransaccion = False
            p_Error = "ARService.Modificar: Error en cache. " & p_Error
            Modificar = False
            Exit Function
        End If
    m_Wrk.CommitTrans
    m_HayTransaccion = False
    
    Modificar = True
    Exit Function
    
errores:
    If m_HayTransaccion Then
        On Error Resume Next
        m_Wrk.Rollback
        On Error GoTo 0
    End If
    p_Error = "ARService.Modificar: " & Err.Description
End Function

Public Function Eliminar(ByVal p_IDAR As String, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    Dim m_AR As ARProyecto
    Dim blnResult As Boolean
    Dim m_Wrk As DAO.Workspace
    Dim m_HayTransaccion As Boolean
    
    On Error GoTo errores
    p_Error = ""
    Eliminar = False
    
    If p_Db Is Nothing Then
        p_Error = "ARService.Eliminar: Database no puede ser Nothing"
        Exit Function
    End If
    
    If Not p_Db.Transactions Then
        p_Error = "ARService.Eliminar: La base de datos no soporta transacciones"
        Exit Function
    End If
    
    Set m_Wrk = DBEngine.Workspaces(0)
    
    Set m_AR = ARRepository.GetById(p_IDAR, p_Db, p_Error)
    If p_Error <> "" Then
        Exit Function
    End If
    If m_AR Is Nothing Then
        p_Error = "No se encontró la AR con ID: " & p_IDAR
        Exit Function
    End If
    
    m_Wrk.BeginTrans
    m_HayTransaccion = True
        blnResult = ARRepository.Delete(p_IDAR, p_Db, p_Error)
        If Not blnResult Then
            m_Wrk.Rollback
            m_HayTransaccion = False
            Exit Function
        End If
        
        ' Notificación intratransaccional de caché (RFC-001 §3.6)
        ' Si falla la cache, rollback total del CRUD
        If Not m_CacheNCCrud.NotificarCambioACAR(CLng(m_AR.AC.IDNoConformidad), p_Error) Then
            m_Wrk.Rollback
            m_HayTransaccion = False
            p_Error = "ARService.Eliminar: Error en cache. " & p_Error
            Eliminar = False
            Exit Function
        End If
    m_Wrk.CommitTrans
    m_HayTransaccion = False
    
    Eliminar = True
    Exit Function
    
errores:
    If m_HayTransaccion Then
        On Error Resume Next
        m_Wrk.Rollback
        On Error GoTo 0
    End If
    p_Error = "ARService.Eliminar: " & Err.Description
End Function

Public Function GetById(ByVal p_IDAR As String, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As ARProyecto
    On Error GoTo errores
    p_Error = ""
    
    Set GetById = ARRepository.GetById(p_IDAR, p_Db, p_Error)
    Exit Function
    
errores:
    p_Error = "ARService.GetById: " & Err.Description
    Set GetById = Nothing
End Function

Public Function GetByIdAC(ByVal p_IDAC As String, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As Collection
    On Error GoTo errores
    p_Error = ""
    
    Set GetByIdAC = ARRepository.GetByIdAC(p_IDAC, p_Db, p_Error)
    Exit Function
    
errores:
    p_Error = "ARService.GetByIdAC: " & Err.Description
    Set GetByIdAC = New Collection
End Function