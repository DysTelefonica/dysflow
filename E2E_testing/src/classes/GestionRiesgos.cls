VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "GestionRiesgos"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public Event NoHayCambios()
Public Event HayErrores()



Public IDProyecto As String
Public IDExpediente As String
Public Proyecto As String
Public JURIDICA As String
Public NombreProyecto As String
Public Cliente As String
Public FechaPrevistaCierre As String
Public FechaCierre As String
Public FechaRegistroInicial As String
Public Elaborado As String
Public Revisado As String
Public Aprobado As String
Public CodigoDocumento As String
Public ParaInformeAvisos As String
Public FECHAFIRMACONTRATO As String
Public RiesgosDeLaOferta As String
Public RiesgosDelSubContratista As String
Public NombreUsuarioCalidad As String
Public EnUTE As String
Public FechaMaxProximaPublicacion As String
Public RequiereRiesgoDeBiblioteca As String
Public CorreoRAC As String
Public FechaCierreProyecto As String
Public Ordinal As String
Public CadenaNombreAutorizados As String



Private m_sProyectoCalculado As String
Private m_sJuridicaCalculada As String
Private m_sNombreProyectoCalculado As String
Private m_sFechaPrevistaCierreCalculada As String
Private m_sClienteCalculado As String
Private m_sCodigoDocumentoCalculado As String
Private m_sFechaFirmaContratoCalculada As String
Private m_sNombreUsuarioCalidadCalculado As String
Private m_sEnUTECalculado As String
Private m_sFechaMaxProximaPublicacionCalculada As String
Private m_sCorreoRACCalculado As String
Private m_ObjExpediente As Expediente
Private m_sCadenaNombreAutorizadosCalculados As String

Private m_ObjColAutorizados As Scripting.Dictionary
Private m_ObjUsuarioCalidad As USUARIO





Private m_objColCampos As Collection
Public Error As String
Private m_Error As String


Public Property Get NombreUsuarioCalidadCalculado() As String
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sNombreUsuarioCalidadCalculado <> "" Then
        NombreUsuarioCalidadCalculado = m_sNombreUsuarioCalidadCalculado
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    If Not Me.Expediente.responsableCalidad Is Nothing Then
        m_sNombreUsuarioCalidadCalculado = Me.Expediente.responsableCalidad.Nombre
    End If
    
    
    NombreUsuarioCalidadCalculado = m_sNombreUsuarioCalidadCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método GestionRiesgos.NombreUsuarioCalidadCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get EnUTECalculado() As String
    
    Dim dato As Variant
    Dim m_Suministrador As Variant
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sEnUTECalculado <> "" Then
        EnUTECalculado = m_sEnUTECalculado
        Exit Property
    End If
    If Me.JURIDICA = "" Then
        m_sEnUTECalculado = "No"
        EnUTECalculado = m_sEnUTECalculado
        Exit Property
    End If
    If InStr(1, Me.JURIDICA, "|") = 0 Then
        m_sEnUTECalculado = "No"
        EnUTECalculado = m_sEnUTECalculado
        Exit Property
    End If
    dato = Split(Me.JURIDICA, "|")
    For Each m_Suministrador In dato
        If CStr(m_Suministrador) <> "TSOL" And CStr(m_Suministrador) <> "TME" And CStr(m_Suministrador) <> "TDE" Then
            m_sEnUTECalculado = "Sí"
            EnUTECalculado = m_sEnUTECalculado
            Exit Property
        End If
    Next
    
    m_sEnUTECalculado = "No"
    
    EnUTECalculado = m_sEnUTECalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método GestionRiesgos.EnUTECalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get FechaPrevistaCierreCalculada() As String
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sFechaPrevistaCierreCalculada <> "" Then
        FechaPrevistaCierreCalculada = m_sFechaPrevistaCierreCalculada
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sFechaPrevistaCierreCalculada = Me.Expediente.FechaFinContrato
    
    FechaPrevistaCierreCalculada = m_sFechaPrevistaCierreCalculada
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método GestionRiesgos.FechaPrevistaCierreCalculada ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ClienteCalculado() As String
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sClienteCalculado <> "" Then
        ClienteCalculado = m_sClienteCalculado
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    If Me.Expediente.OrganoContratacion Is Nothing Then
        Exit Property
    End If
    m_sClienteCalculado = Me.Expediente.OrganoContratacion.OrganoContratacion
    
    ClienteCalculado = m_sClienteCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método GestionRiesgos.ClienteCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get NombreProyectoCalculado() As String
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sNombreProyectoCalculado <> "" Then
        NombreProyectoCalculado = m_sNombreProyectoCalculado
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    With Me.Expediente
        If .Nemotecnico <> "" Then
            If IsNumeric(.Ordinal) Then
                If .Ordinal = "1" Then
                    m_sNombreProyectoCalculado = .Nemotecnico
                Else
                    m_sNombreProyectoCalculado = .Nemotecnico & " (GR" & Format(.Ordinal, "00") & ")"
                End If
            Else
                m_sNombreProyectoCalculado = .Nemotecnico
            End If
            
            
        Else
            
            If .Titulo <> "" Then
                If IsNumeric(.Ordinal) Then
                    If .Ordinal = "1" Then
                        m_sNombreProyectoCalculado = .Titulo
                    Else
                       m_sNombreProyectoCalculado = .Titulo & " (GR" & Format(.Ordinal, "00") & ")"
                    End If
                Else
                    m_sNombreProyectoCalculado = .Titulo
                End If
                
            End If
        End If
    End With
    
    
    NombreProyectoCalculado = m_sNombreProyectoCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método GestionRiesgos.NombreProyectoCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get JuridicaCalculada() As String
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sJuridicaCalculada <> "" Then
        JuridicaCalculada = m_sJuridicaCalculada
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sJuridicaCalculada = Me.Expediente.CadenaContratistas
    
    JuridicaCalculada = m_sJuridicaCalculada
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método GestionRiesgos.JuridicaCalculada ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get ProyectoCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sProyectoCalculado <> "" Then
        ProyectoCalculado = m_sProyectoCalculado
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    If Me.Expediente.CodExp <> "" Then
        m_sProyectoCalculado = Me.Expediente.CodExp
        ProyectoCalculado = m_sProyectoCalculado
        Exit Property
    End If
    If Me.Expediente.CodigoActividad <> "" Then
        m_sProyectoCalculado = Me.Expediente.CodigoActividad
        ProyectoCalculado = m_sProyectoCalculado
        Exit Property
    End If
    If Me.Expediente.CodExpLargo <> "" Then
        m_sProyectoCalculado = Me.Expediente.CodExpLargo
        ProyectoCalculado = m_sProyectoCalculado
        Exit Property
    End If
    
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método GestionRiesgos.ProyectoCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get FechaFirmaContratoCalculada() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sFechaFirmaContratoCalculada <> "" Then
        FechaFirmaContratoCalculada = m_sFechaFirmaContratoCalculada
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sFechaFirmaContratoCalculada = Me.Expediente.FechaFinContrato
    FechaFirmaContratoCalculada = m_sFechaFirmaContratoCalculada
    
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método GestionRiesgos.FechaFirmaContratoCalculada ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get CorreoRACCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sCorreoRACCalculado <> "" Then
        CorreoRACCalculado = m_sCorreoRACCalculado
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sCorreoRACCalculado = Me.Expediente.CadenaCorreoRACs
    CorreoRACCalculado = m_sCorreoRACCalculado
    
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método GestionRiesgos.CorreoRACCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get CodigoDocumentoCalculado() As String
    
    Dim m_CodDocPorParteExp As String
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sCodigoDocumentoCalculado <> "" Then
        CodigoDocumentoCalculado = m_sCodigoDocumentoCalculado
        Exit Property
    End If
    If Me.Expediente Is Nothing Then
        Exit Property
    End If
    m_sCodigoDocumentoCalculado = Me.Expediente.CodigoDocParteExpediente
    m_Error = Me.Expediente.Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    CodigoDocumentoCalculado = m_sCodigoDocumentoCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método GestionRiesgos.CodigoDocumentoCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get Expediente() As Expediente

    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_ObjExpediente Is Nothing Then
        Set Expediente = m_ObjExpediente
        Exit Property
    End If
    If Me.IDExpediente = "" Then
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
        m_Error = "El método GestionRiesgos.Expediente ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property







