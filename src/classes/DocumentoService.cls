VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "DocumentoService"
Option Compare Database
Option Explicit

Public Function Registrar(ByRef p_Documento As DocumentoProyecto, Optional ByRef p_Error As String) As Boolean
    Dim m_Op As DocumentoProyectoOperaciones
    Dim m_Result As String
    Dim m_IDNC As Long
    
    On Error GoTo errores
    p_Error = ""
    Registrar = False
    
    If p_Documento Is Nothing Then
        p_Error = "DocumentoService.Registrar: Documento no puede ser Nothing"
        Exit Function
    End If
    
    Set m_Op = New DocumentoProyectoOperaciones
    Set m_Op.Documento = p_Documento
    
    m_Result = m_Op.Registrar("", p_Error)
    If p_Error <> "" Then
        Exit Function
    End If
    
    If p_Documento.IDNoConformidad <> "" Then
        m_IDNC = CLng(p_Documento.IDNoConformidad)
    Else
        If Not p_Documento.AR Is Nothing Then
            If Not p_Documento.AR.AC Is Nothing Then
                If Not p_Documento.AR.AC.nc Is Nothing Then
                    m_IDNC = CLng(p_Documento.AR.AC.nc.IDNoConformidad)
                End If
            End If
        End If
    End If
    
    If m_IDNC <> 0 Then
        If Not CacheNCCrud.NotificarCambioDocumentos(m_IDNC, p_Error) Then
            Exit Function
        End If
    End If
    
    Registrar = True
    Exit Function
    
errores:
    p_Error = "DocumentoService.Registrar: " & Err.Description
End Function

Public Function Eliminar(ByRef p_Documento As DocumentoProyecto, Optional ByRef p_Error As String) As Boolean
    Dim m_Op As DocumentoProyectoOperaciones
    Dim m_Result As String
    Dim m_IDNC As Long
    
    On Error GoTo errores
    p_Error = ""
    Eliminar = False
    
    If p_Documento Is Nothing Then
        p_Error = "DocumentoService.Eliminar: Documento no puede ser Nothing"
        Exit Function
    End If
    
    Set m_Op = New DocumentoProyectoOperaciones
    Set m_Op.Documento = p_Documento
    
    m_Result = m_Op.Eliminar(p_Error)
    If p_Error <> "" Then
        Exit Function
    End If
    
    If p_Documento.IDNoConformidad <> "" Then
        m_IDNC = CLng(p_Documento.IDNoConformidad)
    Else
        If Not p_Documento.AR Is Nothing Then
            If Not p_Documento.AR.AC Is Nothing Then
                If Not p_Documento.AR.AC.nc Is Nothing Then
                    m_IDNC = CLng(p_Documento.AR.AC.nc.IDNoConformidad)
                End If
            End If
        End If
    End If
    
    If m_IDNC <> 0 Then
        If Not CacheNCCrud.NotificarCambioDocumentos(m_IDNC, p_Error) Then
            Exit Function
        End If
    End If
    
    Eliminar = True
    Exit Function
    
errores:
    p_Error = "DocumentoService.Eliminar: " & Err.Description
End Function