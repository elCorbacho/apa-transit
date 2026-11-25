# Despliegue

## Preparación

1. Crea ambientes separados para desarrollo, pruebas y producción. Asocia cada despliegue Vercel solamente a sus servicios de Supabase y a su dominio HTTPS. Usa datos sintéticos y credenciales distintas en vistas previas.
2. Versiona y aplica migraciones del esquema, permisos, índices y transacciones en pruebas. Configura Auth según [Seguridad](SECURITY.md). Ejecuta las pruebas bloqueantes en la configuración elegida antes de habilitar producción.
3. Configura variables privadas de servidor. Usa `SUPABASE_URL`, `SUPABASE_AUTH_KEY`, `DATABASE_URL` con el rol de aplicación, `APP_SESSION_ENCRYPTION_KEY` y `APP_ORIGIN`. Si el ingreso requiere otra credencial, guárdala también del lado servidor. Mantén un ejemplo con nombres y valores vacíos en la implementación. Evita prefijos `NEXT_PUBLIC_` para estos valores.
4. Aprovisiona el primer administrador mediante un procedimiento protegido, verifica su cuenta y retira el mecanismo temporal de arranque. Carga el catálogo real y verifica con el servicio dónde se instala cada impresión. Conserva el mismo QR cuando se edita el nombre.
5. Configura manifest, iconos, URL de inicio, modo standalone y caché exclusiva de recursos públicos. Prueba instalación, cámara, red y reingreso en teléfonos reales. Capacita al administrador en altas, bajas y reasignación de contraseñas.
6. Ejecuta el piloto con los casos de aceptación. Verifica que la aplicación usa su propio origen y revisa trazas redactadas, latencia y errores antes de abrir acceso.

## Operación y recuperación de infraestructura

Asigna responsables para Vercel, Supabase y administración de cuentas. Define periodicidad y retención de respaldos junto con RPO y RTO acordes al plan de Supabase o al entorno autogestionado. Incluye en el procedimiento la restauración de identidades, perfiles, ubicaciones y movimientos. Verifica el enlace de UUID entre Auth y perfiles, las restricciones y la cantidad de registros. Invalida sesiones restauradas antes de reabrir acceso.

Mantén migraciones compatibles durante cada publicación para poder volver a una versión anterior de Vercel. Si una migración impide el rollback, restaura en un ambiente separado y decide el cambio de tráfico tras verificar consistencia. Ante una exposición de secretos, rota claves, revoca sesiones y repite las pruebas de acceso de Auth.
