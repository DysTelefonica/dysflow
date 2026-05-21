VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Entorno"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public URLArchivoUltimo As String

Private m_objColAdministradores As Scripting.Dictionary
Private m_objColUsuariosCalidad As Scripting.Dictionary
Private m_objColUsuariosTecnicos As Scripting.Dictionary
Private m_objColUsuarios As Scripting.Dictionary
Private m_sCSS As String
Private m_sURLAchivoIni As String
Private m_sURLArchivoCSS As String
Private m_sURLDirectorioAplicaciones As String
Private m_sURLDirectorioAplicacion As String
Private m_sURLDirectorioDocumentacion As String
Private m_sURLDirectorioIconos As String
Private m_sURLDirectorioLocal As String
Private m_sURLDirectorioDocumentacionAyuda As String
Private m_sVersionAplicacion As String
Private m_sDiasParaAvisoFinExpediente As String
Private m_sDiasParaOfertasSinDecision As String

Private m_objColGradosClasificacionesEnExpedientes As Scripting.Dictionary
Private m_objColComercialesEnExpedientes As Scripting.Dictionary
Private m_objColCPVSEnExpedientes As Scripting.Dictionary
Private m_objColejercitoSEnExpedientes As Scripting.Dictionary
Private m_objColEstados As Scripting.Dictionary
Private m_objColEstadosTexto As Scripting.Dictionary
Private m_objColEstadosTitulo As Scripting.Dictionary
Private m_objColEstadosTituloMejorado As Scripting.Dictionary
Private m_ObjcolExplicacionTipoTarea As Scripting.Dictionary
Private m_objColJefaturaSEnExpedientes As Scripting.Dictionary
Private m_objColJuridicaSEnExpedientes As Scripting.Dictionary
Private m_objColLugarEjecucionSEnExpedientes As Scripting.Dictionary
Private m_objColOficinaProgramaSEnExpedientes As Scripting.Dictionary
Private m_objColExpedientesEstadoDesconocido As Scripting.Dictionary
Private m_objColExpedientesAPuntoDeRecepcionarCompleto As Scripting.Dictionary
Private m_objColExpedientesAPuntoDeRecepcionarHito As Scripting.Dictionary
Private m_objColExpedientesAdjudicadosSinContrato As Scripting.Dictionary
Private m_objColExpedientesAdjudicadosTSOLSinCodS4H As Scripting.Dictionary
Private m_objColExpedientesFaseOfertaPorMuchoTiempo As Scripting.Dictionary
Private m_objColOrganoContratacioneSEnExpedientes As Scripting.Dictionary
Private m_objColPECALeSEnExpedientes As Scripting.Dictionary
Private m_objColRACSEnExpedientes As Scripting.Dictionary
Private m_ObjColExpedientesParaCombo As Scripting.Dictionary

Private m_ObjColOrganosContrataciones As Scripting.Dictionary
Private m_ObjComerciales As Scripting.Dictionary
Private m_ObjJPs As Scripting.Dictionary
Private m_ObjCPVs As Scripting.Dictionary
Private m_ObjEjercitos As Scripting.Dictionary


Private m_ObjJuridicas As Scripting.Dictionary
Private m_ObjCadenaSuministradores As Scripting.Dictionary
Private m_ObjLugaresEjecucion As Scripting.Dictionary
Private m_ObjOficinasDePrograma As Scripting.Dictionary
Private m_ObjOrganosContratacion As Scripting.Dictionary
Private m_ObjPECALES As Scripting.Dictionary
Private m_ObjRACS As Scripting.Dictionary
Private m_ObjSuministradores As Scripting.Dictionary
Private m_ObjGradosClasificaciones As Scripting.Dictionary

Private m_ObjOtrasOpciones As Scripting.Dictionary
Private m_ObjOtrasOpcionesFormularios As Scripting.Dictionary
Private m_objColTiposExpedientes As Scripting.Dictionary
Private m_objColExpedientesTipos As Scripting.Dictionary
Private m_objColTiposExpedientesParaBusqueda As Scripting.Dictionary


Private m_objColTiposExpedientesParaAM As Scripting.Dictionary
Private m_objColTiposExpedientesParaLote As Scripting.Dictionary
Private m_objColTiposExpedientesNoDerivados As Scripting.Dictionary

Private m_objColExpedientesParaAMTipos As Scripting.Dictionary
Private m_objColExpedientesParaLoteTipos As Scripting.Dictionary
Private m_objColExpedientesParaNoDerivadosTipos As Scripting.Dictionary

Private m_objColAplicaAgedysTipos As Scripting.Dictionary
Private m_objColTiposAplicaAgedys As Scripting.Dictionary

Private m_objColExpedientesTodos As Scripting.Dictionary
Private m_ObjUltimoCambio As UltimoCambio

Private m_sTituloUsuarioConectado As String
Private m_objColCamposInformeSimple As Scripting.Dictionary
Private m_objColCamposInformeCompleto As Scripting.Dictionary
Private m_objColExpedientesCompletos As Scripting.Dictionary
Private m_objColExpedientesEnGestionDeRiesgos As Scripting.Dictionary
Private m_objColImagenes As Scripting.Dictionary

Private m_sURLIconoCadenaContratacionOrganoControl As String
Private m_sURLIconoCadenaContratacionEmpresaNoGrupo As String
Private m_sURLIconoCadenaContratacionEmpresaGrupo As String

Private m_sURLIconoEmpresaLista As String

Public Error As String
Private m_Error As String
Private m_objColItems As Scripting.Dictionary



