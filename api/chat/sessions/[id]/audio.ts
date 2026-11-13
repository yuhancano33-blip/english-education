import { requireApproved } from '../../../_lib/auth.js'
import { HttpError, route } from '../../../_lib/http.js'
import { AUDIO_BUCKET, getOwnedSession, sessionIdFrom } from '../../../_lib/sessions.js'
import { supabaseAdmin } from '../../../_lib/supabase-admin.js'

/** Validez de la URL de descarga (SPEC-005: "válida pocos minutos"). */
const DOWNLOAD_TTL_SECONDS = 300

/** GET /api/chat/sessions/:id/audio — URL firmada de descarga del audio. */
export default route({
  GET: async (req, res) => {
    const user = await requireApproved(req)
    const session = await getOwnedSession(sessionIdFrom(req.query), user.id)
    if (!session.audio_path) {
      throw new HttpError(404, 'no_audio', 'Esta sesión no tiene audio')
    }

    const { data, error } = await supabaseAdmin()
      .storage.from(AUDIO_BUCKET)
      .createSignedUrl(session.audio_path, DOWNLOAD_TTL_SECONDS)
    if (error) throw error

    res.status(200).json({
      url: data.signedUrl,
      mime: session.audio_mime,
      expiresAt: new Date(Date.now() + DOWNLOAD_TTL_SECONDS * 1000).toISOString(),
    })
  },
})
