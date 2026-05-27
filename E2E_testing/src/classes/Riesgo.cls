VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Riesgo"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public idRiesgo As String
Public IDEdicion As String
Public CodigoUnico As String
Public CodigoRiesgo As String
Public FechaDetectado As String
Public DetectadoPor As String
Public EntidadDetecta As String
Public Plazo As String
Public Calidad As String
Public Coste As String
Public ImpactoGlobal As String
Public Vulnerabilidad As String
Public Valoracion As String
Public Mitigacion As String
Public Contingencia As String
Public RequierePlanContingencia As String
Public Descripcion As String
Public CAUSARAIZ As String
Public Estado As String
Public FechaEstado As String
Public Priorizacion As String
Public FechaMaterializado As String
Public FechaRetirado As String
Public FechaCerrado As String
Public FechaMitigacionAceptar As String
Public JustificacionAceptacionRiesgo As String
Public FechaJustificacionAceptacionRiesgo As String
Public FechaAprobacionAceptacionPorCalidad As String
Public FechaRechazoAceptacionPorCalidad As String
Public JustificacionRetiroRiesgo As String
Public FechaJustificacionRetiroRiesgo As String
Public FechaAprobacionRetiroPorCalidad As String
Public FechaRechazoRetiroPorCalidad As String
Public RequiereRiesgoDeBiblioteca As String
Public CodRiesgoBiblioteca As String
Public RiesgoPendienteRetipificacion As String
Public FechaRiesgoParaRetipificar As String
Public FechaRiesgoRetipificado As String
Public DiasSinRespuestaCalidadAceptacion As String
Public DiasSinRespuestaCalidadRetiro As String
Public DiasSinRespuestaCalidadRetipificacion As String
Public Origen As String
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
        .Add "IDRiesgo"
        .Add "IDEdicion"
        .Add "CodigoUnico"
        .Add "CodigoRiesgo"
        .Add "FechaDetectado"
        .Add "DetectadoPor"
        .Add "EntidadDetecta"
        .Add "Plazo"
        .Add "Calidad"
        .Add "Coste"
        .Add "ImpactoGlobal"
        .Add "Vulnerabilidad"
        .Add "Valoracion"
        .Add "Mitigacion"
        .Add "Contingencia"
        .Add "RequierePlanContingencia"
        .Add "Descripcion"
        .Add "CausaRaiz"
        .Add "Estado"
        .Add "FechaEstado"
        .Add "Priorizacion"
        .Add "FechaMaterializado"
        .Add "FechaRetirado"
        .Add "FechaCerrado"
        .Add "FechaMitigacionAceptar"
        .Add "JustificacionAceptacionRiesgo"
        .Add "FechaJustificacionAceptacionRiesgo"
        .Add "FechaAprobacionAceptacionPorCalidad"
        .Add "FechaRechazoAceptacionPorCalidad"
        .Add "JustificacionRetiroRiesgo"
        .Add "FechaJustificacionRetiroRiesgo"
        .Add "FechaAprobacionRetiroPorCalidad"
        .Add "FechaRechazoRetiroPorCalidad"
        .Add "RequiereRiesgoDeBiblioteca"
        .Add "CodRiesgoBiblioteca"
        .Add "RiesgoPendienteRetipificacion"
        .Add "FechaRiesgoParaRetipificar"
        .Add "FechaRiesgoRetipificado"
        .Add "DiasSinRespuestaCalidadAceptacion"
        .Add "DiasSinRespuestaCalidadRetiro"
        .Add "DiasSinRespuestaCalidadRetipificacion"
        .Add "Origen"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Riesgo.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDRiesgo" Then
        getPropiedad = Me.idRiesgo
        Exit Function
    End If
    If m_NombrePropiedad = "IDEdicion" Then
        getPropiedad = Me.IDEdicion
        Exit Function
    End If
    If m_NombrePropiedad = "CodigoUnico" Then
        getPropiedad = Me.CodigoUnico
        Exit Function
    End If
    If m_NombrePropiedad = "CodigoRiesgo" Then
        getPropiedad = Me.CodigoRiesgo
        Exit Function
    End If
    If m_NombrePropiedad = "FechaDetectado" Then
        getPropiedad = Me.FechaDetectado
        Exit Function
    End If
    If m_NombrePropiedad = "DetectadoPor" Then
        getPropiedad = Me.DetectadoPor
        Exit Function
    End If
    If m_NombrePropiedad = "EntidadDetecta" Then
        getPropiedad = Me.EntidadDetecta
        Exit Function
    End If
    If m_NombrePropiedad = "Plazo" Then
        getPropiedad = Me.Plazo
        Exit Function
    End If
    If m_NombrePropiedad = "Calidad" Then
        getPropiedad = Me.Calidad
        Exit Function
    End If
    If m_NombrePropiedad = "Coste" Then
        getPropiedad = Me.Coste
        Exit Function
    End If
    If m_NombrePropiedad = "ImpactoGlobal" Then
        getPropiedad = Me.ImpactoGlobal
        Exit Function
    End If
    If m_NombrePropiedad = "Vulnerabilidad" Then
        getPropiedad = Me.Vulnerabilidad
        Exit Function
    End If
    If m_NombrePropiedad = "Valoracion" Then
        getPropiedad = Me.Valoracion
        Exit Function
    End If
    If m_NombrePropiedad = "Mitigacion" Then
        getPropiedad = Me.Mitigacion
        Exit Function
    End If
    If m_NombrePropiedad = "Contingencia" Then
        getPropiedad = Me.Contingencia
        Exit Function
    End If
    If m_NombrePropiedad = "RequierePlanContingencia" Then
        getPropiedad = Me.RequierePlanContingencia
        Exit Function
    End If
    If m_NombrePropiedad = "Descripcion" Then
        getPropiedad = Me.Descripcion
        Exit Function
    End If
    If m_NombrePropiedad = "CausaRaiz" Then
        getPropiedad = Me.CAUSARAIZ
        Exit Function
    End If
    If m_NombrePropiedad = "Estado" Then
        getPropiedad = Me.Estado
        Exit Function
    End If
    If m_NombrePropiedad = "FechaEstado" Then
        getPropiedad = Me.FechaEstado
        Exit Function
    End If
    If m_NombrePropiedad = "Priorizacion" Then
        getPropiedad = Me.Priorizacion
        Exit Function
    End If
    If m_NombrePropiedad = "FechaMaterializado" Then
        getPropiedad = Me.FechaMaterializado
        Exit Function
    End If
    If m_NombrePropiedad = "FechaRetirado" Then
        getPropiedad = Me.FechaRetirado
        Exit Function
    End If
    If m_NombrePropiedad = "FechaCerrado" Then
        getPropiedad = Me.FechaCerrado
        Exit Function
    End If
    If m_NombrePropiedad = "FechaMitigacionAceptar" Then
        getPropiedad = Me.FechaMitigacionAceptar
        Exit Function
    End If
    If m_NombrePropiedad = "JustificacionAceptacionRiesgo" Then
        getPropiedad = Me.JustificacionAceptacionRiesgo
        Exit Function
    End If
    If m_NombrePropiedad = "FechaJustificacionAceptacionRiesgo" Then
        getPropiedad = Me.FechaJustificacionAceptacionRiesgo
        Exit Function
    End If
    If m_NombrePropiedad = "FechaAprobacionAceptacionPorCalidad" Then
        getPropiedad = Me.FechaAprobacionAceptacionPorCalidad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaRechazoAceptacionPorCalidad" Then
        getPropiedad = Me.FechaRechazoAceptacionPorCalidad
        Exit Function
    End If
    If m_NombrePropiedad = "JustificacionRetiroRiesgo" Then
        getPropiedad = Me.JustificacionRetiroRiesgo
        Exit Function
    End If
    If m_NombrePropiedad = "FechaJustificacionRetiroRiesgo" Then
        getPropiedad = Me.FechaJustificacionRetiroRiesgo
        Exit Function
    End If
    If m_NombrePropiedad = "FechaAprobacionRetiroPorCalidad" Then
        getPropiedad = Me.FechaAprobacionRetiroPorCalidad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaRechazoRetiroPorCalidad" Then
        getPropiedad = Me.FechaRechazoRetiroPorCalidad
        Exit Function
    End If
    If m_NombrePropiedad = "RequiereRiesgoDeBiblioteca" Then
        getPropiedad = Me.RequiereRiesgoDeBiblioteca
        Exit Function
    End If
    If m_NombrePropiedad = "CodRiesgoBiblioteca" Then
        getPropiedad = Me.CodRiesgoBiblioteca
        Exit Function
    End If
    If m_NombrePropiedad = "RiesgoPendienteRetipificacion" Then
        getPropiedad = Me.RiesgoPendienteRetipificacion
        Exit Function
    End If
    If m_NombrePropiedad = "FechaRiesgoParaRetipificar" Then
        getPropiedad = Me.FechaRiesgoParaRetipificar
        Exit Function
    End If
    If m_NombrePropiedad = "FechaRiesgoRetipificado" Then
        getPropiedad = Me.FechaRiesgoRetipificado
        Exit Function
    End If
    If m_NombrePropiedad = "DiasSinRespuestaCalidadAceptacion" Then
        getPropiedad = Me.DiasSinRespuestaCalidadAceptacion
        Exit Function
    End If
    If m_NombrePropiedad = "DiasSinRespuestaCalidadRetiro" Then
        getPropiedad = Me.DiasSinRespuestaCalidadRetiro
        Exit Function
    End If
    If m_NombrePropiedad = "DiasSinRespuestaCalidadRetipificacion" Then
        getPropiedad = Me.DiasSinRespuestaCalidadRetipificacion
        Exit Function
    End If
    If m_NombrePropiedad = "Origen" Then
        getPropiedad = Me.Origen
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en Riesgo.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Riesgo.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDRiesgo" Then
        Me.idRiesgo = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDEdicion" Then
        Me.IDEdicion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CodigoUnico" Then
        Me.CodigoUnico = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CodigoRiesgo" Then
        Me.CodigoRiesgo = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaDetectado" Then
        Me.FechaDetectado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "DetectadoPor" Then
        Me.DetectadoPor = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "EntidadDetecta" Then
        Me.EntidadDetecta = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Plazo" Then
        Me.Plazo = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Calidad" Then
        Me.Calidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Coste" Then
        Me.Coste = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ImpactoGlobal" Then
        Me.ImpactoGlobal = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Vulnerabilidad" Then
        Me.Vulnerabilidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Valoracion" Then
        Me.Valoracion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Mitigacion" Then
        Me.Mitigacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Contingencia" Then
        Me.Contingencia = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "RequierePlanContingencia" Then
        Me.RequierePlanContingencia = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Descripcion" Then
        Me.Descripcion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CausaRaiz" Then
        Me.CAUSARAIZ = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Estado" Then
        Me.Estado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaEstado" Then
        Me.FechaEstado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Priorizacion" Then
        Me.Priorizacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaMaterializado" Then
        Me.FechaMaterializado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaRetirado" Then
        Me.FechaRetirado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaCerrado" Then
        Me.FechaCerrado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaMitigacionAceptar" Then
        Me.FechaMitigacionAceptar = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "JustificacionAceptacionRiesgo" Then
        Me.JustificacionAceptacionRiesgo = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaJustificacionAceptacionRiesgo" Then
        Me.FechaJustificacionAceptacionRiesgo = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaAprobacionAceptacionPorCalidad" Then
        Me.FechaAprobacionAceptacionPorCalidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaRechazoAceptacionPorCalidad" Then
        Me.FechaRechazoAceptacionPorCalidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "JustificacionRetiroRiesgo" Then
        Me.JustificacionRetiroRiesgo = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaJustificacionRetiroRiesgo" Then
        Me.FechaJustificacionRetiroRiesgo = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaAprobacionRetiroPorCalidad" Then
        Me.FechaAprobacionRetiroPorCalidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaRechazoRetiroPorCalidad" Then
        Me.FechaRechazoRetiroPorCalidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "RequiereRiesgoDeBiblioteca" Then
        Me.RequiereRiesgoDeBiblioteca = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CodRiesgoBiblioteca" Then
        Me.CodRiesgoBiblioteca = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "RiesgoPendienteRetipificacion" Then
        Me.RiesgoPendienteRetipificacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaRiesgoParaRetipificar" Then
        Me.FechaRiesgoParaRetipificar = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaRiesgoRetipificado" Then
        Me.FechaRiesgoRetipificado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "DiasSinRespuestaCalidadAceptacion" Then
        Me.DiasSinRespuestaCalidadAceptacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "DiasSinRespuestaCalidadRetiro" Then
        Me.DiasSinRespuestaCalidadRetiro = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "DiasSinRespuestaCalidadRetipificacion" Then
        Me.DiasSinRespuestaCalidadRetipificacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Origen" Then
        Me.Origen = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en Riesgo.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Riesgo.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

