Attribute VB_Name = "Variables Globales"
Option Compare Database
Option Explicit

#If Win64 = 1 Then
    Public Declare PtrSafe Sub Sleep Lib "kernel32" ( _
            ByVal dwMilliseconds As Long)
    Public Declare PtrSafe Function GetPrivateProfileString Lib "kernel32" Alias "GetPrivateProfileStringA" ( _
            ByVal lpApplicationName As String, _
            ByVal lpKeyName As String, _
            ByVal lpDefault As String, _
            ByVal lpReturnedString As String, _
            ByVal nSize As Long, _
            ByVal lpFileName As String) As Long
    
    Public Declare PtrSafe Function Ejecutar Lib "shell32.dll" Alias "ShellExecuteA" ( _
            ByVal hwnd As Long, ByVal lpOperation As String, _
            ByVal lpFile As String, _
            ByVal lpParameters As String, _
            ByVal lpDirectory As String, _
            ByVal nShowCmd As Long) As Long
    Public Declare PtrSafe Sub CopyMemory Lib "kernel32" Alias "RtlMoveMemory" ( _
            Destination As Any, Source As Any, ByVal Length As Long)
    Public Declare PtrSafe Function GetIpAddrTable Lib "IPHlpApi" ( _
            pIPAdrTable As Byte, pdwSize As Long, ByVal Sort As Long) As Long
    Public Declare PtrSafe Function IsIconic Lib "user32.dll" ( _
            ByVal hwnd As Long) As Long
    Public Declare PtrSafe Function OpenProcess Lib "kernel32" ( _
        ByVal dwDesiredAccess As Long, _
        ByVal bInheritHandle As Long, _
        ByVal dwProcessId As Long) As Long
    Public Declare PtrSafe Function GetExitCodeProcess Lib "kernel32" ( _
        ByVal hProcess As Long, lpExitCode As Long) As Long
    Public Declare PtrSafe Function CloseHandle Lib "kernel32" ( _
        ByVal hObject As Long) As Long
    Public Declare PtrSafe Function GetLongPathName Lib "kernel32.dll" Alias "GetLongPathNameA" ( _
        ByVal lpszShortPath As String, _
        ByVal lpszLongPath As String, _
        ByVal cchBuffer As Long) As Long
    Public Declare PtrSafe Function OpenClipboard Lib "user32" (ByVal hwnd As LongPtr) As Long
    Public Declare PtrSafe Function EmptyClipboard Lib "user32" () As Long
    Public Declare PtrSafe Function CloseClipboard Lib "user32" () As Long
    Public Declare PtrSafe Function SetClipboardData Lib "user32" (ByVal uFormat As Long, ByVal hMem As LongPtr) As LongPtr
    Public Declare PtrSafe Function GlobalAlloc Lib "kernel32" (ByVal uFlags As Long, ByVal dwBytes As LongPtr) As LongPtr
    Public Declare PtrSafe Function GlobalLock Lib "kernel32" (ByVal hMem As LongPtr) As LongPtr
    Public Declare PtrSafe Function GlobalUnlock Lib "kernel32" (ByVal hMem As LongPtr) As Long
    Public Declare PtrSafe Function lstrcpy Lib "kernel32" (ByVal lpString1 As Any, ByVal lpString2 As Any) As Long
#Else
    Public Declare Sub Sleep Lib "kernel32" ( _
            ByVal dwMilliseconds As Long)
    Public Declare Function GetPrivateProfileString Lib "kernel32" Alias "GetPrivateProfileStringA" ( _
            ByVal lpApplicationName As String, _
            ByVal lpKeyName As String, _
            ByVal lpDefault As String, _
            ByVal lpReturnedString As String, _
            ByVal nSize As Long, _
            ByVal lpFileName As String) As Long
    
    Public Declare Function Ejecutar Lib "shell32.dll" Alias "ShellExecuteA" ( _
            ByVal hWnd As Long, ByVal lpOperation As String, _
            ByVal lpFile As String, _
            ByVal lpParameters As String, _
            ByVal lpDirectory As String, _
            ByVal nShowCmd As Long) As Long
    Public Declare Sub CopyMemory Lib "kernel32" Alias "RtlMoveMemory" ( _
            Destination As Any, Source As Any, ByVal Length As Long)
    Public Declare Function GetIpAddrTable Lib "IPHlpApi" ( _
            pIPAdrTable As Byte, pdwSize As Long, ByVal Sort As Long) As Long
    Public Declare Function IsIconic Lib "user32.dll" ( _
            ByVal hWnd As Long) As Long
    Public Declare Function OpenProcess Lib "kernel32" ( _
        ByVal dwDesiredAccess As Long, _
        ByVal bInheritHandle As Long, _
        ByVal dwProcessId As Long) As Long
    Public Declare Function GetExitCodeProcess Lib "kernel32" ( _
        ByVal hProcess As Long, lpExitCode As Long) As Long
    Public Declare Function CloseHandle Lib "kernel32" ( _
        ByVal hObject As Long) As Long
    Public Declare Function GetLongPathName Lib "kernel32.dll" Alias "GetLongPathNameA" ( _
        ByVal lpszShortPath As String, _
        ByVal lpszLongPath As String, _
        ByVal cchBuffer As Long) As Long
    Public Declare Function OpenClipboard Lib "user32" (ByVal hwnd As Long) As Long
    Public Declare Function EmptyClipboard Lib "user32" () As Long
    Public Declare Function CloseClipboard Lib "user32" () As Long
    Public Declare Function SetClipboardData Lib "user32" (ByVal uFormat As Long, ByVal hMem As Long) As Long
    Public Declare Function GlobalAlloc Lib "kernel32" (ByVal uFlags As Long, ByVal dwBytes As Long) As Long
    Public Declare Function GlobalLock Lib "kernel32" (ByVal hMem As Long) As Long
    Public Declare Function GlobalUnlock Lib "kernel32" (ByVal hMem As Long) As Long
    Public Declare Function lstrcpy Lib "kernel32" (ByVal lpString1 As Any, ByVal lpString2 As Any) As Long
