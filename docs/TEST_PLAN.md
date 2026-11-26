# Plan de pruebas

Ejecutar con datos sintéticos en un ambiente aislado y repetir los controles Auth y PWA en la configuración de destino. Guardar fecha, entorno, versión, resultado y evidencia redactada por caso.

| Caso | Prueba y resultado esperado | Requisitos |
|---|---|---|
| A01 | Login con usuario activo y con credenciales inválidas. Solo el válido obtiene cookie y perfil. | RF-001, 004 |
| A02 | Instalar, cerrar y reabrir. La sesión persiste. Forzar renovación concurrente y comprobar que se mantiene una sesión consistente. | RF-002–003 |
| A03 | Salir, vencer o revocar sesión y volver a solicitar datos con la cookie anterior. El servidor deniega acceso. | RF-004–005, 008 |
| A04 | Operador consulta perfil y prueba rutas administrativas. Las operaciones denegadas no alteran datos. | RF-006–010 |
| S01 | Desde un cliente fuera del perímetro, verificar con una cuenta de prueba que ningún ingreso acepta autenticación directa, alta autónoma ni recuperación. | RF-006–010 |
| S02 | Verificar que el navegador recibe solo la cookie de app y que las sesiones de prueba del proveedor quedan confinadas al servidor. Revisar respuestas, cachés, build y almacenamiento web. | RF-007, RNF-006–007 |
| S03 | Confirmar que la cuenta operativa no puede cambiar su correo o contraseña por la app ni por un ingreso directo. El administrador realiza ambos cambios por la API autorizada y la credencial anterior deja de servir cuando corresponde. | RF-007, 035 |
| S04 | Revisar claves vigentes, ingreso original y dominios adicionales, CSRF y privilegios de datos. Las solicitudes fuera de la política reciben denegación y no generan mutaciones. | RF-007, 010, RNF-005–008 |
| U01 | Crear, editar rol y datos, desactivar, reactivar y borrar lógicamente. Revocar sesiones de dos dispositivos y exigir nuevo login tras reactivación. | RF-030–040 |
| U02 | Intentar retirar al último admin activo y simular cambios concurrentes. Debe quedar al menos un admin activo. | RF-036–039 |
| U03 | Simular falla entre Auth y PostgreSQL. La cuenta queda bloqueada hasta reconciliar y los movimientos se conservan. | RF-004, 040 |
| Q01 | Crear Oficina de becados, descargar e imprimir el PNG, leerlo en dos dispositivos y renombrar. El código sigue apuntando a la misma ubicación. | RF-041–046 |
| Q02 | Desactivar y reactivar ubicación. Los registros nuevos se rechazan durante la desactivación y el historial permanece visible. | RF-047–049 |
| M01 | Escanear con cámara posterior. La confirmación aparece tras el commit con cuenta, ubicación y hora de PostgreSQL aunque el reloj del teléfono esté desfasado. | RF-011–017, RN-014 |
| M02 | Enviar lecturas concurrentes idénticas, perder la respuesta y repetir. Hay un registro original. Reutilizar el ID con otro QR da conflicto. | RF-018, RN-011–012 |
| M03 | Probar QR inválido, desconocido e inactivo, cámara denegada, falta de red y error de DB. La app informa el estado y permite reintentar o volver al escáner. | RF-019–021 |
| M04 | Escanear mientras se desactiva usuario o ubicación. El resultado respeta el orden transaccional y la siguiente lectura queda denegada. | RF-004, 019 |
| H01 | Dos cuentas ven la misma lista, descendente y sin filtros. Paginar con fechas iguales y altas simultáneas sin duplicados. | RF-022–029 |
| H02 | Cambiar nombre y borrar lógicamente una cuenta o desactivar ubicación. Los snapshots permanecen. Intentos de edición o borrado se rechazan. | RF-028, 040, 049 |
| D01 | Las tablas y funciones están protegidas. Los permisos de ejecución impiden editar o borrar movimientos y el modelo excluye campos clínicos. | RN-005, 013 |
| P01 | Probar Android/Chrome, iOS/Safari y navegador de escritorio con HTTPS. Verificar instalación, reapertura, cámara y accesibilidad. | RNF-001–005, 012, 014 |
| P02 | Medir desde decodificación hasta confirmación con conectividad normal. Registrar dispositivo, red, muestra y p50/p95 frente al objetivo de 2 s. | RNF-004 |
| P03 | Restaurar respaldo en ambiente aislado y comprobar integridad, acceso, movimientos y revocación de sesiones restauradas. | RNF-013 |

S01–S04 son bloqueantes. El equipo de producto valida el flujo completo con un QR impreso antes de habilitar usuarios reales.

## Evidencia local de desarrollo

