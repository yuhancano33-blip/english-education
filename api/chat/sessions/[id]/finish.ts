import { z } from 'zod'
import { requireApproved } from '../../../_lib/auth.js'
import { MAX_SESSION_SECONDS } from '../../../_lib/config.js'
import { HttpError, parse, route } from '../../../_lib/http.js'
import { supabaseAdmin } from '../../../_lib/supabase-admin.js'

const paramsSchema = z.object({ id: z.string().uuid() })

// Fase 2: solo duración y estado. audio_path/audio_mime (Fase 3) y el
// resumen (Fase 4) se añaden después (SPEC-005).
const bodySchema = z.object({
  duration_seconds: z.number().int().min(0).max(MAX_SESSION_SECONDS),
  status: z.enum(['completed', 'interrupted']),
})

/** POST /api/chat/sessions/:id/finish — cierra una sesión activa del usuario. */
export default route({
  POST: async (req, res) => {
    const user = await requireApproved(req)
    const { id } = parse(paramsSchema, req.query)
    const body = parse(bodySchema, req.body)
    const db = supabaseAdmin()

    const { data: updated, error } = await db
      .from('chat_sessions')
      .update({
        status: body.status,
        duration_seconds: body.duration_seconds,
        ended_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .select('id, status, duration_seconds')
      .maybeSingle()
    if (error) throw error

    if (!updated) {
      const { data: existing, error: lookupError } = await db
        .from('chat_sessions')
        .select('id')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (lookupError) throw lookupError
      if (!existing) throw new HttpError(404, 'not_found', 'La sesión no existe')
      throw new HttpError(409, 'already_finished', 'La sesión ya estaba cerrada')
    }

    res.status(200).json(updated)
  },
})
