Attribute VB_Name = "ListarModulos"
Option Compare Database
Option Explicit

Public Sub ListarTodosLosModulos()
    Dim vbComp As VBComponent
    Dim s As String
    Dim tipo As String
    
    For Each vbComp In Application.VBE.ActiveVBProject.VBComponents
        Select Case vbComp.Type
            Case vbext_ct_ClassModule: tipo = "CLS"
            Case vbext_ct_StdModule: tipo = "BAS"
            Case vbext_ct_MSForm: tipo = "FORM"
            Case Else: tipo = "OTRO"
        End Select
        s = s & tipo & vbTab & vbComp.Name & vbCrLf
    Next vbComp
    
    Debug.Print "=== LISTADO DE COMPONENTES VBA ==="
    Debug.Print "TIPO" & vbTab & "NOMBRE"
    Debug.Print "-------------------------------"
    Debug.Print s
    Debug.Print "=== FIN ==="
End Sub
