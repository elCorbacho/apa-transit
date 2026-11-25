# PRD | APA Transit

**Product Requirements Document**

| Atributo | Descripción |
|---|---|
| Producto | APA Transit |
| Versión del documento | 1.0 |
| Fecha | 25 de noviembre de 2026 |
| Área | Anatomía Patológica |
| Tipo de aplicación | Progressive Web App (PWA) |
| Plataforma | Android, iOS y navegadores web |
| Estado | Especificación inicial para desarrollo |
| Infraestructura | Vercel + Supabase |

## 1. Descripción del producto

APA Transit es una aplicación web responsive, instalable en dispositivos móviles mediante tecnología PWA, destinada al registro de movimientos asociados al traslado de carros de láminas histológicas entre distintas ubicaciones físicas del servicio de Anatomía Patológica.

La aplicación permitirá que los tecnólogos médicos registren automáticamente su paso por una ubicación mediante la lectura de un código QR fijo.

Cada registro estará asociado al usuario autenticado, la ubicación física y la fecha y hora del servidor.

## 2. Problemática

Actualmente, el traslado de láminas histológicas entre edificios y dependencias del servicio no dispone de un mecanismo digital simplificado para registrar los horarios de paso y entrega.

Esta situación genera discrepancias respecto de los horarios en que el material histológico es transportado hacia las distintas áreas.

Se requiere una solución que permita disponer de registros históricos consultables, sin aumentar significativamente la carga operativa de los tecnólogos médicos.

## 3. Objetivos

### 3.1. Objetivo general

Implementar una aplicación móvil que permita registrar los movimientos asociados al traslado de carros de láminas histológicas mediante la lectura de códigos QR vinculados a ubicaciones físicas.

### 3.2. Objetivos específicos

- Identificar al tecnólogo médico responsable del traslado.
- Registrar automáticamente la fecha y hora de cada movimiento.
- Identificar la ubicación física mediante códigos QR.
- Mantener un historial cronológico de movimientos.
- Garantizar la persistencia e integridad de los registros.
- Minimizar la interacción del usuario con la aplicación.
- Centralizar la administración de usuarios y credenciales.
- Facilitar la instalación en dispositivos Android e iOS.

## 4. Alcance del producto

### 4.1. Funcionalidades incluidas

- Autenticación individual.
- Sesión persistente.
- Escáner de códigos QR.
- Registro automático de movimientos.
- Confirmación visual del registro.
- Historial cronológico general.
- Administración de usuarios.
- Administración de credenciales.
- Administración de ubicaciones.
- Generación de códigos QR.
- Almacenamiento persistente en una base de datos relacional.
- Instalación mediante PWA.

### 4.2. Funcionalidades excluidas

- Autorregistro de usuarios.
- Recuperación automática de contraseñas.
- Verificación de correo electrónico.
- Modificación de credenciales por usuarios operativos.
- Geolocalización GPS.
- Identificación individual de carros.
- Identificación de láminas histológicas.
- Registro de pacientes.
- Registro de biopsias.
- Clasificación de movimientos como entrada o salida.
- Filtros de búsqueda.
- Dashboards estadísticos.
- Notificaciones push.
- Exportación de datos en el MVP.
- Integración con sistemas LIS o HIS.
- Publicación en tiendas de aplicaciones.
- Registro de movimientos sin conectividad.

## 5. Roles de usuario

### 5.1. Usuario operativo

Corresponde al tecnólogo médico responsable del traslado de material histológico.

Permisos

- Iniciar sesión.
- Escanear códigos QR.
- Registrar movimientos.
- Visualizar el historial general.
- Consultar los datos de su cuenta en modo de solo lectura.
- Cerrar sesión.

No podrá modificar sus credenciales, administrar usuarios ni modificar registros históricos.

### 5.2. Administrador

Corresponde al responsable de la administración funcional de la aplicación.

Permisos:

- Acceder a todas las funcionalidades operativas.
- Crear usuarios.
- Modificar datos de usuarios.
- Modificar correos electrónicos.
- Establecer nuevas contraseñas.
- Desactivar usuarios.
- Reactivar usuarios.
- Eliminar usuarios mediante borrado lógico.
- Administrar ubicaciones.
- Generar códigos QR.
- Descargar códigos QR para impresión.
- Revocar sesiones de usuarios.

