# APA Transit

PWA para documentar el paso de tecnólogos médicos por ubicaciones del servicio de Anatomía Patológica durante el traslado de carros de láminas histológicas. Cada lectura válida genera un movimiento con la cuenta autenticada, la ubicación y la hora del servidor.

## Documentación

| Archivo | Contenido |
|---|---|
| [PRD](docs/PRD.md) | Alcance y requisitos |
| [Arquitectura](docs/ARCHITECTURE.md) | Componentes y flujos Mermaid |
| [Base de datos](docs/DATABASE.md) | Entidades y transacciones |
| [Seguridad](docs/SECURITY.md) | Sesiones, permisos y condición de liberación |
| [UI y UX](docs/UI_UX.md) | Pantallas y estados |
| [API](docs/API.md) | Contratos HTTP |
| [Plan de pruebas](docs/TEST_PLAN.md) | Casos de aceptación |
| [Despliegue](docs/DEPLOYMENT.md) | Preparación, piloto y respaldo |
| [Tareas](TASKS.md) | Secuencia y dependencias |
| [Guía para agentes](AGENTS.md) | Reglas de implementación |

## Desarrollo local

Requiere Node.js 22.12 o superior; el desarrollo actual utiliza Node.js 24.

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm run build
npm run dev
```

La pantalla inicial informa que el sistema está en construcción. La ausencia de
variables privadas no impide compilar: los endpoints protegidos rechazan el acceso
con 503 hasta que exista una configuración válida. `/api/health` permanece en 503
porque la aplicación completa aún no está habilitada.

Con configuración válida, la pantalla principal carga la sesión desde `/api/me`
y ofrece login, historial compartido y cierre. El escáner y la administración
todavía no están disponibles; no se debe usar esta interfaz para registros reales.

Para preparar una conexión real, copie `.env.example` a `.env.local` y complete
los valores únicamente en el entorno privado. No publique ese archivo ni envíe
sus valores por chat. La conexión PostgreSQL requiere un usuario de ejecución
restringido, distinto del propietario de migraciones. No use la contraseña
administrativa como credencial de ejecución.

## Estado de implementación

- Base Next.js, configuración protegida y pruebas locales.
- Backend inicial de login, logout y consulta de perfil/último movimiento propio.
- Esquema SQL inicial **en borrador**, probado con PostgreSQL embebido; no aplicado
  todavía al proyecto Supabase.
- Pendientes: interfaz de login, administración, escáner, registro e historial,
  instalación PWA completa y aceptación contra infraestructura real.

Las pruebas de autenticación usan exclusivamente identidades sintéticas y un
proveedor Auth simulado. No demuestran el perímetro de Supabase ni el aislamiento
entre conexiones PostgreSQL reales. Los diagramas editables están en `diagrams/`.

La puesta en producción depende de demostrar el control exclusivo de credenciales
por el administrador. Mantenga `RF007_VERIFIED=false` hasta obtener la evidencia
de S01–S04; el indicador de configuración no sustituye esas pruebas. Consulte
[despliegue](docs/DEPLOYMENT.md) y el [seguimiento](odd/tasks/application-mvp.md).

## Licencia

El código de la aplicación se distribuye bajo [PolyForm Noncommercial 1.0.0](LICENSE).
Se permite el uso personal, educativo, de investigación y benéfico; **el uso
comercial requiere una licencia comercial separada del titular**. Esta licencia no
es de código abierto y no autoriza su venta, reventa ni incorporación en un producto
o servicio comercial sin ese acuerdo.

Alcance:

- Cubre el código fuente de la aplicación en este repositorio.
- Los documentos de `docs/`, `TASKS.md` y `AGENTS.md` provienen de la especificación
  del proyecto y conservan su autoría original; esta licencia no los relicencia.
- Las dependencias de terceros mantienen sus propias licencias (Next.js, React y el
  resto del ecosistema bajo MIT). Las skills de `.opencode/skills` son Apache-2.0 y
  no se distribuyen en este repositorio: sólo se versiona su procedencia.
- El historial de movimientos que la aplicación almacene pertenece a la institución
  que la opere, no al titular del código.
