VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Expediente"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public IDExpediente As String
Public IDExpedientePadre As String
Public Nemotecnico As String
Public Titulo As String
Public ObjetoContrato As String
Public ImporteLicitacion As String
Public ImporteContratacion As String
Public CodProyecto As String
Public CodExp As String
Public CodExpLargo As String
Public CodS4H As String
Public FechaInicioContrato As String
Public FechaFinContrato As String
Public FechaFinGarantia As String
Public EsAM As String
Public EsLote As String
Public EsBasado As String
Public EsExpediente As String
Public Ordinal As String
Public IdGradoClasificacion As String
Public IDOrganoContratacion As String
Public IDOficinaPrograma As String
Public IDEjercito As String
Public AccesoSharepoint As String
Public Observaciones As String
Public FechaCreacion As String
Public IDUsuarioCreacion As String
Public FechaUltimoCambio As String
Public IDUsuarioUltimoCambio As String
Public Ambito As String
Public NPedido As String
Public IDResponsableCalidad As String
Public IDResponsableSeguridad As String
Public AGEDYSAplica As String
Public AGEDYSGenerico As String
Public HPSAplica As String
Public TIpo As String
Public CadenaPecal As String
Public PECAL As String
Public TipoInforme As String
Public POSTAGEDO As String
Public APLICAESTADO As String
Public FECHAINICIOLICITACION As String
Public FECHAPREOFERTA As String
Public FECHAOFERTA As String
Public FECHAADJUDICACION As String
Public FECHAFIRMACONTRATO As String
Public GARANTIAMESES As String
Public FECHACERTIFICACION As String
Public FECHAPERDIDA As String
Public FECHADESESTIMADA As String
Public ESTADO As String
Public CodigoActividad As String
Public AplicaTareaS4H As String
Public ContratistaPrincipal As String



Private m_sFechaFinGarantiaCalculada As String
Private m_sAdjudicado As String
Private m_sEnPeriodoDeAdjudicacion As String
Private m_eESTADOCalculado As EnumEstados
Private m_sESTADOCalculadoTexto As String
Private m_sESTADOCalculadoTitulo As String
Private m_sTipoParaLista As String
Private m_eTIPOEnum As EnumTipoExpediente

Private m_ObjExpedientePadre As Expediente
Private m_ObjExpedientePadreLote As Expediente
Private m_ObjExpedientePadreAM As Expediente
Private m_ObjGradoClasificacion As GradoClasificacion
Private m_ObjOrganoContratacion As OrganoContratacion
Private m_ObjOficinaPrograma As OficinaPrograma
Private m_ObjEjercito As Ejercito

Private m_ObjResponsableCalidad As USUARIO
Private m_ObjResponsableSeguridad As USUARIO
Private m_ObjUsuarioCreacion As USUARIO
Private m_ObjUsuarioUltimoCambio As USUARIO
Private m_sTituloFormulario As String
Private m_sUltimaModificacionTexto As String


Private m_sOrdinalCalculado As String


Private m_eTipoCalculado As EnumTipoExpediente
Private m_sTipoCalculadoTexto  As String
Private m_eEsAMCalculado As EnumSiNo
Private m_eEsLoteCalculado As EnumSiNo
Private m_eEsCBCalculado As EnumSiNo
Private m_eEsCBDeLoteCalculado As EnumSiNo
Private m_eEsCBDeAMCalculado As EnumSiNo


Private m_eSolodeTDE As EnumSiNo
Private m_eSolodeTSOL As EnumSiNo



Private m_eAmbitoCalculado As EnumAmbito
Private m_sIDExpedienteCalculado As String
Private m_ObjExpedientesDerivados As Scripting.Dictionary
Private m_ObjLotes As Scripting.Dictionary
Private m_ObjBasados As Scripting.Dictionary
Private m_ObjDerivados As Scripting.Dictionary
Private m_ObjAnualidades As Scripting.Dictionary
Private m_ObjJefaturas As Scripting.Dictionary
Private m_ObjJuridicas As Scripting.Dictionary
Private m_ObjComerciales As Scripting.Dictionary
Private m_ObjCPVs As Scripting.Dictionary
Private m_ObjAnexos As Scripting.Dictionary
Private m_ObjLugaresEjecucion As Scripting.Dictionary
Private m_ObjPECALES As Scripting.Dictionary
Private m_ObjRACS As Scripting.Dictionary
Private m_ObjSuministradores As Scripting.Dictionary
Private m_ObjContratistas As Scripting.Dictionary
Private m_ObjSubContratistas As Scripting.Dictionary
Private m_ObjSuministradoresTotal As Scripting.Dictionary
Private m_ObjResponsablesNoJP As Scripting.Dictionary
Private m_ObjResponsablesJP As Scripting.Dictionary
Private m_ObjResponsablesConEnvioCorreo As Scripting.Dictionary
Private m_ObjResponsables As Scripting.Dictionary
Private m_ObjCodigosComprasOperaciones As Scripting.Dictionary
Private m_ObjHitos As Scripting.Dictionary
Private m_sURLDirectorioAnexo As String
Private m_eDerivable As EnumSiNo
Private m_ObjExpedienteAGEDYS As ExpedienteAGEDYS

Private m_eAGEDYSAplicaCalculado As EnumSiNo
Private m_eAGEDYSGenericoCalculado As EnumSiNo
Private m_eHPSAplicaCalculado As EnumSiNo
Private m_sCadenaProyectosGestionRiesgos As String
Private m_sCadenaUsuariosHPS As String
Private m_sCadenaUsuariosHistoricosHPS As String
Private m_sCadenaNCs As String

Private m_eTienePECAL As EnumSiNo
Private m_sCadenaDPDs As String
Private m_sCadenaPecalCalculada As String
Private m_sCadenaRACs As String
Private m_sCadenaContratistas As String
Private m_sCadenaSubContratistas As String
Private m_sCadenaSuministradores As String
Private m_sCadenaComerciales As String
Private m_sCadenaCPVs As String
Private m_sCadenaLugares As String
Private m_sCadenaJPs As String
Private m_sCadenaResponsables As String
Private m_sCadenaHitos As String

Private m_ObjUltimoLoteDerivado As Expediente
Private m_ObjUltimoBasadoDerivado As Expediente
Private m_eTieneRAC As EnumSiNo
Private m_sTipoInformeCalculado As String
Private m_sNemotecnicoCalculado As String

Private m_ObjUltimoExpedienteHijo As Expediente
Private m_sFechasIrregulares As String
Private m_sDiasParaElFin As String
Private m_ObjExpedienteCompleto As ExpedienteCompleto
Private m_sCadenaCorreoRACs As String
Private m_sCodigoDocParteExpediente As String
Private m_ObjModificados As Scripting.Dictionary
Private m_sNModificadoCalculado As String
Private m_eNecesitaCodS4H As EnumSiNo
Private m_sHPSAplicaTareaS4HCalculado As String
Private m_sContratistaPrincipal As String
Private m_vOrdinalE2E As Variant


Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get OrdinalE2E() As Variant
    If IsEmpty(m_vOrdinalE2E) Then
        OrdinalE2E = Null
    ElseIf IsNull(m_vOrdinalE2E) Then
        OrdinalE2E = Null
    Else
        OrdinalE2E = CLng(m_vOrdinalE2E)
    End If
End Property

Public Property Let OrdinalE2E(ByVal p_Valor As Variant)
    If IsNull(p_Valor) Or IsEmpty(p_Valor) Then
        m_vOrdinalE2E = Null
    ElseIf Not IsNumeric(p_Valor) Then
        m_vOrdinalE2E = Null
    ElseIf CLng(p_Valor) <= 0 Then
        m_vOrdinalE2E = Null
    Else
        m_vOrdinalE2E = CLng(p_Valor)
    End If
End Property

Public Property Get HPSAplicaTareaS4HCalculado() As String
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If InStr(1, Me.CadenaContratistas, "TSOL") = 0 Then
        m_sHPSAplicaTareaS4HCalculado = "No"
    Else
        m_sHPSAplicaTareaS4HCalculado = "Sí"
    End If
    
    HPSAplicaTareaS4HCalculado = m_sHPSAplicaTareaS4HCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.HPSAplicaTareaS4HCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get NModificadoCalculado() As String
    
    Dim m_Modificado As ExpedienteModificado
    Dim m_NumeroMax As Long
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    
    Set m_Col = Me.Modificados
    m_Error = Me.Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        m_sNModificadoCalculado = "1"
        NModificadoCalculado = m_sNModificadoCalculado
        Exit Property
    End If
    For Each m_ID In m_Col
        Set m_Modificado = m_Col(m_ID)
        If IsNumeric(m_Modificado.NModificado) Then
            If CLng(m_Modificado.NModificado) > m_NumeroMax Then
                m_NumeroMax = CLng(m_Modificado.NModificado)
            End If
        End If
        Set m_Modificado = Nothing
    Next
    m_sNModificadoCalculado = CStr(m_NumeroMax + 1)
    NModificadoCalculado = m_sNModificadoCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.NModificadoCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get CodigoDocParteExpediente() As String
    
    Dim m_Tipo As String
    Dim m_Area As String
    Dim m_Centro As String
    Dim m_PrimerParteExp As String
    Dim m_Año As String
    Dim m_ParteVariable As String
    Dim dato As Variant
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sCodigoDocParteExpediente <> "" Then
        CodigoDocParteExpediente = m_sCodigoDocParteExpediente
        Exit Property
    End If
    If Me.CodExp = "" Then
        Exit Property
    End If
    m_Tipo = "IS"
    m_Area = "E"
    m_Centro = "CCC"
    If InStr(1, Me.CodExp, "/") = 0 Then
        m_Error = "El expediente ha de tener la forma ????/??"
        Err.Raise 1000
    End If
    dato = Split(Me.CodExp, "/")
    m_PrimerParteExp = CStr(dato(0))
    m_Año = CStr(dato(1))
    m_ParteVariable = m_Año & m_PrimerParteExp & m_Centro
    m_sCodigoDocParteExpediente = m_Tipo & m_ParteVariable & m_Area & "NN"
    CodigoDocParteExpediente = m_sCodigoDocParteExpediente
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.CodigoDocParteExpediente ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
    
