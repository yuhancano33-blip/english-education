import { z } from 'zod'
import { requireApproved } from '../../../_lib/auth.js'
import { HttpError, parse, route } from '../../../_lib/http.js'
import {
  AUDIO_BUCKET,
  audioMimeSchema,
  audioPathFor,
  getOwnedSession,
  sessionIdFrom,
} from '../../../_lib/sessions.js'
import { supabaseAdmin } from '../../../_lib/supabase-admin.js'

const bodySchema = z.object({ mime: audioMimeSchema })

/**
 * POST /api/chat/sessions/:id/audio-upload-url — URL firmada para subir el
 * audio directamente a Storage (SPEC-002 §5). Solo para la propia sesión, en
 * su ruta fija y con un tipo MIME permitido; el bucket limita a 10 MB.
 */
export default route({
  POST: async (req, res) => {
    const user = await requireApproved(req)
    const session = await getOwnedSession(sessionIdFrom(req.query), user.id)
    const { mime } = parse(bodySchema, req.body)

    if (session.status !== 'active') {
      throw new HttpError(409, 'session_closed', 'La sesión ya está cerrada')
    }

    const path = audioPathFor(user.id, session.id, mime)
    const { data, error } = await supabaseAdmin()
      .storage.from(AUDIO_BUCKET)
      .createSignedUploadUrl(path, { upsert: true })
    if (error) throw error

    res.status(200).json({ bucket: AUDIO_BUCKET, path: data.path, token: data.token })
  },
})
