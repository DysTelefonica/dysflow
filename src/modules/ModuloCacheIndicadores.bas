VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ModuloCacheIndicadores"
Option Compare Database
Option Explicit

' ============================================================
' ModuloCacheIndicadores — Cache global en memoria para
' indicadores de Proyecto y Auditoria.
'
' Cada bucket es un Scripting.Dictionary con objetos domain.
' El cache sobrevive al cierre de formularios porque vive
' en variables de modulo (nivel VBA project), no en objetos.
'
' Para invalidar: llamar a Cache_InvalidarTodo() o
'   Cache_InvalidarProyecto() / Cache_InvalidarAuditoria()
' ============================================================

' — Enumeracion de buckets —
Public Enum EnumBucketCache
    EnumBucket_TAR_PROY_PTE_REPLAN = 1
    EnumBucket_NC_PROY_REGISTRADAS
    EnumBucket_NC_PROY_SIN_TAREAS
    EnumBucket_NC_PROY_PTE_CE
    EnumBucket_NC_PROY_CE_CADUCADA
    EnumBucket_NC_PROY_CE_NO_CONFORME
    EnumBucket_TAR_AUD_PTE_REPLAN
    EnumBucket_NC_AUD_REGISTRADAS
    EnumBucket_NC_AUD_SIN_TAREAS
    EnumBucket_NC_AUD_PTE_CE
    EnumBucket_NC_AUD_CE_CADUCADA
    EnumBucket_NC_AUD_CE_NO_CONFORME
End Enum

' — Buckets para PROYECTO —
Public Const BUCKET_TAR_PROY_PTE_REPLAN As String = "TAR_PROY_PTE_REPLAN"
Public Const BUCKET_NC_PROY_REGISTRADAS As String = "NC_PROY_REGISTRADAS"
Public Const BUCKET_NC_PROY_SIN_TAREAS As String = "NC_PROY_SIN_TAREAS"
Public Const BUCKET_NC_PROY_PTE_CE As String = "NC_PROY_PTE_CE"
Public Const BUCKET_NC_PROY_CE_CADUCADA As String = "NC_PROY_CE_CADUCADA"
Public Const BUCKET_NC_PROY_CE_NO_CONFORME As String = "NC_PROY_CE_NO_CONFORME"

' — Buckets para AUDITORIA —
Public Const BUCKET_TAR_AUD_PTE_REPLAN As String = "TAR_AUD_PTE_REPLAN"
Public Const BUCKET_NC_AUD_REGISTRADAS As String = "NC_AUD_REGISTRADAS"
Public Const BUCKET_NC_AUD_SIN_TAREAS As String = "NC_AUD_SIN_TAREAS"
Public Const BUCKET_NC_AUD_PTE_CE As String = "NC_AUD_PTE_CE"
Public Const BUCKET_NC_AUD_CE_CADUCADA As String = "NC_AUD_CE_CADUCADA"
Public Const BUCKET_NC_AUD_CE_NO_CONFORME As String = "NC_AUD_CE_NO_CONFORME"

' ============================================================
' Variables privadas de modulo (surviven al cierre de forms)
' ============================================================
Private m_CacheProyecto As Scripting.Dictionary
Private m_CacheAuditoria As Scripting.Dictionary

' ============================================================
' Mapa de buckets -> constructor.get*() para PROYECTO
' ============================================================
Private Function Cache_Proyecto_GetConstructorFunc(p_Bucket As String) As String
    Select Case p_Bucket
        Case BUCKET_TAR_PROY_PTE_REPLAN:   Cache_Proyecto_GetConstructorFunc = "getSegsTareasProyectoPteReplanificar"
        Case BUCKET_NC_PROY_REGISTRADAS:    Cache_Proyecto_GetConstructorFunc = "getSegsNCProyectoRegistradas"
        Case BUCKET_NC_PROY_SIN_TAREAS:     Cache_Proyecto_GetConstructorFunc = "getSegsNCProyectoAccionesSinTareas"
        Case BUCKET_NC_PROY_PTE_CE:         Cache_Proyecto_GetConstructorFunc = "getSegsNCProyectoPteCE"
        Case BUCKET_NC_PROY_CE_CADUCADA:   Cache_Proyecto_GetConstructorFunc = "getSegsNCProyectoCECaducada"
        Case BUCKET_NC_PROY_CE_NO_CONFORME: Cache_Proyecto_GetConstructorFunc = "getSegsNCProyectoCENoConforme"
        Case Else
            Cache_Proyecto_GetConstructorFunc = ""
    End Select
End Function

