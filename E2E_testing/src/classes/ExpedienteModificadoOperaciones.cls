VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteModificadoOperaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public ExpedienteModificado As ExpedienteModificado


Public Function Registrar( _
                            p_ModificadoAlInicio As ExpedienteModificado, _
                            Optional ByRef p_Error As String _
                            ) As String

    Dim m_SQL As String
    Dim rcdDatos As DAO.Recordset
    Dim m_Modificado As ExpedienteModificado
    On Error GoTo errores
    With Me.ExpedienteModificado
        If .DESCRIPCION = "" Then
             p_Error = "La Descripción es obligatoria"
             Err.Raise 1000
        End If
        If Not IsNumeric(.NModificado) Then
            p_Error = "Se ha de indicar el número de modificado"
            Err.Raise 1000
        End If
        If p_ModificadoAlInicio.DESCRIPCION <> .DESCRIPCION Then
            Set m_Modificado = constructor.getExpedienteModificado(p_IDExpediente:=.IDExpediente, p_DESCRIPCION:=.DESCRIPCION, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If Not m_Modificado Is Nothing Then
                p_Error = "Ya existe un modificado para este expediente con la misma descripción"
                 Err.Raise 1000
            End If
        End If
'        If Not IsDate(.FechaFirmaModificado) Then
'            p_Error = "La fecha de firma del modificado es obligatoria"
'             Err.Raise 1000
'        End If
        If IsDate(.FechaFinModificado) And IsDate(p_ModificadoAlInicio.FechaFirmaModificado) Then
            If p_ModificadoAlInicio.FechaFirmaModificado <> .FechaFirmaModificado Then
                Set m_Modificado = constructor.getExpedienteModificado(p_IDExpediente:=.IDExpediente, _
                                p_FechaFirmaModificado:=.FechaFirmaModificado, p_Error:=p_Error)
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
                If Not m_Modificado Is Nothing Then
                    p_Error = "Ya existe un Modificado para este expediente con la misma fecha de firma"
                     Err.Raise 1000
                End If
            End If
        End If
        m_SQL = "SELECT * " & _
                "FROM TbExpedientesModificados " & _
                "WHERE IDExpedienteModificado=" & .IDExpedienteModificado & ";"
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
       
            rcdDatos.Edit
                
                rcdDatos.Fields("DESCRIPCION") = .DESCRIPCION
                rcdDatos.Fields("NModificado") = .NModificado
                If IsDate(.FechaFirmaModificado) Then
                    rcdDatos.Fields("FechaFirmaModificado") = .FechaFirmaModificado
                Else
                    rcdDatos.Fields("FechaFirmaModificado") = Null
                End If
                
                
                If IsDate(.FechaFinModificado) Then
                    rcdDatos.Fields("FechaFinModificado") = .FechaFinModificado
                Else
                    rcdDatos.Fields("FechaFinModificado") = Null
                End If
                
            rcdDatos.Update
        
        rcdDatos.Close
        Set rcdDatos = Nothing
        RegistrarUltimoCambio p_Expediente:=.Expediente
    End With
     
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteModificadoOperaciones.Registrar ha producido el error nº: " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If
    
End Function



