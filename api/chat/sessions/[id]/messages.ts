import { z } from 'zod'
import { requireApproved } from '../../../_lib/auth.js'
import { HttpError, parse, route } from '../../../_lib/http.js'
import { getOwnedSession, sessionIdFrom } from '../../../_lib/sessions.js'
import { supabaseAdmin } from '../../../_lib/supabase-admin.js'

const bodySchema = z.object({
  turns: z
    .array(
      z.object({
        turn_index: z.number().int().min(0).max(2000),
        sender: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(5000),
      }),
    )
    .min(1)
    .max(50),
})

/** Margen tras el cierre para recibir los últimos turnos. */
const LATE_TURNS_MS = 2 * 60_000

/**
 * POST /api/chat/sessions/:id/messages — guarda turnos de la transcripción
 * (SPEC-005). Reenviar un turno lo actualiza en lugar de duplicarlo.
 */
export default route({
  POST: async (req, res) => {
    const user = await requireApproved(req)
    const session = await getOwnedSession(sessionIdFrom(req.query), user.id)
    const { turns } = parse(bodySchema, req.body)

    const closedLongAgo =
      session.status !== 'active' &&
      (!session.ended_at || Date.now() - Date.parse(session.ended_at) > LATE_TURNS_MS)
    if (closedLongAgo) {
      throw new HttpError(409, 'session_closed', 'La sesión ya está cerrada')
    }

    const { error } = await supabaseAdmin()
      .from('messages')
      .upsert(
        turns.map((t) => ({ session_id: session.id, ...t })),
        { onConflict: 'session_id,turn_index' },
      )
    if (error) throw error
    res.status(200).json({ saved: turns.length })
  },
})
