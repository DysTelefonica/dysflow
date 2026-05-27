Option Compare Database
Option Explicit
#If VBA7 Then
    Private Declare PtrSafe Function ShowWindow Lib "user32" (ByVal hwnd As LongPtr, ByVal nCmdShow As Long) As Long
#Else
    Private Declare Function ShowWindow Lib "user32" (ByVal hwnd As Long, ByVal nCmdShow As Long) As Long
#End If



' Constantes para mostrar/ocultar Access
Const SW_HIDE = 0
Const SW_NORMAL = 1
Const SW_MINIMIZED = 2
Const SW_MAXIMIZED = 3

Private Sub Form_Open(Cancel As Integer)
    ' Inicializar Firebase al abrir el formulario
    Call InitializeFirebase
End Sub
Private Sub btnSend_Click()
    ' Enviar datos al nodo "notificaesto" en Firebase
    Dim message As String
    message = Me.txtInput.value
    
    ' Ejecutar JavaScript en el WebBrowser para enviar datos
    Dim script As String
    script = "firebase.database().ref('notificaesto').set('" & message & "');"
    
    Me.WebBrowser0.Object.Document.parentWindow.execScript script, "JavaScript"
End Sub

Private Sub InitializeFirebase()
    ' Crear una página HTML con la configuración de Firebase
    Dim tempFilePath As String
    tempFilePath = Environ("TEMP") & "\firebaseRealtime.html"
    
    Dim htmlContent As String
    htmlContent = "<!DOCTYPE html>" & vbCrLf & _
                  "<html><head>" & vbCrLf & _
                  "<script src='https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js'></script>" & vbCrLf & _
                  "<script>" & vbCrLf & _
                  "const firebaseConfig = {" & vbCrLf & _
                  "  apiKey: 'AIzaSyCaPdLLadH3-naRZIwIm0He0ztm7DUFB9A'," & vbCrLf & _
                  "  authDomain: 'defensayseguridad-c5a21.firebaseapp.com'," & vbCrLf & _
                  "  databaseURL: 'https://defensayseguridad-c5a21-default-rtdb.europe-west1.firebasedatabase.app'," & vbCrLf & _
                  "  projectId: 'defensayseguridad-c5a21'," & vbCrLf & _
                  "  storageBucket: 'defensayseguridad-c5a21.firebasestorage.app'," & vbCrLf & _
                  "  messagingSenderId: '333347675713'," & vbCrLf & _
                  "  appId: '1:333347675713:web:da5d23cbc8113fa0de30c0'" & vbCrLf & _
                  "};" & vbCrLf & _
                  "firebase.initializeApp(firebaseConfig);" & vbCrLf & _
                  "const db = firebase.database();" & vbCrLf & _
                  "db.ref('notificaEsto').on('value', (snapshot) => {" & vbCrLf & _
                  "  const value = snapshot.val();" & vbCrLf & _
                  "  window.external.UpdateRealtime(value);" & vbCrLf & _
                  "});" & vbCrLf & _
                  "</script>" & vbCrLf & _
                  "</head><body><h1>Escuchando cambios...</h1></body></html>"
    
    Dim fileNum As Integer
    fileNum = FreeFile
    Open tempFilePath For Output As #fileNum
    Print #fileNum, htmlContent
    Close #fileNum
    
    ' Cargar la página HTML en el control WebBrowser
    Me.WebBrowser0.Navigate tempFilePath
End Sub

Public Sub UpdateRealtime(value As String)
    ' Actualizar el cuadro de texto con los datos recibidos
    Me.txtRealtime.value = value
End Sub

Private Sub txtInput_Change()
    ' Enviar datos al nodo "notificaesto" en Firebase
    Dim message As String
    message = Me.txtInput.Text ' Usar .Text para obtener el contenido del cuadro de texto
    
    ' Ejecutar JavaScript en el WebBrowser para enviar datos
    Dim script As String
    script = "firebase.database().ref('notificaesto').set('" & message & "');"
    
    ' Ejecutar el script en el WebBrowser
    Me.WebBrowser0.Object.Document.parentWindow.execScript script, "JavaScript"
End Sub
