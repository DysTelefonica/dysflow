 Option Compare Database
Option Explicit

Private m_Error As String

Private Function GetNCAObjeto() As Object
    On Error Resume Next
    Dim frmParent As Form
    Set GetNCAObjeto = Nothing
    
    ' With acDialog, Screen.PreviousForm gives the form that opened this popup
    Set frmParent = Screen.PreviousForm
    If frmParent Is Nothing Then Exit Function
    
    ' Try to get the NC object from the parent form
    On Error Resume Next
    Set GetNCAObjeto = frmParent!m_ObjNCProyectoActiva
    If Not GetNCAObjeto Is Nothing Then Exit Function
    
    Set GetNCAObjeto = frmParent!m_ObjNCAuditoriaActiva
End Function

Private Sub Form_Load()
    On Error Resume Next
    Dim objNC As Object
    Set objNC = GetNCAObjeto()
    If Not objNC Is Nothing Then
        Me.MotivoNoRequiereControlEficacia = Nz(objNC.MotivoNoRequiereControlEficacia, "")
    End If
End Sub

Private Sub ComandoRegistrar_Click()
    On Error Resume Next
    Dim objNC As Object
    Set objNC = GetNCAObjeto()
    If Not objNC Is Nothing Then
        objNC.MotivoNoRequiereControlEficacia = Nz(Me.MotivoNoRequiereControlEficacia, "")
    End If
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Private Sub cmdSalir_Click()
    On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub