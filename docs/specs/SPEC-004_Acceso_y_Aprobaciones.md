# SPEC-004 · Control de Acceso y Aprobaciones

**Proyecto:** Agente de Voz Bilingüe (Inglés/Español)  
**Documento:** SPEC-004 · **Versión:** 5.0 · **Fecha:** 28 de septiembre de 2026 · **Estado:** Borrador para revisión  
**Relacionados:** SPEC-003, SPEC-005, SPEC-006

El sistema está cerrado por defecto. Solo 2 usuarios administradores tienen acceso garantizado inicial. Sus cuentas se marcan como administradores con una migración o script SQL ejecutado con permisos de servidor, nunca desde el cliente.

## 1. Estados del Usuario

| Estado | Significado |
|---|---|
| `pending` | Se registró pero aún no ha sido aprobado. Solo ve la sala de espera. |
| `approved` | Acceso completo a la interfaz de voz y a su historial. |
| `rejected` | Solicitud rechazada. Ve un mensaje informativo y no tiene acceso. |

El rol (`admin` o `user`) es independiente del estado. Los administradores tienen siempre estado `approved`.

## 2. Flujo de Aprobación

- **Registro:** al registrarse, un trigger de base de datos crea el perfil con estado `pending` y una fila en `access_requests`.
- **Sala de espera:** el invitado ve que su solicitud está en revisión. La pantalla escucha cambios en su perfil vía Realtime y lo redirige automáticamente al ser aprobado.
- **Notificación in-app:** los administradores reciben la notificación vía Supabase Realtime mientras tengan la app abierta.
- **Notificación por email:** como Realtime solo funciona con la app abierta, un Database Webhook de Supabase envía además un email a ambos administradores.
- **Resolución:** cualquiera de los 2 administradores aprueba o rechaza. La actualización solo se aplica si la solicitud sigue en `pending`; si ambos actúan a la vez, prevalece la primera decisión y el segundo recibe un aviso.
- **Auditoría:** se registra qué administrador resolvió cada solicitud y cuándo.
- **Rechazados:** según la propuesta de SPEC-000, pueden volver a solicitar acceso tras 7 días.

## 3. Reglas de Acceso por Estado

| Recurso | pending | rejected | approved |
|---|---|---|---|
| Sala de espera | Sí | Sí (mensaje de rechazo) | No aplica |
| Interfaz de voz y tokens | No | No | Sí |
| Historial propio | No | No | Sí |
| Panel de administración | No | No | Solo rol admin |
