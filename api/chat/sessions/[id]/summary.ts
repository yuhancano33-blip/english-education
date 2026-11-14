import { requireApproved } from '../../../_lib/auth.js'
import { HttpError, route, sendError } from '../../../_lib/http.js'
import { getOwnedSession, sessionIdFrom } from '../../../_lib/sessions.js'
import { summarizeSession } from '../../../_lib/summary.js'

/**
 * POST /api/chat/sessions/:id/summary — vuelve a generar el resumen de una
 * sesión cerrada, p. ej. si falló al cerrarla (SPEC-002 §7, SPEC-005).
 */
export default route({
  POST: async (req, res) => {
    const user = await requireApproved(req)
    const session = await getOwnedSession(sessionIdFrom(req.query), user.id)
    if (session.status === 'active') {
      throw new HttpError(409, 'session_active', 'La sesión todavía está en curso')
    }

    let outcome
    try {
      outcome = await summarizeSession(session)
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'summary_failed',
          sessionId: session.id,
          message: err instanceof Error ? err.message : String(err),
        }),
      )
      return sendError(res, 502, 'summary_error', 'No se pudo generar el resumen. Inténtalo de nuevo.')
    }

    if (outcome.status === 'empty') {
      throw new HttpError(409, 'empty_transcript', 'No hubo conversación suficiente para generar un resumen')
    }
    res.status(200).json({ summary: outcome.summary, title: outcome.title })
  },
})
