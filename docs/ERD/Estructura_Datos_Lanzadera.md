# Estructura de Datos: Lanzadera_Datos.accdb

## Tabla: Errores de pegado
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| F1 | 10 | 255 |
| F2 | 7 | 8 |
| F3 | 10 | 255 |
| F4 | 10 | 255 |
| F5 | 10 | 255 |
| F6 | 10 | 255 |
| F7 | 10 | 255 |
| F8 | 10 | 255 |
| F9 | 10 | 255 |

## Tabla: Tb0HerramientaDocAyuda
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| NombreFormulario | 10 | 255 |
| NombreArchivoAyuda | 10 | 255 |

## Tabla: TbAplicaciones
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDAplicacion | 4 | 4 |
| NombreAplicacion | 10 | 255 |
| NombreCorto | 10 | 255 |
| NombreEjecutable | 10 | 255 |
| NombreArchivoDatos | 10 | 255 |
| Pass | 10 | 255 |
| NombreCarpeta | 10 | 255 |
| NombreFuncionPublicacion | 10 | 255 |
| NombreCarpetaTemporal | 10 | 255 |
| TituloAplicacion | 10 | 255 |
| NombreIconoParaArbol | 10 | 255 |
| NombreIcono | 10 | 255 |
| NombreIconoLanzadera | 10 | 255 |
| EjecucionEnOficina | 10 | 2 |
| NombreCarpetaDocumentacion | 10 | 255 |
| NombreDirectorioIconos | 10 | 255 |
| NombreDirectorioAyuda | 10 | 255 |
| NombreDirectorioRecursos | 10 | 255 |
| URLDIrectorioIconoAplicacion | 10 | 255 |
| EnPruebas | 10 | 2 |
| ConIconoEnLanzadera | 10 | 2 |
| Comando | 12 | 0 |

## Tabla: TbAplicacionesAperturas
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDApertura | 4 | 4 |
| IDAplicacion | 4 | 4 |
| NombreUsuario | 10 | 255 |
| FechaApertura | 8 | 8 |
| HoraApertura | 8 | 8 |
| FechaCierre | 8 | 8 |
| HoraCierre | 8 | 8 |
| NombreAplicacion | 10 | 255 |
| FechaEnvioCorreoAdministrador | 8 | 8 |
| EnOficina | 10 | 2 |
| UsuarioConectadoMaquina | 10 | 255 |
| VersionAplicacion | 10 | 255 |
| NombreMaquina | 10 | 255 |
| UsuarioMaquina | 10 | 255 |
| Observaciones | 12 | 0 |

## Tabla: TbAplicacionesEdiciones
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDAplicacion | 4 | 4 |
| IDVersion | 4 | 4 |
| Version | 10 | 255 |
| FechaPublicacion | 8 | 8 |
| ParaInforme | 10 | 255 |

## Tabla: TbAplicacionesEdicionesCambios
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDCambio | 4 | 4 |
| IDVersion | 4 | 4 |
| Cambio | 10 | 255 |
| FechaCambio | 8 | 8 |
| DescripcionCambio | 12 | 0 |

## Tabla: TbAplicacionesEstados
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| PerfilAplicacion | 10 | 255 |
| PerfilAplicacionEncriptado | 10 | 255 |

## Tabla: TbAplicacionesParametros
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDAplicacion | 4 | 4 |
| IDParametro | 4 | 4 |
| Valor | 12 | 0 |

## Tabla: TbAplicacionesPerfiles
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDAplicacion | 4 | 4 |
| Perfil | 10 | 255 |

## Tabla: TbAplicacionesVideos
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDAplicacionVideo | 4 | 4 |
| IDVideo | 4 | 4 |
| IDAplicacion | 4 | 4 |
| Descripcion | 12 | 0 |
| NombreArchivo | 10 | 255 |
| FechaCreacion | 8 | 8 |
| UsuarioCrea | 10 | 255 |
| FechaModificacion | 8 | 8 |
| UsuarioModifica | 10 | 255 |

## Tabla: TbCategorias
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDCategoria | 4 | 4 |
| NombreCategoria | 10 | 255 |