Ejecute `npm test` y `npm run typecheck`. `tests/auth.test.ts` invoca los handlers
HTTP reales con PostgreSQL embebido (PGlite), cuentas sintéticas y Auth simulado.
Comprueba cookie, almacenamiento cifrado, perfil/último movimiento propio,
denegaciones, versión de cuenta, revocación, renovación, logout y límites.
`tests/database.test.ts` comprueba permisos del rol de aplicación y snapshots.

La concurrencia del test de renovación ocurre sobre una conexión PGlite
serializada. No prueba contención real entre conexiones ni la topología Supabase.
A02, A03, S01–S04 y la salida a producción requieren repetir sus escenarios
contra el proveedor y los dispositivos reales. No se consideran aceptados por
el hecho de que la suite local esté en verde.

`tests/movements.test.ts` comprueba la captura secuencial, repetición,
desactivación, historial compartido, cursor con fechas iguales y errores de
entrada/origen mediante PGlite. Comprueba el orden de adquisición del bloqueo
advisory y del bloqueo de ubicación, pero **no** demuestra la contención real
entre conexiones PostgreSQL ni la desactivación concurrente (M02/M04). No
considerar estos casos aceptados antes de ejecutar pruebas con conexiones
independientes y datos sintéticos en un entorno aislado.
Para M02/M04, ejecutá `APA_TEST_PG_SOCKET=/ruta/al/socket
APA_TEST_PG_PORT=55479 npm run test:postgres` contra un PostgreSQL local
**aislado** de pruebas, con un usuario propietario `apa_test` creado por
`initdb -U apa_test`. La variable del socket es obligatoria: la ejecución
explícita falla si falta; `npm test` omite estos casos cuando no hay servidor,
sin confundir esa omisión con aceptación. El runner crea una base aleatoria
solo para pruebas, aplica la migración, usa conexiones independientes y la
elimina al terminar; no admite host de red. El servidor de prueba debe usar
`listen_addresses=''` y un directorio de socket privado. No uses un clúster
con datos reales ni el proyecto remoto.

Se comprobaron cinco escenarios: dos sesiones con el mismo identificador
de captura (un solo movimiento, repetición tras perder la respuesta y conflicto
con otro QR), captura anterior a desactivación de ubicación y de cuenta,
y ambos órdenes inversos. La espera por bloqueo se constata con
`pg_blocking_pids`, no se infiere de la simultaneidad de promesas. Esta prueba
local no sustituye la aceptación de Auth/Supabase en destino ni RF-007.
El límite provisional de 120 intentos de escaneo por sesión se comprueba con
datos sintéticos, incluidos QR inválidos y desconocidos, sin persistir el
movimiento rechazado. El umbral operativo debe validarse antes del piloto.

`tests/client-api.test.ts` comprueba solicitudes de login, perfil, historial
paginado y cierre con mismo origen, sin caché y con CSRF en mutaciones.
`tests/frontend.test.tsx` comprueba el HTML inicial de preparación/validación
de sesión, las vistas estáticas de login e historial y la clasificación de un
401 tardío del historial tras cambiar de pantalla o cerrar sesión. No simulan interacción
real del navegador, cookies ni cámara; A01–A04, H01 y P01 siguen requiriendo
pruebas de extremo a extremo en el entorno y dispositivos previstos.

`tests/locations.test.ts` invoca rutas de administración con PGlite y cuentas
sintéticas: comprueba acceso restringido, origen/CSRF, creación, listado,
renombrado, descarga PNG sin caché, token inmutable, desactivación/reactivación,
rechazo de captura inactiva, historial posterior y auditoría. No comprueba que
un teléfono lea el PNG impreso ni la contención entre conexiones reales para
una desactivación simultánea: Q01/Q02 y M04 siguen requiriendo esas pruebas.

`tests/client-api.test.ts` también comprueba el contrato del cliente de
ubicaciones: solicitudes sin caché con cookie del mismo origen, CSRF para
mutaciones, blob PNG y 401 antes de procesar una descarga. La vista administrativa
se comprueba como HTML inicial estático en `tests/frontend.test.tsx`;
`tests/location-download-race.test.tsx` comprueba que una descarga pendiente
no se dispara tras desmontar la vista por cierre de sesión. Falta automatizar
creación/edición/descarga desde un navegador real y comprobar el 401 tardío en
un navegador, antes de aceptar Q01/Q02 en un dispositivo.

El cliente de captura se comprueba con una falla de red sintética y reintento
idéntico (mismo `qrPayload` y `requestId`). `tests/frontend.test.tsx` valida
solo el HTML inicial de la cámara y la confirmación con los datos del servidor.
`tests/scanner-lifecycle.test.tsx` simula permisos denegados y pestaña oculta
o componente desmontado mientras la cámara aún está iniciando. No ejecuta una
cámara real ni prueba liberación de dispositivos: M01/M03 y P01
siguen pendientes de pruebas de extremo a extremo por HTTPS.
