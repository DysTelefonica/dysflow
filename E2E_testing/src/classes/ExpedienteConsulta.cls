VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteConsulta"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public Expediente As Expediente
Private m_sIDExpediente As String
Private m_sNemotecnico As String
Private m_sCodExpLargo As String
Private m_sIDExpedientePadre As String
Private m_sContratistas As String
Private m_sTipo As String
Private m_sTitulo As String
Private m_sObjetoContrato As String
Private m_sCodExp As String
Private m_sEjercito As String
Private m_sEstado As String
Private m_sFechaInicioContrato As String
Private m_sFechaFinContrato As String
Private m_sFechaFinGarantia As String
Private m_sJefeProyecto As String
Private m_sCalidad As String
Private m_sSeguridad As String
Private m_sAdjudicado As String
Private m_sEnPeriodoDeAdjudicacion As String
Private m_sImporteLicitacion As String
Private m_sImporteContratacion As String
Private m_sCodProyecto As String
Private m_sCodS4H As String
Private m_sEsAM As String
Private m_sEsLote As String
Private m_sEsBasado As String
Private m_sEsExpediente As String
Private m_sOrdinal As String
Private m_sClasificacion As String
Private m_sOrganoContratacion As String
Private m_sOficinaPrograma As String
Private m_sAccesoSharepoint As String
Private m_sObservaciones As String
Private m_sAmbito As String
Private m_sNPedido As String
Private m_sAGEDYSAplica As String
Private m_sAGEDYSGenerico As String
Private m_sHPSAplica As String
Private m_sCadenaPecal As String
Private m_sPecal As String
Private m_sPOSTAGEDO As String

Private m_ObjExpedienteEntidad As ExpedienteEntidad
Private m_objColCampos As Scripting.Dictionary
Private m_Error As String
Public Error As String

