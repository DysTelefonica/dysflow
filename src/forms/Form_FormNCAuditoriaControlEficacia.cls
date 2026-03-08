VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Form_FormNCAuditoriaControlEficacia"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Dim m_NC As NCAuditoria
Private m_sEstadoAlInicio As EnumEstadoNC
Private m_Error As String

Public Function RellenarDatosObjeto(Optional ByRef p_Error As String) As String
    
    Dim ctl As Control
    Dim m_Valor As String
    
    On Error GoTo errores
    If m_ObjNCAuditoriaActiva Is Nothing Then
        Set m_ObjNCAuditoriaActiva = New NCAuditoria
    End If
    For Each ctl In Me.Controls
        If InStr(1, Nz(ctl.Tag, ""), "DATO") <> 0 Then
            m_ObjNCAuditoriaActiva.SetPropiedad ctl.Name, Nz(ctl.Value, ""), p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            
        End If
    Next
   
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarDatosObjeto ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Private Sub ComandoGrabar_Click()
    Dim m_NCOp As NCaUDITORIAOperaciones
    Dim m_HaHabidoCambiosControlEficacia As Boolean
    Dim m_HaHabidoCambiosResultadoControlEficacia As Boolean
    Dim m_EstadoAlInicio As String
    Dim m_Estado As String
    On Error GoTo errores
    
   
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    m_HaHabidoCambiosControlEficacia = HaHabidoCambiosControlEficacia(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    m_HaHabidoCambiosResultadoControlEficacia = HaHabidoCambiosResultadoControlEficacia(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_HaHabidoCambiosControlEficacia = False And m_HaHabidoCambiosResultadoControlEficacia = False Then
        m_Error = "No hay cambios que guardar"
        Err.Raise 1000
    End If
    
    RellenarDatosObjeto m_Error
    If m_Error <> "" Then
        Err.Raise 100
    End If
    m_EstadoAlInicio = m_ObjNCAuditoriaActiva.Estado
    Set m_NCOp = New NCaUDITORIAOperaciones
    With m_NCOp
        
        Set .nc = m_ObjNCAuditoriaActiva
        If Nz(Me.FechaPrevistaControlEficacia, "") <> "" Then
            If m_HaHabidoCambiosControlEficacia Then
                .RegistrarControlEficacia m_Error
                If m_Error <> "" Then
                     Set m_ObjNCAuditoriaActiva = constructor.getNCAuditoria(p_IDNC:=m_ObjNCAuditoriaActiva.id)
                    Err.Raise 1000
                End If
            End If
        Else
            If Form_FormNCAuditoria.m_NCAlInicio.FechaPrevistaControlEficacia <> "" Then
                .EliminarResultadoControlEficacia m_Error
                If m_Error <> "" Then
                     Set m_ObjNCAuditoriaActiva = constructor.getNCAuditoria(p_IDNC:=m_ObjNCAuditoriaActiva.id)
                    Err.Raise 1000
                End If
                GoTo fin
                
            End If
        End If
        
        If Nz(Me.FechaControlEficacia, "") <> "" Then
            If m_HaHabidoCambiosResultadoControlEficacia Then
                .RegistrarResultadoControlEficacia m_Error
                If m_Error <> "" Then
                     Set m_ObjNCAuditoriaActiva = constructor.getNCAuditoria(p_IDNC:=m_ObjNCAuditoriaActiva.id)
                    Err.Raise 1000
                End If
            End If
           
        Else
            If Form_FormNCAuditoria.m_NCAlInicio.FechaControlEficacia <> "" Then
                .EliminarResultadoControlEficacia m_Error
                If m_Error <> "" Then
                     Set m_ObjNCAuditoriaActiva = constructor.getNCAuditoria(p_IDNC:=m_ObjNCAuditoriaActiva.id)
                    Err.Raise 1000
                End If
            End If
            
        End If
    End With
    
    
fin:
    Set Form_FormNCAuditoria.m_NCAlInicio = constructor.getNCAuditoria(p_IDNC:=m_ObjNCAuditoriaActiva.id, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    With Form_FormNCAuditoria.m_NCAlInicio
        .FechaPrevistaControlEficacia = Nz(Me.FechaPrevistaControlEficacia, "")
        .FechaControlEficacia = Nz(Me.FechaControlEficacia, "")
        .ControlEficacia = Nz(Me.ControlEficacia, "")
        .ResultadoControlEficacia = Nz(Me.ResultadoControlEficacia, "")
        .ConformeControlEficacia = Nz(Me.ConformeControlEficacia, "")
    End With
    m_ObjNCAuditoriaActiva.EstadoGrabar
    m_sEstadoAlInicio = m_ObjNCAuditoriaActiva.EstadoEnum
    EstablecerDatos
    
    If Me.ConformeControlEficacia = "No" Then
        If m_ObjNCAuditoriaActiva.RequiereControlEficaciaCalculado = EnumSino.Sí Then
            pregunta = MsgBox("Al indicar que no es conforme se han de planificar nuevas acciones." & vbNewLine & _
                        "¿Desea planificar una nueva acción?", vbExclamation + vbYesNo + vbDefaultButton1, "Nuevas acciones")
            If pregunta = vbYes Then
                Me.Parent.NavAcciones.SetFocus
                Me.Parent.FrmDetalle.SourceObject = "FormNCAuditoriaAcciones"
            End If
        End If
        
    End If
    m_Estado = m_ObjNCAuditoriaActiva.Estado
   
    If m_EstadoAlInicio <> "" Then
        If m_EstadoAlInicio <> "Cerrada" Then
            If m_Estado = "Cerrada" Then
                pregunta = MsgBox("La NC de Auditoria pasa a estar cerrada ", vbInformation, "Cierre de NC")
            End If
        Else
            If m_EstadoAlInicio = "Cerrada" Then
                If m_Estado <> "Cerrada" Then
                    pregunta = MsgBox("La NC de Auditoria ha dejado de estar cerrada ", vbInformation, "Reapertura de NC")
                End If
            End If
        End If
        If m_Estado <> m_EstadoAlInicio Then
            If FormularioAbierto("FormNCAuditoriaGestion") Then
                Form_FormNCAuditoriaGestion.ActualizarLineaLista
            End If
        End If
    End If
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
   
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoGrabar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ConformeControlEficacia_AfterUpdate()
    On Error Resume Next
    
    EstableceColorBordes
End Sub

Private Sub ControlEficacia_AfterUpdate()
    On Error Resume Next
    
    EstableceColorBordes
End Sub

Private Sub FechaControlEficacia_AfterUpdate()
    On Error Resume Next
    
    EstableceColorBordes
End Sub

Private Sub FechaPrevistaControlEficacia_AfterUpdate()
    On Error Resume Next
    
    EstableceColorBordes
End Sub

Private Sub EstableceColorBordes()
    On Error Resume Next
    
    
    Me.FechaPrevistaControlEficacia.BorderColor = COLOR_BORDE_CAMPO_RELLENO
    Me.FechaControlEficacia.BorderColor = COLOR_BORDE_CAMPO_RELLENO
    Me.ControlEficacia.BorderColor = COLOR_BORDE_CAMPO_RELLENO
    Me.ResultadoControlEficacia.BorderColor = COLOR_BORDE_CAMPO_RELLENO
    Me.ConformeControlEficacia.BorderColor = COLOR_BORDE_CAMPO_RELLENO
    
    Me.FechaPrevistaControlEficacia.BorderWidth = ANCHO_BORDE_CAMPO_RELLENO
    Me.FechaControlEficacia.BorderWidth = ANCHO_BORDE_CAMPO_RELLENO
    Me.ControlEficacia.BorderWidth = ANCHO_BORDE_CAMPO_RELLENO
    Me.ResultadoControlEficacia.BorderWidth = ANCHO_BORDE_CAMPO_RELLENO
    Me.ConformeControlEficacia.BorderWidth = ANCHO_BORDE_CAMPO_RELLENO
    
    If m_sEstadoAlInicio = EnumEstadoNC.Cerrada Then
        
        Exit Sub
    
    End If
    
    With m_ObjNCAuditoriaActiva
        
        .FechaControlEficacia = Nz(Me.FechaControlEficacia, "")
        .RequiereControlEficacia = Nz(Me.RequiereControlEficacia, "")
        .FechaPrevistaControlEficacia = Nz(Me.FechaPrevistaControlEficacia, "")
        .ControlEficacia = Nz(Me.ControlEficacia, "")
        .ResultadoControlEficacia = Nz(Me.ResultadoControlEficacia, "")
        .ConformeControlEficacia = Nz(Me.ConformeControlEficacia, "")
        If .EficaciaOK = EnumSino.Sí Then
            Me.Parent.Controls("NavControlEficacia").ForeColor = PESTAÑA_TODOS_DATOS_OK_SI
        Else
            Me.Parent.Controls("NavControlEficacia").ForeColor = PESTAÑA_TODOS_DATOS_OK_NO
        End If
    End With
    If Not IsDate(Me.FechaPrevistaControlEficacia) Then
        Me.FechaPrevistaControlEficacia.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
        Me.FechaPrevistaControlEficacia.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
    End If
    If Nz(Me.ControlEficacia, "") = "" Then
        Me.ControlEficacia.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
        Me.ControlEficacia.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
    End If
    
    
    If IsDate(Me.FechaControlEficacia) Then
        If Nz(Me.ResultadoControlEficacia, "") = "" Then
            Me.ResultadoControlEficacia.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
            Me.ResultadoControlEficacia.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
        End If
        If Nz(Me.ConformeControlEficacia, "") = "" Then
            Me.ConformeControlEficacia.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
            Me.ConformeControlEficacia.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
        End If
    Else
        If Nz(Me.ResultadoControlEficacia, "") <> "" Then
            Me.ResultadoControlEficacia.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
            Me.ResultadoControlEficacia.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
        End If
        If Nz(Me.ConformeControlEficacia, "") <> "" Then
            Me.ConformeControlEficacia.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
            Me.ConformeControlEficacia.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
        End If
    End If
    
   
End Sub

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
    On Error GoTo errores
    If m_ObjNCAuditoriaActiva Is Nothing Then
        m_Error = "El formulario se ha abierto con parámetros insuficentes"
        Err.Raise 1000
    End If
    If m_ObjNCAuditoriaActiva.id = "" Then
        m_Error = "El formulario se ha abierto con parámetros insuficentes"
        Err.Raise 1000
    End If
    m_sEstadoAlInicio = m_ObjNCAuditoriaActiva.EstadoCalculado
    Me.ComandoGrabar.Enabled = True
    Set m_NC = m_ObjNCAuditoriaActiva
    
    With m_NC
        Me.RequiereControlEficacia = "Sí"
        If .FechaPrevistaControlEficacia <> "" Then
            Me.FechaPrevistaControlEficacia = .FechaPrevistaControlEficacia
        End If
        If .FechaControlEficacia <> "" Then
            Me.FechaControlEficacia = .FechaControlEficacia
        End If
        If .ControlEficacia <> "" Then
            Me.ControlEficacia = .ControlEficacia
        End If
        If .ResultadoControlEficacia <> "" Then
            Me.ResultadoControlEficacia = .ResultadoControlEficacia
        End If
        If .ConformeControlEficacia <> "" Then
            Me.ConformeControlEficacia = .ConformeControlEficacia
        End If
    End With
    
    EstableceColorBordes
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function



Private Sub RequiereControlEficacia_AfterUpdate()
    On Error Resume Next
    
    EstableceColorBordes
End Sub
Private Function HaHabidoCambiosControlEficacia(Optional ByRef p_Error As String) As Boolean
    
    On Error GoTo errores
    If Form_FormNCAuditoria.m_NCAlInicio Is Nothing Then
        HaHabidoCambiosControlEficacia = True
        Exit Function
    End If
    With Form_FormNCAuditoria.m_NCAlInicio
        
        
        If .FechaPrevistaControlEficacia <> Nz(Me.FechaPrevistaControlEficacia, "") Then
            HaHabidoCambiosControlEficacia = True
            Exit Function
        End If
        
        If .ControlEficacia <> Nz(Me.ControlEficacia, "") Then
            HaHabidoCambiosControlEficacia = True
            Exit Function
        End If
        
    End With
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HaHabidoCambiosControlEficacia ha devuelto el error: " & Err.Description
    End If
End Function
Private Function HaHabidoCambiosResultadoControlEficacia(Optional ByRef p_Error As String) As Boolean
    
    On Error GoTo errores
    If Form_FormNCAuditoria.m_NCAlInicio Is Nothing Then
        HaHabidoCambiosResultadoControlEficacia = True
        Exit Function
    End If
    With Form_FormNCAuditoria.m_NCAlInicio
        
        
       
        If .ResultadoControlEficacia <> Nz(Me.ResultadoControlEficacia, "") Then
            HaHabidoCambiosResultadoControlEficacia = True
            Exit Function
        End If
        If .ConformeControlEficacia <> Nz(Me.ConformeControlEficacia, "") Then
            HaHabidoCambiosResultadoControlEficacia = True
            Exit Function
        End If
    End With
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HaHabidoCambiosResultadoControlEficacia ha devuelto el error: " & Err.Description
    End If
End Function


Private Sub ResultadoControlEficacia_AfterUpdate()
    On Error Resume Next
    
    EstableceColorBordes
End Sub
