VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "CierreNCService"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Private m_CacheNCCrud As New CacheNCCrud

Public Function CerrarNC(ByVal p_IDNC As Long, ByRef p_Error As String) As Boolean
    Dim m_NCOp As NCProyectoOperaciones
    Dim m_NC As ncProyecto
    
    On Error GoTo errores
    p_Error = ""
    CerrarNC = False
    
    If p_IDNC <= 0 Then
        p_Error = "CierreNCService.CerrarNC: IDNC inválido"
        Exit Function
    End If
    
    Set m_NC = constructor.getNCProyecto(p_IDNC:=CStr(p_IDNC), p_Error:=p_Error)
    If p_Error <> "" Then
        Exit Function
    End If
    
    If m_NC Is Nothing Then
        p_Error = "CierreNCService.CerrarNC: No se encontró la NC con ID: " & CStr(p_IDNC)
        Exit Function
    End If
    
    Set m_NCOp = New NCProyectoOperaciones
    Set m_NCOp.nc = m_NC
    
    m_NCOp.RegistrarResultadoControlEficacia p_Error
    If p_Error <> "" Then
        Exit Function
    End If
    
    If Not m_CacheNCCrud.NotificarCierreNC(p_IDNC, p_Error) Then
        Exit Function
    End If
    
    CerrarNC = True
    Exit Function
    
errores:
    p_Error = "CierreNCService.CerrarNC: " & Err.Description
End Function
