Attribute VB_Name = "HTML"
Option Compare Database
Option Explicit
Private Function BorraHTMLs( _
                            Optional ByRef p_Error As String) As String
    
    Dim fichero As File
    
    On Error GoTo errores
    
    For Each fichero In fso.GetFolder(m_ObjEntorno.URLDirectorioLocal).Files
        If fso.GetExtensionName(fichero.Path) = "html" Or fso.GetExtensionName(fichero.Path) = "htm" Then
            If Not FicheroAbierto(fichero.Path) Then
                fso.DeleteFile fichero.Path
            End If
        End If
    Next
   
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método BorraHTMLs ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Function DameUntxtYHtml(Optional ByRef p_Error As String) As String
    Dim i As Integer
    Dim m_URLTXT As String
    Dim m_URLHTML As String
    Dim m_NombreHTML As String
    Dim m_Nombretxt As String
    Dim m_URLDirLocal As String
    On Error GoTo errores
    
    m_URLDirLocal = m_ObjEntorno.URLDirectorioLocal
    p_Error = m_ObjEntorno.Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    BorraHTMLs p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    For i = 1 To 50
        m_Nombretxt = "HTML" & i & ".txt"
        m_NombreHTML = "HTML" & i & ".html"
        m_URLTXT = m_URLDirLocal & m_Nombretxt
        m_URLHTML = m_URLDirLocal & m_NombreHTML
        If Not fso.FileExists(m_URLTXT) And Not fso.FileExists(m_URLHTML) Then
            DameUntxtYHtml = m_URLHTML
            Exit Function
        End If
        
    Next
    p_Error = "No se ha podido obtener ningún html"
    Err.Raise 1000
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HTMLInformeCompletoDPD ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function GenerarArchivoConHTML( _
                                    Optional p_Mensaje As String, _
                                    Optional ByRef p_Error As String) As String
    
    
    
    
    Dim stream As ADODB.stream
    Dim m_URL As String
    Dim m_Hwd As Long
    On Error GoTo errores
    m_URL = DameUntxtYHtml(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_URL = "" Then
        p_Error = "No se ha podido obtener el HTML"
        Err.Raise 1000
    End If
    
    
    
    Set stream = New ADODB.stream
    With stream
        .Type = 2 ' 2 indica texto
        .Charset = "UTF-8"
        .Open
        .WriteText p_Mensaje
        
        .SaveToFile m_URL, 2 ' 2 para sobrescribir si existe
        .Close
    End With
    Set stream = Nothing
    
    
    GenerarArchivoConHTML = m_URL
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método GenerarArchivoConHTML ha devuelto el error: " & vbNewLine & Err.Description
    End If
   
End Function
Public Function AbrirHTMLEnLocal( _
                                    Optional p_Mensaje As String, _
                                    Optional ByRef p_Error As String) As String
    
    
    
    
    
    Dim m_URL As String
    Dim m_Hwd As Long
    On Error GoTo errores
    m_URL = GenerarArchivoConHTML(p_Mensaje, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    m_Hwd = 1
    Ejecutar m_Hwd, "open", m_URL, "", "", 1
    
    
    AbrirHTMLEnLocal = m_URL
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método AbrirHTMLEnLocal ha devuelto el error: " & vbNewLine & Err.Description
    End If
   
End Function
Public Function HTMTLDatosGeneralesProyecto( _
                                                p_NC As NCProyecto, _
                                                Optional ByRef p_Error As String _
                                                ) As String
    
    Dim m_mensaje As String
    Dim m_ObjExpediente As Expediente
    Dim m_Tipo As TipologiaNCProyectos
    Dim m_Tecnico As usuario
    Dim m_TextoExpediente As String
    Dim m_JuridicaCalculada As String
    Dim m_ResponsableCalidadCalculado As String
    On Error GoTo errores
    
    p_Error = ""
    With p_NC
        Set m_ObjExpediente = .ExpedienteObj
        m_TextoExpediente = .ExpedienteCalculadoTexto
        m_JuridicaCalculada = .JuridicaCalculada
        m_ResponsableCalidadCalculado = .ResponsableCalidadCalculado
        Set m_Tecnico = .ResponsableTelefonicaObj
        Set m_Tipo = .TipoNCProyecto
        
    m_mensaje = "<section>" & vbNewLine
        m_mensaje = m_mensaje & "<h2>Estado</h2>" & vbNewLine
        m_mensaje = m_mensaje & "<p>" & m_ObjEntorno.ColEstadosNCTitulo(CStr(p_NC.EstadoEnum)) & "</p>" & vbNewLine
    m_mensaje = m_mensaje & "</section>" & vbNewLine
    m_mensaje = m_mensaje & "<section>" & vbNewLine
        m_mensaje = m_mensaje & "<h2>Descripción</h2>" & vbNewLine
        m_mensaje = m_mensaje & "<p>" & p_NC.Descripcion & "</p>" & vbNewLine
    m_mensaje = m_mensaje & "</section>" & vbNewLine
      
     m_mensaje = m_mensaje & "<section>" & vbNewLine
        m_mensaje = m_mensaje & "<h2>Causa y análisis</h2>" & vbNewLine
        m_mensaje = m_mensaje & "<p>" & p_NC.CausaYAnalisRaiz & "</p>" & vbNewLine
    m_mensaje = m_mensaje & "</section>" & vbNewLine
     
    m_mensaje = m_mensaje & "<section>" & vbNewLine
        m_mensaje = m_mensaje & "<div class=""table-responsive"">" & vbNewLine
        m_mensaje = m_mensaje & "<table>" & vbNewLine
        m_mensaje = m_mensaje & "<tbody>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>Código</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td>" & .CodigoNoConformidad & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
        If Not .NCProyectoAsociada Is Nothing Then
          m_mensaje = m_mensaje & "<th>Vinculada</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td>" & .NCProyectoAsociada.CodigoNoConformidad & "</td>" & vbNewLine
        End If
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>Tipo</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td>" & m_Tipo.Tipologia & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>Entidad responsable</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td>" & .EntidadResponsable & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>Detectado por</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""valor"">" & .DetectadoPor & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>Técnico</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td>" & m_Tecnico.Nombre & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>Requiere C.E.</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td>" & .RequiereControlEficacia & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        If Not (.VEHICULO = "" Or .VEHICULO = "N/A") Then
             m_mensaje = m_mensaje & "<tr>" & vbNewLine
              m_mensaje = m_mensaje & "<th>Vehículo</th>" & vbNewLine
              m_mensaje = m_mensaje & "<td>" & .VEHICULO & "</td>" & vbNewLine
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
        End If
        If Not (.CodRiesgosAsociados = "") Then
             m_mensaje = m_mensaje & "<tr>" & vbNewLine
              m_mensaje = m_mensaje & "<th>Riesgos Asociados</th>" & vbNewLine
              m_mensaje = m_mensaje & "<td>" & .CodRiesgosAsociados & "</td>" & vbNewLine
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
        End If
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>Expediente</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td>" & m_TextoExpediente & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>Jurídica</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td>" & m_JuridicaCalculada & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        If .RequiereControlEficacia = "Sí" Then
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
              m_mensaje = m_mensaje & "<th>F.Prev. C.E.</th>" & vbNewLine
              m_mensaje = m_mensaje & "<td>" & .FechaPrevistaControlEficacia & "</td>" & vbNewLine
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
              m_mensaje = m_mensaje & "<th>C.E.</th>" & vbNewLine
              m_mensaje = m_mensaje & "<td>" & .ControlEficacia & "</td>" & vbNewLine
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
              m_mensaje = m_mensaje & "<th>Fecha C.E.</th>" & vbNewLine
              m_mensaje = m_mensaje & "<td>" & .FechaControlEficacia & "</td>" & vbNewLine
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
              m_mensaje = m_mensaje & "<th>Resultado C.E.</th>" & vbNewLine
              m_mensaje = m_mensaje & "<td>" & .ResultadoControlEficacia & "</td>" & vbNewLine
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
        End If
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>Resp. Calidad</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td>" & m_ResponsableCalidadCalculado & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>F.Apertura</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td>" & .FechaApertura & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>F. Prev. Cierre</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td>" & .FPREVCIERRE & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>F. Cierre</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td>" & .FECHACIERRE & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        
      m_mensaje = m_mensaje & "</tbody>" & vbNewLine
    m_mensaje = m_mensaje & "</section>" & vbNewLine
    m_mensaje = m_mensaje & "</table>" & vbNewLine
    m_mensaje = m_mensaje & "</div>" & vbNewLine
    
    
    
    End With
    
    HTMTLDatosGeneralesProyecto = m_mensaje
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo HTMTLDatosGeneralesProyecto ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function HTMTLTablaNCGeneralProyecto( _
                                                p_NC As NCProyecto, _
                                                Optional ByRef p_Error As String _
                                                ) As String
    
    Dim m_mensaje As String
    Dim m_ObjExpediente As Expediente
    Dim m_Tipo As TipologiaNCProyectos
    Dim m_Tecnico As usuario
    Dim m_TextoExpediente As String
    Dim m_JuridicaCalculada As String
    Dim m_ResponsableCalidadCalculado As String
    On Error GoTo errores
    
    p_Error = ""
    With p_NC
        Set m_ObjExpediente = .ExpedienteObj
        m_TextoExpediente = .ExpedienteCalculadoTexto
        m_JuridicaCalculada = .JuridicaCalculada
        m_ResponsableCalidadCalculado = .ResponsableCalidadCalculado
        Set m_Tecnico = .ResponsableTelefonicaObj
        Set m_Tipo = .TipoNCProyecto
    m_mensaje = "<div class=""table-title"">NC de proyecto " & .CodigoNoConformidad & "</div>" & vbNewLine
    m_mensaje = m_mensaje & "<table>" & vbNewLine
    m_mensaje = m_mensaje & "<tbody>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
        If Not .NCProyectoAsociada Is Nothing Then
          m_mensaje = m_mensaje & "<td class=""campo"">Vinculada</td>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""valor"">" & .NCProyectoAsociada.CodigoNoConformidad & "</td>" & vbNewLine
        End If
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""campo"">Estado</td>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""valor"">" & m_ObjEntorno.ColEstadosNCTitulo(CStr(.EstadoEnum)) & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""campo"">Descripción</td>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""valor"">" & .Descripcion & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""campo"">Causa y análisis</td>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""valor"">" & .CausaYAnalisRaiz & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""campo"">Tipo</td>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""valor"">" & m_Tipo.Tipologia & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""campo"">Entidad responsable</td>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""valor"">" & .EntidadResponsable & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""campo"">Detectado por</td>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""valor"">" & .DetectadoPor & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""campo"">Técnico</td>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""valor"">" & m_Tecnico.Nombre & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""campo"">Requiere C.E.</td>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""valor"">" & .RequiereControlEficacia & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        If .RequiereControlEficacia = "Sí" Then
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
              m_mensaje = m_mensaje & "<td class=""campo"">F.Prev. C.E.</td>" & vbNewLine
              m_mensaje = m_mensaje & "<td class=""valor"">" & .FechaPrevistaControlEficacia & "</td>" & vbNewLine
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
              m_mensaje = m_mensaje & "<td class=""campo"">C.E.</td>" & vbNewLine
              m_mensaje = m_mensaje & "<td class=""valor"">" & .ControlEficacia & "</td>" & vbNewLine
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
              m_mensaje = m_mensaje & "<td class=""campo"">Fecha C.E.</td>" & vbNewLine
              m_mensaje = m_mensaje & "<td class=""valor"">" & .FechaControlEficacia & "</td>" & vbNewLine
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
              m_mensaje = m_mensaje & "<td class=""campo"">Resultado C.E.</td>" & vbNewLine
              m_mensaje = m_mensaje & "<td class=""valor"">" & .ResultadoControlEficacia & "</td>" & vbNewLine
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
        End If
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""campo"">Vehículo</td>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""valor"">" & .VEHICULO & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""campo"">Concesión asoc.</td>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""valor"">" & .CodConcesionAsociada & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""campo"">Expediente</td>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""valor"">" & m_TextoExpediente & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""campo"">Jurídica</td>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""valor"">" & m_JuridicaCalculada & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""campo"">Resp. Calidad</td>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""valor"">" & m_ResponsableCalidadCalculado & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""campo"">F.Apertura</td>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""valor"">" & .FechaApertura & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""campo"">F. Prev. Cierre</td>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""valor"">" & .FPREVCIERRE & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""campo"">F. Cierre</td>" & vbNewLine
          m_mensaje = m_mensaje & "<td class=""valor"">" & .FECHACIERRE & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        If .Borrado = True Then
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
              m_mensaje = m_mensaje & "<td class=""campo"">Borrado</td>" & vbNewLine
              m_mensaje = m_mensaje & "<td class=""valor"">" & "Sí" & "</td>" & vbNewLine
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
              m_mensaje = m_mensaje & "<td class=""campo"">Motivo</td>" & vbNewLine
              m_mensaje = m_mensaje & "<td class=""valor"">" & .MotivoBorrado & "</td>" & vbNewLine
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
        End If
        If .Notas <> "" Then
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
              m_mensaje = m_mensaje & "<td class=""campo"">Notas</td>" & vbNewLine
              m_mensaje = m_mensaje & "<td class=""valor"">" & .Notas & "</td>" & vbNewLine
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
        End If
        If .CodRiesgosAsociados <> "" Then
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
              m_mensaje = m_mensaje & "<td class=""campo"">Riesgo asoc.</td>" & vbNewLine
              m_mensaje = m_mensaje & "<td class=""valor"">" & .CodRiesgosAsociados & ")" & "</td>" & vbNewLine
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
        End If
      m_mensaje = m_mensaje & "</tbody>" & vbNewLine
    m_mensaje = m_mensaje & "</table>" & vbNewLine
    
  
    
    
    End With
    
    HTMTLTablaNCGeneralProyecto = m_mensaje
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo HTMTLTablaNCGeneralProyecto ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function HTMTLDatosGeneralesAuditoria( _
                                                p_NC As NCAuditoria, _
                                                Optional ByRef p_Error As String _
                                                ) As String
    
    Dim m_mensaje As String
   
    On Error GoTo errores
    
    p_Error = ""
    With p_NC
    m_mensaje = "<section>" & vbNewLine
        m_mensaje = m_mensaje & "<h2>Estado</h2>" & vbNewLine
        m_mensaje = m_mensaje & "<p>" & m_ObjEntorno.ColEstadosNCTitulo(CStr(p_NC.EstadoEnum)) & "</p>" & vbNewLine
    m_mensaje = m_mensaje & "</section>" & vbNewLine
    m_mensaje = m_mensaje & "<section>" & vbNewLine
        m_mensaje = m_mensaje & "<h2>Descripción</h2>" & vbNewLine
        m_mensaje = m_mensaje & "<p>" & .Descripcion & "</p>" & vbNewLine
    m_mensaje = m_mensaje & "</section>" & vbNewLine
      
     m_mensaje = m_mensaje & "<section>" & vbNewLine
        m_mensaje = m_mensaje & "<h2>Causa y análisis</h2>" & vbNewLine
        m_mensaje = m_mensaje & "<p>" & .CAUSARAIZ & "</p>" & vbNewLine
    m_mensaje = m_mensaje & "</section>" & vbNewLine
    m_mensaje = m_mensaje & "<section>" & vbNewLine
        m_mensaje = m_mensaje & "<div class=""table-responsive"">" & vbNewLine
        m_mensaje = m_mensaje & "<table>" & vbNewLine
        m_mensaje = m_mensaje & "<tbody>" & vbNewLine
        
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>Auditoría</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td>" & .Auditoria.NombreAuditoria & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>Número</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td>" & .Numero & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>Tipo</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td>" & .Tipo & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>Requiere AC</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td>" & .RequiereAccionCorrectiva & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        
        If .RequiereAccionCorrectiva = "No" Then
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
              m_mensaje = m_mensaje & "<th>Motivo no AC</th>" & vbNewLine
              m_mensaje = m_mensaje & "<td>" & .MotivoNoAccionCorrectiva & "</td>" & vbNewLine
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
        End If
       
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>Punto norma</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td>" & .PuntoNorma & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>Responsable Implant.</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td>" & .RESPONSABLEIMPLANTACION & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>Requiere C.E.</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td>" & .ResultadoControlEficacia & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        If .RequiereControlEficacia = "Sí" Then
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
              m_mensaje = m_mensaje & "<th>F.Prev. C.E.</th>" & vbNewLine
              m_mensaje = m_mensaje & "<td>" & .FechaPrevistaControlEficacia & "</td>" & vbNewLine
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
              m_mensaje = m_mensaje & "<th>C.E.</th>" & vbNewLine
              m_mensaje = m_mensaje & "<td>" & .ControlEficacia & "</td>" & vbNewLine
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
              m_mensaje = m_mensaje & "<th>Fecha C.E.</th>" & vbNewLine
              m_mensaje = m_mensaje & "<td>" & .FechaControlEficacia & "</td>" & vbNewLine
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
              m_mensaje = m_mensaje & "<th>Resultado C.E.</th>" & vbNewLine
              m_mensaje = m_mensaje & "<td>" & .ResultadoControlEficacia & "</td>" & vbNewLine
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
        End If
                
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>F.Apertura</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td>" & .FechaApertura & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>F. Prev. Cierre</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td>" & .FPREVCIERRE & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>F. Cierre</th>" & vbNewLine
          m_mensaje = m_mensaje & "<td>" & .FECHACIERRE & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        
      m_mensaje = m_mensaje & "</tbody>" & vbNewLine
    m_mensaje = m_mensaje & "</section>" & vbNewLine
    m_mensaje = m_mensaje & "</table>" & vbNewLine
    m_mensaje = m_mensaje & "</div>" & vbNewLine
    End With
    
    
    HTMTLDatosGeneralesAuditoria = m_mensaje
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo HTMTLDatosGeneralesAuditoria ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function HTMLTablaACProyecto( _
                                        p_AC As ACProyecto, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    
    Dim m_mensaje As String
    Dim m_TablaTareas As String
    On Error GoTo errores
    
    p_Error = ""
    
    m_mensaje = "<section>" & vbNewLine
    m_mensaje = m_mensaje & "<h2>Acción Nº " & p_AC.NAccion & " " & p_AC.AccionCorrectiva & "</h2>" & vbNewLine
    m_mensaje = m_mensaje & "<div class=""table-responsive"">" & vbNewLine
    
       
    If Not p_AC.ARs Is Nothing Then
        m_TablaTareas = HTMLTablaARsProyecto(p_AC, p_Error)
         If p_Error <> "" Then
             Err.Raise 1000
         End If
        
         m_mensaje = m_mensaje & m_TablaTareas & vbNewLine
    End If
    m_mensaje = m_mensaje & "</div>" & vbNewLine
    m_mensaje = m_mensaje & "</section>" & vbNewLine
    HTMLTablaACProyecto = m_mensaje
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo HTMLTablaACProyecto ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function HTMLTablaACAuditoria( _
                                        p_AC As ACAuditoria, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    
    Dim m_mensaje As String
    Dim m_TablaTareas As String
    On Error GoTo errores
    
    p_Error = ""
    
    m_mensaje = "<section>" & vbNewLine
    m_mensaje = m_mensaje & "<h2>Acción Nº " & p_AC.NAccion & " " & p_AC.AccionCorrectiva & "</h2>" & vbNewLine
    m_mensaje = m_mensaje & "<div class=""table-responsive"">" & vbNewLine
    
       
    If Not p_AC.ARs Is Nothing Then
        m_TablaTareas = HTMLTablaARsAuditoria(p_AC, p_Error)
         If p_Error <> "" Then
             Err.Raise 1000
         End If
        
         m_mensaje = m_mensaje & m_TablaTareas & vbNewLine
    End If
    m_mensaje = m_mensaje & "</div>" & vbNewLine
    m_mensaje = m_mensaje & "</section>" & vbNewLine
        
        
    HTMLTablaACAuditoria = m_mensaje
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo HTMLTablaACAuditoria ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function HTMLTablaARsProyecto( _
                                        p_AC As ACProyecto, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    Dim m_AR As ARProyecto
    Dim m_ID As Variant
    Dim m_mensaje As String
    Dim m_Responsable As String
    On Error GoTo errores
    
    p_Error = ""
    
    
    m_mensaje = m_mensaje & "<table class=""table-responsive"">" & vbNewLine
    m_mensaje = m_mensaje & "<thead>" & vbNewLine
        
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>Nº </th>" & vbNewLine
          m_mensaje = m_mensaje & "<th>Tarea </th>" & vbNewLine
          m_mensaje = m_mensaje & "<th>F.Inicio </th>" & vbNewLine
          m_mensaje = m_mensaje & "<th>F.fin prev. </th>" & vbNewLine
          m_mensaje = m_mensaje & "<th>F.fin real </th>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "</thead>" & vbNewLine
        m_mensaje = m_mensaje & "<tbody>" & vbNewLine
        If p_AC.ARs Is Nothing Then
            GoTo fin
        End If
        For Each m_ID In p_AC.ARs
            Set m_AR = p_AC.ARs(m_ID)
                m_mensaje = m_mensaje & "<tr>" & vbNewLine
                  m_mensaje = m_mensaje & "<td>" & m_AR.NAccion & " </td>" & vbNewLine
                  m_mensaje = m_mensaje & "<td>" & m_AR.AccionRealizada & " </td>" & vbNewLine
                  m_mensaje = m_mensaje & "<td>" & m_AR.FechaInicio & " </td>" & vbNewLine
                  m_mensaje = m_mensaje & "<td>" & m_AR.FechaFinPrevista & " </td>" & vbNewLine
                  m_mensaje = m_mensaje & "<td>" & m_AR.FechaFinReal & " </td>" & vbNewLine
                m_mensaje = m_mensaje & "</tr>" & vbNewLine
            Set m_AR = Nothing
        Next
        
fin:
      m_mensaje = m_mensaje & "</tbody>" & vbNewLine
    m_mensaje = m_mensaje & "</table>" & vbNewLine
   HTMLTablaARsProyecto = m_mensaje
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo HTMLTablaARsProyecto ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function HTMLTablaARsAuditoria( _
                                        p_AC As ACAuditoria, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    Dim m_AR As ARAuditoria
    Dim m_ID As Variant
    Dim m_mensaje As String
    Dim m_Responsable As String
    On Error GoTo errores
    
    p_Error = ""
    m_mensaje = m_mensaje & "<table class=""table-responsive"">" & vbNewLine
    m_mensaje = m_mensaje & "<thead>" & vbNewLine
        
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
          m_mensaje = m_mensaje & "<th>Nº </th>" & vbNewLine
          m_mensaje = m_mensaje & "<th>Tarea </th>" & vbNewLine
          m_mensaje = m_mensaje & "<th>F.Inicio </th>" & vbNewLine
          m_mensaje = m_mensaje & "<th>F.fin prev. </th>" & vbNewLine
          m_mensaje = m_mensaje & "<th>F.fin real </th>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        m_mensaje = m_mensaje & "</thead>" & vbNewLine
        m_mensaje = m_mensaje & "<tbody>" & vbNewLine
        If p_AC.ARs Is Nothing Then
            GoTo fin
        End If
        For Each m_ID In p_AC.ARs
            Set m_AR = p_AC.ARs(m_ID)
                m_mensaje = m_mensaje & "<tr>" & vbNewLine
                  m_mensaje = m_mensaje & "<td>" & m_AR.NAccion & " </td>" & vbNewLine
                  m_mensaje = m_mensaje & "<td>" & m_AR.AccionRealizada & " </td>" & vbNewLine
                  m_mensaje = m_mensaje & "<td>" & m_AR.FechaInicio & " </td>" & vbNewLine
                  m_mensaje = m_mensaje & "<td>" & m_AR.FechaFinPrevista & " </td>" & vbNewLine
                  m_mensaje = m_mensaje & "<td>" & m_AR.FechaFinReal & " </td>" & vbNewLine
                m_mensaje = m_mensaje & "</tr>" & vbNewLine
            Set m_AR = Nothing
        Next
        
fin:
      m_mensaje = m_mensaje & "</tbody>" & vbNewLine
    m_mensaje = m_mensaje & "</table>" & vbNewLine
   HTMLTablaARsAuditoria = m_mensaje
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo HTMLTablaARsAuditoria ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function HTMTablaExpediente( _
                                    p_Expediente As Expediente, _
                                    Optional ByRef p_Error As String _
                                    ) As String

    Dim m_mensaje As String
   
    
    On Error GoTo errores
    
    p_Error = ""
    
    m_mensaje = "<table>" & vbNewLine
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
        m_mensaje = m_mensaje & "<td colspan='7' class=""ColespanArriba""> DATOS DE EXPEDIENTE </td>"
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
    With p_Expediente
    m_mensaje = m_mensaje & "<tr>" & vbNewLine
        m_mensaje = m_mensaje & "<td class=""Cabecera"">CÓDIGO</td>" & vbNewLine
        m_mensaje = m_mensaje & "<td class=""Cabecera"">ACTIVIDAD</td>" & vbNewLine
        m_mensaje = m_mensaje & "<td class=""Cabecera"">NEMOTÉCNICO</td>" & vbNewLine
        m_mensaje = m_mensaje & "<td class=""Cabecera"">RESPONSABLE CALIDAD</td>" & vbNewLine
        m_mensaje = m_mensaje & "<td class=""Cabecera"">TÍTULO</td>" & vbNewLine
        m_mensaje = m_mensaje & "<td class=""Cabecera"">JURÍDICAS</td>" & vbNewLine
        m_mensaje = m_mensaje & "<td class=""Cabecera"">PECAL</td>" & vbNewLine
    m_mensaje = m_mensaje & "</tr>" & vbNewLine
    m_mensaje = m_mensaje & "<tr>" & vbNewLine
        If .CodExp <> "" Then
            m_mensaje = m_mensaje & "<td> " & .CodExp & " </td>" & vbNewLine
        Else
            m_mensaje = m_mensaje & "<td> &nbsp </td>" & vbNewLine
        End If
        If .CodigoActividad <> "" Then
            m_mensaje = m_mensaje & "<td> " & .CodigoActividad & " </td>" & vbNewLine
        Else
            m_mensaje = m_mensaje & "<td> &nbsp </td>" & vbNewLine
        End If
        If .Nemotecnico <> "" Then
            m_mensaje = m_mensaje & "<td> " & .Nemotecnico & " </td>" & vbNewLine
        Else
            m_mensaje = m_mensaje & "<td> &nbsp </td>" & vbNewLine
        End If
        If .RESPONSABLECALIDAD <> "" Then
            m_mensaje = m_mensaje & "<td> " & .RESPONSABLECALIDAD & " </td>" & vbNewLine
        Else
            m_mensaje = m_mensaje & "<td> &nbsp </td>" & vbNewLine
        End If
        If .Titulo <> "" Then
            m_mensaje = m_mensaje & "<td> " & .Titulo & " </td>" & vbNewLine
        Else
            m_mensaje = m_mensaje & "<td> &nbsp </td>" & vbNewLine
        End If
        If .CadenaJuridicas <> "" Then
            m_mensaje = m_mensaje & "<td> " & .CadenaJuridicas & " </td>" & vbNewLine
        Else
            m_mensaje = m_mensaje & "<td> &nbsp </td>" & vbNewLine
        End If
        If .CadenaPecal <> "" Then
            m_mensaje = m_mensaje & "<td> " & .CadenaPecal & " </td>" & vbNewLine
        Else
            m_mensaje = m_mensaje & "<td> &nbsp </td>" & vbNewLine
        End If
    m_mensaje = m_mensaje & "</tr>" & vbNewLine
    
    
    End With
    m_mensaje = m_mensaje & "</table>" & vbNewLine
    HTMTablaExpediente = m_mensaje
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo HTMTablaExpediente ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Public Function HTMLNCProyecto( _
                                p_NC As NCProyecto, _
                                Optional p_ConAcciones As EnumSino = EnumSino.No, _
                                Optional p_SoloTablas As EnumSino = EnumSino.No, _
                                Optional ByRef p_Error As String _
                                ) As String
    Dim m_TablaDatos As String
    Dim m_TablaAccion As String
    Dim m_Cabecera As String
    Dim m_mensaje As String
    Dim m_ID As Variant
    Dim m_AC As ACProyecto
    Dim m_TablaAC As String
    Dim m_ColTablasAC As New Collection
    Dim m_mensajeTablaAC As Variant
    
    On Error GoTo errores
    
    If p_NC Is Nothing Then
        Exit Function
    End If
    If p_SoloTablas = EnumSino.No Then
        m_Cabecera = DameCabeceraHTML("NC " & p_NC.CodigoNoConformidad, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    m_TablaDatos = HTMTLDatosGeneralesProyecto(p_NC, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If p_ConAcciones = EnumSino.Sí Then
        If Not p_NC.ACs Is Nothing Then
            For Each m_ID In p_NC.ACs
                Set m_AC = p_NC.ACs(m_ID)
                m_TablaAC = HTMLTablaACProyecto(m_AC, p_Error)
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
                If m_TablaAC <> "" Then
                    m_ColTablasAC.Add m_TablaAC
                End If
                Set m_AC = Nothing
            Next
        End If
        
    End If
    If p_SoloTablas = EnumSino.No Then
        m_mensaje = m_Cabecera & vbNewLine
    End If
   
    
    
    m_mensaje = m_mensaje & m_TablaDatos & vbNewLine
    
    If m_ColTablasAC.count > 0 Then
        For Each m_mensajeTablaAC In m_ColTablasAC
            
            m_mensaje = m_mensaje & m_mensajeTablaAC & vbNewLine
            
        Next
    End If
    
    
    If p_SoloTablas = EnumSino.No Then
        
        m_mensaje = m_mensaje & "</body>" & vbNewLine
        m_mensaje = m_mensaje & "</html>" & vbNewLine
    End If
    
    HTMLNCProyecto = m_mensaje
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo HTMLNCProyecto ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function HTMLNCAuditoria( _
                                p_NC As NCAuditoria, _
                                Optional p_ConAcciones As EnumSino = EnumSino.No, _
                                Optional p_SoloTablas As EnumSino = EnumSino.No, _
                                Optional ByRef p_Error As String _
                                ) As String
   Dim m_TablaDatos As String
    Dim m_TablaAccion As String
    Dim m_Cabecera As String
    Dim m_mensaje As String
    Dim m_ID As Variant
    Dim m_AC As ACAuditoria
    Dim m_TablaAC As String
    Dim m_ColTablasAC As New Collection
    Dim m_mensajeTablaAC As Variant
    
    On Error GoTo errores
    
    If p_NC Is Nothing Then
        Exit Function
    End If
    If p_SoloTablas = EnumSino.No Then
        m_Cabecera = DameCabeceraHTML("NC Auditoría " & Format(p_NC.Numero, "00"), p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    m_TablaDatos = HTMTLDatosGeneralesAuditoria(p_NC, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If p_ConAcciones = EnumSino.Sí And p_NC.RequiereAccionCorrectiva = "Sí" Then
        If Not p_NC.ACs Is Nothing Then
            For Each m_ID In p_NC.ACs
                Set m_AC = p_NC.ACs(m_ID)
                m_TablaAC = HTMLTablaACAuditoria(m_AC, p_Error)
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
                If m_TablaAC <> "" Then
                    m_ColTablasAC.Add m_TablaAC
                End If
                Set m_AC = Nothing
            Next
        End If
        
    End If
    If p_SoloTablas = EnumSino.No Then
        m_mensaje = m_Cabecera & vbNewLine
    End If
   
    
    
    m_mensaje = m_mensaje & m_TablaDatos & vbNewLine
    
    If m_ColTablasAC.count > 0 Then
        For Each m_mensajeTablaAC In m_ColTablasAC
            
            m_mensaje = m_mensaje & m_mensajeTablaAC & vbNewLine
            
        Next
    End If
    
    
    If p_SoloTablas = EnumSino.No Then
        
        m_mensaje = m_mensaje & "</body>" & vbNewLine
        m_mensaje = m_mensaje & "</html>" & vbNewLine
    End If
    
    
    HTMLNCAuditoria = m_mensaje
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo HTMLNCAuditoria ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function HTMLNCProyectos( _
                                p_col As Scripting.Dictionary, _
                                Optional p_ConAcciones As EnumSino = EnumSino.No, _
                                Optional ByRef p_Error As String _
                                ) As String
    
    Dim m_mensaje As String
    Dim m_Cabecera As String
    Dim m_mensajeNC As String
    Dim m_ID As Variant
    Dim m_NC As NCProyecto
    
    Dim m_mensajeTablaNC As String
    
    On Error GoTo errores
    
    If p_col Is Nothing Then
        Exit Function
    End If
    
    m_Cabecera = DameCabeceraHTML("Listado de NC de Proyecto", p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    m_mensaje = m_Cabecera & vbNewLine
    
    For Each m_ID In p_col
        Set m_NC = p_col(m_ID)
        m_mensajeNC = HTMLNCProyecto(p_NC:=m_NC, p_ConAcciones:=EnumSino.Sí, p_SoloTablas:=EnumSino.Sí, p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        m_mensaje = m_mensaje & m_mensajeNC & vbNewLine
        Set m_NC = Nothing
    Next
    
    m_mensaje = m_mensaje & "</div>" & vbNewLine
    m_mensaje = m_mensaje & "</body>" & vbNewLine
    m_mensaje = m_mensaje & "</html>" & vbNewLine
    
    HTMLNCProyectos = m_mensaje
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo HTMLNCProyectos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function HTMLNCAuditorias( _
                                p_col As Scripting.Dictionary, _
                                Optional p_ConAcciones As EnumSino = EnumSino.No, _
                                Optional ByRef p_Error As String _
                                ) As String
    
    Dim m_mensaje As String
    Dim m_Cabecera As String
    Dim m_mensajeNC As String
    Dim m_ID As Variant
    Dim m_NC As NCAuditoria
    
    Dim m_mensajeTablaNC As String
    
    On Error GoTo errores
    
    If p_col Is Nothing Then
        Exit Function
    End If
    
    m_Cabecera = DameCabeceraHTML("Listado de NC de Auditoria", p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    m_mensaje = m_Cabecera & vbNewLine
   
    For Each m_ID In p_col
        Set m_NC = p_col(m_ID)
        m_mensajeNC = HTMLNCAuditoria(p_NC:=m_NC, p_ConAcciones:=EnumSino.Sí, p_SoloTablas:=EnumSino.Sí, p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        m_mensaje = m_mensaje & m_mensajeNC & vbNewLine
        Set m_NC = Nothing
    Next
    
    
    m_mensaje = m_mensaje & "</body>" & vbNewLine
    m_mensaje = m_mensaje & "</html>" & vbNewLine
    
    HTMLNCAuditorias = m_mensaje
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo HTMLNCAuditorias ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function DameCabeceraHTML( _
                                    p_Titulo As String, _
                                    Optional ByRef p_Error As String _
                                    ) As String
   
    Dim m_mensaje As String
    On Error GoTo errores
    
    m_mensaje = "<!DOCTYPE html>" & vbNewLine
    m_mensaje = m_mensaje & "<html lang=""es"">" & vbNewLine
    m_mensaje = m_mensaje & "<head>" & vbNewLine
    'm_mensaje = m_mensaje & "<meta http-equiv=""Content-Type"" content=""text/html; charset=utf-8"">" & vbNewLine
    m_mensaje = m_mensaje & "<meta charset=""ISO-8859-1"" />" & vbNewLine
    m_mensaje = m_mensaje & "<meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">" & vbNewLine
    m_mensaje = m_mensaje & "<title>" & p_Titulo & "</title>" & vbNewLine
    m_mensaje = m_mensaje & m_ObjEntorno.CSS1 & vbNewLine
    
    
    m_mensaje = m_mensaje & "</head>" & vbNewLine
    m_mensaje = m_mensaje & "<body>" & vbNewLine
    
    
    DameCabeceraHTML = m_mensaje
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo DameCabeceraHTML ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function HTMLEnviador( _
                                Optional ByRef p_Error As String _
                                ) As String
    Dim m_mensaje As String
    
    
    On Error GoTo errores
    
    p_Error = ""
    
    m_mensaje = m_mensaje & "<a href='mailto:" & m_ObjUsuarioConectado.CorreoUsuario & _
                "'>correo enviado por No Conformidades en nombre de: " & m_ObjUsuarioConectado.Nombre & "</a>" & vbNewLine
    HTMLEnviador = m_mensaje
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo HTMLEnviador ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function HTMLFinal( _
                            Optional ByRef p_Error As String _
                            ) As String
    Dim m_mensaje As String
    
    
    On Error GoTo errores
    
    p_Error = ""
    
    m_mensaje = m_mensaje & "<br /><br />" & vbNewLine
    m_mensaje = m_mensaje & "<p><strong>¡¡¡NO RESPONDA A ESTE CORREO (es un mensaje automático)!!!</strong></p>" & vbNewLine
        
    m_mensaje = m_mensaje & "</body>" & vbNewLine
    m_mensaje = m_mensaje & "</html>" & vbNewLine
    HTMLFinal = m_mensaje
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo HTMLFinal ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function HTMLAltaNC( _
                            ByRef p_NC As NCProyecto, _
                            Optional ByRef p_Error As String _
                            ) As String
    Dim m_mensaje As String
    Dim m_NensajeCabecera As String
    Dim m_MensajeEnviador As String
    Dim m_mensajeNC As String
    Dim m_MensajeTitulo As String
    
   
    
    On Error GoTo errores
    
    p_Error = ""
    m_NensajeCabecera = DameCabeceraHTML("Alta NC de Proyecto", p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    m_MensajeEnviador = HTMLEnviador(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    m_MensajeTitulo = "<h2>Alta de No Conformidad " & p_NC.CodigoNoConformidad & "</h2>" & vbNewLine
    
    m_mensajeNC = HTMLNCProyecto(p_NC:=p_NC, p_ConAcciones:=EnumSino.Sí, p_SoloTablas:=EnumSino.Sí, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    m_mensaje = m_NensajeCabecera & vbNewLine
    m_mensaje = m_mensaje & "<div class=""container"">" & vbNewLine
    m_mensaje = m_mensaje & m_MensajeEnviador & vbNewLine
    m_mensaje = m_mensaje & m_MensajeTitulo & vbNewLine
    m_mensaje = m_mensaje & m_mensajeNC & vbNewLine
    m_mensaje = m_mensaje & "</div>" & vbNewLine
    m_mensaje = m_mensaje & "</body>" & vbNewLine
    m_mensaje = m_mensaje & "</html>" & vbNewLine
    HTMLAltaNC = m_mensaje
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo HTMLAltaNC ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function HTMLAltaNCAuditoria( _
                                        ByRef p_NC As NCAuditoria, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    Dim m_mensaje As String
    Dim m_NensajeCabecera As String
    Dim m_MensajeEnviador As String
    Dim m_mensajeNC As String
    Dim m_MensajeTitulo As String
    
   
    
    On Error GoTo errores
    
    p_Error = ""
    m_NensajeCabecera = DameCabeceraHTML("Alta NC de Auditoria", p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    m_MensajeEnviador = HTMLEnviador(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    m_MensajeTitulo = "<h2>Alta de " & CapitalizarOracion(p_NC.Particula) & " de auditoría " & p_NC.Auditoria.NombreAuditoria & " " & _
        Format(p_NC.Numero, "00") & "</h2>" & vbNewLine
    
    m_mensajeNC = HTMLNCAuditoria(p_NC:=p_NC, p_ConAcciones:=EnumSino.Sí, p_SoloTablas:=EnumSino.Sí, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    m_mensaje = m_NensajeCabecera & vbNewLine
    m_mensaje = m_mensaje & "<div class=""container"">" & vbNewLine
    m_mensaje = m_mensaje & m_MensajeEnviador & vbNewLine
    m_mensaje = m_mensaje & m_MensajeTitulo & vbNewLine
    m_mensaje = m_mensaje & m_mensajeNC & vbNewLine
    m_mensaje = m_mensaje & "</div>" & vbNewLine
    m_mensaje = m_mensaje & "</body>" & vbNewLine
    m_mensaje = m_mensaje & "</html>" & vbNewLine
    HTMLAltaNCAuditoria = m_mensaje
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo HTMLAltaNCAuditoria ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

