VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "AuditoriaService"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Private m_Repo As AuditoriaRepositorio
Private m_Wrk As DAO.Workspace
Private m_HayTransaccion As Boolean

Public Function Alta(ByRef p_Auditoria As Auditoria, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    Dim blnResultado As Boolean
    
    On Error GoTo errores
    p_Error = ""
    Alta = False
    
    If p_Db Is Nothing Then
        p_Error = "AuditoriaService.Alta: Database no puede ser Nothing"
        Exit Function
    End If
    
    If Not p_Db.Transactions Then
        p_Error = "AuditoriaService.Alta: La base de datos no soporta transacciones"
        Exit Function
    End If
    
    Set m_Wrk = DBEngine.Workspaces(0)
    
    If p_Auditoria.IDAuditoria = "" Then
        p_Auditoria.IDAuditoria = p_Auditoria.IDAuditoriaCalculada
        p_Error = p_Auditoria.Error
        If p_Error <> "" Then
            Exit Function
        End If
    End If
    
    m_Wrk.BeginTrans
    m_HayTransaccion = True
    
    blnResultado = m_Repo.Insert(p_Auditoria, p_Db, p_Error)
    If p_Error <> "" Then
        m_Wrk.Rollback
        m_HayTransaccion = False
        Err.Raise 1000, , p_Error
    End If
    If Not blnResultado Then
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
    p_Error = "AuditoriaService.Alta: " & Err.Description
    Err.Raise 1000, , p_Error
End Function

Public Function Modificar(ByRef p_Auditoria As Auditoria, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    Dim blnResultado As Boolean
    
    On Error GoTo errores
    p_Error = ""
    Modificar = False
    
    If p_Db Is Nothing Then
        p_Error = "AuditoriaService.Modificar: Database no puede ser Nothing"
        Exit Function
    End If
    
    If Not p_Db.Transactions Then
        p_Error = "AuditoriaService.Modificar: La base de datos no soporta transacciones"
        Exit Function
    End If
    
    Set m_Wrk = DBEngine.Workspaces(0)
    
    m_Wrk.BeginTrans
    m_HayTransaccion = True
    
    blnResultado = m_Repo.Update(p_Auditoria, p_Db, p_Error)
    If p_Error <> "" Then
        m_Wrk.Rollback
        m_HayTransaccion = False
        Err.Raise 1000, , p_Error
    End If
    If Not blnResultado Then
        m_Wrk.Rollback
        m_HayTransaccion = False
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
    p_Error = "AuditoriaService.Modificar: " & Err.Description
    Err.Raise 1000, , p_Error
End Function

Public Function Eliminar(ByVal p_IDAuditoria As String, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    Dim blnResultado As Boolean
    
    On Error GoTo errores
    p_Error = ""
    Eliminar = False
    
    If p_Db Is Nothing Then
        p_Error = "AuditoriaService.Eliminar: Database no puede ser Nothing"
        Exit Function
    End If
    
    If Not p_Db.Transactions Then
        p_Error = "AuditoriaService.Eliminar: La base de datos no soporta transacciones"
        Exit Function
    End If
    
    Set m_Wrk = DBEngine.Workspaces(0)
    m_Wrk.BeginTrans
    m_HayTransaccion = True
    
    blnResultado = m_Repo.Delete(p_IDAuditoria, p_Db, p_Error)
    If p_Error <> "" Then
        m_Wrk.Rollback
        m_HayTransaccion = False
        Err.Raise 1000, , p_Error
    End If
    If Not blnResultado Then
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
    p_Error = "AuditoriaService.Eliminar: " & Err.Description
    Err.Raise 1000, , p_Error
End Function

Public Function GetById(ByVal p_IDAuditoria As String, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As Auditoria
    On Error GoTo errores
    p_Error = ""
    
    Set GetById = m_Repo.GetById(p_IDAuditoria, p_Db, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000, , p_Error
    End If
    Exit Function
    
errores:
    p_Error = "AuditoriaService.GetById: " & Err.Description
    Set GetById = Nothing
End Function