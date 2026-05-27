Attribute VB_Name = "Variables Globales"
Option Compare Database
Option Explicit

    

#If Win64 = 1 Then
    
    Public Declare PtrSafe Function GetPrivateProfileString Lib "kernel32" Alias "GetPrivateProfileStringA" ( _
            ByVal lpApplicationName As String, _
            ByVal lpKeyName As String, _
            ByVal lpDefault As String, _
            ByVal lpReturnedString As String, _
            ByVal nSize As Long, _
            ByVal lpFileName As String) As Long
    
    Public Declare PtrSafe Function Ejecutar Lib "shell32.dll" Alias "ShellExecuteA" ( _
            ByVal hWnd As Long, ByVal lpOperation As String, _
            ByVal lpFile As String, _
            ByVal lpParameters As String, _
            ByVal lpDirectory As String, _
            ByVal nShowCmd As Long) As Long
    Public Declare PtrSafe Function OpenProcess Lib "kernel32" ( _
        ByVal dwDesiredAccess As Long, _
        ByVal bInheritHandle As Long, _
        ByVal dwProcessId As Long) As Long
    Public Declare PtrSafe Function GetExitCodeProcess Lib "kernel32" ( _
        ByVal hProcess As Long, lpExitCode As Long) As Long
    Public Declare PtrSafe Function CloseHandle Lib "kernel32" ( _
        ByVal hObject As Long) As Long
    Public Declare PtrSafe Sub CopyMemory Lib "kernel32" Alias "RtlMoveMemory" ( _
            Destination As Any, Source As Any, ByVal Length As LongPtr)
    Public Declare PtrSafe Function GetIpAddrTable Lib "Iphlpapi" ( _
            pIPAdrTable As Byte, pdwSize As Long, ByVal Sort As Long) As Long
    
#Else
    
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
    Public Declare Function OpenProcess Lib "kernel32" ( _
        ByVal dwDesiredAccess As Long, _
        ByVal bInheritHandle As Long, _
        ByVal dwProcessId As Long) As Long
    Public Declare Function GetExitCodeProcess Lib "kernel32" ( _
        ByVal hProcess As Long, lpExitCode As Long) As Long
    Public Declare Function CloseHandle Lib "kernel32" ( _
        ByVal hObject As Long) As Long
    Public Declare  Sub CopyMemory Lib "kernel32" Alias "RtlMoveMemory" ( _
            Destination As Any, Source As Any, ByVal Length As Long)
    Public Declare  Function GetIpAddrTable Lib "Iphlpapi" ( _
            pIPAdrTable As Byte, pdwSize As Long, ByVal Sort As Long) As Long
#End If 'The structures returned by the API call GetIpAddrTable...
Public Type IPINFO
    dwAddr As Long          ' IP address
    dwIndex As Long         ' interface index
    dwMask As Long          ' subnet mask
    dwBCastAddr As Long     ' broadcast address
    dwReasmSize  As Long    ' assembly size
    Reserved1 As Integer
    Reserved2 As Integer
End Type

Public Const STILL_ACTIVE = &H103
Public Const PROCESS_QUERY_INFORMATION = &H400
Public Const STATUS_PENDING = &H103&
Public fso As New Scripting.FileSystemObject
Public Const SubRedOficina As String = "10.14.7"

Public Const PESTAÑA_TODOS_DATOS_OK_SI = 4210752
Public Const PESTAÑA_TODOS_DATOS_OK_NO = 2366701

Public Const COLOR_BORDE_CAMPO_NORELLENO As Long = 1643706
Public Const COLOR_BORDE_CAMPO_RELLENO As Long = 14136213
Public Const ANCHO_BORDE_CAMPO_RELLENO As Long = 0
Public Const ANCHO_BORDE_CAMPO_NORELLENO As Long = 4

Public m_SQL As String
Public pregunta As Long
Public flag As String
Public dato As Variant
Public m_LineaLog As String
Public lbl As Label

Public m_ObjEntorno As entorno

