Attribute VB_Name = "CacheTrustDiagnostics"
Option Compare Database
Option Explicit

Private m_FallbackCount As Long
Private m_BlockFallback As Boolean
Private m_LastBoundary As String

Public Sub Reset(Optional ByVal p_BlockFallback As Boolean = False)
    m_FallbackCount = 0
    m_LastBoundary = vbNullString
    m_BlockFallback = p_BlockFallback
End Sub

Public Sub RecordFallback(ByVal p_Boundary As String)
    m_FallbackCount = m_FallbackCount + 1
    m_LastBoundary = p_Boundary

    If m_BlockFallback Then
        Err.Raise 1001, "CacheTrustDiagnostics.RecordFallback", _
            "Unexpected DAO fallback at " & p_Boundary
    End If
End Sub

Public Property Get FallbackCount() As Long
    FallbackCount = m_FallbackCount
End Property

Public Property Get LastBoundary() As String
    LastBoundary = m_LastBoundary
End Property
