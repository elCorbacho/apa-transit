# Guía de Despliegue - APA Transit

Esta guía documenta el proceso para desplegar APA Transit en producción.

## Estado actual

El MVP está completamente implementado localmente con:
- ✅ 104 tests pasando
- ✅ TypeScript y build aprobados
- ✅ Integración de todas las ramas feature en `feat/application-mvp`
- ⏳ Pendiente: despliegue en Supabase/Vercel y pruebas de aceptación

## Requisitos previos

### Cuentas y permisos
- Cuenta de GitHub con acceso al repositorio
- Cuenta de Supabase (proyecto `apa-transit-dev` o nuevo)
- Cuenta de Vercel (proyecto `apa-transit`)
- Permisos de administrador en ambos servicios

### Herramientas locales
- Node.js 22.12 o superior
- npm 10+
- Git
- PostgreSQL 16 (opcional, para pruebas locales avanzadas)

## Paso 1: Preparar Supabase

### 1.1 Crear o verificar proyecto
- Proyecto: `apa-transit-dev` (desarrollo) o crear nuevo
- Región: Oregon (us-west-1) recomendada
- Anotar el **Project URL** y **Project ID**

### 1.2 Aplicar migración SQL
```bash
# Conectar al proyecto Supabase
# Método 1: Supabase Dashboard → SQL Editor
# Método 2: Supabase CLI (si está instalado)
supabase db push

# Método 3: psql directo
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  -f supabase/migrations/202611250001_initial.sql
```

### 1.3 Configurar Auth
- Deshabilitar "Enable email confirmations" (si está habilitado)
- Deshabilitar "Enable email OTP" (si está habilitado)
- Verificar que no haya proveedores de auth habilitados (Google, GitHub, etc.)
- Configurar contraseña mínima de 8 caracteres

### 1.4 Obtener claves API
- **Project URL**: `https://[PROJECT_REF].supabase.co`
- **anon public key**: Para `SUPABASE_AUTH_KEY`
- **service_role key**: Para `SUPABASE_ADMIN_KEY` (⚠️ nunca exponer en cliente)

## Paso 2: Preparar Vercel

### 2.1 Vincular repositorio
```bash
# En Vercel Dashboard
# New Project → Import Git Repository → elCorbacho/apa-transit
# Framework Preset: Next.js
# Build Command: npm run build
# Output Directory: .next
```

### 2.2 Configurar variables de entorno
En Vercel Dashboard → Project Settings → Environment Variables:

```bash
APP_ENV=production
APP_ORIGIN=https://apa-transit.vercel.app  # O tu dominio personalizado

# Base de datos (usar el usuario apa_app, NO postgres)
DATABASE_URL=postgresql://apa_app:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres

# Supabase Auth
SUPABASE_URL=https://[PROJECT_REF].supabase.co
SUPABASE_AUTH_KEY=[anon_public_key]
SUPABASE_ADMIN_KEY=[service_role_key]  # ⚠️ Solo en servidor

# Encriptación de sesiones
APP_SESSION_ENCRYPTION_KEY=[generar_con_openssl_rand_-base64_32]

# Duración de sesión (días)
SESSION_DAYS=7

# Seguridad (dejar en false hasta completar RF-007)
RF007_VERIFIED=false
```

### 2.3 Generar clave de encriptación
```bash
openssl rand -base64 32
```

## Paso 3: Crear primer administrador

### 3.1 Insertar usuario en PostgreSQL
```sql
-- En Supabase SQL Editor
BEGIN;

-- 1. Crear usuario en Auth
-- (esto debe hacerse manualmente en Supabase Dashboard → Authentication → Users)
-- Email: admin@apa-transit.local
-- Password: [generar_contraseña_segura]
-- Anotar el UUID del usuario creado

-- 2. Crear perfil en apa_private
INSERT INTO apa_private.profiles (
  id,  -- UUID del usuario Auth
  username,
  full_name,
  email,
  role
) VALUES (
  '[UUID_DEL_USUARIO_AUTH]',
  'admin',
  'Administrador APA',
  'admin@apa-transit.local',
  'admin'
);

COMMIT;
```

### 3.2 Verificar acceso
- Navegar a `https://apa-transit.vercel.app`
- Login con `admin` / `[contraseña]`
- Verificar que aparece la interfaz de administración

## Paso 4: Aceptación de seguridad (RF-007)

⚠️ **CRÍTICO**: No habilitar producción hasta completar S01-S04.

### S01: Verificar perímetro de Auth
```bash
# Desde fuera del perímetro autorizado, intentar:
# 1. Login directo a Supabase Auth con credenciales de prueba
# 2. Acceso a API sin cookie de sesión
# 3. Cambio de contraseña desde cuenta operativa
```

