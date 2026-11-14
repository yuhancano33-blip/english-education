import { z } from 'zod'
import { requireUser } from './_lib/auth.js'
import { HttpError, parse, route } from './_lib/http.js'
import { AUDIO_BUCKET } from './_lib/sessions.js'
import { supabaseAdmin } from './_lib/supabase-admin.js'

const deleteSchema = z.object({ confirm: z.literal('ELIMINAR') })

export default route({
  /** GET /api/me — perfil, rol y estado; decide qué pantalla mostrar (SPEC-005). */
  GET: async (req, res) => {
    const profile = await requireUser(req)
    res.status(200).json(profile)
  },

  /**
   * DELETE /api/me — elimina la cuenta y todos sus datos (SPEC-006 §7): audios
   * de Storage y usuario de Auth; perfil, solicitudes, sesiones y turnos se
   * borran en cascada. Los administradores no pueden borrarse desde la app.
   */
  DELETE: async (req, res) => {
    const user = await requireUser(req)
    parse(deleteSchema, req.body)
    if (user.role === 'admin') {
      throw new HttpError(409, 'admin_cannot_delete', 'Una cuenta de administrador no se puede eliminar desde la app')
    }
    const db = supabaseAdmin()

    // 1. Audios: toda la carpeta {user_id}/ del bucket, por páginas
    for (;;) {
      const { data: files, error } = await db.storage.from(AUDIO_BUCKET).list(user.id, { limit: 100 })
      if (error) throw error
      if (!files?.length) break
      const { error: removeError } = await db.storage
        .from(AUDIO_BUCKET)
        .remove(files.map((f) => `${user.id}/${f.name}`))
      if (removeError) throw removeError
      if (files.length < 100) break
    }

    // 2. Usuario de Auth: el resto se borra en cascada
    const { error } = await db.auth.admin.deleteUser(user.id)
    if (error) throw error

    res.status(204).end()
  },
})
