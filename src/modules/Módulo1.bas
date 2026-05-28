Attribute VB_Name = "Módulo1"
Option Compare Database
Option Explicit

Public Function getURLCarpeta(p_IDAuditoria As String, Optional ByRef p_Error As String) As String
    
    Dim m_Auditoria As Auditoria
    Dim m_URLDirectorio As String
    On Error GoTo errores
    Set m_Auditoria = constructor.getAuditoria(p_ID:=p_IDAuditoria, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Auditoria Is Nothing Then
        p_Error = "No existe"
        Err.Raise 1000
    End If
    m_URLDirectorio = m_Auditoria.URLDirectorio
    p_Error = m_Auditoria.Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    getURLCarpeta = m_URLDirectorio
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo EnviarCorreoReactivacionNC ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function

Public Function AnexoMultipleAAuditoria(p_IDAuditoria As String, Optional ByRef p_Error As String) As String
    
    Dim m_Col As Scripting.Dictionary
    Dim m_Auditoria As Auditoria
    Dim m_AuditoriaOp As AuditoriaOperaciones
    
    On Error GoTo errores
    Set m_Auditoria = constructor.getAuditoria(p_ID:=p_IDAuditoria, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Auditoria Is Nothing Then
        p_Error = "No existe"
        Err.Raise 1000
    End If
    Set m_Col = New Scripting.Dictionary
    With m_Col
        .Add "Doc1", "C:\Users\adm1\Downloads\Listado App Calidad.xlsx"
        .Add "Doc2", "C:\Users\adm1\Downloads\deployment-cadete3.yaml"
    End With
    Set m_AuditoriaOp = New AuditoriaOperaciones
    Set m_AuditoriaOp.Auditoria = m_Auditoria
    m_AuditoriaOp.AnexoMultiple m_Col, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    AnexoMultipleAAuditoria = "OK"
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo AnexoMultipleAAuditoria ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function PruebaHTML1(Optional ByRef p_Error As String) As String
    
    Dim m_ID As String
    Dim m_NCProyecto As NCProyecto
    Dim m_mensaje As String
    On Error GoTo errores
    m_ID = "384"
    Set m_NCProyecto = constructor.getNCProyecto(p_IDNC:=m_ID, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    m_mensaje = HTMLNCProyecto(p_NC:=m_NCProyecto, p_ConAcciones:=EnumSino.Sí, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    AbrirHTMLEnLocal p_Mensaje:=m_mensaje, p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo PruebaHTML1 ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function

Public Function PruebaHTML2(Optional ByRef p_Error As String) As String
    
    Dim m_Cabecera As String
    Dim m_mensaje As String
    Dim m_TablaAC As String
    Dim m_ID As String
    Dim m_AC As ACProyecto
    
    
    On Error GoTo errores
    m_ID = "545"
    Set m_AC = constructor.getACProyecto(p_IDAC:=m_ID, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    m_Cabecera = DameCabeceraHTML("AC", p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    m_TablaAC = HTMLTablaACProyecto(p_AC:=m_AC, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    m_mensaje = m_Cabecera & vbNewLine
    
    m_mensaje = m_mensaje & m_TablaAC & vbNewLine
    
    
    m_mensaje = m_mensaje & "</body>" & vbNewLine
    m_mensaje = m_mensaje & "</html>" & vbNewLine
    
    
    AbrirHTMLEnLocal m_mensaje, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo PruebaHTML2 ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function PruebaSegTareas(Optional ByRef p_Error As String) As String
    
    Dim m_ID As Variant
    Dim m_Seg  As SegTareasProyecto
    Dim m_Col As Scripting.Dictionary
    Dim m_Campo As Variant
    Dim m_Valor As String
    
    Dim i As Long
    On Error GoTo errores
    
    'Set m_Col = constructor.getSegsTareasProyectoActivas(p_Error:=p_Error)
    Set m_Col = constructor.getSegsTareasAuditoriaActivas(p_Error:=p_Error)
    'Set m_Col = constructor.getSegsTareasProyectoIrregulares(p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Debug.Print "Sin Tareas activas"
        Exit Function
    End If
    For i = 1 To 5
        For Each m_ID In m_Col
            
            Set m_Seg = m_Col(m_ID)
            For Each m_Campo In m_Seg.ColCampos
                m_Valor = m_Seg.getPropiedad(m_Campo, p_Error)
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
                Debug.Print m_Campo, m_Valor
                
                
            Next
            
            Set m_Seg = Nothing
        Next
    Next
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo PruebaSegTareas ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function