Public EsAdministrador As EnumSino
Public EsTecnico As EnumSino
Public EsCalidad As EnumSino
Public m_ObjUsuarioConectado As usuario
Public m_ObjUsuarioConectadoInicialmente As usuario
Public wks As DAO.Workspace
Private db As DAO.Database
Private db1 As DAO.Database
Public Const ColorEnlacePosible As Long = 16737792
Public Const ColorEnlaceNoPosible As Long = 12566463

Public IDAplicacion As String
Public m_EnOficina As EnumSino


Public m_ObjNCProyectoActiva As ncProyecto
Public m_ObjNCProyectoActivaPVinculada As ncProyecto
Public m_ObjACProyectoActiva As ACProyecto
Public m_ObjARProyectoActiva As ARProyecto
Public m_ObjDocumentoProyectoActivo As DocumentoProyecto
Public m_ObjTipologiaProyectoActiva As TipologiaNCProyectos
Public m_ObjLogProyectoActivo As LogNCProyecto
Public m_ObjLogAuditoriaActivo As LogNCAuditoria

Public m_ObjAuditoriaActiva As Auditoria
Public m_ObjNCAuditoriaActiva As ncAuditoria
Public m_ObjACAuditoriaActiva As ACAuditoria
Public m_ObjARAuditoriaActiva As ARAuditoria

Public m_ObjColDocumentosAuditoriaParaAlta As Scripting.Dictionary

Public m_URLRutaAplicacionesLocal As String
Public m_URLRutaAplicacionesRemotas As String
Public m_URLRutaAplicacionLocal As String
Public m_URLRutaAplicacionRemota As String
Public m_SQLAlInicioSegTareasProyectos As String
Public m_SQLAlInicioSegTareasAuditorias As String
Public m_SQLAlInicioSegNCProyectos As String
Public AplicarCache As Boolean
Public m_ColFiltradoTareasNCProyectos As Scripting.Dictionary
Public m_TestingMode As Boolean
Public m_BackendSandboxURL As String
Public m_BackendSandboxPassword As String


    
    
