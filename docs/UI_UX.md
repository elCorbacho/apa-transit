# Interfaz y experiencia de uso

| Pantalla | Contenido y acciones |
|---|---|
| Login | Campos Usuario y Contraseña, botón Iniciar sesión y error genérico. Emplea etiquetas accesibles y autocompletado del navegador según política institucional. |
| Inicio | Identificación de la cuenta, botón Escanear QR y último movimiento propio, o estado vacío. |
| Escáner | Vista de cámara, permiso solicitado desde una acción explícita y cámara posterior preferida. Al detectar, pausa la lectura y registra automáticamente. |
| Confirmación | Ubicación, nombre del usuario, fecha y hora confirmadas, acción Escanear de nuevo. |
| Movimientos | Lista compartida descendente, agrupada visualmente por fecha en America/Santiago. Muestra ubicación, responsable y hora. Carga más registros mediante cursor. |
| Configuración operativa | Mi cuenta con usuario, nombre y correo en solo lectura. Cerrar sesión. |
| Configuración administrativa | Listado y gestión de usuarios, contraseña nueva, revocación de sesiones, gestión de ubicaciones y descarga de QR. Cerrar sesión. |

La navegación permanente ofrece Inicio, Movimientos y Configuración. Usa controles táctiles cómodos, contraste suficiente, foco visible y mensajes de estado anunciables. Libera la cámara al salir del escáner o al pasar la app a segundo plano.

| Estado | Respuesta |
|---|---|
| Cámara denegada o ausente | Muestra cómo habilitar el permiso o informa que el dispositivo necesita cámara. |
| QR inválido, desconocido o inactivo | Muestra que el QR no se puede usar y ofrece volver a escanear. |
| Solicitud pendiente | Muestra Registrando y bloquea lecturas repetidas. |
| Red caída o resultado incierto | Informa que el registro aún no se pudo confirmar. Si se reintenta la misma captura, conserva su identificador en memoria. |
| Sesión vencida o revocada | Vuelve a login y retira la información privada de la vista. |
| Historial vacío | Muestra que todavía no hay movimientos. |

En un dispositivo compatible, el usuario instala desde el navegador o agrega la PWA a su pantalla de inicio. Prueba permisos y persistencia de sesión dentro del contexto instalado. En la gestión administrativa pide confirmación para borrado lógico y muestra el impacto de revocar sesiones.

## Estado de implementación local

Con configuración válida, la interfaz ofrece login, Inicio con último movimiento
propio, historial compartido con cursor y Mi cuenta con cierre de sesión.
Sin configuración conserva la pantalla de preparación. La interfaz borra los
datos privados al cerrar sesión o al recibir una denegación de acceso; un
cierre no confirmado no vuelve a mostrar el historial anterior.

El escáner, la confirmación posterior a un QR, la administración de cuentas y las pruebas
en navegador/dispositivos siguen pendientes. Esta etapa no habilita el uso
operativo ni demuestra persistencia de sesión en una PWA instalada.

Para cuentas administrativas, Configuración incluye ahora una interfaz local
para listar, crear, renombrar, desactivar/reactivar ubicaciones y descargar su
QR PNG. La desactivación solicita confirmación; el operador no ve estos
controles y la API verifica el rol por separado. La administración de usuarios
permite listar cuentas, renombrar perfiles y desactivar/reactivar usuarios;
el listado no expone contraseñas ni tokens, y la API impide desactivar al
último admin activo. Las pruebas de HTML estático no sustituyen la
interacción en navegador ni la lectura de un QR impreso en dispositivos.

Inicio incluye un escáner local que pide la cámara tras una acción explícita,
prefiere la cámara posterior, registra al detectar un QR, y solo muestra
confirmación cuando responde la API con ubicación, nombre y hora del servidor.
Ante un resultado de red incierto ofrece reintentar con el mismo identificador
en memoria. Al salir de la pantalla o pasar a segundo plano libera la cámara.
Faltan pruebas reales de permisos, cámara, lectura de QR y tiempo de respuesta
en Android/iOS; esta implementación no habilita todavía el uso operativo.
