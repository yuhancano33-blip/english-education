import type { VercelRequest } from '@vercel/node'
import { HttpError } from './http.js'
import { supabaseAdmin } from './supabase-admin.js'

export type UserRole = 'admin' | 'user'
export type UserStatus = 'pending' | 'approved' | 'rejected'

export interface Profile {
  id: string
  email: string
  display_name: string | null
  role: UserRole
  status: UserStatus
}

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
    throw new HttpError(401, 'unauthorized', 'Token inválido o expirado')
  }

  const { data: profile, error: profileError } = await db
    .from('users_profile')
    .select('id, email, display_name, role, status')
    .eq('id', data.user.id)
    .maybeSingle<Profile>()
  if (profileError) throw profileError
  if (!profile) {
    throw new HttpError(403, 'profile_missing', 'El usuario no tiene perfil')
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
