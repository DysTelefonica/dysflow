' MÓDULO: Form_frmSplash.cls

Option Compare Database
Option Explicit

Public ProgresoActual As Long

Private Sub Form_Open(Cancel As Integer)
    On Error GoTo errores
    
    ' Ocultamos Ribbon (bypass con /dev)
    If InStr(1, Nz(Command(), ""), "/dev", vbTextCompare) = 0 Then
        Call GestionarRibbon(False)
    End If
    
    Ajustar Me
    Call ResetAvanceCounter
    Me.lblProgresoBarra.Width = 0
    
    Exit Sub
errores:
    MsgBox Err.Description, vbCritical, "Error"
End Sub

Private Sub Form_Timer()
    Dim m_Error As String
    On Error GoTo errores
    
    ' Detenemos el timer para que no se ejecute dos veces
    Me.TimerInterval = 0
   
    ' 1. Carga de Configuración General (mueve la barra azul)
    Me.Caption = "Iniciando Expedientes ..."
    Me.lblEstado.Caption = "Cargando configuración..."
    DoEvents
    Me.lblEstado.Caption = "Estableciendo Variables de Entorno..."
    EVE m_Error
    If m_Error <> "" Then Err.Raise 1000, , m_Error
    
    Me.lblEstado.Caption = "Validando infraestructura..."
    DoEvents
    ValidarInfraestructuraInicio m_Error
    If m_Error <> "" Then Err.Raise 1000, , m_Error

    DoEvents
    If EsTecnico <> EnumSiNo.Sí Then
        
        DoCmd.OpenForm "Form0BDOpciones"
    Else
        
        DoCmd.OpenForm "Form0BDOpcionesTecnicos"
    End If
   
    
    DoCmd.Close acForm, Me.Name
    
    Exit Sub
    
errores:
    MsgBox "No se pudo completar el inicio del sistema." & vbNewLine & _
           "Error: " & Err.Description & vbNewLine & m_Error, vbCritical, "EXPE-DYS - Error de inicio"
    DoCmd.Quit acQuitSaveNone
End Sub
