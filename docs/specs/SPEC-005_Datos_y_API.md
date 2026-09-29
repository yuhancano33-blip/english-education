# SPEC-005 · Modelo de Datos y API

**Proyecto:** Agente de Voz Bilingüe (Inglés/Español)  
**Documento:** SPEC-005 · **Versión:** 5.0 · **Fecha:** 28 de septiembre de 2026 · **Estado:** Borrador para revisión  
**Relacionados:** SPEC-001, SPEC-002, SPEC-004, SPEC-006

## 1. Modelo de Datos

#### users_profile

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | FK a `auth.users.id`, ON DELETE CASCADE |
| email | text | Copiado de Auth para el panel de admins |
| display_name | text | Opcional |
| role | enum (admin, user) | Default `user`; solo modificable con permisos de servidor |
| status | enum (pending, approved, rejected) | Default `pending` |
| created_at / updated_at | timestamptz | Default `now()` |

#### access_requests

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK |  |
| user_id | uuid FK | FK a `users_profile.id` |
| status | enum (pending, approved, rejected) | Índice único parcial: una sola solicitud `pending` por usuario |
| resolved_by | uuid FK, nullable | Administrador que resolvió |
| created_at / resolved_at | timestamptz |  |

#### chat_sessions

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK |  |
| user_id | uuid FK | Índice en (user_id, created_at DESC) |
| title | text | Generado a partir del resumen; editable |
| mode | enum (free, tutor) | Modo elegido al iniciar |
| status | enum (active, completed, interrupted) | Solo una sesión `active` por usuario (índice único parcial) |
| started_at / ended_at | timestamptz |  |
| duration_seconds | int | Máximo 420 |
| audio_path | text, nullable | Ruta en el bucket `session-audio` |
| audio_mime | text, nullable | `audio/webm` o `audio/mp4` |
| summary | jsonb, nullable | Estructura definida en SPEC-002, sección 7 |
| created_at / updated_at | timestamptz |  |

#### messages

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK |  |
| session_id | uuid FK | ON DELETE CASCADE; índice en (session_id, turn_index) |
| turn_index | int | Orden del turno en la sesión |
| sender | enum (user, assistant) |  |
| content | text | Transcripción entregada por Gemini |
| created_at | timestamptz |  |

#### Storage

- Bucket privado `session-audio`, ruta `{user_id}/{session_id}.{ext}`.
- Políticas de Storage: cada usuario solo puede leer archivos de su propia carpeta; las subidas y descargas se hacen con URLs firmadas de corta duración emitidas por el backend.
- Al eliminar una sesión, el backend borra también su archivo de audio.

## 2. API REST

Todas las rutas requieren `Authorization: Bearer <JWT de Supabase>`, salvo los webhooks internos, que se autentican con un secreto compartido. Los errores usan el formato `{ "error": { "code": "...", "message": "..." } }` con el código HTTP correspondiente (400, 401, 403, 404, 409, 429, 500).

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/api/me` | Autenticado | Perfil, rol y estado; decide qué pantalla mostrar |
| POST | `/api/voice/sessions` | approved | Body `{ mode }`. Valida límites, crea la sesión y devuelve `sessionId`, token efímero, `expiresAt` y `maxDurationSec` |
| POST | `/api/chat/sessions/:id/messages` | Dueño | Body `{ turns: [{ turn_index, sender, content }] }`. Guarda turnos de la transcripción |
| POST | `/api/chat/sessions/:id/audio-upload-url` | Dueño | Devuelve una URL firmada para subir el audio a Storage |
| POST | `/api/chat/sessions/:id/finish` | Dueño | Body `{ duration_seconds, audio_path, audio_mime, status }`. Cierra la sesión y genera el resumen |
| POST | `/api/chat/sessions/:id/summary` | Dueño | Vuelve a generar el resumen si falló |
| GET | `/api/chat/sessions` | approved | Lista paginada de sesiones para el sidebar |
| GET | `/api/chat/sessions/:id` | Dueño | Detalle: datos de la sesión, turnos y resumen |
| GET | `/api/chat/sessions/:id/audio` | Dueño | URL firmada de descarga del audio (válida pocos minutos) |
| PATCH | `/api/chat/sessions/:id` | Dueño | Renombrar |
| DELETE | `/api/chat/sessions/:id` | Dueño | Elimina sesión, turnos y audio |
| GET | `/api/admin/access-requests` | admin | Lista de solicitudes, filtrable por estado |
| POST | `/api/admin/access-requests/:id/resolve` | admin | Body `{ decision: "approve" \| "reject" }` |
| POST | `/api/webhooks/access-request-created` | Secreto compartido (cabecera `x-webhook-secret`), no JWT | Llamado por la base de datos al crearse una solicitud; envía el email a los admins (SPEC-004) |

#### Respuestas relevantes de POST /api/voice/sessions

| Código | Caso |
|---|---|
| 201 | Sesión creada con su token |
| 403 | Usuario no aprobado |
| 409 | Ya existe una sesión activa |
| 429 | Límite diario de sesiones alcanzado |
| 502 | Gemini no pudo emitir el token |