' ============================================================
' Mapa de buckets -> constructor.get*() para AUDITORIA
' ============================================================
Private Function Cache_Auditoria_GetConstructorFunc(p_Bucket As String) As String
    Select Case p_Bucket
        Case BUCKET_TAR_AUD_PTE_REPLAN:     Cache_Auditoria_GetConstructorFunc = "getSegsTareasAuditoriaPteReplanificar"
        Case BUCKET_NC_AUD_REGISTRADAS:     Cache_Auditoria_GetConstructorFunc = "getSegsNCAuditoriaRegistradas"
        Case BUCKET_NC_AUD_SIN_TAREAS:       Cache_Auditoria_GetConstructorFunc = "getSegsNCAuditoriaAccionesSinTareas"
        Case BUCKET_NC_AUD_PTE_CE:          Cache_Auditoria_GetConstructorFunc = "getSegsNCAuditoriaPteCE"
        Case BUCKET_NC_AUD_CE_CADUCADA:     Cache_Auditoria_GetConstructorFunc = "getSegsNCAuditoriaCECaducada"
        Case BUCKET_NC_AUD_CE_NO_CONFORME:  Cache_Auditoria_GetConstructorFunc = "getSegsNCAuditoriaCENoConforme"
        Case Else
            Cache_Auditoria_GetConstructorFunc = ""
    End Select
End Function

' ============================================================
' Inicializacion lazy del diccionario de cache
' ============================================================
Private Sub Cache_EnsureProyecto()
    If m_CacheProyecto Is Nothing Then
        Set m_CacheProyecto = New Scripting.Dictionary
        m_CacheProyecto.CompareMode = TextCompare
    End If
End Sub

Private Sub Cache_EnsureAuditoria()
    If m_CacheAuditoria Is Nothing Then
        Set m_CacheAuditoria = New Scripting.Dictionary
        m_CacheAuditoria.CompareMode = TextCompare
    End If
End Sub

' ============================================================
' Llama a constructor.getXXX() por nombre de funcion
' Devuelve el Dictionary resultado
' ============================================================
Private Function Cache_EjecutarConstructor(p_FuncName As String, ByRef p_Error As String) As Scripting.Dictionary
    Dim m_Result As Scripting.Dictionary
    On Error GoTo errores
    p_Error = ""
    
    Select Case p_FuncName
        Case "getSegsTareasProyectoPteReplanificar"
            Set m_Result = constructor.getSegsTareasProyectoPteReplanificar(p_Error:=p_Error)
        Case "getSegsNCProyectoRegistradas"
            Set m_Result = constructor.getSegsNCProyectoRegistradas(p_Error:=p_Error)
        Case "getSegsNCProyectoAccionesSinTareas"
            Set m_Result = constructor.getSegsNCProyectoAccionesSinTareas(p_Error:=p_Error)
        Case "getSegsNCProyectoPteCE"
            Set m_Result = constructor.getSegsNCProyectoPteCE(p_Error:=p_Error)
        Case "getSegsNCProyectoCECaducada"
            Set m_Result = constructor.getSegsNCProyectoCECaducada(p_Error:=p_Error)
        Case "getSegsNCProyectoCENoConforme"
            Set m_Result = constructor.getSegsNCProyectoCENoConforme(p_Error:=p_Error)
        Case "getSegsTareasAuditoriaPteReplanificar"
            Set m_Result = constructor.getSegsTareasAuditoriaPteReplanificar(p_Error:=p_Error)
        Case "getSegsNCAuditoriaRegistradas"
            Set m_Result = constructor.getSegsNCAuditoriaRegistradas(p_Error:=p_Error)
        Case "getSegsNCAuditoriaAccionesSinTareas"
            Set m_Result = constructor.getSegsNCAuditoriaAccionesSinTareas(p_Error:=p_Error)
        Case "getSegsNCAuditoriaPteCE"
            Set m_Result = constructor.getSegsNCAuditoriaPteCE(p_Error:=p_Error)
        Case "getSegsNCAuditoriaCECaducada"
            Set m_Result = constructor.getSegsNCAuditoriaCECaducada(p_Error:=p_Error)
        Case "getSegsNCAuditoriaCENoConforme"
            Set m_Result = constructor.getSegsNCAuditoriaCENoConforme(p_Error:=p_Error)
        Case Else
            p_Error = "Cache_EjecutarConstructor: funcion desconocida '" & p_FuncName & "'"
            Set m_Result = Nothing
    End Select
    
    Set Cache_EjecutarConstructor = m_Result
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "Cache_EjecutarConstructor: " & Err.Description
    End If
    Set m_Result = Nothing
End Function

' ============================================================
' API PUBLICA — PROYECTO
' ============================================================

