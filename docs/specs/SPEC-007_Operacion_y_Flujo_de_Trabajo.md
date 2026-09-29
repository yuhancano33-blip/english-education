# SPEC-007 · Operación, Entornos y Flujo de Trabajo

**Proyecto:** Agente de Voz Bilingüe (Inglés/Español)  
**Documento:** SPEC-007 · **Versión:** 5.0 · **Fecha:** 28 de septiembre de 2026 · **Estado:** Borrador para revisión  
**Relacionados:** SPEC-001, SPEC-006

## 1. Entornos

| Entorno | Supabase | Gemini |
|---|---|---|
| Local | Proyecto de desarrollo (o Supabase local con CLI) | Clave del proyecto `english` en nivel gratuito |
| Preview (cada PR) | Proyecto de desarrollo | Clave de nivel gratuito |
| Producción | Proyecto de producción separado | Clave con facturación activada y tope de gasto |

## 2. Variables de Entorno

| Variable | Dónde | Uso |
|---|---|---|
| `VITE_SUPABASE_URL` | Frontend | URL del proyecto de Supabase |
| `VITE_SUPABASE_ANON_KEY` | Frontend | Clave pública de Supabase |
| `SUPABASE_URL` | Backend | URL del proyecto de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend | Operaciones privilegiadas |
| `GEMINI_API_KEY` | Backend | Clave de Google AI Studio |
| `GEMINI_LIVE_MODEL` | Backend | `gemini-3.8-live` |
| `GEMINI_TEXT_MODEL` | Backend | Modelo del resumen, p. ej. `gemini-3.5-flash` |
| `GEMINI_VOICE` | Backend | Voz elegida para el agente |
| `MAX_SESSION_SECONDS` | Backend | 420 |
| `DAILY_SESSION_LIMIT` | Backend | 10 |
| `ALLOWED_ORIGINS` | Backend | Dominios aceptados por CORS |
| `RATE_LIMIT_URL`, `RATE_LIMIT_TOKEN` | Backend | Almacén compartido para límites de peticiones |
| `RESEND_API_KEY` | Backend | Envío de emails a los administradores |
| `EMAIL_FROM` | Backend | Remitente de los emails (dominio verificado en Resend) |
| `ACCESS_WEBHOOK_SECRET` | Backend | Secreto compartido con el trigger de la base de datos (debe coincidir con el guardado en Supabase Vault) |
| `APP_URL` | Backend | URL pública de la app, para los enlaces de los emails |

El repositorio incluye un `.env.example` con los nombres de las variables, sin valores.

## 3. Facturación de Gemini

- La suscripción de la app de Gemini (Google AI Pro) no cubre el uso de la API; la API se factura aparte en Google AI Studio.
- **Desarrollo:** proyecto `english` en nivel gratuito, solo con datos de prueba.
- **Antes de producción (Fase 5):** activar la facturación con "Configurar la facturación", definir un tope de gasto y revisar los límites de frecuencia.
- **Estimación:** máximo US$0,16 por sesión de 7 minutos; con el límite de 10 sesiones diarias, un usuario muy activo costaría como máximo US$1,60 al día.

## 4. Monitoreo

- Logs estructurados en Vercel con id de petición, usuario, endpoint, duración y errores, sin contenido de conversaciones.
- Métricas clave: tokens emitidos, sesiones completadas vs. interrumpidas, duración media, fallos de subida de audio y de resumen.
- Revisión semanal del uso y el gasto en las secciones Uso y Gasto de Google AI Studio.
- Opcional: Sentry para errores de frontend y backend.

## 5. Flujo de Trabajo y Git

- **Ramas:** kebab-case con prefijo de tipo: `feature/gemini-live-audio`, `fix/auth-flow`, `chore/update-deps`, `docs/spec-002`.
- **Una rama por spec:** todo el trabajo de un spec va en su rama; el responsable del proyecto abre el Pull Request cuando el spec está terminado (los agentes no abren PRs).
- **Rama principal:** `main` protegida y siempre desplegable; cambios solo mediante Pull Request con al menos una revisión.
- **Commits:** formato Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).
- **Despliegues:** cada PR genera un Preview Deployment en Vercel; el merge a `main` despliega a producción.
- **Base de datos:** esquema, políticas RLS y de Storage versionados como migraciones con Supabase CLI.
- **Tareas:** GitHub Issues/Projects, con cada issue enlazado a su fase (SPEC-000) y a su spec.
- **Specs:** se guardan en el repositorio (carpeta `docs/specs/`) y cualquier cambio de decisión se refleja en el spec correspondiente y en el historial de SPEC-000.
