VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "UltimoCambioOperaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit



Public Function Registrar( _
                            p_Expediente As Expediente, _
                            Optional ByRef p_Error As String _
                            ) As UltimoCambio

    Dim m_SQL As String
    Dim rcdDatos As DAO.Recordset
    Dim m_UltimoCambio As UltimoCambio
    
    On Error GoTo errores
    
    Set m_UltimoCambio = New UltimoCambio
    With m_UltimoCambio
        
        .IDExpediente = p_Expediente.IDExpediente
        .IDUsuarioCambio = m_ObjUsuarioConectado.ID
        .FechaCambio = Now()
        m_SQL = "SELECT * " & _
                "FROM TbUltimoCambio " & _
                "WHERE IDUsuarioCambio=" & .IDUsuarioCambio & ";"
        
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        If rcdDatos.EOF Then
            rcdDatos.AddNew
                .ID = .IDCalculado
                rcdDatos.Fields("ID") = CLng(.ID)
                rcdDatos.Fields("IDExpediente") = .IDExpediente
                rcdDatos.Fields("FechaCambio") = .FechaCambio
                rcdDatos.Fields("IDUsuarioCambio") = .IDUsuarioCambio
            rcdDatos.Update
        Else
            rcdDatos.Edit
                rcdDatos.Fields("IDExpediente") = .IDExpediente
                rcdDatos.Fields("FechaCambio") = .FechaCambio
                rcdDatos.Fields("IDUsuarioCambio") = .IDUsuarioCambio
            rcdDatos.Update
        End If
        
        rcdDatos.Close
        Set rcdDatos = Nothing
    End With
    
    With p_Expediente
        m_SQL = "SELECT * " & _
                "FROM TbExpedientes " & _
                "WHERE IDExpediente=" & .IDExpediente & ";"
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        If Not rcdDatos.EOF Then
            rcdDatos.Edit
                If Not IsDate(.FechaCreacion) Then
                    .FechaCreacion = Now()
                    .IDUsuarioCreacion = m_ObjUsuarioConectado.ID
                    rcdDatos.Fields("FechaCreacion") = .FechaCreacion
                    rcdDatos.Fields("IDUsuarioCreacion") = .IDUsuarioCreacion
                Else
                    .FechaUltimoCambio = Now()
                    .IDUsuarioUltimoCambio = m_ObjUsuarioConectado.ID
                    rcdDatos.Fields("FechaUltimoCambio") = .FechaUltimoCambio
                    rcdDatos.Fields("IDUsuarioUltimoCambio") = .IDUsuarioUltimoCambio
                End If
            rcdDatos.Update
        End If
        
        rcdDatos.Close
        Set rcdDatos = Nothing
        
    End With
    Set Registrar = m_UltimoCambio
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método UltimoCambioOperaciones.Registrar ha producido el error nº: " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If
    
End Function