End Property



Public Property Get CadenaCorreoRACs() As String
    
    Dim m_ID As Variant
    Dim m_RAC As RAC
    
        
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sCadenaCorreoRACs = ""
    If Me.RACs Is Nothing Then
        Exit Property
    End If
    For Each m_ID In Me.RACs
        Set m_RAC = Me.RACs(m_ID)
        If InStr(1, m_RAC.CORREO, "@") <> 0 Then
            If m_sCadenaCorreoRACs = "" Then
                m_sCadenaCorreoRACs = m_RAC.CORREO
            Else
                m_sCadenaCorreoRACs = m_sCadenaCorreoRACs & ";" & m_RAC.CORREO
            End If
        End If
        
        Set m_RAC = Nothing
    Next
    
    CadenaCorreoRACs = m_sCadenaCorreoRACs
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.CadenaCorreoRACs ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get ExpedienteCompleto() As ExpedienteCompleto
    
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjExpedienteCompleto Is Nothing Then
        Set ExpedienteCompleto = m_ObjExpedienteCompleto
        Exit Function
    End If
    
    Set m_ObjExpedienteCompleto = constructor.getExpedienteCompleto(Me.IDExpediente, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ExpedienteCompleto = m_ObjExpedienteCompleto
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.ExpedienteCompleto ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get DiasParaElFin() As String
    
    Dim m_FechaFinal As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If Not IsDate(Me.FechaFinContrato) Then
        Exit Property
    End If
    If Not IsNumeric(Me.GARANTIAMESES) Then
        Exit Property
    End If
    If Not IsDate(Me.FECHACERTIFICACION) Then
        m_FechaFinal = Me.FechaFinContrato
    Else
        If CDate(Me.FECHACERTIFICACION) > CDate(Me.FechaFinContrato) Then
            m_FechaFinal = Me.FECHACERTIFICACION
        Else
            m_FechaFinal = Me.FechaFinContrato
        End If
    End If
    m_sDiasParaElFin = DateDiff("d", CDate(Date), CDate(m_FechaFinal))
    DiasParaElFin = m_sDiasParaElFin
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.DiasParaElFin ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get FechaFinGarantiaCalculada() As String
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If Not IsDate(Me.FechaFinContrato) Then
        Exit Property
    End If
    If Not IsNumeric(Me.GARANTIAMESES) Then
        Exit Property
    End If
    If IsDate(Me.FECHACERTIFICACION) Then
        m_sFechaFinGarantiaCalculada = DateAdd("m", CDbl(Me.GARANTIAMESES), CDate(Me.FECHACERTIFICACION))
    Else
        m_sFechaFinGarantiaCalculada = DateAdd("m", CDbl(Me.GARANTIAMESES), CDate(Me.FechaFinContrato))
    End If
    
    FechaFinGarantiaCalculada = m_sFechaFinGarantiaCalculada
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.FechaFinGarantiaCalculada ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get Adjudicado() As String
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sAdjudicado <> "" Then
        Adjudicado = m_sAdjudicado
        Exit Property
    End If
    If IsDate(Me.FECHADESESTIMADA) Then
        m_sAdjudicado = "No"
        Adjudicado = m_sAdjudicado
        Exit Property
    End If
    If IsDate(Me.FECHAPERDIDA) Then
        m_sAdjudicado = "No"
        Adjudicado = m_sAdjudicado
        Exit Property
    End If
    If IsDate(Me.FECHAADJUDICACION) Then
        m_sAdjudicado = "Sí"
    Else
        m_sAdjudicado = "No"
    End If
    Adjudicado = m_sAdjudicado
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.Adjudicado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get EnPeriodoDeAdjudicacion() As String
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sEnPeriodoDeAdjudicacion <> "" Then
        EnPeriodoDeAdjudicacion = m_sEnPeriodoDeAdjudicacion
        Exit Property
    End If
    If IsDate(Me.FECHADESESTIMADA) Then
        m_sEnPeriodoDeAdjudicacion = "No"
        EnPeriodoDeAdjudicacion = m_sEnPeriodoDeAdjudicacion
        Exit Property
    End If
    If IsDate(Me.FECHAPERDIDA) Then
        m_sEnPeriodoDeAdjudicacion = "No"
        EnPeriodoDeAdjudicacion = m_sEnPeriodoDeAdjudicacion
        Exit Property
    End If
    If IsDate(Me.FECHAADJUDICACION) Then
        m_sEnPeriodoDeAdjudicacion = "No"
    Else
        m_sEnPeriodoDeAdjudicacion = "Sí"
    End If
    EnPeriodoDeAdjudicacion = m_sEnPeriodoDeAdjudicacion
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.EnPeriodoDeAdjudicacion ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get FechasIrregulares() As String
    'FechasIrregulares = "No|"
    'FechasIrregulares = "Sí|motivo"
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    m_sFechasIrregulares = SonFechasIrregulares(Me, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    FechasIrregulares = m_sFechasIrregulares
    
   
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.FechasIrregulares ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ESTADOCalculado() As EnumEstados
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    m_eESTADOCalculado = GetESTADOCalculado(Me, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    ESTADOCalculado = m_eESTADOCalculado
    
   
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.ESTADOCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ESTADOCalculadoTexto() As String
    
    Dim m_EstadoCalculado As EnumEstados
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_EstadoCalculado = Me.ESTADOCalculado
    m_Error = Me.Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    m_sESTADOCalculadoTexto = m_ObjEntorno.ColEstadosTitulo(CStr(m_EstadoCalculado))
    ESTADOCalculadoTexto = m_sESTADOCalculadoTexto
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.ESTADOCalculadoTexto ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ESTADOCalculadoTitulo() As String
    
    Dim m_EstadoCalculado As EnumEstados
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_EstadoCalculado = Me.ESTADOCalculado
    m_Error = Me.Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    m_sESTADOCalculadoTitulo = m_ObjEntorno.ColEstadosTituloMejorado(CStr(m_EstadoCalculado))
    ESTADOCalculadoTitulo = m_sESTADOCalculadoTitulo
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.ESTADOCalculadoTitulo ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get NemotecnicoCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    
    m_sNemotecnicoCalculado = GetNemotecnicoCalculado(Me, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    NemotecnicoCalculado = m_sNemotecnicoCalculado
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.NemotecnicoCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get TipoParaLista() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sTipoParaLista <> "" Then
        TipoParaLista = m_sTipoParaLista
        Exit Property
    End If
    If Me.EsAM = "Sí" Then
        m_sTipoParaLista = "AM"
    ElseIf Me.EsExpediente = "Sí" Then
        m_sTipoParaLista = "C"
    End If
    
    
    TipoParaLista = m_sTipoParaLista
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.TipoParaLista ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get CadenaPecalCalculada() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sCadenaPecalCalculada <> "" Then
        CadenaPecalCalculada = m_sCadenaPecalCalculada
        Exit Property
    End If
    m_sCadenaPecalCalculada = getCadenaPecal(p_Expediente:=Me, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    CadenaPecalCalculada = m_sCadenaPecalCalculada
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.CadenaPecalCalculada ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get CadenaRACs() As String
    
    Dim m_ID As Variant
    Dim m_RAC As RAC
    
        
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sCadenaRACs = ""
    If Me.RACs Is Nothing Then
        Exit Property
    End If
    For Each m_ID In Me.RACs
        Set m_RAC = Me.RACs(m_ID)
        If m_sCadenaRACs = "" Then
            m_sCadenaRACs = m_RAC.RAC
        Else
            m_sCadenaRACs = m_sCadenaRACs & "|" & m_RAC.RAC
        End If
        Set m_RAC = Nothing
    Next
    
    CadenaRACs = m_sCadenaRACs
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.CadenaRACs ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
' ==============================================================================
' PROPIEDADES CALCULADAS DE CADENA DE SUMINISTRO (ADAPTADAS A JERARQUÍA)
' ==============================================================================

Public Property Get CadenaContratistas() As String
    ' LÓGICA: Nodos Raíz (Padre Null) que son Contratistas Principales
    On Error GoTo errores
    
    Me.Error = ""
    ' Usamos el helper con el tipo "MAIN"
    CadenaContratistas = GetCadenaJerarquica("MAIN")
    
    Exit Property
errores:
    Me.Error = "Error en CadenaContratistas: " & Err.Description
End Property

Public Property Get CadenaSubContratistas() As String
    ' LÓGICA: Todos los Nodos Hijos (Padre Not Null) + Nodos Raíz que son Subcontratas
    On Error GoTo errores
    
    Me.Error = ""
    ' Usamos el helper con el tipo "SUB"
    CadenaSubContratistas = GetCadenaJerarquica("SUB")
    
    Exit Property
errores:
    Me.Error = "Error en CadenaSubContratistas: " & Err.Description
End Property

Public Property Get CadenaSuministradores() As String
    ' DEPRECATED: Se mantiene por compatibilidad, devuelve la unión de ambos o vacío
    ' Según indicación, no se usa, pero devolvemos vacío para no romper interfaces
    CadenaSuministradores = ""
End Property

' ==============================================================================
' HELPER PRIVADO PARA GENERAR LAS CADENAS DESDE LA BD
' ==============================================================================

Private Function GetCadenaJerarquica(sTipo As String) As String
    Dim rcd As DAO.Recordset
    Dim m_SQL As String
    Dim sResultado As String
    Dim sNombre As String
    
    On Error GoTo errores
    
    If Me.IDExpediente = "" Then Exit Function
    
    ' Construimos la query uniendo la tabla de relación con la maestra de empresas
    m_SQL = "SELECT T.Nemotecnico, T.Nombre " & _
            "FROM TbExpedientesSuministradores R " & _
            "INNER JOIN TbSuministradores T ON R.IDSuministrador = T.IDSuministrador " & _
            "WHERE R.IDExpediente = " & Me.IDExpediente & " "
            
    If sTipo = "MAIN" Then
        ' CRITERIO CONTRATISTAS: Raíces marcadas como Principal
        m_SQL = m_SQL & "AND (R.IdPadre Is Null AND R.ContratistaPrincipal = 'Sí') "
    ElseIf sTipo = "SUB" Then
        ' CRITERIO SUBCONTRATAS: Cualquier hijo O Raíces marcadas como Subcontrata
        m_SQL = m_SQL & "AND (R.IdPadre Is Not Null OR (R.IdPadre Is Null AND R.SubContratista = 'Sí')) "
    End If
    
    ' Ordenamos por nombre para que la cadena salga ordenada
    m_SQL = m_SQL & "ORDER BY T.Nemotecnico, T.Nombre;"
    
    Set rcd = getdb().OpenRecordset(m_SQL, dbOpenSnapshot)
    
    With rcd
        Do While Not .EOF
            ' Preferimos Nemotécnico, si no Nombre
            sNombre = Nz(.Fields("Nemotecnico"), "")
            If sNombre = "" Then sNombre = Nz(.Fields("Nombre"), "")
            
            If sResultado = "" Then
                sResultado = sNombre
            Else
                sResultado = sResultado & "|" & sNombre
            End If
            .MoveNext
        Loop
        .Close
    End With
    
    Set rcd = Nothing
    GetCadenaJerarquica = sResultado
    Exit Function

errores:
    ' En caso de error devolvemos vacío para no bloquear el flujo principal
    GetCadenaJerarquica = ""
End Function


Public Property Get CadenaComerciales() As String
    
    Dim m_ID As Variant
    Dim m_Comerciales As Comercial
    
        
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sCadenaComerciales = ""
    If Me.Comerciales Is Nothing Then
        Exit Property
    End If
    For Each m_ID In Me.Comerciales
        Set m_Comerciales = Me.Comerciales(m_ID)
        If m_sCadenaComerciales = "" Then
            m_sCadenaComerciales = m_Comerciales.Comercial
        Else
            m_sCadenaComerciales = m_sCadenaComerciales & "|" & m_Comerciales.Comercial
        End If
        Set m_Comerciales = Nothing
    Next
    
    CadenaComerciales = m_sCadenaComerciales
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.CadenaComerciales ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get CadenaCPVs() As String
    
    Dim m_ID As Variant
    Dim m_CPV As CPV
    
        
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sCadenaCPVs = ""
    If Me.CPVs Is Nothing Then
        Exit Property
    End If
    For Each m_ID In Me.CPVs
        Set m_CPV = Me.CPVs(m_ID)
        If m_sCadenaCPVs = "" Then
            m_sCadenaCPVs = m_CPV.CPV
        Else
            m_sCadenaCPVs = m_sCadenaCPVs & "|" & m_CPV.CPV
        End If
        Set m_CPV = Nothing
    Next
    
    CadenaCPVs = m_sCadenaCPVs
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.CadenaCPVs ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property



Public Property Get CadenaJPs() As String
    
    Dim m_ID As Variant
    Dim m_Responsable As ExpedienteResponsable
    
        
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sCadenaJPs = ""
    If Me.ResponsablesJP Is Nothing Then
        Exit Property
    End If
    For Each m_ID In Me.ResponsablesJP
        Set m_Responsable = Me.ResponsablesJP(m_ID)
        If m_sCadenaJPs = "" Then
            m_sCadenaJPs = m_Responsable.USUARIO.Nombre
        Else
            m_sCadenaJPs = m_sCadenaJPs & "|" & m_Responsable.USUARIO.Nombre
        End If
        Set m_Responsable = Nothing
    Next
    
    CadenaJPs = m_sCadenaJPs
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.CadenaJPs ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get CadenaResponsables() As String
    
    Dim m_ID As Variant
    Dim m_Responsable As ExpedienteResponsable
    
        
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sCadenaResponsables = ""
    If Me.ResponsablesJP Is Nothing Then
        Exit Property
    End If
    For Each m_ID In Me.Responsables
        Set m_Responsable = Me.Responsables(m_ID)
        If m_Responsable.USUARIO Is Nothing Then
            GoTo siguiente
        End If
        If m_sCadenaResponsables = "" Then
            m_sCadenaResponsables = m_Responsable.USUARIO.Nombre
        Else
            m_sCadenaResponsables = m_sCadenaResponsables & "|" & m_Responsable.USUARIO.Nombre
        End If
siguiente:
        Set m_Responsable = Nothing
    Next
    
    CadenaResponsables = m_sCadenaResponsables
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.CadenaResponsables ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get CadenaLugares() As String
    
    Dim m_ID As Variant
    Dim m_Lugar As LugarEjecucion
    
        
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sCadenaLugares = ""
    If Me.LugaresEjecucion Is Nothing Then
        Exit Property
    End If
    For Each m_ID In Me.LugaresEjecucion
        Set m_Lugar = Me.LugaresEjecucion(m_ID)
        If m_sCadenaLugares = "" Then
            m_sCadenaLugares = m_Lugar.LugarEjecucion
        Else
            m_sCadenaLugares = m_sCadenaLugares & "|" & m_Lugar.LugarEjecucion
        End If
        Set m_Lugar = Nothing
    Next
    
    CadenaLugares = m_sCadenaLugares
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.CadenaLugares ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get CadenaHitos() As String
    
    Dim m_ID As Variant
    Dim m_Hito As ExpedienteHito
    
        
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sCadenaHitos = ""
    If Me.Hitos Is Nothing Then
        Exit Property
    End If
    For Each m_ID In Me.Hitos
        Set m_Hito = Me.Hitos(m_ID)
        If m_sCadenaHitos = "" Then
            m_sCadenaHitos = m_Hito.DESCRIPCION & ";" & m_Hito.FechaHito
        Else
            m_sCadenaHitos = m_sCadenaHitos & "|" & m_Hito.DESCRIPCION & ";" & m_Hito.FechaHito
        End If
        Set m_Hito = Nothing
    Next
    
    CadenaHitos = m_sCadenaHitos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.CadenaHitos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property



Public Property Get TienePECAL() As EnumSiNo

    
    Dim m_CadenaPecalCalculada As String
    Dim dato As Variant
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""

    m_CadenaPecalCalculada = Me.CadenaPecalCalculada
    m_Error = Me.Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_CadenaPecalCalculada = "" Then
        m_eTienePECAL = EnumSiNo.No
        TienePECAL = m_eTienePECAL
        Exit Property
    End If
    dato = Split(m_CadenaPecalCalculada, "|")
    If UBound(dato) = -1 Then
        m_eTienePECAL = EnumSiNo.No
        TienePECAL = m_eTienePECAL
        Exit Property
    End If
    If UBound(dato) = 0 Then
        If CStr(dato(0)) = "N/A" Then
            m_eTienePECAL = EnumSiNo.No
        Else
            m_eTienePECAL = EnumSiNo.Sí
        End If
    Else
        m_eTienePECAL = EnumSiNo.Sí
    End If
    
    TienePECAL = m_eTienePECAL

    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.TienePECAL ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get TieneRAC() As EnumSiNo

    
    Dim m_CadenaPecalCalculada As String
    Dim dato As Variant
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""

    m_CadenaPecalCalculada = Me.CadenaPecalCalculada
    m_Error = Me.Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_CadenaPecalCalculada = "" Then
        m_eTieneRAC = EnumSiNo.No
        TieneRAC = m_eTieneRAC
        Exit Property
    End If
    dato = Split(m_CadenaPecalCalculada, "|")
    If UBound(dato) = -1 Then
        m_eTieneRAC = EnumSiNo.No
        TieneRAC = m_eTieneRAC
        Exit Property
    End If
    If UBound(dato) = 0 Then
        If CStr(dato(0)) = "N/A" Then
            m_eTieneRAC = EnumSiNo.No
        Else
            m_eTieneRAC = EnumSiNo.Sí
        End If
    Else
        m_eTieneRAC = EnumSiNo.Sí
    End If
    
    TieneRAC = m_eTieneRAC

    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.TieneRAC ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get CadenaDPDs() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sCadenaDPDs <> "" Then
        CadenaDPDs = m_sCadenaDPDs
        Exit Property
    End If
    If Me.IDExpediente = "" Then
        Exit Property
    End If
    m_sCadenaDPDs = getDPDsParaExpediente(Me.IDExpediente, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    CadenaDPDs = m_sCadenaDPDs
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.CadenaDPDs ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Let CadenaDPDs(p_Valor As String)
    
    m_sCadenaDPDs = p_Valor
    
End Property
Public Property Get CadenaProyectosGestionRiesgos() As String
    
    Dim m_CadenaCodExp As String
    Dim m_CadenaCodS4H As String
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sCadenaProyectosGestionRiesgos <> "" Then
        CadenaProyectosGestionRiesgos = m_sCadenaProyectosGestionRiesgos
        Exit Property
    End If
    If Me.CodExp = "" And Me.CodS4H = "" Then
        Exit Property
    End If
    If Me.CodExp <> "" Then
        m_CadenaCodExp = getGestionesDeRiesgoParaExpediente(Me.CodExp, m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    If Me.CodS4H <> "" Then
        m_CadenaCodS4H = getGestionesDeRiesgoParaExpediente(Me.CodS4H, m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    If m_CadenaCodExp <> "" Then
        m_sCadenaProyectosGestionRiesgos = m_CadenaCodExp
    End If
    If m_CadenaCodS4H <> "" Then
        If m_sCadenaProyectosGestionRiesgos = "" Then
            m_sCadenaProyectosGestionRiesgos = m_CadenaCodS4H
        Else
            m_sCadenaProyectosGestionRiesgos = vbNewLine & m_CadenaCodS4H
        End If
        
    End If
    
    CadenaProyectosGestionRiesgos = m_sCadenaProyectosGestionRiesgos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.CadenaProyectosGestionRiesgos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Let CadenaProyectosGestionRiesgos(p_Valor As String)
    
    m_sCadenaProyectosGestionRiesgos = p_Valor
    
End Property

Public Property Get CadenaUsuariosHPS() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sCadenaUsuariosHPS <> "" Then
        CadenaUsuariosHPS = m_sCadenaUsuariosHPS
        Exit Property
    End If
    If Me.IDExpediente = "" Then
        Exit Property
    End If
    m_sCadenaUsuariosHPS = getHPSParaExpediente(Me.IDExpediente, EnumSiNo.No, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    CadenaUsuariosHPS = m_sCadenaUsuariosHPS
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.CadenaUsuariosHPS ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Let CadenaUsuariosHPS(p_Valor As String)
    
    m_sCadenaUsuariosHPS = p_Valor
    
End Property
Public Property Get CadenaUsuariosHistoricosHPS() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sCadenaUsuariosHistoricosHPS <> "" Then
        CadenaUsuariosHistoricosHPS = m_sCadenaUsuariosHistoricosHPS
        Exit Property
    End If
    If Me.IDExpediente = "" Then
        Exit Property
    End If
    m_sCadenaUsuariosHistoricosHPS = getHPSParaExpediente(Me.IDExpediente, EnumSiNo.Sí, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    CadenaUsuariosHistoricosHPS = m_sCadenaUsuariosHistoricosHPS
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.CadenaUsuariosHistoricosHPS ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Let CadenaUsuariosHistoricosHPS(p_Valor As String)
    
    m_sCadenaUsuariosHistoricosHPS = p_Valor
    
End Property
Public Property Get CadenaNCs() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sCadenaNCs <> "" Then
        CadenaNCs = m_sCadenaNCs
        Exit Property
    End If
    If Me.CodExp = "" And Me.CodS4H = "" Then
        Exit Property
    End If
    m_sCadenaNCs = getNCParaExpediente(Me.CodExp, Me.CodS4H, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    CadenaNCs = m_sCadenaNCs
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.CadenaNCs ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Let CadenaNCs(p_Valor As String)
    
    m_sCadenaNCs = p_Valor
    
End Property
Public Property Get TituloFormulario() As String
    
    Dim m_Tipo As EnumTipoExpediente
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sTituloFormulario <> "" Then
        TituloFormulario = m_sTituloFormulario
        Exit Property
    End If
    With Me
        m_Tipo = .TipoCalculado
        If m_Tipo = Empty Then
            Exit Property
        End If
        If .IDExpediente = "" Then
            If m_Tipo = EnumTipoExpediente.AM Then
                m_sTituloFormulario = "ALTA DE ACUERDO MARCO "
            ElseIf m_Tipo = EnumTipoExpediente.Lote Then
                m_sTituloFormulario = "ALTA DE LOTE "
            ElseIf m_Tipo = EnumTipoExpediente.BasadoDeAM Then
                m_sTituloFormulario = "ALTA DE BASADO DE AM (" & .ExpedientePadre.CodExp & ")"
            ElseIf m_Tipo = EnumTipoExpediente.BasadoDeLote Then
                m_sTituloFormulario = "ALTA DE BASADO DE LOTE (" & .ExpedientePadre.Nemotecnico & ")"
            ElseIf m_Tipo = EnumTipoExpediente.EXPIndividual Then
                m_sTituloFormulario = "ALTA DE EXPEDIENTE "
            ElseIf m_Tipo = EnumTipoExpediente.EXPHPS Then
                m_sTituloFormulario = "ALTA DE EXPEDIENTE SÓLO PARA HPS"
            End If
        Else
            If m_Tipo = EnumTipoExpediente.AM Then
                m_sTituloFormulario = "DETALLE DE ACUERDO MARCO: " & .CodExp
            ElseIf m_Tipo = EnumTipoExpediente.Lote Then
                m_sTituloFormulario = "DETALLE DE LOTE: " & .Nemotecnico
            ElseIf m_Tipo = EnumTipoExpediente.BasadoDeAM Then
                m_sTituloFormulario = "DETALE DE BASADO DE AM (" & .ExpedientePadre.CodExp & "): " & .CodExp
            ElseIf m_Tipo = EnumTipoExpediente.BasadoDeLote Then
                m_sTituloFormulario = "DETALE DE BASADO DE LOTE (" & .ExpedientePadre.Nemotecnico & "): " & .CodExp
            ElseIf m_Tipo = EnumTipoExpediente.EXPIndividual Then
                m_sTituloFormulario = "DETALE DE EXPEDIENTE: " & .CodExp
            End If
        
        End If
    End With
    
    
    TituloFormulario = m_sTituloFormulario
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.TituloFormulario ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get UltimaModificacionTexto() As String
    
    Dim m_NombreUsuario As String
    Dim m_Fecha As String
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    
    With Me
        If Not .UsuarioUltimoCambio Is Nothing Then
            m_NombreUsuario = .UsuarioUltimoCambio.Nombre
            If IsDate(.FechaUltimoCambio) Then
                m_Fecha = .FechaUltimoCambio
            Else
                m_Fecha = "Fecha desconocida"
            End If
        Else
            If Not .UsuarioCreacion Is Nothing Then
                m_NombreUsuario = .UsuarioCreacion.Nombre
            Else
                m_NombreUsuario = "Desconocido"
            End If
            If IsDate(.FechaCreacion) Then
                m_Fecha = .FechaCreacion
            Else
                m_Fecha = "Fecha desconocida"
            End If
        End If
       
    End With
    m_sUltimaModificacionTexto = "Última modificación por " & m_NombreUsuario & " el " & m_Fecha
    
    UltimaModificacionTexto = m_sUltimaModificacionTexto
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.UltimaModificacionTexto ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get AGEDYSAplicaCalculado() As EnumSiNo
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If Me.AGEDYSAplica = "Sí" Then
        m_eAGEDYSAplicaCalculado = EnumSiNo.Sí
    ElseIf Me.AGEDYSAplica = "No" Then
        m_eAGEDYSAplicaCalculado = EnumSiNo.No
    End If
    
    
    AGEDYSAplicaCalculado = m_eAGEDYSAplicaCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.AGEDYSAplicaCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get AGEDYSGenericoCalculado() As EnumSiNo
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If Me.AGEDYSGenerico = "Sí" Then
        m_eAGEDYSGenericoCalculado = EnumSiNo.Sí
    ElseIf Me.AGEDYSGenerico = "No" Then
        m_eAGEDYSGenericoCalculado = EnumSiNo.No
    End If
    
    
    AGEDYSGenericoCalculado = m_eAGEDYSGenericoCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.AGEDYSGenericoCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get HPSAplicaCalculado() As EnumSiNo
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If Me.HPSAplica = "Sí" Then
        m_eHPSAplicaCalculado = EnumSiNo.Sí
    ElseIf Me.HPSAplica = "No" Then
        m_eHPSAplicaCalculado = EnumSiNo.No
    End If
    
    
    HPSAplicaCalculado = m_eHPSAplicaCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.HPSAplicaCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get TIPOEnum() As EnumTipoExpediente
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_ObjEntorno.ColExpedientesTipos.exists(Me.TIpo) Then
        m_eTIPOEnum = m_ObjEntorno.ColExpedientesTipos(Me.TIpo)
    End If
    
    TIPOEnum = m_eTIPOEnum
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.TIPOEnum ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get Derivable() As EnumSiNo
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_eDerivable <> Empty Then
        Derivable = m_eDerivable
        Exit Property
    End If
    m_eDerivable = getExpedienteEsDerivable(Me.TipoCalculado, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Derivable = m_eDerivable
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.Derivable ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get TipoCalculado() As EnumTipoExpediente
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    m_eTipoCalculado = getTipoCalculado(Me, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    TipoCalculado = m_eTipoCalculado
    Exit Property
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.TipoCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get TipoCalculadoTexto() As String
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If Me.TipoCalculado = Empty Then
        Exit Property
    End If
    
    m_sTipoCalculadoTexto = m_ObjEntorno.ColTiposExpedientes(CStr(Me.TipoCalculado))
    
    
    TipoCalculadoTexto = m_sTipoCalculadoTexto
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.TipoCalculadoTexto ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get TipoInformeCalculado() As String
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sTipoInformeCalculado <> "" Then
        TipoInformeCalculado = m_sTipoInformeCalculado
        Exit Property
    End If
    If Me.EsAM = "Sí" Then
        m_sTipoInformeCalculado = "AM"
        TipoInformeCalculado = m_sTipoInformeCalculado
        Exit Property
    End If
    If Me.EsLote = "Sí" Then
        m_sTipoInformeCalculado = "Lote"
        TipoInformeCalculado = m_sTipoInformeCalculado
        Exit Property
    End If
    If Me.EsBasado = "Sí" Then
        m_sTipoInformeCalculado = "Basado"
        TipoInformeCalculado = m_sTipoInformeCalculado
        Exit Property
    End If
    If Me.EsExpediente = "Sí" Then
        m_sTipoInformeCalculado = "C"
        TipoInformeCalculado = m_sTipoInformeCalculado
        Exit Property
    End If
    TipoInformeCalculado = m_sTipoInformeCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.TipoInformeCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get URLDirectorioAnexo() As String
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If Me.IDExpediente = "" Then
        Exit Property
    End If

    m_sURLDirectorioAnexo = getURLDirectorioExpediente(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    
    URLDirectorioAnexo = m_sURLDirectorioAnexo
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.URLDirectorioAnexo ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get OrdinalCalculado() As String
    
    Dim m_UltimoExp As Expediente
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If Me.ExpedientePadre Is Nothing Then
        Exit Property
    End If
    Set m_UltimoExp = Me.ExpedientePadre.UltimoLoteDerivado
    If m_UltimoExp Is Nothing Then
        m_sOrdinalCalculado = Format("1", "00")
    Else
        If IsNumeric(m_UltimoExp.Ordinal) Then
            m_sOrdinalCalculado = Format(CInt(m_UltimoExp.Ordinal) + 1, "00")
        End If
    End If
    
    OrdinalCalculado = m_sOrdinalCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.OrdinalCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get responsableCalidad() As USUARIO
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjResponsableCalidad Is Nothing Then
        Set responsableCalidad = m_ObjResponsableCalidad
        Exit Property
    End If
    If Me.IDResponsableCalidad = "" Then
        Exit Property
    End If
    Set m_ObjResponsableCalidad = constructor.getUsuario(p_ID:=Me.IDResponsableCalidad, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set responsableCalidad = m_ObjResponsableCalidad
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.ResponsableCalidad ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get responsableSeguridad() As USUARIO
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjResponsableSeguridad Is Nothing Then
        Set responsableSeguridad = m_ObjResponsableSeguridad
        Exit Property
    End If
    If Me.IDResponsableSeguridad = "" Then
        Exit Property
    End If
    Set m_ObjResponsableSeguridad = constructor.getUsuario(p_ID:=Me.IDResponsableSeguridad, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set responsableSeguridad = m_ObjResponsableSeguridad
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.ResponsableSeguridad ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get UsuarioUltimoCambio() As USUARIO
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjUsuarioUltimoCambio Is Nothing Then
        Set UsuarioUltimoCambio = m_ObjUsuarioUltimoCambio
        Exit Property
    End If
    If Me.IDUsuarioUltimoCambio = "" Then
        Exit Property
    End If
    Set m_ObjUsuarioUltimoCambio = constructor.getUsuario(p_ID:=Me.IDUsuarioUltimoCambio, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set UsuarioUltimoCambio = m_ObjUsuarioUltimoCambio
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.UsuarioUltimoCambio ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get UsuarioCreacion() As USUARIO
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjUsuarioCreacion Is Nothing Then
        Set UsuarioCreacion = m_ObjUsuarioCreacion
        Exit Property
    End If
    If Me.IDUsuarioCreacion = "" Then
        Exit Property
    End If
    Set m_ObjUsuarioCreacion = constructor.getUsuario(p_ID:=Me.IDUsuarioCreacion, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set UsuarioCreacion = m_ObjUsuarioCreacion
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.UsuarioCreacion ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get Ejercito() As Ejercito
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjEjercito Is Nothing Then
        Set Ejercito = m_ObjEjercito
        Exit Property
    End If
    If Me.IDEjercito = "" Then
        Exit Property
    End If
    Set m_ObjEjercito = constructor.getEjercito(p_IDEjercito:=Me.IDEjercito, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Ejercito = m_ObjEjercito
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.Ejercito ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get OficinaPrograma() As OficinaPrograma
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjOficinaPrograma Is Nothing Then
        Set OficinaPrograma = m_ObjOficinaPrograma
        Exit Property
    End If
    If Me.IDOficinaPrograma = "" Then
        Exit Property
    End If
    Set m_ObjOficinaPrograma = constructor.getOficinaPrograma(p_IDOficinaPrograma:=Me.IDOficinaPrograma, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set OficinaPrograma = m_ObjOficinaPrograma
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.OficinaPrograma ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get OrganoContratacion() As OrganoContratacion
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjOrganoContratacion Is Nothing Then
        Set OrganoContratacion = m_ObjOrganoContratacion
        Exit Property
    End If
    If Me.IDOrganoContratacion = "" Then
        Exit Property
    End If
    Set m_ObjOrganoContratacion = constructor.getOrganoContratacion(p_IDOrganoContratacion:=Me.IDOrganoContratacion, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set OrganoContratacion = m_ObjOrganoContratacion
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.OrganoContratacion ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get GradoClasificacion() As GradoClasificacion
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjGradoClasificacion Is Nothing Then
        Set GradoClasificacion = m_ObjGradoClasificacion
        Exit Property
    End If
    If Me.IdGradoClasificacion = "" Then
        Exit Property
    End If
    Set m_ObjGradoClasificacion = constructor.getGradoClasificacion(p_IdGradoClasificacion:=Me.IdGradoClasificacion, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set GradoClasificacion = m_ObjGradoClasificacion
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.GradoClasificacion ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property





Public Property Get ExpedientePadre() As Expediente
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjExpedientePadre Is Nothing Then
        Set ExpedientePadre = m_ObjExpedientePadre
        Exit Property
    End If
    If Me.IDExpedientePadre = "" Then
        Exit Property
    End If
    Set m_ObjExpedientePadre = constructor.getExpediente(p_IDExpediente:=Me.IDExpedientePadre, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ExpedientePadre = m_ObjExpedientePadre
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.ExpedientePadre ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ExpedientePadreLote() As Expediente
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjExpedientePadreLote Is Nothing Then
        Set ExpedientePadreLote = m_ObjExpedientePadreLote
        Exit Property
    End If
    If Me.EsBasado <> "Sí" Then
        Exit Property
    End If
    If Me.ExpedientePadre Is Nothing Then
        Exit Property
    End If
    If Me.ExpedientePadre.EsLote <> "Sí" Then
        Exit Property
    End If
    Set m_ObjExpedientePadreLote = Me.ExpedientePadre
    
    Set ExpedientePadreLote = m_ObjExpedientePadreLote
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.ExpedientePadreLote ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get ExpedientePadreAM() As Expediente
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjExpedientePadreAM Is Nothing Then
        Set ExpedientePadreAM = m_ObjExpedientePadreAM
        Exit Property
    End If
    If Me.EsBasado <> "Sí" And Me.EsLote <> "Sí" Then
        Exit Property
    End If
    If Me.ExpedientePadre Is Nothing Then
        Exit Property
    End If
    If Me.ExpedientePadre.EsAM <> "Sí" Then
        Exit Property
    End If
    Set m_ObjExpedientePadreAM = Me.ExpedientePadre
    
    Set ExpedientePadreAM = m_ObjExpedientePadreAM
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.ExpedientePadreAM ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get UltimoLoteDerivado() As Expediente
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjUltimoLoteDerivado Is Nothing Then
        Set UltimoLoteDerivado = m_ObjUltimoLoteDerivado
        Exit Property
    End If
    
    Set m_ObjUltimoLoteDerivado = constructor.getExpedienteUltimoLoteDerivado(p_Expediente:=Me, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set UltimoLoteDerivado = m_ObjUltimoLoteDerivado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.UltimoLoteDerivado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get UltimoBasadoDerivado() As Expediente
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjUltimoBasadoDerivado Is Nothing Then
        Set UltimoBasadoDerivado = m_ObjUltimoBasadoDerivado
        Exit Property
    End If
    
    Set m_ObjUltimoBasadoDerivado = constructor.getExpedienteUltimoBasadoDerivado(p_Expediente:=Me, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set UltimoBasadoDerivado = m_ObjUltimoBasadoDerivado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.UltimoBasadoDerivado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get AmbitoCalculado() As EnumAmbito
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_eAmbitoCalculado <> Empty Then
        AmbitoCalculado = m_eAmbitoCalculado
        Exit Property
    End If
    If Me.Ambito = "Defensa" Then
        m_eAmbitoCalculado = EnumAmbito.Defensa
    ElseIf Me.Ambito = "Fuera" Then
        m_eAmbitoCalculado = EnumAmbito.Fuera
    ElseIf Me.Ambito = "HPS" Then
        m_eAmbitoCalculado = EnumAmbito.HPS
    End If
    AmbitoCalculado = m_eAmbitoCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.AmbitoCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property



Public Property Get EsAMCalculado() As EnumSiNo
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If Me.EsAM = "Sí" Or Me.EsAM = "No" Then
        If Me.EsAM = "Sí" Then
            m_eEsAMCalculado = EnumSiNo.Sí
        Else
            m_eEsAMCalculado = EnumSiNo.No
        End If
        EsAMCalculado = m_eEsAMCalculado
        Exit Property
    End If
    If Me.TipoCalculado = Empty Then
        Exit Property
    End If
    If Me.TipoCalculado = EnumTipoExpediente.AM Then
        m_eEsAMCalculado = EnumSiNo.Sí
    Else
        m_eEsAMCalculado = EnumSiNo.Sí
    End If
    EsAMCalculado = m_eEsAMCalculado
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.EsAMCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get EsLoteCalculado() As EnumSiNo
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Me.EsLote = "Sí" Then
        m_eEsLoteCalculado = EnumSiNo.Sí
    ElseIf Me.EsLote = "No" Then
        m_eEsLoteCalculado = EnumSiNo.No
    End If
    
    
    EsLoteCalculado = m_eEsLoteCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.EsLoteCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get EsCBCalculado() As EnumSiNo
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_eEsCBCalculado <> Empty Then
        EsCBCalculado = m_eEsCBCalculado
        Exit Property
    End If
    If Me.EsAM = "Sí" Or Me.EsLote = "Sí" Then
        m_eEsCBCalculado = EnumSiNo.No
        EsCBCalculado = m_eEsCBCalculado
        Exit Property
    End If
    If Me.EsExpediente = "Sí" Or Me.EsBasado = "Sí" Then
        If Me.IDExpedientePadre = "" Then
            m_eEsCBCalculado = EnumSiNo.No
        Else
            m_eEsCBCalculado = EnumSiNo.Sí
        End If
    End If
    EsCBCalculado = m_eEsCBCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.EsCBCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get EsCBDeLoteCalculado() As EnumSiNo
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_eEsCBDeLoteCalculado <> Empty Then
        EsCBDeLoteCalculado = m_eEsCBDeLoteCalculado
        Exit Property
    End If
    If Me.EsAM = "Sí" Or Me.EsLote = "Sí" Then
        m_eEsCBDeLoteCalculado = EnumSiNo.No
        EsCBDeLoteCalculado = m_eEsCBDeLoteCalculado
        Exit Property
    End If
    If Me.EsExpediente = "Sí" Or Me.EsBasado = "Sí" Then
        If Me.ExpedientePadre Is Nothing Then
            m_eEsCBDeLoteCalculado = EnumSiNo.No
        Else
            If Me.ExpedientePadre.EsLote = "Sí" Then
                m_eEsCBDeLoteCalculado = EnumSiNo.Sí
            Else
                m_eEsCBDeLoteCalculado = EnumSiNo.No
            End If
        End If
        
    End If
    EsCBDeLoteCalculado = m_eEsCBDeLoteCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.EsCBDeLoteCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get EsCBDeAMCalculado() As EnumSiNo
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_eEsCBDeAMCalculado <> Empty Then
        EsCBDeAMCalculado = m_eEsCBDeAMCalculado
        Exit Property
    End If
    If Me.EsAM = "Sí" Or Me.EsLote = "Sí" Then
        m_eEsCBDeAMCalculado = EnumSiNo.No
        EsCBDeAMCalculado = m_eEsCBDeAMCalculado
        Exit Property
    End If
    If Me.EsExpediente = "Sí" Or Me.EsBasado = "Sí" Then
        If Me.ExpedientePadre Is Nothing Then
            m_eEsCBDeAMCalculado = EnumSiNo.No
        Else
            If Me.ExpedientePadre.EsAM = "Sí" Then
                m_eEsCBDeAMCalculado = EnumSiNo.Sí
            Else
                m_eEsCBDeAMCalculado = EnumSiNo.No
            End If
        End If
        
    End If
    EsCBDeAMCalculado = m_eEsCBDeAMCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.EsCBDeAMCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get SolodeTSOL() As EnumSiNo
    
    Dim m_Suministrador As Suministrador
    Dim m_ID As Variant
    Dim m_Col As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_eSolodeTSOL <> Empty Then
        SolodeTSOL = m_eSolodeTSOL
        Exit Property
    End If
    If Me.ContratistaPrincipal = "Sí" Then
        Set m_Col = Me.Contratistas
    Else
        Set m_Col = Me.SubContratistas
    End If
    If m_Col Is Nothing Then
        m_eSolodeTSOL = EnumSiNo.No
        SolodeTSOL = m_eSolodeTSOL
        Exit Property
    End If
    If m_Col.Count > 1 Then
        m_eSolodeTSOL = EnumSiNo.No
        SolodeTSOL = m_eSolodeTSOL
        Exit Property
    End If
    For Each m_ID In m_Col
        Set m_Suministrador = m_Col(m_ID)
        
    Next
    If m_Suministrador.Nemotecnico = "TSOL" Then
        m_eSolodeTSOL = EnumSiNo.Sí
    Else
        m_eSolodeTSOL = EnumSiNo.No
    End If
    
    SolodeTSOL = m_eSolodeTSOL
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.SolodeTSOL ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get NecesitaCodS4H() As EnumSiNo
    
    
    Dim m_ID As Variant
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If Me.SolodeTSOL = EnumSiNo.No Then
        m_eNecesitaCodS4H = EnumSiNo.No
        NecesitaCodS4H = m_eNecesitaCodS4H
        Exit Property
    End If
    If Me.Adjudicado <> "Sí" Then
        m_eNecesitaCodS4H = EnumSiNo.No
        NecesitaCodS4H = m_eNecesitaCodS4H
        Exit Property
    End If
    If Me.AplicaTareaS4H = "No" Then
        m_eNecesitaCodS4H = EnumSiNo.No
        NecesitaCodS4H = m_eNecesitaCodS4H
        Exit Property
    End If
    If Me.CodS4H = "" Then
        m_eNecesitaCodS4H = EnumSiNo.Sí
        NecesitaCodS4H = m_eNecesitaCodS4H
        Exit Property
    End If
    
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.NecesitaCodS4H ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get IDExpedienteCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDExpedienteCalculado = DameID("TbExpedientes", "IDExpediente", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If CLng(m_sIDExpedienteCalculado) < 1000 Then
        m_sIDExpedienteCalculado = CStr(CLng(m_sIDExpedienteCalculado) + 1000)
    End If
    IDExpedienteCalculado = m_sIDExpedienteCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.IDExpedienteCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get Derivados() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjDerivados Is Nothing Then
        Set Derivados = m_ObjDerivados
        Exit Property
    End If
    Set m_ObjDerivados = constructor.getExpedientesDerivados(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Derivados = m_ObjDerivados
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.Derivados ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set Derivados(p_Valor As Variant)

    Set m_ObjDerivados = p_Valor

End Property

Public Property Get Lotes() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjLotes Is Nothing Then
        Set Lotes = m_ObjLotes
        Exit Property
    End If
    Set m_ObjLotes = constructor.getLotes(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Lotes = m_ObjLotes
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.Lotes ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set Lotes(p_Valor As Variant)

    Set m_ObjLotes = p_Valor

End Property
Public Property Get Basados() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjBasados Is Nothing Then
        Set Basados = m_ObjBasados
        Exit Property
    End If
    Set m_ObjBasados = constructor.getBasados(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Basados = m_ObjBasados
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.Basados ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set Basados(p_Valor As Variant)

    Set m_ObjBasados = p_Valor

End Property
Public Property Get Anualidades() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    Set m_ObjAnualidades = constructor.getExpedienteAnualidades(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Anualidades = m_ObjAnualidades
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.Anualidades ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get Hitos() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    Set m_ObjHitos = constructor.getExpedienteHitos(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Hitos = m_ObjHitos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.Hitos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get Modificados() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    Set m_ObjModificados = constructor.getExpedienteModificados(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Modificados = m_ObjModificados
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.Modificados ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set Modificados(p_Valor As Variant)
    
    Set m_ObjModificados = p_Valor
End Property


Public Property Get Comerciales() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    Set m_ObjComerciales = constructor.getExpedienteComerciales(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Comerciales = m_ObjComerciales
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.Comerciales ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get CPVs() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    Set m_ObjCPVs = constructor.getExpedienteCPVS(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set CPVs = m_ObjCPVs
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.CPVs ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property



Public Property Get Anexos() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    Set m_ObjAnexos = constructor.getExpedienteAnexos(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Anexos = m_ObjAnexos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.Anexos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get LugaresEjecucion() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    Set m_ObjLugaresEjecucion = constructor.getExpedienteLugaresEjecucion(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set LugaresEjecucion = m_ObjLugaresEjecucion
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.LugaresEjecucion ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get PECALES() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    Set m_ObjPECALES = constructor.getExpedientePECALES(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set PECALES = m_ObjPECALES
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.PECALES ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get CodigosComprasOperaciones() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    Set m_ObjCodigosComprasOperaciones = constructor.getExpedienteCodigoCompras(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set CodigosComprasOperaciones = m_ObjCodigosComprasOperaciones
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.CodigosComprasOperaciones ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get RACs() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    Set m_ObjRACS = constructor.getExpedienteRACS(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set RACs = m_ObjRACS
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.RACS ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get Suministradores() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    Set m_ObjSuministradores = constructor.getExpedienteSuministradores(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Suministradores = m_ObjSuministradores
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.Suministradores ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get SuministradoresTotal() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    Set m_ObjSuministradoresTotal = constructor.getExpedienteSuministradoresTotal(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set SuministradoresTotal = m_ObjSuministradoresTotal
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.SuministradoresTotal ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get Contratistas() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    Set m_ObjContratistas = constructor.getExpedienteContratistas(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Contratistas = m_ObjContratistas
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.Contratistas ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get SubContratistas() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    Set m_ObjSubContratistas = constructor.getExpedienteSubContratistas(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set SubContratistas = m_ObjSubContratistas
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.SubContratistas ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get Responsables() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    Set m_ObjResponsables = constructor.getExpedienteResponsables(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Responsables = m_ObjResponsables
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.Responsables ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set Responsables(p_Valor As Variant)
    Set m_ObjResponsables = p_Valor
    Set m_ObjResponsablesNoJP = p_Valor
    Set m_ObjResponsablesJP = p_Valor
    Set m_ObjResponsablesConEnvioCorreo = p_Valor
End Property
Public Property Get ResponsablesNoJP() As Scripting.Dictionary
    
    Dim m_ID As Variant
    Dim m_Responsable As ExpedienteResponsable
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If Me.Responsables Is Nothing Then
        Exit Property
    End If
    
    For Each m_ID In Me.Responsables
        Set m_Responsable = Me.Responsables(m_ID)
        If m_Responsable.EsJefeProyecto = "No" Then
            If m_ObjResponsablesNoJP Is Nothing Then
                Set m_ObjResponsablesNoJP = New Scripting.Dictionary
                m_ObjResponsablesNoJP.CompareMode = TextCompare
            End If
            If Not m_ObjResponsablesNoJP.exists(CStr(m_Responsable.IDExpedienteResponsable)) Then
                m_ObjResponsablesNoJP.Add CStr(m_Responsable.IDExpedienteResponsable), m_Responsable
            End If
        End If
        Set m_Responsable = Nothing
    Next
    
    Set ResponsablesNoJP = m_ObjResponsablesNoJP
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.ResponsablesNoJP ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ResponsablesJP() As Scripting.Dictionary
    
    Dim m_ID As Variant
    Dim m_Responsable As ExpedienteResponsable
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If Me.Responsables Is Nothing Then
        Exit Property
    End If
    
    For Each m_ID In Me.Responsables
        Set m_Responsable = Me.Responsables(m_ID)
        If m_Responsable.EsJefeProyecto <> "No" Then
            If m_ObjResponsablesJP Is Nothing Then
                Set m_ObjResponsablesJP = New Scripting.Dictionary
                m_ObjResponsablesJP.CompareMode = TextCompare
            End If
            If Not m_ObjResponsablesJP.exists(CStr(m_Responsable.IDExpedienteResponsable)) Then
                m_ObjResponsablesJP.Add CStr(m_Responsable.IDExpedienteResponsable), m_Responsable
            End If
        End If
        Set m_Responsable = Nothing
    Next
    
    Set ResponsablesJP = m_ObjResponsablesJP
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.ResponsablesJP ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get ResponsablesConEnvioCorreo() As Scripting.Dictionary
    
    Dim m_ID As Variant
    Dim m_Responsable As ExpedienteResponsable
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If Me.Responsables Is Nothing Then
        Exit Property
    End If
    
    For Each m_ID In Me.Responsables
        Set m_Responsable = Me.Responsables(m_ID)
        If m_Responsable.CorreoSiempre <> "No" Then
            If m_ObjResponsablesConEnvioCorreo Is Nothing Then
                Set m_ObjResponsablesConEnvioCorreo = New Scripting.Dictionary
                m_ObjResponsablesConEnvioCorreo.CompareMode = TextCompare
            End If
            If Not m_ObjResponsablesConEnvioCorreo.exists(CStr(m_Responsable.IDExpedienteResponsable)) Then
                m_ObjResponsablesConEnvioCorreo.Add CStr(m_Responsable.IDExpedienteResponsable), m_Responsable
            End If
        End If
        Set m_Responsable = Nothing
    Next
    
    Set ResponsablesConEnvioCorreo = m_ObjResponsablesConEnvioCorreo
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.ResponsablesConEnvioCorreo ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
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
        .Add "IDExpediente"
        .Add "IDExpedientePadre"
        .Add "Nemotecnico"
        .Add "Titulo"
        .Add "ObjetoContrato"
        .Add "ImporteLicitacion"
        .Add "ImporteContratacion"
        .Add "CodProyecto"
        .Add "CodExp"
        .Add "CodExpLargo"
        .Add "CodS4H"
        .Add "FechaInicioContrato"
        .Add "FechaFinContrato"
        .Add "FechaFinGarantia"
        .Add "EsAM"
        .Add "EsLote"
        .Add "EsBasado"
        .Add "EsExpediente"
        .Add "Ordinal"
        .Add "IdGradoClasificacion"
        .Add "IDOrganoContratacion"
        .Add "IDOficinaPrograma"
        .Add "IDEjercito"
        .Add "AccesoSharepoint"
        .Add "Observaciones"
        .Add "FechaCreacion"
        .Add "IDUsuarioCreacion"
        .Add "FechaUltimoCambio"
        .Add "IDUsuarioUltimoCambio"
        .Add "Ambito"
        .Add "NPedido"
        .Add "IDResponsableCalidad"
        .Add "IDResponsableSeguridad"
        .Add "TIPO"
        .Add "AGEDYSAplica"
        .Add "AGEDYSGenerico"
        .Add "HPSAplica"
        .Add "CadenaPecal"
        .Add "Pecal"
        .Add "TipoInforme"
        .Add "POSTAGEDO"
        .Add "APLICAESTADO"
        .Add "FECHAINICIOLICITACION"
        .Add "FECHAPREOFERTA"
        .Add "FECHAOFERTA"
        .Add "FECHAADJUDICACION"
        .Add "FECHAFIRMACONTRATO"
        .Add "GARANTIAMESES"
        .Add "FECHACERTIFICACION"
        .Add "FECHAPERDIDA"
        .Add "FECHADESESTIMADA"
        .Add "ESTADO"
        .Add "CodigoActividad"
        .Add "AplicaTareaS4H"
        .Add "ContratistaPrincipal"
        .Add "OrdinalE2E"
        
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDExpediente" Then
        getPropiedad = Me.IDExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpedientePadre" Then
        getPropiedad = Me.IDExpedientePadre
        Exit Function
    End If
    If m_NombrePropiedad = "Nemotecnico" Then
        getPropiedad = Me.Nemotecnico
        Exit Function
    End If
    If m_NombrePropiedad = "Titulo" Then
        getPropiedad = Me.Titulo
        Exit Function
    End If
    If m_NombrePropiedad = "ObjetoContrato" Then
        getPropiedad = Me.ObjetoContrato
        Exit Function
    End If
    If m_NombrePropiedad = "ImporteLicitacion" Then
        getPropiedad = Me.ImporteLicitacion
        Exit Function
    End If
    If m_NombrePropiedad = "ImporteContratacion" Then
        getPropiedad = Me.ImporteContratacion
        Exit Function
    End If
    
    If m_NombrePropiedad = "CodProyecto" Then
        getPropiedad = Me.CodProyecto
        Exit Function
    End If
    If m_NombrePropiedad = "CodExp" Then
        getPropiedad = Me.CodExp
        Exit Function
    End If
    If m_NombrePropiedad = "CodExpLargo" Then
        getPropiedad = Me.CodExpLargo
        Exit Function
    End If
    If m_NombrePropiedad = "CodS4H" Then
        getPropiedad = Me.CodS4H
        Exit Function
    End If
    
    
    If m_NombrePropiedad = "EsAM" Then
        getPropiedad = Me.EsAM
        Exit Function
    End If
    If m_NombrePropiedad = "EsLote" Then
        getPropiedad = Me.EsLote
        Exit Function
    End If
    If m_NombrePropiedad = "EsBasado" Then
        getPropiedad = Me.EsBasado
        Exit Function
    End If
    If m_NombrePropiedad = "EsExpediente" Then
        getPropiedad = Me.EsExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "Ordinal" Then
        getPropiedad = Me.Ordinal
        Exit Function
    End If
    If m_NombrePropiedad = "IdGradoClasificacion" Then
        getPropiedad = Me.IdGradoClasificacion
        Exit Function
    End If
    If m_NombrePropiedad = "IDOrganoContratacion" Then
        getPropiedad = Me.IDOrganoContratacion
        Exit Function
    End If
    If m_NombrePropiedad = "IDOficinaPrograma" Then
        getPropiedad = Me.IDOficinaPrograma
        Exit Function
    End If
    If m_NombrePropiedad = "IDEjercito" Then
        getPropiedad = Me.IDEjercito
        Exit Function
    End If
    If m_NombrePropiedad = "AccesoSharepoint" Then
        getPropiedad = Me.AccesoSharepoint
        Exit Function
    End If
    If m_NombrePropiedad = "Observaciones" Then
        getPropiedad = Me.Observaciones
        Exit Function
    End If
    If m_NombrePropiedad = "FechaCreacion" Then
        getPropiedad = Me.FechaCreacion
        Exit Function
    End If
    If m_NombrePropiedad = "IDUsuarioCreacion" Then
        getPropiedad = Me.IDUsuarioCreacion
        Exit Function
    End If
    If m_NombrePropiedad = "FechaUltimoCambio" Then
        getPropiedad = Me.FechaUltimoCambio
        Exit Function
    End If
    If m_NombrePropiedad = "IDUsuarioUltimoCambio" Then
        getPropiedad = Me.IDUsuarioUltimoCambio
        Exit Function
    End If
    If m_NombrePropiedad = "Ambito" Then
        getPropiedad = Me.Ambito
        Exit Function
    End If
    
    If m_NombrePropiedad = "NPedido" Then
        getPropiedad = Me.NPedido
        Exit Function
    End If
    If m_NombrePropiedad = "IDResponsableCalidad" Then
        getPropiedad = Me.IDResponsableCalidad
        Exit Function
    End If
    If m_NombrePropiedad = "IDResponsableSeguridad" Then
        getPropiedad = Me.IDResponsableSeguridad
        Exit Function
    End If
    If m_NombrePropiedad = "TIPO" Then
        getPropiedad = Me.TIpo
        Exit Function
    End If
    If m_NombrePropiedad = "AGEDYSAplica" Then
        getPropiedad = Me.AGEDYSAplica
        Exit Function
    End If
    If m_NombrePropiedad = "AGEDYSGenerico" Then
        getPropiedad = Me.AGEDYSGenerico
        Exit Function
    End If
    If m_NombrePropiedad = "HPSAplica" Then
        getPropiedad = Me.HPSAplica
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaPecal" Then
        getPropiedad = Me.CadenaPecal
        Exit Function
    End If
    If m_NombrePropiedad = "Pecal" Then
        getPropiedad = Me.PECAL
        Exit Function
    End If
    If m_NombrePropiedad = "TipoInforme" Then
        getPropiedad = Me.TipoInforme
        Exit Function
    End If
    If m_NombrePropiedad = "POSTAGEDO" Then
        getPropiedad = Me.POSTAGEDO
        Exit Function
    End If
    If m_NombrePropiedad = "APLICAESTADO" Then
        getPropiedad = Me.APLICAESTADO
        Exit Function
    End If
    If m_NombrePropiedad = "POSTAGEDO" Then
        getPropiedad = Me.POSTAGEDO
        Exit Function
    End If
    If m_NombrePropiedad = "FECHAINICIOLICITACION" Then
        getPropiedad = Me.FECHAINICIOLICITACION
        Exit Function
    End If
    If m_NombrePropiedad = "FECHAPREOFERTA" Then
        getPropiedad = Me.FECHAPREOFERTA
        Exit Function
    End If
    If m_NombrePropiedad = "FECHAOFERTA" Then
        getPropiedad = Me.FECHAOFERTA
        Exit Function
    End If
     If m_NombrePropiedad = "FECHADESESTIMADA" Then
        getPropiedad = Me.FECHADESESTIMADA
        Exit Function
    End If
     If m_NombrePropiedad = "FECHAPERDIDA" Then
        getPropiedad = Me.FECHAPERDIDA
        Exit Function
    End If
    If m_NombrePropiedad = "FECHAADJUDICACION" Then
        getPropiedad = Me.FECHAADJUDICACION
        Exit Function
    End If
     If m_NombrePropiedad = "FechaInicioContrato" Then
        getPropiedad = Me.FechaInicioContrato
        Exit Function
    End If
    If m_NombrePropiedad = "FechaFinContrato" Then
        getPropiedad = Me.FechaFinContrato
        Exit Function
    End If
    If m_NombrePropiedad = "GARANTIAMESES" Then
        getPropiedad = Me.GARANTIAMESES
        Exit Function
    End If
    If m_NombrePropiedad = "FECHAFIRMACONTRATO" Then
        getPropiedad = Me.FECHAFIRMACONTRATO
        Exit Function
    End If
    If m_NombrePropiedad = "FECHACERTIFICACION" Then
        getPropiedad = Me.FECHACERTIFICACION
        Exit Function
    End If
    If m_NombrePropiedad = "FechaFinGarantia" Then
        getPropiedad = Me.FechaFinGarantia
        Exit Function
    End If
    If m_NombrePropiedad = "ESTADO" Then
        getPropiedad = Me.ESTADO
        Exit Function
    End If
    If m_NombrePropiedad = "CodigoActividad" Then
        getPropiedad = Me.CodigoActividad
        Exit Function
    End If
    If m_NombrePropiedad = "AplicaTareaS4H" Then
        getPropiedad = Me.AplicaTareaS4H
        Exit Function
    End If
    If m_NombrePropiedad = "ContratistaPrincipal" Then
        getPropiedad = Me.ContratistaPrincipal
        Exit Function
    End If
    If m_NombrePropiedad = "OrdinalE2E" Then
        getPropiedad = Me.OrdinalE2E
        Exit Function
    End If
    
    p_Error = "Propiedad no reconocida en Expediente.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Expediente.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDExpediente" Then
        Me.IDExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpedientePadre" Then
        Me.IDExpedientePadre = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Nemotecnico" Then
        Me.Nemotecnico = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Titulo" Then
        Me.Titulo = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ObjetoContrato" Then
        Me.ObjetoContrato = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ImporteLicitacion" Then
        Me.ImporteLicitacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ImporteContratacion" Then
        Me.ImporteContratacion = m_ValorPropiedad
        Exit Function
    End If
    
    If m_NombrePropiedad = "CodProyecto" Then
        Me.CodProyecto = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CodExp" Then
        Me.CodExp = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CodExpLargo" Then
        Me.CodExpLargo = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CodS4H" Then
        Me.CodS4H = m_ValorPropiedad
        Exit Function
    End If
    
    If m_NombrePropiedad = "EsAM" Then
        Me.EsAM = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "EsLote" Then
        Me.EsLote = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "EsBasado" Then
        Me.EsBasado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "EsExpediente" Then
        Me.EsExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Ordinal" Then
        Me.Ordinal = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IdGradoClasificacion" Then
        Me.IdGradoClasificacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDOrganoContratacion" Then
        Me.IDOrganoContratacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDOficinaPrograma" Then
        Me.IDOficinaPrograma = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDEjercito" Then
        Me.IDEjercito = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "AccesoSharepoint" Then
        Me.AccesoSharepoint = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Observaciones" Then
        Me.Observaciones = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaCreacion" Then
        Me.FechaCreacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDUsuarioCreacion" Then
        Me.IDUsuarioCreacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaUltimoCambio" Then
        Me.FechaUltimoCambio = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDUsuarioUltimoCambio" Then
        Me.IDUsuarioUltimoCambio = m_ValorPropiedad
        Exit Function
    End If
    
    If m_NombrePropiedad = "Ambito" Then
        Me.Ambito = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "NPedido" Then
        Me.NPedido = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDResponsableCalidad" Then
        Me.IDResponsableCalidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDResponsableSeguridad" Then
        Me.IDResponsableSeguridad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "TIPO" Then
        Me.TIpo = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "AGEDYSAplica" Then
        Me.AGEDYSAplica = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "AGEDYSGenerico" Then
        Me.AGEDYSGenerico = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "HPSAplica" Then
        Me.HPSAplica = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaPecal" Then
        Me.CadenaPecal = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Pecal" Then
        Me.PECAL = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "TipoInforme" Then
        Me.TipoInforme = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "POSTAGEDO" Then
        Me.POSTAGEDO = m_ValorPropiedad
        Exit Function
    End If
    
    If m_NombrePropiedad = "APLICAESTADO" Then
        Me.APLICAESTADO = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FECHAINICIOLICITACION" Then
        Me.FECHAINICIOLICITACION = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FECHAPREOFERTA" Then
        Me.FECHAPREOFERTA = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FECHAOFERTA" Then
        Me.FECHAOFERTA = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FECHADESESTIMADA" Then
        Me.FECHADESESTIMADA = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FECHAPERDIDA" Then
        Me.FECHAPERDIDA = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FECHAADJUDICACION" Then
        Me.FECHAADJUDICACION = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaInicioContrato" Then
        Me.FechaInicioContrato = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaFinContrato" Then
        Me.FechaFinContrato = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "GARANTIAMESES" Then
        Me.GARANTIAMESES = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FECHAFIRMACONTRATO" Then
        Me.FECHAFIRMACONTRATO = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FECHACERTIFICACION" Then
        Me.FECHACERTIFICACION = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaFinGarantia" Then
        Me.FechaFinGarantia = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ESTADO" Then
        Me.ESTADO = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CodigoActividad" Then
        Me.CodigoActividad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "AplicaTareaS4H" Then
        Me.AplicaTareaS4H = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ContratistaPrincipal" Then
        Me.ContratistaPrincipal = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "OrdinalE2E" Then
        Me.OrdinalE2E = m_ValorPropiedad
        Exit Function
    End If
    
    p_Error = "Propiedad no reconocida en Expediente.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Expediente.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function




