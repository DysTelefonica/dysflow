Option Compare Database
Option Explicit

Private m_IdNC As Long
Private m_IdExpediente As Long
Private m_ObjNC As NCProyecto
Private m_RiesgoServ As New RiesgoServicio
Private m_DictCandidatos As Scripting.Dictionary ' Para recuperar los objetos Riesgo

Private Sub btnCancelar_Click()
    DoCmd.Close acForm, Me.Name
End Sub
Private Sub Form_Open(Cancel As Integer)
    Dim vArgs As Variant
    
    If Nz(Me.OpenArgs, "") = "" Then
        MsgBox "Faltan parámetros de apertura.", vbCritical
        Cancel = True
        Exit Sub
    End If

    ' Parseamos: "IDNoConformidad|IDExpediente"
    vArgs = Split(Me.OpenArgs, "|")
    If IsNumeric(vArgs(0)) Then
        m_IdNC = CLng(vArgs(0))
    End If
    If IsNumeric(vArgs(1)) Then
        m_IdExpediente = CLng(vArgs(1))
    End If
    
End Sub
Private Sub Form_Load()
    On Error GoTo errores
    Dim p_Error As String
    
    ' Ajuste visual de controles (Helper estándar del proyecto)
    Ajustar Me
    Me.lblTitulo.Caption = "RIESGOS ASOCIADOS"
    Me.Caption = Me.lblTitulo.Caption
    ' 1. Cargar el objeto NC de trabajo
    ' Si m_IdNC > 0 estamos en edición: cargamos desde el constructor.
    ' Si m_IdNC = 0 estamos en alta: usamos el objeto global m_ObjNCProyectoActiva
    ' que ya reside en la memoria del formulario llamante.
    If m_IdNC > 0 Then
        Set m_ObjNC = constructor.getNCProyecto(CStr(m_IdNC))
    Else
        ' Crucial para ALTA: Referenciamos el objeto activo para no perder cambios en memoria
        Set m_ObjNC = m_ObjNCProyectoActiva
        
        ' Aseguramos que el objeto tenga el IDExpediente actual del formulario padre
        If Not m_ObjNC Is Nothing Then m_ObjNC.IDExpediente = m_IdExpediente
    End If
    
    ' Validación de seguridad
    If m_ObjNC Is Nothing Then
        Err.Raise 1000, , "No se ha podido inicializar el contexto de la No Conformidad."
    End If
    
    ' 2. Cargar riesgos candidatos del expediente vía Servicio
    ' Filtra riesgos de la última edición del expediente asignado a la NC
    Set m_DictCandidatos = m_RiesgoServ.ListarRiesgosCandidatos(m_ObjNC, p_Error)
    If p_Error <> "" Then Err.Raise 1000, , p_Error
    
    ' 3. Rellenar la lista visual (ListBox) con los candidatos
    RellenarListBox
    
    ' 4. Pre-seleccionar riesgos actuales (Carga desde BD en edición o desde Memoria en alta)
    ' Esto permite que al volver a abrir el selector en un alta, sigan marcados los anteriores.
    PreseleccionarActuales
    
    Exit Sub

errores:
    MsgBox "Error al cargar el selector de riesgos: " & Err.Description, vbCritical
End Sub

Private Sub RellenarListBox()
    Dim vKey As Variant
    Dim objR As riesgo
    
    Me.lstRiesgos.RowSource = ""
    For Each vKey In m_DictCandidatos.Keys
        Set objR = m_DictCandidatos(vKey)
        Me.lstRiesgos.AddItem objR.idRiesgo & ";" & objR.CodigoRiesgo & ";" & objR.Descripcion
    Next vKey
End Sub

Private Sub PreseleccionarActuales()
    Dim i As Integer
    Dim dictRiesgos As Scripting.Dictionary
    
    On Error GoTo errores
    
    ' 1. Seguridad: Verificar que el objeto NC de trabajo existe
    If m_ObjNC Is Nothing Then Exit Sub
    
    ' 2. Obtener la referencia a la colección de riesgos
    ' Esto dispara el Property Get de NCProyecto (que para Alta inicializa el Dictionary vacío)
    Set dictRiesgos = m_ObjNC.Riesgos
    
    ' 3. Seguridad: Si no hay riesgos o la colección es Nothing, no hay nada que marcar
    If dictRiesgos Is Nothing Then Exit Sub
    If dictRiesgos.count = 0 Then Exit Sub
    
    ' 4. Iterar el ListBox para marcar los riesgos ya seleccionados
    ' Importante: Usamos Nz para evitar errores al convertir ItemData a String
    For i = 0 To Me.lstRiesgos.ListCount - 1
        Dim idBusqueda As String
        idBusqueda = CStr(Nz(Me.lstRiesgos.ItemData(i), ""))
        
        If idBusqueda <> "" Then
            If dictRiesgos.Exists(idBusqueda) Then
                Me.lstRiesgos.Selected(i) = True
            End If
        End If
    Next i
    
    Exit Sub