### 5.3. Matriz de permisos

| Funcionalidad | Operativo | Administrador |
|---|:---:|:---:|
| Iniciar sesión | Sí | Sí |
| Escanear QR | Sí | Sí |
| Registrar movimientos | Sí | Sí |
| Visualizar movimientos | Sí | Sí |
| Consultar perfil propio | Sí | Sí |
| Modificar correo electrónico | No | Sí |
| Modificar contraseña | No | Sí |
| Crear usuarios | No | Sí |
| Desactivar usuarios | No | Sí |
| Reactivar usuarios | No | Sí |
| Eliminar usuarios | No | Sí |
| Administrar ubicaciones | No | Sí |
| Generar códigos QR | No | Sí |
| Modificar registros históricos | No | No |
| Eliminar registros históricos | No | No |
| Cerrar sesión | Sí | Sí |

## 6. Requerimientos funcionales

### 6.1. Módulo de autenticación

| ID | Requerimiento |
|---|---|
| RF-001 | Permitir el inicio de sesión mediante usuario y contraseña. |
| RF-002 | Mantener la sesión activa al cerrar y volver a abrir la aplicación. |
| RF-003 | Renovar automáticamente las sesiones válidas. |
| RF-004 | Impedir el acceso a usuarios desactivados. |
| RF-005 | Permitir el cierre manual de sesión. |
| RF-006 | Restringir la creación de cuentas al administrador. |
| RF-007 | Impedir la modificación de credenciales por usuarios operativos. |
| RF-008 | Revocar el acceso cuando una cuenta sea desactivada. |
| RF-009 | Excluir mecanismos de autorregistro y recuperación de contraseñas. |
| RF-010 | Validar los permisos del usuario en el backend. |

La persistencia de la sesión será automática y no requerirá seleccionar una casilla de recordatorio.

La sesión podrá finalizar por cierre voluntario, revocación administrativa, invalidación de credenciales o eliminación de los datos locales de la aplicación.

### 6.2. Módulo de escaneo QR

| ID | Requerimiento |
|---|---|
| RF-011 | Permitir el acceso a la cámara del dispositivo móvil. |
| RF-012 | Utilizar preferentemente la cámara posterior. |
| RF-013 | Reconocer códigos QR asociados a ubicaciones registradas. |
| RF-014 | Identificar automáticamente al usuario autenticado. |
| RF-015 | Generar un movimiento automáticamente al reconocer un QR válido. |
| RF-016 | Obtener la fecha y hora desde el servidor o base de datos. |
| RF-017 | Mostrar una confirmación visual después de almacenar el movimiento. |
| RF-018 | Prevenir registros duplicados originados por una misma lectura. |
| RF-019 | Rechazar códigos QR desconocidos, inválidos o desactivados. |
| RF-020 | Informar errores de conectividad o almacenamiento. |
| RF-021 | Permitir realizar un nuevo escaneo después de finalizar el anterior. |

El usuario no deberá completar formularios, seleccionar ubicaciones, introducir fechas ni confirmar manualmente el registro.

### 6.3. Módulo de movimientos

| ID | Requerimiento |
|---|---|
| RF-022 | Mostrar el historial general de movimientos. |
| RF-023 | Ordenar los registros desde el más reciente al más antiguo. |
| RF-024 | Mostrar el nombre del tecnólogo médico responsable. |
| RF-025 | Mostrar el nombre de la ubicación. |
| RF-026 | Mostrar la fecha y hora del movimiento. |
| RF-027 | Mantener el historial disponible entre sesiones. |
| RF-028 | Impedir la modificación o eliminación de registros históricos desde la aplicación. |
| RF-029 | Permitir la consulta del historial sin filtros. |

El historial deberá utilizar paginación o carga progresiva para mantener un rendimiento adecuado a medida que aumente el número de registros.

### 6.4. Módulo de administración de usuarios

