VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteDTO"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public Expediente As Expediente

Public ColAnualidades As Scripting.Dictionary
Public ColCodCompras As Scripting.Dictionary
Public ColComerciales As Scripting.Dictionary
Public ColCPVs As Scripting.Dictionary
Public ColPECALES As Scripting.Dictionary
Public ColRACs As Scripting.Dictionary
Public ColAnexos As Scripting.Dictionary
Public ColLugaresEjecucion As Scripting.Dictionary
Public ColResponsables As Scripting.Dictionary


Public ColHitos As Scripting.Dictionary
Public ColModificados As Scripting.Dictionary
Public ColArbolSuministradores As Scripting.Dictionary ' Para almacenar ExpedienteSuministrador en memoria durante el alta
Public Error As String
Private m_Error As String




Private Sub Class_Initialize()
    Set ColArbolSuministradores = New Scripting.Dictionary
    ColArbolSuministradores.CompareMode = TextCompare
End Sub
