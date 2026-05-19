 Option Compare Database
Option Explicit

Private m_Error As String

Private Function GetNCAObjeto() As Object
    On Error Resume Next
    Set GetNCAObjeto = Nothing

    ' HOTFIX-20260519: Screen.PreviousForm no existe en Access.
    ' El popup trabaja sobre los objetos activos globales del flujo NC.
    Set GetNCAObjeto = m_ObjNCProyectoActiva
    If Not GetNCAObjeto Is Nothing Then Exit Function

    Set GetNCAObjeto = m_ObjNCAuditoriaActiva
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