Public Property Get UsuarioCalidad() As USUARIO
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjUsuarioCalidad Is Nothing Then
        Set UsuarioCalidad = m_ObjUsuarioCalidad
        Exit Property
    End If
    If Me.NombreUsuarioCalidad = "" Then
        Exit Property
    End If
    Set m_ObjUsuarioCalidad = constructor.getUsuario(, , Me.NombreUsuarioCalidad, , m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set UsuarioCalidad = m_ObjUsuarioCalidad
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método GestionRiesgos.UsuarioCalidad ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
    
End Property




Public Property Get CadenaNombreAutorizadosCalculados() As String
    
    Dim m_Nombre As Variant
    
    Dim m_colJPs As Scripting.Dictionary
    Dim m_Cadena As String
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sCadenaNombreAutorizadosCalculados <> "" Then
        CadenaNombreAutorizadosCalculados = m_sCadenaNombreAutorizadosCalculados
        Exit Property
    End If
    If Me.IDExpediente = "" Then
        Exit Property
    End If
    Set m_colJPs = getJPsPorExpediente(Me.IDExpediente, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    For Each m_Nombre In m_colJPs
        
        If m_Cadena = "" Then
            m_Cadena = m_Nombre
        Else
            m_Cadena = m_Cadena & ";" & m_Nombre
        End If
        
    Next
    CadenaNombreAutorizadosCalculados = m_Cadena
    
    Exit Property
    
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método GestionRiesgos.CadenaNombreAutorizadosCalculados ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property



Public Function RegistrarCorreoRAC( _
                                    p_CorreoRAC As String, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    
    Dim m_SQL As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    p_Error = ""
    If p_CorreoRAC = "" Then
        p_Error = "Se ha de indicar el corrreo del RAC"
        Err.Raise 1000
    End If
    Me.CorreoRAC = p_CorreoRAC
    If Me.IDProyecto = "" Then
        p_Error = "No se conoce el IDProyecto"
        Err.Raise 1000
    End If
    
    m_SQL = "UPDATE TbProyectos SET TbProyectos.CorreoRAC = '" & Me.CorreoRAC & "' " & _
            "WHERE IDProyecto=" & Me.IDProyecto & ";"
    getdb().Execute m_SQL
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RegistrarCorreoRAC ha devuelto el error: " & Err.Description
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
        .Add "IDProyecto"
        .Add "IDExpediente"
        .Add "Proyecto"
        .Add "Juridica"
        .Add "NombreProyecto"
        .Add "Cliente"
        .Add "FechaPrevistaCierre"
        .Add "FechaCierre"
        .Add "FechaRegistroInicial"
        .Add "Elaborado"
        .Add "Revisado"
        .Add "Aprobado"
        .Add "CodigoDocumento"
        .Add "ParaInformeAvisos"
        .Add "FechaFirmaContrato"
        .Add "RiesgosDeLaOferta"
        .Add "RiesgosDelSubContratista"
        .Add "NombreUsuarioCalidad"
        .Add "EnUTE"
        .Add "FechaMaxProximaPublicacion"
        .Add "RequiereRiesgoDeBiblioteca"
        .Add "CorreoRAC"
        .Add "FechaCierreProyecto"
        .Add "Ordinal"
        .Add "CadenaNombreAutorizados"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método GestionRiesgos.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDProyecto" Then
        getPropiedad = Me.IDProyecto
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        getPropiedad = Me.IDExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "Juridica" Then
        getPropiedad = Me.JURIDICA
        Exit Function
    End If
    If m_NombrePropiedad = "NombreProyecto" Then
        getPropiedad = Me.NombreProyecto
        Exit Function
    End If
    If m_NombrePropiedad = "Cliente" Then
        getPropiedad = Me.Cliente
        Exit Function
    End If
    If m_NombrePropiedad = "FechaPrevistaCierre" Then
        getPropiedad = Me.FechaPrevistaCierre
        Exit Function
    End If
    If m_NombrePropiedad = "FechaCierre" Then
        getPropiedad = Me.FechaCierre
        Exit Function
    End If
    If m_NombrePropiedad = "FechaRegistroInicial" Then
        getPropiedad = Me.FechaRegistroInicial
        Exit Function
    End If
    If m_NombrePropiedad = "Elaborado" Then
        getPropiedad = Me.Elaborado
        Exit Function
    End If
    If m_NombrePropiedad = "Revisado" Then
        getPropiedad = Me.Revisado
        Exit Function
    End If
    If m_NombrePropiedad = "Aprobado" Then
        getPropiedad = Me.Aprobado
        Exit Function
    End If
    If m_NombrePropiedad = "CodigoDocumento" Then
        getPropiedad = Me.CodigoDocumento
        Exit Function
    End If
    If m_NombrePropiedad = "ParaInformeAvisos" Then
        getPropiedad = Me.ParaInformeAvisos
        Exit Function
    End If
    If m_NombrePropiedad = "FechaFirmaContrato" Then
        getPropiedad = Me.FECHAFIRMACONTRATO
        Exit Function
    End If
    If m_NombrePropiedad = "RiesgosDeLaOferta" Then
        getPropiedad = Me.RiesgosDeLaOferta
        Exit Function
    End If
    If m_NombrePropiedad = "RiesgosDeLaOferta" Then
        getPropiedad = Me.RiesgosDeLaOferta
        Exit Function
    End If
    If m_NombrePropiedad = "NombreUsuarioCalidad" Then
        getPropiedad = Me.NombreUsuarioCalidad
        Exit Function
    End If
    If m_NombrePropiedad = "EnUTE" Then
        getPropiedad = Me.EnUTE
        Exit Function
    End If
    If m_NombrePropiedad = "FechaMaxProximaPublicacion" Then
        getPropiedad = Me.FechaMaxProximaPublicacion
        Exit Function
    End If
    If m_NombrePropiedad = "RequiereRiesgoDeBiblioteca" Then
        getPropiedad = Me.RequiereRiesgoDeBiblioteca
        Exit Function
    End If
    If m_NombrePropiedad = "CorreoRAC" Then
        getPropiedad = Me.CorreoRAC
        Exit Function
    End If
    
    If m_NombrePropiedad = "FechaCierreProyecto" Then
        getPropiedad = Me.FechaCierreProyecto
        Exit Function
    End If
    If m_NombrePropiedad = "Ordinal" Then
        getPropiedad = Me.Ordinal
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaNombreAutorizados" Then
        getPropiedad = Me.CadenaNombreAutorizados
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en GestionRiesgos.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método GestionRiesgos.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDProyecto" Then
        Me.IDProyecto = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        Me.IDExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Proyecto" Then
        Me.Proyecto = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Juridica" Then
        Me.JURIDICA = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "NombreProyecto" Then
        Me.NombreProyecto = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Cliente" Then
        Me.Cliente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaPrevistaCierre" Then
        Me.FechaPrevistaCierre = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaRegistroInicial" Then
        Me.FechaRegistroInicial = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaCierre" Then
        Me.FechaCierre = m_ValorPropiedad
        Exit Function
    End If
    
    If m_NombrePropiedad = "Elaborado" Then
        Me.Elaborado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Revisado" Then
        Me.Revisado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Aprobado" Then
        Me.Aprobado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CodigoDocumento" Then
        Me.CodigoDocumento = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ParaInformeAvisos" Then
        Me.ParaInformeAvisos = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaFirmaContrato" Then
        Me.FECHAFIRMACONTRATO = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "RiesgosDeLaOferta" Then
        Me.RiesgosDeLaOferta = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "RiesgosDelSubContratista" Then
        Me.RiesgosDelSubContratista = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "EnUTE" Then
        Me.EnUTE = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "NombreUsuarioCalidad" Then
        Me.NombreUsuarioCalidad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaMaxProximaPublicacion" Then
        Me.FechaMaxProximaPublicacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "RequiereRiesgoDeBiblioteca" Then
        Me.RequiereRiesgoDeBiblioteca = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CorreoRAC" Then
        Me.CorreoRAC = m_ValorPropiedad
        Exit Function
    End If
    
    If m_NombrePropiedad = "FechaCierreProyecto" Then
        Me.FechaCierreProyecto = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Ordinal" Then
        Me.Ordinal = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CadenaNombreAutorizados" Then
        Me.CadenaNombreAutorizados = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en GestionRiesgos.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método GestionRiesgos.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function






