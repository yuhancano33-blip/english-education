# english-education

Agente de voz bilingüe (inglés/español) para uso personal y compartido. La especificación completa está en [`docs/specs/`](docs/specs/SPEC-000_Indice_y_Vision.md) y las reglas para agentes de código en [`AGENTS.md`](AGENTS.md).

## Requisitos

- Node.js 20 o superior
- Un proyecto de Supabase **de desarrollo** en la nube (no se usa Docker ni Supabase local, SPEC-007)
- [Supabase CLI](https://supabase.com/docs/guides/cli), usado con `npx supabase`
- [Vercel CLI](https://vercel.com/docs/cli), usada con `npx vercel`, para ejecutar frontend y funciones `api/` juntos

## Puesta en marcha local

1. Instala las dependencias: `npm install`.
2. Vincula el proyecto de desarrollo de Supabase (una sola vez):
   - `npx supabase login` (abre el navegador)
   - `npx supabase link --project-ref <ref-del-proyecto-dev>` (pide la contraseña de la base de datos)
3. Aplica las migraciones de `supabase/migrations/`: `npm run db:push`.
4. Copia `.env.example` a `.env` y rellénalo con la URL (sin `/rest/v1/`) y las claves de *Project Settings → API* del proyecto de desarrollo, más `GEMINI_API_KEY`.
5. Vincula la CLI de Vercel con el proyecto (una sola vez):
   - `npx vercel login`
   - `npx vercel link` (elige la cuenta `yuhancano33-blip` y el proyecto `english-education`)
6. Arranca la app con **`npm run dev:full`** y abre **http://localhost:3000**.

En el dashboard de Supabase (*Authentication → URL Configuration*) añade `http://localhost:3000` y `http://localhost:5173` como URLs de redirección.

### `npm run dev` vs `npm run dev:full`

Las rutas `/api/*` son Vercel Functions: **solo existen con `vercel dev`** (`npm run dev:full`) o desplegadas en Vercel.

`npm run dev` levanta únicamente el frontend con Vite. Ahí `/api/me` no funciona (Vite devuelve el código fuente del archivo en lugar de ejecutarlo), así que la app muestra *"La API (/api) no está disponible"* y no puede saber si tu cuenta está aprobada. Úsalo solo para trabajar en estilos o componentes.

### Bypass del control de acceso (solo desarrollo)

Con `VITE_DEV_SKIP_ACCESS_CHECK=true` en `.env`, el **frontend** deja de enviarte a la sala de espera y te trata como aprobado. Se muestra una franja amarilla *"Modo desarrollo: control de acceso desactivado"*.

- Solo funciona con el servidor de desarrollo (`import.meta.env.DEV`); en producción y en previews de Vercel se ignora siempre.
- No toca el backend, RLS ni la base de datos: las llamadas a `/api` siguen exigiendo una cuenta aprobada.
- Déjala vacía salvo que la necesites.

## Administradores (SPEC-004)

1. Regístrate normalmente en la app (la cuenta queda `pending`).
2. Con permisos de servidor (SQL Editor o `psql` como `postgres`), ejecuta [`supabase/scripts/promote_admin.sql`](supabase/scripts/promote_admin.sql) con tu email.

## Email a administradores (SPEC-004)

1. Define `RESEND_API_KEY`, `EMAIL_FROM`, `ACCESS_WEBHOOK_SECRET` y `APP_URL` en el backend.
2. Guarda en Supabase Vault la URL del webhook y el mismo secreto con [`supabase/scripts/configure_access_webhook.sql`](supabase/scripts/configure_access_webhook.sql).

Si no se configuran, el registro funciona igual y los admins solo reciben la notificación in-app.

## Scripts

| Comando | Uso |
|---|---|
| `npm run dev:full` | **Desarrollo normal**: frontend + funciones `api/` con `vercel dev` (http://localhost:3000) |
| `npm run dev` | Solo frontend con Vite, sin API (http://localhost:5173) |
| `npm run build` | Comprobación de tipos y build de producción |
| `npm run typecheck` | Tipos del frontend y de la API |
| `npm run db:push` | Aplica las migraciones pendientes al proyecto vinculado |
| `npm run db:status` | Muestra qué migraciones están aplicadas en local y en remoto |
