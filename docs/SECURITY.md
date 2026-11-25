# Seguridad

## RF-007 · Control exclusivo de credenciales pendiente

Supabase Auth ofrece `updateUser` a usuarios autenticados y `auth.admin.updateUserById` a clientes administrativos de servidor. Ocultar opciones, aplicar RLS al esquema de APA Transit o exigir una contraseña actual no establece una prohibición de cambio en Auth. Una cookie HttpOnly con tokens de Supabase tampoco resuelve por sí sola un inicio de sesión directo contra el proveedor. [Actualización de usuario](https://supabase.com/docs/reference/javascript/auth-updateuser) · [Actualización administrativa](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)

### Diseño propuesto

- El navegador recibe una cookie persistente `__Host-apa_session` con un identificador aleatorio de al menos 256 bits, atributos `HttpOnly; Secure; SameSite=Lax; Path=/` y expiración explícita. Guarda solo su hash como identificador en PostgreSQL. Los tokens de Auth quedan cifrados en servidor con una clave separada. Emite un identificador nuevo al iniciar sesión y borra la cookie al salir.
- Vercel ejecuta el login por contraseña, la renovación y las llamadas administrativas. Guarda la clave de Auth en variables privadas y evita que el proyecto emita claves de acceso utilizables por clientes externos. El proyecto se dedica a APA Transit. Deshabilita claves heredadas, revoca claves publicables innecesarias y comprueba el rechazo de peticiones directas a Auth en todos los ingresos del proyecto, incluido el dominio original. El inventario de claves y el comportamiento del gateway son parte de la evidencia. [Claves de Supabase](https://supabase.com/docs/guides/getting-started/api-keys)
- Si el gateway administrado no ofrece el control verificable requerido, usa Supabase autogestionado con Auth detrás de un ingreso privado o un proxy autenticado con credencial exclusiva del backend y origen cerrado. En este despliegue, Vercel sigue alojando la PWA y la API. Un proxy añadido delante de un origen que aún admite acceso directo deja RF-007 abierto. Las restricciones de red de la base de datos de Supabase no cubren Auth HTTPS. [Restricciones de red](https://supabase.com/docs/guides/platform/network-restrictions)
- Deshabilita alta pública, acceso anónimo y proveedores alternativos. El administrador aprovisiona y confirma internamente la identidad mediante Auth Admin. Excluye rutas de verificación y recuperación y comprueba que el proveedor tampoco admite recuperar las cuentas por un ingreso accesible al operador. Usa el correo administrado como identificador upstream y restringe su actualización al flujo administrativo. [Configuración de Auth](https://supabase.com/docs/guides/auth/general-configuration)

### Condición de liberación

Cierra RF-007 cuando S01–S04 pasen en la topología y configuración de destino. Usa cuentas de prueba. Conserva evidencia redactada de límites de acceso, inventario de claves y ausencia de tokens de Auth en el cliente. Si se puede iniciar sesión o recuperar una cuenta directamente desde afuera, cambiar credenciales desde una cuenta operativa, o queda un ingreso sin verificar, bloquea producción.

## Permisos y revocación

Valida sesión, vigencia del perfil y rol de base de datos en cada operación. Las mutaciones comprueban origen permitido y protección CSRF, incluso login y logout. Aplica límites por IP y usuario en login y límites por sesión en escaneo. Usa errores genéricos para credenciales inválidas y datos específicos solo en operaciones autorizadas. Rechaza cambios que dejen el sistema sin administrador activo.

El cierre revoca la sesión actual. La desactivación, el borrado lógico, el cambio de credenciales o rol y la revocación administrativa invalidan todas las sesiones APA Transit de la cuenta. Una cuenta reactivada debe iniciar sesión de nuevo. Revoca sesiones upstream cuando el mecanismo elegido lo permita y no dependas del vencimiento de JWT para denegar acceso en la aplicación. [Sesiones de Supabase](https://supabase.com/docs/guides/auth/sessions)

## Privacidad y auditoría

Controla el acceso al historial general y registra actor, objetivo, operación y resultado de cambios administrativos. Redacta contraseñas, cookies, tokens, claves y cuerpos sensibles en logs. Elimina caché privada al salir. El QR es reutilizable y copiable, por lo que el registro acredita que una cuenta presentó el código de la ubicación. Su control físico corresponde al servicio.
