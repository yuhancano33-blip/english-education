import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireApproved } from '../auth.js'
import { HttpError, sendError } from '../http.js'
import { MODE_FEATURES } from '../modes.js'
import { getOwnedSession, sessionIdFrom } from '../sessions.js'
import { summarizeSession } from '../summary.js'

/**
 * POST /api/chat/sessions/:id?action=summary — genera el resumen de una sesión
 * de tutor ya cerrada (SPEC-002 §7, SPEC-005). El cliente lo pide al abrir la
 * sesión y reintenta si falla. La conversación libre no tiene resumen.
 */
export async function regenerateSummary(req: VercelRequest, res: VercelResponse) {
  const user = await requireApproved(req)
  const session = await getOwnedSession(sessionIdFrom(req.query), user.id)
  if (!MODE_FEATURES[session.mode].summary) {
    throw new HttpError(409, 'summary_not_available', 'Este modo de conversación no tiene resumen')
  }
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
  if (outcome.status === 'not_applicable') {
    throw new HttpError(409, 'summary_not_available', 'Este modo de conversación no tiene resumen')
  }
  res.status(200).json({ summary: outcome.summary, title: outcome.title })
}
