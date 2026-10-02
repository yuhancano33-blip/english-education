# english-education

Agente de voz bilingüe (inglés/español) para uso personal y compartido. La especificación completa está en [`docs/specs/`](docs/specs/SPEC-000_Indice_y_Vision.md) y las reglas para agentes de código en [`AGENTS.md`](AGENTS.md).

## Requisitos

- Node.js 20 o superior
- Un proyecto de Supabase **de desarrollo** en la nube (no se usa Docker ni Supabase local, SPEC-007)
- [Supabase CLI](https://supabase.com/docs/guides/cli), usado con `npx supabase`
- [Vercel CLI](https://vercel.com/docs/cli) para ejecutar frontend y funciones `api/` juntos

## Puesta en marcha local

1. Instala las dependencias: `npm install`.
2. Vincula el proyecto de desarrollo (una sola vez):
   - `npx supabase login` (abre el navegador)
   - `npx supabase link --project-ref <ref-del-proyecto-dev>` (pide la contraseña de la base de datos)
3. Aplica las migraciones de `supabase/migrations/`: `npm run db:push`.
4. Copia `.env.example` a `.env.local` y rellénalo con la URL y las claves de *Project Settings → API* del proyecto de desarrollo.
5. Arranca la app: `npm run dev:full` (Vercel dev: frontend + API). Solo frontend: `npm run dev`.

En el dashboard del proyecto (*Authentication → URL Configuration*) añade `http://localhost:5173` y `http://localhost:3000` como URLs de redirección.

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
| `npm run dev` | Frontend con Vite |
| `npm run dev:full` | Frontend + funciones `api/` con Vercel |
| `npm run build` | Comprobación de tipos y build de producción |
| `npm run typecheck` | Tipos del frontend y de la API |
| `npm run db:push` | Aplica las migraciones pendientes al proyecto vinculado |
| `npm run db:status` | Muestra qué migraciones están aplicadas en local y en remoto |
