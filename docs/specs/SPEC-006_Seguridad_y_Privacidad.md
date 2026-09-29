# SPEC-006 · Seguridad y Privacidad

**Proyecto:** Agente de Voz Bilingüe (Inglés/Español)  
**Documento:** SPEC-006 · **Versión:** 5.0 · **Fecha:** 28 de septiembre de 2026 · **Estado:** Borrador para revisión  
**Relacionados:** SPEC-002, SPEC-004, SPEC-005, SPEC-007

## 1. Autenticación y Autorización

- Todas las peticiones al backend requieren el JWT de Supabase, que se verifica en cada llamada (firma, expiración y usuario existente).
- El rol y el estado se leen de `users_profile`, nunca de `user_metadata`, que el propio usuario puede modificar.
- Nadie puede cambiar su propio `role` o `status` desde el cliente.

## 2. Gestión de Claves

| Secreto | Regla |
|---|---|
| `GEMINI_API_KEY` | Solo en variables de entorno del backend en Vercel. Nunca en el frontend, en el repositorio ni en chats. Si se filtra, se revoca en Google AI Studio y se crea otra |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo en el backend |
| Clave pública (anon) de Supabase | Puede estar en el frontend; la protección la da RLS |
| Tokens efímeros de Gemini | Un solo uso, expiran en 10 minutos y tienen la configuración bloqueada |

## 3. Control de Uso y Costos

- **Una sola sesión activa por usuario**, garantizada con un índice único en base de datos.
- **Límite diario de sesiones** por usuario (propuesta: 10), verificado al emitir el token.
- **Duración máxima de 7 minutos**, reforzada por la expiración del token y un proceso que marca como `interrupted` las sesiones activas de más de 10 minutos.
- **Límite de peticiones HTTP** por usuario en el resto de la API mediante un almacén compartido (por ejemplo, Upstash Redis), ya que un contador en memoria no funciona en serverless.
- **Tope de gasto** configurado en Google AI Studio (sección Gasto).

## 4. CORS y Validación de Entrada

- CORS limitado al dominio de producción y a los de preview de Vercel. CORS no protege frente a scripts externos; la protección real la dan el JWT y los límites de uso.
- Validación de todos los cuerpos JSON con un esquema (por ejemplo, Zod): longitud máxima de turnos, `duration_seconds` ≤ 420, `mode` válido.
- Las subidas de audio solo se aceptan en la ruta de la propia sesión, con tipo MIME `audio/webm` o `audio/mp4` y un tamaño máximo de 10 MB.

## 5. Row Level Security

- RLS activado en todas las tablas.
- Un usuario solo puede leer y modificar sus propias sesiones, mensajes y audios.
- Los usuarios `pending` y `rejected` no tienen permisos sobre tablas de chat ni sobre Storage.
- Solo los administradores pueden leer `access_requests` y la lista de perfiles.

## 6. Prompt Injection

- Las instrucciones de sistema se definen en el backend y quedan fijadas en el token efímero; el usuario no puede reemplazarlas.
- Las instrucciones indican al agente ignorar peticiones de cambiar su rol.
- El agente no tiene herramientas ni acceso a datos de otros usuarios, lo que limita el impacto de cualquier manipulación.

## 7. Privacidad

- **Consentimiento:** antes de la primera sesión, el usuario acepta que la conversación se graba y se guarda. Un aviso breve se muestra también al iniciar cada sesión.
- **Retención:** los audios se conservan 90 días (propuesta pendiente de confirmar) o hasta que el usuario borre la sesión; las transcripciones y resúmenes, hasta que el usuario los borre.
- **Borrado:** eliminar una sesión borra turnos, resumen y audio. Eliminar la cuenta borra todos sus datos.
- **Nivel gratuito de Gemini:** en ese nivel Google puede usar los datos enviados para mejorar sus productos. Por eso solo se usa en desarrollo con datos de prueba, y se pasa al nivel de pago antes de que usuarios reales usen la aplicación.
- **Logs:** no registran el contenido de las conversaciones.
