Attribute VB_Name = "ListarModulos"
Option Compare Database
Option Explicit

Public Sub ListarTodosLosModulos()
    Dim vbComp As VBComponent
    Dim s As String
    Dim Tipo As String
    
    For Each vbComp In Application.VBE.ActiveVBProject.VBComponents
        Select Case vbComp.Type
            Case vbext_ct_ClassModule: Tipo = "CLS"
            Case vbext_ct_StdModule: Tipo = "BAS"
            Case vbext_ct_MSForm: Tipo = "FORM"
            Case Else: Tipo = "OTRO"
        End Select
        s = s & Tipo & vbTab & vbComp.Name & vbCrLf
    Next vbComp
    
    Debug.Print "=== LISTADO DE COMPONENTES VBA ==="
    Debug.Print "TIPO" & vbTab & "NOMBRE"
    Debug.Print "-------------------------------"
    Debug.Print s
    Debug.Print "=== FIN ==="
End Sub