## Tabla: TbConexiones
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| Usuario | 10 | 255 |
| UltimaConexion | 8 | 8 |
| UltimaDesconexion | 8 | 8 |
| InstaladoFW3 | 10 | 2 |
| InstaladoFW4 | 10 | 2 |
| Exitoso | 10 | 2 |

## Tabla: TbConexionesRegistro
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDConexion | 4 | 4 |
| Usuario | 10 | 255 |
| FechaConexion | 8 | 8 |
| FechaCierre | 8 | 8 |
| ConContraseña | 1 | 1 |
| UsuarioSSID | 10 | 255 |
| EnOficina | 1 | 1 |
| Vertical | 4 | 4 |
| Horizontal | 4 | 4 |

## Tabla: TbConexionUltimaAppAbierta
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDConexion | 4 | 4 |
| IDUltimaAplicacionAbierta | 4 | 4 |

## Tabla: TbCuestionarioPreguntas
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDPregunta | 4 | 4 |
| IDCuestionario | 4 | 4 |
| Texto | 12 | 0 |

## Tabla: TbCuestionarios
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDCuestionario | 4 | 4 |
| FechaRealizado | 8 | 8 |
| IDUsuarioRealiza | 4 | 4 |
| IDAplicacion | 4 | 4 |
| IDRespuestaCorrecta | 4 | 4 |
| Observaciones | 12 | 0 |

## Tabla: TbCuestionaroRespuestas
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDRespuesta | 4 | 4 |
| IDPregunta | 4 | 4 |
| Letra | 10 | 255 |
| Texto | 12 | 0 |

## Tabla: TbDetalleVersiones
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDAplicacion | 4 | 4 |
| IDVersion | 4 | 4 |
| IDDetalle | 4 | 4 |
| Detalle | 12 | 0 |

## Tabla: TbParametros
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDParametro | 4 | 4 |
| Parametro | 10 | 255 |

## Tabla: TbPermisos
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDAplicacion | 4 | 4 |
| Usuario | 10 | 255 |
| F3 | 10 | 255 |
| F4 | 10 | 255 |
| F5 | 10 | 255 |
| F6 | 10 | 255 |
| F7 | 10 | 255 |
| F8 | 10 | 255 |
| F9 | 10 | 255 |

## Tabla: TbTablasAVincular
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDBBDD | 4 | 4 |
| IDAplicacion | 4 | 4 |
| NombreTabla | 10 | 255 |
| NombreTablaEnLocal | 10 | 255 |

## Tabla: TbUbicaciones
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| NombreUbicacion | 10 | 255 |
| Sirdee | 10 | 2 |
| Ubicacion | 10 | 255 |

## Tabla: TbUsuarioAplicacionesSolicitud
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| CorreoUsuario | 10 | 255 |
| Password | 10 | 255 |
| Nombre | 10 | 255 |
| Matricula | 10 | 255 |
| Telefono | 10 | 255 |
| Movil | 10 | 255 |
| FechaSolicitud | 8 | 8 |

## Tabla: TbUsuarioConfiguracion
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| UsuarioDeRed | 10 | 255 |
| MantenerLanzaderaAbierta | 10 | 2 |

## Tabla: tbUsuarios
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| Id | 4 | 4 |
| Nombre | 10 | 50 |
| UsuarioRed | 10 | 50 |
| DirCorreo | 10 | 255 |
| Matricula_DNI | 10 | 50 |
| Cargo | 10 | 50 |
| telfijo | 4 | 4 |
| telmovil | 4 | 4 |
| JefeDelUsuario | 10 | 50 |
| FechaAlta | 8 | 8 |
| FechaBaja | 8 | 8 |
| EmplazamientoExterno | 10 | 2 |
| SeLogean | 1 | 1 |
| ParaTareasProgramadas | 1 | 1 |
| Autorizador | 1 | 1 |
| DiaEnvioTareas | 2 | 1 |
| UsuarioDeGestionRiesgos | 10 | 2 |
| UsuariosI3D | 10 | 2 |

