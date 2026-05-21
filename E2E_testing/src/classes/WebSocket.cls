VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "WebSocket"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Private WithEvents doc As HTMLDocument
Attribute doc.VB_VarHelpID = -1
Private WithEvents browser As WebBrowserControl
Attribute browser.VB_VarHelpID = -1
Private WithEvents notificacion As TextBox
Attribute notificacion.VB_VarHelpID = -1
Private WithEvents webscript As HTMLScriptElement
Attribute webscript.VB_VarHelpID = -1
Private WithEvents webExe As HTMLScriptElement
Attribute webExe.VB_VarHelpID = -1

Public Sub Inicializar(wbc As WebBrowserControl, txt As TextBox)
    Set browser = wbc.Object
    Set notificacion = txt
    wbc.ControlSource = """about:blank"""
    EsperarACargar
    Set webscript = doc.createElement("script")
    webscript.src = "https://www.gstatic.com/firebasejs/4.12.1/firebase.js"
    
    
End Sub
Public Sub EsperarACargar()
    Do While browser.ReadyState <> acComplete
        DoEvents
    Loop
    
End Sub
