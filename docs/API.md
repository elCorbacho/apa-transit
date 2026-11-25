# API HTTP propuesta

La PWA consume el mismo origen. Las respuestas protegidas y de sesión usan `Cache-Control: no-store`. Se usa JSON excepto en descargas PNG y respuestas 204. Los cuerpos se validan con esquemas estrictos. Las rutas mutantes requieren `Origin` exactamente igual a `APP_ORIGIN` y el encabezado `X-APA-CSRF: 1`; no se habilita CORS entre orígenes. Todas las marcas de tiempo viajan en ISO 8601 UTC.

| Método y ruta | Autorización | Entrada o resultado |
|---|---|---|
| `POST /api/auth/login` | Pública con controles de origen y frecuencia | `{username,password}` → 200 con `{profile}` y cookie |
| `POST /api/auth/logout` | Mismo origen con protección CSRF | 204, revoca la sesión si existe y borra la cookie |
| `GET /api/me` | Cuenta activa | 200 con `{profile,lastMovement}`; último movimiento propio o null |
| `GET /api/movements` | Cuenta activa | `cursor` opcional → 200 con `{items,nextCursor}` |
| `POST /api/movements` | Cuenta activa | `{qrPayload,requestId}` → 201 al crear o 200 al repetir |
| `GET /api/admin/users` | Admin | 200 con cuentas y estados, sin contraseñas ni tokens |
| `POST /api/admin/users` | Admin | `{username,fullName,email,role,password}` → 201 |
| `PATCH /api/admin/users/:id` | Admin | Subconjunto de `username,fullName,email,role,isActive` → 200 |
| `PUT /api/admin/users/:id/password` | Admin | `{password}` → 204 tras confirmar el cambio |
| `POST /api/admin/users/:id/revoke-sessions` | Admin | 204 |
| `DELETE /api/admin/users/:id` | Admin | 204 con borrado lógico |
| `GET /api/admin/locations` | Admin | 200 con ubicaciones y estados |
| `POST /api/admin/locations` | Admin | `{name}` → 201, asigna QR fijo |
| `PATCH /api/admin/locations/:id` | Admin | Subconjunto de `name,isActive` → 200 |
| `GET /api/admin/locations/:id/qr` | Admin | 200 con descarga PNG |

## Movimientos

`qrPayload` tiene el formato exacto `APA-TRANSIT:LOC:<uuid>`. `requestId` es un UUID por captura. El servidor deriva quién registra, dónde y cuándo. La respuesta de movimiento devuelve `id`, `locationId`, `locationName`, `userName`, `requestId` y `recordedAt`. El historial es general para todas las cuentas activas, sin filtro por usuario; usa orden descendente por fecha e ID, páginas de 50 y cursor opaco validado con ambos valores. `nextCursor` es null al final. El cliente conserva el mismo identificador si perdió la respuesta de una captura. Cada lectura deliberada nueva genera otro identificador. Un cursor inválido devuelve 400 y un origen no autorizado devuelve 403.

## Autenticación implementada en desarrollo

`profile` contiene `id`, `username`, `fullName`, `email` y `role`; nunca contiene
tokens ni contraseñas. El login acepta únicamente `username` y `password`, normaliza
el nombre de usuario y limita el cuerpo JSON a 8 KiB. La cookie
`__Host-apa_session` es opaca, persistente, HttpOnly y Secure, con SameSite=Lax.
El cierre devuelve 204 y expira la cookie incluso cuando la sesión ya estaba revocada.

La renovación ocurre en el servidor al consultar una sesión cuyo token Auth está
próximo a vencer. No se agrega un endpoint público de renovación, registro o
recuperación. Una falla transitoria devuelve 503 sin revocar la sesión; una
denegación definitiva la revoca y devuelve 401. Un perfil inactivo, bloqueado o
eliminado no obtiene acceso.

Como parámetros de desarrollo, el login permite 5 intentos por nombre de usuario
y 60 por IP en 15 minutos; fuera de Vercel comparte un bucket local en lugar de
confiar en encabezados enviados por el cliente. La duración inicial configurable
es de 7 días. Estos valores y el comportamiento del proxy deben validarse antes
del piloto, no constituyen decisiones institucionales ya aprobadas.

Login, logout, perfil, movimientos e `/api/health` están implementados localmente;
la captura concurrente requiere validación adicional entre conexiones PostgreSQL.
Las rutas administrativas de la tabla siguen pendientes. Health devuelve 503 y
`operational:false` mientras el MVP no esté habilitado.

En desarrollo, el escaneo tiene un límite provisional de 120 intentos por
sesión en una ventana de 15 minutos. También cuentan QR inválidos o desconocidos
y repeticiones idempotentes. Las respuestas 429 no registran movimientos;
este límite no sustituye los controles adicionales de abuso del entorno de
destino. Confirmar el umbral con el equipo antes del piloto.

## Errores

El cuerpo usa `{error:{code,message}}`. Usa 400 para formato inválido, 401 para credenciales inválidas o sesión ausente/inválida, 403 para rol u origen insuficiente, 404 para recurso inexistente, 409 para conflictos de unicidad, ubicación inactiva, último administrador o reutilización de identificador con otro QR, 429 para límite y 503 para indisponibilidad transitoria. En escaneo, la interfaz puede agrupar 400, 404 y ubicación inactiva bajo el mismo mensaje. Una operación administrativa incierta devuelve un error con referencia de seguimiento y permanece bloqueada para reconciliación.
