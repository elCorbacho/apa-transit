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
