VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "NCProyectoVM"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

' ============================================
' NCProyectoVM — ViewModel para formularios NCProyecto
' ============================================
' Thin ViewModel: solo transforma datos entre Service y Form.
' NO getdb(), NO SQL, NO lógica de negocio.

Private m_Service As NCProyectoServicio
Private m_NC As NCProyecto

' ============================================
' CARGAR POR ID
' ============================================
' Carga una NC desde el servicio (usa caché/constructor).
' ============================================
Public Sub CargarPorID(p_IDNC As Long)
    Set m_Service = New NCProyectoServicio
    Set m_NC = constructor.getNCProyecto(p_IDNC:=CStr(p_IDNC), p_Error:=vbNullString)
End Sub

' ============================================
' GUARDAR
' ============================================
' Delegado al servicio. Recibe NC ya editada en formulario.
' ============================================
Public Sub Guardar(p_NC As NCProyecto, Optional ByRef p_Error As String)
    Set m_Service = New NCProyectoServicio
    Set m_Service.nc = p_NC
    m_Service.RegistrarDatosUnicos , p_Error
End Sub

' ============================================
' ENTIDAD
' ============================================
Public Property Get Entidad() As NCProyecto
    Set Entidad = m_NC
End Property

Public Property Get EstaCargado() As Boolean
    EstaCargado = Not m_NC Is Nothing
End Property