| ID | Requerimiento |
|---|---|
| RF-030 | Visualizar el listado de usuarios. |
| RF-031 | Crear nuevos usuarios. |
| RF-032 | Asignar nombre de usuario. |
| RF-033 | Registrar nombre completo. |
| RF-034 | Registrar correo electrónico. |
| RF-035 | Establecer y modificar contraseñas. |
| RF-036 | Asignar roles. |
| RF-037 | Desactivar usuarios. |
| RF-038 | Reactivar usuarios. |
| RF-039 | Eliminar usuarios mediante borrado lógico. |
| RF-040 | Preservar los movimientos asociados a usuarios desactivados o eliminados. |

Las contraseñas existentes no deberán mostrarse al administrador. Este únicamente podrá establecer una nueva contraseña.

### 6.5. Módulo de administración de ubicaciones

| ID | Requerimiento |
|---|---|
| RF-041 | Crear ubicaciones físicas. |
| RF-042 | Asignar un nombre a cada ubicación. |
| RF-043 | Generar un identificador único por ubicación. |
| RF-044 | Generar un código QR permanente asociado a dicho identificador. |
| RF-045 | Descargar códigos QR para su impresión. |
| RF-046 | Modificar el nombre de una ubicación. |
| RF-047 | Desactivar ubicaciones. |
| RF-048 | Reactivar ubicaciones. |
| RF-049 | Preservar el historial asociado a ubicaciones desactivadas. |

## 7. Flujo operativo

1. El tecnólogo médico abre APA Transit desde su celular.
2. La aplicación verifica la existencia de una sesión válida.
3. Si no existe una sesión válida, solicita usuario y contraseña.
4. El tecnólogo accede al escáner QR.
5. La cámara reconoce el código instalado en la ubicación.
6. El backend valida al usuario y la ubicación.
7. La base de datos registra el movimiento con su marca temporal.
8. La aplicación recibe la confirmación del almacenamiento.
9. La interfaz informa que el movimiento fue registrado.
10. El registro queda disponible en el historial general.

## 8. Estructura de navegación

### 8.1. Login

- Nombre de usuario.
- Contraseña.
- Botón de inicio de sesión.

Se excluyen recuperación de contraseña, autorregistro y autenticación mediante terceros.

### 8.2. Inicio

- Nombre de la aplicación.
- Identificación del usuario autenticado.
- Botón para escanear código QR.
- Último movimiento propio registrado.
- Estado del último registro.

### 8.3. Movimientos

- Historial general.
- Agrupación visual por fecha.
- Nombre del tecnólogo médico.
- Ubicación.
- Hora del movimiento.
- Orden cronológico descendente.

No incluye filtros, búsquedas ni opciones de edición.

### 8.4. Configuración del usuario operativo

- Nombre de usuario.
- Nombre completo.
- Correo electrónico en modo de solo lectura.
- Cierre de sesión.

### 8.5. Configuración del administrador

**Administración de usuarios**

- Listado de usuarios.
- Crear usuario.
- Modificar usuario.
- Establecer nueva contraseña.
- Desactivar usuario.
- Reactivar usuario.
- Eliminar usuario.

**Administración de ubicaciones**

- Listado de ubicaciones.
- Crear ubicación.
- Modificar nombre.
- Generar QR.
- Descargar QR.
- Desactivar ubicación.
- Reactivar ubicación.

### 8.6. Menú de navegación principal

La aplicación dispondrá de tres opciones permanentes.

- Inicio.
- Movimientos.
- Configuración.

El escáner QR estará disponible desde la pantalla de inicio.

## 9. Códigos QR y ubicaciones

Cada código QR representará una ubicación física específica.

Los códigos serán estáticos, permanentes y reutilizables.

El contenido del QR estará compuesto por un identificador único asociado a una ubicación existente en la base de datos.

**Formato propuesto**

`APA-TRANSIT:LOC:UUID`

El nombre visible de la ubicación se obtendrá desde la base de datos y no directamente desde el contenido del código QR.

La modificación del nombre de una ubicación no requerirá imprimir nuevamente su código QR.

El código podrá ser impreso e instalado físicamente en el área correspondiente.

## 10. Modelo de datos

### 10.1. Entidad profiles

| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID | Identificador vinculado a la cuenta de autenticación |
| username | VARCHAR | Nombre de usuario único |
| full_name | VARCHAR | Nombre completo |
| email | VARCHAR | Correo electrónico |
| role | ENUM | admin / operator |
| is_active | BOOLEAN | Estado de la cuenta |
| created_at | TIMESTAMPTZ | Fecha de creación |
| updated_at | TIMESTAMPTZ | Última modificación |
| deleted_at | TIMESTAMPTZ | Fecha de eliminación lógica |

### 10.2. Entidad locations

| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID | Identificador de ubicación |
| name | VARCHAR | Nombre de la ubicación |
| qr_token | UUID | Identificador único del QR |
| is_active | BOOLEAN | Estado de la ubicación |
| created_at | TIMESTAMPTZ | Fecha de creación |
| updated_at | TIMESTAMPTZ | Última modificación |

### 10.3. Entidad movements

| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID | Identificador del movimiento |
| user_id | UUID | Usuario responsable |
| location_id | UUID | Ubicación registrada |
| user_name_snapshot | VARCHAR | Nombre del usuario al registrar el movimiento |
| location_name_snapshot | VARCHAR | Nombre de la ubicación al registrar el movimiento |
| request_id | UUID | Identificador de idempotencia |
| recorded_at | TIMESTAMPTZ | Fecha y hora del servidor |

Los campos snapshot permitirán preservar la información histórica aunque posteriormente se modifique el nombre de un usuario o ubicación.

### 10.4. Relaciones

- Un usuario puede tener múltiples movimientos.
- Una ubicación puede tener múltiples movimientos.
- Cada movimiento pertenece a un usuario.
- Cada movimiento pertenece a una ubicación.

Supabase Auth gestiona las contraseñas y emite sus tokens. La sesión de la aplicación se guarda en el servidor según la arquitectura propuesta.

## 11. Reglas de negocio

| ID | Regla |
|---|---|
| RN-001 | Todo movimiento deberá estar asociado a un usuario autenticado. |
| RN-002 | Todo movimiento deberá estar asociado a una ubicación activa. |
| RN-003 | Cada código QR deberá identificar una única ubicación. |
| RN-004 | La fecha y hora deberán obtenerse desde el servidor. |
| RN-005 | Los movimientos no serán editables ni eliminables desde la aplicación. |
| RN-006 | Los usuarios operativos no podrán modificar credenciales. |
| RN-007 | La administración de cuentas será exclusivamente administrativa. |
| RN-008 | La desactivación de un usuario impedirá nuevos movimientos. |
| RN-009 | La eliminación lógica de usuarios preservará sus registros históricos. |
| RN-010 | La desactivación de una ubicación impedirá nuevos registros en ella. |
| RN-011 | Una lectura válida deberá generar un único movimiento. |
| RN-012 | El éxito solo podrá informarse después de confirmar la persistencia del registro. |
| RN-013 | No se registrarán datos clínicos ni identificadores de pacientes. |
| RN-014 | Los registros temporales se almacenarán en UTC y se visualizarán en America/Santiago. |
| RN-015 | No existirán categorías obligatorias de entrada o salida. |
| RN-016 | Los usuarios autenticados activos podrán consultar el historial general. |

## 12. Requerimientos no funcionales

| ID | Categoría | Requerimiento |
|---|---|---|
| RNF-001 | Usabilidad | Diseño mobile-first. |
| RNF-002 | Compatibilidad | Android, iOS y navegadores modernos. |
| RNF-003 | Instalación | Compatible con instalación PWA. |
| RNF-004 | Rendimiento | Objetivo de registro inferior a 2 segundos en condiciones normales de conectividad. |
| RNF-005 | Seguridad | Comunicación mediante HTTPS. |
| RNF-006 | Seguridad | Autenticación segura y control de acceso basado en roles. |
| RNF-007 | Seguridad | Validación de permisos en el servidor. |
| RNF-008 | Integridad | Registros protegidos contra modificaciones desde la aplicación. |
| RNF-009 | Persistencia | Almacenamiento en PostgreSQL. |
| RNF-010 | Mantenibilidad | Arquitectura modular y documentada. |
| RNF-011 | Escalabilidad | Incorporación de usuarios y ubicaciones sin modificar el código fuente. |
| RNF-012 | Portabilidad | Instalación sin dependencia de tiendas de aplicaciones. |
| RNF-013 | Recuperabilidad | Estrategia documentada de respaldo y recuperación de la base de datos. |
| RNF-014 | Accesibilidad | Contraste adecuado, mensajes comprensibles y controles táctiles. |
| RNF-015 | Privacidad | Almacenamiento limitado a los datos necesarios para la operación. |