Public Property Get ColImagenes() As Scripting.Dictionary
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objColImagenes Is Nothing Then
        Set ColImagenes = m_objColImagenes
        Exit Property
    End If
    Set m_objColImagenes = New Scripting.Dictionary
    m_objColImagenes.CompareMode = TextCompare
    With m_objColImagenes
        .Add m_ObjEntorno.URLIconoCadenaContratacionOrganoControl, m_ObjEntorno.URLIconoCadenaContratacionOrganoControl
        .Add m_ObjEntorno.URLIconoCadenaContratacionEmpresaNoGrupo, m_ObjEntorno.URLIconoCadenaContratacionEmpresaNoGrupo
        .Add m_ObjEntorno.URLIconoCadenaContratacionEmpresaGrupo, m_ObjEntorno.URLIconoCadenaContratacionEmpresaGrupo
        .Add m_ObjEntorno.URLIconoEmpresaLista, m_ObjEntorno.URLIconoEmpresaLista
        
        
    End With
    Set ColImagenes = m_objColImagenes
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColImagenes ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get DiasParaAvisoFinExpediente() As String

    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If m_sDiasParaAvisoFinExpediente <> "" Then
        DiasParaAvisoFinExpediente = m_sDiasParaAvisoFinExpediente
        Exit Property
    End If
    m_sDiasParaAvisoFinExpediente = "15"
    DiasParaAvisoFinExpediente = m_sDiasParaAvisoFinExpediente
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.DiasParaAvisoFinExpediente ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Property Get DiasParaOfertasSinDecision() As String

    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If m_sDiasParaOfertasSinDecision <> "" Then
        DiasParaOfertasSinDecision = m_sDiasParaOfertasSinDecision
        Exit Property
    End If
    m_sDiasParaOfertasSinDecision = Application.TempVars("DiasParaOfertasSinDecision")
    DiasParaOfertasSinDecision = m_sDiasParaOfertasSinDecision
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.DiasParaOfertasSinDecision ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get ColCamposInformeSimple() As Scripting.Dictionary

    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Not m_objColCamposInformeSimple Is Nothing Then
        Set ColCamposInformeSimple = m_objColCamposInformeSimple
        Exit Property
    End If
    Set m_objColCamposInformeSimple = New Scripting.Dictionary
    m_objColCamposInformeSimple.CompareMode = TextCompare
    With m_objColCamposInformeSimple
        .Add "CadenaContratistas", "Contratistas"
        .Add "Tipo", "Tipo"
        .Add "Titulo", "Título"
        .Add "CodExp", "Nº Exp. Corto"
        .Add "Ejercito", "Ejército"
        .Add "Estado", "ESTADOCalculadoTexto"
        .Add "FechaInicioContrato", "Fecha Inicio"
        .Add "FechaFinContrato", "Fecha Fin"
        .Add "CadenaJPs", "Jefe Proyecto"
        .Add "ResponsableCalidad", "Calidad"
        .Add "ResponsableSeguridad", "Seguridad"
    End With
    Set ColCamposInformeSimple = m_objColCamposInformeSimple
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColCamposInformeSimple ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Get ColCamposInformeCompleto() As Scripting.Dictionary

    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Not m_objColCamposInformeCompleto Is Nothing Then
        Set ColCamposInformeCompleto = m_objColCamposInformeCompleto
        Exit Property
    End If
    Set m_objColCamposInformeCompleto = New Scripting.Dictionary
    m_objColCamposInformeCompleto.CompareMode = TextCompare
    With m_objColCamposInformeCompleto
        .Add "IDExpediente", "ID"
        .Add "IDExpedientePadre", "IDExpedientePadre"
        .Add "CadenaContratistas", "Contratistas"
        .Add "Nemotecnico", "Nemotécnico"
        .Add "Titulo", "Título"
        .Add "ObjetoContrato", "ObjetoContrato"
        .Add "ImporteLicitacion", "Importe Licitación"
        .Add "ImporteContratacion", "Importe Contratación"
        .Add "CodProyecto", "Cod Proyecto"
        .Add "CodExp", "Nº Exp. Corto"
        .Add "CodExpLargo", "Nº Exp. Largo"
        .Add "CodS4H", "CodS4H"
        .Add "CodigoActividad", "Cod. Actividad"
        .Add "FechaInicioContrato", "Fecha Inicio"
        .Add "FechaFinContrato", "Fecha Fin"
        .Add "GARANTIAMESES", "Garantía (meses)"
        .Add "FechaFinGarantia", "Fecha Fin Garantía"
        .Add "EsAM", "AM"
        .Add "EsLote", "Lote"
        .Add "EsBasado", "Basado"
        .Add "EsExpediente", "Expediente"
        .Add "Ordinal", "Número"
        .Add "Clasificacion", "Clasificación"
        .Add "OrganoContratacion", "OrganoContratación"
        .Add "OficinaPrograma", "Oficina de Programa"
        .Add "Ejercito", "Ejército"
        .Add "AccesoSharepoint", "AccesoSharepoint"
        .Add "Observaciones", "Observaciones"
        .Add "Ambito", "Se Ejecuta en Defensa"
        .Add "NPedido", "NPedido"
        .Add "ResponsableCalidad", "Calidad"
        .Add "ResponsableSeguridad", "Seguridad"
        .Add "AGEDYSAplica", "Para AGEDYS"
        .Add "AGEDYSGenerico", "AGEDYS Genérico"
        .Add "HPSAplica", "Para HPS"
        .Add "Tipo", "Tipo"
        .Add "CadenaPecal", "CadenaPecal"
        .Add "Pecal", "Pecal"
        .Add "POSTAGEDO", "POSTAGEDO"
        .Add "APLICAESTADO", "Aplica Estado"
        .Add "FECHAPREOFERTA", "F.PreOferta"
        .Add "FECHAOFERTA", "F.Oferta"
        .Add "FECHAADJUDICACION", "F.Adjudicación"
        .Add "FECHAFIRMACONTRATO", "F.Firma"
        .Add "FECHACERTIFICACION", "F.Certificación"
        .Add "FECHAPERDIDA", "F.Perdida"
        .Add "FECHADESESTIMADA", "F.Desestimada"
        .Add "Estado", "ESTADOCalculadoTexto"
        .Add "CadenaJPs", "Jefe Proyecto"
        .Add "CadenaComerciales", "Comerciales"
        .Add "CadenaRACs", "Racs"
        .Add "CadenaHitos", "Hitos"
    End With
    Set ColCamposInformeCompleto = m_objColCamposInformeCompleto
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColCamposInformeCompleto ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Get UltimoCambio() As UltimoCambio
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjUltimoCambio Is Nothing Then
        Set UltimoCambio = m_ObjUltimoCambio
        Exit Property
    End If
    Set m_ObjUltimoCambio = constructor.getUltimoCambio(p_IDUsuario:=m_ObjUsuarioConectado.ID, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set UltimoCambio = m_ObjUltimoCambio
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.UltimoCambio ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set UltimoCambio(p_Valor As Variant)
    
    Set m_ObjUltimoCambio = p_Valor
    
End Property
Public Property Get TituloUsuarioConectado() As String
    
    Dim m_Colectivo As String
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sTituloUsuarioConectado <> "" Then
        TituloUsuarioConectado = m_sTituloUsuarioConectado
        Exit Property
    End If
    
    If EsAdministrador = EnumSiNo.Sí Then
        m_Colectivo = "Administrador"
    ElseIf EsCalidad = EnumSiNo.Sí Then
        m_Colectivo = "Calidad"
    Else
        m_Colectivo = "Técnico"
    End If
    m_sTituloUsuarioConectado = "Usuario conectado: " & m_ObjUsuarioConectado.Nombre & " ( " & m_Colectivo & " )" & m_TextoWin64
    
    TituloUsuarioConectado = m_sTituloUsuarioConectado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.TituloUsuarioConectado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ColTiposExpedientes() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColTiposExpedientes Is Nothing Then
        Set ColTiposExpedientes = m_objColTiposExpedientes
        Exit Property
    End If
    
    Set m_objColTiposExpedientes = New Scripting.Dictionary
    m_objColTiposExpedientes.CompareMode = TextCompare
    With m_objColTiposExpedientes
        .Add CStr(EnumTipoExpediente.AM), "Acuerdo Marco"
        .Add CStr(EnumTipoExpediente.Lote), "Lote"
        .Add CStr(EnumTipoExpediente.BasadoDeAM), "Contrato Basado de AM"
        .Add CStr(EnumTipoExpediente.BasadoDeLote), "Contrato Basado de Lote"
        .Add CStr(EnumTipoExpediente.EXPIndividual), "Expediente individual"
        
    End With
    
    Set ColTiposExpedientes = m_objColTiposExpedientes
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColTiposExpedientes ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get ColAplicaAgedysTipos() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColAplicaAgedysTipos Is Nothing Then
        Set ColAplicaAgedysTipos = m_objColAplicaAgedysTipos
        Exit Property
    End If
    
    Set m_objColAplicaAgedysTipos = New Scripting.Dictionary
    m_objColAplicaAgedysTipos.CompareMode = TextCompare
    With m_objColAplicaAgedysTipos
        .Add "No", EnumAPLICAAGEDYS.No
        .Add "Sí Exp Normal", EnumAPLICAAGEDYS.SiExpNormal
        .Add "Sí Exp Genérico (OTROS_COMERCIALES)", EnumAPLICAAGEDYS.SiExpGenerico
        
    End With
    
    Set ColAplicaAgedysTipos = m_objColAplicaAgedysTipos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColAplicaAgedysTipos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get ColTiposAplicaAgedys() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColTiposAplicaAgedys Is Nothing Then
        Set ColTiposAplicaAgedys = m_objColTiposAplicaAgedys
        Exit Property
    End If
    
    Set m_objColTiposAplicaAgedys = New Scripting.Dictionary
    m_objColTiposAplicaAgedys.CompareMode = TextCompare
    With m_objColTiposAplicaAgedys
        .Add CStr(EnumAPLICAAGEDYS.No), "No"
        .Add CStr(EnumAPLICAAGEDYS.SiExpNormal), "Sí Exp Normal"
        .Add CStr(EnumAPLICAAGEDYS.SiExpGenerico), "Sí Exp Genérico (OTROS_COMERCIALES)"
        
    End With
    
    Set ColTiposAplicaAgedys = m_objColTiposAplicaAgedys
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColTiposAplicaAgedys ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ColTiposExpedientesParaBusqueda() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColTiposExpedientesParaBusqueda Is Nothing Then
        Set ColTiposExpedientesParaBusqueda = m_objColTiposExpedientesParaBusqueda
        Exit Property
    End If
    
    Set m_objColTiposExpedientesParaBusqueda = New Scripting.Dictionary
    m_objColTiposExpedientesParaBusqueda.CompareMode = TextCompare
    With m_objColTiposExpedientesParaBusqueda
        .Add "Acuerdo Marco", "Acuerdo Marco"
        .Add "Lote", "Lote"
        .Add "Basado", "Basado"
        .Add "BasadoDeAM", "Basado de Acuerdo Marco"
        .Add "BasadoDeLote", "Basado de Lote"
        .Add "Expediente", "Expediente"
    End With
    
    Set ColTiposExpedientesParaBusqueda = m_objColTiposExpedientesParaBusqueda
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColTiposExpedientesParaBusqueda ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get ColTiposExpedientesParaAM() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColTiposExpedientesParaAM Is Nothing Then
        Set ColTiposExpedientesParaAM = m_objColTiposExpedientesParaAM
        Exit Property
    End If
    
    Set m_objColTiposExpedientesParaAM = New Scripting.Dictionary
    m_objColTiposExpedientesParaAM.CompareMode = TextCompare
    With m_objColTiposExpedientesParaAM
        .Add CStr(EnumTipoExpediente.Lote), "Lote de Acuerdo Marco"
        .Add CStr(EnumTipoExpediente.BasadoDeAM), "Contrato Basado de AM"
    End With
    
    Set ColTiposExpedientesParaAM = m_objColTiposExpedientesParaAM
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColTiposExpedientesParaAM ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ColTiposExpedientesNoDerivados() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColTiposExpedientesNoDerivados Is Nothing Then
        Set ColTiposExpedientesNoDerivados = m_objColTiposExpedientesNoDerivados
        Exit Property
    End If
    
    Set m_objColTiposExpedientesNoDerivados = New Scripting.Dictionary
    m_objColTiposExpedientesNoDerivados.CompareMode = TextCompare
    With m_objColTiposExpedientesNoDerivados
        .Add CStr(EnumTipoExpediente.AM), "Acuerdo Marco"
        .Add CStr(EnumTipoExpediente.Lote), "Lote"
        .Add CStr(EnumTipoExpediente.EXPIndividual), "Expediente individual"
        .Add CStr(EnumTipoExpediente.EXPHPS), "Expediente Sólo para HPS"
    End With
    
    Set ColTiposExpedientesNoDerivados = m_objColTiposExpedientesNoDerivados
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColTiposExpedientesNoDerivados ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get ColTiposExpedientesParaLote() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColTiposExpedientesParaLote Is Nothing Then
        Set ColTiposExpedientesParaLote = m_objColTiposExpedientesParaLote
        Exit Property
    End If
    
    Set m_objColTiposExpedientesParaLote = New Scripting.Dictionary
    m_objColTiposExpedientesParaLote.CompareMode = TextCompare
    With m_objColTiposExpedientesParaLote
        .Add CStr(EnumTipoExpediente.BasadoDeLote), "Contrato Basado de Lote"
    End With
    
    Set ColTiposExpedientesParaLote = m_objColTiposExpedientesParaLote
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColTiposExpedientesParaLote ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get ColExpedientesTipos() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColExpedientesTipos Is Nothing Then
        Set ColExpedientesTipos = m_objColExpedientesTipos
        Exit Property
    End If
    
    Set m_objColExpedientesTipos = New Scripting.Dictionary
    m_objColExpedientesTipos.CompareMode = TextCompare
    With m_objColExpedientesTipos
        .Add "Acuerdo Marco", EnumTipoExpediente.AM
        .Add "Lote", EnumTipoExpediente.Lote
        .Add "Contrato Basado de AM", EnumTipoExpediente.BasadoDeAM
        .Add "Contrato Basado de Lote", EnumTipoExpediente.BasadoDeLote
        .Add "Expediente individual", EnumTipoExpediente.EXPIndividual
        .Add "Expediente Sólo para HPS", EnumTipoExpediente.EXPHPS
    End With
    
    Set ColExpedientesTipos = m_objColExpedientesTipos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColExpedientesTipos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get ColExpedientesParaAMTipos() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColExpedientesTipos Is Nothing Then
        Set ColExpedientesParaAMTipos = m_objColExpedientesParaAMTipos
        Exit Property
    End If
    
    Set m_objColExpedientesParaAMTipos = New Scripting.Dictionary
    m_objColExpedientesParaAMTipos.CompareMode = TextCompare
    With m_objColExpedientesParaAMTipos
        .Add "Lote de Acuerdo Marco", EnumTipoExpediente.Lote
        .Add "Contrato Basado de AM", EnumTipoExpediente.BasadoDeAM
    End With
    
    Set ColExpedientesParaAMTipos = m_objColExpedientesParaAMTipos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColExpedientesParaAMTipos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ColExpedientesParaLoteTipos() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColExpedientesParaLoteTipos Is Nothing Then
        Set ColExpedientesParaLoteTipos = m_objColExpedientesParaLoteTipos
        Exit Property
    End If
    
    Set m_objColExpedientesParaLoteTipos = New Scripting.Dictionary
    m_objColExpedientesParaLoteTipos.CompareMode = TextCompare
    With m_objColExpedientesParaLoteTipos
        .Add "Contrato Basado de Lote", EnumTipoExpediente.BasadoDeLote
    End With
    
    Set ColExpedientesParaLoteTipos = m_objColExpedientesParaLoteTipos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColExpedientesParaLoteTipos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get ColExpedientesParaNoDerivadosTipos() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColExpedientesParaNoDerivadosTipos Is Nothing Then
        Set ColExpedientesParaNoDerivadosTipos = m_objColExpedientesParaNoDerivadosTipos
        Exit Property
    End If
    
    Set m_objColExpedientesParaNoDerivadosTipos = New Scripting.Dictionary
    m_objColExpedientesParaNoDerivadosTipos.CompareMode = TextCompare
    With m_objColExpedientesParaNoDerivadosTipos
        
        .Add "Acuerdo Marco", EnumTipoExpediente.AM
        .Add "Lote", EnumTipoExpediente.Lote
        .Add "Expediente individual", EnumTipoExpediente.EXPIndividual
        .Add "Expediente Sólo para HPS", EnumTipoExpediente.EXPHPS
    End With
    
    Set ColExpedientesParaNoDerivadosTipos = m_objColExpedientesParaNoDerivadosTipos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColExpedientesParaNoDerivadosTipos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get OtrasOpciones() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjOtrasOpciones Is Nothing Then
        Set OtrasOpciones = m_ObjOtrasOpciones
        Exit Property
    End If
    
    Set m_ObjOtrasOpciones = New Scripting.Dictionary
    m_ObjOtrasOpciones.CompareMode = TextCompare
    With m_ObjOtrasOpciones
        .Add CStr(EnumOtrasOpciones.Comerciales), "Comerciales"
        .Add CStr(EnumOtrasOpciones.CPVs), "CPVs"
        .Add CStr(EnumOtrasOpciones.Ejercitos), "Ejercitos"
        .Add CStr(EnumOtrasOpciones.GradosClasificacion), "Grados de Clasificacion"
        .Add CStr(EnumOtrasOpciones.EMPRESAS), "Empresas"
        .Add CStr(EnumOtrasOpciones.Lugares), "Lugares de Ejecución"
        .Add CStr(EnumOtrasOpciones.OfProgramas), "Oficinas de Programa"
        .Add CStr(EnumOtrasOpciones.OrganoContratacion), "Órganos de Contratación"
        .Add CStr(EnumOtrasOpciones.PECALES), "PECALES"
        .Add CStr(EnumOtrasOpciones.RACs), "RACS"
        
    End With
    
    Set OtrasOpciones = m_ObjOtrasOpciones
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.OtrasOpciones ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get OtrasOpcionesFormularios() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjOtrasOpcionesFormularios Is Nothing Then
        Set OtrasOpcionesFormularios = m_ObjOtrasOpcionesFormularios
        Exit Property
    End If
    
    Set m_ObjOtrasOpcionesFormularios = New Scripting.Dictionary
    m_ObjOtrasOpcionesFormularios.CompareMode = TextCompare
    With m_ObjOtrasOpcionesFormularios
        .Add CStr(EnumOtrasOpciones.Comerciales), "FormComercialesGestion"
        .Add CStr(EnumOtrasOpciones.CPVs), "FormCPVsGestion"
        .Add CStr(EnumOtrasOpciones.Ejercitos), "FormEjercitosGestion"
        .Add CStr(EnumOtrasOpciones.GradosClasificacion), "FormGradosClasificacionGestion"
        .Add CStr(EnumOtrasOpciones.EMPRESAS), "FormSuministradoresGestion"
        .Add CStr(EnumOtrasOpciones.Lugares), "FormLugarEjecucionGestion"
        .Add CStr(EnumOtrasOpciones.OfProgramas), "FormOficinasProgramaGestion"
        .Add CStr(EnumOtrasOpciones.OrganoContratacion), "FormOrganoContratacionGestion"
        .Add CStr(EnumOtrasOpciones.PECALES), "FormPECALESGestion"
        .Add CStr(EnumOtrasOpciones.RACs), "FormRACSGestion"
        
    End With
    
    Set OtrasOpcionesFormularios = m_ObjOtrasOpcionesFormularios
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.OtrasOpcionesFormularios ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ColExpedientesTodos() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColExpedientesTodos Is Nothing Then
        Set ColExpedientesTodos = m_objColExpedientesTodos
        Exit Property
    End If
    Set m_objColExpedientesTodos = constructor.getExpedientes(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColExpedientesTodos = m_objColExpedientesTodos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColExpedientesTodos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get Comerciales() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjComerciales Is Nothing Then
        Set Comerciales = m_ObjComerciales
        Exit Property
    End If
    Set m_ObjComerciales = constructor.getComerciales(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Comerciales = m_ObjComerciales
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.Comerciales ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set Comerciales(p_Valor As Variant)

    Set m_ObjComerciales = p_Valor
    
End Property
Public Property Get JPs() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjJPs Is Nothing Then
        Set JPs = m_ObjJPs
        Exit Property
    End If
    Set m_ObjJPs = constructor.getJPs(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set JPs = m_ObjJPs
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.JPs ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set JPs(p_Valor As Variant)

    Set m_ObjJPs = p_Valor
    
End Property
Public Property Get ColExpedientesParaCombo() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjColExpedientesParaCombo Is Nothing Then
        Set ColExpedientesParaCombo = m_ObjColExpedientesParaCombo
        Exit Property
    End If
    Set m_ObjColExpedientesParaCombo = constructor.getExpedientesParaCombo(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColExpedientesParaCombo = m_ObjColExpedientesParaCombo
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColExpedientesParaCombo ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ColExpedientesParaCombo(p_Valor As Variant)

    Set m_ObjColExpedientesParaCombo = p_Valor
    
End Property
Public Property Get CPVs() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjCPVs Is Nothing Then
        Set CPVs = m_ObjCPVs
        Exit Property
    End If
    Set m_ObjCPVs = constructor.getCPVs(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set CPVs = m_ObjCPVs
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.CPVs ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set CPVs(p_Valor As Variant)

    Set m_ObjCPVs = p_Valor
    
End Property

Public Property Get Ejercitos() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjEjercitos Is Nothing Then
        Set Ejercitos = m_ObjEjercitos
        Exit Property
    End If
    Set m_ObjEjercitos = constructor.getEjercitos(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Ejercitos = m_ObjEjercitos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.Ejercitos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set Ejercitos(p_Valor As Variant)

    Set m_ObjEjercitos = p_Valor
    
End Property



Public Property Get CadenaSuministradores() As Scripting.Dictionary
    'SON LOS QUE HAN FORMADO PARTE DE CONTRATISTA ALGUNA VEZ
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjCadenaSuministradores Is Nothing Then
        Set CadenaSuministradores = m_ObjCadenaSuministradores
        Exit Property
    End If
    Set m_ObjCadenaSuministradores = constructor.getCadenaSuministradores(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set CadenaSuministradores = m_ObjCadenaSuministradores
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.CadenaSuministradores ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set CadenaSuministradores(p_Valor As Variant)

    Set m_ObjCadenaSuministradores = p_Valor
    
End Property
Public Property Get PECALES() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjPECALES Is Nothing Then
        Set PECALES = m_ObjPECALES
        Exit Property
    End If
    Set m_ObjPECALES = constructor.getPELCALES(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set PECALES = m_ObjPECALES
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.PECALES ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set PECALES(p_Valor As Variant)

    Set m_ObjPECALES = p_Valor
    
End Property


Public Property Get RACs() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjRACS Is Nothing Then
        Set RACs = m_ObjRACS
        Exit Property
    End If
    Set m_ObjRACS = constructor.getRACs(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set RACs = m_ObjRACS
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.RACS ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set RACs(p_Valor As Variant)

    Set m_ObjRACS = p_Valor
    
End Property
Public Property Get Suministradores() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjSuministradores Is Nothing Then
        Set Suministradores = m_ObjSuministradores
        Exit Property
    End If
    Set m_ObjSuministradores = constructor.getSuministradores(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Suministradores = m_ObjSuministradores
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.Suministradores ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set Suministradores(p_Valor As Variant)

    Set m_ObjSuministradores = p_Valor
    
End Property
Public Property Get LugaresEjecucion() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjLugaresEjecucion Is Nothing Then
        Set LugaresEjecucion = m_ObjLugaresEjecucion
        Exit Property
    End If
    Set m_ObjLugaresEjecucion = constructor.getLugaresEjecucion(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set LugaresEjecucion = m_ObjLugaresEjecucion
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.LugaresEjecucion ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set LugaresEjecucion(p_Valor As Variant)

    Set m_ObjLugaresEjecucion = p_Valor
    
End Property

Public Property Get OficinasDePrograma() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjOficinasDePrograma Is Nothing Then
        Set OficinasDePrograma = m_ObjOficinasDePrograma
        Exit Property
    End If
    Set m_ObjOficinasDePrograma = constructor.getOficinasPrograma(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set OficinasDePrograma = m_ObjOficinasDePrograma
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.OficinasDePrograma ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set OficinasDePrograma(p_Valor As Variant)

    Set m_ObjOficinasDePrograma = p_Valor
    
End Property
Public Property Get OrganosContratacion() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjOrganosContratacion Is Nothing Then
        Set OrganosContratacion = m_ObjOrganosContratacion
        Exit Property
    End If
    Set m_ObjOrganosContratacion = constructor.getOrganosContrataciones(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set OrganosContratacion = m_ObjOrganosContratacion
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.OrganosContratacion ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set OrganosContratacion(p_Valor As Variant)

    Set m_ObjOrganosContratacion = p_Valor
    
End Property

Public Property Get GradosClasificaciones() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjGradosClasificaciones Is Nothing Then
        Set GradosClasificaciones = m_ObjGradosClasificaciones
        Exit Property
    End If
    Set m_ObjGradosClasificaciones = constructor.getGradosClasificaciones(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set GradosClasificaciones = m_ObjGradosClasificaciones
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.GradosClasificaciones ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set GradosClasificaciones(p_Valor As Variant)

    Set m_ObjGradosClasificaciones = p_Valor
    
End Property

Public Property Get ColOrganosContrataciones() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjColOrganosContrataciones Is Nothing Then
        Set ColOrganosContrataciones = m_ObjColOrganosContrataciones
        Exit Property
    End If
    Set m_ObjColOrganosContrataciones = constructor.getOrganosContrataciones(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColOrganosContrataciones = m_ObjColOrganosContrataciones
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColOrganosContrataciones ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ColOrganosContrataciones(p_Valor As Variant)

    Set m_ObjColOrganosContrataciones = p_Valor

End Property

Public Property Get ColOrganoContratacioneSEnExpedientes() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColOrganoContratacioneSEnExpedientes Is Nothing Then
        Set ColOrganoContratacioneSEnExpedientes = m_objColOrganoContratacioneSEnExpedientes
        Exit Property
    End If
    Set m_objColOrganoContratacioneSEnExpedientes = constructor.getOrganoContratacioneSEnExpedientes(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColOrganoContratacioneSEnExpedientes = m_objColOrganoContratacioneSEnExpedientes
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColOrganoContratacioneSEnExpedientes ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ColOrganoContratacioneSEnExpedientes(p_Valor As Variant)

    Set m_objColOrganoContratacioneSEnExpedientes = p_Valor

End Property

Public Property Get ColOficinaProgramaSEnExpedientes() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColOficinaProgramaSEnExpedientes Is Nothing Then
        Set ColOficinaProgramaSEnExpedientes = m_objColOficinaProgramaSEnExpedientes
        Exit Property
    End If
    Set m_objColOficinaProgramaSEnExpedientes = constructor.getOficinaProgramaSEnExpedientes(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColOficinaProgramaSEnExpedientes = m_objColOficinaProgramaSEnExpedientes
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColOficinaProgramaSEnExpedientes ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ColOficinaProgramaSEnExpedientes(p_Valor As Variant)

    Set m_objColOficinaProgramaSEnExpedientes = p_Valor

End Property

Public Property Get ColExpedientesEstadoDesconocido() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColExpedientesEstadoDesconocido Is Nothing Then
        Set ColExpedientesEstadoDesconocido = m_objColExpedientesEstadoDesconocido
        Exit Property
    End If
    Set m_objColExpedientesEstadoDesconocido = constructor.getExpedientesEstadoDesconocido(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColExpedientesEstadoDesconocido = m_objColExpedientesEstadoDesconocido
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColExpedientesEstadoDesconocido ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ColExpedientesEstadoDesconocido(p_Valor As Variant)

    Set m_objColExpedientesEstadoDesconocido = p_Valor

End Property

Public Property Get ColExpedientesAPuntoDeRecepcionarCompleto() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColExpedientesAPuntoDeRecepcionarCompleto Is Nothing Then
        Set ColExpedientesAPuntoDeRecepcionarCompleto = m_objColExpedientesAPuntoDeRecepcionarCompleto
        Exit Property
    End If
    Set m_objColExpedientesAPuntoDeRecepcionarCompleto = constructor.getColExpedientesAPuntoDeRecepcionarCompleto(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColExpedientesAPuntoDeRecepcionarCompleto = m_objColExpedientesAPuntoDeRecepcionarCompleto
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColExpedientesAPuntoDeRecepcionarCompleto ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ColExpedientesAPuntoDeRecepcionarCompleto(p_Valor As Variant)

    Set m_objColExpedientesAPuntoDeRecepcionarCompleto = p_Valor

End Property

Public Property Get ColExpedientesAPuntoDeRecepcionarHito() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColExpedientesAPuntoDeRecepcionarHito Is Nothing Then
        Set ColExpedientesAPuntoDeRecepcionarHito = m_objColExpedientesAPuntoDeRecepcionarHito
        Exit Property
    End If
    Set m_objColExpedientesAPuntoDeRecepcionarHito = constructor.getColExpedientesAPuntoDeRecepcionarHito(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColExpedientesAPuntoDeRecepcionarHito = m_objColExpedientesAPuntoDeRecepcionarHito
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColExpedientesAPuntoDeRecepcionarHito ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ColExpedientesAPuntoDeRecepcionarHito(p_Valor As Variant)

    Set m_objColExpedientesAPuntoDeRecepcionarHito = p_Valor

End Property

Public Property Get ColExpedientesAdjudicadosSinContrato() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColExpedientesAdjudicadosSinContrato Is Nothing Then
        Set ColExpedientesAdjudicadosSinContrato = m_objColExpedientesAdjudicadosSinContrato
        Exit Property
    End If
    Set m_objColExpedientesAdjudicadosSinContrato = constructor.getColExpedientesAdjudicadosSinContrato(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColExpedientesAdjudicadosSinContrato = m_objColExpedientesAdjudicadosSinContrato
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColExpedientesAdjudicadosSinContrato ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ColExpedientesAdjudicadosSinContrato(p_Valor As Variant)

    Set m_objColExpedientesAdjudicadosSinContrato = p_Valor

End Property
Public Property Get ColExpedientesAdjudicadosTSOLSinCodS4H() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColExpedientesAdjudicadosTSOLSinCodS4H Is Nothing Then
        Set ColExpedientesAdjudicadosTSOLSinCodS4H = m_objColExpedientesAdjudicadosTSOLSinCodS4H
        Exit Property
    End If
    Set m_objColExpedientesAdjudicadosTSOLSinCodS4H = constructor.getColExpedientesAdjudicadosTSOLSinCodS4H(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColExpedientesAdjudicadosTSOLSinCodS4H = m_objColExpedientesAdjudicadosTSOLSinCodS4H
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColExpedientesAdjudicadosTSOLSinCodS4H ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ColExpedientesAdjudicadosTSOLSinCodS4H(p_Valor As Variant)

    Set m_objColExpedientesAdjudicadosTSOLSinCodS4H = p_Valor

End Property
Public Property Get ColExpedientesFaseOfertaPorMuchoTiempo() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColExpedientesFaseOfertaPorMuchoTiempo Is Nothing Then
        Set ColExpedientesFaseOfertaPorMuchoTiempo = m_objColExpedientesFaseOfertaPorMuchoTiempo
        Exit Property
    End If
    Set m_objColExpedientesFaseOfertaPorMuchoTiempo = constructor.getColExpedientesFaseOfertaPorMuchoTiempo(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColExpedientesFaseOfertaPorMuchoTiempo = m_objColExpedientesFaseOfertaPorMuchoTiempo
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColExpedientesFaseOfertaPorMuchoTiempo ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ColExpedientesFaseOfertaPorMuchoTiempo(p_Valor As Variant)

    Set m_objColExpedientesFaseOfertaPorMuchoTiempo = p_Valor

End Property
Public Property Get ColExpedientesCompletos() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColExpedientesCompletos Is Nothing Then
        Set ColExpedientesCompletos = m_objColExpedientesCompletos
        Exit Property
    End If
    Set m_objColExpedientesCompletos = constructor.getExpedientesCompletos(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColExpedientesCompletos = m_objColExpedientesCompletos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColExpedientesCompletos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ColExpedientesCompletos(p_Valor As Variant)

    Set m_objColExpedientesCompletos = p_Valor

End Property
Public Property Get ColExpedientesEnGestionDeRiesgos() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColExpedientesEnGestionDeRiesgos Is Nothing Then
        Set ColExpedientesEnGestionDeRiesgos = m_objColExpedientesEnGestionDeRiesgos
        Exit Property
    End If
    Set m_objColExpedientesEnGestionDeRiesgos = constructor.getExpedientesEnGestionDeRiesgos(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColExpedientesEnGestionDeRiesgos = m_objColExpedientesEnGestionDeRiesgos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColExpedientesEnGestionDeRiesgos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ColEstados() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColEstados Is Nothing Then
        Set ColEstados = m_objColEstados
        Exit Property
    End If
    Set m_objColEstados = New Scripting.Dictionary
    m_objColEstados.CompareMode = TextCompare
    With m_objColEstados
        .Add CStr(EnumEstados.Preoferta), "PreOferta"
        .Add CStr(EnumEstados.Oferta), "Oferta"
        .Add CStr(EnumEstados.Adjudicada), "Adjudicada"
        .Add CStr(EnumEstados.EnEjecucion), "EnEjecucion"
        .Add CStr(EnumEstados.EnGarantia), "EnGarantia"
        .Add CStr(EnumEstados.Cerrado), "Cerrado"
        .Add CStr(EnumEstados.Desestimado), "Desestimado"
        .Add CStr(EnumEstados.Perdido), "Perdido"
        .Add CStr(EnumEstados.NoAPlica), "NoAPlica"
        .Add CStr(EnumEstados.Desconocido), "Desconocido"
    End With
    Set ColEstados = m_objColEstados
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColEstados ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ColEstadosTexto() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColEstadosTexto Is Nothing Then
        Set ColEstadosTexto = m_objColEstadosTexto
        Exit Property
    End If
    Set m_objColEstadosTexto = New Scripting.Dictionary
    m_objColEstadosTexto.CompareMode = TextCompare
    With m_objColEstadosTexto
        .Add "Preoferta", EnumEstados.Preoferta
        .Add "Oferta", EnumEstados.Oferta
        .Add "Adjudicada", EnumEstados.Adjudicada
        .Add "EnEjecucion", EnumEstados.EnEjecucion
        .Add "EnGarantia", EnumEstados.EnGarantia
        .Add "Cerrado", EnumEstados.Cerrado
        .Add "Desestimado", EnumEstados.Desestimado
        .Add "Perdido", EnumEstados.Perdido
        .Add "NoAPlica", EnumEstados.NoAPlica
        .Add "Desconocido", EnumEstados.Desconocido
    End With
    Set ColEstadosTexto = m_objColEstadosTexto
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColEstadosTexto ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ColEstadosTitulo() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColEstadosTitulo Is Nothing Then
        Set ColEstadosTitulo = m_objColEstadosTitulo
        Exit Property
    End If
    Set m_objColEstadosTitulo = New Scripting.Dictionary
    m_objColEstadosTitulo.CompareMode = TextCompare
    With m_objColEstadosTitulo
        .Add CStr(EnumEstados.Preoferta), "PreOferta"
        .Add CStr(EnumEstados.Oferta), "Oferta"
        .Add CStr(EnumEstados.Adjudicada), "Adjudicada"
        .Add CStr(EnumEstados.EnEjecucion), "Ejecución"
        .Add CStr(EnumEstados.EnGarantia), "Garantía"
        .Add CStr(EnumEstados.Cerrado), "Cerrado"
        .Add CStr(EnumEstados.Desestimado), "Desestimado"
        .Add CStr(EnumEstados.Perdido), "Perdido"
        .Add CStr(EnumEstados.NoAPlica), "NoAPlica"
        .Add CStr(EnumEstados.Desconocido), "Desconocido"
    End With
    Set ColEstadosTitulo = m_objColEstadosTitulo
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColEstadosTitulo ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get ColEstadosTituloMejorado() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColEstadosTituloMejorado Is Nothing Then
        Set ColEstadosTituloMejorado = m_objColEstadosTituloMejorado
        Exit Property
    End If
    Set m_objColEstadosTituloMejorado = New Scripting.Dictionary
    m_objColEstadosTituloMejorado.CompareMode = TextCompare
    With m_objColEstadosTituloMejorado
        .Add CStr(EnumEstados.Preoferta), "En fase de PreOferta"
        .Add CStr(EnumEstados.Oferta), "En fase de Oferta"
        .Add CStr(EnumEstados.Adjudicada), "Adjudicada"
        .Add CStr(EnumEstados.EnEjecucion), "En fase de Ejecución"
        .Add CStr(EnumEstados.EnGarantia), "En Garantía"
        .Add CStr(EnumEstados.Cerrado), "Cerrado"
        .Add CStr(EnumEstados.Desestimado), "Desestimado"
        .Add CStr(EnumEstados.Perdido), "Perdido"
        .Add CStr(EnumEstados.NoAPlica), "NoAPlica"
        .Add CStr(EnumEstados.Desconocido), "Desconocido"
    End With
    Set ColEstadosTituloMejorado = m_objColEstadosTituloMejorado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColEstadosTituloMejorado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get colExplicacionTipoTarea() As Scripting.Dictionary

    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If Not m_ObjcolExplicacionTipoTarea Is Nothing Then
        Set colExplicacionTipoTarea = m_ObjcolExplicacionTipoTarea
        Exit Property
    End If
    Set m_ObjcolExplicacionTipoTarea = New Scripting.Dictionary
    With m_ObjcolExplicacionTipoTarea
        .CompareMode = TextCompare
        
        .Add CStr(EnumTipoTarea.EstadoDesconocido), "Expedientes que aplica estado y que no tienen ninguno definido"
        .Add CStr(EnumTipoTarea.APuntoDeRecepcionarCompleto), "Expedientes para los que se está a punto de Recepcionar"
        .Add CStr(EnumTipoTarea.APuntoDeRecepcionarHito), "Expedientes para los que algún hito está a punto de Recepcionar"
        .Add CStr(EnumTipoTarea.AdjudicadoSinContrato), "Expedientes Adjudicados para los que no se tienen datos del contrato"
        .Add CStr(EnumTipoTarea.AdjudicadosTSOLSinCodS4H), "Expedientes Adjudicados de TSOL sin CodS4H"
        .Add CStr(EnumTipoTarea.EnFaseOfertaPorMuchoTiempo), "Exp.En Fase Oferta sin decidir por más de " & m_ObjEntorno.DiasParaOfertasSinDecision & " días"
    End With
    
    Set colExplicacionTipoTarea = m_ObjcolExplicacionTipoTarea
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.colExplicacionTipoTarea ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property

Public Property Get ColGradosClasificacionesEnExpedientes() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColGradosClasificacionesEnExpedientes Is Nothing Then
        Set ColGradosClasificacionesEnExpedientes = m_objColGradosClasificacionesEnExpedientes
        Exit Property
    End If
    Set m_objColGradosClasificacionesEnExpedientes = constructor.getGradosClasificacionesEnExpedientes(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColGradosClasificacionesEnExpedientes = m_objColGradosClasificacionesEnExpedientes
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColGradosClasificacionesEnExpedientes ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ColGradosClasificacionesEnExpedientes(p_Valor As Variant)

    Set m_objColGradosClasificacionesEnExpedientes = p_Valor

End Property

Public Property Get ColComercialesEnExpedientes() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColComercialesEnExpedientes Is Nothing Then
        Set ColComercialesEnExpedientes = m_objColComercialesEnExpedientes
        Exit Property
    End If
    Set m_objColComercialesEnExpedientes = constructor.getExpedientesConComercial(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColComercialesEnExpedientes = m_objColComercialesEnExpedientes
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColComercialesEnExpedientes ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ColComercialesEnExpedientes(p_Valor As Variant)

    Set m_objColComercialesEnExpedientes = p_Valor

End Property

Public Property Get ColAdministradores() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColAdministradores Is Nothing Then
        Set ColAdministradores = m_objColAdministradores
        Exit Property
    End If
    Set m_objColAdministradores = getUsuariosAdministradores(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColAdministradores = m_objColAdministradores
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColUsuariosAdministradores ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ColUsuariosCalidad() As Scripting.Dictionary

    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColUsuariosCalidad Is Nothing Then
        Set ColUsuariosCalidad = m_objColUsuariosCalidad
        Exit Property
    End If
    Set m_objColUsuariosCalidad = getUsuariosCalidad(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColUsuariosCalidad = m_objColUsuariosCalidad
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColUsuariosCalidad ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property
Public Property Get ColUsuariosTecnicos() As Scripting.Dictionary

    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColUsuariosTecnicos Is Nothing Then
        Set ColUsuariosTecnicos = m_objColUsuariosTecnicos
        Exit Property
    End If
    Set m_objColUsuariosTecnicos = getUsuariosTecnicos(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColUsuariosTecnicos = m_objColUsuariosTecnicos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColUsuariosTecnicos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property
Public Property Get ColUsuarios() As Scripting.Dictionary

    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColUsuarios Is Nothing Then
        Set ColUsuarios = m_objColUsuarios
        Exit Property
    End If
    Set m_objColUsuarios = getUsuarios(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColUsuarios = m_objColUsuarios
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColUsuarios ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property
Public Property Get URLAchivoIni() As String
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sURLAchivoIni <> "" Then
        URLAchivoIni = m_sURLAchivoIni
        Exit Property
    End If
    m_sURLAchivoIni = Application.CurrentProject.Path & "\" & fso.GetBaseName(Application.CurrentProject.Name) & ".ini"
    If Not fso.FileExists(m_sURLAchivoIni) Then
        m_Error = "No es alcanzable m_sURLAchivoIni " & vbNewLine & m_sURLAchivoIni
        m_sURLAchivoIni = ""
        Err.Raise 1000
    End If
    URLAchivoIni = m_sURLAchivoIni
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLAchivoIni ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get VersionAplicacion() As String
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sVersionAplicacion <> "" Then
        VersionAplicacion = m_sVersionAplicacion
        Exit Property
    End If
    m_sVersionAplicacion = LeerIni("VersionAplicacion", "#ERR#")
    
    VersionAplicacion = m_sVersionAplicacion
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.VersionAplicacion ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get URLDirectorioAplicaciones() As String
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLDirectorioAplicaciones <> "" Then
        URLDirectorioAplicaciones = m_sURLDirectorioAplicaciones
        Exit Property
    End If
    ' Derivar del parent de URLDirectorioAplicacion (que viene de TempVars)
    m_sURLDirectorioAplicaciones = fso.GetParentFolderName(Application.TempVars("RutaDirectorioAplicacion"))
    
    URLDirectorioAplicaciones = m_sURLDirectorioAplicaciones
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLDirectorioAplicaciones ha devuelto el error:" & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get URLDirectorioAplicacion() As String
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLDirectorioAplicacion <> "" Then
        URLDirectorioAplicacion = m_sURLDirectorioAplicacion
        Exit Property
    End If
    m_sURLDirectorioAplicacion = Application.TempVars("RutaDirectorioAplicacion")
    
    URLDirectorioAplicacion = m_sURLDirectorioAplicacion
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLDirectorioAplicacion ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get URLDirectorioIconos() As String
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLDirectorioIconos <> "" Then
        URLDirectorioIconos = m_sURLDirectorioIconos
        Exit Property
    End If
    m_sURLDirectorioIconos = Application.TempVars("RutaDirectorioAplicacion") & "recursos\Iconos\"
    
    URLDirectorioIconos = m_sURLDirectorioIconos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLDirectorioIconos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Get URLArchivoCSS() As String
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLArchivoCSS <> "" Then
        URLArchivoCSS = m_sURLArchivoCSS
        Exit Property
    End If
    ' CSS.txt vive en el parent de RutaDirectorioAplicacion
    m_sURLArchivoCSS = fso.GetParentFolderName(Application.TempVars("RutaDirectorioAplicacion")) & "\CSS.txt"
    
    URLArchivoCSS = m_sURLArchivoCSS
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLArchivoCSS ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Get URLIconoCadenaContratacionOrganoControl() As String
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLIconoCadenaContratacionOrganoControl <> "" Then
        URLIconoCadenaContratacionOrganoControl = m_sURLIconoCadenaContratacionOrganoControl
        Exit Property
    End If
    m_sURLIconoCadenaContratacionOrganoControl = Me.URLDirectorioIconos & "\suministradores\icono_organo.ico"
    If Not fso.FileExists(m_sURLIconoCadenaContratacionOrganoControl) Then
        m_Error = "No es alcanzable URLIconoCadenaContratacionOrganoControl " & Me.URLIconoCadenaContratacionOrganoControl
        Err.Raise 1000
    End If
    
    URLIconoCadenaContratacionOrganoControl = m_sURLIconoCadenaContratacionOrganoControl
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLIconoCadenaContratacionOrganoControl ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get URLIconoCadenaContratacionEmpresaNoGrupo() As String
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLIconoCadenaContratacionEmpresaNoGrupo <> "" Then
        URLIconoCadenaContratacionEmpresaNoGrupo = m_sURLIconoCadenaContratacionEmpresaNoGrupo
        Exit Property
    End If
    m_sURLIconoCadenaContratacionEmpresaNoGrupo = Me.URLDirectorioIconos & "\suministradores\icono_empresa.ico"
    If Not fso.FileExists(m_sURLIconoCadenaContratacionEmpresaNoGrupo) Then
        m_Error = "No es alcanzable URLIconoCadenaContratacionEmpresaNoGrupo " & Me.URLIconoCadenaContratacionEmpresaNoGrupo
        Err.Raise 1000
    End If
    
    URLIconoCadenaContratacionEmpresaNoGrupo = m_sURLIconoCadenaContratacionEmpresaNoGrupo
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLIconoCadenaContratacionEmpresaNoGrupo ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get URLIconoCadenaContratacionEmpresaGrupo() As String
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLIconoCadenaContratacionEmpresaGrupo <> "" Then
        URLIconoCadenaContratacionEmpresaGrupo = m_sURLIconoCadenaContratacionEmpresaGrupo
        Exit Property
    End If
    m_sURLIconoCadenaContratacionEmpresaGrupo = Me.URLDirectorioIconos & "\suministradores\icono_telefonica.ico"
    If Not fso.FileExists(m_sURLIconoCadenaContratacionEmpresaGrupo) Then
        m_Error = "No es alcanzable URLIconoCadenaContratacionEmpresaGrupo " & Me.URLIconoCadenaContratacionEmpresaGrupo
        Err.Raise 1000
    End If
    
    URLIconoCadenaContratacionEmpresaGrupo = m_sURLIconoCadenaContratacionEmpresaGrupo
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLIconoCadenaContratacionEmpresaGrupo ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Get URLIconoEmpresaLista() As String
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLIconoEmpresaLista <> "" Then
        URLIconoEmpresaLista = m_sURLIconoEmpresaLista
        Exit Property
    End If
    m_sURLIconoEmpresaLista = Me.URLDirectorioIconos & "\suministradores\Icono_empresa_lista.ico"
    If Not fso.FileExists(m_sURLIconoEmpresaLista) Then
        m_Error = "No es alcanzable URLIconoEmpresaLista " & Me.URLIconoEmpresaLista
        Err.Raise 1000
    End If
    
    URLIconoEmpresaLista = m_sURLIconoEmpresaLista
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLIconoEmpresaLista ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Get CSS() As String
    
    Dim ObjDatos As TextStream
    Dim m_URL As String
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sCSS <> "" Then
        CSS = m_sCSS
        Exit Property
    End If
    m_URL = Me.URLArchivoCSS
    m_Error = Me.Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not fso.FileExists(m_URL) Then
        m_Error = "Ne es alcanzable el archivo URLArchivoCSS" & vbNewLine & Me.URLArchivoCSS
        Err.Raise 1000
    End If
    Set ObjDatos = fso.OpenTextFile(m_URL, ForReading, False, TristateMixed)
    While Not ObjDatos.AtEndOfStream
          m_sCSS = m_sCSS & ObjDatos.ReadAll
    Wend
    Set ObjDatos = Nothing
    

    CSS = m_sCSS
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.CSS ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get URLDirectorioDocumentacion() As String
    Dim m_URL As String
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLDirectorioDocumentacion <> "" Then
        URLDirectorioDocumentacion = m_sURLDirectorioDocumentacion
        Exit Property
    End If
    m_URL = Me.URLDirectorioAplicacion
    m_Error = Me.Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    m_sURLDirectorioDocumentacion = m_URL & "ANEXOS\"
    
    If Not fso.FolderExists(m_sURLDirectorioDocumentacion) Then
        m_Error = "No es alcanzable m_sURLDirectorioDocumentacion " & m_sURLDirectorioDocumentacion
        Err.Raise 1000
    End If
    
    URLDirectorioDocumentacion = m_sURLDirectorioDocumentacion
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLDirectorioDocumentacion ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get URLDirectorioDocumentacionAyuda() As String
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLDirectorioDocumentacionAyuda <> "" Then
        URLDirectorioDocumentacionAyuda = m_sURLDirectorioDocumentacionAyuda
        Exit Property
    End If
   
    m_sURLDirectorioDocumentacionAyuda = Me.URLDirectorioDocumentacion & "documentos de ayuda\"
    
    If Not fso.FolderExists(m_sURLDirectorioDocumentacionAyuda) Then
        m_Error = "No es alcanzable m_sURLDirectorioDocumentacionAyuda " & m_sURLDirectorioDocumentacionAyuda
        Err.Raise 1000
    End If
    
    URLDirectorioDocumentacionAyuda = m_sURLDirectorioDocumentacionAyuda
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLDirectorioDocumentacionAyuda ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Get URLDirectorioLocal() As String
    
    Dim m_URL As String
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLDirectorioLocal <> "" Then
        URLDirectorioLocal = m_sURLDirectorioLocal
        Exit Property
    End If
    m_URL = Environ("APPDATA") & "\Aplicaciones DYSN\"
    If Not fso.FolderExists(m_URL) Then
        fso.CreateFolder m_URL
    End If
    m_sURLDirectorioLocal = m_URL & "Expedientes\"
    If Not fso.FolderExists(m_sURLDirectorioLocal) Then
        fso.CreateFolder m_sURLDirectorioLocal
    End If
    m_sURLDirectorioLocal = m_sURLDirectorioLocal & "docs\"
    
    If fso.FolderExists(m_sURLDirectorioLocal) Then
        On Error Resume Next
        EliminarContenidoCarpeta m_sURLDirectorioLocal
        If Err.Number <> 0 Then
            Err.Clear
        End If
        On Error GoTo errores
    Else
        fso.CreateFolder m_sURLDirectorioLocal
    End If
    If Right(m_sURLDirectorioLocal, 1) <> "\" Then
        m_sURLDirectorioLocal = m_sURLDirectorioLocal & "\"
    End If
    
    URLDirectorioLocal = m_sURLDirectorioLocal
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLDirectorioLocal ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get ColItems() As Scripting.Dictionary

    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Not m_objColItems Is Nothing Then
        Set ColItems = m_objColItems
        Exit Property
    End If
    Set m_objColItems = New Scripting.Dictionary
    With m_objColItems
        .Add "ColAdministradores", "o"
        .Add "ColUsuariosCalidad", "o"
        .Add "URLAchivoIni", ""
        .Add "VersionAplicacion", ""
        .Add "URLDirectorioAplicaciones", ""
        .Add "URLArchivoCSS", ""
        .Add "CSS", ""
        .Add "URLDirectorioAplicacion", ""
        .Add "URLDirectorioDocumentacion", ""
        .Add "URLDirectorioLocal", ""
        .Add "URLDirectorioDocumentacionAyuda", ""
        .Add "ColEstados", "o"
        .Add "ColEstadosTexto", "o"
        .Add "ColEstadosTitulo", "o"
        .Add "colExplicacionTipoTarea", "o"
        .Add "DiasParaAvisoFinExpediente", ""
        .Add "DiasParaOfertasSinDecision", ""
        .Add "ColImagenes", "o"
        .Add "URLDirectorioIconos", ""
        .Add "URLIconoCadenaContratacionOrganoControl", ""
        .Add "URLIconoCadenaContratacionEmpresaNoGrupo", ""
        .Add "URLIconoCadenaContratacionEmpresaGrupo", ""
        .Add "URLIconoEmpresaLista", ""
    End With
    Set ColItems = m_objColItems
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColItems ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property



Public Function getPropiedad(p_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant
    
    
    On Error GoTo errores
    Me.Error = ""
    If p_NombrePropiedad = "ColAdministradores" Then
        Set getPropiedad = Me.ColAdministradores
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    
    If p_NombrePropiedad = "ColUsuariosCalidad" Then
        Set getPropiedad = Me.ColUsuariosCalidad
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    
    If p_NombrePropiedad = "URLAchivoIni" Then
        getPropiedad = Me.URLAchivoIni
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombrePropiedad = "VersionAplicacion" Then
        getPropiedad = Me.VersionAplicacion
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombrePropiedad = "URLDirectorioAplicaciones" Then
        getPropiedad = Me.URLDirectorioAplicaciones
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombrePropiedad = "URLArchivoCSS" Then
        getPropiedad = Me.URLArchivoCSS
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombrePropiedad = "CSS" Then
        getPropiedad = Me.CSS
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    
    If p_NombrePropiedad = "URLDirectorioAplicacion" Then
        getPropiedad = Me.URLDirectorioAplicacion
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombrePropiedad = "URLDirectorioDocumentacion" Then
        getPropiedad = Me.URLDirectorioDocumentacion
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    
    If p_NombrePropiedad = "URLDirectorioLocal" Then
        getPropiedad = Me.URLDirectorioLocal
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    
    If p_NombrePropiedad = "URLDirectorioDocumentacionAyuda" Then
        getPropiedad = Me.URLDirectorioDocumentacionAyuda
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombrePropiedad = "ColEstados" Then
        Set getPropiedad = Me.ColEstados
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombrePropiedad = "ColEstadosTexto" Then
        Set getPropiedad = Me.ColEstadosTexto
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombrePropiedad = "ColEstadosTitulo" Then
        Set getPropiedad = Me.ColEstadosTitulo
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombrePropiedad = "colExplicacionTipoTarea" Then
        Set getPropiedad = Me.colExplicacionTipoTarea
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombrePropiedad = "DiasParaAvisoFinExpediente" Then
        getPropiedad = Me.DiasParaAvisoFinExpediente
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombrePropiedad = "DiasParaOfertasSinDecision" Then
        getPropiedad = Me.DiasParaOfertasSinDecision
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombrePropiedad = "ColImagenes" Then
        Set getPropiedad = Me.ColImagenes
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombrePropiedad = "URLDirectorioIconos" Then
        getPropiedad = Me.URLDirectorioIconos
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombrePropiedad = "URLIconoCadenaContratacionOrganoControl" Then
        getPropiedad = Me.URLIconoCadenaContratacionOrganoControl
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombrePropiedad = "URLIconoCadenaContratacionEmpresaNoGrupo" Then
        getPropiedad = Me.URLIconoCadenaContratacionEmpresaNoGrupo
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombrePropiedad = "URLIconoCadenaContratacionEmpresaGrupo" Then
        getPropiedad = Me.URLIconoCadenaContratacionEmpresaGrupo
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombrePropiedad = "URLIconoEmpresaLista" Then
        getPropiedad = Me.URLIconoEmpresaLista
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    p_Error = "La propiedad " & p_NombrePropiedad & " no está codificada en Entorno.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Entorno.getPropiedad ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