#End If
'The structures returned by the API call GetIpAddrTable...
Public Type IPINFO
    dwAddr As Long          ' IP address
    dwIndex As Long         ' interface index
    dwMask As Long          ' subnet mask
    dwBCastAddr As Long     ' broadcast address
    dwReasmSize  As Long    ' assembly size
    Reserved1 As Integer
    Reserved2 As Integer
End Type
Public Const GMEM_MOVEABLE = &H2
Public Const CF_TEXT = 1




Public Const PROCESS_QUERY_INFORMATION = &H400
Public Const STATUS_PENDING = &H103&

Public Const msoFileDialogFilePicker As Long = 3
Public Const msoFileDialogFolderPicker As Long = 4
Public Const msoFileDialogOpen As Long = 1
Public Const msoFileDialogSaveAs As Long = 2
Public Const SubRedOficina As String = "10.14.7"
Public Enum EnumSiNo
    Sí = 1
    No = 2
End Enum
Public Enum EnumAmbito
    Todos = 1
    Defensa = 2
    Fuera = 3
    HPS = 4
End Enum

Public Enum EnumTipoObjeto
    Expediente = 1
    ExpedienteEntidad = 2
End Enum

Public Enum EnumPostAgedoCombo
    Todos = 1
    No = 2
    Solo = 3
End Enum

Public Enum EnumOtrasOpciones
    Comerciales = 1
    CPVs = 2
    Ejercitos = 3
    EMPRESAS = 4
    Lugares = 5
    OfProgramas = 6
    OrganoContratacion = 7
    PECALES = 8
    RACs = 9
    GradosClasificacion = 10
    
End Enum
Public Enum EnumAmbitoActualizacion
    Todo = 0            ' Comportamiento actual (por defecto)
    Cabecera = 1        ' Título, Fechas, Clasificación, Órganos, Ejercito, Responsables individuales (Calidad/Seguridad), Tipo
    Suministradores = 2 ' CadenaContratistas, CadenaSubContratistas (y actualización de NCs si procede)
    Comerciales = 3     ' CadenaComerciales
    Responsables = 4    ' CadenaJPs (Los individuales van en Cabecera, la lista de JPs aquí)
    RACs = 5            ' CadenaRACs, CadenaCorreoRACs
    Hitos = 6           ' CadenaHitos
    PECAL = 7           ' CadenaPecal, Flag PECAL
    Lugares = 8         ' CadenaLugares
    
    ' Modificados no forma parte de la caché de entidades, por lo que no necesita ámbito aquí
End Enum
Public Enum EnumTipoExpediente
    AM = 1
    Lote = 2
    BasadoDeAM = 3
    BasadoDeLote = 4
    EXPIndividual = 5
    EXPHPS = 6
End Enum
Public Enum EnumAPLICAAGEDYS
    No = 1
    SiExpNormal = 2
    SiExpGenerico = 3
    
End Enum
Public Enum EnumObjetos
    Expediente = 1
    Comercial = 2
    CPV = 3
    Ejercito = 4
    ESTADO = 5
    Anexo = 6
    
End Enum

Public Enum EnumEstados
    Preoferta = 10
    Oferta = 1
    Adjudicada = 2
    EnEjecucion = 3
    EnGarantia = 4
    Cerrado = 5
    Desestimado = 6
    Perdido = 7
    NoAPlica = 8
    Desconocido = 9
End Enum
Public Enum EnumTipoTarea
    EstadoDesconocido = 1
    APuntoDeRecepcionarCompleto = 2
    APuntoDeRecepcionarHito = 3
    AdjudicadoSinContrato = 4
    AdjudicadosTSOLSinCodS4H = 5
    EnFaseOfertaPorMuchoTiempo = 6
End Enum

