VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Form_FormNCAuditoriaReplanificaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public m_RepSeleccionada As ReplanificacionesAuditoria

Private m_Error As String



Private Sub Form_Load()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    EstablecerDatos m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Load se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub
Public Function EstablecerDatos( _
                                    Optional ByRef p_Error As String _
                                    ) As String
   
    
    
    
    Dim m_Col As Scripting.Dictionary
    
    On Error GoTo errores
    If m_ObjNCAuditoriaActiva Is Nothing Then
         m_Error = "El formulario se ha abierto con parámetros insuficentes"
        Err.Raise 1000
    End If
    Me.AllowEdits = True
    EstablecerLista p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
   
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function



Private Function EstablecerLista( _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_Rep As ReplanificacionesAuditoria
    Dim m_ID As Variant
    Dim m_Col As Scripting.Dictionary
    Dim lst As ListBox
    Dim m_NC As NCAuditoria
    
    On Error GoTo errores
    Me.AC = Null
    Me.AR = Null
    
    Set lst = Me.ListaReplanificaciones
    lst.RowSource = "ID;NºAC;NºAR;Tarea;F.Replanif.;F.antes;F.después"
    
    Set m_NC = m_ObjNCAuditoriaActiva
    Set m_Col = m_NC.Replanificaciones
    If m_Col Is Nothing Then
       Exit Function
    End If
    
    For Each m_ID In m_Col
        Set m_Rep = m_Col(m_ID)
        With m_Rep
            lst.AddItem .IDReplanificacion & ";" & .AR.AC.NAccion & ";" & .AR.NAccion & ";" & _
                        Replace(.AR.AccionRealizada, ";", ":") & ";" & .FechaReprogramacion & ";" & _
                        .FechaPrevistaAlInicio & ";" & .FechaPrevistaReplanificada
        End With
        
        Set m_Rep = Nothing
    Next
    If lst.ListCount = 1 Then
        Exit Function
    End If
    
    lst.Selected(1) = True
    ListaReplanificaciones_Click
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerLista ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Sub ListaReplanificaciones_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
   
    Me.AC = Null
    Me.AR = Null
    If Nz(Me.ListaReplanificaciones.Column(0), "") = "" Then
        Set m_RepSeleccionada = Nothing
        
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If m_RepSeleccionada Is Nothing Then
        Set m_RepSeleccionada = constructor.getReplanificacionAuditoria(p_IDRep:=Nz(Me.ListaReplanificaciones.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    Else
        If m_RepSeleccionada.IDReplanificacion <> Me.ListaReplanificaciones.Column(0) Then
            Set m_RepSeleccionada = constructor.getReplanificacionAuditoria(p_IDRep:=Nz(Me.ListaReplanificaciones.Column(0), ""), p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
        End If
    End If
    With m_RepSeleccionada
        If Not .AR Is Nothing Then
            Me.AR = .AR.AccionRealizada
        Else
            Me.AR = Null
        End If
        If Not .AC Is Nothing Then
            Me.AC = .AC.AccionCorrectiva
        Else
            Me.AC = Null
        End If
        If .Observaciones <> "" Then
            Me.Observaciones = .Observaciones
        Else
            Me.Observaciones = Null
        End If
    End With
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ListaReplanificaciones_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

