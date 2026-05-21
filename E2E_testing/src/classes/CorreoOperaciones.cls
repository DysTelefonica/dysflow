VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "CorreoOperaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public CORREO As CORREO
Private m_Error As String
Public Error As String


Public Function EnviarCorreo( _
                            Optional ByRef p_Error As String _
                            ) As String
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_IDCorreo As String
    
    On Error GoTo errores
    
    With Me.CORREO
        If .Asunto = "" Then
            p_Error = "Ha de indicar el asunto"
            Err.Raise 1000
        End If
         If .Cuerpo = "" Then
            p_Error = "Ha de indicar algún texto del correo"
            Err.Raise 1000
        End If
        getCadenasCorreoLimpias .DESTINATARIOS, .DestinatariosConCopia, .DestinatariosConCopiaOculta, p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        .IDCORREO = .IDCorreoCalculado
        .Originador = m_ObjUsuarioConectado.usuarioRed
        .FECHAGRABACION = Now()
        .CuerpoHTML = True
        .Aplicacion = "EXPEDIENTES"
        m_SQL = "TbCorreosEnviados"
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
       
        rcdDatos.AddNew
            rcdDatos.Fields("IDCorreo") = .IDCORREO
            rcdDatos.Fields("Originador") = .Originador
            rcdDatos.Fields("Aplicacion") = .Aplicacion
            If .DESTINATARIOS <> "" Then
                rcdDatos.Fields("Destinatarios") = .DESTINATARIOS
            End If
            If InStr(1, .DestinatariosConCopia, "@") <> 0 Then
                rcdDatos.Fields("DestinatariosConCopia") = .DestinatariosConCopia
            End If
            If InStr(1, .DestinatariosConCopiaOculta, "andres.romandelperal@telefonica.com") = 0 Then
                If .DestinatariosConCopiaOculta = "" Then
                    .DestinatariosConCopiaOculta = "andres.romandelperal@telefonica.com"
                Else
                    .DestinatariosConCopiaOculta = .DestinatariosConCopiaOculta & ";" & "andres.romandelperal@telefonica.com"
                End If
                
            End If
            If InStr(1, .DestinatariosConCopiaOculta, "@") <> 0 Then
                rcdDatos.Fields("DestinatariosConCopiaOculta") = .DestinatariosConCopiaOculta
            End If
            
            rcdDatos.Fields("Asunto") = .Asunto
            rcdDatos.Fields("Cuerpo") = .Cuerpo
            
            rcdDatos.Fields("FechaGrabacion") = .FECHAGRABACION
            If .URLAdjunto <> "" Then
                rcdDatos.Fields("URLAdjunto") = .URLAdjunto
            End If
            If .NDPD <> "" Then
                rcdDatos.Fields("NDPD") = .NDPD
            End If
            If .NPedido <> "" Then
                rcdDatos.Fields("NPEDIDO") = .NPedido
            End If
            If .NFACTURA <> "" Then
                rcdDatos.Fields("NFACTURA") = .NFACTURA
            End If
            
           rcdDatos.Fields("CuerpoHTML") = .CuerpoHTML
        rcdDatos.Update
        rcdDatos.Close
        Set rcdDatos = Nothing
        EnviarCorreo = .IDCORREO
    End With
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método CorreoOperaciones.EnviarCorreo ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function

