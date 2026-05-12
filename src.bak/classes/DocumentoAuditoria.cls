VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "DocumentoAuditoria"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDDocumento As String
Public IDNoConformidad As String
Public Documento As String
Public NombreAnexo As String
Public IDAccionRealizada As String
Public IDAuditoria As String
Public IDAuditoriaResultante As String

Private m_ObjAuditoria As Auditoria
Private m_ObjNC As NCAuditoria
Private m_ObjAR As ARAuditoria

Private m_ObjAuditoriaResultante As Auditoria
Private m_sIDAuditoriaResultanteCalculado As String
Private m_sIDDocumentoCalculado As String
Private m_eTipoAnexo As EnumTipoAnexoAuditoria
Private m_sURLAnexo As String
Private m_sURLDirectorioAnexo As String
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get IDAuditoriaResultanteCalculado() As String
    
    Dim m_
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
        
    If Me.AuditoriaResultante Is Nothing Then
        Exit Property
    End If
    
    m_sIDAuditoriaResultanteCalculado = Me.AuditoriaResultante.IDAuditoria
    IDAuditoriaResultanteCalculado = m_sIDAuditoriaResultanteCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método DocumentoAuditoria.IDAuditoriaResultanteCalculado ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get AuditoriaResultante() As Auditoria
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Not m_ObjAuditoriaResultante Is Nothing Then
        Set AuditoriaResultante = m_ObjAuditoriaResultante
        Exit Property
    End If
    If Not Me.Auditoria Is Nothing Then
        Set m_ObjAuditoriaResultante = Me.Auditoria
        Set AuditoriaResultante = m_ObjAuditoriaResultante
        Exit Property
    End If
    If Not Me.nc Is Nothing Then
        Set m_ObjAuditoriaResultante = Me.nc.Auditoria
        Set AuditoriaResultante = m_ObjAuditoriaResultante
        Exit Property
    End If
    If Not Me.AR Is Nothing Then
        Set m_ObjAuditoriaResultante = Me.AR.AC.nc.Auditoria
        Set AuditoriaResultante = m_ObjAuditoriaResultante
        Exit Property
    End If
    Set AuditoriaResultante = m_ObjAuditoriaResultante
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método DocumentoAuditoria.AuditoriaResultante ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get URLDirectorioAnexo() As String
    
    Dim m_
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLDirectorioAnexo <> "" Then
        URLDirectorioAnexo = m_sURLDirectorioAnexo
        Exit Property
    End If
    
    m_sURLDirectorioAnexo = Me.getURLDirectorioAnexo(EnumSino.No, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    URLDirectorioAnexo = m_sURLDirectorioAnexo
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método DocumentoAuditoria.URLDirectorioAnexo ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get URLAnexo() As String
    Dim m_Carpeta As String
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If m_sURLAnexo <> "" Then
        URLAnexo = m_sURLAnexo
        Exit Property
    End If
    If Me.NombreAnexo = "" Then
        Exit Property
    End If
    m_Carpeta = Me.URLDirectorioAnexo
    m_Error = Me.Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    m_sURLAnexo = m_Carpeta & Me.NombreAnexo
    
    URLAnexo = m_sURLAnexo
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método DocumentoAuditoria.URLAnexo ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get IDDocumentoCalculado() As String
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    m_sIDDocumentoCalculado = constructor.getID("TbDocumentosAuditorias", "IDDocumento", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDDocumentoCalculado = m_sIDDocumentoCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método DocumentoAuditoria.IDDocumentoCalculado ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get TipoAnexo() As EnumTipoAnexoAuditoria
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If m_eTipoAnexo <> Empty Then
        TipoAnexo = m_eTipoAnexo
        Exit Property
    End If
    If Me.IDAuditoria <> "" Then
        m_eTipoAnexo = EnumTipoAnexoAuditoria.Auditoria
        TipoAnexo = m_eTipoAnexo
        Exit Property
    End If
    If Me.IDNoConformidad <> "" Then
        m_eTipoAnexo = EnumTipoAnexoAuditoria.nc
        TipoAnexo = m_eTipoAnexo
        Exit Property
    End If
    If Me.IDAccionRealizada <> "" Then
        m_eTipoAnexo = EnumTipoAnexoAuditoria.AR
        TipoAnexo = m_eTipoAnexo
        Exit Property
    End If
   
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método DocumentoAuditoria.TipoAnexo ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Property Get AR() As ARAuditoria
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Not m_ObjAR Is Nothing Then
        Set AR = m_ObjAR
        Exit Property
    End If
    If Me.IDAccionRealizada = "" Then
        Exit Property
    End If
    Set m_ObjAR = constructor.getARAuditoria(p_IDAR:=Me.IDAccionRealizada, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set AR = m_ObjAR
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método DocumentoAuditoria.AR ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get nc() As NCAuditoria
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Not m_ObjNC Is Nothing Then
        Set nc = m_ObjNC
        Exit Property
    End If
    If Me.IDNoConformidad = "" Then
        Exit Property
    End If
    Set m_ObjNC = constructor.getNCAuditoria(p_IDNC:=Me.IDNoConformidad, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set nc = m_ObjNC
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método DocumentoAuditoria.NC ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get Auditoria() As Auditoria
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Not m_ObjAuditoria Is Nothing Then
        Set Auditoria = m_ObjAuditoria
        Exit Property
    End If
    If Me.IDAuditoria = "" Then
        Exit Property
    End If
    Set m_ObjAuditoria = constructor.getAuditoria(p_ID:=Me.IDAuditoria, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Auditoria = m_ObjAuditoria
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método DocumentoAuditoria.Auditoria ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Function getURLAnexoFinal( _
                                    p_URLLocal As String, _
                                    Optional p_Creandolo As EnumSino = EnumSino.Sí, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    Dim m_NombreAnexo As String
    Dim m_Carpeta As String
   
    On Error GoTo errores
    
    If p_URLLocal = "" Then
        p_Error = "Falta URLLocal"
        Err.Raise 1000
    End If
    m_Carpeta = getURLDirectorioAnexo(p_Creandolo, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If Me.IDAuditoria <> "" Then
        
        m_NombreAnexo = getNombreAnexoAuditoriaCalculado(p_URLLocal:=p_URLLocal, p_Error:=p_Error)
    ElseIf Me.IDNoConformidad <> "" Then
        
        m_NombreAnexo = getNombreAnexoNCCalculado(p_URLLocal:=p_URLLocal, p_Error:=p_Error)
    ElseIf Me.IDAccionRealizada <> "" Then
        
        m_NombreAnexo = getNombreAnexoARCalculado(p_URLLocal:=p_URLLocal, p_Error:=p_Error)
    End If
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    getURLAnexoFinal = m_Carpeta & m_NombreAnexo
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método DocumentoAuditoria.getURLAnexoFinal ha producido el error nº: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function
Public Function getURLDirectorioAnexo( _
                                    p_Creandolo As EnumSino, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_CarpetaAuditoria As String
    Dim m_CarpetaNC As String
    Dim m_CarpetaAR As String
    Dim m_Carpeta As String
    On Error GoTo errores
    
    If p_Creandolo = Empty Then
        p_Creandolo = EnumSino.No
    End If
    
    
    m_CarpetaAuditoria = Me.AuditoriaResultante.URLDirectorio
    If m_CarpetaAuditoria = "" Then
        p_Error = "No se ha podido obtener el directorio del anexo"
        Err.Raise 1000
    End If
    If Me.IDAuditoria <> "" Then
        m_Carpeta = m_CarpetaAuditoria
        If p_Creandolo = EnumSino.Sí Then
            
            If Not fso.FolderExists(m_Carpeta) Then
                fso.CreateFolder m_Carpeta
            End If
        End If
        getURLDirectorioAnexo = m_Carpeta
        Exit Function
    End If
    If Me.IDNoConformidad <> "" Then
        
        m_Carpeta = m_CarpetaAuditoria & "NC" & Format(Me.nc.Numero, "00") & "\"
        If p_Creandolo = EnumSino.Sí Then
            If Not fso.FolderExists(m_CarpetaAuditoria) Then
                fso.CreateFolder m_CarpetaAuditoria
            End If
            If Not fso.FolderExists(m_Carpeta) Then
                fso.CreateFolder m_Carpeta
            End If
        End If
        getURLDirectorioAnexo = m_Carpeta
        Exit Function
    End If
    If Me.IDAccionRealizada <> "" Then
        m_CarpetaNC = m_CarpetaAuditoria & "NC" & Format(Me.AR.AC.nc.Numero, "00") & "\"
        m_CarpetaAR = m_CarpetaNC & "AR" & Format(Me.AR.NAccion, "00") & "\"
        m_Carpeta = m_CarpetaAR
        If p_Creandolo = EnumSino.Sí Then
            If Not fso.FolderExists(m_CarpetaAuditoria) Then
                fso.CreateFolder m_CarpetaAuditoria
            End If
            If Not fso.FolderExists(m_CarpetaNC) Then
                fso.CreateFolder m_CarpetaNC
            End If
            If Not fso.FolderExists(m_CarpetaAR) Then
                fso.CreateFolder m_CarpetaAR
            End If
        End If
        getURLDirectorioAnexo = m_Carpeta
        Exit Function
    End If
    
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método DocumentoAuditoria.getURLDirectorioAnexo ha producido el error nº: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function
Private Function getNombreAnexoAuditoriaCalculado( _
                                                    p_URLLocal As String, _
                                                    Optional ByRef p_Error As String _
                                                    ) As String
    Dim m_ColAnexos As Scripting.Dictionary
    Dim m_Anexo As DocumentoAuditoria
    Dim m_ID As Variant
    Dim lngOrdinalMax As Long
    Dim m_Auditoria As Auditoria
    Dim dato As Variant
    Dim m_trozoNumerico As String
    Dim m_NombreArchivo As String
    Dim m_Extension As String
    On Error GoTo errores
    
    If p_URLLocal = "" Then
        p_Error = "Falta URLLocal"
        Err.Raise 1000
    End If
    m_Extension = fso.GetExtensionName(p_URLLocal)
    Set m_Auditoria = Me.Auditoria
    p_Error = Me.Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Auditoria Is Nothing Then
        p_Error = "No se conoce la No Conformidad asociada"
        Err.Raise 1000
    End If
    Set m_ColAnexos = m_Auditoria.Documentos
    If Not m_ColAnexos Is Nothing Then
        For Each m_ID In m_ColAnexos
            Set m_Anexo = m_ColAnexos(m_ID)
            m_NombreArchivo = fso.GetBaseName(m_Anexo.URLAnexo)
            'NC0001_01.pdf
            If InStr(1, m_NombreArchivo, "_") <> 0 Then
                dato = Split(m_NombreArchivo, "_")
                m_trozoNumerico = dato(UBound(dato))
                If IsNumeric(m_trozoNumerico) Then
                    If CLng(m_trozoNumerico) > lngOrdinalMax Then
                        lngOrdinalMax = CLng(m_trozoNumerico)
                    End If
                End If
            End If
            Set m_Anexo = Nothing
        Next
    End If
    If m_Extension <> "" Then
        getNombreAnexoAuditoriaCalculado = "AU_" & Format(lngOrdinalMax + 1, "00") & "." & m_Extension
    Else
        getNombreAnexoAuditoriaCalculado = "AU_" & Format(lngOrdinalMax + 1, "00")
    End If
    
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método DocumentoAuditoria.getNombreAnexoAuditoriaCalculado ha producido el error nº: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function
Private Function getNombreAnexoNCCalculado( _
                                            p_URLLocal As String, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    Dim m_ColAnexos As Scripting.Dictionary
    Dim m_Anexo As DocumentoAuditoria
    Dim m_ID As Variant
    Dim lngOrdinalMax As Long
    Dim m_NC As NCAuditoria
    Dim dato As Variant
    Dim m_trozoNumerico As String
    Dim m_NombreArchivo As String
    On Error GoTo errores
    
    If p_URLLocal = "" Then
        p_Error = "Falta URLLocal"
        Err.Raise 1000
    End If
    Set m_NC = Me.nc
    p_Error = Me.Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_NC Is Nothing Then
        p_Error = "No se conoce la No Conformidad asociada"
        Err.Raise 1000
    End If
    Set m_ColAnexos = m_NC.Documentos
    If Not m_ColAnexos Is Nothing Then
        For Each m_ID In m_ColAnexos
            Set m_Anexo = m_ColAnexos(m_ID)
            m_NombreArchivo = fso.GetBaseName(m_Anexo.URLAnexo)
            'NC0001_01.pdf
            If InStr(1, m_NombreArchivo, "_") <> 0 Then
                dato = Split(m_NombreArchivo, "_")
                m_trozoNumerico = dato(UBound(dato))
                If IsNumeric(m_trozoNumerico) Then
                    If CLng(m_trozoNumerico) > lngOrdinalMax Then
                        lngOrdinalMax = CLng(m_trozoNumerico)
                    End If
                End If
            End If
            Set m_Anexo = Nothing
        Next
    End If
    getNombreAnexoNCCalculado = "NC" & Format(m_NC.Numero, "00") & "_" & Format(lngOrdinalMax + 1, "00") & "." & fso.GetExtensionName(p_URLLocal)
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método DocumentoAuditoria.getNombreAnexoNCCalculado ha producido el error nº: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function
Private Function getNombreAnexoARCalculado( _
                                            p_URLLocal As String, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    Dim m_ColAnexos As Scripting.Dictionary
    Dim m_Anexo As DocumentoAuditoria
    Dim m_ID As Variant
    Dim lngOrdinalMax As Long
    Dim m_NC As NCAuditoria
    Dim m_AR As ARAuditoria
    Dim dato As Variant
    Dim m_trozoNumerico As String
    Dim m_NombreArchivo As String
    Dim m_Col As Scripting.Dictionary
    Dim m_Extension As String
    On Error GoTo errores
    
    If p_URLLocal = "" Then
        p_Error = "Falta URLLocal"
        Err.Raise 1000
    End If
    m_Extension = fso.GetExtensionName(p_URLLocal)
    Set m_AR = Me.AR
    Set m_NC = m_AR.AC.nc
    If m_AR Is Nothing Then
        p_Error = "No se conoce la acción asociada"
        Err.Raise 1000
    End If
    Set m_Col = m_AR.Documentos
    If m_Col Is Nothing Then
        If m_Extension <> "" Then
            getNombreAnexoARCalculado = "AR" & Format(m_AR.NAccion, "00") & "_01" & "." & m_Extension
        Else
            getNombreAnexoARCalculado = "AR" & Format(m_AR.NAccion, "00") & "_01"
        End If
        Exit Function
    End If
    If Not m_Col Is Nothing Then
        For Each m_ID In m_Col
            Set m_Anexo = m_Col(m_ID)
            m_NombreArchivo = fso.GetBaseName(m_Anexo.URLAnexo)
            If InStr(1, m_NombreArchivo, "_") <> 0 Then
                dato = Split(m_NombreArchivo, "_")
                m_trozoNumerico = dato(UBound(dato))
                If IsNumeric(m_trozoNumerico) Then
                    If CLng(m_trozoNumerico) > lngOrdinalMax Then
                        lngOrdinalMax = CLng(m_trozoNumerico)
                    End If
                End If
            End If
            Set m_Anexo = Nothing
        Next
    End If
    If m_Extension <> "" Then
        getNombreAnexoARCalculado = "AR" & Format(m_AR.NAccion, "00") & "_" & Format(lngOrdinalMax + 1, "00") & "." & m_Extension
    Else
        getNombreAnexoARCalculado = "AR" & Format(m_AR.NAccion, "00") & "_" & Format(lngOrdinalMax + 1, "00")
    End If

    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método DocumentoAuditoria.getNombreAnexoARCalculado ha producido el error nº: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function
Public Property Get ColCampos() As Collection

    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Not m_objColCampos Is Nothing Then
        Set ColCampos = m_objColCampos
        Exit Property
    End If
    Set m_objColCampos = New Collection
    With m_objColCampos
        .Add "IDDocumento"
        .Add "IDNoConformidad"
        .Add "Documento"
        .Add "NombreAnexo"
        .Add "IDAccionRealizada"
        .Add "IDAuditoria"
        .Add "IDAuditoriaResultante"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método DocumentoAuditoria.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDDocumento" Then
        getPropiedad = Me.IDDocumento
        Exit Function
    End If
    If m_NombrePropiedad = "IDNoConformidad" Then
        getPropiedad = Me.IDNoConformidad
        Exit Function
    End If
    If m_NombrePropiedad = "Documento" Then
        getPropiedad = Me.Documento
        Exit Function
    End If
    If m_NombrePropiedad = "NombreAnexo" Then
        getPropiedad = Me.NombreAnexo
        Exit Function
    End If
    If m_NombrePropiedad = "IDAccionRealizada" Then
        getPropiedad = Me.IDAccionRealizada
        Exit Function
    End If
    If m_NombrePropiedad = "IDAuditoria" Then
        getPropiedad = Me.IDAuditoria
        Exit Function
    End If
    If m_NombrePropiedad = "IDAuditoriaResultante" Then
        getPropiedad = Me.IDAuditoriaResultante
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en DocumentoAuditoria.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método DocumentoAuditoria.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDDocumento" Then
        Me.IDDocumento = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDNoConformidad" Then
        Me.IDNoConformidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Documento" Then
        Me.Documento = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "NombreAnexo" Then
        Me.NombreAnexo = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDAccionRealizada" Then
        Me.IDAccionRealizada = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDAuditoria" Then
        Me.IDAuditoria = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDAuditoriaResultante" Then
        Me.IDAuditoriaResultante = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en DocumentoAuditoria.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método DocumentoAuditoria.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