Public fso As New Scripting.FileSystemObject
Public pregunta As Long
Public wks As DAO.Workspace
Private db As DAO.Database
Private db1 As DAO.Database
Private m_ActiveBackendURL As String   ' Set by LeeConfiguracionLocal()
Private m_PasswordBackend As String    ' Set by LeeConfiguracionLocal()
Private m_dbCached As DAO.Database    ' Cacheada por getdb() — validación con .Name antes de retornar
Private m_TestingBackendURL As String
Public m_TestingMode As Boolean
Private m_TestOnlyBackendOverrideEnabled As Boolean
Private m_TestOnlyBackendActivo As String
Private m_TestOnlyBackendProduccion As String
Private m_TestOnlyBackendSandbox As String
Private m_TestOnlyBackendTest As String
Private m_TestOnlyPasswordBackend As String
Public IDAplicacion As String


Public m_ObjUsuarioConectado As USUARIO
Public m_ObjEntorno As Entorno
Public m_EnOficina As EnumSiNo
Public EsAdministrador As EnumSiNo
Public EsTecnico As EnumSiNo
Public EsCalidad As EnumSiNo
Public m_TextoWin64 As String
Public m_ArchivoSSID As String

Public m_ObjComercialActivo As Comercial
Public m_ObjCPVActivo As CPV
Public m_ObjEjercitoActivo As Ejercito
Public m_ObjGradoClasificacionActivo As GradoClasificacion
Public m_ObjExpedienteActivo As Expediente



Public m_ObjLugarEjecucionActiva As LugarEjecucion
Public m_ObjOficinaProgramaActiva As OficinaPrograma
Public m_ObjOrganoContratacionActivo As OrganoContratacion
Public m_ObjPECALActiva As PECAL
Public m_ObjRACActivo As RAC
Public m_ObjSuministradorActivo As Suministrador
Public m_ObjExpedienteDTOActivo As ExpedienteDTO

Public m_ObjExpBusquedaActivo As ExpedienteBusqueda
Public m_ObjModificadoActivo As ExpedienteModificado
Public m_ObjExpBusquedaActiva As ExpedienteBusqueda
Public m_ObjExpBusquedaTecnicaActiva As ExpedienteBusquedaTecnica
Public m_EnumPostAgedoCombo As EnumPostAgedoCombo
Public m_EnumAmbitoCombo As EnumAmbito
Public m_TituloFormulario As String
Public lbl As Label
Public m_ObjMostrarEstadoUsuarioConectado As MostrarEstado
Public m_NombreListaParaInforme As String
Public m_DatosEnMemoria As EnumSiNo
Public AbiertoParaEditar As Boolean
Public g_ArgumentoAltaTipo As String  ' Argumento para FormExpedienteAltaTipo — evita problema con OpenArgs en modal

Private Sub ResetGlobals()
    ' =============================================================================
    ' Resetear TODAS las variables de módulo a su estado inicial
    ' Llamado al inicio de EVE() para garantizar un estado limpio antes de cargar
    ' =============================================================================
    
    ' Limpiar TempVars ANTES de cargar nueva configuración
   
    
    ' Strings
    TempVars.RemoveAll
    IDAplicacion = ""
    m_TextoWin64 = ""
    m_ArchivoSSID = ""
    m_TituloFormulario = ""
    m_NombreListaParaInforme = ""
    m_ActiveBackendURL = ""
    m_PasswordBackend = ""
    
    ' Enums ? defaults (0)
    m_EnOficina = 0
    EsAdministrador = 0
    EsTecnico = 0
    EsCalidad = 0
    m_DatosEnMemoria = 0
    m_EnumPostAgedoCombo = 0
    m_EnumAmbitoCombo = 0
    
    ' Flags
    pregunta = 0
    AbiertoParaEditar = False
    
    ' Objetos DAO ? Nothing
    Set wks = Nothing
    Set db = Nothing
    Set db1 = Nothing
    Set m_dbCached = Nothing
    
    ' Objetos de dominio ? Nothing
    Set m_ObjUsuarioConectado = Nothing
    Set m_ObjEntorno = Nothing
    Set m_ObjComercialActivo = Nothing
    Set m_ObjCPVActivo = Nothing
    Set m_ObjEjercitoActivo = Nothing
    Set m_ObjGradoClasificacionActivo = Nothing
    Set m_ObjExpedienteActivo = Nothing
    Set m_ObjLugarEjecucionActiva = Nothing
    Set m_ObjOficinaProgramaActiva = Nothing
    Set m_ObjOrganoContratacionActivo = Nothing
    Set m_ObjPECALActiva = Nothing
    Set m_ObjRACActivo = Nothing
    Set m_ObjSuministradorActivo = Nothing
    Set m_ObjExpedienteDTOActivo = Nothing
    Set m_ObjExpBusquedaActivo = Nothing
    Set m_ObjModificadoActivo = Nothing
    Set m_ObjExpBusquedaActiva = Nothing
    Set m_ObjExpBusquedaTecnicaActiva = Nothing
    Set m_ObjMostrarEstadoUsuarioConectado = Nothing
    Set lbl = Nothing
