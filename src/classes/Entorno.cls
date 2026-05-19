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

Public URLUltimoArchivo As String

Private m_sCSS As String
Private m_sCSS1 As String
Private m_sURLDirectorioAplicaciones As String
Private m_sURLDirAplicacion As String
Private m_objColAdministradores As Scripting.Dictionary
Private m_objColUsuariosCalidad As Scripting.Dictionary
Private m_sCadenaCorreosCalidad As String
Private m_sCadenaCorreosCalidadEnPruebas As String
Private m_sURLArchivoIni As String
Private m_sVersionAplicacion As String
Private m_sURLDirectorioDocumentacion As String
Private m_sURLDirectorioPlantillas As String
Private m_sURLDirectorioDocumentacionAuditorias As String
Private m_sURLPlantillaInformeNCProyecto As String
Private m_sURLPlantillaInformeNCAuditoria As String
Private m_sURLDirectorioLocal As String
Private m_sURLDirectorioInformesLocal As String
Private m_sURLDirectorioDocumentacionAyuda As String

Private m_sURLVideoAyudaNCProyecto As String
Private m_sURLVideoAyudaNCProyectoParaTecnico As String
Private m_sURLVideoAyudaNCAuditoria As String

Private m_sURLArchivoCSS As String
Private m_sURLArchivoCSS1 As String
Private m_sURLDirRecursos As String

Private m_sURLAyudaIndicadores As String


Private m_objColNCsProyecto As Scripting.Dictionary
Private m_objColNCsAuditoria As Scripting.Dictionary
Private m_ObjColJuridicasDistintas As Scripting.Dictionary


Private m_sTituloUsuarioConectado As String
Private m_objExpedientes As Scripting.Dictionary
Private m_objColTipos As Scripting.Dictionary
Private m_objUsuariosActivos As Scripting.Dictionary
Private m_objUsuarios As Scripting.Dictionary


Private m_ObjColEstadosNC As Scripting.Dictionary
Private m_ObjColEstadosNCTexto As Scripting.Dictionary
Private m_objColEstadosNCTitulo As Scripting.Dictionary

Private m_ObjColEstadosAC As Scripting.Dictionary
Private m_ObjColEstadosACTexto As Scripting.Dictionary
Private m_ObjColEstadosACTitulo As Scripting.Dictionary

Private m_ObjColEstadosAR As Scripting.Dictionary
Private m_ObjColEstadosARTexto As Scripting.Dictionary
Private m_ObjColEstadosARTitulo As Scripting.Dictionary


Private m_ObjColEnumOrdenOrderBy As Scripting.Dictionary
Private m_ObjColEnumOrdenTitulo As Scripting.Dictionary

Private m_objColJefesProyecto As Scripting.Dictionary
Private m_objColAuditorias As Scripting.Dictionary
Private m_objColAuditoriasNombres As Scripting.Dictionary
Private m_objColResponsablesImplantacionDistintos As Scripting.Dictionary
Private m_objColPuntosNormaNCAuditorias As Scripting.Dictionary

Private m_objColAuditoriaSegTareas As Scripting.Dictionary
Private m_objColAuditoriaSegTareasActivas As Scripting.Dictionary
Private m_objColAuditoriaSegNC As Scripting.Dictionary

Private m_objColProyectoSegTareas As Scripting.Dictionary
Private m_objColProyectoSegNC As Scripting.Dictionary

Private m_objColSegsTareasProyecto As Scripting.Dictionary
Private m_objColSegsTareasProyectoActivas As Scripting.Dictionary
Private m_objColSegsTareasProyectoPteReplanificar As Scripting.Dictionary

Private m_objColSegsNCProyectoRegistradas As Scripting.Dictionary
Private m_objColSegsNCProyectoTotales As Scripting.Dictionary
Private m_objColSegsNCProyectoAccionesSinTareas As Scripting.Dictionary
Private m_objColSegsNCProyectoPteCE As Scripting.Dictionary
Private m_objColSegsNCProyectoCECaducada As Scripting.Dictionary
Private m_objColSegsNCProyectoCENoConforme As Scripting.Dictionary

Private m_objColSegsTareasAuditoriaTotales As Scripting.Dictionary
Private m_objColSegsTareasAuditoriaActivas As Scripting.Dictionary
Private m_objColSegsTareasAuditoriaPteReplanificar As Scripting.Dictionary
Private m_objColSegsTareasAuditoriaIrregulares   As Scripting.Dictionary
Private m_objColSegsNCAuditoriaRegistradas As Scripting.Dictionary
Private m_objColSegsNCAuditoriaTotales As Scripting.Dictionary
Private m_objColSegsNCAuditoriaAccionesSinTareas As Scripting.Dictionary
Private m_objColSegsNCAuditoriaPteCE As Scripting.Dictionary
Private m_objColSegsNCAuditoriaCECaducada As Scripting.Dictionary
Private m_objColSegsNCAuditoriaCENoConforme As Scripting.Dictionary


Private m_Error As String
Public Error As String
Private m_objColItems As Scripting.Dictionary