## 13. Arquitectura tecnológica

| Componente | Tecnología |
|---|---|
| Framework | Next.js |
| Lenguaje | TypeScript |
| Frontend | React |
| Estilos | Tailwind CSS |
| Componentes UI | shadcn/ui |
| Backend | Next.js Route Handlers |
| Base de datos | PostgreSQL |
| Database as a Service | Supabase |
| Autenticación | Supabase Auth |
| Seguridad de datos | Row Level Security |
| Escáner QR | html5-qrcode |
| Generador QR | qrcode |
| Validación de datos | Zod |
| Instalación móvil | PWA |
| Hosting | Vercel |
| Control de versiones | GitHub |
| Zona horaria | America/Santiago |

### 13.1. Capa de presentación

Interfaz responsive compatible con celulares y computadores.

Incluye login, inicio, escáner QR, historial y configuración.

### 13.2. Capa de aplicación

Responsabilidades

- Autenticación.
- Gestión de sesiones.
- Validación de códigos QR.
- Control de permisos.
- Registro de movimientos.
- Administración de usuarios.
- Administración de ubicaciones.

### 13.3. Capa de persistencia

Supabase PostgreSQL será responsable del almacenamiento persistente, integridad referencial, restricciones de datos y control de acceso.

### 13.4. Capa de infraestructura

Vercel alojará la aplicación web y sus endpoints de backend.

Supabase proporcionará los servicios de autenticación y base de datos.

## 14. Contratos y aceptación

La [API](API.md) define los endpoints de autenticación, movimientos, cuentas y ubicaciones. El [plan de pruebas](TEST_PLAN.md) vincula los requisitos a sus verificaciones. La [arquitectura](ARCHITECTURE.md) propone los mecanismos de sesión e idempotencia.

Para aceptar el MVP, una cuenta activa debe poder instalar la PWA en iOS y Android, reabrirla con su sesión vigente, escanear el QR fijo de una ubicación como Oficina de becados y ver un único registro persistido con identidad, ubicación y hora de servidor. Ambas funciones consultan el mismo historial. El administrador gestiona cuentas, credenciales y ubicaciones con preservación de los registros anteriores. Una cuenta revocada pierde el acceso en su próxima solicitud.

## 15. RF-007 · Restricción de credenciales pendiente y bloqueante

Supabase Auth permite a un usuario con una sesión válida solicitar cambios propios de correo o contraseña. El control de roles de APA Transit y las políticas RLS de las tablas de aplicación no gobiernan esa API. El requisito se considera pendiente hasta verificar en el entorno de destino que un operador con sus credenciales de inicio y su sesión de APA Transit carece de una ruta directa o indirecta para iniciar sesión en Auth por fuera del backend, obtener tokens, recuperar la cuenta o cambiar credenciales.

La solución propuesta lleva toda la autenticación a Vercel y entrega al dispositivo una sesión opaca de APA Transit. La API de Auth queda detrás de un ingreso autenticado de servidor. [Seguridad](SECURITY.md) especifica la condición de salida y el [plan de pruebas](TEST_PLAN.md) describe la evidencia requerida.

## 16. Decisiones de implementación propuestas

Se propone PostgreSQL como fuente de hora, paginación por cursor, un identificador por captura y un QR descargable en PNG. La aplicación necesita red para registrar. La recuperación operativa de la base de datos corresponde a infraestructura y es independiente de las credenciales. La duración de sesión, el catálogo inicial restante, la retención institucional y los objetivos de recuperación se cierran antes del piloto.
