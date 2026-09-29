-- Marca una cuenta como administradora (SPEC-004).
-- Ejecutar SOLO con permisos de servidor: SQL Editor del dashboard de Supabase
-- o `psql` con el rol postgres. Nunca desde el cliente.
--
-- 1. La persona se registra normalmente en la app (queda en estado pending).
-- 2. Reemplaza el email y ejecuta:

select public.promote_to_admin('admin@ejemplo.com');
