Attribute VB_Name = "NCAuditoriaSeguimientoHelper"
Option Compare Database
Option Explicit

Public Function CargarIndicadoresSeguimientoAuditoria( _
    ByVal p_Reiniciando As EnumSino, _
    Optional ByRef p_DuracionSegundos As Double, _
    Optional ByRef p_Error As String _
    ) As Boolean

    Dim startTime As Single

    On Error GoTo errores

    p_Error = ""
    p_DuracionSegundos = 0
    startTime = Timer

    PintarIndicadores p_Reiniciando:=p_Reiniciando, p_Modo:="AUDITORIA", p_Error:=p_Error
    p_DuracionSegundos = ElapsedSeconds(startTime)
    If p_Error <> "" Then Err.Raise 1000

    CargarIndicadoresSeguimientoAuditoria = True
    Exit Function

errores:
    If p_DuracionSegundos = 0 Then p_DuracionSegundos = ElapsedSeconds(startTime)
    If Err.Number <> 1000 Then
        p_Error = "El método CargarIndicadoresSeguimientoAuditoria ha devuelto el error: " & Err.Description
    End If
End Function

Private Function ElapsedSeconds(ByVal p_StartTime As Single) As Double
    Dim endTime As Single

    endTime = Timer
    If endTime < p_StartTime Then
        ElapsedSeconds = (86400# - p_StartTime) + endTime
    Else
        ElapsedSeconds = endTime - p_StartTime
    End If
End Function
