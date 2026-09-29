# Instrucciones para agentes de código

Este repositorio implementa el **Agente de Voz Bilingüe (Inglés/Español)**. Toda la especificación está en `docs/specs/`.

## Cómo trabajar

- Lee primero `docs/specs/SPEC-000_Indice_y_Vision.md`: contiene la visión, las decisiones tomadas y el plan por fases.
- Implementa **una fase a la vez**, según SPEC-000, sección 6. No adelantes trabajo de fases posteriores.
- Antes de escribir código, presenta un plan con los archivos que vas a crear o modificar.
- Si algo no está definido en los specs, **pregunta antes de inventar**. Las decisiones pendientes están en SPEC-000, sección 5.
- Si una decisión cambia algo de los specs, actualiza también el spec correspondiente y el historial de cambios de SPEC-000.

## Stack

- Frontend: Vue 3 + Vite + Pinia + Vue Router, desplegado en Vercel.
- Backend: Node.js en Vercel Functions (carpeta `api/`).
- Datos: Supabase (PostgreSQL, Auth, Realtime, Storage). Esquema, RLS y políticas de Storage siempre como migraciones con Supabase CLI.
- IA: Gemini Live API (`gemini-3.8-live`) con tokens efímeros, según SPEC-002.

## Reglas obligatorias

- **Nunca** pongas claves, tokens ni secretos en el código. Usa variables de entorno (lista en SPEC-007) y mantén `.env.example` actualizado sin valores.
- `GEMINI_API_KEY` y `SUPABASE_SERVICE_ROLE_KEY` solo se usan en el backend. Nunca en código del frontend ni en variables con prefijo `VITE_`.
- Verifica que los archivos `.env*` (excepto `.env.example`) estén en `.gitignore`.
- El rol y el estado del usuario se leen de `users_profile`, nunca de `user_metadata`.
- Toda tabla nueva lleva RLS activado.
- Valida los cuerpos de las peticiones con un esquema (Zod).

## Git

- Ramas en kebab-case con prefijo de tipo: `feature/...`, `fix/...`, `chore/...`, `docs/...`.
- Commits con formato Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).
- No hagas commits directos a `main`; trabaja en una rama y abre un Pull Request.
