VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "NCService"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public Function Alta(ByRef p_NC As ncProyecto, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    Dim blnResult As Boolean
    Dim m_Wrk As DAO.Workspace
    Dim m_HayTransaccion As Boolean
    Dim m_Validator As New NCValidator
    
    On Error GoTo errores
    p_Error = ""
    Alta = False
    
    If Not m_Validator.ValidarAlta(p_NC, p_Error) Then
        Exit Function
    End If

    If p_Db Is Nothing Then
        p_Error = "NCService.Alta: Database no puede ser Nothing"
        Exit Function
    End If

    If Not p_Db.Transactions Then
        p_Error = "NCService.Alta: La base de datos no soporta transacciones"
        Exit Function
    End If

    Set m_Wrk = DBEngine.Workspaces(0)
    
    p_NC.IDNoConformidad = p_NC.IDNoConformidadCalculado
    p_Error = p_NC.Error
    If p_Error <> "" Then
        Exit Function
    End If
    
    p_NC.CodigoNoConformidad = p_NC.CodigoNoConformidadCalculado
    p_Error = p_NC.Error
    If p_Error <> "" Then
        Exit Function
    End If
    
    m_Wrk.BeginTrans
    m_HayTransaccion = True
        blnResult = NCRepository.Insert(p_NC, p_Db, p_Error)
        If Not blnResult Then
            m_Wrk.Rollback
            m_HayTransaccion = False
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
    p_Error = "NCService.Alta: " & Err.Description
End Function

Public Function Modificar(ByRef p_NC As ncProyecto, ByRef p_NC_Original As ncProyecto, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String, Optional ByVal p_Wrk As DAO.Workspace) As Boolean
    Dim blnResult As Boolean
    Dim m_Wrk As DAO.Workspace
    Dim m_HayTransaccion As Boolean
    Dim m_Validator As New NCValidator
    
    On Error GoTo errores
    p_Error = ""
    Modificar = False
    
    If Not m_Validator.ValidarEdicion(p_NC, p_Error) Then
        Exit Function
    End If

    If p_Db Is Nothing Then
        p_Error = "NCService.Modificar: Database no puede ser Nothing"
        Exit Function
    End If

    If Not p_Db.Transactions Then
        p_Error = "NCService.Modificar: La base de datos no soporta transacciones"
        Exit Function
    End If

    ' Usar workspace proporcionado o crear nuevo
    If Not p_Wrk Is Nothing Then
        Set m_Wrk = p_Wrk
        m_HayTransaccion = False  ' No somos responsables de esta transacción
    Else
        Set m_Wrk = DBEngine.Workspaces(0)
        m_Wrk.BeginTrans
        m_HayTransaccion = True
    End If
    
    blnResult = NCRepository.Update(p_NC, p_Db, p_Error)
    If Not blnResult Then
        If m_HayTransaccion Then m_Wrk.Rollback
        Exit Function
    End If
    
    ' Notificación intratransaccional de caché (RFC-001 §3.6)
    ' Si falla la cache, rollback total del CRUD
    ' Spec-008 §4.3 + invalidate-cascada-cache: InvalidateCascada marca la NC
    ' y resuelve la cascada sin rebuild (regeneración lazy).
    If Not CacheNCProyecto.InvalidateCascada("NC", CLng(p_NC.IDNoConformidad), p_Error) Then
        If m_HayTransaccion Then m_Wrk.Rollback
        p_Error = "NCService.Modificar: Error en cache. " & p_Error
        Exit Function
    End If
    
    If m_HayTransaccion Then
        m_Wrk.CommitTrans
    End If
    
    Modificar = True
    Exit Function
    
errores:
    If m_HayTransaccion Then
        On Error Resume Next
        m_Wrk.Rollback
        On Error GoTo 0
    End If
    p_Error = "NCService.Modificar: " & Err.Description
End Function

Public Function Eliminar(ByVal p_IDNC As String, ByVal p_Logico As Boolean, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    Dim m_NC As ncProyecto
    Dim blnResult As Boolean
    Dim m_Wrk As DAO.Workspace
    Dim m_HayTransaccion As Boolean
    
    On Error GoTo errores
    p_Error = ""
    Eliminar = False

    If p_Db Is Nothing Then
        p_Error = "NCService.Eliminar: Database no puede ser Nothing"
        Exit Function
    End If

    If Not p_Db.Transactions Then
        p_Error = "NCService.Eliminar: La base de datos no soporta transacciones"
        Exit Function
    End If

    Set m_Wrk = DBEngine.Workspaces(0)
    
    Set m_NC = NCRepository.GetById(p_IDNC, p_Db, p_Error)
    If p_Error <> "" Then
        Exit Function
    End If
    If m_NC Is Nothing Then
        p_Error = "No se encontró la NC con ID: " & p_IDNC
        Exit Function
    End If
    
    m_Wrk.BeginTrans
    m_HayTransaccion = True
        blnResult = NCRepository.Delete(p_IDNC, p_Logico, p_Db, p_Error)
        If Not blnResult Then
            m_Wrk.Rollback
            m_HayTransaccion = False
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
    p_Error = "NCService.Eliminar: " & Err.Description
End Function

Public Function GetById(ByVal p_IDNC As String, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As ncProyecto
    On Error GoTo errores
    p_Error = ""
    
    Set GetById = NCRepository.GetById(p_IDNC, p_Db, p_Error)
    Exit Function
    
errores:
    p_Error = "NCService.GetById: " & Err.Description
    Set GetById = Nothing
End Function
