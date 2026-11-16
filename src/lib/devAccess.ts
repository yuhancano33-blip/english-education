/**
 * Bypass TEMPORAL del control de acceso, solo para desarrollo local.
 *
 * Se activa únicamente si la app corre con el servidor de desarrollo de Vite
 * (`import.meta.env.DEV`) Y `VITE_DEV_SKIP_ACCESS_CHECK=true`. En cualquier
 * build (producción y previews de Vercel) `import.meta.env.DEV` es la
 * constante `false`, así que esto es siempre `false`.
 *
 * Solo afecta a la navegación del frontend: el backend, RLS y la base de datos
 * siguen aplicando el control de acceso real (SPEC-004).
 */
export const devSkipAccessCheck: boolean =
  import.meta.env.DEV && import.meta.env.VITE_DEV_SKIP_ACCESS_CHECK === 'true'
