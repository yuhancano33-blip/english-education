# english-education

Agente de voz bilingüe (inglés/español) para uso personal y compartido. La especificación completa está en [`docs/specs/`](docs/specs/SPEC-000_Indice_y_Vision.md) y las reglas para agentes de código en [`AGENTS.md`](AGENTS.md).

## Requisitos

- Node.js 20 o superior
- [Supabase CLI](https://supabase.com/docs/guides/cli) (se puede usar con `npx supabase`) y Docker para la base de datos local
- [Vercel CLI](https://vercel.com/docs/cli) para ejecutar frontend y funciones `api/` juntos

## Puesta en marcha local

1. Instala las dependencias: `npm install`.
2. Levanta Supabase local: `npx supabase start`. Aplica las migraciones de `supabase/migrations/`.
3. Copia `.env.example` a `.env.local` y rellénalo con los valores que imprime `npx supabase status`.
4. Arranca la app: `npm run dev:full` (Vercel dev: frontend + API). Solo frontend: `npm run dev`.

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
| `npm run db:reset` | Recrea la base local aplicando las migraciones |
