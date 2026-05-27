VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "NCProyecto"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public IDNoConformidad As String
Public Juridica As String
Public CodigoNoConformidad As String
Public EsNoConformidad As Boolean
Public Expediente As String
Public Proyecto As String
Public VEHICULO As String
Public Descripcion As String
Public Causa As String
Public CausaYAnalisRaiz As String
Public EntidadResponsable As String
Public ResponsableTelefonica As String 'usuariored
Public FechaApertura As String
Public FECHACIERRE As String
Public FPREVCIERRE As String
Public Notas As String
Public Borrado As Boolean
Public RequiereACR As Boolean
Public ACR As String
Public MotivoBorrado As String
Public RequiereControlEficacia As String
Public ControlEficacia As String
Public MotivoNoRequiereControlEficacia As String
Public FechaControlEficacia As String
Public FechaPrevistaControlEficacia As String
Public ResultadoControlEficacia As String
Public ConformeControlEficacia As String
Public Cerrada As String
Public IDNCAsociada As String
Public CodigoNoConformidadAsociada As String
Public CodConcesionAsociada As String
Public RESPONSABLECALIDAD As String 'Nombre completo
Public IDExpediente As String
Public CodExp As String
Public Nemotecnico As String
Public JuridicaExp As String
Public IDTipo As String
Public IDProyecto As String

Public DetectadoPor As String

Public Estado As String 'para las búsquedas

Private m_sCodRiesgosAsociados As String
Private m_ObjNCProyectoAsociada As ncProyecto
Private m_sCodExpCalculado As String
Private m_sNemotecnicoCalculado As String
Private m_sJuridicaCalculada As String
Private m_sRESPONSABLECALIDADCalculado As String

Private m_eEsNoConformidadCalculado As EnumSino
Private m_eBorradoCalculado As EnumSino
Private m_eRequiereACRCalculado As EnumSino
Private m_eRequiereControlEficaciaCalculado As EnumSino
Private m_sCodigoNoConformidadCalculado As String
Private m_sIDNoConformidadCalculado As String
Private m_sProyectoCalculado As String
Private m_objResponsableTelefonica As usuario
Private m_ObjResponsableCalidad As usuario
Private m_objDocumentos As Scripting.Dictionary
Private m_objDocumentosCompletos As Scripting.Dictionary
Private m_objACs As Scripting.Dictionary
Private m_objTipoNCProyecto As TipologiaNCProyectos
Private m_sTextoElementosAsociados As String

Private m_eConControlDeEficaciaSinRellenar As String

Private m_objARsSinFinalizar As Scripting.Dictionary
Private m_eTodasLasArsFinalizadas As EnumSino
Private m_eTodasLasACsSinFechas As EnumSino

Private m_ObjExpedienteObj As Expediente

Private m_sExpedienteCalculadoTexto As String
Private m_sUltimoProyectoCalculado As String

Private m_eDatosGeneralesOK As EnumSino
Private m_eAccionesOK As EnumSino
Private m_eEficaciaOK As EnumSino
Private m_eTieneAcciones As EnumSino
Private m_eRiesgoOK As EnumSino



Private m_ObjReplanificaciones As Scripting.Dictionary
Private m_eEstadoEnum As EnumEstadoNC

Private m_eESTADOCalculado As EnumEstadoNC
Private m_sESTADOCalculadoTexto As String
Private m_sEstadoTitulo As String
Private m_eAlgunaACSinAR As EnumSino

Private m_eTieneAccionesPorReplanificar As EnumSino



Private m_sNAccionCalculado As String
Private m_sFPREVCIERRECalculada As String

Private m_sFECHACIERRECalculada As String
Private m_eCerradaCalculada As EnumSino
Private m_eVinculadoANC As EnumSino

Private m_objACsSinAR As Scripting.Dictionary
'Private m_objColCamposVarianEnVinculacionNC As Scripting.Dictionary


Private m_objColCamposVarianEnVinculacionNC As Collection
Private m_objColCamposParaCopiarDeVinculada As Collection

Private m_Riesgos As Scripting.Dictionary

Private m_objColCampos As Collection
Public Error As String
Private m_Error As String


Public Property Get Riesgos() As Scripting.Dictionary
    ' Si es Nothing, decidimos cómo cargar
    If m_Riesgos Is Nothing Then
        ' ERROR CORREGIDO AQUÍ:
        ' Usamos Val() para evitar "Error 13: No coinciden los tipos"
        ' cuando Me.IDNoConformidad es una cadena vacía ("") en el Alta.
        If Val(Me.IDNoConformidad) > 0 Then
            ' MODO EDICIÓN: Carga de BD
            Set m_Riesgos = RiesgoRepositorio.GetRiesgosAsociados(CLng(Me.IDNoConformidad), m_Error)
        Else
            ' MODO ALTA: Inicializamos diccionario vacío una sola vez
            Set m_Riesgos = New Scripting.Dictionary
            m_Riesgos.CompareMode = TextCompare
        End If
    End If
    Set Riesgos = m_Riesgos
End Property
Public Property Set Riesgos(p_Valor As Scripting.Dictionary)
    ' Permite invalidar con Nothing tras cambios en el servicio
    If Not p_Valor Is Nothing Then
        If p_Valor.count = 0 Then
            Set m_Riesgos = Nothing
        Else
            Set m_Riesgos = p_Valor
        End If
    Else
        Set m_Riesgos = p_Valor
    End If
    
