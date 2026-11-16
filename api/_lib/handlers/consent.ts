import type { VercelRequest, VercelResponse } from '@vercel/node'
import { PROFILE_COLUMNS, requireApproved, type Profile } from '../auth.js'

import { supabaseAdmin } from '../supabase-admin.js'

/**
 * POST /api/me?action=consent — registra que el usuario acepta la grabación de sus
 * conversaciones (SPEC-006 §7). Idempotente: conserva la primera fecha.
 */
export async function acceptConsent(req: VercelRequest, res: VercelResponse) {
  const user = await requireApproved(req)
  if (user.recording_consent_at) return res.status(200).json(user)

  const { data, error } = await supabaseAdmin()
    .from('users_profile')
    .update({ recording_consent_at: new Date().toISOString() })
    .eq('id', user.id)
    .select(PROFILE_COLUMNS)
    .single<Profile>()
  if (error) throw error
  res.status(200).json(data)
}
