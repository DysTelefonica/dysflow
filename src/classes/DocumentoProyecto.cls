VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "DocumentoProyecto"
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
Public IDNoConformidadResultante As String

Private m_sIDDocumentoCalculado As String
Private m_sIDNoConformidadResultanteCalculado As String

Private m_ObjNC As NCProyecto
Private m_ObjAR As ARProyecto
Private m_sURLAnexo As String

Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get IDNoConformidadResultanteCalculado() As String
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If m_sIDNoConformidadResultanteCalculado <> "" Then
        IDNoConformidadResultanteCalculado = m_sIDNoConformidadResultanteCalculado
        Exit Property
    End If
    If Me.IDNoConformidad <> "" Then
        m_sIDNoConformidadResultanteCalculado = Me.IDNoConformidad
    Else
        m_sIDNoConformidadResultanteCalculado = Me.AR.AC.nc.IDNoConformidad
    End If
    
    IDNoConformidadResultanteCalculado = m_sIDNoConformidadResultanteCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Documento.IDNoConformidadResultanteCalculado ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Property Get IDDocumentoCalculado() As String
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    m_sIDDocumentoCalculado = constructor.getID("TbNCDocumentos", "IDDocumento", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDDocumentoCalculado = m_sIDDocumentoCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Documento.IDDocumentoCalculado ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get URLAnexo() As String
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Me.NombreAnexo = "" Then
        Exit Property
    End If
    m_sURLAnexo = m_ObjEntorno.URLDirectorioDocumentacion & Me.NombreAnexo
    URLAnexo = m_sURLAnexo
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Documento.URLAnexo ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property



Public Property Get nc() As NCProyecto
    
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
    Set m_ObjNC = constructor.getNCProyecto(p_IDNC:=Me.IDNoConformidad, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set nc = m_ObjNC
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Documento.NC ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get AR() As ARProyecto
    
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
    Set m_ObjAR = constructor.getARProyecto(p_IDAR:=Me.IDAccionRealizada, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set AR = m_ObjAR
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Documento.AR ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Function getURLAnexoFinal( _
                                    p_URLLocal As String, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    Dim m_NombreAnexo As String
    
    On Error GoTo errores
    
    If p_URLLocal = "" Then
        p_Error = "Falta URLLocal"
        Err.Raise 1000
    End If
    If Me.IDNoConformidad <> "" Then
    
        m_NombreAnexo = getNombreAnexoNCProyectoCalculado(p_URLLocal, p_Error)
    ElseIf Me.IDAccionRealizada <> "" Then
        m_NombreAnexo = getNombreAnexoARCalculado(p_URLLocal, p_Error)
    Else
        p_Error = "El tipo no es reconocido"
        Err.Raise 1000
    End If
    
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    getURLAnexoFinal = m_ObjEntorno.URLDirectorioDocumentacion & m_NombreAnexo
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Documento.getURLAnexoFinal ha producido el error nº: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function


Private Function getNombreAnexoNCProyectoCalculado( _
                                                    p_URLLocal As String, _
                                                    Optional ByRef p_Error As String _
                                                    ) As String
    Dim m_ColAnexos As Scripting.Dictionary
    Dim m_Anexo As DocumentoProyecto
    Dim m_ID As Variant
    Dim lngOrdinalMax As Long
    Dim m_NC As NCProyecto
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
    If m_Extension <> "" Then
        getNombreAnexoNCProyectoCalculado = m_NC.CodigoNoConformidad & "_" & Format(lngOrdinalMax + 1, "00") & "." & m_Extension
    Else
        getNombreAnexoNCProyectoCalculado = m_NC.CodigoNoConformidad & "_" & Format(lngOrdinalMax + 1, "00")
    End If
    
    
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Documento.getNombreAnexoNCProyectoCalculado ha producido el error nº: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function
Private Function getNombreAnexoARCalculado( _
                                            p_URLLocal As String, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    Dim m_ColAnexos As Scripting.Dictionary
    Dim m_Anexo As DocumentoProyecto
    Dim m_ID As Variant
    Dim lngOrdinalMax As Long
    Dim m_NC As NCProyecto
    Dim m_ARProyecto As ARProyecto
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
    Set m_ARProyecto = Me.AR
    Set m_NC = m_ARProyecto.AC.nc
    If m_ARProyecto Is Nothing Then
        p_Error = "No se conoce la acción asociada"
        Err.Raise 1000
    End If
    Set m_Col = m_ARProyecto.Documentos
    If m_Col Is Nothing Then
        If m_Extension <> "" Then
            getNombreAnexoARCalculado = m_NC.CodigoNoConformidad & "_AR" & Format(m_ARProyecto.IDAccionRealizada, "0000") & "_01" & "." & m_Extension
        Else
            getNombreAnexoARCalculado = m_NC.CodigoNoConformidad & "_AR" & Format(m_ARProyecto.IDAccionRealizada, "0000") & "_01"
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
        getNombreAnexoARCalculado = m_NC.CodigoNoConformidad & "_AR" & Format(m_ARProyecto.IDAccionRealizada, "0000") & "_" & Format(lngOrdinalMax + 1, "00") & "." & m_Extension
    Else
        getNombreAnexoARCalculado = m_NC.CodigoNoConformidad & "_AR" & Format(m_ARProyecto.IDAccionRealizada, "0000") & "_" & Format(lngOrdinalMax + 1, "00")
    End If

    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Documento.getNombreAnexoARCalculado ha producido el error nº: " & Err.Number & _
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
        .Add "IDNoConformidadResultante"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Documento.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
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
    If m_NombrePropiedad = "IDNoConformidadResultante" Then
        getPropiedad = Me.IDNoConformidadResultante
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en Documento.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Documento.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
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
    If m_NombrePropiedad = "IDNoConformidadResultante" Then
        Me.IDNoConformidadResultante = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en Documento.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Documento.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