Public Function getdb( _
                        Optional ByRef p_Error As String, _
                        Optional ByVal p_SkipConfigLoad As Boolean = False _
                        ) As DAO.Database
    
    Dim m_URL As String
    Dim m_BackendPassword As String
    On Error GoTo errores

    If m_TestingMode Then
        m_URL = Trim$(Nz(m_BackendSandboxURL, ""))
        If m_URL = "" Then
            p_Error = "getdb: m_TestingMode=True pero m_BackendSandboxURL está vacío. No se abre BackendActivo/producción."
            Err.Raise 1000
        End If

        If Not fso.FileExists(m_URL) Then
            p_Error = "getdb: m_TestingMode=True pero BackendSandbox no existe: " & m_URL
            Err.Raise 1000
        End If

        On Error Resume Next
        Set wks = DBEngine.Workspaces(0)
        Set db = wks.OpenDatabase(m_URL, False, False, ";PWD=" & m_BackendSandboxPassword)
        If Err.Number <> 0 Then
            p_Error = "getdb: m_TestingMode=True pero BackendSandbox no se pudo abrir: " & Err.Number & " - " & Err.Description
            Err.Clear
            On Error GoTo errores
            Err.Raise 1000
        End If
        On Error GoTo errores

        Set getdb = db
        Exit Function
    End If
    
    If Not p_SkipConfigLoad Then
        Call LeeConfiguracionLocal(p_Error)
        If p_Error <> "" Then Err.Raise 1000
    End If

    m_URL = Nz(Application.TempVars("BackendPathConfigurado"), "")
    If m_URL = "" Then
        p_Error = "BackendPathConfigurado no está resuelto. Revise BackendActivo/BackendProduccion/BackendSandbox en TbConfiguracionBackends"
        Err.Raise 1000
    End If
    
    m_BackendPassword = Environ$("ACCESS_VBA_PASSWORD")
    If m_BackendPassword = "" Then m_BackendPassword = Environ$("DYSFLOW_BACKEND_PASSWORD")
    If m_BackendPassword = "" Then m_BackendPassword = Environ$("DYSFLOW_ACCESS_PASSWORD")

    Set wks = DBEngine.Workspaces(0)
    Set db = wks.OpenDatabase(m_URL, False, False, "MS Access;PWD=" & m_BackendPassword)
    Set getdb = db
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getdb ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function LeeConfiguracionLocal( _
                            Optional ByRef p_Error As String _
                            ) As Boolean
    Dim m_Db As DAO.Database
    Dim m_Rs As DAO.Recordset
    Dim m_BackendActivo As String
    Dim m_BackendProduccion As String
    Dim m_BackendSandbox As String
    Dim m_EnPruebas As String
    Dim m_IDAplicacionCfg As Variant
    Dim m_RutaProd As String
    Dim m_RutaLocal As String
    Dim m_BackendPathActivo As String
    Dim m_NombreCampoBackendActivo As String
    Dim m_RutaAplicacionActiva As String
    Dim m_NombreCampoRutaActiva As String
    Dim m_DiagInfra As String

    On Error GoTo errores

    Set m_Db = CurrentDb
    Set m_Rs = m_Db.OpenRecordset("SELECT TOP 1 * FROM TbConfiguracionBackends ORDER BY ID", dbOpenSnapshot)
    If m_Rs.EOF Then
        p_Error = "TbConfiguracionBackends no tiene filas de configuración"
        Err.Raise 1000
    End If

    m_BackendActivo = UCase$(Trim$(Nz(m_Rs.Fields("BackendActivo").Value, "")))
    m_BackendProduccion = Trim$(Nz(m_Rs.Fields("BackendProduccion").Value, ""))
    m_BackendSandbox = Trim$(Nz(m_Rs.Fields("BackendSandbox").Value, ""))
    m_EnPruebas = Trim$(Nz(m_Rs.Fields("EnPruebas").Value, ""))
    m_IDAplicacionCfg = Nz(m_Rs.Fields("IDAplicacion").Value, 0)
    m_RutaProd = Trim$(Nz(m_Rs.Fields("RutaDirectorioAplicacion_PROD").Value, ""))
    m_RutaLocal = Trim$(Nz(m_Rs.Fields("RutaDirectorioAplicacion_LOCAL").Value, ""))

    If m_EnPruebas <> "Sí" And m_EnPruebas <> "No" Then
        p_Error = "EnPruebas debe ser texto 'Sí' o 'No' en TbConfiguracionBackends"
        Err.Raise 1000
    End If

    If m_BackendActivo = "PROD" Then
        Application.TempVars("DatosEnLocal") = "No"
    ElseIf m_BackendActivo = "LOCAL" Or m_BackendActivo = "SANDBOX" Then
        Application.TempVars("DatosEnLocal") = "Sí"
    Else
        p_Error = "BackendActivo inválido en TbConfiguracionBackends. Use PROD/LOCAL/SANDBOX"
        Err.Raise 1000
    End If

    m_BackendPathActivo = SelectBackendPathFromActiveProfile(m_BackendActivo, m_BackendProduccion, m_BackendSandbox, m_NombreCampoBackendActivo)
    m_RutaAplicacionActiva = SelectAppPathFromActiveProfile(m_BackendActivo, m_RutaProd, m_RutaLocal, m_NombreCampoRutaActiva)

    m_RutaProd = SanitizarRutaUsuarioWindowsLocal(m_RutaProd)
    m_RutaLocal = SanitizarRutaUsuarioWindowsLocal(m_RutaLocal)
    m_RutaAplicacionActiva = SanitizarRutaUsuarioWindowsLocal(m_RutaAplicacionActiva)

    m_RutaProd = NormalizeFolderPath(m_RutaProd)
    m_RutaLocal = NormalizeFolderPath(m_RutaLocal)
    m_RutaAplicacionActiva = NormalizeFolderPath(m_RutaAplicacionActiva)

    Application.TempVars("BackendPathConfigurado") = m_BackendPathActivo

    Application.TempVars("BackendPathProduccion") = m_BackendProduccion
    Application.TempVars("BackendPathSandbox") = m_BackendSandbox

    Application.TempVars("BackendActivo") = m_BackendActivo
    Application.TempVars("EnPruebas") = m_EnPruebas

    m_URLRutaAplicacionRemota = m_RutaProd
    m_URLRutaAplicacionLocal = m_RutaLocal
    If m_BackendActivo = "PROD" Then
        m_URLRutaAplicacionRemota = m_RutaAplicacionActiva
    Else
        m_URLRutaAplicacionLocal = m_RutaAplicacionActiva
    End If

    m_URLRutaAplicacionesRemotas = GetParentFolderPath(m_URLRutaAplicacionRemota)
    m_URLRutaAplicacionesLocal = GetParentFolderPath(m_URLRutaAplicacionLocal)

    m_DiagInfra = ""
    If m_BackendPathActivo = "" Then
        Call AppendInfraDiagnostic(m_DiagInfra, m_NombreCampoBackendActivo, m_BackendPathActivo, "Ruta vacía")
    ElseIf Not fso.FileExists(m_BackendPathActivo) Then
        Call AppendInfraDiagnostic(m_DiagInfra, m_NombreCampoBackendActivo, m_BackendPathActivo, "File not found")
    End If

    If m_RutaAplicacionActiva = "" Then
        Call AppendInfraDiagnostic(m_DiagInfra, m_NombreCampoRutaActiva, m_RutaAplicacionActiva, "Ruta vacía")
    ElseIf Not fso.FolderExists(m_RutaAplicacionActiva) Then
        Call AppendInfraDiagnostic(m_DiagInfra, m_NombreCampoRutaActiva, m_RutaAplicacionActiva, "Folder not found")
    End If

    If m_DiagInfra <> "" Then
        p_Error = "INFRA CONFIG FAIL-FAST:" & vbNewLine & m_DiagInfra
        Err.Raise 1000
    End If

    If Not ResolveCacheHabilitadaFromConfig(AplicarCache, p_Error) Then
        Err.Raise 1000
    End If

    If CLng(m_IDAplicacionCfg) > 0 Then
        IDAplicacion = CStr(m_IDAplicacionCfg)
    ElseIf Application.TempVars("EnPruebas") = "Sí" Then
        IDAplicacion = "81"
    Else
        IDAplicacion = "8"
    End If

    LeeConfiguracionLocal = True
    m_Rs.Close
    Set m_Rs = Nothing
    Set m_Db = Nothing
    Exit Function

