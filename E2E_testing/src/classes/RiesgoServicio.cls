VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "RiesgoServicio"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

' Obtiene la lista de riesgos que el usuario puede elegir (misma edición, mismo expediente)
Public Function ListarRiesgosCandidatos(ByRef p_NC As ncProyecto, ByRef p_Error As String) As Scripting.Dictionary
    If p_NC Is Nothing Then
        p_Error = "NC no inicializada."
        Exit Function
    End If
    
    If Nz(p_NC.IDExpediente, 0) = 0 Then
        p_Error = "La No Conformidad no tiene un expediente asignado."
        Exit Function
    End If
    
    Set ListarRiesgosCandidatos = RiesgoRepositorio.GetRiesgosDisponibles(CLng(p_NC.IDExpediente), p_Error)
End Function

' Procesa la actualización de riesgos asociados
Public Function ActualizarRiesgosNC(ByVal p_IDNC As Long, ByRef p_ColRiesgosSeleccionados As Collection, ByRef p_Error As String) As Boolean
    Dim colIDs As New Collection
    Dim m_Riesgo As riesgo
    
    On Error GoTo errores
    
    ' Extraemos solo los IDs para el repositorio
    If Not p_ColRiesgosSeleccionados Is Nothing Then
        For Each m_Riesgo In p_ColRiesgosSeleccionados
            colIDs.Add m_Riesgo.idRiesgo
        Next
    End If
    
    ' Llamamos al repositorio
    RiesgoRepositorio.GuardarAsociaciones p_IDNC, colIDs, p_Error
    If p_Error <> "" Then GoTo errores
    
    ' Log de la operación (usando tu función global)
    RegistrarLogProyecto "Vínculo de Riesgos", "Se han actualizado los riesgos asociados a la NC " & p_IDNC
    
    ActualizarRiesgosNC = True
    Exit Function

errores:
    If p_Error = "" Then p_Error = Err.Description
    ActualizarRiesgosNC = False
End Function

' Genera la cadena de texto para el campo CodigoRiesgo de la tabla principal
' (Mantenemos compatibilidad con tu campo de texto actual en TbNoConformidades)
Public Sub SincronizarCampoTextoNC(ByVal p_IDNC As Long, ByRef p_Error As String)
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim strCadena As String
    
    Set m_Col = RiesgoRepositorio.GetRiesgosAsociados(p_IDNC, p_Error)
    If Not m_Col Is Nothing Then
        For Each m_ID In m_Col
            strCadena = strCadena & IIf(strCadena = "", "", "|") & m_Col(m_ID).CodigoRiesgo
        Next
    End If
    
    ' Actualizamos el campo denormalizado en la tabla principal
    getdb().Execute "UPDATE TbNoConformidades SET CodigoRiesgo = '" & strCadena & "' WHERE IDNoConformidad = " & p_IDNC
End Sub