End Property
Public Property Get CodRiesgosAsociados() As String
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If m_sCodRiesgosAsociados <> "" Then
        CodRiesgosAsociados = m_sCodRiesgosAsociados
        Exit Property
    End If
    
    m_sCodRiesgosAsociados = constructor.getCodRiesgosAsociados(p_IDNC:=Me.IDNoConformidad, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    CodRiesgosAsociados = m_sCodRiesgosAsociados
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.CodRiesgosAsociados ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Let CodRiesgosAsociados(ByVal vNewValue As String)
    ' Permite asignar manualmente la cadena de riesgos (usado en memoria durante el Alta)
    m_sCodRiesgosAsociados = vNewValue
End Property
Public Property Get ACsSinAR() As Scripting.Dictionary
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
'    If Not m_objACsSinAR Is Nothing Then
'        Set ACsSinAR = m_objACsSinAR
'        Exit Property
'    End If
    
    Set m_objACsSinAR = constructor.getACsProyectosSinAR(p_IDNC:=Me.IDNoConformidad, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set ACsSinAR = m_objACsSinAR
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.ACsSinAR ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get AlgunaACSinAR() As EnumSino
    
    Dim m_Col As Scripting.Dictionary
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    
    
    Set m_Col = Me.ACsSinAR
    m_Error = Me.Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_Col Is Nothing Then
        m_eAlgunaACSinAR = EnumSino.Sí
    Else
         m_eAlgunaACSinAR = EnumSino.No
    End If
    AlgunaACSinAR = m_eAlgunaACSinAR
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.AlgunaACSinAR ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get VinculadoANC() As EnumSino
   
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If Me.IDNCAsociada = "" Then
        m_eVinculadoANC = EnumSino.No
    Else
        m_eVinculadoANC = EnumSino.Sí
    End If
    
    
    
    VinculadoANC = m_eVinculadoANC
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.VinculadoANC ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get NCProyectoAsociada() As ncProyecto
    
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    
    If Not m_ObjNCProyectoAsociada Is Nothing Then
        Set NCProyectoAsociada = m_ObjNCProyectoAsociada
        Exit Property
    End If
    If Me.IDNCAsociada = "" Then
        Exit Property
    End If
    Set m_ObjNCProyectoAsociada = constructor.getNCProyecto(p_IDNC:=Me.IDNCAsociada, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set NCProyectoAsociada = m_ObjNCProyectoAsociada
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.NCProyectoAsociada ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property
Public Property Set NCProyectoAsociada(ByVal objNewValue As Variant)

    Set m_ObjNCProyectoAsociada = objNewValue

End Property
Public Property Get FECHACIERRECalculada() As String
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
'    If m_sFECHACIERRECalculada <> "" Then
'        FECHACIERRECalculada = m_sFECHACIERRECalculada
'        Exit Property
'    End If
    If Me.CerradaCalculada = EnumSino.No Then
        Exit Property
    End If
    m_sFECHACIERRECalculada = getFECHACIERRENCCalculada( _
                                    p_ID:=Me.IDNoConformidad, _
                                    p_EsDeProyecto:=EnumSino.Sí, _
                                    p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
   
    FECHACIERRECalculada = m_sFECHACIERRECalculada
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.FECHACIERRECalculada ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get FPREVCIERRECalculada() As String
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
'    If m_sFPREVCIERRECalculada <> "" Then
'        FPREVCIERRECalculada = m_sFPREVCIERRECalculada
'        Exit Property
'    End If
    
    m_sFPREVCIERRECalculada = getFPREVCIERRENCCalculada( _
                                    p_ID:=Me.IDNoConformidad, _
                                    p_EsDeProyecto:=EnumSino.Sí, _
                                    p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
   
    FPREVCIERRECalculada = m_sFPREVCIERRECalculada
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.FPREVCIERRECalculada ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error

End Property
Public Property Get CerradaCalculada() As EnumSino
    
    On Error GoTo errores
   
    Me.Error = ""
    m_Error = ""
'    If m_eCerradaCalculada <> Empty Then
'        m_eCerradaCalculada = m_eCerradaCalculada
'        CerradaCalculada = m_eCerradaCalculada
'        Exit Property
'    End If
    m_eTodasLasArsFinalizadas = Empty
    If Me.TodasLasArsFinalizadas = EnumSino.Sí Then
        m_eCerradaCalculada = EnumSino.Sí
    Else
        m_eCerradaCalculada = EnumSino.No
    End If
    
    CerradaCalculada = m_eCerradaCalculada
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.CerradaCalculada ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property

Public Property Get TipoNCProyecto() As TipologiaNCProyectos
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objTipoNCProyecto Is Nothing Then
        Set TipoNCProyecto = m_objTipoNCProyecto
        Exit Property
    End If
    
    Set m_objTipoNCProyecto = constructor.getTipologiaNCProyecto( _
                                        p_IDTipo:=Me.IDTipo, p_Error:=m_Error)
    
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set TipoNCProyecto = m_objTipoNCProyecto
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.TipoNCProyecto ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set TipoNCProyecto(ByVal objNewValue As Variant)

    Set m_objTipoNCProyecto = objNewValue

End Property
Public Property Get NAccionCalculado() As String
    
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    m_sNAccionCalculado = getNAccionACCalculado( _
                                                        p_ID:=Me.IDNoConformidad, _
                                                        p_EsDeProyecto:=EnumSino.Sí, _
                                                        p_Error:=m_Error)
    
    
    NAccionCalculado = m_sNAccionCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.NAccionCalculado  ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get TieneAccionesPorReplanificar() As EnumSino
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
'    If m_eTieneAccionesPorReplanificar <> Empty Then
'        TieneAccionesPorReplanificar = m_eTieneAccionesPorReplanificar
'        Exit Property
'    End If
    If Me.CerradaCalculada = EnumSino.Sí Then
        m_eTieneAccionesPorReplanificar = EnumSino.No
        TieneAccionesPorReplanificar = m_eTieneAccionesPorReplanificar
        Exit Property
    End If
    m_eTieneAccionesPorReplanificar = getTieneAccionesNCPorReplanificar( _
                                    p_ID:=Me.IDNoConformidad, _
                                    p_EsDeProyecto:=EnumSino.Sí, _
                                    p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
   
    TieneAccionesPorReplanificar = m_eTieneAccionesPorReplanificar
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.TieneAccionesPorReplanificar ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Property Get EstadoCalculado() As EnumEstadoNC
   
  
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    With Me
        If .Borrado = True Then
            m_eESTADOCalculado = EnumEstadoNC.BORRADA
            EstadoCalculado = m_eESTADOCalculado
            Exit Property
        End If
        Set .ACs = Nothing
        If .ACs Is Nothing Then
            m_eESTADOCalculado = EnumEstadoNC.REGISTRADA
            EstadoCalculado = m_eESTADOCalculado
            Exit Property
        End If
        m_eAlgunaACSinAR = Empty
        If .AlgunaACSinAR = EnumSino.Sí Then
            If .FECHACIERRE <> "" Then
                m_eESTADOCalculado = EnumEstadoNC.Cerrada
            Else
                m_eESTADOCalculado = EnumEstadoNC.ACSSINTAREAS
                
            End If
            
            EstadoCalculado = m_eESTADOCalculado
            Exit Property
        End If
        m_eTodasLasACsSinFechas = Empty
        If .TodasLasACsSinFechas = EnumSino.Sí Then
            m_eESTADOCalculado = EnumEstadoNC.PLANIFICADA
            EstadoCalculado = m_eESTADOCalculado
            Exit Property
        End If
        m_eTieneAccionesPorReplanificar = Empty
        If .TieneAccionesPorReplanificar = EnumSino.Sí Then
            m_eESTADOCalculado = EnumEstadoNC.ENEJECUCIONFUERADEPLAZO
            EstadoCalculado = m_eESTADOCalculado
            Exit Property
        End If
        m_eTodasLasArsFinalizadas = Empty
        
        If .TodasLasArsFinalizadas = EnumSino.Sí Then
            If .RequiereControlEficacia = "Sí" Then
                If .ControlEficacia = "" Then
                    'para los que hay que regularizar
                    m_eESTADOCalculado = EnumEstadoNC.CERRADAPTECE
                Else
                    If .FechaControlEficacia = "" Then
                        If IsDate(.FechaPrevistaControlEficacia) Then
                            If CDate(.FechaPrevistaControlEficacia) < CDate(Date) Then
                                m_eESTADOCalculado = EnumEstadoNC.CERRADAPTECECADUCADA
                            Else
                                m_eESTADOCalculado = EnumEstadoNC.CERRADAPTECE
                            End If
                        
                        End If
                        
                    Else
                        
                        If .ConformeControlEficacia = "No" Then
                            m_eESTADOCalculado = EnumEstadoNC.CERRADACENOCONFORME
                        Else
                             m_eESTADOCalculado = EnumEstadoNC.Cerrada
                        End If
                            
                       
                    End If
                End If
                
            Else
                m_eESTADOCalculado = EnumEstadoNC.Cerrada
            End If
        Else
            m_eESTADOCalculado = EnumEstadoNC.ENEJECUCION
        End If
        
    End With
    
    EstadoCalculado = m_eESTADOCalculado
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.EstadoCalculado ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get EstadoCalculadoTexto() As String
    Dim m_EstadoCalculado As EnumEstadoNC
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    m_EstadoCalculado = Me.EstadoCalculado
    If m_ObjEntorno.ColEstadosNC.Exists(CStr(m_EstadoCalculado)) Then
        m_sESTADOCalculadoTexto = m_ObjEntorno.ColEstadosNC(CStr(m_EstadoCalculado))
    Else
        m_sESTADOCalculadoTexto = "DESCONOCIDO"
    End If
    
    
    EstadoCalculadoTexto = m_sESTADOCalculadoTexto
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.EstadoCalculadoTexto ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property



Public Function EstadoGrabar( _
                                Optional p_Estado As String, _
                                Optional ByRef p_Error As String _
                                ) As String
    
    
    
    Dim m_SQL As String
    
    
    On Error GoTo errores
    
    If p_Estado = "" Then
        p_Estado = Me.EstadoCalculadoTexto
    End If
    Me.Estado = p_Estado
    
    
    m_SQL = "UPDATE TbNoConformidades " & _
            "SET Estado = '" & Me.Estado & "' " & _
            "WHERE IDNoConformidad=" & Me.IDNoConformidad & ";"
    getdb().Execute m_SQL
   
   
   
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstadoGrabar ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Public Property Get EstadoEnum() As EnumEstadoNC
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_ObjEntorno.ColEstadosNCTexto.Exists(Me.Estado) Then
        m_eEstadoEnum = m_ObjEntorno.ColEstadosNCTexto(Me.Estado)
    End If
    EstadoEnum = m_eEstadoEnum
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.EstadoEnum ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get EstadoTitulo() As String
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sEstadoTitulo <> "" Then
        EstadoTitulo = m_sEstadoTitulo
        Exit Property
    End If
    If Me.EstadoEnum = Empty Then
        Exit Property
    End If
    If m_ObjEntorno.ColEstadosNCTitulo.Exists(CStr(Me.EstadoEnum)) Then
        m_sEstadoTitulo = m_ObjEntorno.ColEstadosNCTitulo(CStr(Me.EstadoEnum))
    End If
    EstadoTitulo = m_sEstadoTitulo
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.EstadoTitulo ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property




Public Property Get Replanificaciones() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjReplanificaciones Is Nothing Then
        Set Replanificaciones = m_ObjReplanificaciones
        Exit Property
    End If
    If Me.IDNoConformidad = "" Then
        Exit Property
    End If
    Set m_ObjReplanificaciones = constructor.getReplanificacionesDeNCProyecto( _
                                        p_IDNC:=Me.IDNoConformidad, p_Error:=m_Error)
    
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set Replanificaciones = m_ObjReplanificaciones
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.Replanificaciones ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set Replanificaciones(p_Valor As Variant)

    Set m_ObjReplanificaciones = p_Valor

End Property

Public Property Get ResponsableCalidadCalculado() As String
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    
'    If m_sRESPONSABLECALIDADCalculado <> "" Then
'        ResponsableCalidadCalculado = m_sRESPONSABLECALIDADCalculado
'        Exit Property
'    End If
    
    If Me.ExpedienteObj Is Nothing Then
        Exit Property
    End If
    If Not Me.ExpedienteObj.RESPONSABLECALIDAD Is Nothing Then
        m_sRESPONSABLECALIDADCalculado = Me.ExpedienteObj.RESPONSABLECALIDAD.Nombre
    End If
    
    
   
    ResponsableCalidadCalculado = m_sRESPONSABLECALIDADCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.ResponsableCalidadCalculado  ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get JuridicaCalculada() As String
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    
'    If m_sJuridicaCalculada <> "" Then
'        JuridicaCalculada = m_sJuridicaCalculada
'        Exit Property
'    End If
    If Me.ExpedienteObj Is Nothing Then
        Exit Property
    End If
    m_sJuridicaCalculada = Me.ExpedienteObj.CadenaJuridicas
    
   
    JuridicaCalculada = m_sJuridicaCalculada
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.JuridicaCalculada  ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get CodExpCalculado() As String
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    
'    If m_sCodExpCalculado <> "" Then
'        CodExpCalculado = m_sCodExpCalculado
'        Exit Property
'    End If
    If Me.ExpedienteObj Is Nothing Then
        Exit Property
    End If
    m_sCodExpCalculado = Me.ExpedienteObj.CodExp
    
   
    CodExpCalculado = m_sCodExpCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.CodExpCalculado  ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get NemotecnicoCalculado() As String
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    
'    If m_sNemotecnicoCalculado <> "" Then
'        NemotecnicoCalculado = m_sNemotecnicoCalculado
'        Exit Property
'    End If
    If Me.ExpedienteObj Is Nothing Then
        Exit Property
    End If
    m_sNemotecnicoCalculado = Me.ExpedienteObj.Nemotecnico
    
   
    NemotecnicoCalculado = m_sNemotecnicoCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.NemotecnicoCalculado  ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ExpedienteCalculadoTexto() As String
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    
'    If m_sExpedienteCalculadoTexto <> "" Then
'        ExpedienteCalculadoTexto = m_sExpedienteCalculadoTexto
'        Exit Property
'    End If
    If Me.ExpedienteObj Is Nothing Then
        Exit Property
    End If
    m_sExpedienteCalculadoTexto = Me.ExpedienteObj.TextoExpediente
   
   
    ExpedienteCalculadoTexto = m_sExpedienteCalculadoTexto
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.ExpedienteCalculadoTexto ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ExpedienteObj() As Expediente
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjExpedienteObj Is Nothing Then
        Set ExpedienteObj = m_ObjExpedienteObj
        Exit Property
    End If
    Set m_ObjExpedienteObj = constructor.getExpediente(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ExpedienteObj = m_ObjExpedienteObj
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.ExpedienteObj ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ExpedienteObj(p_Valor As Variant)
    Set m_ObjExpedienteObj = p_Valor

End Property


Public Property Get EsNoConformidadCalculado() As EnumSino

    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    
    If Me.EsNoConformidad = True Then
        m_eEsNoConformidadCalculado = EnumSino.Sí
    Else
        m_eEsNoConformidadCalculado = EnumSino.No
    End If
    EsNoConformidadCalculado = m_eEsNoConformidadCalculado
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.EsNoConformidadCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property



Public Property Get BorradoCalculado() As EnumSino

    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    
    If Me.Borrado = True Then
        m_eBorradoCalculado = EnumSino.Sí
    Else
        m_eBorradoCalculado = EnumSino.No
    End If
    BorradoCalculado = m_eBorradoCalculado
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.BorradoCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property



Public Property Get RequiereACRCalculado() As EnumSino

    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    
    If Me.RequiereACR = True Then
        m_eRequiereACRCalculado = EnumSino.Sí
    Else
        m_eRequiereACRCalculado = EnumSino.No
    End If
    RequiereACRCalculado = m_eRequiereACRCalculado
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.RequiereACRCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property

Public Property Get RequiereControlEficaciaCalculado() As EnumSino

    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    
    If Me.RequiereControlEficacia = "Sí" Then
        m_eRequiereControlEficaciaCalculado = EnumSino.Sí
    ElseIf Me.RequiereControlEficacia = "No" Then
        m_eRequiereControlEficaciaCalculado = EnumSino.No
    
    End If
    RequiereControlEficaciaCalculado = m_eRequiereControlEficaciaCalculado
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.RequiereControlEficaciaCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property

Public Property Get ConControlDeEficaciaSinRellenar() As EnumSino

    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Me.RequiereControlEficaciaCalculado <> EnumSino.Sí Then
        m_eConControlDeEficaciaSinRellenar = EnumSino.No
        ConControlDeEficaciaSinRellenar = m_eConControlDeEficaciaSinRellenar
        Exit Property
    End If
    If CDate(Me.FechaControlEficacia) < CDate(Date) Then
        If Me.ControlEficacia = "" Then
            m_eConControlDeEficaciaSinRellenar = EnumSino.Sí
        Else
            m_eConControlDeEficaciaSinRellenar = EnumSino.No
        End If
    Else
        m_eConControlDeEficaciaSinRellenar = EnumSino.No
    End If
    ConControlDeEficaciaSinRellenar = m_eConControlDeEficaciaSinRellenar
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.ConControlDeEficaciaSinRellenar  ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property



Public Function DatosGeneralesOK( _
                                Optional p_MenosCef As EnumSino = EnumSino.No, _
                                Optional ByRef p_Error As String _
                                ) As EnumSino
    
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    With Me
        If .IDExpediente = "" Then
            m_eDatosGeneralesOK = EnumSino.No
            DatosGeneralesOK = m_eDatosGeneralesOK
            Exit Function
        End If
        If .Descripcion = "" Then
            m_eDatosGeneralesOK = EnumSino.No
            DatosGeneralesOK = m_eDatosGeneralesOK
            Exit Function
        End If
        If .CausaYAnalisRaiz = "" Then
            m_eDatosGeneralesOK = EnumSino.No
            DatosGeneralesOK = m_eDatosGeneralesOK
            Exit Function
        End If
        
        
        If .IDTipo = "" Then
            m_eDatosGeneralesOK = EnumSino.No
            DatosGeneralesOK = m_eDatosGeneralesOK
            Exit Function
        End If
        If .EntidadResponsable = "" Then
            m_eDatosGeneralesOK = EnumSino.No
            DatosGeneralesOK = m_eDatosGeneralesOK
            Exit Function
        End If
        If .DetectadoPor = "" Then
            m_eDatosGeneralesOK = EnumSino.No
            DatosGeneralesOK = m_eDatosGeneralesOK
            Exit Function
        End If
        If .ResponsableTelefonica = "" Then
            m_eDatosGeneralesOK = EnumSino.No
            DatosGeneralesOK = m_eDatosGeneralesOK
            Exit Function
        End If
        If p_MenosCef <> EnumSino.Sí Then
            If .RequiereControlEficacia = "" Then
                m_eDatosGeneralesOK = EnumSino.No
                DatosGeneralesOK = m_eDatosGeneralesOK
                Exit Function
            
            End If
            
            If .RequiereControlEficacia = "Sí" Then
                If .ControlEficacia = "" Or .FechaPrevistaControlEficacia = "" Then
                    m_eDatosGeneralesOK = EnumSino.No
                    DatosGeneralesOK = m_eDatosGeneralesOK
                    Exit Function
                End If
            End If
        End If
        
        
    End With
    m_eDatosGeneralesOK = EnumSino.Sí
    DatosGeneralesOK = m_eDatosGeneralesOK
    Exit Function
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.DatosGeneralesOK  ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Function
Public Property Get EficaciaOK() As EnumSino
    
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    With Me
        If .RequiereControlEficacia = "" Then
            m_eEficaciaOK = EnumSino.No
            EficaciaOK = m_eEficaciaOK
            Exit Property
        End If
        If .FechaPrevistaControlEficacia = "" Then
            m_eEficaciaOK = EnumSino.No
            EficaciaOK = m_eEficaciaOK
            Exit Property
        End If
        If .ControlEficacia = "" Then
            m_eEficaciaOK = EnumSino.No
            EficaciaOK = m_eEficaciaOK
            Exit Property
        End If
        If .FechaControlEficacia = "" Then
            If .ResultadoControlEficacia <> "" Then
                m_eEficaciaOK = EnumSino.No
                EficaciaOK = m_eEficaciaOK
                Exit Property
            End If
            If .ConformeControlEficacia <> "" Then
                m_eEficaciaOK = EnumSino.No
                EficaciaOK = m_eEficaciaOK
                Exit Property
            End If
        Else
            If .ResultadoControlEficacia = "" Then
                m_eEficaciaOK = EnumSino.No
                EficaciaOK = m_eEficaciaOK
                Exit Property
            End If
            If .ConformeControlEficacia = "" Then
                m_eEficaciaOK = EnumSino.No
                EficaciaOK = m_eEficaciaOK
                Exit Property
            End If
        End If
        If .ResultadoControlEficacia = "" Then
            If .FechaControlEficacia <> "" Then
                m_eEficaciaOK = EnumSino.No
                EficaciaOK = m_eEficaciaOK
                Exit Property
            End If
            If .ConformeControlEficacia <> "" Then
                m_eEficaciaOK = EnumSino.No
                EficaciaOK = m_eEficaciaOK
                Exit Property
            End If
        Else
            If .FechaControlEficacia = "" Then
                m_eEficaciaOK = EnumSino.No
                EficaciaOK = m_eEficaciaOK
                Exit Property
            End If
            If .ConformeControlEficacia = "" Then
                m_eEficaciaOK = EnumSino.No
                EficaciaOK = m_eEficaciaOK
                Exit Property
            End If
        End If
        
        
    End With
    m_eEficaciaOK = EnumSino.Sí
    EficaciaOK = m_eEficaciaOK
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.EficaciaOK  ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property
Public Property Get AccionesOK() As EnumSino
    Dim m_Estado As EnumEstadoNC
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    With Me
        m_Estado = .EstadoCalculado
        If m_Estado = EnumEstadoNC.REGISTRADA Or m_Estado = EnumEstadoNC.ACSSINTAREAS Or m_Estado = EnumEstadoNC.ENEJECUCIONFUERADEPLAZO Then
            m_eAccionesOK = EnumSino.No
        Else
            m_eAccionesOK = EnumSino.Sí
        End If
    End With
    AccionesOK = m_eAccionesOK
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.AccionesOK  ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property

Public Property Get TieneAcciones() As EnumSino
    
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    With Me
        
       
        If Not .ACs Is Nothing Then
            m_eTieneAcciones = EnumSino.Sí
        Else
            m_eTieneAcciones = EnumSino.No
        End If
    End With
    TieneAcciones = m_eTieneAcciones
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.TieneAcciones  ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property


Public Property Get CodigoNoConformidadCalculado() As String
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    
    m_sCodigoNoConformidadCalculado = getCodigo(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    CodigoNoConformidadCalculado = m_sCodigoNoConformidadCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.CodigoNoConformidadCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get IDNoConformidadCalculado() As String

    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    m_sIDNoConformidadCalculado = constructor.getID("TbNoConformidades", "IDNoConformidad", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDNoConformidadCalculado = m_sIDNoConformidadCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.IDNoConformidadCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property

Public Property Get ProyectoCalculado() As String
    
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Me.Proyecto = "" Then
        Exit Property
    End If
    If Me.Expediente = "" Then
        m_sProyectoCalculado = Me.Proyecto
        ProyectoCalculado = m_sProyectoCalculado
        Exit Property
    End If
    If InStr(1, Me.Proyecto, ".") = 0 Then
        m_sProyectoCalculado = Me.Expediente & "." & Me.Proyecto
    Else
        dato = Split(Me.Proyecto, ".")
        If Me.Expediente <> dato(0) Then
            m_sProyectoCalculado = Me.Expediente & "." & dato(1)
        Else
            m_sProyectoCalculado = Me.Proyecto
        End If
    End If
    ProyectoCalculado = m_sProyectoCalculado
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.ProyectoCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property

Public Property Get ResponsableTelefonicaObj() As usuario
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objResponsableTelefonica Is Nothing Then
        Set ResponsableTelefonicaObj = m_objResponsableTelefonica
        Exit Property
    End If
    If Me.ResponsableTelefonica = "" Then
        Exit Property
    End If
    Set m_objResponsableTelefonica = constructor.getUsuario(p_UsuarioRed:=Me.ResponsableTelefonica, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ResponsableTelefonicaObj = m_objResponsableTelefonica
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.ResponsableTelefonicaObj ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ResponsableTelefonicaObj(ByVal objNewValue As Variant)

    Set m_objResponsableTelefonica = objNewValue

End Property
Public Property Get ResponsableCalidadObj() As usuario
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_ObjResponsableCalidad Is Nothing Then
        Set ResponsableCalidadObj = m_ObjResponsableCalidad
        Exit Property
    End If
    If Me.RESPONSABLECALIDAD = "" Then
        Exit Property
    End If
    Set m_ObjResponsableCalidad = constructor.getUsuario(p_UsuarioRed:=Me.RESPONSABLECALIDAD, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ResponsableCalidadObj = m_ObjResponsableCalidad
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.ResponsableCalidadObj ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ResponsableCalidadObj(ByVal objNewValue As Variant)

    Set m_ObjResponsableCalidad = objNewValue

End Property
Public Property Get Documentos() As Scripting.Dictionary
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objDocumentos Is Nothing Then
        Set Documentos = m_objDocumentos
        Exit Property
    End If
    Set m_objDocumentos = constructor.getDocumentosProyecto(p_IDNC:=Me.IDNoConformidad, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Documentos = m_objDocumentos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.Documentos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set Documentos(ByVal objNewValue As Variant)

    Set m_objDocumentos = objNewValue

End Property
Public Property Get DocumentosCompletos() As Scripting.Dictionary
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objDocumentosCompletos Is Nothing Then
        Set DocumentosCompletos = m_objDocumentosCompletos
        Exit Property
    End If
    Set m_objDocumentosCompletos = constructor.getDocumentosCompletosProyecto(p_IDNC:=Me.IDNoConformidad, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set DocumentosCompletos = m_objDocumentosCompletos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.DocumentosCompletos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set DocumentosCompletos(ByVal objNewValue As Variant)

    Set m_objDocumentosCompletos = objNewValue

End Property
Public Property Get ARsSinFinalizar() As Scripting.Dictionary
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
'    If Not m_objARsSinFinalizar Is Nothing Then
'        Set ARsSinFinalizar = m_objARsSinFinalizar
'        Exit Property
'    End If
    Set m_objARsSinFinalizar = constructor.getACsProyectoSinFinalizar(p_IDNC:=Me.IDNoConformidad, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set ARsSinFinalizar = m_objARsSinFinalizar
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.ARsSinFinalizar ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ARsSinFinalizar(ByVal objNewValue As Variant)

    Set m_objARsSinFinalizar = objNewValue

End Property

Public Property Get ACs() As Scripting.Dictionary
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objACs Is Nothing Then
        Set ACs = m_objACs
        Exit Property
    End If
    Set m_objACs = constructor.getACsProyecto(p_IDNC:=Me.IDNoConformidad, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set ACs = m_objACs
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.ACs ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ACs(ByVal objNewValue As Variant)

    Set m_objACs = objNewValue

End Property

Public Property Get TodasLasArsFinalizadas() As EnumSino
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
'    If m_eTodasLasArsFinalizadas <> Empty Then
'        TodasLasArsFinalizadas = m_eTodasLasArsFinalizadas
'        Exit Property
'    End If
   
    m_eTodasLasArsFinalizadas = getTodasLasArsFinalizadas( _
                                    p_ID:=Me.IDNoConformidad, _
                                    p_EsDeProyecto:=EnumSino.Sí, _
                                    p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
   
    TodasLasArsFinalizadas = m_eTodasLasArsFinalizadas
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.TodasLasArsFinalizadas ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Get TodasLasACsSinFechas() As EnumSino
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
'    If m_eTodasLasACsSinFechas <> Empty Then
'        TodasLasACsSinFechas = m_eTodasLasACsSinFechas
'        Exit Property
'    End If
   
    m_eTodasLasACsSinFechas = getTodasLasACsSinFechas( _
                                    p_ID:=Me.IDNoConformidad, _
                                    p_EsDeProyecto:=EnumSino.Sí, _
                                    p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
   
    TodasLasACsSinFechas = m_eTodasLasACsSinFechas
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.TodasLasACsSinFechas ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Function FECHACIERREGrabar( _
                                    Optional p_Fecha As String, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_SQL As String
    
    On Error GoTo errores
    
    If Not IsDate(p_Fecha) Then
        m_sFECHACIERRECalculada = ""
        p_Fecha = Me.FECHACIERRECalculada
    End If
    
    Me.FECHACIERRE = p_Fecha
    If p_Fecha = "" Then
        m_SQL = "UPDATE TbNoConformidades set FECHACIERRE=Null " & _
                "WHERE IDNoConformidad=" & Me.IDNoConformidad & ";"
    Else
        m_SQL = "UPDATE TbNoConformidades set FECHACIERRE=#" & Format(Me.FECHACIERRE, "mm/dd/yyyy") & "# " & _
                "WHERE IDNoConformidad=" & Me.IDNoConformidad & ";"
    End If
    getdb().Execute m_SQL
    ' --- INTEGRACIÓN CACHÉ ---
    CacheNCProyecto.InvalidarCache Me.IDNoConformidad, "Cambio en Fecha de Cierre", p_Error
    ' -------------------------
    FECHACIERREGrabar = p_Fecha
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCProyecto.FECHACIERREGrabar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function

Public Function FPREVCIERREGrabar( _
                                    Optional p_Fecha As String, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_SQL As String
    
    On Error GoTo errores
    
    If Not IsDate(p_Fecha) Then
        m_sFPREVCIERRECalculada = ""
        p_Fecha = Me.FPREVCIERRECalculada
    End If
    Me.FPREVCIERRE = p_Fecha
    If p_Fecha = "" Then
        m_SQL = "UPDATE TbNoConformidades set FPREVCIERRE=Null " & _
                "WHERE IDNoConformidad=" & Me.IDNoConformidad & ";"
    Else
        m_SQL = "UPDATE TbNoConformidades set FPREVCIERRE=#" & Format(Me.FPREVCIERRE, "mm/dd/yyyy") & "# " & _
                "WHERE IDNoConformidad=" & Me.IDNoConformidad & ";"
    End If
    getdb().Execute m_SQL
     ' --- INTEGRACIÓN CACHÉ ---
    CacheNCProyecto.InvalidarCache Me.IDNoConformidad, "Cambio en Fecha Prevista de Cierre", p_Error
    ' -------------------------
    FPREVCIERREGrabar = p_Fecha
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCProyecto.FPREVCIERREGrabar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function


Public Function CIERREGrabar( _
                                    Optional p_Cerrada As EnumSino, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_SQL As String
    
    On Error GoTo errores
    
    If p_Cerrada = Empty Then
        p_Cerrada = Me.CerradaCalculada
    End If
    If p_Cerrada = EnumSino.Sí Then
        Me.Cerrada = "Sí"
    ElseIf p_Cerrada = EnumSino.No Then
        Me.Cerrada = "No"
    Else
        Exit Function
    End If
    m_SQL = "UPDATE TbNoConformidades set Cerrada='" & Me.Cerrada & "' WHERE IDNoConformidad=" & Me.IDNoConformidad & ";"
    getdb().Execute m_SQL
     ' --- INTEGRACIÓN CACHÉ ---
    CacheNCProyecto.InvalidarCache Me.IDNoConformidad, "Cambio en Estado de Cierre (Sí/No)", p_Error
    ' -------------------------
    CIERREGrabar = Me.Cerrada
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCProyecto.CIERREGrabar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function

Private Function getCodigo(Optional ByRef p_Error As String) As String
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    
    Dim m_NCUltimo As String
    Dim m_OrdinalUltimo As Long
    Dim m_PrimeraParteCodigo As String
    
    On Error GoTo errores
    m_PrimeraParteCodigo = "NC"
    m_SQL = "SELECT CodigoNoConformidad " & _
            "FROM TbNoConformidades " & _
            "WHERE CodigoNoConformidad Like '" & m_PrimeraParteCodigo & "*' " & _
            "ORDER BY CodigoNoConformidad DESC;"

    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
            m_NCUltimo = Nz(.Fields("CodigoNoConformidad"), "")
        End If
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    If Len(m_NCUltimo) = 6 Then
        If IsNumeric(Right(m_NCUltimo, 4)) Then
            m_OrdinalUltimo = Right(m_NCUltimo, 4)
        End If
    End If
    
    getCodigo = m_PrimeraParteCodigo & Format(m_OrdinalUltimo + 1, "0000")
   
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCProyecto.getCodigo ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function
Public Property Get ColCamposVarianEnVinculacionNC() As Collection

    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Not m_objColCamposVarianEnVinculacionNC Is Nothing Then
        Set ColCamposVarianEnVinculacionNC = m_objColCamposVarianEnVinculacionNC
        Exit Property
    End If
    Set m_objColCamposVarianEnVinculacionNC = New Collection
    With m_objColCamposVarianEnVinculacionNC
        .Add "Juridica"
        .Add "EXPEDIENTE"
        .Add "PROYECTO"
        .Add "DESCRIPCION"
        .Add "ENTIDADRESPONSABLE"
        .Add "RESPONSABLETELEFONICA"
        .Add "FECHAAPERTURA"
        .Add "RESPONSABLECALIDAD"
        .Add "IDExpediente"
        .Add "CodExp"
        .Add "Nemotecnico"
        .Add "JuridicaExp"
        .Add "RESPONSABLECALIDADCalculado"
        .Add "IDTipo"
        
        
        
    End With
    Set ColCamposVarianEnVinculacionNC = m_objColCamposVarianEnVinculacionNC
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.ColCamposVarianEnVinculacionNC ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

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
        .Add "IDNoConformidad"
        .Add "Juridica"
        .Add "CodigoNoConformidad"
        .Add "EsNoConformidad"
        .Add "EXPEDIENTE"
        .Add "PROYECTO"
        .Add "VEHICULO"
        .Add "DESCRIPCION"
        .Add "CAUSA"
        .Add "CausaYAnalisRaiz"
        .Add "ENTIDADRESPONSABLE"
        .Add "RESPONSABLETELEFONICA"
        .Add "FECHAAPERTURA"
        .Add "FECHACIERRE"
        .Add "FPREVCIERRE"
        .Add "NOTAS"
        .Add "Borrado"
        .Add "RequiereACR"
        .Add "ACR"
        .Add "MotivoBorrado"
        .Add "RequiereControlEficacia"
        .Add "MotivoNoRequiereControlEficacia"
        .Add "ControlEficacia"
        .Add "FechaControlEficacia"
        .Add "FechaPrevistaControlEficacia"
        .Add "ResultadoControlEficacia"
        .Add "ConformeControlEficacia"
        .Add "RESPONSABLECALIDAD"
        .Add "IDExpediente"
        .Add "CodExp"
        .Add "Nemotecnico"
        .Add "JuridicaExp"
        .Add "IDTipo"
        .Add "DetectadoPor"
        .Add "ESTADO"
        .Add "Cerrada"
        .Add "IDNCAsociada"
        .Add "CodigoNoConformidadAsociada"
        .Add "CodConcesionAsociada"
        
        
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get ColCamposParaCopiarDeVinculada() As Collection

    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Not m_objColCamposParaCopiarDeVinculada Is Nothing Then
        Set ColCamposParaCopiarDeVinculada = m_objColCamposParaCopiarDeVinculada
        Exit Property
    End If
    Set m_objColCamposParaCopiarDeVinculada = New Collection
    With m_objColCamposParaCopiarDeVinculada
        .Add "EsNoConformidad"
        .Add "VEHICULO"
        .Add "CAUSA"
        .Add "CausaYAnalisRaiz"
        .Add "ENTIDADRESPONSABLE"
        .Add "FECHACIERRE"
        .Add "FPREVCIERRE"
        .Add "NOTAS"
        .Add "Borrado"
        .Add "RequiereACR"
        .Add "ACR"
        .Add "MotivoBorrado"
        .Add "RequiereControlEficacia"
        .Add "MotivoNoRequiereControlEficacia"
        .Add "ControlEficacia"
        .Add "FechaControlEficacia"
        .Add "FechaPrevistaControlEficacia"
        .Add "ResultadoControlEficacia"
        .Add "ConformeControlEficacia"
        .Add "IDTipo"
        .Add "ESTADO"
        .Add "Cerrada"
        
        
    End With
    Set ColCamposParaCopiarDeVinculada = m_objColCamposParaCopiarDeVinculada
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método NCProyecto.ColCamposParaCopiarDeVinculada ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDNoConformidad" Then
        getPropiedad = Me.IDNoConformidad
        Exit Function
    End If
    If m_NombrePropiedad = "Juridica" Then
        getPropiedad = Me.Juridica
        Exit Function
    End If
    If m_NombrePropiedad = "CodigoNoConformidad" Then
        getPropiedad = Me.CodigoNoConformidad
        Exit Function
    End If
    If m_NombrePropiedad = "EsNoConformidad" Then
        getPropiedad = Me.EsNoConformidad
        Exit Function
    End If
    If m_NombrePropiedad = "EXPEDIENTE" Then
        getPropiedad = Me.Expediente
        Exit Function
    End If
    If m_NombrePropiedad = "PROYECTO" Then
        getPropiedad = Me.Proyecto
        Exit Function
    End If
    If m_NombrePropiedad = "VEHICULO" Then
        getPropiedad = Me.VEHICULO
        Exit Function
    End If
    If m_NombrePropiedad = "DESCRIPCION" Then
        getPropiedad = Me.Descripcion
        Exit Function
    End If
    If m_NombrePropiedad = "CAUSA" Then
        getPropiedad = Me.Causa
        Exit Function
    End If
    If m_NombrePropiedad = "CausaYAnalisRaiz" Then
        getPropiedad = Me.CausaYAnalisRaiz
        Exit Function
    End If
    If m_NombrePropiedad = "ENTIDADRESPONSABLE" Then
        getPropiedad = Me.EntidadResponsable
        Exit Function
    End If
    If m_NombrePropiedad = "RESPONSABLETELEFONICA" Then
        getPropiedad = Me.ResponsableTelefonica
        Exit Function
    End If
    If m_NombrePropiedad = "FECHAAPERTURA" Then
        getPropiedad = Me.FechaApertura
        Exit Function
    End If
    If m_NombrePropiedad = "FECHACIERRE" Then
        getPropiedad = Me.FECHACIERRE
        Exit Function
    End If
    If m_NombrePropiedad = "FPREVCIERRE" Then
        getPropiedad = Me.FPREVCIERRE
        Exit Function
    End If
    If m_NombrePropiedad = "NOTAS" Then
        getPropiedad = Me.Notas
        Exit Function
    End If
    If m_NombrePropiedad = "Borrado" Then
        getPropiedad = Me.Borrado
        Exit Function
    End If
    If m_NombrePropiedad = "RequiereACR" Then
        getPropiedad = Me.RequiereACR
        Exit Function
    End If
    If m_NombrePropiedad = "ACR" Then
        getPropiedad = Me.ACR
        Exit Function
    End If
    If m_NombrePropiedad = "CausaYAnalisRaiz" Then
        getPropiedad = Me.CausaYAnalisRaiz
        Exit Function
    End If
    If m_NombrePropiedad = "MotivoBorrado" Then
        getPropiedad = Me.MotivoBorrado
        Exit Function
    End If
    If m_NombrePropiedad = "RequiereControlEficacia" Then
        getPropiedad = Me.RequiereControlEficacia
        Exit Function
    End If
    If m_NombrePropiedad = "MotivoNoRequiereControlEficacia" Then
        getPropiedad = Me.MotivoNoRequiereControlEficacia
        Exit Function
    End If
    If m_NombrePropiedad = "ControlEficacia" Then
        getPropiedad = Me.ControlEficacia
        Exit Function
    End If
    If m_NombrePropiedad = "FechaControlEficacia" Then
        getPropiedad = Me.FechaControlEficacia
        Exit Function
    End If
    If m_NombrePropiedad = "FechaPrevistaControlEficacia" Then
        getPropiedad = Me.FechaPrevistaControlEficacia
        Exit Function
    End If
    If m_NombrePropiedad = "ResultadoControlEficacia" Then
        getPropiedad = Me.ResultadoControlEficacia
        Exit Function
    End If
    If m_NombrePropiedad = "ConformeControlEficacia" Then
        getPropiedad = Me.ConformeControlEficacia
        Exit Function
    End If
    If m_NombrePropiedad = "RESPONSABLECALIDAD" Then
        getPropiedad = Me.RESPONSABLECALIDAD
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        getPropiedad = Me.IDExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "CodExp" Then
        getPropiedad = Me.CodExp
        Exit Function
    End If
    If m_NombrePropiedad = "Nemotecnico" Then
        getPropiedad = Me.Nemotecnico
        Exit Function
    End If
    If m_NombrePropiedad = "JuridicaExp" Then
        getPropiedad = Me.JuridicaExp
        Exit Function
    End If
    
    
    If m_NombrePropiedad = "IDTipo" Then
        getPropiedad = Me.IDTipo
        Exit Function
    End If
    
    If m_NombrePropiedad = "DetectadoPor" Then
        getPropiedad = Me.DetectadoPor
        Exit Function
    End If
    
    If m_NombrePropiedad = "ESTADO" Then
        getPropiedad = Me.Estado
        Exit Function
    End If
    
    If m_NombrePropiedad = "Cerrada" Then
        getPropiedad = Me.Cerrada
        Exit Function
    End If
    If m_NombrePropiedad = "IDNCAsociada" Then
        getPropiedad = Me.IDNCAsociada
        Exit Function
    End If
    If m_NombrePropiedad = "CodigoNoConformidadAsociada" Then
        getPropiedad = Me.CodigoNoConformidadAsociada
        Exit Function
    End If
    If m_NombrePropiedad = "CodConcesionAsociada" Then
        getPropiedad = Me.CodConcesionAsociada
        Exit Function
    End If
    
    p_Error = "Propiedad no reconocida en NCProyecto.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCProyecto.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function




Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDNoConformidad" Then
        Me.IDNoConformidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Juridica" Then
        Me.Juridica = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CodigoNoConformidad" Then
        Me.CodigoNoConformidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "EsNoConformidad" Then
        Me.EsNoConformidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "EXPEDIENTE" Then
        Me.Expediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "PROYECTO" Then
        Me.Proyecto = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "VEHICULO" Then
        Me.VEHICULO = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "DESCRIPCION" Then
        Me.Descripcion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CAUSA" Then
        Me.Causa = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CausaYAnalisRaiz" Then
        Me.CausaYAnalisRaiz = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ENTIDADRESPONSABLE" Then
        Me.EntidadResponsable = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "RESPONSABLETELEFONICA" Then
        Me.ResponsableTelefonica = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FECHAAPERTURA" Then
        Me.FechaApertura = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FECHACIERRE" Then
        Me.FECHACIERRE = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FPREVCIERRE" Then
        Me.FPREVCIERRE = m_ValorPropiedad
        Exit Function
    End If
    
    If m_NombrePropiedad = "NOTAS" Then
        Me.Notas = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Borrado" Then
        Me.Borrado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "RequiereACR" Then
        Me.RequiereACR = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ACR" Then
        Me.ACR = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "MotivoBorrado" Then
        Me.MotivoBorrado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "RequiereControlEficacia" Then
        Me.RequiereControlEficacia = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "MotivoNoRequiereControlEficacia" Then
        Me.MotivoNoRequiereControlEficacia = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ControlEficacia" Then
        Me.ControlEficacia = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaControlEficacia" Then
        Me.FechaControlEficacia = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaPrevistaControlEficacia" Then
        Me.FechaPrevistaControlEficacia = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ResultadoControlEficacia" Then
        Me.ResultadoControlEficacia = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ConformeControlEficacia" Then
        Me.ConformeControlEficacia = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "RESPONSABLECALIDAD" Then
        Me.RESPONSABLECALIDAD = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        Me.IDExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CodExp" Then
        Me.CodExp = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Nemotecnico" Then
        Me.Nemotecnico = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "JuridicaExp" Then
        Me.JuridicaExp = m_ValorPropiedad
        Exit Function
    End If
    
    
    If m_NombrePropiedad = "IDTipo" Then
        Me.IDTipo = m_ValorPropiedad
        Exit Function
    End If
    
    If m_NombrePropiedad = "DetectadoPor" Then
        Me.DetectadoPor = m_ValorPropiedad
        Exit Function
    End If
    
    If m_NombrePropiedad = "ESTADO" Then
        Me.Estado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Cerrada" Then
        Me.Cerrada = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDNCAsociada" Then
        Me.IDNCAsociada = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CodigoNoConformidadAsociada" Then
        Me.CodigoNoConformidadAsociada = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CodConcesionAsociada" Then
        Me.CodConcesionAsociada = m_ValorPropiedad
        Exit Function
    End If
    
    p_Error = "Propiedad no reconocida en NCProyecto.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NCProyecto.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function