errores:
    Dim errNumber As Long
    Dim errDescription As String
    errNumber = Err.Number
    errDescription = Err.Description

    On Error Resume Next
    If Not m_Rs Is Nothing Then m_Rs.Close
    On Error GoTo 0
    Set m_Rs = Nothing
    Set m_Db = Nothing

    If errNumber <> 1000 Then
        p_Error = "LeeConfiguracionLocal ha devuelto el error: " & vbNewLine & errDescription
    ElseIf p_Error = "" Then
        p_Error = errDescription
    End If
End Function

Private Function ResolveCacheHabilitadaFromConfig(ByRef p_AplicarCache As Boolean, Optional ByRef p_Error As String) As Boolean
    Dim m_Db As DAO.Database
    Dim m_RsCfg As DAO.Recordset

    On Error GoTo errores
    ResolveCacheHabilitadaFromConfig = False
    p_AplicarCache = False

    Set m_Db = getdb(p_Error, True)
    If m_Db Is Nothing Then
        If p_Error = "" Then p_Error = "No se pudo abrir backend configurado con getdb() para resolver TbConfiguracion.CacheHabilitada"
        GoTo salida
    End If

    Set m_RsCfg = m_Db.OpenRecordset("SELECT TOP 1 CacheHabilitada FROM TbConfiguracion WHERE ID=1", dbOpenSnapshot)

    If m_RsCfg.EOF Then
        p_Error = "TbConfiguracion.ID=1 no existe en backend configurado"
        GoTo salida
    End If

    p_AplicarCache = CBool(Nz(m_RsCfg.Fields("CacheHabilitada").Value, False))
    ResolveCacheHabilitadaFromConfig = True

salida:
    On Error Resume Next
    If Not m_RsCfg Is Nothing Then m_RsCfg.Close
    If Not m_Db Is Nothing Then m_Db.Close
    Set m_RsCfg = Nothing
    Set m_Db = Nothing
    Exit Function

errores:
    p_Error = "ResolveCacheHabilitadaFromConfig ha devuelto el error: " & Err.Description
    Resume salida
End Function

Private Function NormalizeFolderPath(ByVal p_Path As String) As String
    Dim m_Path As String
    m_Path = Trim$(Nz(p_Path, ""))
    If m_Path = "" Then Exit Function
    m_Path = Replace$(m_Path, "/", "\")
    If Right$(m_Path, 1) <> "\" Then m_Path = m_Path & "\"
    NormalizeFolderPath = m_Path
End Function

Public Function SanitizarRutaUsuarioWindowsLocal(ByVal p_Ruta As String, Optional ByVal p_PerfilUsuarioActual As String = "") As String
    Dim m_Ruta As String
    Dim m_UserProfile As String
    Dim m_PosicionInicioSuffix As Long

    m_Ruta = Trim$(Nz(p_Ruta, ""))
    If m_Ruta = "" Then Exit Function

    m_Ruta = Replace$(m_Ruta, "/", "\")

    If Left$(m_Ruta, 2) = "\\" Then
        SanitizarRutaUsuarioWindowsLocal = m_Ruta
        Exit Function
    End If

    If LCase$(Left$(m_Ruta, 9)) <> "c:\users\" Then
        SanitizarRutaUsuarioWindowsLocal = m_Ruta
        Exit Function
    End If

    m_PosicionInicioSuffix = InStr(10, m_Ruta, "\")
    If m_PosicionInicioSuffix = 0 Then
        SanitizarRutaUsuarioWindowsLocal = m_Ruta
        Exit Function
    End If

    If Trim$(p_PerfilUsuarioActual) = "" Then
        m_UserProfile = Trim$(Replace$(Environ$("USERPROFILE"), "/", "\"))
    Else
        m_UserProfile = Trim$(Replace$(p_PerfilUsuarioActual, "/", "\"))
    End If

    If m_UserProfile = "" Then
        SanitizarRutaUsuarioWindowsLocal = m_Ruta
        Exit Function
    End If

    If Right$(m_UserProfile, 1) = "\" Then
        If Len(m_UserProfile) > 1 Then
            m_UserProfile = Left$(m_UserProfile, Len(m_UserProfile) - 1)
        End If
    End If

    If LCase$(Left$(m_UserProfile, 9)) <> "c:\users\" Then
        SanitizarRutaUsuarioWindowsLocal = m_Ruta
        Exit Function
    End If

    SanitizarRutaUsuarioWindowsLocal = m_UserProfile & Mid$(m_Ruta, m_PosicionInicioSuffix)
End Function

Private Function GetParentFolderPath(ByVal p_AppPath As String) As String
    Dim m_AppPath As String
    Dim m_Folder As String

    m_AppPath = NormalizeFolderPath(p_AppPath)
    If m_AppPath = "" Then Exit Function

    On Error GoTo salida
    m_Folder = fso.GetParentFolderName(Left$(m_AppPath, Len(m_AppPath) - 1))
    If m_Folder <> "" Then
        If Right$(m_Folder, 1) <> "\" Then m_Folder = m_Folder & "\"
        GetParentFolderPath = m_Folder
    End If
salida:
End Function

Private Function SelectBackendPathFromActiveProfile(ByVal p_BackendActivo As String, ByVal p_BackendProduccion As String, ByVal p_BackendSandbox As String, ByRef p_FieldName As String) As String
    If UCase$(Trim$(p_BackendActivo)) = "PROD" Then
        p_FieldName = "BackendProduccion"
        SelectBackendPathFromActiveProfile = Trim$(Nz(p_BackendProduccion, ""))
    Else
        p_FieldName = "BackendSandbox"
        SelectBackendPathFromActiveProfile = Trim$(Nz(p_BackendSandbox, ""))
    End If
End Function

Private Function SelectAppPathFromActiveProfile(ByVal p_BackendActivo As String, ByVal p_RutaProd As String, ByVal p_RutaLocal As String, ByRef p_FieldName As String) As String
    If UCase$(Trim$(p_BackendActivo)) = "PROD" Then
        p_FieldName = "RutaDirectorioAplicacion_PROD"
        SelectAppPathFromActiveProfile = Trim$(Nz(p_RutaProd, ""))
    Else
        p_FieldName = "RutaDirectorioAplicacion_LOCAL"
        SelectAppPathFromActiveProfile = Trim$(Nz(p_RutaLocal, ""))
    End If
End Function

Private Sub AppendInfraDiagnostic(ByRef p_Diagnostic As String, ByVal p_FieldName As String, ByVal p_Path As String, ByVal p_Cause As String)
    Dim m_Line As String
    m_Line = "- Campo=" & p_FieldName & "; Ruta=" & p_Path & "; Causa=" & p_Cause
    If p_Diagnostic = "" Then
        p_Diagnostic = m_Line
    Else
        p_Diagnostic = p_Diagnostic & vbNewLine & m_Line
    End If
End Sub
Public Function EVE(Optional ByRef p_Error As String) As String

    Dim m_NombreCarpeta As String
    Dim m_NombreCampo As Variant
    Dim m_ValorCampo As String
    Dim m_TipoCampo As String
    Dim m_Objeto As Object
    Dim t1 As Single
    Dim t2 As Single
    Dim objNetwork As Object
    Dim m_Command As String
    Dim m_UsuarioLogeadoEnOrdenador As String
    Dim ColErrores As New Collection
    Dim m_ID As Variant
    On Error GoTo errores
    
    
    t1 = Timer
    Avance "Obteniendo variables de Entorno..."
    Application.TempVars.RemoveAll
    Application.TempVars("DiasAvisoAnesDeCierrePrevisto") = "15"
    Application.TempVars("ColorEtiquetaMenuSinPulsar") = 8210719
    Application.TempVars("ColorEtiquetaMenuPulsado ") = 26367
    
    Application.TempVars("DatosEnLocal") = "No"
    'Application.TempVars("DatosEnLocal") = "Sí"
    Application.TempVars("EnDesarrollo") = "No"
    'Application.TempVars("EnDesarrollo") = "Sí"
    Application.TempVars("EnPruebas") = "No"
    'Application.TempVars("EnPruebas") = "Sí"
    Application.TempVars("CadenaCorreosCalidadEnPruebas") = "mario.martinabad@telefonica.com;beatriz.novalgutierrez@telefonica.com"
    'Application.TempVars("CadenaCorreosCalidadEnPruebas") = "andres.romandelperal@telefonica.com"
    Application.TempVars("NombreCSSEnPruebas") = "CSS_pruebas.txt"
    Application.TempVars("NombreCSSNoPruebas") = "CSS.txt"
    'AplicarCache = True
    Call LeeConfiguracionLocal(p_Error)
    If p_Error <> "" Then Err.Raise 1000
    If IDAplicacion = "" Then
        If Application.TempVars("EnPruebas") = "Sí" Then
            IDAplicacion = "81"
        Else
            IDAplicacion = "8"
        End If
    End If
    
    Set m_ObjEntorno = New entorno
    p_Error = ""
    Call m_ObjEntorno.ValidarInfraCritica(p_Error)
    If p_Error <> "" Then Err.Raise 1000
    m_Command = Nz(VBA.Command, "")
    Avance "Obteniendo variables de Entorno... En Oficina"
    
    
    'm_Command = "juan.jerezgarcia@telefonica.com"
    'm_Command = "andres.romandelperal@telefonica.com"
    'm_Command = "anamaria.rubiocanales@telefonica.com"
    'm_Command = "mario.martinabad@telefonica.com"
    'm_Command = "sergio.garciamontalvo@telefonica.com"
    'm_Command = "natalia.casangarcia@telefonica.com"
    'm_Command = "beatriz.novalgutierrez@telefonica.com"
    'm_Command = "rosamaria.fuentesherrero@telefonica.com"
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
    If m_ObjUsuarioConectado Is Nothing Then
        p_Error = "No se ha podido determinar el usuario que está usando la herramienta"
        Err.Raise 1000
    End If
    If m_ObjUsuarioConectadoInicialmente Is Nothing Then
        Set m_ObjUsuarioConectadoInicialmente = m_ObjUsuarioConectado
    End If
    Avance "Obteniendo variables de Entorno... Grupos de Usuarios"
    With m_ObjUsuarioConectado
        EsAdministrador = .EsAdministradorCalculado
        If EsAdministrador = EnumSino.Sí Then
            EsTecnico = EnumSino.No
            EsCalidad = EnumSino.No
            GoTo siguiente
        End If
        EsCalidad = .EsUsuarioCalidadCalculado
        If EsCalidad = EnumSino.Sí Then
            EsAdministrador = EnumSino.No
            EsTecnico = EnumSino.No
            EsCalidad = EnumSino.Sí
            GoTo siguiente
        End If
        EsTecnico = EnumSino.Sí
        
    End With
siguiente:
    If Application.TempVars("EnPruebas") = "Sí" Then
        m_EnOficina = EnumSino.No
    Else
        m_EnOficina = EnOficina(p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    For Each m_NombreCampo In m_ObjEntorno.ColItems
        'Debug.Print m_NombreCampo
        'If CStr(m_NombreCampo) = "ColEstadosARTitulo" Then Stop
        
        Avance "Obteniendo variables de Entorno..." & m_NombreCampo
        m_TipoCampo = m_ObjEntorno.ColItems(m_NombreCampo)
        If m_TipoCampo = "o" Then
            Set m_Objeto = m_ObjEntorno.getPropiedad(m_NombreCampo, p_Error)
            If p_Error <> "" Then
                ColErrores.Add m_NombreCampo
                p_Error = ""
            End If
            
        Else
            m_ValorCampo = m_ObjEntorno.getPropiedad(m_NombreCampo, p_Error)
            If p_Error <> "" Then
                ColErrores.Add m_NombreCampo
                p_Error = ""
            End If
            
        End If
    Next
    If ColErrores.count > 0 Then
        p_Error = "Ha habido errores al inicio" & vbNewLine
        For Each m_ID In ColErrores
            p_Error = p_Error & m_ID & vbNewLine
        Next
        Err.Raise 1000
    End If
    m_SQLAlInicioSegTareasProyectos = "SELECT TbNCAccionesRealizadas.IDAccionRealizada, " & _
            "TbNCAccionesRealizadas.IDAccionCorrectiva, TbNoConformidades.IDNoConformidad, " & _
            "TbNCAccionesRealizadas.FechaFinReal, " & _
            "[CodigoNoConformidad] & '(Nº AC ' & [TbNCAccionCorrectivas].[NAccion] & ') ' & [AccionRealizada] AS Tarea, " & _
            "TbTiposNCProyectos.Tipologia AS TipoNC, TbUsuariosAplicaciones.Nombre AS Tecnico, " & _
            "TbNoConformidades.RESPONSABLECALIDAD AS RespCalidad, TbNoConformidades.IDExpediente, " & _
            "TbNCAccionesRealizadas.ESTADO, TbNCAccionesRealizadas.FechaInicio, " & _
            "TbNCAccionesRealizadas.FechaFinPrevista, TbNCAccionesRealizadas.NAccion " & _
            "FROM (TbNoConformidades INNER JOIN (TbNCAccionCorrectivas INNER JOIN (TbNCAccionesRealizadas " & _
            "LEFT JOIN TbUsuariosAplicaciones ON TbNCAccionesRealizadas.Responsable = TbUsuariosAplicaciones.UsuarioRed) " & _
            "ON TbNCAccionCorrectivas.IDAccionCorrectiva = TbNCAccionesRealizadas.IDAccionCorrectiva) " & _
            "ON TbNoConformidades.IDNoConformidad = TbNCAccionCorrectivas.IDNoConformidad) " & _
            "LEFT JOIN TbTiposNCProyectos ON TbNoConformidades.IDTipo = TbTiposNCProyectos.IDTipo "
    
    m_SQLAlInicioSegTareasAuditorias = "SELECT TbNCAuditoriaAccionesRealizadas.IDAccionRealizada, " & _
            "TbNoConformidadesAuditoria.ID, TbNCAuditoriaAccionesRealizadas.IDAccionCorrectiva, " & _
            "TbNoConformidadesAuditoria.RESPONSABLEIMPLANTACION AS Responsable, TbNCAuditoriaAccionesRealizadas.ESTADO, " & _
            "TbNoConformidadesAuditoria.Tipo as TipoNC, TbNCAuditoriaAccionesRealizadas.FechaInicio, " & _
            "TbNCAuditoriaAccionesRealizadas.NAccion, TbNCAuditoriaAccionesRealizadas.FechaFinPrevista, " & _
            "TbNCAuditoriaAccionesRealizadas.FechaFinReal, " & _
            "Format(Year([TbAuditorias].[FechaInicio]),'0000') & '_' & TbAuditorias.Tipo AS Auditoria, " & _
            "TbNCAuditoriaAccionesRealizadas.AccionRealizada AS tarea,TbNoConformidadesAuditoria.Numero " & _
            "FROM TbAuditorias INNER JOIN (TbNoConformidadesAuditoria INNER JOIN (TbNCAuditoriaAccionCorrectivas " & _
            "INNER JOIN TbNCAuditoriaAccionesRealizadas " & _
            "ON TbNCAuditoriaAccionCorrectivas.IDAccionCorrectiva = TbNCAuditoriaAccionesRealizadas.IDAccionCorrectiva) " & _
            "ON TbNoConformidadesAuditoria.ID = TbNCAuditoriaAccionCorrectivas.ID) " & _
            "ON TbAuditorias.IDAuditoria = TbNoConformidadesAuditoria.IDAuditoria "
    m_SQLAlInicioSegNCProyectos = "SELECT TbNoConformidades.IDNoConformidad, TbNoConformidades.CodigoNoConformidad, " & _
            "TbNoConformidades.DESCRIPCION, TbExpedientes.Nemotecnico, TbNoConformidades.ESTADO, " & _
            "TbNoConformidades.RESPONSABLECALIDAD AS NombreCalidad, TbUsuariosAplicaciones.Nombre AS Tecnico, " & _
            "TbNoConformidades.IDExpediente, TbNoConformidades.RequiereControlEficacia, " & _
            "TbNoConformidades.ResultadoControlEficacia, TbNoConformidades.FECHACIERRE " & _
            "FROM (TbNoConformidades LEFT JOIN TbExpedientes ON TbNoConformidades.IDExpediente = TbExpedientes.IDExpediente) " & _
            "LEFT JOIN TbUsuariosAplicaciones ON TbNoConformidades.RESPONSABLETELEFONICA = TbUsuariosAplicaciones.UsuarioRed; "
    t2 = Timer
    EVE = "Variables establecidas correctamente en : " & t2 - t1
    Application.Echo True
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "EVE ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    Debug.Print p_Error
End Function


Public Function LeerIni( _
                        key As String, _
                        Default As Variant, _
                        Optional ByRef p_Error As String _
                        ) As String
    
    Dim m_URLIni As String
    Dim bufer As String * 256
    Dim Len_Value As Long
    
    On Error GoTo errores
    
    m_URLIni = m_ObjEntorno.URLArchivoIni
    p_Error = m_ObjEntorno.Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Len_Value = GetPrivateProfileString(fso.GetBaseName(m_URLIni), _
                                         key, _
                                         Default, _
                                         bufer, _
                                         Len(bufer), _
                                         m_URLIni)
          
    LeerIni = Left$(bufer, CLng(Len_Value))
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "LeerIni ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function

