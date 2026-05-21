VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteAntiguo"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDExpediente As String
Public Expediente As String
Public CodExpedienteLargo As String
Public OFICINADELPROGRAMA As String
Public CarpetaArchivo As String
Public FirmadelContrato As String
Public TITULOEXP As String
Public IMPORTEEXP As String
Public INTECDEF As String
Public RAC As String
Public FechaPrimerModificado As String
Public FechaSegundoModificado As String
Public FechaFinExp As String
Public FechaRecepcion As String
Public Situacion As String
Public Adjudicado As Boolean
Public EnPeriodoDeAdjudicacion As Boolean
Public Comentarios As String
Public AÑO As String
Public Informe As Boolean
Public RistraResponsablesTemp As String
Public Pcal As String
Public PcalTipo As String
Public Generico As String
Public AñosGarantia As String
Public PCAP As String
Public IDDocumentoPCAP As String
Public PPT As String
Public IDDocumentoPPT As String
Public FechaRegistro As String
Public FechaEntradaContrato As String
Public FECHAADJUDICACION As String
Public Clasificacion As String
Public IDDocumentoContrato As String
Public URLRAC As String
Public URLADJUDICACION As String
Public IDDocumentoRecepcion As String
Public IDDocumentoProrrogas As String
Public Margen As String
Public TieneVerificacionDisenio As String
Public FechaAvisoVerificacionDisenio As String
Public FechaFinAvisoVerificacionDisenio As String
Public ESTADO As String
Public AcuerdoMarco As String
Public IDDocumentoRAC As String
Public ContratoBasadoDe As String
Public IDAdjudicacion As String
Public ParaHacerPedidos As String
Public responsableCalidad As String
Public Observaciones As String
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

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
        .Add "IdExpediente"
        .Add "Expediente"
        .Add "CodExpedienteLargo"
        .Add "OFICINADELPROGRAMA"
        .Add "CarpetaArchivo"
        .Add "FirmadelContrato"
        .Add "TITULOEXP"
        .Add "IMPORTEEXP"
        .Add "INTECDEF"
        .Add "RAC"
        .Add "FechaPrimerModificado"
        .Add "FechaSegundoModificado"
        .Add "FechaFinExp"
        .Add "FechaRecepcion"
        .Add "Situacion"
        .Add "Adjudicado"
        .Add "EnPeriodoDeAdjudicacion"
        .Add "Comentarios"
        .Add "año"
        .Add "Informe"
        .Add "RistraResponsablesTemp"
        .Add "Pcal"
        .Add "PcalTipo"
        .Add "Generico"
        .Add "AñosGarantia"
        .Add "PCAP"
        .Add "IDDocumentoPCAP"
        .Add "PPT"
        .Add "IDDocumentoPPT"
        .Add "FechaRegistro"
        .Add "FechaEntradaContrato"
        .Add "FECHAADJUDICACION"
        .Add "CLASIFICACION"
        .Add "IDDocumentoContrato"
        .Add "URLRAC"
        .Add "URLADJUDICACION"
        .Add "IDDocumentoRecepcion"
        .Add "IDDocumentoProrrogas"
        .Add "Margen"
        .Add "TieneVerificacionDisenio"
        .Add "FechaAvisoVerificacionDisenio"
        .Add "FechaFinAvisoVerificacionDisenio"
        .Add "Estado"
        .Add "AcuerdoMarco"
        .Add "IDDocumentoRAC"
        .Add "ContratoBasadoDe"
        .Add "IDAdjudicacion"
        .Add "ParaHacerPedidos"
        .Add "ResponsableCalidad"
        .Add "Observaciones"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteAntiguo.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IdExpediente" Then
        getPropiedad = Me.IDExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "Expediente" Then
        getPropiedad = Me.Expediente
        Exit Function
    End If
    If m_NombrePropiedad = "CodExpedienteLargo" Then
        getPropiedad = Me.CodExpedienteLargo
        Exit Function
    End If
    If m_NombrePropiedad = "OFICINADELPROGRAMA" Then
        getPropiedad = Me.OFICINADELPROGRAMA
        Exit Function
    End If
    If m_NombrePropiedad = "CarpetaArchivo" Then
        getPropiedad = Me.CarpetaArchivo
        Exit Function
    End If
    If m_NombrePropiedad = "FirmadelContrato" Then
        getPropiedad = Me.FirmadelContrato
        Exit Function
    End If
    If m_NombrePropiedad = "TITULOEXP" Then
        getPropiedad = Me.TITULOEXP
        Exit Function
    End If
    If m_NombrePropiedad = "IMPORTEEXP" Then
        getPropiedad = Me.IMPORTEEXP
        Exit Function
    End If
    If m_NombrePropiedad = "INTECDEF" Then
        getPropiedad = Me.INTECDEF
        Exit Function
    End If
    If m_NombrePropiedad = "RAC" Then
        getPropiedad = Me.RAC
        Exit Function
    End If
    If m_NombrePropiedad = "FechaPrimerModificado" Then
        getPropiedad = Me.FechaPrimerModificado
        Exit Function
    End If
    If m_NombrePropiedad = "FechaSegundoModificado" Then
        getPropiedad = Me.FechaSegundoModificado
        Exit Function
    End If
    If m_NombrePropiedad = "FechaFinExp" Then
        getPropiedad = Me.FechaFinExp
        Exit Function
    End If
    If m_NombrePropiedad = "FechaRecepcion" Then
        getPropiedad = Me.FechaRecepcion
        Exit Function
    End If
    If m_NombrePropiedad = "Situacion" Then
        getPropiedad = Me.Situacion
        Exit Function
    End If
    If m_NombrePropiedad = "Adjudicado" Then
        getPropiedad = Me.Adjudicado
        Exit Function
    End If
    If m_NombrePropiedad = "EnPeriodoDeAdjudicacion" Then
        getPropiedad = Me.EnPeriodoDeAdjudicacion
        Exit Function
    End If
    If m_NombrePropiedad = "Comentarios" Then
        getPropiedad = Me.Comentarios
        Exit Function
    End If
    If m_NombrePropiedad = "año" Then
        getPropiedad = Me.AÑO
        Exit Function
    End If
    If m_NombrePropiedad = "Informe" Then
        getPropiedad = Me.Informe
        Exit Function
    End If
    If m_NombrePropiedad = "RistraResponsablesTemp" Then
        getPropiedad = Me.RistraResponsablesTemp
        Exit Function
    End If
    If m_NombrePropiedad = "Pcal" Then
        getPropiedad = Me.Pcal
        Exit Function
    End If
    If m_NombrePropiedad = "PcalTipo" Then
        getPropiedad = Me.PcalTipo
        Exit Function
    End If
    If m_NombrePropiedad = "Generico" Then
        getPropiedad = Me.Generico
        Exit Function
    End If
    If m_NombrePropiedad = "AñosGarantia" Then
        getPropiedad = Me.AñosGarantia
        Exit Function
    End If
    If m_NombrePropiedad = "PCAP" Then
        getPropiedad = Me.PCAP
        Exit Function
    End If
    If m_NombrePropiedad = "IDDocumentoPCAP" Then
        getPropiedad = Me.IDDocumentoPCAP
        Exit Function
    End If
    If m_NombrePropiedad = "PPT" Then
        getPropiedad = Me.PPT
        Exit Function
    End If
    If m_NombrePropiedad = "IDDocumentoPPT" Then
        getPropiedad = Me.IDDocumentoPPT
        Exit Function
    End If
    If m_NombrePropiedad = "FechaRegistro" Then
        getPropiedad = Me.FechaRegistro
        Exit Function
    End If
    If m_NombrePropiedad = "FechaEntradaContrato" Then
        getPropiedad = Me.FechaEntradaContrato
        Exit Function
    End If
    If m_NombrePropiedad = "FECHAADJUDICACION" Then
        getPropiedad = Me.FECHAADJUDICACION
        Exit Function
    End If
    If m_NombrePropiedad = "CLASIFICACION" Then
        getPropiedad = Me.Clasificacion
        Exit Function
    End If
    If m_NombrePropiedad = "IDDocumentoContrato" Then
        getPropiedad = Me.IDDocumentoContrato
        Exit Function
    End If
    If m_NombrePropiedad = "URLRAC" Then
        getPropiedad = Me.URLRAC
        Exit Function
    End If
    If m_NombrePropiedad = "URLADJUDICACION" Then
        getPropiedad = Me.URLADJUDICACION
        Exit Function
    End If
    If m_NombrePropiedad = "IDDocumentoRecepcion" Then
        getPropiedad = Me.IDDocumentoRecepcion
        Exit Function
    End If
    If m_NombrePropiedad = "IDDocumentoProrrogas" Then
        getPropiedad = Me.IDDocumentoProrrogas
        Exit Function
    End If
    If m_NombrePropiedad = "Margen" Then
        getPropiedad = Me.Margen
        Exit Function
    End If
    If m_NombrePropiedad = "TieneVerificacionDisenio" Then
        getPropiedad = Me.TieneVerificacionDisenio
        Exit Function
    End If
    If m_NombrePropiedad = "FechaAvisoVerificacionDisenio" Then
        getPropiedad = Me.FechaAvisoVerificacionDisenio
        Exit Function
    End If
    If m_NombrePropiedad = "FechaFinAvisoVerificacionDisenio" Then
        getPropiedad = Me.FechaFinAvisoVerificacionDisenio
        Exit Function
    End If
    If m_NombrePropiedad = "Estado" Then
        getPropiedad = Me.ESTADO
        Exit Function
    End If
    If m_NombrePropiedad = "AcuerdoMarco" Then
        getPropiedad = Me.AcuerdoMarco
        Exit Function
    End If
    If m_NombrePropiedad = "IDDocumentoRAC" Then
        getPropiedad = Me.IDDocumentoRAC
        Exit Function
    End If
    If m_NombrePropiedad = "ContratoBasadoDe" Then
        getPropiedad = Me.ContratoBasadoDe
        Exit Function
    End If
    If m_NombrePropiedad = "IDAdjudicacion" Then
        getPropiedad = Me.IDAdjudicacion
        Exit Function
    End If
    If m_NombrePropiedad = "ParaHacerPedidos" Then
        getPropiedad = Me.ParaHacerPedidos
        Exit Function
    End If
    If m_NombrePropiedad = "ResponsableCalidad" Then
        getPropiedad = Me.responsableCalidad
        Exit Function
    End If
    If m_NombrePropiedad = "Observaciones" Then
        getPropiedad = Me.Observaciones
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteAntiguo.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteAntiguo.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IdExpediente" Then
        Me.IDExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Expediente" Then
        Me.Expediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CodExpedienteLargo" Then
        Me.CodExpedienteLargo = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "OFICINADELPROGRAMA" Then
        Me.OFICINADELPROGRAMA = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CarpetaArchivo" Then
        Me.CarpetaArchivo = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FirmadelContrato" Then
        Me.FirmadelContrato = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "TITULOEXP" Then
        Me.TITULOEXP = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IMPORTEEXP" Then
        Me.IMPORTEEXP = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "INTECDEF" Then
        Me.INTECDEF = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "RAC" Then
        Me.RAC = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaPrimerModificado" Then
        Me.FechaPrimerModificado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaSegundoModificado" Then
        Me.FechaSegundoModificado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaFinExp" Then
        Me.FechaFinExp = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaRecepcion" Then
        Me.FechaRecepcion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Situacion" Then
        Me.Situacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Adjudicado" Then
        Me.Adjudicado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "EnPeriodoDeAdjudicacion" Then
        Me.EnPeriodoDeAdjudicacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Comentarios" Then
        Me.Comentarios = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "año" Then
        Me.AÑO = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Informe" Then
        Me.Informe = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "RistraResponsablesTemp" Then
        Me.RistraResponsablesTemp = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Pcal" Then
        Me.Pcal = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "PcalTipo" Then
        Me.PcalTipo = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Generico" Then
        Me.Generico = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "AñosGarantia" Then
        Me.AñosGarantia = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "PCAP" Then
        Me.PCAP = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDDocumentoPCAP" Then
        Me.IDDocumentoPCAP = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "PPT" Then
        Me.PPT = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDDocumentoPPT" Then
        Me.IDDocumentoPPT = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaRegistro" Then
        Me.FechaRegistro = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaEntradaContrato" Then
        Me.FechaEntradaContrato = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FECHAADJUDICACION" Then
        Me.FECHAADJUDICACION = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CLASIFICACION" Then
        Me.Clasificacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDDocumentoContrato" Then
        Me.IDDocumentoContrato = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "URLRAC" Then
        Me.URLRAC = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "URLADJUDICACION" Then
        Me.URLADJUDICACION = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDDocumentoRecepcion" Then
        Me.IDDocumentoRecepcion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDDocumentoProrrogas" Then
        Me.IDDocumentoProrrogas = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Margen" Then
        Me.Margen = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "TieneVerificacionDisenio" Then
        Me.TieneVerificacionDisenio = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaAvisoVerificacionDisenio" Then
        Me.FechaAvisoVerificacionDisenio = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaFinAvisoVerificacionDisenio" Then
        Me.FechaFinAvisoVerificacionDisenio = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Estado" Then
        Me.ESTADO = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "AcuerdoMarco" Then
        Me.AcuerdoMarco = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDDocumentoRAC" Then
        Me.IDDocumentoRAC = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ContratoBasadoDe" Then
        Me.ContratoBasadoDe = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDAdjudicacion" Then
        Me.IDAdjudicacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ParaHacerPedidos" Then
        Me.ParaHacerPedidos = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ResponsableCalidad" Then
        Me.responsableCalidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Observaciones" Then
        Me.Observaciones = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteAntiguo.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteAntiguo.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

