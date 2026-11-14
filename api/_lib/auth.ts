import type { VercelRequest } from '@vercel/node'
import { RATE_LIMIT_PER_MINUTE } from './config.js'
import { HttpError, setRequestUser } from './http.js'
import { supabaseAdmin } from './supabase-admin.js'

export type UserRole = 'admin' | 'user'
export type UserStatus = 'pending' | 'approved' | 'rejected'

export interface Profile {
  id: string
  email: string
  display_name: string | null
  role: UserRole
  status: UserStatus
  recording_consent_at: string | null
}

export const PROFILE_COLUMNS = 'id, email, display_name, role, status, recording_consent_at'

/**
 * Verifica el JWT de Supabase y carga rol y estado desde users_profile,
 * nunca desde user_metadata (SPEC-006 §1).
 */
export async function requireUser(req: VercelRequest): Promise<Profile> {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
  if (!token) {
    throw new HttpError(401, 'unauthorized', 'Falta el token de acceso')
  }

  const db = supabaseAdmin()
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) {
    // Sin respuesta o 5xx de Supabase Auth = no se pudo verificar, no es un token malo
    const status = error?.status ?? 0
    const unreachable = !!error && (status === 0 || status >= 500 || error.name === 'AuthRetryableFetchError')
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'auth_verify_failed',
        status,
        name: error?.name,
        message: error?.message,
      }),
    )
    if (unreachable) {
      throw new HttpError(503, 'auth_unavailable', 'No se pudo verificar tu sesión. Inténtalo de nuevo en unos segundos.')
    }
    throw new HttpError(401, 'unauthorized', 'Tu sesión expiró. Vuelve a iniciar sesión.')
  }

  setRequestUser(req, data.user.id)

  // Perfil y límite de peticiones en paralelo (SPEC-006 §3)
  const [{ data: profile, error: profileError }] = await Promise.all([
    db.from('users_profile').select(PROFILE_COLUMNS).eq('id', data.user.id).maybeSingle<Profile>(),
    enforceRateLimit(data.user.id),
  ])
  if (profileError) throw profileError
  if (!profile) {
    throw new HttpError(403, 'profile_missing', 'El usuario no tiene perfil')
  }
  return profile
}

interface RateLimitResult {
  allowed: boolean
  current_count: number
  reset_at: string
}

/**
 * 429 si el usuario supera RATE_LIMIT_PER_MINUTE. Si el contador no está
 * disponible se deja pasar la petición (y se registra): un fallo del
 * limitador no debe tumbar la app.
 */
async function enforceRateLimit(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin()
    .rpc('check_rate_limit', { p_key: `user:${userId}`, p_limit: RATE_LIMIT_PER_MINUTE, p_window_seconds: 60 })
    .single<RateLimitResult>()
  if (error) {
    console.warn(JSON.stringify({ level: 'warn', event: 'rate_limit_unavailable', message: error.message }))
    return
  }
  if (!data.allowed) {
    const retryAfter = Math.max(1, Math.ceil((Date.parse(data.reset_at) - Date.now()) / 1000))
    throw new HttpError(
      429,
      'rate_limited',
      'Demasiadas peticiones. Espera un momento y vuelve a intentarlo.',
      { resetsAt: data.reset_at },
      { 'Retry-After': String(retryAfter) },
    )
  }
}

/** Solo usuarios aprobados (SPEC-004 §3). */
export async function requireApproved(req: VercelRequest): Promise<Profile> {
  const profile = await requireUser(req)
  if (profile.status !== 'approved') {
    throw new HttpError(403, 'not_approved', 'Tu cuenta aún no está aprobada')
  }
  return profile
}

export async function requireAdmin(req: VercelRequest): Promise<Profile> {
  const profile = await requireUser(req)
  if (profile.role !== 'admin') {
    throw new HttpError(403, 'forbidden', 'Solo para administradores')
  }
  return profile
}
