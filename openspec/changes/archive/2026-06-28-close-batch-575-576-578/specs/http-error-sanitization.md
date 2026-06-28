# Delta for http-error-sanitization

## MODIFIED Requirements

### Requirement: REQ-002-1 — SendOperationResult Sanitiza Mensajes De Error

`sendOperationResult` en `src/adapters/http/server.ts` DEBE aplicar
`sanitizeMcpErrorMessage` al `error.message` de un resultado fallido
antes de serializar la respuesta, usando como `secrets` la lista
`[httpToken, accessPassword, backendPassword]` filtrada a valores
no-vacíos. Los códigos estructurados (`error.code`) y la marca
`error.retryable` DEBEN permanecer intactos.

#### Scenario: contraseña de access en error message queda redactada

- DADO un server HTTP configurado con `accessPassword: "super-secret"`
- Y un `queryService.execute` que retorna
  `failureResult({ code: "RUNNER_FAILED", message: "open failed for db using pwd super-secret" })`
- CUANDO un cliente hace `POST /query/read`
- ENTONCES la respuesta JSON DEBE contener `error.message` SIN la cadena
  `super-secret` (sustituida por `[REDACTED]`)

#### Scenario: contraseña de backend en error message queda redactada

- DADO un server HTTP configurado con `backendPassword: "backend-secret"`
- Y un `cleanupService.cleanup` que retorna
  `failureResult({ code: "CLEANUP_FAILED", message: "relink failed: backend-secret invalid" })`
- CUANDO un cliente hace `POST /access/cleanup`
- ENTONCES la respuesta JSON DEBE contener `error.message` SIN la cadena
  `backend-secret`

#### Scenario: token HTTP en error message queda redactado

- DADO un server HTTP configurado con `httpToken: "tok-abc-123"`
- Y un handler que por error incluye el token en el mensaje
- CUANDO `sendOperationResult` serializa el fallo
- ENTONCES la respuesta JSON DEBE contener `error.message` SIN la cadena
  `tok-abc-123`

#### Scenario: connect-string password queda stripped aún sin valor conocido

- DADO un server HTTP sin secretos configurados
- Y un `queryService.execute` que retorna
  `failureResult({ code: "ODBC_CONNECT_FAILED", message: "Provider=MSDASQL;PWD=hunter2;Database=foo" })`
- CUANDO un cliente hace `POST /query/read`
- ENTONCES la respuesta JSON DEBE contener `error.message` SIN el fragmento
  `;PWD=hunter2` (eliminado por `sanitizeConnectStrings`)

#### Scenario: error code y retryable permanecen intactos

- DADO un resultado fallido con `code: "RUNNER_FAILED"`, `retryable: true`
- CUANDO `sendOperationResult` lo serializa
- ENTONCES el JSON DEBE preservar `error.code === "RUNNER_FAILED"` y
  `error.retryable === true` byte por byte

#### Scenario: respuesta exitosa no se sanitiza

- DADO un resultado `ok: true` con payload conteniendo la cadena `secret`
- CUANDO `sendOperationResult` lo serializa
- ENTONCES el payload DEBE contener `secret` literal (solo se sanitiza en
  la rama de fallo)

### Requirement: REQ-002-2 — handleValidation Delega En Sanitizador Común

`handleValidation` DEBE seguir usando el sanitizador común
(`sanitizeSecrets` con `httpToken/accessPassword/backendPassword`)
para errores de validación de input, sin duplicar lógica de path/connect
stripping que ahora vive en `sanitizeMcpErrorMessage`.

#### Scenario: validation error message queda redactado

- DADO un server HTTP con `accessPassword: "super-secret"`
- Y un body que falla validación con un mensaje que contiene la
  contraseña
- CUANDO `handleValidation` lo procesa
- ENTONCES la respuesta JSON DEBE contener el mensaje sanitizado (la
  contraseña sustituida por `[REDACTED]`)