Public Property Get ColEnumOrdenOrderBy() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjColEnumOrdenOrderBy Is Nothing Then
        Set ColEnumOrdenOrderBy = m_ObjColEnumOrdenOrderBy
        Exit Property
    End If
    Set m_ObjColEnumOrdenOrderBy = New Scripting.Dictionary
    m_ObjColEnumOrdenOrderBy.CompareMode = TextCompare
    With m_ObjColEnumOrdenOrderBy
        .Add CStr(EnumOrden.PorFechaInicio), "order by FechaInicialMinima,IDAccionCorrectiva|order by FechaInicio,IDAccionRealizada"
        .Add CStr(EnumOrden.PorFechaFinPrevista), "order by FechaFinPrevistaUltima,IDAccionCorrectiva|order by FechaFinPrevista,IDAccionRealizada"
        .Add CStr(EnumOrden.PorNAccion), "order by NAccion,IDAccionCorrectiva|order by NAccion,IDAccionRealizada"
        
    End With
    Set ColEnumOrdenOrderBy = m_ObjColEnumOrdenOrderBy
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColEnumOrdenOrderBy ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get ColEnumOrdenTitulo() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjColEnumOrdenTitulo Is Nothing Then
        Set ColEnumOrdenTitulo = m_ObjColEnumOrdenTitulo
        Exit Property
    End If
    Set m_ObjColEnumOrdenTitulo = New Scripting.Dictionary
    m_ObjColEnumOrdenTitulo.CompareMode = TextCompare
    With m_ObjColEnumOrdenTitulo
        .Add CStr(EnumOrden.PorFechaInicio), "Cronológico - Fecha inicio"
        .Add CStr(EnumOrden.PorFechaFinPrevista), "Cronológico - Fecha fin prevista"
        .Add CStr(EnumOrden.PorNAccion), "Nº Acción"
        
    End With
    Set ColEnumOrdenTitulo = m_ObjColEnumOrdenTitulo
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColEnumOrdenTitulo ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ColEstadosAR() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjColEstadosAR Is Nothing Then
        Set ColEstadosAR = m_ObjColEstadosAR
        Exit Property
    End If
    Set m_ObjColEstadosAR = New Scripting.Dictionary
    m_ObjColEstadosAR.CompareMode = TextCompare
    With m_ObjColEstadosAR
        .Add CStr(EnumEstadoAR.ACTIVA), "ACTIVA"
        .Add CStr(EnumEstadoAR.FINALIZADA), "FINALIZADA"
        .Add CStr(EnumEstadoAR.PTEREPLANIFICAR), "PTEREPLANIFICAR"
        .Add CStr(EnumEstadoAR.IRREGULAR), "IRREGULAR"
        .Add CStr(EnumEstadoAR.REGISTRADA), "REGISTRADA"
    End With
    Set ColEstadosAR = m_ObjColEstadosAR
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColEstadosAR ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get ColEstadosARTexto() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjColEstadosARTexto Is Nothing Then
        Set ColEstadosARTexto = m_ObjColEstadosARTexto
        Exit Property
    End If
    Set m_ObjColEstadosARTexto = New Scripting.Dictionary
    m_ObjColEstadosARTexto.CompareMode = TextCompare
    With m_ObjColEstadosARTexto
        .Add "ACTIVA", EnumEstadoAR.ACTIVA
        .Add "FINALIZADA", EnumEstadoAR.FINALIZADA
        .Add "PTEREPLANIFICAR", EnumEstadoAR.PTEREPLANIFICAR
        .Add "IRREGULAR", EnumEstadoAR.IRREGULAR
        .Add "REGISTRADA", EnumEstadoAR.REGISTRADA
    End With
    Set ColEstadosARTexto = m_ObjColEstadosARTexto
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColEstadosARTexto ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get ColEstadosARTitulo() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjColEstadosARTitulo Is Nothing Then
        Set ColEstadosARTitulo = m_ObjColEstadosARTitulo
        Exit Property
    End If
    Set m_ObjColEstadosARTitulo = New Scripting.Dictionary
    m_ObjColEstadosARTitulo.CompareMode = TextCompare
    With m_ObjColEstadosARTitulo
        .Add CStr(EnumEstadoAR.ACTIVA), "ACTIVA"
        .Add CStr(EnumEstadoAR.FINALIZADA), "FINALIZADA"
        .Add CStr(EnumEstadoAR.PTEREPLANIFICAR), "PENDIENTE DE REPLANIFICAR"
        .Add CStr(EnumEstadoAR.IRREGULAR), "ESTADO IRREGULAR"
        .Add CStr(EnumEstadoAR.REGISTRADA), "REGISTRADA"
    End With
    Set ColEstadosARTitulo = m_ObjColEstadosARTitulo
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColEstadosARTitulo ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get ColEstadosAC() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjColEstadosAC Is Nothing Then
        Set ColEstadosAC = m_ObjColEstadosAC
        Exit Property
    End If
    Set m_ObjColEstadosAC = New Scripting.Dictionary
    m_ObjColEstadosAC.CompareMode = TextCompare
    With m_ObjColEstadosAC
        .Add CStr(EnumEstadoAC.ACTIVA), "ACTIVA"
        .Add CStr(EnumEstadoAC.SINACCIONES), "SINACCIONES"
        .Add CStr(EnumEstadoAC.FINALIZADA), "FINALIZADA"
        .Add CStr(EnumEstadoAC.PTEREPLANIFICAR), "PTEREPLANIFICAR"
        .Add CStr(EnumEstadoAC.PTEREREGULARIZAR), "PTEREREGULARIZAR"
        .Add CStr(EnumEstadoAC.REGISTRADA), "REGISTRADA"
    End With
    Set ColEstadosAC = m_ObjColEstadosAC
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColEstadosAC ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ColEstadosACTexto() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjColEstadosACTexto Is Nothing Then
        Set ColEstadosACTexto = m_ObjColEstadosACTexto
        Exit Property
    End If
    Set m_ObjColEstadosACTexto = New Scripting.Dictionary
    m_ObjColEstadosACTexto.CompareMode = TextCompare
    With m_ObjColEstadosACTexto
        .Add "ACTIVA", EnumEstadoAC.ACTIVA
        .Add "SINACCIONES", EnumEstadoAC.SINACCIONES
        .Add "FINALIZADA", EnumEstadoAC.FINALIZADA
        .Add "PTEREPLANIFICAR", EnumEstadoAC.PTEREPLANIFICAR
        .Add "PTEREREGULARIZAR", EnumEstadoAC.PTEREREGULARIZAR
        .Add "REGISTRADA", EnumEstadoAC.REGISTRADA
    End With
    Set ColEstadosACTexto = m_ObjColEstadosACTexto
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColEstadosACTexto ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ColEstadosACTitulo() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjColEstadosACTitulo Is Nothing Then
        Set ColEstadosACTitulo = m_ObjColEstadosACTitulo
        Exit Property
    End If
    Set m_ObjColEstadosACTitulo = New Scripting.Dictionary
    m_ObjColEstadosACTitulo.CompareMode = TextCompare
    With m_ObjColEstadosACTitulo
        .Add CStr(EnumEstadoAC.ACTIVA), "ACTIVA"
        .Add CStr(EnumEstadoAC.SINACCIONES), "SIN ACCIONES"
        .Add CStr(EnumEstadoAC.FINALIZADA), "FINALIZADA"
        .Add CStr(EnumEstadoAC.PTEREPLANIFICAR), "PENDIENTE DE REPLANIFICAR"
        .Add CStr(EnumEstadoAC.PTEREREGULARIZAR), "ALGUNA ACCIÓN IRREGULAR"
        .Add CStr(EnumEstadoAC.REGISTRADA), "TODAS LAS ACCIONES SIN PLANIFICAR"
    End With
    Set ColEstadosACTitulo = m_ObjColEstadosACTitulo
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColEstadosACTitulo ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get UsuariosActivos() As Scripting.Dictionary

    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objUsuariosActivos Is Nothing Then
        Set UsuariosActivos = m_objUsuariosActivos
        Exit Property
    End If
    
    Avance "Usuarios Administradores"
    Set m_objUsuariosActivos = constructor.getUsuariosTecnicos(p_Activos:=EnumSino.Sí, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set UsuariosActivos = m_objUsuariosActivos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.UsuariosActivos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property

Public Property Set UsuariosActivos(p_Valor As Variant)
    Set m_objUsuariosActivos = p_Valor
End Property

Public Property Get Usuarios() As Scripting.Dictionary

    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objUsuarios Is Nothing Then
        Set Usuarios = m_objUsuarios
        Exit Property
    End If
    
    Avance "Usuarios Administradores"
    Set m_objUsuarios = constructor.getUsuariosTecnicos(p_Activos:=EnumSino.No, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Usuarios = m_objUsuarios
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.Usuarios ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property

Public Property Set Usuarios(p_Valor As Variant)
    Set m_objUsuarios = p_Valor
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
    If EsAdministrador = EnumSino.Sí Then
        m_Colectivo = "Administrador"
    ElseIf EsCalidad = EnumSino.Sí Then
        m_Colectivo = "Calidad"
    Else
        m_Colectivo = "Técnico"
    End If
    
    If Application.TempVars("EnPruebas") = "Sí" Then
        m_sTituloUsuarioConectado = "Usuario conectado: " & m_ObjUsuarioConectado.Nombre & " ( " & m_Colectivo & " ) EN PRUEBAS"
    Else
        m_sTituloUsuarioConectado = "Usuario conectado: " & m_ObjUsuarioConectado.Nombre & " ( " & m_Colectivo & " )"
    End If
    
    TituloUsuarioConectado = m_sTituloUsuarioConectado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.TituloUsuarioConectado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
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
Public Property Get CSS1() As String
    
    Dim ObjDatos As TextStream
    Dim m_URL As String
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sCSS1 <> "" Then
        CSS1 = m_sCSS1
        Exit Property
    End If
    m_URL = Me.URLArchivoCSS1
    m_Error = Me.Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not fso.FileExists(m_URL) Then
        m_Error = "Ne es alcanzable el archivo URLArchivoCSS1" & vbNewLine & Me.URLArchivoCSS1
        Err.Raise 1000
    End If
    Set ObjDatos = fso.OpenTextFile(m_URL, ForReading, False, TristateMixed)
    While Not ObjDatos.AtEndOfStream
          m_sCSS1 = m_sCSS1 & ObjDatos.ReadAll
    Wend
    Set ObjDatos = Nothing
    

    CSS1 = m_sCSS1
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.CSS1 ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Get URLDirectorioAplicaciones() As String
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLDirectorioAplicaciones <> "" Then
        URLDirectorioAplicaciones = m_sURLDirectorioAplicaciones
        Exit Property
    End If
    If Application.TempVars("DatosEnLocal") = "Sí" Then
        m_sURLDirectorioAplicaciones = m_URLRutaAplicacionesLocal
    ElseIf Application.TempVars("DatosEnLocal") = "No" Then
        m_sURLDirectorioAplicaciones = m_URLRutaAplicacionesRemotas
    Else
        m_Error = "No se sabe si se está usando en local o en remoto"
        Err.Raise 1000
    End If
    
   
    If Not fso.FolderExists(m_sURLDirectorioAplicaciones) Then
        m_Error = "No es alcanzable m_sURLDirectorioAplicaciones " & m_sURLDirectorioAplicaciones
        Err.Raise 1000
    End If
    
    URLDirectorioAplicaciones = m_sURLDirectorioAplicaciones
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLDirectorioAplicaciones ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get URLArchivoIni() As String
    
    Dim m_URLAplicacion As String
    Dim m_URLDirectorio As String
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLArchivoIni <> "" Then
        URLArchivoIni = m_sURLArchivoIni
        Exit Property
    End If
    m_URLDirectorio = Application.CurrentProject.Path & "\"

    m_sURLArchivoIni = m_URLDirectorio & fso.GetBaseName(Application.CurrentProject.Name) & ".ini"
    If Not fso.FileExists(m_sURLArchivoIni) Then
        m_Error = "No es alcanzable m_sURLArchivoIni & vbnewline & m_sURLArchivoIni"
        m_sURLArchivoIni = ""
        Err.Raise 1000
    End If
    
    
    URLArchivoIni = m_sURLArchivoIni
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLArchivoIni  ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Get URLPlantillaInformeNCProyecto() As String
    
   
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLPlantillaInformeNCProyecto <> "" Then
        URLPlantillaInformeNCProyecto = m_sURLPlantillaInformeNCProyecto
        Exit Property
    End If
    m_sURLPlantillaInformeNCProyecto = Me.URLDirectorioPlantillas & "Plantilla_InformeNC.docx"
    
   

   
    If Not fso.FileExists(m_sURLPlantillaInformeNCProyecto) Then
        m_Error = "No es alcanzable m_sURLPlantillaInformeNCProyecto & vbnewline & m_sURLPlantillaInformeNCProyecto"
        m_sURLPlantillaInformeNCProyecto = ""
        Err.Raise 1000
    End If
    
    
    URLPlantillaInformeNCProyecto = m_sURLPlantillaInformeNCProyecto
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLPlantillaInformeNCProyecto  ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Get URLPlantillaInformeNCAuditoria() As String
    
   
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLPlantillaInformeNCAuditoria <> "" Then
        URLPlantillaInformeNCAuditoria = m_sURLPlantillaInformeNCAuditoria
        Exit Property
    End If
    m_sURLPlantillaInformeNCAuditoria = Me.URLDirectorioPlantillas & "Plantilla_InformeNCAuditoria.docx"
    
   

   
    If Not fso.FileExists(m_sURLPlantillaInformeNCAuditoria) Then
        m_Error = "No es alcanzable m_sURLPlantillaInformeNCAuditoria & vbnewline & m_sURLPlantillaInformeNCAuditoria"
        m_sURLPlantillaInformeNCAuditoria = ""
        Err.Raise 1000
    End If
    
    
    URLPlantillaInformeNCAuditoria = m_sURLPlantillaInformeNCAuditoria
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLPlantillaInformeNCAuditoria  ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get URLVideoAyudaNCProyecto() As String
    
   
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLVideoAyudaNCProyecto <> "" Then
        URLVideoAyudaNCProyecto = m_sURLVideoAyudaNCProyecto
        Exit Property
    End If
'    If m_EnOficina <> EnumSino.Sí Then
'        Exit Property
'    End If
    
    
    m_sURLVideoAyudaNCProyecto = "\\datoste\aplicaciones_dys\Aplicaciones PpD\No Conformidades\Anexos\Doc Ayuda\BBDD - NC Proyecto - Formación 2.mp4"
    
    
    
    URLVideoAyudaNCProyecto = m_sURLVideoAyudaNCProyecto
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLVideoAyudaNCProyecto  ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Get URLVideoAyudaNCProyectoParaTecnico() As String
    
   
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLVideoAyudaNCProyectoParaTecnico <> "" Then
        URLVideoAyudaNCProyectoParaTecnico = m_sURLVideoAyudaNCProyectoParaTecnico
        Exit Property
    End If
'    If m_EnOficina <> EnumSino.Sí Then
'        Exit Property
'    End If
    
    
    m_sURLVideoAyudaNCProyectoParaTecnico = "\\datoste\aplicaciones_dys\Aplicaciones PpD\No Conformidades\Anexos\Doc Ayuda\BBDD - NC Proyecto - Formación JP 23062025.mp4"
    
    
    
    URLVideoAyudaNCProyectoParaTecnico = m_sURLVideoAyudaNCProyectoParaTecnico
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLVideoAyudaNCProyectoParaTecnico  ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Property Get URLVideoAyudaNCAuditoria() As String
    
   
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLVideoAyudaNCAuditoria <> "" Then
        URLVideoAyudaNCAuditoria = m_sURLVideoAyudaNCAuditoria
        Exit Property
    End If
'    If m_EnOficina <> EnumSino.Sí Then
'        Exit Property
'    End If
    
    
   m_sURLVideoAyudaNCAuditoria = "\\datoste\aplicaciones_dys\Aplicaciones PpD\No Conformidades\Anexos\Doc Ayuda\BBDD - NC Auditoría - Formación 2.mp4"
    
    
    
    URLVideoAyudaNCAuditoria = m_sURLVideoAyudaNCAuditoria
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLVideoAyudaNCAuditoria  ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Get URLDirAplicacion() As String
    
    Dim m_URLConfigurada As String
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLDirAplicacion <> "" Then
        URLDirAplicacion = m_sURLDirAplicacion
        Exit Property
    End If
    If Nz(Application.TempVars("DatosEnLocal"), "") = "Sí" Then
        m_URLConfigurada = m_URLRutaAplicacionLocal
    Else
        m_URLConfigurada = m_URLRutaAplicacionRemota
    End If
    m_sURLDirAplicacion = NormalizarURLFolder(m_URLConfigurada)
    
    If FormatoCorrectoURL(m_sURLDirAplicacion) = EnumSino.No Then
        m_Error = "No es alcanzable el archivo URLDirAplicacion" & vbNewLine & m_sURLDirAplicacion
        Err.Raise 1000
    End If
    
    If Not fso.FolderExists(m_sURLDirAplicacion) Then
        m_Error = "No es alcanzable m_sURLDirectorioAplicaciones & vbnewline & m_sURLDirAplicacion"
        m_sURLDirAplicacion = ""
        Err.Raise 1000
    End If
    
    
    URLDirAplicacion = m_sURLDirAplicacion
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLDirAplicacion  ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Function ValidarInfraCritica(Optional ByRef p_Error As String) As Boolean
    On Error GoTo errores

    Dim m_Diag As String
    Dim m_URL As String

    p_Error = ""
    m_Diag = ""

    m_URL = ""
    m_URL = Me.URLDirAplicacion
    If Me.Error <> "" Then
        Call AppendInfraDiag(m_Diag, "RutaDirectorioAplicacion", m_URL, Me.Error)
        Me.Error = ""
    End If

    m_URL = ""
    m_URL = Me.URLDirRecursos
    If Me.Error <> "" Then
        Call AppendInfraDiag(m_Diag, "URLDirRecursos", m_URL, Me.Error)
        Me.Error = ""
    End If

    m_URL = ""
    m_URL = Me.URLDirectorioDocumentacion
    If Me.Error <> "" Then
        Call AppendInfraDiag(m_Diag, "URLDirectorioDocumentacion", m_URL, Me.Error)
        Me.Error = ""
    End If

    If m_Diag <> "" Then
        p_Error = "INFRA CONFIG FAIL-FAST:" & vbNewLine & m_Diag
        ValidarInfraCritica = False
    Else
        ValidarInfraCritica = True
    End If

    Exit Function
errores:
    If p_Error = "" Then p_Error = "INFRA CONFIG FAIL-FAST:" & vbNewLine & "- Campo=InfraStartup; Ruta=; Causa=" & Err.Description
    ValidarInfraCritica = False
End Function

Private Function NormalizarURLFolder(ByVal p_URL As String) As String
    Dim m_URL As String
    m_URL = Trim$(Nz(p_URL, ""))
    If m_URL = "" Then Exit Function
    m_URL = Replace$(m_URL, "/", "\")
    If Right$(m_URL, 1) <> "\" Then m_URL = m_URL & "\"
    NormalizarURLFolder = m_URL
End Function

Private Sub AppendInfraDiag(ByRef p_Diag As String, ByVal p_Field As String, ByVal p_Ruta As String, ByVal p_Causa As String)
    Dim m_Causa As String
    Dim m_Linea As String

    m_Causa = Replace$(Replace$(Trim$(Nz(p_Causa, "")), vbCr, " "), vbLf, " ")
    m_Linea = "- Campo=" & p_Field & "; Ruta=" & p_Ruta & "; Causa=" & m_Causa
    If p_Diag = "" Then
        p_Diag = m_Linea
    Else
        p_Diag = p_Diag & vbNewLine & m_Linea
    End If
End Sub


Public Property Get URLArchivoCSS() As String
    
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLArchivoCSS <> "" Then
        URLArchivoCSS = m_sURLArchivoCSS
        Exit Property
    End If
    m_sURLArchivoCSS = Me.URLDirRecursos & "css.txt"
    If Not fso.FileExists(m_sURLArchivoCSS) Then
        m_sURLArchivoCSS = Me.URLDirectorioAplicaciones & "css.txt"
        If Not fso.FileExists(m_sURLArchivoCSS) Then
             m_Error = "No es alcanzable URLArchivoCSS "
            Err.Raise 1000
        End If
    End If
    
   
    
    URLArchivoCSS = m_sURLArchivoCSS
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLArchivoCSS ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Get URLArchivoCSS1() As String
    
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLArchivoCSS1 <> "" Then
        URLArchivoCSS1 = m_sURLArchivoCSS1
        Exit Property
    End If
    m_sURLArchivoCSS1 = Me.URLDirRecursos & "css2.css"
    If Not fso.FileExists(m_sURLArchivoCSS1) Then
        m_sURLArchivoCSS1 = Me.URLDirectorioAplicaciones & "css2.css"
        If Not fso.FileExists(m_sURLArchivoCSS1) Then
             m_Error = "No es alcanzable URLArchivoCSS1 "
            Err.Raise 1000
        End If
    End If
    
   
    
    URLArchivoCSS1 = m_sURLArchivoCSS1
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLArchivoCSS1 ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Get URLAyudaIndicadores() As String
    
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLAyudaIndicadores <> "" Then
        URLAyudaIndicadores = m_sURLAyudaIndicadores
        Exit Property
    End If
    m_sURLAyudaIndicadores = Me.URLDirRecursos & "Plantillas\Indicadores.html"
    If Not fso.FileExists(m_sURLAyudaIndicadores) Then
        m_Error = "No es alcanzable URLAyudaIndicadores "
        Err.Raise 1000
        
    End If
    
   
    
    URLAyudaIndicadores = m_sURLAyudaIndicadores
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLAyudaIndicadores ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Get ColAdministradores() As Scripting.Dictionary

    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColAdministradores Is Nothing Then
        Set ColAdministradores = m_objColAdministradores
        Exit Property
    End If
    
    Avance "Usuarios Administradores"
    Set m_objColAdministradores = constructor.getListaUsuarios(EnumTipoUsuario.Administrador, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColAdministradores = m_objColAdministradores
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColAdministradores ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property
Public Property Get Expedientes() As Scripting.Dictionary

    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objExpedientes Is Nothing Then
        Set Expedientes = m_objExpedientes
        Exit Property
    End If
    
   
    Set m_objExpedientes = constructor.getExpedientes(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Expedientes = m_objExpedientes
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.Expedientes ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property
Public Property Get ColUsuariosCalidad() As Scripting.Dictionary

    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    Avance "Usuarios Calidad"
    If Not m_objColUsuariosCalidad Is Nothing Then
        Set ColUsuariosCalidad = m_objColUsuariosCalidad
        Exit Property
    End If
    Set m_objColUsuariosCalidad = constructor.getUsuariosCalidad(p_Error:=m_Error)
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

Public Property Get CadenaCorreosCalidad() As String
    
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_Usuario As usuario
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sCadenaCorreosCalidad <> "" Then
        CadenaCorreosCalidad = m_sCadenaCorreosCalidad
        Exit Property
    End If
    Set m_Col = Me.ColUsuariosCalidad
    m_Error = Me.Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        m_Error = "No hay ningún usuario marcado como calidad"
        Err.Raise 1000
    End If
    For Each m_ID In m_Col
        Set m_Usuario = m_Col(m_ID)
        If InStr(1, m_Usuario.CorreoUsuario, "@") <> 0 Then
            If m_sCadenaCorreosCalidad = "" Then
                m_sCadenaCorreosCalidad = m_Usuario.CorreoUsuario
            Else
                m_sCadenaCorreosCalidad = m_sCadenaCorreosCalidad & ";" & m_Usuario.CorreoUsuario
            End If
        End If
        Set m_Usuario = Nothing
    Next
    If m_sCadenaCorreosCalidad = "" Then
        m_Error = "No hay ningún usuario marcado como calidad que tenga correo"
        Err.Raise 1000
    End If
    CadenaCorreosCalidad = m_sCadenaCorreosCalidad
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.CadenaCorreosCalidad ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Let CadenaCorreosCalidad(p_Valor As String)
    
    m_sCadenaCorreosCalidad = ""
End Property
Public Property Get CadenaCorreosCalidadEnPruebas() As String
    
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sCadenaCorreosCalidadEnPruebas <> "" Then
        CadenaCorreosCalidadEnPruebas = m_sCadenaCorreosCalidadEnPruebas
        Exit Property
    End If
    
    m_sCadenaCorreosCalidadEnPruebas = Application.TempVars("CadenaCorreosCalidadEnPruebas")
    
  
    CadenaCorreosCalidadEnPruebas = m_sCadenaCorreosCalidadEnPruebas
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.CadenaCorreosCalidadEnPruebas ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property
Public Property Get VersionAplicacion() As String

    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sVersionAplicacion <> "" Then
        VersionAplicacion = m_sVersionAplicacion
        Exit Property
    End If
    m_sVersionAplicacion = LeerIni("VersionAplicacion", "", m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    VersionAplicacion = m_sVersionAplicacion
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.VersionAplicacion  ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property



Public Property Get URLDirectorioDocumentacion() As String
    
    Dim m_URLDirAplicacion As String
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sURLDirectorioDocumentacion <> "" Then
        URLDirectorioDocumentacion = m_sURLDirectorioDocumentacion
        Exit Property
    End If
    m_URLDirAplicacion = Me.URLDirAplicacion
    m_Error = Me.Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    m_sURLDirectorioDocumentacion = m_URLDirAplicacion & "Anexos\"
    If FormatoCorrectoURL(m_sURLDirectorioDocumentacion) = EnumSino.No Then
        m_Error = "No es alcanzable el archivo URLDirectorioDocumentacion" & vbNewLine & m_sURLDirectorioDocumentacion
        Err.Raise 1000
    End If
    If Not fso.FolderExists(m_sURLDirectorioDocumentacion) Then
        m_Error = "No es alcanzable URLDirectorioDocumentacion " & m_sURLDirectorioDocumentacion
        m_sURLDirectorioDocumentacion = ""
        Err.Raise 1000
    End If
    URLDirectorioDocumentacion = m_sURLDirectorioDocumentacion
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLDirectorioDocumentacion ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property
Public Property Get URLDirectorioPlantillas() As String
    
    Dim m_URLDirRecursos As String
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sURLDirectorioPlantillas <> "" Then
        URLDirectorioPlantillas = m_sURLDirectorioPlantillas
        Exit Property
    End If
    m_URLDirRecursos = Me.URLDirRecursos
    m_Error = Me.Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    m_sURLDirectorioPlantillas = m_URLDirRecursos & "Plantillas\"
    If FormatoCorrectoURL(m_sURLDirectorioPlantillas) = EnumSino.No Then
        m_Error = "No es alcanzable el archivo URLDirectorioPlantillas" & vbNewLine & m_sURLDirectorioPlantillas
        Err.Raise 1000
    End If
    If Not fso.FolderExists(m_sURLDirectorioPlantillas) Then
        m_Error = "No es alcanzable URLDirectorioPlantillas " & m_sURLDirectorioPlantillas
        m_sURLDirectorioPlantillas = ""
        Err.Raise 1000
    End If
    URLDirectorioPlantillas = m_sURLDirectorioPlantillas
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLDirectorioPlantillas ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property
Public Property Get URLDirectorioDocumentacionAuditorias() As String
    
    Dim m_URLDirAplicacion As String
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sURLDirectorioDocumentacionAuditorias <> "" Then
        URLDirectorioDocumentacionAuditorias = m_sURLDirectorioDocumentacionAuditorias
        Exit Property
    End If
    m_URLDirAplicacion = Me.URLDirAplicacion
    m_Error = Me.Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    m_sURLDirectorioDocumentacionAuditorias = m_URLDirAplicacion & "Anexos Auditorias\"
    If FormatoCorrectoURL(m_sURLDirectorioDocumentacionAuditorias) = EnumSino.No Then
        m_Error = "No es alcanzable el archivo URLDirectorioDocumentacionAuditorias" & vbNewLine & m_sURLDirectorioDocumentacionAuditorias
        Err.Raise 1000
    End If
    If Not fso.FolderExists(m_sURLDirectorioDocumentacionAuditorias) Then
        m_Error = "No es alcanzable URLDirectorioDocumentacionAuditorias " & m_sURLDirectorioDocumentacionAuditorias
        m_sURLDirectorioDocumentacionAuditorias = ""
        Err.Raise 1000
    End If
    URLDirectorioDocumentacionAuditorias = m_sURLDirectorioDocumentacionAuditorias
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLDirectorioDocumentacionAuditorias ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property




Public Property Get URLDirectorioLocal() As String
    
    Dim m_URLDirectorioAplicaciones As String
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sURLDirectorioLocal <> "" Then
        URLDirectorioLocal = m_sURLDirectorioLocal
        Exit Property
    End If
   
    m_URLDirectorioAplicaciones = Environ("APPDATA") & "\" & "Aplicaciones DYSN\"
    If Not fso.FolderExists(m_URLDirectorioAplicaciones) Then
        fso.CreateFolder m_URLDirectorioAplicaciones
    End If
    m_sURLDirectorioLocal = m_URLDirectorioAplicaciones & "No Conformidades\"
    
    
    If Not fso.FolderExists(m_sURLDirectorioLocal) Then
        fso.CreateFolder m_sURLDirectorioLocal
    End If
    URLDirectorioLocal = m_sURLDirectorioLocal
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLDirectorioLocal ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get URLDirectorioInformesLocal() As String
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sURLDirectorioInformesLocal <> "" Then
        URLDirectorioInformesLocal = m_sURLDirectorioInformesLocal
        Exit Property
    End If
    m_sURLDirectorioInformesLocal = Me.URLDirectorioLocal & "Informes\"
   
    
    
    If Not fso.FolderExists(m_sURLDirectorioInformesLocal) Then
        fso.CreateFolder m_sURLDirectorioInformesLocal
    Else
        BorrarContenidoCarpeta m_sURLDirectorioInformesLocal
    End If
    URLDirectorioInformesLocal = m_sURLDirectorioInformesLocal
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLDirectorioInformesLocal ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get URLDirectorioDocumentacionAyuda() As String
    
    Dim m_URLDirDocumentacion As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sURLDirectorioDocumentacionAyuda <> "" Then
        URLDirectorioDocumentacionAyuda = m_sURLDirectorioDocumentacionAyuda
        Exit Property
    End If
    m_URLDirDocumentacion = Me.URLDirectorioDocumentacion
    m_Error = Me.Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    m_sURLDirectorioDocumentacionAyuda = m_URLDirDocumentacion & "Doc Ayuda\"
    If FormatoCorrectoURL(m_sURLDirectorioDocumentacionAyuda) = EnumSino.No Then
        m_Error = "No es alcanzable el archivo URLDirectorioDocumentacionAyuda" & vbNewLine & m_sURLDirectorioDocumentacionAyuda
        Err.Raise 1000
    End If
    If Not fso.FolderExists(m_sURLDirectorioDocumentacionAyuda) Then
        m_Error = "No es alcanzable URLDirectorioDocumentacionAyuda " & m_sURLDirectorioDocumentacionAyuda
        m_sURLDirectorioDocumentacionAyuda = ""
        Err.Raise 1000
    End If
    URLDirectorioDocumentacionAyuda = m_sURLDirectorioDocumentacionAyuda
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLDirectorioDocumentacionAyuda ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property



Public Property Get URLDirRecursos() As String
    
    Dim m_URLDirAplicacion As String
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    If m_sURLDirRecursos <> "" Then
        URLDirRecursos = m_sURLDirRecursos
        Exit Property
    End If
    m_URLDirAplicacion = Me.URLDirAplicacion
    m_Error = Me.Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    m_sURLDirRecursos = m_URLDirAplicacion & "recursos\"
    If FormatoCorrectoURL(m_sURLDirRecursos) = EnumSino.No Then
        m_Error = "No es alcanzable el archivo URLDirRecursos" & vbNewLine & m_sURLDirRecursos
        Err.Raise 1000
    End If
    If Not fso.FolderExists(m_sURLDirRecursos) Then
        m_Error = "No es alcanzable m_sURLDirRecursos" & vbNewLine & m_sURLDirRecursos
        m_sURLDirRecursos = ""
        Err.Raise 1000
    End If
    URLDirRecursos = m_sURLDirRecursos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.URLDirRecursos  ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property





Public Property Get ColEstadosNC() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjColEstadosNC Is Nothing Then
        Set ColEstadosNC = m_ObjColEstadosNC
        Exit Property
    End If
    Set m_ObjColEstadosNC = New Scripting.Dictionary
    m_ObjColEstadosNC.CompareMode = TextCompare
    With m_ObjColEstadosNC
        .Add CStr(EnumEstadoNC.BORRADA), "BORRADA"
        .Add CStr(EnumEstadoNC.REGISTRADA), "REGISTRADA"
        .Add CStr(EnumEstadoNC.PLANIFICADA), "PLANIFICADA"
        .Add CStr(EnumEstadoNC.ENEJECUCION), "ENEJECUCION"
        .Add CStr(EnumEstadoNC.ENEJECUCIONFUERADEPLAZO), "ENEJECUCIONFUERADEPLAZO"
        .Add CStr(EnumEstadoNC.ACSSINTAREAS), "ACSSINTAREAS"
        .Add CStr(EnumEstadoNC.Cerrada), "Cerrada"
        .Add CStr(EnumEstadoNC.CERRADAPTECE), "CERRADAPTECE"
        .Add CStr(EnumEstadoNC.CERRADAPTECECADUCADA), "CERRADAPTECECADUCADA"
        .Add CStr(EnumEstadoNC.CERRADACENOCONFORME), "CERRADACENOCONFORME"
    End With
    Set ColEstadosNC = m_ObjColEstadosNC
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColEstadosNC ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ColEstadosNCTexto() As Scripting.Dictionary
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjColEstadosNCTexto Is Nothing Then
        Set ColEstadosNCTexto = m_ObjColEstadosNCTexto
        Exit Property
    End If
    Set m_ObjColEstadosNCTexto = New Scripting.Dictionary
    m_ObjColEstadosNCTexto.CompareMode = TextCompare
    With m_ObjColEstadosNCTexto
        .Add "BORRADA", EnumEstadoNC.BORRADA
        .Add "REGISTRADA", EnumEstadoNC.REGISTRADA 'aún sin acciones
        .Add "PLANIFICADA", EnumEstadoNC.PLANIFICADA 'todas las acciones sin fecha
        .Add "ENEJECUCION", EnumEstadoNC.ENEJECUCION
        .Add "ENEJECUCIONFUERADEPLAZO", EnumEstadoNC.ENEJECUCIONFUERADEPLAZO
        .Add "ACSSINTAREAS", EnumEstadoNC.ACSSINTAREAS
        .Add "Cerrada", EnumEstadoNC.Cerrada
        .Add "CERRADAPTECE", EnumEstadoNC.CERRADAPTECE
        .Add "CERRADAPTECECADUCADA", EnumEstadoNC.CERRADAPTECECADUCADA
        .Add "CERRADACENOCONFORME", EnumEstadoNC.CERRADACENOCONFORME
    End With
    Set ColEstadosNCTexto = m_ObjColEstadosNCTexto
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColEstadosNCTexto ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get ColEstadosNCTitulo() As Scripting.Dictionary
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objColEstadosNCTitulo Is Nothing Then
        Set ColEstadosNCTitulo = m_objColEstadosNCTitulo
        Exit Property
    End If
    Set m_objColEstadosNCTitulo = New Scripting.Dictionary
    With m_objColEstadosNCTitulo
        .CompareMode = TextCompare
        .Add CStr(EnumEstadoNC.BORRADA), "Borrada"
        .Add CStr(EnumEstadoNC.REGISTRADA), "Registrada"
        .Add CStr(EnumEstadoNC.PLANIFICADA), "Planificada"
        .Add CStr(EnumEstadoNC.ENEJECUCION), "En ejecución"
        .Add CStr(EnumEstadoNC.ENEJECUCIONFUERADEPLAZO), "En ejecución fuera de plazo"
        .Add CStr(EnumEstadoNC.ACSSINTAREAS), "Acciones sin tareas"
        .Add CStr(EnumEstadoNC.Cerrada), "Cerrada"
        .Add CStr(EnumEstadoNC.CERRADAPTECE), "Cerrada Pendiente de control de eficacia"
        .Add CStr(EnumEstadoNC.CERRADAPTECECADUCADA), "Cerrada Pendiente de control de eficacia caducada"
        .Add CStr(EnumEstadoNC.CERRADACENOCONFORME), "Cerrada con Control de eficacia no conforme"
    End With
    Set ColEstadosNCTitulo = m_objColEstadosNCTitulo
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColEstadosNCTitulo ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ColNCsProyecto() As Scripting.Dictionary
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objColNCsProyecto Is Nothing Then
        Set ColNCsProyecto = m_objColNCsProyecto
        Exit Property
    End If
    Set m_objColNCsProyecto = constructor.getNCsProyecto(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColNCsProyecto = m_objColNCsProyecto
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColNCsProyecto ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ColNCsProyecto(ByVal objNewValue As Variant)

    Set m_objColNCsProyecto = objNewValue
    
End Property

Public Property Get ColNCsAuditoria() As Scripting.Dictionary
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objColNCsAuditoria Is Nothing Then
        Set ColNCsAuditoria = m_objColNCsAuditoria
        Exit Property
    End If
    Set m_objColNCsAuditoria = constructor.getNCsDeAuditoria(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColNCsAuditoria = m_objColNCsAuditoria
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColNCsAuditoria ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ColNCsAuditoria(ByVal objNewValue As Variant)

    Set m_objColNCsAuditoria = objNewValue
    
End Property
Public Property Get ColJuridicasDistintas() As Scripting.Dictionary
    
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_ObjColJuridicasDistintas Is Nothing Then
        Set ColJuridicasDistintas = m_ObjColJuridicasDistintas
        Exit Property
    End If
    Set m_ObjColJuridicasDistintas = constructor.getJuridicasDistintas(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set ColJuridicasDistintas = m_ObjColJuridicasDistintas
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColJuridicasDistintas ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ColJuridicasDistintas(ByVal objNewValue As Variant)

    Set m_ObjColJuridicasDistintas = objNewValue

End Property



Public Property Get ColJefesProyecto() As Scripting.Dictionary
   
    Dim m_ID As Variant
    Dim m_Usuario As usuario
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objColJefesProyecto Is Nothing Then
        Set ColJefesProyecto = m_objColJefesProyecto
        Exit Property
    End If
    Set m_objColJefesProyecto = constructor.getJefesProyecto(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not Me.ColUsuariosCalidad Is Nothing Then
        For Each m_ID In Me.ColUsuariosCalidad
            Set m_Usuario = Me.ColUsuariosCalidad(m_ID)
            If m_objColJefesProyecto Is Nothing Then
                Set m_objColJefesProyecto = New Scripting.Dictionary
                m_objColJefesProyecto.CompareMode = TextCompare
            End If
            If Not m_objColJefesProyecto.Exists(m_Usuario.UsuarioRed) Then
                m_objColJefesProyecto.Add m_Usuario.UsuarioRed, m_Usuario
            End If
            Set m_Usuario = Nothing
        Next
    End If
    Set ColJefesProyecto = m_objColJefesProyecto
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColJefesProyecto ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get ColAuditoriaSegTareas() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objColAuditoriaSegTareas Is Nothing Then
        Set ColAuditoriaSegTareas = m_objColAuditoriaSegTareas
        Exit Property
    End If
    Set m_objColAuditoriaSegTareas = constructor.getARsAuditoriaSeguimiento(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColAuditoriaSegTareas = m_objColAuditoriaSegTareas
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColAuditoriaSegTareas ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColAuditoriaSegTareas(ByVal objNewValue As Variant)

    Set m_objColAuditoriaSegTareas = objNewValue

End Property
Public Property Get ColAuditoriaSegTareasActivas() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objColAuditoriaSegTareasActivas Is Nothing Then
        Set ColAuditoriaSegTareasActivas = m_objColAuditoriaSegTareasActivas
        Exit Property
    End If
    Set m_objColAuditoriaSegTareasActivas = constructor.getARsAuditoriaSeguimientoActivas(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColAuditoriaSegTareasActivas = m_objColAuditoriaSegTareasActivas
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColAuditoriaSegTareasActivas ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColAuditoriaSegTareasActivas(ByVal objNewValue As Variant)

    Set m_objColAuditoriaSegTareasActivas = objNewValue

End Property
Public Property Get ColAuditoriaSegNC() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objColAuditoriaSegNC Is Nothing Then
        Set ColAuditoriaSegNC = m_objColAuditoriaSegNC
        Exit Property
    End If
    Set m_objColAuditoriaSegNC = constructor.getNCsAuditoriaSeguimiento(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColAuditoriaSegNC = m_objColAuditoriaSegNC
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColAuditoriaSegNC ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColAuditoriaSegNC(ByVal objNewValue As Variant)

    Set m_objColAuditoriaSegNC = objNewValue

End Property
Public Property Get ColProyectoSegTareas() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objColProyectoSegTareas Is Nothing Then
        Set ColProyectoSegTareas = m_objColProyectoSegTareas
        Exit Property
    End If
    Set m_objColProyectoSegTareas = constructor.getARsProyectoSeguimiento(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColProyectoSegTareas = m_objColProyectoSegTareas
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColProyectoSegTareas ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColProyectoSegTareas(ByVal objNewValue As Variant)

    Set m_objColProyectoSegTareas = objNewValue

End Property

Public Property Get ColProyectoSegNC() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objColProyectoSegNC Is Nothing Then
        Set ColProyectoSegNC = m_objColProyectoSegNC
        Exit Property
    End If
    Set m_objColProyectoSegNC = constructor.getNCsProyectoSeguimiento(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColProyectoSegNC = m_objColProyectoSegNC
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColProyectoSegNC ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColProyectoSegNC(ByVal objNewValue As Variant)

    Set m_objColProyectoSegNC = objNewValue

End Property
Public Property Get ColSegsTareasProyecto() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objColSegsTareasProyecto Is Nothing Then
        Set ColSegsTareasProyecto = m_objColSegsTareasProyecto
        Exit Property
    End If
    Set m_objColSegsTareasProyecto = constructor.getSegsTareasProyecto(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColSegsTareasProyecto = m_objColSegsTareasProyecto
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColSegsTareasProyecto ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColSegsTareasProyecto(ByVal objNewValue As Variant)

    Set m_objColSegsTareasProyecto = objNewValue

End Property
Public Property Get ColSegsTareasProyectoActivas() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objColSegsTareasProyectoActivas Is Nothing Then
        Set ColSegsTareasProyectoActivas = m_objColSegsTareasProyectoActivas
        Exit Property
    End If
    Set m_objColSegsTareasProyectoActivas = constructor.getSegsTareasProyectoActivas(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColSegsTareasProyectoActivas = m_objColSegsTareasProyectoActivas
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColSegsTareasProyectoActivas ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColSegsTareasProyectoActivas(ByVal objNewValue As Variant)

    Set m_objColSegsTareasProyectoActivas = objNewValue

End Property
Public Property Get ColSegsTareasProyectoPteReplanificar() As Scripting.Dictionary
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    ' Check module-level cache first
    Dim m_Cached As Scripting.Dictionary
    Set m_Cached = Cache_Indicadores_Proyecto(BUCKET_TAR_PROY_PTE_REPLAN, p_Reset:=False, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_Cached Is Nothing Then
        Set m_objColSegsTareasProyectoPteReplanificar = m_Cached
    End If
    If Not m_objColSegsTareasProyectoPteReplanificar Is Nothing Then
        Set ColSegsTareasProyectoPteReplanificar = m_objColSegsTareasProyectoPteReplanificar
        Exit Property
    End If
    Set m_objColSegsTareasProyectoPteReplanificar = constructor.getSegsTareasProyectoPteReplanificar(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    ' Store in module cache
    Call Cache_Indicadores_Proyecto(BUCKET_TAR_PROY_PTE_REPLAN, p_Reset:=True, p_Error:=m_Error)
    Set ColSegsTareasProyectoPteReplanificar = m_objColSegsTareasProyectoPteReplanificar
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColSegsTareasProyectoPteReplanificar ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColSegsTareasProyectoPteReplanificar(ByVal objNewValue As Variant)

    Set m_objColSegsTareasProyectoPteReplanificar = objNewValue

End Property


Public Property Get ColSegsNCProyectoRegistradas() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    ' Check module-level cache first
    Dim m_Cached As Scripting.Dictionary
    Set m_Cached = Cache_Indicadores_Proyecto(BUCKET_NC_PROY_REGISTRADAS, p_Reset:=False, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_Cached Is Nothing Then
        Set m_objColSegsNCProyectoRegistradas = m_Cached
    End If
    If Not m_objColSegsNCProyectoRegistradas Is Nothing Then
        Set ColSegsNCProyectoRegistradas = m_objColSegsNCProyectoRegistradas
        Exit Property
    End If
    Set m_objColSegsNCProyectoRegistradas = constructor.getSegsNCProyectoRegistradas(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    ' Store in module cache
    Call Cache_Indicadores_Proyecto(BUCKET_NC_PROY_REGISTRADAS, p_Reset:=True, p_Error:=m_Error)
    Set ColSegsNCProyectoRegistradas = m_objColSegsNCProyectoRegistradas
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColSegsNCProyectoRegistradas ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColSegsNCProyectoRegistradas(ByVal objNewValue As Variant)

    Set m_objColSegsNCProyectoRegistradas = objNewValue

End Property
Public Property Get ColSegsNCProyectoTotales() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objColSegsNCProyectoTotales Is Nothing Then
        Set ColSegsNCProyectoTotales = m_objColSegsNCProyectoTotales
        Exit Property
    End If
    Set m_objColSegsNCProyectoTotales = constructor.getSegsNCProyectoTotales(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColSegsNCProyectoTotales = m_objColSegsNCProyectoTotales
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColSegsNCProyectoTotales ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColSegsNCProyectoTotales(ByVal objNewValue As Variant)

    Set m_objColSegsNCProyectoTotales = objNewValue

End Property
Public Property Get ColSegsNCProyectoAccionesSinTareas() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    ' Check module-level cache first
    Dim m_Cached As Scripting.Dictionary
    Set m_Cached = Cache_Indicadores_Proyecto(BUCKET_NC_PROY_SIN_TAREAS, p_Reset:=False, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_Cached Is Nothing Then
        Set m_objColSegsNCProyectoAccionesSinTareas = m_Cached
    End If
    If Not m_objColSegsNCProyectoAccionesSinTareas Is Nothing Then
        Set ColSegsNCProyectoAccionesSinTareas = m_objColSegsNCProyectoAccionesSinTareas
        Exit Property
    End If
    Set m_objColSegsNCProyectoAccionesSinTareas = constructor.getSegsNCProyectoAccionesSinTareas(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    ' Store in module cache
    Call Cache_Indicadores_Proyecto(BUCKET_NC_PROY_SIN_TAREAS, p_Reset:=True, p_Error:=m_Error)
    Set ColSegsNCProyectoAccionesSinTareas = m_objColSegsNCProyectoAccionesSinTareas
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColSegsNCProyectoAccionesSinTareas ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColSegsNCProyectoAccionesSinTareas(ByVal objNewValue As Variant)

    Set m_objColSegsNCProyectoAccionesSinTareas = objNewValue

End Property
Public Property Get ColSegsNCProyectoPteCE() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    ' Check module-level cache first
    Dim m_Cached As Scripting.Dictionary
    Set m_Cached = Cache_Indicadores_Proyecto(BUCKET_NC_PROY_PTE_CE, p_Reset:=False, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_Cached Is Nothing Then
        Set m_objColSegsNCProyectoPteCE = m_Cached
    End If
    If Not m_objColSegsNCProyectoPteCE Is Nothing Then
        Set ColSegsNCProyectoPteCE = m_objColSegsNCProyectoPteCE
        Exit Property
    End If
    Set m_objColSegsNCProyectoPteCE = constructor.getSegsNCProyectoPteCE(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    ' Store in module cache
    Call Cache_Indicadores_Proyecto(BUCKET_NC_PROY_PTE_CE, p_Reset:=True, p_Error:=m_Error)
    Set ColSegsNCProyectoPteCE = m_objColSegsNCProyectoPteCE
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColSegsNCProyectoPteCE ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColSegsNCProyectoPteCE(ByVal objNewValue As Variant)

    Set m_objColSegsNCProyectoPteCE = objNewValue

End Property
Public Property Get ColSegsNCProyectoCECaducada() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    ' Check module-level cache first
    Dim m_Cached As Scripting.Dictionary
    Set m_Cached = Cache_Indicadores_Proyecto(BUCKET_NC_PROY_CE_CADUCADA, p_Reset:=False, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_Cached Is Nothing Then
        Set m_objColSegsNCProyectoCECaducada = m_Cached
    End If
    If Not m_objColSegsNCProyectoCECaducada Is Nothing Then
        Set ColSegsNCProyectoCECaducada = m_objColSegsNCProyectoCECaducada
        Exit Property
    End If
    Set m_objColSegsNCProyectoCECaducada = constructor.getSegsNCProyectoCECaducada(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    ' Store in module cache
    Call Cache_Indicadores_Proyecto(BUCKET_NC_PROY_CE_CADUCADA, p_Reset:=True, p_Error:=m_Error)
    Set ColSegsNCProyectoCECaducada = m_objColSegsNCProyectoCECaducada
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColSegsNCProyectoCECaducada ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColSegsNCProyectoCECaducada(ByVal objNewValue As Variant)

    Set m_objColSegsNCProyectoCECaducada = objNewValue

End Property

Public Property Get ColSegsNCProyectoCENoConforme() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    ' Check module-level cache first
    Dim m_Cached As Scripting.Dictionary
    Set m_Cached = Cache_Indicadores_Proyecto(BUCKET_NC_PROY_CE_NO_CONFORME, p_Reset:=False, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_Cached Is Nothing Then
        Set m_objColSegsNCProyectoCENoConforme = m_Cached
    End If
    If Not m_objColSegsNCProyectoCENoConforme Is Nothing Then
        Set ColSegsNCProyectoCENoConforme = m_objColSegsNCProyectoCENoConforme
        Exit Property
    End If
    Set m_objColSegsNCProyectoCENoConforme = constructor.getSegsNCProyectoCENoConforme(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    ' Store in module cache
    Call Cache_Indicadores_Proyecto(BUCKET_NC_PROY_CE_NO_CONFORME, p_Reset:=True, p_Error:=m_Error)
    Set ColSegsNCProyectoCENoConforme = m_objColSegsNCProyectoCENoConforme
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColSegsNCProyectoCENoConforme ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColSegsNCProyectoCENoConforme(ByVal objNewValue As Variant)

    Set m_objColSegsNCProyectoCENoConforme = objNewValue

End Property
Public Property Get ColSegsTareasAuditoriaTotales() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objColSegsTareasAuditoriaTotales Is Nothing Then
        Set ColSegsTareasAuditoriaTotales = m_objColSegsTareasAuditoriaTotales
        Exit Property
    End If
    Set m_objColSegsTareasAuditoriaTotales = constructor.getSegsTareasAuditoriaTotales(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColSegsTareasAuditoriaTotales = m_objColSegsTareasAuditoriaTotales
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColSegsTareasAuditoriaTotales ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColSegsTareasAuditoriaTotales(ByVal objNewValue As Variant)

    Set m_objColSegsTareasAuditoriaTotales = objNewValue

End Property
Public Property Get ColSegsTareasAuditoriaActivas() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objColSegsTareasAuditoriaActivas Is Nothing Then
        Set ColSegsTareasAuditoriaActivas = m_objColSegsTareasAuditoriaActivas
        Exit Property
    End If
    Set m_objColSegsTareasAuditoriaActivas = constructor.getSegsTareasAuditoriaActivas(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColSegsTareasAuditoriaActivas = m_objColSegsTareasAuditoriaActivas
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColSegsTareasAuditoriaActivas ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColSegsTareasAuditoriaActivas(ByVal objNewValue As Variant)

    Set m_objColSegsTareasAuditoriaActivas = objNewValue

End Property
Public Property Get ColSegsTareasAuditoriaPteReplanificar() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    ' Check module-level cache first
    Dim m_Cached As Scripting.Dictionary
    Set m_Cached = Cache_Indicadores_Auditoria(BUCKET_TAR_AUD_PTE_REPLAN, p_Reset:=False, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_Cached Is Nothing Then
        Set m_objColSegsTareasAuditoriaPteReplanificar = m_Cached
    End If
    If Not m_objColSegsTareasAuditoriaPteReplanificar Is Nothing Then
        Set ColSegsTareasAuditoriaPteReplanificar = m_objColSegsTareasAuditoriaPteReplanificar
        Exit Property
    End If
    Set m_objColSegsTareasAuditoriaPteReplanificar = constructor.getSegsTareasAuditoriaPteReplanificar(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    ' Store in module cache
    Call Cache_Indicadores_Auditoria(BUCKET_TAR_AUD_PTE_REPLAN, p_Reset:=True, p_Error:=m_Error)
    Set ColSegsTareasAuditoriaPteReplanificar = m_objColSegsTareasAuditoriaPteReplanificar
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColSegsTareasAuditoriaPteReplanificar ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColSegsTareasAuditoriaPteReplanificar(ByVal objNewValue As Variant)

    Set m_objColSegsTareasAuditoriaPteReplanificar = objNewValue

End Property
Public Property Get ColSegsTareasAuditoriaIrregulares() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objColSegsTareasAuditoriaIrregulares Is Nothing Then
        Set ColSegsTareasAuditoriaIrregulares = m_objColSegsTareasAuditoriaIrregulares
        Exit Property
    End If
    Set m_objColSegsTareasAuditoriaIrregulares = constructor.getSegsTareasAuditoriaIrregulares(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColSegsTareasAuditoriaIrregulares = m_objColSegsTareasAuditoriaIrregulares
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColSegsTareasAuditoriaIrregulares ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColSegsTareasAuditoriaIrregulares(ByVal objNewValue As Variant)

    Set m_objColSegsTareasAuditoriaIrregulares = objNewValue

End Property
Public Property Get ColSegsNCAuditoriaRegistradas() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    ' Check module-level cache first
    Dim m_Cached As Scripting.Dictionary
    Set m_Cached = Cache_Indicadores_Auditoria(BUCKET_NC_AUD_REGISTRADAS, p_Reset:=False, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_Cached Is Nothing Then
        Set m_objColSegsNCAuditoriaRegistradas = m_Cached
    End If
    If Not m_objColSegsNCAuditoriaRegistradas Is Nothing Then
        Set ColSegsNCAuditoriaRegistradas = m_objColSegsNCAuditoriaRegistradas
        Exit Property
    End If
    Set m_objColSegsNCAuditoriaRegistradas = constructor.getSegsNCAuditoriaRegistradas(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    ' Store in module cache
    Call Cache_Indicadores_Auditoria(BUCKET_NC_AUD_REGISTRADAS, p_Reset:=True, p_Error:=m_Error)
    Set ColSegsNCAuditoriaRegistradas = m_objColSegsNCAuditoriaRegistradas
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColSegsNCAuditoriaRegistradas ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColSegsNCAuditoriaRegistradas(ByVal objNewValue As Variant)

    Set m_objColSegsNCAuditoriaRegistradas = objNewValue

End Property
Public Property Get ColSegsNCAuditoriaTotales() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objColSegsNCAuditoriaTotales Is Nothing Then
        Set ColSegsNCAuditoriaTotales = m_objColSegsNCAuditoriaTotales
        Exit Property
    End If
    Set m_objColSegsNCAuditoriaTotales = constructor.getSegsNCAuditoriaTotales(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColSegsNCAuditoriaTotales = m_objColSegsNCAuditoriaTotales
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColSegsNCAuditoriaTotales ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColSegsNCAuditoriaTotales(ByVal objNewValue As Variant)

    Set m_objColSegsNCAuditoriaTotales = objNewValue

End Property
Public Property Get ColSegsNCAuditoriaAccionesSinTareas() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    ' Check module-level cache first
    Dim m_Cached As Scripting.Dictionary
    Set m_Cached = Cache_Indicadores_Auditoria(BUCKET_NC_AUD_SIN_TAREAS, p_Reset:=False, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_Cached Is Nothing Then
        Set m_objColSegsNCAuditoriaAccionesSinTareas = m_Cached
    End If
    If Not m_objColSegsNCAuditoriaAccionesSinTareas Is Nothing Then
        Set ColSegsNCAuditoriaAccionesSinTareas = m_objColSegsNCAuditoriaAccionesSinTareas
        Exit Property
    End If
    Set m_objColSegsNCAuditoriaAccionesSinTareas = constructor.getSegsNCAuditoriaAccionesSinTareas(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    ' Store in module cache
    Call Cache_Indicadores_Auditoria(BUCKET_NC_AUD_SIN_TAREAS, p_Reset:=True, p_Error:=m_Error)
    Set ColSegsNCAuditoriaAccionesSinTareas = m_objColSegsNCAuditoriaAccionesSinTareas
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColSegsNCAuditoriaAccionesSinTareas ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColSegsNCAuditoriaAccionesSinTareas(ByVal objNewValue As Variant)

    Set m_objColSegsNCAuditoriaAccionesSinTareas = objNewValue

End Property
Public Property Get ColSegsNCAuditoriaPteCE() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    ' Check module-level cache first
    Dim m_Cached As Scripting.Dictionary
    Set m_Cached = Cache_Indicadores_Auditoria(BUCKET_NC_AUD_PTE_CE, p_Reset:=False, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_Cached Is Nothing Then
        Set m_objColSegsNCAuditoriaPteCE = m_Cached
    End If
    If Not m_objColSegsNCAuditoriaPteCE Is Nothing Then
        Set ColSegsNCAuditoriaPteCE = m_objColSegsNCAuditoriaPteCE
        Exit Property
    End If
    Set m_objColSegsNCAuditoriaPteCE = constructor.getSegsNCAuditoriaPteCE(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    ' Store in module cache
    Call Cache_Indicadores_Auditoria(BUCKET_NC_AUD_PTE_CE, p_Reset:=True, p_Error:=m_Error)
    Set ColSegsNCAuditoriaPteCE = m_objColSegsNCAuditoriaPteCE
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColSegsNCAuditoriaPteCE ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColSegsNCAuditoriaPteCE(ByVal objNewValue As Variant)

    Set m_objColSegsNCAuditoriaPteCE = objNewValue

End Property
Public Property Get ColSegsNCAuditoriaCECaducada() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    ' Check module-level cache first
    Dim m_Cached As Scripting.Dictionary
    Set m_Cached = Cache_Indicadores_Auditoria(BUCKET_NC_AUD_CE_CADUCADA, p_Reset:=False, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_Cached Is Nothing Then
        Set m_objColSegsNCAuditoriaCECaducada = m_Cached
    End If
    If Not m_objColSegsNCAuditoriaCECaducada Is Nothing Then
        Set ColSegsNCAuditoriaCECaducada = m_objColSegsNCAuditoriaCECaducada
        Exit Property
    End If
    Set m_objColSegsNCAuditoriaCECaducada = constructor.getSegsNCAuditoriaCECaducada(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    ' Store in module cache
    Call Cache_Indicadores_Auditoria(BUCKET_NC_AUD_CE_CADUCADA, p_Reset:=True, p_Error:=m_Error)
    Set ColSegsNCAuditoriaCECaducada = m_objColSegsNCAuditoriaCECaducada
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColSegsNCAuditoriaCECaducada ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColSegsNCAuditoriaCECaducada(ByVal objNewValue As Variant)

    Set m_objColSegsNCAuditoriaCECaducada = objNewValue

End Property
Public Property Get ColSegsNCAuditoriaCENoConforme() As Scripting.Dictionary
   
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    ' Check module-level cache first
    Dim m_Cached As Scripting.Dictionary
    Set m_Cached = Cache_Indicadores_Auditoria(BUCKET_NC_AUD_CE_NO_CONFORME, p_Reset:=False, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_Cached Is Nothing Then
        Set m_objColSegsNCAuditoriaCENoConforme = m_Cached
    End If
    If Not m_objColSegsNCAuditoriaCENoConforme Is Nothing Then
        Set ColSegsNCAuditoriaCENoConforme = m_objColSegsNCAuditoriaCENoConforme
        Exit Property
    End If
    Set m_objColSegsNCAuditoriaCENoConforme = constructor.getSegsNCAuditoriaCENoConforme(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    ' Store in module cache
    Call Cache_Indicadores_Auditoria(BUCKET_NC_AUD_CE_NO_CONFORME, p_Reset:=True, p_Error:=m_Error)
    Set ColSegsNCAuditoriaCENoConforme = m_objColSegsNCAuditoriaCENoConforme
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColSegsNCAuditoriaCENoConforme ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColSegsNCAuditoriaCENoConforme(ByVal objNewValue As Variant)

    Set m_objColSegsNCAuditoriaCENoConforme = objNewValue

End Property
Public Property Get ColTipos() As Scripting.Dictionary
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objColTipos Is Nothing Then
        Set ColTipos = m_objColTipos
        Exit Property
    End If
    Set m_objColTipos = constructor.getTipologiasNCProyecto(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColTipos = m_objColTipos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColTipos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ColTipos(ByVal objNewValue As Variant)

    Set m_objColTipos = objNewValue

End Property
Public Property Get ColAuditorias() As Scripting.Dictionary
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objColAuditorias Is Nothing Then
        Set ColAuditorias = m_objColAuditorias
        Exit Property
    End If
    Set m_objColAuditorias = constructor.getAuditorias(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColAuditorias = m_objColAuditorias
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColAuditorias ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ColAuditorias(ByVal objNewValue As Variant)

    Set m_objColAuditorias = objNewValue

End Property

Public Property Get ColResponsablesImplantacionDistintos() As Scripting.Dictionary
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objColResponsablesImplantacionDistintos Is Nothing Then
        Set ColResponsablesImplantacionDistintos = m_objColResponsablesImplantacionDistintos
        Exit Property
    End If
    Set m_objColResponsablesImplantacionDistintos = constructor.getResponsablesImplantacionDistintos(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColResponsablesImplantacionDistintos = m_objColResponsablesImplantacionDistintos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColResponsablesImplantacionDistintos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set ColResponsablesImplantacionDistintos(ByVal objNewValue As Variant)

    Set m_objColResponsablesImplantacionDistintos = objNewValue

End Property

Public Property Get ColAuditoriasNombres() As Scripting.Dictionary
    Dim m_Col As Scripting.Dictionary
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    Set m_Col = Me.ColAuditorias
    m_Error = Me.Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_objColAuditoriasNombres = constructor.getAuditoriasNombres(p_col:=m_Col, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColAuditoriasNombres = m_objColAuditoriasNombres
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColAuditoriasNombres ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set ColAuditoriasNombres(ByVal objNewValue As Variant)

    Set m_objColAuditoriasNombres = objNewValue

End Property

Public Property Get ColPuntosNormaNCAuditorias() As Scripting.Dictionary

    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_objColPuntosNormaNCAuditorias Is Nothing Then
        Set ColPuntosNormaNCAuditorias = m_objColPuntosNormaNCAuditorias
        Exit Property
    End If
    
    
    Set m_objColPuntosNormaNCAuditorias = constructor.getColPuntosNormaAuditoria(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set ColPuntosNormaNCAuditorias = m_objColPuntosNormaNCAuditorias
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Entorno.ColPuntosNormaNCAuditorias ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property

Public Property Set ColPuntosNormaNCAuditorias(p_Valor As Variant)
    Set m_objColPuntosNormaNCAuditorias = p_Valor
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
        .Add "CSS", ""
        .Add "URLArchivoCSS", ""
        .Add "URLDirectorioAplicaciones", ""
        .Add "URLDirAplicacion", ""
        .Add "ColAdministradores", "o"
        .Add "ColUsuariosCalidad", "o"
        .Add "CadenaCorreosCalidad", ""
        .Add "URLArchivoIni", ""
        .Add "VersionAplicacion", ""
        .Add "URLDirectorioDocumentacion", ""
        .Add "URLDirectorioLocal", ""
        .Add "URLDirectorioInformesLocal", ""
        .Add "URLDirectorioDocumentacionAyuda", ""
        .Add "URLDirRecursos", ""
        .Add "URLDirectorioPlantillas", ""
        .Add "URLPlantillaInformeNCProyecto", ""
        .Add "URLPlantillaInformeNCAuditoria", ""
        .Add "URLDirectorioDocumentacionAuditorias", ""
        .Add "ColEstadosNC", "o"
        .Add "ColEstadosNCTexto", "o"
        .Add "ColEstadosNCTitulo", "o"
        .Add "ColEstadosAC", "o"
        .Add "ColEstadosACTexto", "o"
        .Add "ColEstadosACTitulo", "o"
        .Add "ColEstadosAR", "o"
        .Add "ColEstadosARTexto", "o"
        .Add "ColEstadosARTitulo", "o"
        .Add "ColJuridicasDistintas", "o"
        .Add "CadenaCorreosCalidadEnPruebas", ""
        .Add "ColEnumOrdenOrderBy", "o"
        .Add "ColEnumOrdenTitulo", "o"
        .Add "URLArchivoCSS1", ""
        .Add "URLVideoAyudaNCProyecto", ""
        .Add "URLVideoAyudaNCProyectoParaTecnico", ""
    End With
    Set ColItems = m_objColItems
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El metodo Entorno.m_objColItems ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Function getPropiedad( _
                                    p_NombreCampo As Variant, _
                                    Optional ByRef p_Error As String _
                                    ) As Variant
    
    On Error GoTo errores
    m_Error = ""
    p_Error = ""
    
   
    
    
    If p_NombreCampo = "CSS" Then
        getPropiedad = Me.CSS
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "URLArchivoCSS" Then
        getPropiedad = Me.URLArchivoCSS
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "URLDirectorioAplicaciones" Then
        getPropiedad = Me.URLDirectorioAplicaciones
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "URLDirAplicacion" Then
        getPropiedad = Me.URLDirAplicacion
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "ColAdministradores" Then
        Set getPropiedad = Me.ColAdministradores
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "ColUsuariosCalidad" Then
        Set getPropiedad = Me.ColUsuariosCalidad
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "CadenaCorreosCalidad" Then
        getPropiedad = Me.CadenaCorreosCalidad
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "URLArchivoIni" Then
        getPropiedad = Me.URLArchivoIni
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "VersionAplicacion" Then
        getPropiedad = Me.VersionAplicacion
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    
    If p_NombreCampo = "URLDirectorioDocumentacion" Then
        getPropiedad = Me.URLDirectorioDocumentacion
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "URLDirectorioLocal" Then
        getPropiedad = Me.URLDirectorioLocal
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "URLDirectorioInformesLocal" Then
        getPropiedad = Me.URLDirectorioInformesLocal
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "URLDirectorioDocumentacionAyuda" Then
        getPropiedad = Me.URLDirectorioDocumentacionAyuda
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    
    If p_NombreCampo = "URLDirRecursos" Then
        getPropiedad = Me.URLDirRecursos
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "URLDirectorioPlantillas" Then
        getPropiedad = Me.URLDirectorioPlantillas
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "URLPlantillaInformeNCProyecto" Then
        getPropiedad = Me.URLPlantillaInformeNCProyecto
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "URLPlantillaInformeNCAuditoria" Then
        getPropiedad = Me.URLPlantillaInformeNCAuditoria
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    
    If p_NombreCampo = "URLDirectorioDocumentacionAuditorias" Then
        getPropiedad = Me.URLDirectorioDocumentacionAuditorias
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    
    If p_NombreCampo = "ColEstadosNC" Then
        Set getPropiedad = Me.ColEstadosNC
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "ColEstadosNCTexto" Then
        Set getPropiedad = Me.ColEstadosNCTexto
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "ColEstadosNCTitulo" Then
        Set getPropiedad = Me.ColEstadosNCTitulo
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    
    If p_NombreCampo = "ColEstadosAC" Then
        Set getPropiedad = Me.ColEstadosAC
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "ColEstadosACTexto" Then
        Set getPropiedad = Me.ColEstadosACTexto
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "ColEstadosACTitulo" Then
        Set getPropiedad = Me.ColEstadosACTitulo
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "ColEstadosAR" Then
        Set getPropiedad = Me.ColEstadosAR
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "ColEstadosARTexto" Then
        Set getPropiedad = Me.ColEstadosARTexto
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "ColEstadosARTitulo" Then
        Set getPropiedad = Me.ColEstadosARTitulo
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "ColJuridicasDistintas" Then
        Set getPropiedad = Me.ColJuridicasDistintas
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "CadenaCorreosCalidadEnPruebas" Then
        getPropiedad = Me.CadenaCorreosCalidadEnPruebas
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    
    If p_NombreCampo = "ColEnumOrdenOrderBy" Then
        Set getPropiedad = Me.ColEnumOrdenOrderBy
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "ColEnumOrdenTitulo" Then
        Set getPropiedad = Me.ColEnumOrdenTitulo
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "URLArchivoCSS1" Then
        getPropiedad = Me.URLArchivoCSS1
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "URLVideoAyudaNCProyecto" Then
        getPropiedad = Me.URLVideoAyudaNCProyecto
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    If p_NombreCampo = "URLVideoAyudaNCProyectoParaTecnico" Then
        getPropiedad = Me.URLVideoAyudaNCProyectoParaTecnico
        p_Error = Me.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    p_Error = "La propiedad " & p_NombreCampo & " no esta registrada en Entorno.getPropiedad "
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo Entorno.getPropiedad ha devuelto el error: " & vbNewLine & Err.Description
    End If
    
End Function




