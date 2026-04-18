VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ACService"
Option Compare Database
Option Explicit

Private m_ACValidator As New ACValidator
Private m_CacheNCCrud As New CacheNCCrud

Public Function Alta(ByRef p_AC As ACProyecto, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    Dim blnResult As Boolean
    Dim m_Wrk As DAO.Workspace
    Dim m_HayTransaccion As Boolean
    
    On Error GoTo errores
    p_Error = ""
    Alta = False
    
    If Not m_ACValidator.ValidarAlta(p_AC, p_Error) Then
        Exit Function
    End If
    
    If p_Db Is Nothing Then
        p_Error = "ACService.Alta: Database no puede ser Nothing"
        Exit Function
    End If
    
    If Not p_Db.Transactions Then
        p_Error = "ACService.Alta: La base de datos no soporta transacciones"
        Exit Function
    End If
    
    Set m_Wrk = DBEngine.Workspaces(0)
    
    p_AC.IdAccionCorrectiva = p_AC.IDAccionCorrectivaCalculada
    p_Error = p_AC.Error
    If p_Error <> "" Then
        Exit Function
    End If
    
    If p_AC.NAccion = "" Then
        p_AC.NAccion = p_AC.nc.NAccionCalculado
        p_Error = p_AC.nc.Error
        If p_Error <> "" Then
            Exit Function
        End If
    End If
    
    m_Wrk.BeginTrans
    m_HayTransaccion = True
        p_AC.AccionCorrectiva = Replace(p_AC.AccionCorrectiva, "'", "")
        p_AC.AccionCorrectiva = Replace(p_AC.AccionCorrectiva, ";", ":")
        
        blnResult = ACRepository.Insert(p_AC, p_Db, p_Error)
        If Not blnResult Then
            m_Wrk.Rollback
            m_HayTransaccion = False
            Exit Function
        End If
        
        ' Notificación intratransaccional de caché (RFC-001 §3.6)
        ' Si falla la cache, rollback total del CRUD
        If Not m_CacheNCCrud.NotificarCambioACAR(CLng(p_AC.IDNoConformidad), p_Error) Then
            m_Wrk.Rollback
            m_HayTransaccion = False
            p_Error = "ACService.Alta: Error en cache. " & p_Error
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
    p_Error = "ACService.Alta: " & Err.Description
End Function

Public Function Modificar(ByRef p_AC As ACProyecto, ByRef p_AC_Original As ACProyecto, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    Dim blnResult As Boolean
    Dim m_Wrk As DAO.Workspace
    Dim m_HayTransaccion As Boolean
    
    On Error GoTo errores
    p_Error = ""
    Modificar = False
    
    If Not m_ACValidator.ValidarEdicion(p_AC, p_Error) Then
        Exit Function
    End If
    
    If p_Db Is Nothing Then
        p_Error = "ACService.Modificar: Database no puede ser Nothing"
        Exit Function
    End If
    
    If Not p_Db.Transactions Then
        p_Error = "ACService.Modificar: La base de datos no soporta transacciones"
        Exit Function
    End If
    
    Set m_Wrk = DBEngine.Workspaces(0)
    
    p_AC.AccionCorrectiva = Replace(p_AC.AccionCorrectiva, "'", "")
    p_AC.AccionCorrectiva = Replace(p_AC.AccionCorrectiva, ";", ":")
    
    m_Wrk.BeginTrans
    m_HayTransaccion = True
        blnResult = ACRepository.Update(p_AC, p_Db, p_Error)
        If Not blnResult Then
            m_Wrk.Rollback
            m_HayTransaccion = False
            Exit Function
        End If
        
        ' Notificación intratransaccional de caché (RFC-001 §3.6)
        ' Si falla la cache, rollback total del CRUD
        If Not m_CacheNCCrud.NotificarCambioACAR(CLng(p_AC.IDNoConformidad), p_Error) Then
            m_Wrk.Rollback
            m_HayTransaccion = False
            p_Error = "ACService.Modificar: Error en cache. " & p_Error
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
    p_Error = "ACService.Modificar: " & Err.Description
End Function

Public Function Eliminar(ByVal p_IDAC As String, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    Dim m_AC As ACProyecto
    Dim m_ARs As Scripting.Dictionary
    Dim blnResult As Boolean
    Dim m_Wrk As DAO.Workspace
    Dim m_HayTransaccion As Boolean
    
    On Error GoTo errores
    p_Error = ""
    Eliminar = False
    
    If p_Db Is Nothing Then
        p_Error = "ACService.Eliminar: Database no puede ser Nothing"
        Exit Function
    End If
    
    If Not p_Db.Transactions Then
        p_Error = "ACService.Eliminar: La base de datos no soporta transacciones"
        Exit Function
    End If
    
    Set m_Wrk = DBEngine.Workspaces(0)
    
    Set m_AC = ACRepository.GetById(p_IDAC, p_Db, p_Error)
    If p_Error <> "" Then
        Exit Function
    End If
    If m_AC Is Nothing Then
        p_Error = "No se encontró la AC con ID: " & p_IDAC
        Exit Function
    End If
    
    On Error Resume Next
    Set m_ARs = m_AC.ARs
    If Err.Number <> 0 Then
        On Error GoTo errores
        Err.Raise 1000
    End If
    On Error GoTo errores
    
    If Not m_ARs Is Nothing Then
        If m_ARs.Count > 0 Then
            p_Error = "No se puede eliminar la AC porque tiene ARs asociados. Elimine primero los ARs."
            Exit Function
        End If
    End If
    
    m_Wrk.BeginTrans
    m_HayTransaccion = True
        blnResult = ACRepository.Delete(p_IDAC, p_Db, p_Error)
        If Not blnResult Then
            m_Wrk.Rollback
            m_HayTransaccion = False
            Exit Function
        End If
        
        ' Notificación intratransaccional de caché (RFC-001 §3.6)
        ' Si falla la cache, rollback total del CRUD
        If Not m_CacheNCCrud.NotificarCambioACAR(CLng(m_AC.IDNoConformidad), p_Error) Then
            m_Wrk.Rollback
            m_HayTransaccion = False
            p_Error = "ACService.Eliminar: Error en cache. " & p_Error
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
    p_Error = "ACService.Eliminar: " & Err.Description
End Function

Public Function GetById(ByVal p_IDAC As String, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As ACProyecto
    On Error GoTo errores
    p_Error = ""
    
    Set GetById = ACRepository.GetById(p_IDAC, p_Db, p_Error)
    Exit Function
    
errores:
    p_Error = "ACService.GetById: " & Err.Description
    Set GetById = Nothing
End Function

Public Function GetByIdNC(ByVal p_IDNC As String, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As Collection
    On Error GoTo errores
    p_Error = ""
    
    Set GetByIdNC = ACRepository.GetByIdNC(p_IDNC, p_Db, p_Error)
    Exit Function
    
errores:
    p_Error = "ACService.GetByIdNC: " & Err.Description
    Set GetByIdNC = New Collection
End Function