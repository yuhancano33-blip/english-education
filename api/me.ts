import { requireUser } from './_lib/auth.js'
import { route } from './_lib/http.js'

/** GET /api/me — perfil, rol y estado; decide qué pantalla mostrar (SPEC-005). */
export default route({
  GET: async (req, res) => {
    const profile = await requireUser(req)
    res.status(200).json(profile)
  },
})
