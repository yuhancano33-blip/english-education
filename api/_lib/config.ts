function intEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/** Límites de sesión (SPEC-002 §4, SPEC-006 §3, SPEC-007 §2). */
export const MAX_SESSION_SECONDS = Math.min(intEnv('MAX_SESSION_SECONDS', 420), 420)
export const DAILY_SESSION_LIMIT = intEnv('DAILY_SESSION_LIMIT', 10)
export const SESSION_TIMEZONE = 'America/Bogota'
/** Pasado este tiempo una sesión activa se considera abandonada. */
export const STALE_SESSION_SECONDS = 600
