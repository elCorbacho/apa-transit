# Configuración y Dependencias

## Variables de entorno

### Requeridas para desarrollo local

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `APP_ENV` | Entorno de ejecución | `development` |
| `APP_ORIGIN` | URL base de la aplicación | `http://localhost:3000` |
| `DATABASE_URL` | Conexión PostgreSQL con rol `apa_app` | `postgresql://apa_app:pass@localhost:5432/apa_transit` |
| `SUPABASE_URL` | URL del proyecto Supabase | `https://xyzcompany.supabase.co` |
| `SUPABASE_AUTH_KEY` | Clave pública anon de Supabase | `eyJhbGciOiJIUzI1NiIsInR5cCI6...` |
| `SUPABASE_ADMIN_KEY` | Clave service_role de Supabase | `eyJhbGciOiJIUzI1NiIsInR5cCI6...` |
| `APP_SESSION_ENCRYPTION_KEY` | Clave AES-256 para encriptar tokens | Generar con `openssl rand -base64 32` |
| `SESSION_DAYS` | Duración de sesión en días | `7` |
| `RF007_VERIFIED` | Confirmación de seguridad RF-007 | `false` (cambiar a `true` solo en producción verificada) |

### Requerida al conectar con Supabase

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_CA_CERT` | Contenido PEM de la CA de Supabase, no una ruta | El certificado completo, desde `-----BEGIN CERTIFICATE-----` hasta `-----END CERTIFICATE-----` |

El driver verifica el certificado del servidor con `rejectUnauthorized: true` y no acepta uno desconocido. Supabase firma la base y el pooler con su propia CA, así que sin esta variable la conexión falla con `SELF_SIGNED_CERT_IN_CHAIN`. El certificado se descarga desde el panel de Supabase (Database Settings → SSL Configuration) o desde:

```
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
```

### ⚠️ Seguridad

- **NUNCA** publicar `.env.local` en Git
- **NUNCA** compartir `SUPABASE_ADMIN_KEY` con el cliente
- **NUNCA** usar `NEXT_PUBLIC_` para variables sensibles
- **SIEMPRE** generar `APP_SESSION_ENCRYPTION_KEY` con herramienta criptográfica

## Dependencias principales

### Runtime

| Paquete | Versión | Propósito |
|---------|---------|-----------|
| `next` | 15.x | Framework React con SSR |
| `react` | 18.x | UI library |
| `@supabase/supabase-js` | 2.x | Cliente Supabase para Auth |
| `pg` | 8.x | Cliente PostgreSQL |
| `html5-qrcode` | 2.x | Escaneo de códigos QR |
| `qrcode` | 1.x | Generación de códigos QR PNG |
| `zod` | 3.x | Validación de schemas |

### Desarrollo

| Paquete | Versión | Propósito |
|---------|---------|-----------|
| `typescript` | 5.x | Type checking |
| `vitest` | 1.x | Testing framework |
| `@testing-library/react` | 14.x | Testing de componentes React |
| `jsdom` | 24.x | Simulación de DOM para tests |

### Node.js

- **Requerido**: Node.js 22.12 o superior
- **Recomendado**: Node.js 24.x
- **npm**: 10.x o superior

## Base de datos

### Esquema

El esquema SQL está en `supabase/migrations/202611250001_initial.sql` e incluye:

- `apa_private.profiles`: Perfiles de usuario vinculados a Auth
- `apa_private.locations`: Ubicaciones con QR único
- `apa_private.movements`: Registro de movimientos
- `apa_private.app_sessions`: Sesiones de aplicación
- `apa_private.audit_events`: Auditoría de cambios administrativos
- `apa_private.rate_limits`: Control de intentos de login/escaneo

### Roles PostgreSQL

- **`postgres`**: Owner del schema (solo para migraciones)
- **`apa_app`**: Rol de aplicación (usado en `DATABASE_URL`)
  - Permisos limitados a operaciones necesarias
  - No puede modificar estructura de tablas
  - Solo puede leer/escribir en `apa_private`

### Migraciones

```bash
# Aplicar migración localmente
psql $DATABASE_URL -f supabase/migrations/202611250001_initial.sql

# Aplicar en Supabase
# Opción 1: Supabase Dashboard → SQL Editor
# Opción 2: Supabase CLI
supabase db push
```

## API Endpoints

### Autenticación
- `POST /api/auth/login` - Login con username/password
- `POST /api/auth/logout` - Cerrar sesión
- `GET /api/me` - Perfil y último movimiento

### Movimientos
- `POST /api/movements` - Registrar movimiento (idempotente)
- `GET /api/movements` - Historial compartido (paginado)

### Administración de ubicaciones (requiere rol admin)
- `GET /api/admin/locations` - Listar ubicaciones
- `POST /api/admin/locations` - Crear ubicación
- `PATCH /api/admin/locations/:id` - Actualizar ubicación
- `GET /api/admin/locations/:id/qr` - Descargar QR PNG

### Administración de usuarios (requiere rol admin)
- `GET /api/admin/users` - Listar usuarios
- `POST /api/admin/users` - Crear usuario
- `PATCH /api/admin/users/:id` - Actualizar usuario (email, password, role, isActive)

### Sistema
- `GET /api/health` - Estado de salud de la aplicación

## Características técnicas

### Seguridad
- Sesiones opacas con encriptación AES-256-GCM
- CSRF protection en todas las mutaciones
- Rate limiting: 5 intentos login por usuario, 60 por IP
- Rate limiting: 120 escaneos por sesión cada 15 minutos
- Protección del último administrador activo
- Revocación automática de sesiones al cambiar credenciales

### Concurrencia
- Advisory locks para prevenir registros duplicados
- Location locks para validar estado de ubicación
- Transacciones atómicas para movimientos
- Idempotencia por `requestId` del cliente

### Frontend
- PWA instalable (manifest + service worker)
- Escaneo QR con cámara trasera preferida
- Confirmación visual con datos del servidor
- Gestión de estado privado con limpieza en logout
- Manejo de errores de red con reintentos idempotentes

### Backend
- Next.js App Router
- Server-side rendering
- API routes con validación Zod
- PostgreSQL con transacciones
- Supabase Auth para autenticación upstream

## Testing

### Ejecutar tests

```bash
# Todos los tests
npm test