Private Function getCadenasCorreoLimpias( _
                                            Optional ByRef p_CadenaDestinatarios As String, _
                                            Optional ByRef p_CadenaDestinatariosEnCopia As String, _
                                            Optional ByRef p_CadenaDestinatariosOcultos As String, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    
    Dim m_ColDestinatarios As Scripting.Dictionary
    Dim m_ColDestinatariosEnCopia As Scripting.Dictionary
    Dim m_ColDestinatariosOcultos As Scripting.Dictionary
    Dim varItem As Variant
    Dim dato As Variant
    On Error GoTo errores
    
    If p_CadenaDestinatariosOcultos <> "" Then
        If InStr(1, p_CadenaDestinatariosOcultos, ";") <> 0 Then
            dato = Split(p_CadenaDestinatariosOcultos, ";")
            For Each varItem In dato
                If m_ColDestinatariosOcultos Is Nothing Then
                    Set m_ColDestinatariosOcultos = New Scripting.Dictionary
                    m_ColDestinatariosOcultos.CompareMode = TextCompare
                End If
                If Not m_ColDestinatariosOcultos.exists(varItem) Then
                    m_ColDestinatariosOcultos.Add varItem, varItem
                End If
            Next
        Else
            If m_ColDestinatariosOcultos Is Nothing Then
                Set m_ColDestinatariosOcultos = New Scripting.Dictionary
                m_ColDestinatariosOcultos.CompareMode = TextCompare
            End If
            If Not m_ColDestinatariosOcultos.exists(p_CadenaDestinatariosOcultos) Then
                m_ColDestinatariosOcultos.Add p_CadenaDestinatariosOcultos, p_CadenaDestinatariosOcultos
            End If
        End If
    End If
    If Not m_ColDestinatariosOcultos Is Nothing Then
        If Not m_ColDestinatariosOcultos.exists("Andres.RomandelPeral@telefonica.com") Then
            m_ColDestinatariosOcultos.Add "Andres.RomandelPeral@telefonica.com", "Andres.RomandelPeral@telefonica.com"
        End If
    Else
        If m_ColDestinatariosOcultos Is Nothing Then
            Set m_ColDestinatariosOcultos = New Scripting.Dictionary
            m_ColDestinatariosOcultos.CompareMode = TextCompare
        End If
        If Not m_ColDestinatariosOcultos.exists("Andres.RomandelPeral@telefonica.com") Then
            m_ColDestinatariosOcultos.Add "Andres.RomandelPeral@telefonica.com", "Andres.RomandelPeral@telefonica.com"
        End If
    End If
    If p_CadenaDestinatarios <> "" Then
        If InStr(1, p_CadenaDestinatarios, ";") <> 0 Then
            dato = Split(p_CadenaDestinatarios, ";")
            For Each varItem In dato
                If m_ColDestinatarios Is Nothing Then
                    Set m_ColDestinatarios = New Scripting.Dictionary
                    m_ColDestinatarios.CompareMode = TextCompare
                End If
                If Not m_ColDestinatarios.exists(varItem) Then
                    If Not m_ColDestinatariosOcultos Is Nothing Then
                        If m_ColDestinatariosOcultos.exists(varItem) Then
                            m_ColDestinatariosOcultos.Remove varItem
                            If m_ColDestinatariosOcultos.Count = 0 Then
                                Set m_ColDestinatariosOcultos = Nothing
                            End If
                        End If
                    End If
                    m_ColDestinatarios.Add varItem, varItem
                End If
            Next
        Else
            If m_ColDestinatarios Is Nothing Then
                Set m_ColDestinatarios = New Scripting.Dictionary
                m_ColDestinatarios.CompareMode = TextCompare
            End If
            If Not m_ColDestinatarios.exists(p_CadenaDestinatarios) Then
                If Not m_ColDestinatariosOcultos Is Nothing Then
                    If m_ColDestinatariosOcultos.exists(p_CadenaDestinatarios) Then
                        m_ColDestinatariosOcultos.Remove p_CadenaDestinatarios
                        If m_ColDestinatariosOcultos.Count = 0 Then
                            Set m_ColDestinatariosOcultos = Nothing
                        End If
                    End If
                End If
                m_ColDestinatarios.Add p_CadenaDestinatarios, p_CadenaDestinatarios
            End If
        End If
        
    End If
    If p_CadenaDestinatariosEnCopia <> "" Then
        If InStr(1, p_CadenaDestinatariosEnCopia, ";") <> 0 Then
            dato = Split(p_CadenaDestinatariosEnCopia, ";")
            For Each varItem In dato
                If Not m_ColDestinatarios Is Nothing Then
                    If Not m_ColDestinatarios.exists(varItem) Then
                        If m_ColDestinatariosEnCopia Is Nothing Then
                            Set m_ColDestinatariosEnCopia = New Scripting.Dictionary
                            m_ColDestinatariosEnCopia.CompareMode = TextCompare
                        End If
                        If Not m_ColDestinatariosEnCopia.exists(varItem) Then
                            If Not m_ColDestinatariosOcultos Is Nothing Then
                                If m_ColDestinatariosOcultos.exists(varItem) Then
                                    m_ColDestinatariosOcultos.Remove varItem
                                    If m_ColDestinatariosOcultos.Count = 0 Then
                                        Set m_ColDestinatariosOcultos = Nothing
                                    End If
                                End If
                            End If
                            m_ColDestinatariosEnCopia.Add varItem, varItem
                        End If
                    End If
                End If
                
            Next
        Else
            If Not m_ColDestinatarios Is Nothing Then
                If Not m_ColDestinatarios.exists(p_CadenaDestinatariosEnCopia) Then
                    If m_ColDestinatariosEnCopia Is Nothing Then
                        Set m_ColDestinatariosEnCopia = New Scripting.Dictionary
                        m_ColDestinatariosEnCopia.CompareMode = TextCompare
                    End If
                    If Not m_ColDestinatariosEnCopia.exists(p_CadenaDestinatariosEnCopia) Then
                        If Not m_ColDestinatariosOcultos Is Nothing Then
                            If m_ColDestinatariosOcultos.exists(p_CadenaDestinatariosEnCopia) Then
                                m_ColDestinatariosOcultos.Remove p_CadenaDestinatariosEnCopia
                                If m_ColDestinatariosOcultos.Count = 0 Then
                                    Set m_ColDestinatariosOcultos = Nothing
                                End If
                            End If
                        End If
                        m_ColDestinatariosEnCopia.Add p_CadenaDestinatariosEnCopia, p_CadenaDestinatariosEnCopia
                    End If
                End If
            End If
        End If
    End If
    p_CadenaDestinatarios = ""
    If Not m_ColDestinatarios Is Nothing Then
        For Each varItem In m_ColDestinatarios
            If p_CadenaDestinatarios = "" Then
                p_CadenaDestinatarios = varItem
            Else
                p_CadenaDestinatarios = p_CadenaDestinatarios & ";" & varItem
            End If
        Next
    End If
    p_CadenaDestinatariosEnCopia = ""
    If Not m_ColDestinatariosEnCopia Is Nothing Then
        For Each varItem In m_ColDestinatariosEnCopia
            If p_CadenaDestinatariosEnCopia = "" Then
                p_CadenaDestinatariosEnCopia = varItem
            Else
                p_CadenaDestinatariosEnCopia = p_CadenaDestinatariosEnCopia & ";" & varItem
            End If
        Next
    End If
    p_CadenaDestinatariosOcultos = ""
    If Not m_ColDestinatariosOcultos Is Nothing Then
        For Each varItem In m_ColDestinatariosOcultos
            If p_CadenaDestinatariosOcultos = "" Then
                p_CadenaDestinatariosOcultos = varItem
            Else
                p_CadenaDestinatariosOcultos = p_CadenaDestinatariosOcultos & ";" & varItem
            End If
        Next
    End If
    getCadenasCorreoLimpias = "OK"
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método CorreoOperaciones.getCadenasCorreoLimpias ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function




