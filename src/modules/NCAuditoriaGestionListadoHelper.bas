Attribute VB_Name = "NCAuditoriaGestionListadoHelper"
Option Compare Database
Option Explicit

' SDD audit-gestion-cache-helper Slice 1.
' Minimal compile seam only: behavior is intentionally RED/not implemented.

Public Function GetNCAuditoriaGestionFiltradas( _
    Optional ByVal p_IDAuditoria As Long = 0, _
    Optional ByVal p_Tipo As String = "", _
    Optional ByVal p_Descripcion As String = "", _
    Optional ByVal p_ResponsableImplantacion As String = "", _
    Optional ByVal p_Estado As String = "", _
    Optional ByVal p_PalabraClave As String = "", _
    Optional ByVal p_RequiereControlEficacia As String = "", _
    Optional ByVal p_ControlEficaciaRelleno As String = "", _
    Optional ByVal p_CacheEnabled As Variant, _
    Optional ByRef p_Error As String _
    ) As Collection

    p_Error = "Not implemented: GetNCAuditoriaGestionFiltradas"
End Function

Public Function BuildNCAuditoriaGestionListRow( _
    ByVal p_Item As Object, _
    Optional ByRef p_Error As String _
    ) As String

    p_Error = "Not implemented: BuildNCAuditoriaGestionListRow"
End Function

Public Function ResolveNCAuditoriaGestionSelection( _
    ByVal p_Current As NCAuditoria, _
    ByVal p_SelectedID As String, _
    Optional ByRef p_Error As String _
    ) As NCAuditoria

    p_Error = "Not implemented: ResolveNCAuditoriaGestionSelection"
End Function

Public Function BuildNCAuditoriaGestionReportCollection( _
    ByVal p_ListedItems As Collection, _
    Optional ByRef p_Error As String _
    ) As Scripting.Dictionary

    p_Error = "Not implemented: BuildNCAuditoriaGestionReportCollection"
End Function

Public Sub RefreshNCAuditoriaGestionCaches(Optional ByRef p_Error As String)
    p_Error = "Not implemented: RefreshNCAuditoriaGestionCaches"
End Sub
