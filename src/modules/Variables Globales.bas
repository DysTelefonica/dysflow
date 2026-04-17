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

Public m_ObjEntorno As Entorno

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


Public m_ObjNCProyectoActiva As NCProyecto
Public m_ObjNCProyectoActivaPVinculada As NCProyecto
Public m_ObjACProyectoActiva As ACProyecto
Public m_ObjARProyectoActiva As ARProyecto
Public m_ObjDocumentoProyectoActivo As DocumentoProyecto
Public m_ObjTipologiaProyectoActiva As TipologiaNCProyectos
Public m_ObjLogProyectoActivo As LogNCProyecto
Public m_ObjLogAuditoriaActivo As LogNCAuditoria

Public m_ObjAuditoriaActiva As Auditoria
Public m_ObjNCAuditoriaActiva As NCAuditoria
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


    
    
Public Function getdb( _
                        Optional ByRef p_Error As String _
                        ) As DAO.Database
    
    Dim m_URL As String
    On Error GoTo errores
    
    If Application.TempVars("DatosEnLocal") = "Sí" Then
        m_URL = m_URLRutaAplicacionesLocal & "000datoslocal\NoConformidades_Datos.accdb"
    ElseIf Application.TempVars("DatosEnLocal") = "No" Then
        m_URL = m_URLRutaAplicacionRemota & "NoConformidades_Datos.accdb"
    Else
        p_Error = "No se conoce el origen de los datos"
        Err.Raise 1000
    End If
    
    Set wks = DBEngine.Workspaces(0)
    Set db = wks.OpenDatabase(m_URL, False, False, "MS Access;PWD=" & "dpddpd" & "")
    Set getdb = db
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getdb ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function getdbNCPruebas( _
                        Optional ByRef p_Error As String _
                        ) As DAO.Database
    
    Dim m_URL As String
    On Error GoTo errores
    
    m_URL = "\\datoste\aplicaciones_dys\Aplicaciones PpD\No Conformidades Prueba\NoConformidades_Datos.accdb"
    
    Set wks = DBEngine.Workspaces(0)
    Set db = wks.OpenDatabase(m_URL, False, False, "MS Access;PWD=" & "dpddpd" & "")
    Set getdbNCPruebas = db
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getdbNCPruebas ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function getdbNCProduccion( _
                                    Optional ByRef p_Error As String _
                                    ) As DAO.Database
    
    Dim m_URL As String
    On Error GoTo errores
    
    m_URL = "\\datoste\aplicaciones_dys\Aplicaciones PpD\No Conformidades\NoConformidades_Datos.accdb"
    
    Set wks = DBEngine.Workspaces(0)
    Set db = wks.OpenDatabase(m_URL, False, False, "MS Access;PWD=" & "dpddpd" & "")
    Set getdbNCProduccion = db
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getdbNCProduccion ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function getdbLanzadera( _
                                Optional ByRef p_Error As String _
                                ) As DAO.Database
    
    Dim m_URL As String
    On Error GoTo errores
    
    If Application.TempVars("DatosEnLocal") = "Sí" Then
        m_URL = m_URLRutaAplicacionesLocal & "000datoslocal\Lanzadera_Datos.accdb"
    ElseIf Application.TempVars("DatosEnLocal") = "No" Then
        m_URL = m_URLRutaAplicacionesRemotas & "0Lanzadera\Lanzadera_Datos.accdb"
    Else
        p_Error = "No se conoce el origen de los datos"
        Err.Raise 1000
    End If
   
    
    
    Set wks = DBEngine.Workspaces(0)
    Set db1 = wks.OpenDatabase(m_URL, False, False, "MS Access;PWD=" & "dpddpd" & "")
    Set getdbLanzadera = db1
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getdbLanzadera ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function getdbCorreo( _
                                Optional ByRef p_Error As String _
                                ) As DAO.Database
    
    Dim m_URL As String
        
    On Error GoTo errores
    
    If Application.TempVars("DatosEnLocal") = "Sí" Then
        m_URL = m_URLRutaAplicacionesLocal & "000datoslocal\Correos_datos.accdb"
    ElseIf Application.TempVars("DatosEnLocal") = "No" Then
        m_URL = m_URLRutaAplicacionesRemotas & "00Recursos\Correos_datos.accdb"
    Else
        p_Error = "No se sabe si se está usando en local o en remoto"
        Err.Raise 1000
    End If
    
       
    If Not fso.FileExists(m_URL) Then
        p_Error = "No se alcanza la URL de los datos: " & vbNewLine & m_URL
        Err.Raise 1000
    End If
    
    Set wks = DBEngine.Workspaces(0)
    Set db1 = wks.OpenDatabase(m_URL, False, False, "MS Access;PWD=" & "dpddpd" & "")
    Set getdbCorreo = db1
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getdbCorreo ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function getdbExpedientes(Optional ByRef p_Error As String) As DAO.Database
    Dim m_URL As String
    On Error GoTo errores
   
    If Application.TempVars("DatosEnLocal") = "Sí" Then
        m_URL = m_URLRutaAplicacionesLocal & "000datoslocal\Expedientes_datos.accdb"
    ElseIf Application.TempVars("DatosEnLocal") = "No" Then
        m_URL = m_URLRutaAplicacionesRemotas & "EXPEDIENTES\Expedientes_datos.accdb"
    Else
        p_Error = "No se conoce el origen de los datos"
        Err.Raise 1000
    End If
    Set wks = DBEngine.Workspaces(0)
    Set db = wks.OpenDatabase(m_URL, False, False, "MS Access;PWD=" & "dpddpd" & "")
    Set getdbExpedientes = db
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getdbExpedientes ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function getdbRiesgos(Optional ByRef p_Error As String) As DAO.Database
    Dim m_URL As String
    On Error GoTo errores
   
    If Application.TempVars("DatosEnLocal") = "Sí" Then
        m_URL = m_URLRutaAplicacionesLocal & "000datoslocal\Gestion_Riesgos_Datos.accdb"
    ElseIf Application.TempVars("DatosEnLocal") = "No" Then
        m_URL = m_URLRutaAplicacionesRemotas & "GESTION RIESGOS\Gestion_Riesgos_Datos.accdb"
    Else
        p_Error = "No se conoce el origen de los datos"
        Err.Raise 1000
    End If
    Set wks = DBEngine.Workspaces(0)
    Set db = wks.OpenDatabase(m_URL, False, False, "MS Access;PWD=" & "dpddpd" & "")
    Set getdbRiesgos = db
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getdbRiesgos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
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
    AplicarCache = False
    'AplicarCache = True
    If Application.TempVars("EnPruebas") = "Sí" Then
        IDAplicacion = "81"
    Else
        IDAplicacion = "8"
    End If
    
    Set m_ObjEntorno = New Entorno
     m_URLRutaAplicacionesRemotas = "\\datoste\aplicaciones_dys\Aplicaciones PpD\"
    If Application.TempVars("EnPruebas") = "Sí" Then
        m_NombreCarpeta = "No Conformidades PRUEBA"
    Else
        m_NombreCarpeta = "No Conformidades"
    End If
    
    m_URLRutaAplicacionRemota = m_URLRutaAplicacionesRemotas & m_NombreCarpeta & "\"
    If Application.TempVars("DatosEnLocal") = "Sí" Then
        m_URLRutaAplicacionesLocal = getRutaAplicacionesLocal(p_Error)
        If m_URLRutaAplicacionesLocal <> "" Then
            m_URLRutaAplicacionLocal = m_URLRutaAplicacionesLocal & m_NombreCarpeta & "\"
        End If
    Else
       m_URLRutaAplicacionesLocal = ""
       m_URLRutaAplicacionLocal = ""
    End If
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