' Obtener bucket cacheado de proyecto.
' Si p_Reset = True o no existe, ejecuta constructor y guarda.
Public Function Cache_Indicadores_Proyecto( _
                        ByVal p_Bucket As String, _
                        Optional ByVal p_Reset As Boolean = False, _
                        Optional ByRef p_Error As String _
                    ) As Scripting.Dictionary
    Dim m_FuncName As String
    Dim m_Result As Scripting.Dictionary
    
    On Error GoTo errores
    p_Error = ""
    
    If m_CacheProyecto Is Nothing Then
        Set m_CacheProyecto = New Scripting.Dictionary
        m_CacheProyecto.CompareMode = TextCompare
    End If
    
    ' Si se pide reset o no existe, recalcular
    If p_Reset Or Not m_CacheProyecto.Exists(p_Bucket) Then
        m_FuncName = Cache_Proyecto_GetConstructorFunc(p_Bucket)
        If m_FuncName = "" Then
            p_Error = "Cache_Indicadores_Proyecto: bucket desconocido '" & p_Bucket & "'"
            Set Cache_Indicadores_Proyecto = Nothing
            Exit Function
        End If
        Set m_Result = Cache_EjecutarConstructor(m_FuncName, p_Error)
        If p_Error <> "" Then
            Set Cache_Indicadores_Proyecto = Nothing
            Exit Function
        End If
        ' Guardar incluso si es Nothing (para no reintentar)
        If m_Result Is Nothing Then
            ' Marcar con clave pero sin objeto — cuenta como existente
            If Not m_CacheProyecto.Exists(p_Bucket) Then
                ' No guardar Nothing para permitir reintento la proxima vez
            End If
        Else
            m_CacheProyecto(p_Bucket) = m_Result
        End If
    End If
    
    If m_CacheProyecto.Exists(p_Bucket) Then
        Set Cache_Indicadores_Proyecto = m_CacheProyecto(p_Bucket)
    Else
        Set Cache_Indicadores_Proyecto = Nothing
    End If
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "Cache_Indicadores_Proyecto: " & Err.Description
    End If
    Set Cache_Indicadores_Proyecto = Nothing
End Function

' ============================================================
' API PUBLICA — AUDITORIA
' ============================================================

Public Function Cache_Indicadores_Auditoria( _
                        ByVal p_Bucket As String, _
                        Optional ByVal p_Reset As Boolean = False, _
                        Optional ByRef p_Error As String _
                    ) As Scripting.Dictionary
    Dim m_FuncName As String
    Dim m_Result As Scripting.Dictionary
    
    On Error GoTo errores
    p_Error = ""
    
    If m_CacheAuditoria Is Nothing Then
        Set m_CacheAuditoria = New Scripting.Dictionary
        m_CacheAuditoria.CompareMode = TextCompare
    End If
    
    If p_Reset Or Not m_CacheAuditoria.Exists(p_Bucket) Then
        m_FuncName = Cache_Auditoria_GetConstructorFunc(p_Bucket)
        If m_FuncName = "" Then
            p_Error = "Cache_Indicadores_Auditoria: bucket desconocido '" & p_Bucket & "'"
            Set Cache_Indicadores_Auditoria = Nothing
            Exit Function
        End If
        Set m_Result = Cache_EjecutarConstructor(m_FuncName, p_Error)
        If p_Error <> "" Then
            Set Cache_Indicadores_Auditoria = Nothing
            Exit Function
        End If
        If Not m_Result Is Nothing Then
            m_CacheAuditoria(p_Bucket) = m_Result
        End If
    End If
    
    If m_CacheAuditoria.Exists(p_Bucket) Then
        Set Cache_Indicadores_Auditoria = m_CacheAuditoria(p_Bucket)
    Else
        Set Cache_Indicadores_Auditoria = Nothing
    End If
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "Cache_Indicadores_Auditoria: " & Err.Description
    End If
    Set Cache_Indicadores_Auditoria = Nothing
End Function

' ============================================================
' API PUBLICA — INVALIDACION
' ============================================================

' Invalida TODOS los caches (proyecto y auditoria)
Public Sub Cache_InvalidarTodo(Optional ByRef p_Error As String)
    On Error GoTo errores
    p_Error = ""
    Set m_CacheProyecto = Nothing
    Set m_CacheAuditoria = Nothing
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        p_Error = "Cache_InvalidarTodo: " & Err.Description
    End If
End Sub

' Invalida solo proyecto
Public Sub Cache_InvalidarProyecto(Optional ByRef p_Error As String)
    On Error GoTo errores
    p_Error = ""
    Set m_CacheProyecto = Nothing
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        p_Error = "Cache_InvalidarProyecto: " & Err.Description
    End If
End Sub

' Invalida solo auditoria
Public Sub Cache_InvalidarAuditoria(Optional ByRef p_Error As String)
    On Error GoTo errores
    p_Error = ""
    Set m_CacheAuditoria = Nothing
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        p_Error = "Cache_InvalidarAuditoria: " & Err.Description
    End If
End Sub

' ============================================================
' API PUBLICA — CONSULTA DE ESTADO
' ============================================================

' Devuelve True si el cache de proyecto esta cargado
Public Function Cache_Proyecto_EstaCargado() As Boolean
    Cache_Proyecto_EstaCargado = (Not m_CacheProyecto Is Nothing) And (m_CacheProyecto.Count > 0)
End Function

Public Function Cache_Auditoria_EstaCargado() As Boolean
    Cache_Auditoria_EstaCargado = (Not m_CacheAuditoria Is Nothing) And (m_CacheAuditoria.Count > 0)
End Function
