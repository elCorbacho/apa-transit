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

Descomprime el ZIP y copia la carpeta al repositorio para versionarla. Los diagramas editables están en `diagrams/`. Sus copias embebidas se pueden visualizar en GitHub.

La implementación comienza con la validación de Supabase Auth en un entorno aislado. La puesta en producción depende de demostrar el control exclusivo de credenciales por el administrador. Consulta el [despliegue](docs/DEPLOYMENT.md) para preparar Vercel, Supabase e instalación PWA. Este paquete contiene la especificación previa al desarrollo.
