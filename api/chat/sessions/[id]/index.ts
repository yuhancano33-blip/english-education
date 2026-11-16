import { z } from 'zod'
import { requireApproved } from '../../../_lib/auth.js'
import { getSessionAudio } from '../../../_lib/handlers/session-audio.js'
import { createAudioUploadUrl } from '../../../_lib/handlers/session-audio-upload-url.js'
import { finishSession } from '../../../_lib/handlers/session-finish.js'
import { saveSessionMessages } from '../../../_lib/handlers/session-messages.js'
import { regenerateSummary } from '../../../_lib/handlers/session-summary.js'
import { byAction, HttpError, parse, route } from '../../../_lib/http.js'
import {
  AUDIO_BUCKET,
  getOwnedSession,
  sessionIdFrom,
  toSessionDto,
} from '../../../_lib/sessions.js'
import { supabaseAdmin } from '../../../_lib/supabase-admin.js'

const renameSchema = z.object({ title: z.string().trim().min(1).max(120) })

/**
 * /api/chat/sessions/:id — una sesión del usuario (SPEC-003, SPEC-005):
 *   GET                            detalle: sesión y turnos
 *   GET    ?action=audio           URL firmada de descarga del audio
 *   PATCH                          renombrar
 *   DELETE                         elimina sesión, turnos y audio
 *   POST   ?action=messages        guarda turnos de la transcripción
 *   POST   ?action=audio-upload-url URL firmada de subida del audio
 *   POST   ?action=finish          cierra la sesión y genera el resumen
 *   POST   ?action=summary         vuelve a generar el resumen
 */
export default route({
  GET: byAction({
    '': async (req, res) => {
      const user = await requireApproved(req)
      const session = await getOwnedSession(sessionIdFrom(req.query), user.id)

      const { data: turns, error } = await supabaseAdmin()
        .from('messages')
        .select('turn_index, sender, content, created_at')
        .eq('session_id', session.id)
        .order('turn_index', { ascending: true })
      if (error) throw error

      res.status(200).json({ session: toSessionDto(session), turns })
    },
    audio: getSessionAudio,
  }),

  POST: byAction({
    messages: saveSessionMessages,
    'audio-upload-url': createAudioUploadUrl,
    finish: finishSession,
    summary: regenerateSummary,
  }),

  PATCH: byAction({
    '': async (req, res) => {
      const user = await requireApproved(req)
      const session = await getOwnedSession(sessionIdFrom(req.query), user.id)
      const { title } = parse(renameSchema, req.body)

      const { error } = await supabaseAdmin()
        .from('chat_sessions')
        .update({ title })
        .eq('id', session.id)
      if (error) throw error
      res.status(200).json({ id: session.id, title })
    },
  }),

  DELETE: byAction({
    '': async (req, res) => {
      const user = await requireApproved(req)
      const session = await getOwnedSession(sessionIdFrom(req.query), user.id)
      if (session.status === 'active') {
        throw new HttpError(409, 'session_active', 'No se puede eliminar una sesión en curso')
      }
      const db = supabaseAdmin()

      // Primero el audio: si falla, la sesión sigue visible y se puede reintentar
      if (session.audio_path) {
        const { error } = await db.storage.from(AUDIO_BUCKET).remove([session.audio_path])
        if (error) throw error
      }
      // Los turnos se borran en cascada
      const { error } = await db.from('chat_sessions').delete().eq('id', session.id)
      if (error) throw error
      res.status(204).end()
    },
  }),
})
