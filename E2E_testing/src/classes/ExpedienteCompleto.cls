VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteCompleto"
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

Public Clasificacion As String
Public OrganoContratacion As String
Public OficinaPrograma As String
Public Ejercito As String
Public responsableCalidad As String
Public responsableSeguridad As String
Public CadenaContratistas As String
Public CadenaComerciales As String
Public CadenaJPs As String
Public CadenaRACs As String
Public CadenaCorreoRACs As String
Public CadenaHitos As String
Private m_sTipoParaLista As String

Private m_eESTADOCalculado As EnumEstados
Private m_sESTADOCalculadoTexto As String
Private m_sESTADOCalculadoTitulo As String
Private m_sNemotecnicoCalculado As String
Private m_eTipoCalculado As EnumTipoExpediente
Private m_ObjExpedientePadreLote As ExpedienteCompleto
Private m_ObjExpedientePadre As ExpedienteCompleto
Private m_ObjExpedientePadreAM As ExpedienteCompleto
Private m_ObjBasados As Scripting.Dictionary
Private m_ObjExpediente As Expediente
Private m_ObjDerivados As Scripting.Dictionary

Private m_objColCampos As Collection
Public Error As String
Private m_Error As String


Public Property Get Derivados() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjDerivados Is Nothing Then
        Set Derivados = m_ObjDerivados
        Exit Property
    End If
    Set m_ObjDerivados = constructor.getExpedientesDerivadosCompletos(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Derivados = m_ObjDerivados
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteCompleto.Derivados ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set Derivados(p_Valor As Variant)

    Set m_ObjDerivados = p_Valor

End Property

Public Property Get Expediente() As Expediente
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjExpediente Is Nothing Then
        Set Expediente = m_ObjExpediente
        Exit Property
    End If
    Set m_ObjExpediente = constructor.getExpediente(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Expediente = m_ObjExpediente
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteCompleto.Expediente ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get Basados() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjBasados Is Nothing Then
        Set Basados = m_ObjBasados
        Exit Property
    End If
    Set m_ObjBasados = constructor.getBasadosCompletos(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Basados = m_ObjBasados
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteCompleto.Basados ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set Basados(p_Valor As Variant)

    Set m_ObjBasados = p_Valor

End Property

Public Property Get ExpedientePadre() As ExpedienteCompleto
    
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
    Set m_ObjExpedientePadre = constructor.getExpedienteCompleto(p_IDExpediente:=Me.IDExpedientePadre, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ExpedientePadre = m_ObjExpedientePadre
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteCompleto.ExpedientePadre ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ExpedientePadreLote() As ExpedienteCompleto
    
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
        m_Error = "El método ExpedienteCompleto.ExpedientePadreLote ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get ExpedientePadreAM() As ExpedienteCompleto
    
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
        m_Error = "El método ExpedienteCompleto.ExpedientePadreAM ha devuelto el error: " & vbNewLine & Err.Description
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
        m_Error = "El método ExpedienteCompleto.TipoCalculado ha devuelto el error: " & vbNewLine & Err.Description
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
        m_Error = "El método ExpedienteCompleto.ESTADOCalculado ha devuelto el error: " & vbNewLine & Err.Description
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
        m_Error = "El método ExpedienteCompleto.ESTADOCalculadoTitulo ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get NemotecnicoCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sNemotecnicoCalculado <> "" Then
        NemotecnicoCalculado = m_sNemotecnicoCalculado
        Exit Property
    End If
    m_sNemotecnicoCalculado = GetNemotecnicoCalculado(Me, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteCompleto.NemotecnicoCalculado ha devuelto el error: " & vbNewLine & Err.Description
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
        m_Error = "El método ExpedienteCompleto.TipoParaLista ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "Clasificacion"
        .Add "OrganoContratacion"
        .Add "OficinaPrograma"
        .Add "Ejercito"
        .Add "ResponsableCalidad"
        .Add "ResponsableSeguridad"
        .Add "CadenaContratistas"
        .Add "CadenaComerciales"
        .Add "CadenaJPs"
        .Add "CadenaRACs"
        .Add "CadenaCorreoRACs"
        .Add "CadenaHitos"
        
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteCompleto.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
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
    If m_NombrePropiedad = "Ejercito" Then
        getPropiedad = Me.Ejercito
        Exit Function
    End If
    
    If m_NombrePropiedad = "ResponsableCalidad" Then
        getPropiedad = Me.responsableCalidad
        Exit Function
    End If
    If m_NombrePropiedad = "ResponsableSeguridad" Then
        getPropiedad = Me.responsableSeguridad
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaContratistas" Then
        getPropiedad = Me.CadenaContratistas
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaComerciales" Then
        getPropiedad = Me.CadenaComerciales
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaJPs" Then
        getPropiedad = Me.CadenaJPs
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaRACs" Then
        getPropiedad = Me.CadenaRACs
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaCorreoRACs" Then
        getPropiedad = Me.CadenaCorreoRACs
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaHitos" Then
        getPropiedad = Me.CadenaHitos
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteCompleto.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteCompleto.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
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
    If m_NombrePropiedad = "Clasificacion" Then
        Me.Clasificacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "OrganoContratacion" Then
        Me.OrganoContratacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "OficinaPrograma" Then
        Me.OficinaPrograma = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Ejercito" Then
        Me.Ejercito = m_ValorPropiedad
        Exit Function
    End If
    
    If m_NombrePropiedad = "ResponsableCalidad" Then
        Me.responsableCalidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ResponsableSeguridad" Then
        Me.responsableSeguridad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaContratistas" Then
        Me.CadenaContratistas = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaComerciales" Then
        Me.CadenaComerciales = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaJPs" Then
        Me.CadenaJPs = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaRACs" Then
        Me.CadenaRACs = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaCorreoRACs" Then
        Me.CadenaCorreoRACs = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaHitos" Then
        Me.CadenaHitos = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteCompleto.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteCompleto.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