# Tests de concurrencia (requiere PostgreSQL real)
npm run test:postgres

# Type checking
npm run typecheck

# Build de producción
npm run build
```

### Cobertura de tests

- **104 tests unitarios** pasando
- **5 tests de concurrencia** PostgreSQL (requieren servidor real)
- Tests de integración con PGlite
- Tests de verificación independiente
- Tests de ciclo de vida de cámara

### Datos sintéticos

Todos los tests usan:
- UUIDs sintéticos (no reales)
- Emails con dominio `@example.invalid`
- Contraseñas temporales
- Sin datos de producción

## Troubleshooting

### Error: "Authentication is temporarily unavailable"

**Causa**: Credenciales de Supabase inválidas o proyecto inaccesible.

**Solución**:
1. Verificar `SUPABASE_URL` y `SUPABASE_AUTH_KEY` en `.env.local`
2. Verificar que el proyecto Supabase esté activo
3. Verificar que las claves no hayan expirado

### Error: "database connection failed"

**Causa**: PostgreSQL no accesible o credenciales incorrectas.

**Solución**:
1. Verificar `DATABASE_URL` en `.env.local`
2. Verificar que PostgreSQL esté corriendo
3. Verificar que el rol `apa_app` exista y tenga permisos
4. Verificar conectividad de red

### Error: "Last active admin cannot be deactivated"

**Causa**: Intento de desactivar el único administrador activo.

**Solución**:
1. Crear otro administrador primero
2. O reactivar un administrador existente

### Tests fallando con "Cannot find module"

**Causa**: Dependencias no instaladas.

**Solución**:
```bash
npm install
npm test
```

### Build fallando con TypeScript errors

**Causa**: Errores de tipado.

**Solución**:
```bash
npm run typecheck
# Corregir errores reportados
npm run build
```

## Estructura del proyecto

```
apa-transit/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API routes
│   │   │   ├── admin/         # Administración
│   │   │   │   ├── locations/ # Gestión de ubicaciones
│   │   │   │   └── users/     # Gestión de usuarios
│   │   │   ├── auth/          # Autenticación
│   │   │   ├── movements/     # Movimientos
│   │   │   └── health/        # Health check
│   │   ├── page.tsx           # Página principal
│   │   ├── layout.tsx         # Layout global
│   │   ├── transit-app.tsx    # Aplicación principal
│   │   ├── location-manager.tsx # UI de ubicaciones
│   │   ├── user-manager.tsx   # UI de usuarios
│   │   └── scan-flow.tsx      # UI de escaneo QR
│   ├── server/                # Lógica de servidor
│   │   ├── sessions.ts        # Gestión de sesiones
│   │   ├── auth-provider.ts   # Integración con Supabase Auth
│   │   ├── db.ts              # Conexión PostgreSQL
│   │   ├── admin-users.ts     # Lógica de admin de usuarios
│   │   └── locations.ts       # Lógica de ubicaciones
│   └── lib/                   # Utilidades compartidas
│       ├── client-api.ts      # Cliente API para frontend
│       └── domain.ts          # Tipos y validaciones
├── tests/                     # Tests unitarios y de integración
├── docs/                      # Documentación
│   ├── PRD.md                # Product Requirements Document
│   ├── ARCHITECTURE.md       # Arquitectura del sistema
│   ├── DATABASE.md           # Diseño de base de datos
│   ├── SECURITY.md           # Seguridad y RF-007
│   ├── API.md                # Documentación de API
│   ├── TEST_PLAN.md          # Plan de pruebas
│   ├── DEPLOYMENT.md         # Proceso de despliegue
│   ├── DEPLOYMENT_GUIDE.md   # Guía paso a paso
│   ├── CONFIGURATION.md      # Este archivo
│   └── UI_UX.md              # Diseño de interfaz
├── supabase/
│   └── migrations/           # Migraciones SQL
├── odd/
│   └── tasks/
│       └── application-mvp.md # Tracking de tareas
├── package.json              # Dependencias y scripts
├── tsconfig.json             # Configuración TypeScript
└── README.md                 # Este archivo
```

## Recursos adicionales

- [Documentación de Next.js](https://nextjs.org/docs)
- [Documentación de Supabase](https://supabase.com/docs)
- [Documentación de PostgreSQL](https://www.postgresql.org/docs/)
- [Documentación de Vitest](https://vitest.dev/)

## Contacto y soporte

- **Repositorio**: https://github.com/elCorbacho/apa-transit
- **Rama principal**: `feat/application-mvp`
- **Última actualización**: 2026-11-26
