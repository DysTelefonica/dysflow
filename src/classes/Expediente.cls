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
Public Tipo As String
Public CadenaPecal As String
Public PECAL As String
Public TipoInforme As String
Public POSTAGEDO As String
Public APLICAESTADO As String
Public FECHAINICIOLICITACION As String
Public FECHAOFERTA As String
Public FECHAADJUDICACION As String
Public FechaFirmaContrato As String
Public GARANTIAMESES As String
Public FECHACERTIFICACION As String
Public FECHAPERDIDA As String
Public FECHADESESTIMADA As String
Public Estado As String
Public CodigoActividad As String


Private m_sCadenaJuridicas As String

Private m_ObjJuridicas As Scripting.Dictionary


Private m_ObjResponsables As Scripting.Dictionary

Private m_objColUsuarios As Collection
Private m_ObjResponsableCalidad As usuario
Private m_ObjJefeProyecto As usuario
Private m_sJefeProyectoNombre As String
Private m_sTextoExpediente As String
Private m_ObjRiesgos As Scripting.Dictionary

Private m_eEnUTE As EnumSino
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get Riesgos() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjRiesgos Is Nothing Then
        Set Riesgos = m_ObjRiesgos
        Exit Property
    End If
    
    Set m_ObjRiesgos = constructor.getRiesgosDeExpediente(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Riesgos = m_ObjRiesgos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.Riesgos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get TextoExpediente() As String
    
    
    
        
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sTextoExpediente <> "" Then
        TextoExpediente = m_sTextoExpediente
        Exit Property
    End If
    If Me.Nemotecnico <> "" Then
        If Me.CodExp <> "" Then
            m_sTextoExpediente = Me.Nemotecnico & " (" & Me.CodExp & ")"
        Else
            m_sTextoExpediente = Me.Nemotecnico
        End If
        
    Else
        m_sTextoExpediente = Me.CodExp
    End If
    
    
    TextoExpediente = m_sTextoExpediente
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.TextoExpediente ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get EnUTE() As EnumSino
    
    Dim m_CadenaJuridicas As String
    Dim dato As Variant
    Dim m_Juridica As Variant
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_eEnUTE <> Empty Then
        EnUTE = m_eEnUTE
        Exit Property
    End If
    m_CadenaJuridicas = Me.CadenaJuridicas
    If InStr(1, m_CadenaJuridicas, "|") = 0 Then
        m_eEnUTE = EnumSino.No
        EnUTE = m_eEnUTE
        Exit Property
    End If
    dato = Split(m_CadenaJuridicas, "|")
    For Each m_Juridica In dato
        If CStr(m_Juridica) <> "TDE" And CStr(m_Juridica) <> "TSOL" And CStr(m_Juridica) <> "TME" Then
            m_eEnUTE = EnumSino.Sí
            EnUTE = m_eEnUTE
            Exit Property
        End If
    Next
    m_eEnUTE = EnumSino.No
    EnUTE = m_eEnUTE
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.EnUTE ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get Juridicas() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    Set m_ObjJuridicas = constructor.getExpedienteJuridicas(p_IDExp:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Juridicas = m_ObjJuridicas
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.Juridicas ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get CadenaJuridicas() As String
    
    Dim m_ID As Variant
    Dim m_Juridica As Juridica
    
        
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sCadenaJuridicas = ""
    If Me.Juridicas Is Nothing Then
        
        Exit Property
    End If
    For Each m_ID In Me.Juridicas
        Set m_Juridica = Me.Juridicas(m_ID)
        If m_sCadenaJuridicas = "" Then
            m_sCadenaJuridicas = m_Juridica.Juridica
        Else
            m_sCadenaJuridicas = m_sCadenaJuridicas & "|" & m_Juridica.Juridica
        End If
        Set m_Juridica = Nothing
    Next
    
    CadenaJuridicas = m_sCadenaJuridicas
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.CadenaJuridicas ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get Responsables() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    Set m_ObjResponsables = constructor.getExpedienteResponsables(p_IDExp:=Me.IDExpediente, p_Error:=m_Error)
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



Public Property Get RESPONSABLECALIDAD() As usuario
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If Not m_ObjResponsableCalidad Is Nothing Then
        Set RESPONSABLECALIDAD = m_ObjResponsableCalidad
        Exit Property
    End If
    If Me.IDResponsableCalidad = "" Then
        Exit Property
    End If
    Set m_ObjResponsableCalidad = constructor.getUsuario(p_ID:=Me.IDResponsableCalidad, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set RESPONSABLECALIDAD = m_ObjResponsableCalidad
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.ResponsableCalidad ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
    
End Property

Public Property Get JefeProyecto() As usuario
    Dim m_ID As Variant
    Dim m_JP As ExpedienteResponsable
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If Not m_ObjJefeProyecto Is Nothing Then
        Set JefeProyecto = m_ObjJefeProyecto
        Exit Property
    End If
    If Me.Responsables Is Nothing Then
        Exit Property
    End If
    For Each m_ID In Me.Responsables
        Set m_JP = Me.Responsables(m_ID)
        If m_JP.EsJefeProyecto = "Sí" Then
            Set m_ObjJefeProyecto = m_JP.usuario
            Exit For
        End If
        Set m_JP = Nothing
    Next
    
    Set JefeProyecto = m_ObjJefeProyecto
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.JefeProyecto ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
    
End Property

Public Property Get JefeProyectoNombre() As String
    
    
    
        
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sJefeProyectoNombre <> "" Then
        JefeProyectoNombre = m_sJefeProyectoNombre
        Exit Property
    End If
    If Me.JefeProyecto Is Nothing Then
        Exit Property
    End If
    m_sJefeProyectoNombre = Me.JefeProyecto.Nombre
    
    
    JefeProyectoNombre = m_sJefeProyectoNombre
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.JefeProyectoNombre ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "FECHAOFERTA"
        .Add "FECHAADJUDICACION"
        .Add "FECHAFIRMACONTRATO"
        .Add "GARANTIAMESES"
        .Add "FECHACERTIFICACION"
        .Add "FECHAPERDIDA"
        .Add "FECHADESESTIMADA"
        .Add "ESTADO"
        .Add "CodigoActividad"
        
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
        getPropiedad = Me.Tipo
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
        getPropiedad = Me.FechaFirmaContrato
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
        getPropiedad = Me.Estado
        Exit Function
    End If
    If m_NombrePropiedad = "CodigoActividad" Then
        getPropiedad = Me.CodigoActividad
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
        Me.Tipo = m_ValorPropiedad
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
        Me.FechaFirmaContrato = m_ValorPropiedad
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
        Me.Estado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CodigoActividad" Then
        Me.CodigoActividad = m_ValorPropiedad
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