Public Property Get ExpedienteEntidad() As ExpedienteEntidad
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If Not m_ObjExpedienteEntidad Is Nothing Then
        Set ExpedienteEntidad = m_ObjExpedienteEntidad
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    Set m_ObjExpedienteEntidad = constructor.getExpedienteEntidad( _
                                p_IDExpediente:=Me.Expediente.IDExpediente, _
                                p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ExpedienteEntidad = m_ObjExpedienteEntidad
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.ExpedienteEntidad ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get IDExpediente() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sIDExpediente <> "" Then
        IDExpediente = m_sIDExpediente
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sIDExpediente = Me.Expediente.IDExpediente
    IDExpediente = m_sIDExpediente
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.IDExpediente ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get Nemotecnico() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sNemotecnico <> "" Then
        Nemotecnico = m_sNemotecnico
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sNemotecnico = Me.Expediente.Nemotecnico
    Nemotecnico = m_sNemotecnico
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.Nemotecnico ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get CodExpLargo() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sCodExpLargo <> "" Then
        CodExpLargo = m_sCodExpLargo
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sCodExpLargo = Me.Expediente.CodExpLargo
    CodExpLargo = CodExpLargo
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.CodExpLargo ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get PECAL() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sPecal <> "" Then
        PECAL = m_sPecal
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sPecal = Me.Expediente.PECAL
    PECAL = m_sPecal
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.Pecal ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get POSTAGEDO() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sPOSTAGEDO <> "" Then
        POSTAGEDO = m_sPOSTAGEDO
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sPOSTAGEDO = Me.Expediente.POSTAGEDO
    POSTAGEDO = m_sPOSTAGEDO
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.POSTAGEDO ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get IDExpedientePadre() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sIDExpedientePadre <> "" Then
        IDExpedientePadre = m_sIDExpedientePadre
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sIDExpedientePadre = Me.Expediente.IDExpedientePadre
    IDExpedientePadre = m_sIDExpedientePadre
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.IDExpedientePadre ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get Contratistas() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sContratistas <> "" Then
        Contratistas = m_sContratistas
        Exit Property
    End If
    If Me.ExpedienteEntidad Is Nothing Then
        Exit Property
    End If
    m_sContratistas = Me.ExpedienteEntidad.CadenaContratistas
    Contratistas = m_sContratistas
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.Contratistas ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get TIpo() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sTipo <> "" Then
        TIpo = m_sTipo
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sTipo = Me.Expediente.TipoInforme
    TIpo = m_sTipo
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.Tipo ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get Titulo() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sTitulo <> "" Then
        Titulo = m_sTitulo
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sTitulo = Me.Expediente.Titulo
    Titulo = m_sTitulo
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.Titulo ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get ObjetoContrato() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sObjetoContrato <> "" Then
        ObjetoContrato = m_sObjetoContrato
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sObjetoContrato = Me.Expediente.ObjetoContrato
    ObjetoContrato = m_sObjetoContrato
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.ObjetoContrato ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get CodExp() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sCodExp <> "" Then
        CodExp = m_sCodExp
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sCodExp = Me.Expediente.CodExp
    CodExp = m_sCodExp
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.CodExp ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get Ejercito() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sEjercito <> "" Then
        Ejercito = m_sEjercito
        Exit Property
    End If
    If Me.ExpedienteEntidad Is Nothing Then
        Exit Property
    End If
    m_sEjercito = Me.ExpedienteEntidad.Ejercito
    Ejercito = m_sEjercito
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.Ejercito ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ESTADO() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sEstado <> "" Then
        ESTADO = m_sEstado
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sEstado = Me.Expediente.ESTADO
    ESTADO = m_sEstado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.Estado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get FechaInicioContrato() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sFechaInicioContrato <> "" Then
        FechaInicioContrato = m_sFechaInicioContrato
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sFechaInicioContrato = Me.Expediente.FechaInicioContrato
    FechaInicioContrato = m_sFechaInicioContrato
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.FechaInicioContrato ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get FechaFinContrato() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sFechaFinContrato <> "" Then
        FechaFinContrato = m_sFechaFinContrato
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sFechaFinContrato = Me.Expediente.FechaFinContrato
    FechaFinContrato = m_sFechaFinContrato
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.FechaFinContrato ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get FechaFinGarantia() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sFechaFinGarantia <> "" Then
        FechaFinGarantia = m_sFechaFinGarantia
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sFechaFinGarantia = Me.Expediente.FechaFinGarantia
    FechaFinGarantia = m_sFechaFinGarantia
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.FechaFinGarantia ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get JefeProyecto() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sJefeProyecto <> "" Then
        JefeProyecto = m_sJefeProyecto
        Exit Property
    End If
    If Me.ExpedienteEntidad Is Nothing Then
        Exit Property
    End If
    m_sJefeProyecto = Me.ExpedienteEntidad.CadenaJPs
    JefeProyecto = m_sJefeProyecto
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.JefeProyecto ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get Calidad() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sCalidad <> "" Then
        Calidad = m_sCalidad
        Exit Property
    End If
    If Me.ExpedienteEntidad Is Nothing Then
        Exit Property
    End If
    m_sCalidad = Me.ExpedienteEntidad.responsableCalidad
    Calidad = m_sCalidad
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.Calidad ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get Seguridad() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sSeguridad <> "" Then
        Seguridad = m_sSeguridad
        Exit Property
    End If
    If Me.ExpedienteEntidad Is Nothing Then
        Exit Property
    End If
    m_sSeguridad = Me.ExpedienteEntidad.responsableSeguridad
    Seguridad = m_sSeguridad
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.Seguridad ha devuelto el error: " & vbNewLine & Err.Description
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
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sAdjudicado = Me.Expediente.Adjudicado
    Adjudicado = m_sAdjudicado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.Adjudicado ha devuelto el error: " & vbNewLine & Err.Description
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
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sEnPeriodoDeAdjudicacion = Me.Expediente.EnPeriodoDeAdjudicacion
    EnPeriodoDeAdjudicacion = m_sEnPeriodoDeAdjudicacion
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.EnPeriodoDeAdjudicacion ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get ImporteLicitacion() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sImporteLicitacion <> "" Then
        ImporteLicitacion = m_sImporteLicitacion
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sImporteLicitacion = Me.Expediente.ImporteLicitacion
    ImporteLicitacion = m_sImporteLicitacion
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.ImporteLicitacion ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ImporteContratacion() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sImporteContratacion <> "" Then
        ImporteContratacion = m_sImporteContratacion
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sImporteContratacion = Me.Expediente.ImporteContratacion
    ImporteContratacion = m_sImporteContratacion
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.ImporteContratacion ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get CodProyecto() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sCodProyecto <> "" Then
        CodProyecto = m_sCodProyecto
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sCodProyecto = Me.Expediente.CodProyecto
    CodProyecto = m_sCodProyecto
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.CodProyecto ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get CodS4H() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sCodS4H <> "" Then
        CodS4H = m_sCodS4H
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sCodS4H = Me.Expediente.CodS4H
    CodS4H = m_sCodS4H
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.CodS4H ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get EsAM() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If EsAM <> "" Then
        m_sEsAM = m_sEsAM
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sEsAM = Me.Expediente.EsAM
    EsAM = m_sEsAM
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.EsAM ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get EsLote() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sEsLote <> "" Then
        EsLote = m_sEsLote
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sEsLote = Me.Expediente.EsLote
    EsLote = m_sEsLote
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.EsLote ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get EsBasado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sEsBasado <> "" Then
        EsBasado = m_sEsBasado
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sEsBasado = Me.Expediente.EsBasado
    EsBasado = m_sEsBasado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.EsBasado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get EsExpediente() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sEsExpediente <> "" Then
        EsExpediente = m_sEsExpediente
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sEsExpediente = Me.Expediente.EsExpediente
    EsExpediente = m_sEsExpediente
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.EsExpediente ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get Ordinal() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sOrdinal <> "" Then
        Ordinal = m_sOrdinal
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sOrdinal = Me.Expediente.Ordinal
    Ordinal = m_sOrdinal
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.Ordinal ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get Clasificacion() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sClasificacion <> "" Then
        Clasificacion = m_sClasificacion
        Exit Property
    End If
    If Me.ExpedienteEntidad Is Nothing Then
        Exit Property
    End If
    m_sClasificacion = Me.ExpedienteEntidad.Clasificacion
    Clasificacion = m_sClasificacion
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.Clasificacion ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get OrganoContratacion() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sOrganoContratacion <> "" Then
        OrganoContratacion = m_sOrganoContratacion
        Exit Property
    End If
    If Me.ExpedienteEntidad Is Nothing Then
        Exit Property
    End If
    m_sOrganoContratacion = Me.ExpedienteEntidad.OrganoContratacion
    OrganoContratacion = m_sOrganoContratacion
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.OrganoContratacion ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get OficinaPrograma() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sOficinaPrograma <> "" Then
        OficinaPrograma = m_sOficinaPrograma
        Exit Property
    End If
    If Me.ExpedienteEntidad Is Nothing Then
        Exit Property
    End If
    m_sOficinaPrograma = Me.ExpedienteEntidad.OficinaPrograma
    OficinaPrograma = m_sOficinaPrograma
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.OficinaPrograma ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get AccesoSharepoint() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sAccesoSharepoint <> "" Then
        AccesoSharepoint = m_sAccesoSharepoint
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sAccesoSharepoint = Me.Expediente.AccesoSharepoint
    AccesoSharepoint = m_sAccesoSharepoint
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.AccesoSharepoint ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get Observaciones() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sObservaciones <> "" Then
        Observaciones = m_sObservaciones
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sObservaciones = Me.Expediente.Observaciones
    Observaciones = m_sObservaciones
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.Observaciones ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get Ambito() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sAmbito <> "" Then
        Ambito = m_sAmbito
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sAmbito = Me.Expediente.Ambito
    Ambito = m_sAmbito
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.Ambito ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get NPedido() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sNPedido <> "" Then
        NPedido = m_sNPedido
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sNPedido = Me.Expediente.NPedido
    NPedido = m_sNPedido
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.NPedido ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get AGEDYSAplica() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sAGEDYSAplica <> "" Then
        AGEDYSAplica = m_sAGEDYSAplica
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sAGEDYSAplica = Me.Expediente.AGEDYSAplica
    AGEDYSAplica = m_sAGEDYSAplica
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.AGEDYSAplica ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get AGEDYSGenerico() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sAGEDYSGenerico <> "" Then
        AGEDYSGenerico = m_sAGEDYSGenerico
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sAGEDYSGenerico = Me.Expediente.AGEDYSGenerico
    AGEDYSGenerico = m_sAGEDYSGenerico
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.AGEDYSGenerico ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get HPSAplica() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sHPSAplica <> "" Then
        HPSAplica = m_sHPSAplica
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sHPSAplica = Me.Expediente.HPSAplica
    HPSAplica = m_sHPSAplica
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.HPSAplica ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get CadenaPecal() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sCadenaPecal <> "" Then
        CadenaPecal = m_sCadenaPecal
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sCadenaPecal = Me.Expediente.CadenaPecal
    CadenaPecal = m_sCadenaPecal
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.CadenaPecal ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get ColCampos() As Scripting.Dictionary

    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Not m_objColCampos Is Nothing Then
        Set ColCampos = m_objColCampos
        Exit Property
    End If
    Set m_objColCampos = New Scripting.Dictionary
    m_objColCampos.CompareMode = TextCompare
    With m_objColCampos
        .Add "IDExpediente", "ID"
        .Add "IDExpedientePadre", "IDExpedientePadre"
        .Add "Nemotecnico", "Nemotécnico"
        .Add "Contratistas", "Jurídica"
        .Add "Tipo", "Tipo"
        .Add "Titulo", "Título"
        .Add "ObjetoContrato", "Objeto Contrato"
        .Add "CodExp", "Nº Exp. Corto"
        .Add "CodExpLargo", "Nº Exp. Largo"
        .Add "Ejercito", "Ejército"
        .Add "Estado", "Estado"
        .Add "FechaInicioContrato", "Fecha Inicio"
        .Add "FechaFinContrato", "Fecha Fin"
        .Add "FechaFinGarantia", "Fecha Fin Garantía"
        .Add "JefeProyecto", "Jefe Proyecto"
        .Add "Calidad", "Calidad"
        .Add "Adjudicado", "Adjudicado"
        .Add "EnPeriodoDeAdjudicacion", "En Periodo Adjudicación"
        .Add "ImporteLicitacion", "Importe Licitación"
        .Add "ImporteContratacion", "Importe Contratación"
        .Add "CodProyecto", "Cod Proyecto"
        .Add "CodS4H", "CodS4H"
        .Add "EsAM", "AM"
        .Add "EsLote", "Lote"
        .Add "EsBasado", "Basado"
        .Add "EsExpediente", "Expediente"
        .Add "Ordinal", "Número"
        .Add "Clasificacion", "Clasificación"
        .Add "OrganoContratacion", "OrganoContratación"
        .Add "OficinaPrograma", "Oficina de Programa"
        .Add "AccesoSharepoint", "AccesoSharepoint"
        .Add "Observaciones", "Observaciones"
        .Add "Ambito", "Se Ejecuta en Defensa"
        .Add "NPedido", "NPedido"
        .Add "AGEDYSAplica", "Para AGEDYS"
        .Add "AGEDYSGenerico", "AGEDYS Genérico"
        .Add "HPSAplica", "Para HPS"
        .Add "CadenaPecal", "Pecal"
        .Add "POSTAGEDO", "POSTAGEDO"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteConsulta.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
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
    If m_NombrePropiedad = "Contratistas" Then
        getPropiedad = Me.Contratistas
        Exit Function
    End If
    If m_NombrePropiedad = "Tipo" Then
        getPropiedad = Me.TIpo
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
    If m_NombrePropiedad = "CodExp" Then
        getPropiedad = Me.CodExp
        Exit Function
    End If
    If m_NombrePropiedad = "CodExpLargo" Then
        getPropiedad = Me.CodExpLargo
        Exit Function
    End If
    If m_NombrePropiedad = "Ejercito" Then
        getPropiedad = Me.Ejercito
        Exit Function
    End If
    If m_NombrePropiedad = "Estado" Then
        getPropiedad = Me.ESTADO
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
    If m_NombrePropiedad = "FechaFinGarantia" Then
        getPropiedad = Me.FechaFinGarantia
        Exit Function
    End If
    If m_NombrePropiedad = "JefeProyecto" Then
        getPropiedad = Me.JefeProyecto
        Exit Function
    End If
    If m_NombrePropiedad = "Calidad" Then
        getPropiedad = Me.Calidad
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
    If m_NombrePropiedad = "Clasificacion" Then
        getPropiedad = Me.Clasificacion
        Exit Function
    End If
    If m_NombrePropiedad = "OrganoContratacion" Then
        getPropiedad = Me.OrganoContratacion
        Exit Function
    End If
    If m_NombrePropiedad = "OficinaPrograma" Then
        getPropiedad = Me.OficinaPrograma
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
    If m_NombrePropiedad = "Ambito" Then
        getPropiedad = Me.Ambito
        Exit Function
    End If
    
    If m_NombrePropiedad = "NPedido" Then
        getPropiedad = Me.NPedido
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
    If m_NombrePropiedad = "POSTAGEDO" Then
        getPropiedad = Me.POSTAGEDO
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteConsulta.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteConsulta.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


