import { z } from 'zod'
import { requireApproved } from '../_lib/auth.js'
import {
  DAILY_SESSION_LIMIT,
  MAX_SESSION_SECONDS,
  SESSION_TIMEZONE,
  STALE_SESSION_SECONDS,
} from '../_lib/config.js'
import { createLiveToken } from '../_lib/gemini.js'
import { HttpError, parse, route, sendError } from '../_lib/http.js'
import { supabaseAdmin } from '../_lib/supabase-admin.js'

const bodySchema = z.object({ mode: z.enum(['free', 'tutor']) })

interface StartResult {
  outcome: 'created' | 'not_approved' | 'active_exists' | 'limit_reached'
  session_id: string | null
  resets_at: string | null
}

/**
 * POST /api/voice/sessions — valida límites, crea la sesión y emite el token
 * efímero de Gemini Live (SPEC-002 §2, SPEC-005).
 */
export default route({
  POST: async (req, res) => {
    const user = await requireApproved(req)
    const { mode } = parse(bodySchema, req.body)
    const db = supabaseAdmin()

    const { data, error } = await db
      .rpc('start_voice_session', {
        p_user_id: user.id,
        p_mode: mode,
        p_daily_limit: DAILY_SESSION_LIMIT,
        p_stale_after_seconds: STALE_SESSION_SECONDS,
        p_timezone: SESSION_TIMEZONE,
      })
      .single<StartResult>()
    if (error) throw error

    switch (data.outcome) {
      case 'not_approved':
        throw new HttpError(403, 'not_approved', 'Tu cuenta aún no está aprobada')
      case 'active_exists':
        throw new HttpError(409, 'active_session', 'Ya tienes una sesión de voz activa')
      case 'limit_reached':
        return res.status(429).json({
          error: {
            code: 'daily_limit',
            message: `Alcanzaste el límite de ${DAILY_SESSION_LIMIT} sesiones diarias`,
            resetsAt: data.resets_at,
          },
        })
    }

    const sessionId = data.session_id as string
    try {
      const { token, expiresAt, model } = await createLiveToken(mode)
      res.status(201).json({
        sessionId,
        token,
        expiresAt,
        maxDurationSec: MAX_SESSION_SECONDS,
        mode,
        model,
      })
    } catch (err) {
      // La sesión nunca empezó: se borra para que no cuente en el límite diario
      await db.from('chat_sessions').delete().eq('id', sessionId)
      console.error(
        JSON.stringify({
          level: 'error',
          path: '/api/voice/sessions',
          message: err instanceof Error ? err.message : String(err),
        }),
      )
      sendError(res, 502, 'token_error', 'No se pudo iniciar la conexión con el servicio de voz')
    }
  },
})
