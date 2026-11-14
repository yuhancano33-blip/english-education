# Puesta en producción

Pasos para tener la app con usuarios reales (Fase 5, SPEC-006 y SPEC-007). Son configuraciones de cuentas externas: no se pueden hacer desde el código.

## 1. Gemini: facturación y tope de gasto

El nivel gratuito de Gemini permite a Google usar los datos para mejorar sus productos, así que **no se usa con usuarios reales** (SPEC-006 §7).

1. En [Google AI Studio](https://aistudio.google.com) → **Facturación**, pulsa *Configurar la facturación* y vincula una cuenta de pago.
2. Crea una API key nueva para producción (no reutilices la de desarrollo).
3. En la sección **Gasto**, define un tope mensual. Referencia: máximo US$0,16 por sesión de 7 min; con 10 sesiones diarias, un usuario muy activo cuesta como máximo US$1,60 al día.
4. Revisa los límites de frecuencia del modelo `gemini-3.8-live` en tu nivel.

## 2. Supabase: proyecto de producción

SPEC-007 separa desarrollo y producción.

1. Crea un proyecto nuevo en [supabase.com](https://supabase.com/dashboard) (región cercana a Colombia, p. ej. `us-east-1`).
2. En **SQL Editor**, ejecuta **en orden** todas las migraciones de `supabase/migrations/`:
   1. `20260928000000_access_control.sql`
   2. `20261001000000_chat_sessions.sql`
   3. `20261112000000_history_and_audio.sql`
   4. `20261113000000_rate_limits.sql`
3. **Authentication → URL Configuration**: *Site URL* = tu dominio de producción; añade también las URLs de preview si las usas.
4. **Authentication → Providers → Email**: deja activada la confirmación de email.
5. Regístrate en la app de producción y conviértete en admin con `supabase/scripts/promote_admin.sql`. Repite para el segundo admin.
6. El plan gratuito de Supabase **pausa el proyecto tras una semana sin uso**. Para usuarios reales, valora el plan Pro o entra con regularidad.

## 3. Vercel: variables de entorno

En el proyecto de Vercel → **Settings → Environment Variables**, entorno **Production**:

| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto de producción, sin `/rest/v1/` |
| `VITE_SUPABASE_ANON_KEY` | Clave publishable de producción |
| `SUPABASE_URL` | La misma URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave secret de producción |
| `GEMINI_API_KEY` | Key de pago del paso 1 |
| `GEMINI_LIVE_MODEL` | `gemini-3.8-live` |
| `GEMINI_TEXT_MODEL` | `gemini-3.5-flash` |
| `GEMINI_VOICE` | Opcional: la voz elegida |
| `MAX_SESSION_SECONDS` | `420` |
| `DAILY_SESSION_LIMIT` | `10` |
| `RATE_LIMIT_PER_MINUTE` | `60` |
| `AUDIO_RETENTION_DAYS` | `90` |
| `CRON_SECRET` | Texto aleatorio largo (p. ej. 40 caracteres); Vercel lo usa para llamar al cron |
| `ALLOWED_ORIGINS` | Normalmente vacío: el propio dominio ya está permitido |
| `APP_URL` | `https://tu-dominio` |

Para **Preview** usa los valores del proyecto de desarrollo y la key gratuita de Gemini.

`VITE_DEV_SKIP_ACCESS_CHECK` **no** se define en Vercel (solo funciona en local, y en Vercel se ignora siempre).

Después de cambiar variables, vuelve a desplegar (*Deployments → Redeploy*).

## 4. Email a los administradores (opcional)

1. Crea una cuenta en [Resend](https://resend.com), verifica tu dominio y crea una API key.
2. En Vercel añade `RESEND_API_KEY`, `EMAIL_FROM` (p. ej. `avisos@tu-dominio`) y `ACCESS_WEBHOOK_SECRET` (texto aleatorio largo).
3. En el SQL Editor de producción ejecuta `supabase/scripts/configure_access_webhook.sql` con la URL `https://tu-dominio/api/webhooks/access-request-created` y el mismo secreto.

Sin esto, los admins solo reciben la notificación dentro de la app.

## 5. Comprobaciones tras desplegar

- [ ] Registro de un usuario nuevo → queda en la sala de espera; un admin lo aprueba y entra solo.
- [ ] Una conversación completa en cada modo → aparece en el historial con audio, transcripción y resumen.
- [ ] *Settings → Cron Jobs* en Vercel muestra `/api/cron/retention` (diario, 08:00 UTC).
- [ ] *Logs* de Vercel: cada petición deja una línea JSON con `requestId`, `path`, `status` y `durationMs`, sin contenido de conversaciones.
- [ ] Revisión semanal de **Uso** y **Gasto** en Google AI Studio (SPEC-007 §4).
