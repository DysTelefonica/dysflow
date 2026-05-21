' MÓDULO: Form_frmBusy.cls
' Popup modal - Barra de progreso animada
Option Compare Database
Option Explicit

Public ProgresoActual As Long
Public ProgresoTotal As Long

Private Sub Form_Open(Cancel As Integer)
    On Error GoTo errores
    Debug.Print "=== Form_frmBusy OPEN ==="

    If InStr(1, Nz(Command(), ""), "/dev", vbTextCompare) = 0 Then
        Call GestionarRibbon(False)
    End If

    Me.TimerInterval = 500
    Me.lblProgresoBarra.Width = 0
    ProgresoActual = 0
    ProgresoTotal = 100
    g_BusyFlag = "running"

    Debug.Print "=== Form_frmBusy OPEN fin ==="
    Exit Sub
errores:
    Debug.Print "Form_frmBusy OPEN ERROR " & Err.Number & " - " & Err.Description
    MsgBox Err.Description, vbCritical, "Error"
End Sub

Private Sub Form_Timer()
    On Error Resume Next
    Debug.Print "TIMER fired, g_BusyFlag=[" & g_BusyFlag & "]"
    If g_BusyFlag = "done" Then
        Debug.Print "TIMER: g_BusyFlag=done, cerrando..."
        g_BusyFlag = ""
        DoCmd.Close acForm, Me.Name
    End If
End Sub

Public Sub MostrarEstado(ByVal p_Mensaje As String, Optional ByRef p_Error As String)
    On Error GoTo errores
    Me.lblEstado.Caption = p_Mensaje
    DoEvents
    Exit Sub
errores:
    p_Error = "MostrarEstado: " & Err.Description
End Sub

Public Sub ActualizarProgreso(ByVal p_Actual As Long, ByVal p_Total As Long, Optional ByRef p_Error As String)
    On Error GoTo errores
    Dim m_Porcentaje As Single
    ProgresoActual = p_Actual
    ProgresoTotal = p_Total
    If p_Total > 0 Then
        m_Porcentaje = p_Actual / p_Total
        Me.lblProgresoBarra.Width = CLng(m_Porcentaje * Me.lblProgresoFondo.Width)
    End If
    DoEvents
    Exit Sub
errores:
    p_Error = "ActualizarProgreso: " & Err.Description
End Sub

Public Sub IniciarPopup(ByVal p_Titulo As String, ByVal p_Mensaje As String, Optional ByRef p_Error As String)
    On Error GoTo errores
    Me.Caption = p_Titulo
    Me.lblTitulo.Caption = p_Titulo
    Me.lblEstado.Caption = p_Mensaje
    Me.lblProgresoBarra.Width = 0
    ProgresoActual = 0
    Exit Sub
errores:
    p_Error = "IniciarPopup: " & Err.Description
End Sub

Public Sub CerrarPopup(Optional ByRef p_Error As String)
    On Error GoTo errores
    DoCmd.Close acForm, Me.Name
    Exit Sub
errores:
    p_Error = "CerrarPopup: " & Err.Description
End Sub