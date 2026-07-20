VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "WithEventsFixture"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Private WithEvents m_Application As Access.Application
Attribute m_Application.VB_VarHelpID = -1
Private WithEvents m_Form As Access.Form
Attribute m_Form.VB_VarHelpID = -1
Private WithEvents m_Report As Access.Report
Attribute m_Report.VB_VarHelpID = -1

Public Sub ResetHandlers()
    Set m_Application = Nothing
    Set m_Form = Nothing
    Set m_Report = Nothing
End Sub
