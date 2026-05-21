VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteCPVOperaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public ExpedienteCPV As ExpedienteCPV


Public Function Registrar(Optional ByRef p_Error As String) As String

    Dim m_SQL As String
    Dim rcdDatos As DAO.Recordset
    
    
    On Error GoTo errores
    With ExpedienteCPV
        If .IDCPV = "" Then
            p_Error = "Falta el CPV"
            Err.Raise 1000
        End If
        If .IDExpediente = "" Then
            p_Error = "Falta el Expediente"
            Err.Raise 1000
        End If
        .IDCPVExpediente = .IDCPVExpedienteCalculado
        
        m_SQL = "SELECT * " & _
                "FROM TbExpedientesCPVs " & _
                "WHERE IDCPV=" & .IDCPV & " AND IdExpediente=" & .IDExpediente & ";"
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        If rcdDatos.EOF Then
            rcdDatos.AddNew
                rcdDatos.Fields("IDCPV") = .IDCPV
                rcdDatos.Fields("IdExpediente") = .IDExpediente
                rcdDatos.Fields("IDCPVExpediente") = .IDCPVExpediente
            rcdDatos.Update
            Registrar = "1"
        Else
            Registrar = "0"
        End If
        rcdDatos.Close
        Set rcdDatos = Nothing
    End With
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteCPVOperaciones.Registrar ha producido el error nº: " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If
End Function


Public Function Eliminar(Optional ByRef p_Error As String) As String
    Dim m_SQL As String
    On Error GoTo errores
    
    With ExpedienteCPV
        m_SQL = "DELETE * " & _
                "FROM TbExpedientesCPVs " & _
                "WHERE IDCPV=" & .IDCPV & " AND IdExpediente=" & .IDExpediente & ";"
        getdb().Execute m_SQL
    End With
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteCPVOperaciones.Eliminar ha producido el error nº: " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If
End Function


