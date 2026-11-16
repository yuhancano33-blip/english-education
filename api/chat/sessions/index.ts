import { z } from 'zod'
import { requireApproved } from '../../_lib/auth.js'
import { parse, route } from '../../_lib/http.js'
import { SESSION_COLUMNS, toSessionDto, type SessionRow } from '../../_lib/sessions.js'
import { supabaseAdmin } from '../../_lib/supabase-admin.js'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(30),
  // Cursor: created_at de la última sesión recibida
  before: z.string().datetime({ offset: true }).optional(),
})

/** GET /api/chat/sessions — historial para el sidebar, más recientes primero (SPEC-003 §2). */
export default route({
  GET: async (req, res) => {
    const user = await requireApproved(req)
    const { limit, before } = parse(querySchema, req.query)

    let query = supabaseAdmin()
      .from('chat_sessions')
      .select(SESSION_COLUMNS)
      .eq('user_id', user.id)
      // La sesión en curso no aparece hasta que se cierra
      .neq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(limit + 1)
    if (before) query = query.lt('created_at', before)

    const { data, error } = await query.returns<SessionRow[]>()
    if (error) throw error

    const page = data.slice(0, limit)
    res.status(200).json({
      sessions: page.map(toSessionDto),
      nextCursor: data.length > limit ? page[page.length - 1].created_at : null,
    })
  },
})