errores:
    ' En modo debug podemos ver qué falla, pero evitamos que el formulario se bloquee
    Debug.Print "Error en PreseleccionarActuales: " & Err.Description
End Sub
Private Sub btnAceptar_Click()
    Dim colSeleccion As New Collection ' Para el Servicio (espera Collection)
    Dim dictMemoria As New Scripting.Dictionary ' Para el Objeto en Memoria (espera Dictionary)
    Dim varItm As Variant
    Dim p_Error As String
    Dim objRiesgo As riesgo
    Dim strIDRiesgo As String
    
    On Error GoTo errores
    
    dictMemoria.CompareMode = TextCompare
    
    ' 1. Recorrer la selección del ListBox
    For Each varItm In Me.lstRiesgos.ItemsSelected
        strIDRiesgo = CStr(Me.lstRiesgos.ItemData(varItm))
        
        ' Recuperamos el objeto completo del diccionario de candidatos
        If m_DictCandidatos.Exists(strIDRiesgo) Then
            Set objRiesgo = m_DictCandidatos(strIDRiesgo)
            
            ' Llenamos ambas estructuras (una para servicio, otra para entidad)
            colSeleccion.Add objRiesgo
            dictMemoria.Add strIDRiesgo, objRiesgo
        End If
    Next varItm
    
    ' 2. Bifurcación según el estado de la NC
    If m_IdNC > 0 Then
        ' --- MODO EDICIÓN (Persistencia Inmediata en BD) ---
        
        ' Llamamos al servicio para guardar en TbRiesgosNC
        If Not m_RiesgoServ.ActualizarRiesgosNC(m_IdNC, colSeleccion, p_Error) Then
            Err.Raise 1000, , p_Error
        End If
        
        ' Actualizamos el campo de texto plano en TbNoConformidades
        m_RiesgoServ.SincronizarCampoTextoNC m_IdNC, p_Error
        
        ' Actualizamos también el objeto en memoria del formulario padre por coherencia
        
        Set m_ObjNCProyectoActiva.Riesgos = dictMemoria
        ' --- INTEGRACIÓN CACHÉ ---
        CacheNCProyecto.InvalidarCache CStr(m_IdNC), "Cambio en Riesgos asociados", p_Error
        ' -------------------------
        If m_ObjNCProyectoActiva.Riesgos Is Nothing Then
            m_ObjNCProyectoActiva.CodRiesgosAsociados = ""
        
        End If
    Else
        ' --- MODO ALTA (Solo Memoria) ---
        
        ' No llamamos a SQL. Simplemente inyectamos el diccionario en la Entidad.
        ' La clase NCProyectoOperaciones.RegistrarDatosUnicos se encargará de guardar
        ' estos riesgos cuando se genere el ID de la NC.
        Set m_ObjNC.Riesgos = dictMemoria
        
        ' Generamos manualmente la cadena de texto para el campo visual (ya que no hay UPDATE SQL)
        Dim vKey As Variant
        Dim sCodigos As String
        For Each vKey In dictMemoria.Keys
            sCodigos = sCodigos & IIf(sCodigos = "", "", "|") & dictMemoria(vKey).CodigoRiesgo
        Next
        m_ObjNC.CodRiesgosAsociados = sCodigos ' Actualizamos la propiedad temporal
        
    End If

    DoCmd.Close acForm, Me.Name
    Exit Sub

errores:
    MsgBox "Error al aceptar la selección de riesgos: " & Err.Description, vbCritical
End Sub
Private Sub btnQuitarTodos_Click()
    Dim i As Integer
    ' 1. Desmarcar todos los elementos visualmente
    For i = 0 To Me.lstRiesgos.ListCount - 1
        Me.lstRiesgos.Selected(i) = False
    Next i
    
    ' 2. Opcional: Podría llamar directamente a Aceptar si desea cierre inmediato
    ' Call btnAceptar_Click
End Sub