End Sub

Public Function EVE(Optional ByRef p_Error As String) As String
    
    Dim m_NombreCampo As Variant
    Dim m_Valor As String
    Dim m_Objeto As Object
    Dim ti As Single
    Dim tf As Single
    Dim m_TipoCampo As String
    Dim m_ValorCampo As String
    Dim intNumeroErrores As Integer
    Dim m_CadenaCamposConError As String
   
    
    Dim objNetwork As Object
    Dim m_Command As String
    Dim m_UsuarioLogeadoEnOrdenador As String
    Dim t1 As Single
    Dim t2 As Single
    Dim m_UsuarioDeRed As String
    On Error GoTo errores
    
    ' Resetear estado global antes de cargar configuración
    Call ResetGlobals
    
    ' Carga de configuración de backend PRIMERO (PROD/SANDBOX/TEST)
    ' Necesario antes de cualquier llamada a getdb() durante el resto de EVE
    Call LeeConfiguracionLocal(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If

    t1 = Timer
    Application.TempVars("EnDesarrollo") = "No"
    'Application.TempVars("EnDesarrollo") = "Sí"
    Application.TempVars("DatosEnMemoria") = "Sí"
    'Application.TempVars("DatosEnMemoria") = "No"
    Application.TempVars("DiasParaOfertasSinDecision") = "45"
    m_EnOficina = EnOficina(p_Error)
    Avance "Estableciendo variables de entorno"

    ' IDAplicacion se lee en LeeConfiguracionLocal() desde TbConfiguracionBackends
    m_TextoWin64 = "(64 bits)"
    m_Command = Nz(VBA.Command, "")
    'm_Command = "esperanza.delalamoarriba@telefonica.com"
    'm_Command = "martina.torralbarodriguez@telefonica.com"
    'm_Command = "angel.martin-doradocaballero@telefonica.com"
    'm_Command = "anamaria.rubiocanales@telefonica.com"
    'm_Command = "emma.delgadillogomez@telefonica.com"
    If m_Command <> "" Then
        Set m_ObjUsuarioConectado = constructor.getUsuario(, , , m_Command, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    Else
        Set objNetwork = CreateObject("Wscript.Network")
        m_UsuarioLogeadoEnOrdenador = objNetwork.UserName
        If m_UsuarioLogeadoEnOrdenador = "Local1" Then m_UsuarioLogeadoEnOrdenador = "adm"
        If m_UsuarioLogeadoEnOrdenador = "adm1" Then m_UsuarioLogeadoEnOrdenador = "adm"
        Set m_ObjUsuarioConectado = constructor.getUsuario(, m_UsuarioLogeadoEnOrdenador, , , p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Set objNetwork = Nothing
    End If
    Set m_ObjMostrarEstadoUsuarioConectado = Nothing
    
    If m_ObjUsuarioConectado Is Nothing Then
        p_Error = "No se ha podido determinar el usuario que está usando la herramienta"
        Err.Raise 1000
    End If
    If Application.TempVars("DatosEnMemoria") = "Sí" Then
        m_DatosEnMemoria = EnumSiNo.Sí
    Else
        m_DatosEnMemoria = EnumSiNo.No
    End If
    Set m_ObjEntorno = New Entorno
    With m_ObjUsuarioConectado
        EsAdministrador = .EsAdministradorCalculado
        
        If EsAdministrador = EnumSiNo.Sí Then
            GoTo fintipoUsuario
        End If
        EsCalidad = .EsUsuarioCalidadCalculado
        If EsCalidad = EnumSiNo.Sí Then
            GoTo fintipoUsuario
        End If
        EsTecnico = EnumSiNo.Sí
    End With
fintipoUsuario:
    If EsAdministrador = EnumSiNo.Sí Then
        EsCalidad = EnumSiNo.No
        EsTecnico = EnumSiNo.No
    End If
    If EsCalidad = EnumSiNo.Sí Then
        EsAdministrador = EnumSiNo.No
        EsTecnico = EnumSiNo.No
    End If
    If EsTecnico = EnumSiNo.Sí Then
        EsCalidad = EnumSiNo.No
        EsAdministrador = EnumSiNo.No
    End If
    
    For Each m_NombreCampo In m_ObjEntorno.ColItems.keys
        'Debug.Print m_NombreCampo
        'If CStr(m_NombreCampo) = "URLDirectorioFacturasProveedor" Then Stop
        Avance m_NombreCampo
        m_TipoCampo = m_ObjEntorno.ColItems(m_NombreCampo)
        If m_TipoCampo = "o" Then
            Set m_Objeto = m_ObjEntorno.getPropiedad(m_NombreCampo, p_Error)
            If p_Error <> "" Then
                If m_CadenaCamposConError = "" Then
                    m_CadenaCamposConError = m_NombreCampo
                Else
                    m_CadenaCamposConError = m_CadenaCamposConError & vbNewLine & m_NombreCampo
                End If
                intNumeroErrores = intNumeroErrores + 1
                p_Error = ""
            End If
            
        Else
            m_ValorCampo = m_ObjEntorno.getPropiedad(m_NombreCampo, p_Error)
            If p_Error <> "" Then
                If m_CadenaCamposConError = "" Then
                    m_CadenaCamposConError = m_NombreCampo
                Else
                    m_CadenaCamposConError = m_CadenaCamposConError & vbNewLine & m_NombreCampo
                End If
                intNumeroErrores = intNumeroErrores + 1
                p_Error = ""
            End If
            
            
        End If
    Next
    
    If intNumeroErrores > 0 Then
        p_Error = "Se han producido los siguientes Errores: " & vbNewLine & m_CadenaCamposConError
        Err.Raise 1000
    End If
    m_EnumPostAgedoCombo = EnumPostAgedoCombo.Solo
    m_EnumAmbitoCombo = EnumAmbito.Defensa
    
    If EsAdministrador <> EnumSiNo.Sí Then
        m_TituloFormulario = "EXPEDIENTES Versión " & m_ObjEntorno.VersionAplicacion & " " & _
                m_ObjUsuarioConectado.Nombre & " (Sólo lectura)"
    Else
        m_TituloFormulario = "EXPEDIENTES Versión " & m_ObjEntorno.VersionAplicacion & " " & _
            m_ObjUsuarioConectado.Nombre
    End If
    Set m_ObjMostrarEstadoUsuarioConectado = constructor.getMostrarEstado(p_UsuarioRed:=m_ObjUsuarioConectado.usuarioRed, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_ObjMostrarEstadoUsuarioConectado Is Nothing Then
        Set m_ObjMostrarEstadoUsuarioConectado = RegistrarMostrarEstado(p_MostrarEstado:="Sí", p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End If
RegistraConCadenaEntidadesLosNoExistentes p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If



    t2 = Timer
    Debug.Print "Variables establecidas correctamente en: " & t2 - t1
    AvanceCerrar
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EVE ha producido el error nº: " & Err.Number & vbCrLf & "Detalle: " & Err.Description
    End If
    Debug.Print p_Error
End Function


Public Function getNombreUsuarioConectado(Optional ByRef p_Error As String) As String
    
    Dim m_Usuario As USUARIO
    Dim m_UsuarioMaquina As USUARIO
    Dim m_Nombre As String
    
    On Error GoTo errores
    If Not m_ObjUsuarioConectado Is Nothing Then
        getNombreUsuarioConectado = m_ObjUsuarioConectado.Nombre
        Exit Function
    End If
    
    Set m_UsuarioMaquina = constructor.getUsuarioConectadoPorMaquina(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_UsuarioMaquina Is Nothing Then
        getNombreUsuarioConectado = "Desconocido"
        Exit Function
    End If
    getNombreUsuarioConectado = m_UsuarioMaquina.Nombre
    Exit Function
errores:
    getNombreUsuarioConectado = "Desconocido"
End Function
Public Function LeeConfiguracionLocal( _
                         Optional ByRef p_Error As String _
                         ) As String
    ' Lee configuración desde TbConfiguracionBackends:
    ' - Backend activo (PROD/SANDBOX/TEST)
    ' - Rutas de backend de datos
    ' - Ruta de directorio de aplicaciones (recursos, ayuda, plantillas)
    
    Dim rcdCfg As DAO.Recordset
    Dim m_SQL As String
    Dim m_BackendActivo As String
    Dim m_BackendProduccion As String
    Dim m_BackendSandbox As String
    Dim m_BackendTest As String
    Dim m_URL As String
    Dim m_ErrorResolver As String
    Dim m_Pwd As String
    Dim m_RutaDirectorioAplicacion As String
    
    On Error GoTo errores
    m_ActiveBackendURL = ""
    m_PasswordBackend = ""

    m_SQL = "SELECT TOP 1 * FROM TbConfiguracionBackends;"
    Set rcdCfg = CurrentDb.OpenRecordset(m_SQL)
    
    If rcdCfg.EOF Then
        rcdCfg.Close
        Set rcdCfg = Nothing
        p_Error = "No se encontró configuración de backend habilitada"
        Exit Function
    End If
    
    rcdCfg.MoveFirst
    
    ' Leer campos de configuración de backend
    m_BackendActivo = UCase$(Trim$(Nz(rcdCfg!backendActivo, "")))
    m_BackendProduccion = Nz(rcdCfg!BackendProduccion, "")
    m_BackendSandbox = Nz(rcdCfg!BackendSandbox, "")
    m_BackendTest = Nz(rcdCfg!BackendTest, "")
    If m_TestOnlyBackendOverrideEnabled Then
        m_BackendActivo = UCase$(Trim$(m_TestOnlyBackendActivo))
        m_BackendProduccion = m_TestOnlyBackendProduccion
        m_BackendSandbox = m_TestOnlyBackendSandbox
        m_BackendTest = m_TestOnlyBackendTest
    End If

    Application.TempVars("BackendActivo") = m_BackendActivo
    Application.TempVars("BackendProduccion") = m_BackendProduccion
    Application.TempVars("BackendSandbox") = m_BackendSandbox
    Application.TempVars("BackendTest") = m_BackendTest
    m_Pwd = Nz(rcdCfg!PasswordBackend, m_PasswordBackend)
    If m_TestOnlyBackendOverrideEnabled Then
        m_Pwd = m_TestOnlyPasswordBackend
    End If
    Application.TempVars("PasswordBackend") = m_Pwd

    ' IDAplicacion — leído de la config, no hardcodeado
    IDAplicacion = Nz(rcdCfg!IDAplicacion, "19")
    Application.TempVars("IDAplicacion") = IDAplicacion

    ' Leer ruta de directorio de aplicaciones según entorno
    Select Case m_BackendActivo
        Case "PROD"
            m_RutaDirectorioAplicacion = Nz(rcdCfg!RutaDirectorioAplicacion_PROD, "")
        Case Else  ' SANDBOX o TEST
            m_RutaDirectorioAplicacion = Nz(rcdCfg!RutaDirectorioAplicacion_LOCAL, "")
    End Select
    Application.TempVars("RutaDirectorioAplicacion") = m_RutaDirectorioAplicacion
    
    ' Determinar URL de backend de datos según entorno activo
    m_URL = ResolveBackendPath(m_BackendActivo, m_BackendProduccion, m_BackendSandbox, m_BackendTest, m_ErrorResolver)
    If m_ErrorResolver <> "" Then
        p_Error = m_ErrorResolver
        Err.Raise 1000
    End If
    
    ' Guardar en variables de módulo para getdb()
    m_ActiveBackendURL = m_URL
    m_PasswordBackend = m_Pwd
    
    rcdCfg.Close
    Set rcdCfg = Nothing
    
    Exit Function
errores:
    m_ActiveBackendURL = ""
    m_PasswordBackend = ""
    If rcdCfg Is Nothing = False Then
        rcdCfg.Close
        Set rcdCfg = Nothing
    End If
    If Err.Number <> 1000 Then
        p_Error = "El método LeeConfiguracionLocal ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Sub TestOnlySetBackendConfigOverride( _
    ByVal p_BackendActivo As String, _
    ByVal p_BackendProduccion As String, _
    ByVal p_BackendSandbox As String, _
    ByVal p_BackendTest As String, _
    Optional ByVal p_PasswordBackend As String = "")

    m_TestOnlyBackendOverrideEnabled = True
    m_TestOnlyBackendActivo = p_BackendActivo
    m_TestOnlyBackendProduccion = p_BackendProduccion
    m_TestOnlyBackendSandbox = p_BackendSandbox
    m_TestOnlyBackendTest = p_BackendTest
    m_TestOnlyPasswordBackend = p_PasswordBackend
End Sub

Public Sub TestOnlyResetBackendConfigOverride()
    m_TestOnlyBackendOverrideEnabled = False
    m_TestOnlyBackendActivo = ""
    m_TestOnlyBackendProduccion = ""
    m_TestOnlyBackendSandbox = ""
    m_TestOnlyBackendTest = ""
    m_TestOnlyPasswordBackend = ""
End Sub

Public Function TestOnlyGetActiveBackendURL() As String
    TestOnlyGetActiveBackendURL = m_ActiveBackendURL
End Function

Public Function TestOnlyGetPasswordBackend() As String
    TestOnlyGetPasswordBackend = m_PasswordBackend
End Function

Public Sub TestOnlyConfigureTestingBackend(ByVal p_BackendURL As String, Optional ByVal p_PasswordBackend As String = "")
    m_TestingBackendURL = Trim$(Nz(p_BackendURL, ""))
    If p_PasswordBackend <> "" Then m_PasswordBackend = p_PasswordBackend
End Sub

Public Sub TestOnlyClearTestingBackend()
    m_TestingBackendURL = ""
End Sub

Public Function TestOnlyGetTestingBackendURL() As String
    TestOnlyGetTestingBackendURL = m_TestingBackendURL
End Function

Public Sub CloseCachedBackendConnection()
    On Error Resume Next
    If Not m_dbCached Is Nothing Then m_dbCached.Close
    Set m_dbCached = Nothing
End Sub

Public Function TestOnlyIsBackendConfigOverrideEnabled() As Boolean
    TestOnlyIsBackendConfigOverrideEnabled = m_TestOnlyBackendOverrideEnabled
End Function

Public Function ValidarCarpetaEscribible( _
                        ByVal p_Ruta As String, _
                        ByVal p_NombreInfraestructura As String, _
                        Optional ByRef p_Error As String _
                        ) As String
    Dim m_RutaNormalizada As String
    Dim m_URLProbe As String
    Dim m_TextStream As Scripting.TextStream

    On Error GoTo errores
    p_Error = ""

    m_RutaNormalizada = Trim$(Nz(p_Ruta, ""))
    If m_RutaNormalizada = "" Then
        p_Error = "No se ha configurado la ruta de " & p_NombreInfraestructura
        Err.Raise 1000
    End If

    If Not fso.FolderExists(m_RutaNormalizada) Then
        p_Error = "No es alcanzable la ruta de " & p_NombreInfraestructura & ":" & vbNewLine & m_RutaNormalizada
        Err.Raise 1000
    End If

    If Right$(m_RutaNormalizada, 1) <> "\" Then m_RutaNormalizada = m_RutaNormalizada & "\"
    m_URLProbe = m_RutaNormalizada & ".expedientes_preflight_" & Format$(Now, "yyyymmddhhnnss") & ".tmp"

    Set m_TextStream = fso.CreateTextFile(m_URLProbe, True)
    m_TextStream.WriteLine "EXPEDIENTES preflight"
    m_TextStream.Close
    Set m_TextStream = Nothing
    fso.DeleteFile m_URLProbe, True

    ValidarCarpetaEscribible = "1"
    Exit Function
errores:
    Dim m_NumeroError As Long
    Dim m_ErrorOriginal As String
    Dim m_DescripcionError As String
    m_NumeroError = Err.Number
    m_ErrorOriginal = p_Error
    m_DescripcionError = Err.Description
    On Error Resume Next
    If Not m_TextStream Is Nothing Then m_TextStream.Close
    If m_URLProbe <> "" Then
        If fso.FileExists(m_URLProbe) Then fso.DeleteFile m_URLProbe, True
    End If
    If m_NumeroError <> 1000 Then
        p_Error = "No es posible escribir en la ruta de " & p_NombreInfraestructura & ":" & vbNewLine & _
                  m_RutaNormalizada & vbNewLine & m_DescripcionError
    Else
        p_Error = m_ErrorOriginal
    End If
End Function

Public Function ValidarInfraestructuraInicio(Optional ByRef p_Error As String) As String
    Dim m_URLDocumentacion As String

    On Error GoTo errores
    p_Error = ""

    If m_ActiveBackendURL = "" Then
        LeeConfiguracionLocal p_Error
        If p_Error <> "" Then Err.Raise 1000
    End If

    If m_ActiveBackendURL = "" Then
        p_Error = "No se ha configurado el backend activo de Expedientes"
        Err.Raise 1000
    End If

    If Not fso.FileExists(m_ActiveBackendURL) Then
        p_Error = "No es alcanzable el backend activo de Expedientes:" & vbNewLine & m_ActiveBackendURL
        Err.Raise 1000
    End If

    If m_ObjEntorno Is Nothing Then
        p_Error = "No se ha inicializado el entorno de Expedientes"
        Err.Raise 1000
    End If

    m_URLDocumentacion = m_ObjEntorno.URLDirectorioDocumentacion
    p_Error = m_ObjEntorno.Error
    If p_Error <> "" Then Err.Raise 1000

    ValidarCarpetaEscribible m_URLDocumentacion, "documentación de anexos", p_Error
    If p_Error <> "" Then Err.Raise 1000

    ValidarInfraestructuraInicio = "1"
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ValidarInfraestructuraInicio ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

Public Function getWorkspace(Optional ByRef p_Error As String) As DAO.Workspace
    On Error GoTo errores
    ' Retorna el workspace global para todas las conexiones getdb()
    ' Uso: transactions futuras serán shareables entre conexiones abiertas via este workspace
    If wks Is Nothing Then
        Set wks = DBEngine.Workspaces(0)
    End If
    Set getWorkspace = wks
    Exit Function
errores:
    p_Error = "getWorkspace: " & Err.Description
End Function

Public Function getdb(Optional ByRef p_Error As String) As DAO.Database
    Dim dummy As String
    Dim m_TargetBackendURL As String
    On Error GoTo errores

    ' VALIDACIÓN CRÍTICA: Verificar que m_dbCached siga siendo válido
    ' Error 3420 "objeto no válido" ocurre cuando VBA GC libera el objeto
    ' aunque aún tengamos una referencia. .Name fuerza validación real.
    If Not m_dbCached Is Nothing Then
        On Error Resume Next
        dummy = m_dbCached.Name
        If Err.Number = 0 Then
            On Error GoTo errores
            Set getdb = m_dbCached
            Exit Function
        End If
        ' Si .Name falló, el objeto está inválido - limpiar y continuar
        Err.Clear
        On Error GoTo errores
        Set m_dbCached = Nothing
    End If
    
    If m_TestingMode Then
        m_TargetBackendURL = Trim$(m_TestingBackendURL)
        If m_TargetBackendURL = "" Then
            p_Error = "getdb: m_TestingMode=True pero no hay backend sandbox configurado"
            Exit Function
        End If
    Else
        ' Si m_ActiveBackendURL no está seteado, leer de TbConfiguracionBackends
        If m_ActiveBackendURL = "" Then
            Call LeeConfiguracionLocal(p_Error)
            If p_Error <> "" Then Exit Function
        End If

        m_TargetBackendURL = Trim$(m_ActiveBackendURL)
        If m_TargetBackendURL = "" Then
            p_Error = "No se ha configurado el backend activo de Expedientes. Ejecute LeeConfiguracionLocal()."
            Exit Function
        End If
    End If

    If Dir$(m_TargetBackendURL, vbNormal) = "" Then
        p_Error = "No es alcanzable el backend activo de Expedientes:" & vbNewLine & m_TargetBackendURL
        Exit Function
    End If
    
    ' Abrir conexión fresca via workspace
    Set m_dbCached = getWorkspace().OpenDatabase(m_TargetBackendURL, False, False, ";pwd=" & m_PasswordBackend)
    Set getdb = m_dbCached
    Exit Function
errores:
    m_ActiveBackendURL = ""
    m_PasswordBackend = ""
    p_Error = "El método getdb ha devuelto el error: " & vbNewLine & Err.Description
End Function

Private Sub CheckAndReconnect(ByRef dbObject As DAO.Database, ByVal dbType As String, Optional ByRef p_Error As String)
    Dim needsConnection As Boolean
    Dim dummy As String
    
    On Error GoTo errores
    
    needsConnection = False
    
    If dbObject Is Nothing Then
        needsConnection = True
    Else
        On Error Resume Next
        dummy = dbObject.Name
        If Err.Number <> 0 Then
            needsConnection = True
            Err.Clear
        End If
        On Error GoTo errores
    End If
    
    If needsConnection Then
        ' Cerrar conexión anterior si existe (evitar leaks)
        If Not dbObject Is Nothing Then
            On Error Resume Next
            dbObject.Close
            Err.Clear
            On Error GoTo errores
        End If
        
        ' Abrir fresh via workspace
        Set dbObject = getWorkspace().OpenDatabase(m_ActiveBackendURL, False, False, ";pwd=" & m_PasswordBackend)
    End If
    
    Exit Sub
errores:
    p_Error = "CheckAndReconnect: " & Err.Description
End Sub

Public Function LeerIni(key As String, Default As Variant) As String
    Dim bufer As String * 256, Len_Value As Long
    
    
    Len_Value = GetPrivateProfileString(fso.GetBaseName(CurrentDb().Name), _
                                         key, _
                                         Default, _
                                         bufer, _
                                         Len(bufer), _
                                         m_ObjEntorno.URLAchivoIni)
    LeerIni = Left$(bufer, CLng(Len_Value))
    
End Function
Public Function GetIPAddresses(Optional FilterLocalhost As Boolean = False, Optional ByRef p_Error As String) As String

    Dim Ret As Long
    Dim Buffer() As Byte
    Dim IPTableRow As IPINFO
    Dim Count As Long
    Dim BufferRequired As Long
    Dim StructSize As Long
    Dim NumIPAddresses As Long
    Dim IPAddress As String

    On Error GoTo errores

    Call GetIpAddrTable(ByVal 0&, BufferRequired, 1)

    If BufferRequired > 0 Then
        
        ReDim Buffer(0 To BufferRequired - 1) As Byte
        
        If GetIpAddrTable(Buffer(0), BufferRequired, 1) = 0 Then
        
            'We've successfully obtained the IP Address details...
            'First 4 bytes is a long indicating the number of entries in the table
            StructSize = LenB(IPTableRow)
            CopyMemory NumIPAddresses, Buffer(0), 4
        
            While Count < NumIPAddresses
            
                'Buffer contains the IPINFO structures (after initial 4 byte long)
                CopyMemory IPTableRow, Buffer(4 + (Count * StructSize)), StructSize
                    
                IPAddress = IPAddressToString(IPTableRow.dwAddr)
                    
                If Not ((IPAddress = "127.0.0.1") _
                        And FilterLocalhost) Then
                        
                    'Replace this with whatever you want to do with the IP Address...
                    GetIPAddresses = GetIPAddresses & IPAddress & ";     "
                        
                End If
                
                Count = Count + 1
                
            Wend
            
        End If
            
    End If
 
    Exit Function

errores:
    p_Error = "GetIPAddresses: " & Err.Description
End Function
    
Private Function IPAddressToString(EncodedAddress As Long) As String
        
    Dim IPBytes(3) As Byte
    Dim Count As Long
        
    'Converts a long IP Address to a string formatted 255.255.255.255
    'Note: Could use inet_ntoa instead
        
    CopyMemory IPBytes(0), EncodedAddress, 4 ' IP Address is stored in four bytes (255.255.255.255)
        
    'Convert the 4 byte values to a formatted string
    While Count < 4
        
        IPAddressToString = IPAddressToString & _
                                CStr(IPBytes(Count)) & _
                                IIf(Count < 3, ".", "")

        Count = Count + 1
            
    Wend
        
End Function



