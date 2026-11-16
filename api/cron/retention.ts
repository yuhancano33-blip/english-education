import { AUDIO_RETENTION_DAYS } from '../_lib/config.js'
import { HttpError, route } from '../_lib/http.js'
import { secretMatches } from '../_lib/secrets.js'
import { AUDIO_BUCKET } from '../_lib/sessions.js'
import { supabaseAdmin } from '../_lib/supabase-admin.js'

const BATCH = 100
/** Tope por ejecución para no agotar el tiempo de la función */
const MAX_BATCHES = 20

/**
 * GET /api/cron/retention — Vercel Cron diario (SPEC-006 §7):
 * - borra el audio de las sesiones con más de AUDIO_RETENTION_DAYS días
 *   (se conservan transcripción y resumen)
 * - limpia contadores viejos de rate_limits
 * Vercel envía `Authorization: Bearer <CRON_SECRET>`.
 */
export default route({
  GET: async (req, res) => {
    const header = req.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined
    if (!secretMatches(token, process.env.CRON_SECRET)) {
      throw new HttpError(401, 'unauthorized', 'No autorizado')
    }

    const db = supabaseAdmin()
    const cutoff = new Date(Date.now() - AUDIO_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    let audiosDeleted = 0

    for (let i = 0; i < MAX_BATCHES; i++) {
      const { data: sessions, error } = await db
        .from('chat_sessions')
        .select('id, audio_path')
        .not('audio_path', 'is', null)
        .lt('started_at', cutoff)
        .limit(BATCH)
      if (error) throw error
      if (!sessions?.length) break

      const paths = sessions.map((s) => s.audio_path as string)
      const { error: removeError } = await db.storage.from(AUDIO_BUCKET).remove(paths)
      if (removeError) throw removeError

      const { error: updateError } = await db
        .from('chat_sessions')
        .update({ audio_path: null, audio_mime: null })
        .in('id', sessions.map((s) => s.id))
      if (updateError) throw updateError

      audiosDeleted += sessions.length
      if (sessions.length < BATCH) break
    }

    const { error: limitsError, count: rateLimitsDeleted } = await db
      .from('rate_limits')
      .delete({ count: 'exact' })
      .lt('window_start', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    if (limitsError) throw limitsError

    res.status(200).json({ audiosDeleted, rateLimitsDeleted: rateLimitsDeleted ?? 0, retentionDays: AUDIO_RETENTION_DAYS })
  },
})