## Tabla: TbUsuariosAplicaciones
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| CorreoUsuario | 10 | 255 |
| Password | 10 | 255 |
| UsuarioRed | 10 | 255 |
| Nombre | 10 | 255 |
| Matricula | 10 | 255 |
| FechaAlta | 8 | 8 |
| Activado | 1 | 1 |
| FechaProximoCambioContrasenia | 8 | 8 |
| FechaUltimaConexion | 8 | 8 |
| TieneQueCambiarLaContrasenia | 1 | 1 |
| Telefono | 10 | 255 |
| Movil | 10 | 255 |
| Observaciones | 12 | 0 |
| UsuarioImborrable | 1 | 1 |
| EsAdministrador | 10 | 2 |
| PermisosAsignados | 1 | 1 |
| FechaBaja | 8 | 8 |
| PasswordNuncaCaduca | 1 | 1 |
| MantenerLanzaderaAbierta | 1 | 1 |
| PassIncialPlana | 10 | 255 |
| UsuarioSSID | 10 | 255 |
| Id | 3 | 2 |
| JefeDelUsuario | 10 | 50 |
| PermisoPruebas | 10 | 2 |
| ParaTareasProgramadas | 1 | 1 |
| FechaBloqueo | 8 | 8 |

## Tabla: TbUsuariosAplicacionesPermisos
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| CorreoUsuario | 10 | 255 |
| IDAplicacion | 4 | 4 |
| EsUsuarioAdministrador | 10 | 2 |
| EsUsuarioCalidad | 10 | 2 |
| EsUsuarioEconomia | 10 | 2 |
| EsUsuarioSecretaria | 10 | 2 |
| EsUsuarioTecnico | 10 | 2 |
| EsUsuarioSinAcceso | 10 | 2 |
| EsUsuarioCalidadAvisos | 10 | 2 |

## Tabla: TbUsuariosAplicacionesTareas
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| CorreoUsuario | 10 | 255 |
| EsAdministrador | 10 | 2 |
| EsTecnico | 10 | 2 |
| EsCalidad | 10 | 2 |
| EsEconomia | 10 | 2 |

## Tabla: TbUsuariosCorreosEnvio
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDCorreo | 4 | 4 |
| Destinatarios | 12 | 0 |
| DestinatariosConCopia | 12 | 0 |
| DestinatariosConCopiaOculta | 12 | 0 |
| Asunto | 10 | 255 |
| Cuerpo | 12 | 0 |
| FechaEnvio | 8 | 8 |
| FechaCreado | 8 | 8 |
| URLAdjunto | 10 | 255 |

## Tabla: TbUsuariosHistoricoContrasenias
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| Usuario | 10 | 255 |
| PassAntigua | 10 | 255 |
| FechaPass | 8 | 8 |

## Tabla: TbUsuariosTareasDiarias
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| UsuarioRed | 10 | 255 |

## Tabla: TbVideos
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDVideo | 4 | 4 |
| Titulo | 10 | 255 |
| NombreArchivo | 10 | 255 |
| IDAplicacion | 4 | 4 |
| Observaciones | 12 | 0 |
| Descripcion | 12 | 0 |
| SubidoPor | 10 | 255 |
| FechaSubido | 8 | 8 |
| ParaCalidad | 10 | 2 |
| ParaAdministrador | 10 | 2 |
| ParaTecnicos | 10 | 2 |

## Tabla: TbVideosCategorias
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDCategoriaVideo | 4 | 4 |
| IDCategoria | 4 | 4 |
| IDVideo | 4 | 4 |

## Tabla: TbVideosCuestionario
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDVideoCuestionario | 4 | 4 |
| IDCuestionario | 4 | 4 |
| IDVideo | 4 | 4 |
| FechaRealizado | 8 | 8 |
| UsuarioRealiza | 10 | 255 |
| Observaciones | 12 | 0 |

## Tabla: TbVideosVisionados
| Campo | Tipo | Longitud |
| :--- | :--- | :--- |
| IDVisionado | 4 | 4 |
| IDVideo | 4 | 4 |
| TiempoVisionado | 4 | 4 |
| TiempoVideo | 4 | 4 |
| IDUsuario | 4 | 4 |
| FechaVisionado | 8 | 8 |

