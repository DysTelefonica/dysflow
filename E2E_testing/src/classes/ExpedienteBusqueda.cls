VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteBusqueda"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public IDExpediente As String
Public PalabraClave As String
Public ESTADO As String
Public Suministrador As String
Public PECAL As String
Public GradoClasificacion As String
Public CodExp As String
Public responsableCalidad As String
Public responsableSeguridad As String
Public Comercial As String
Public jp As String
Public RAC As String
Public m_EnumAmbito As EnumAmbito
Public m_EnumPostAgedoCombo As EnumPostAgedoCombo
Public Error As String
Private m_Error As String




