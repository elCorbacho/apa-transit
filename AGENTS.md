# Instrucciones para agentes

- Lee el [PRD](docs/PRD.md) antes de cambiar comportamiento y usa [TASKS.md](TASKS.md) para elegir una tarea y sus dependencias. Si una propuesta técnica cambia un requisito, conserva el requisito y registra la decisión pendiente.
- Mantén Auth, tokens y acceso a datos en módulos de servidor. Valida sesión, cuenta activa y rol en cada operación protegida. Implementa y verifica la condición de salida de [seguridad](docs/SECURITY.md) antes de habilitar producción.
- Deriva identidad, ubicación y tiempo en el servidor. Usa una transacción e idempotencia por lectura. Conserva snapshots y mantén los movimientos inmutables desde la aplicación.
- Mantén el historial compartido con orden descendente y paginación. Excluye filtros, datos clínicos, recuperación de contraseña, registro offline y alta autónoma.
- Usa datos sintéticos para pruebas. Evita credenciales, cookies, tokens y nombres reales en ejemplos, trazas y fixtures.
- Cuando cambies un contrato, sincroniza su [API](docs/API.md), pruebas y diagramas afectados. Adjunta los casos ejecutados al cierre de la tarea.