### S02: Verificar ausencia de tokens en cliente
```bash
# En navegador:
# 1. Abrir DevTools → Application → Local Storage
# 2. Verificar que NO hay tokens de Supabase almacenados
# 3. Verificar que solo existe cookie __Host-apa_session
```

### S03: Verificar cambio de credenciales
```bash
# Intentar cambiar contraseña desde:
# 1. Cuenta operativa (debe fallar)
# 2. Admin desde API autorizada (debe funcionar y revocar sesiones)
```

### S04: Verificar inventario de claves
```bash
# En Supabase Dashboard → Settings → API
# 1. Verificar que solo existen anon y service_role
# 2. Deshabilitar legacy keys si existen
# 3. Verificar que no hay claves publicables innecesarias
```

**Resultado**: Cambiar `RF007_VERIFIED=true` en Vercel.

## Paso 5: Crear ubicaciones y QR

### 5.1 Crear primera ubicación
- Login como admin
- Ir a Configuración → Ubicaciones
- Crear ubicación: "Recepción Principal"
- Descargar QR PNG

### 5.2 Imprimir y probar QR
- Imprimir QR en tamaño A5 o superior
- Probar escaneo desde teléfono Android/iOS
- Verificar que el movimiento se registra correctamente

## Paso 6: Crear usuarios operativos

### 6.1 Crear usuarios de prueba
```sql
-- Repetir para cada usuario operativo
-- 1. Crear en Auth (Supabase Dashboard)
-- 2. Crear perfil en PostgreSQL
INSERT INTO apa_private.profiles (id, username, full_name, email, role)
VALUES ('[UUID]', 'tecnologo1', 'Tecnólogo 1', 'tec1@apa-transit.local', 'operator');
```

### 6.2 Distribuir credenciales
- Enviar credenciales de forma segura (no por chat/email plano)
- Primer login: cambiar contraseña temporal
- Verificar que pueden escanear QR

## Paso 7: Pruebas en dispositivos

### 7.1 Instalar PWA
- Android: Chrome → Menú → "Agregar a pantalla principal"
- iOS: Safari → Compartir → "Agregar a pantalla de inicio"
- Verificar icono y nombre correcto

### 7.2 Probar flujos completos
1. Login desde dispositivo
2. Escanear QR
3. Verificar confirmación con datos del servidor
4. Cerrar sesión
5. Reabrir app (debe pedir login)
6. Login nuevamente (sesión no persiste entre reinstalaciones)

### 7.3 Probar escenarios edge
- Cámara denegada → mensaje de error
- Red caída durante escaneo → reintentar con mismo ID
- Sesión vencida → redirigir a login
- QR inválido → mensaje de error

## Paso 8: Piloto

### 8.1 Selección de participantes
- 2-3 tecnólogos médicos
- 1 administrador
- Período: 1-2 semanas

### 8.2 Monitoreo
- Revisar logs de Vercel diariamente
- Verificar latencia de respuestas (< 2s objetivo)
- Documentar errores o comportamientos inesperados

### 8.3 Retroalimentación
- Encuesta semanal a participantes
- Ajustar umbrales si es necesario (ej: 120 intentos/15min)
- Documentar mejoras para futuras iteraciones

## Paso 9: Rollback

Si se detectan problemas críticos:

### 9.1 Rollback de Vercel
```bash
# Vercel Dashboard → Deployments → Promote previous deployment
```

### 9.2 Rollback de base de datos
```bash
# Restaurar backup de Supabase
# Supabase Dashboard → Database → Backups → Restore
```

### 9.3 Comunicación
- Notificar a usuarios del incidente
- Documentar causa raíz
- Plan de mitigación

## Checklist final

- [ ] Migración SQL aplicada en Supabase
- [ ] Auth configurado correctamente
- [ ] Vercel desplegado con variables de entorno
- [ ] Primer administrador creado y verificado
- [ ] RF-007 S01-S04 completados y documentados
- [ ] `RF007_VERIFIED=true` en Vercel
- [ ] Primera ubicación creada y QR impreso
- [ ] QR escaneado exitosamente desde teléfono
- [ ] Usuarios operativos creados
- [ ] PWA instalada y probada en dispositivos
- [ ] Piloto iniciado con participantes seleccionados
- [ ] Monitoreo activo de logs y métricas

## Soporte

Para problemas técnicos:
- Revisar logs de Vercel: `https://vercel.com/elcorbachos-projects/apa-transit/logs`
- Revisar logs de Supabase: `https://supabase.com/dashboard/project/[PROJECT_REF]/logs`
- Consultar documentación: `docs/SECURITY.md`, `docs/DEPLOYMENT.md`

## Contacto

- Proyecto: elCorbacho/apa-transit
- Rama principal: `feat/application-mvp`
- Última actualización: 2026-11-26
