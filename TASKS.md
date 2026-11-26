# Tareas de implementación

El orden y los cierres siguientes siguen vigentes. La implementación local
parcial no equivale a aceptar un caso en el entorno de destino.

| ID | Entregable | Depende de | Cierre |
|---|---|---|---|
| T01 | Validar ingreso de Auth en entorno aislado y documentar decisión de infraestructura | — | S01–S04 en destino |
| T02 | Esqueleto Next.js, PWA y configuración aislada por ambiente | — | P01 en dispositivos |
| T03 | Migraciones, permisos, sesiones y transacción de escaneo | — | D01 y M02–M04 |
| T04 | Login, renovación, perfil y cierre | T01, T03 | A01–A04 |
| T05 | Administración de cuentas y reconciliación con Auth | T04 | U01–U03 |
| T06 | Administración de ubicaciones y PNG para impresión | T04 | Q01–Q02 |
| T07 | Cámara, registro automático y confirmación | T03, T04, T06 | M01–M04 |
| T08 | Historial y último movimiento propio | T07 | H01–H02 |
| T09 | Piloto, recuperación de infraestructura y salida | T01–T08 | P02, P03 y repetición de S01–S04 |

## Estado local (26 de noviembre de 2026)

| Hito | Avance observado | Falta para cerrar |
|---|---|---|
| T01 | Conexiones de inspección configuradas | S01–S04 en el destino; sin cambios remotos autorizados |
| T02 | Estructura Next.js y manifiesto PWA | Instalación y uso en dispositivos (P01) |
| T03 | Migración redactada, endpoints de sesión/movimientos, M02/M04 comprobados en PostgreSQL aislado | Aplicación y validación de permisos en el destino (D01) |
| T04 | API local de login, perfil y cierre; interfaz inicial de login y perfil | Auth real, navegador y sesiones persistentes (A01–A04) |
| T05 | API local de administración de usuarios (listar, renombrar, activar/desactivar), con protección del último admin | Email, rol, contraseña y reconciliación con Auth; aceptación U01–U03 en destino |
| T06 | API e interfaz local de ubicaciones y descarga PNG, con pruebas sintéticas | Interacción en navegador, lectura de QR impreso en dispositivos y aceptación Q01–Q02 |
| T07 | Flujo local de escáner, captura y confirmación implementado | Cámara, permisos, red y QR impreso en dispositivos (M01/M03), tiempo y concurrencia en destino |
| T08 | API e interfaz local de historial | Flujo completo y H01–H02 en dispositivos |
| T09 | Pendiente | Piloto, respaldo, restauración y aceptación de seguridad |

Durante T01, conserva evidencia redactada de la configuración y de cada prueba negativa. Si el proyecto administrado no ofrece un perímetro comprobable, evalúa el ingreso privado de Supabase autogestionado de [Seguridad](docs/SECURITY.md). El paso a producción queda pendiente hasta cerrar T01 y T09.

Antes del piloto, acuerda el inventario de ubicaciones, responsables operativos, expiración de sesiones, retención y objetivos de respaldo. Registra la decisión en el documento correspondiente.
