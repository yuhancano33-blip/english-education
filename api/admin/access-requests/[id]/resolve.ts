import { z } from 'zod'
import { requireAdmin } from '../../../_lib/auth.js'
import { HttpError, parse, route } from '../../../_lib/http.js'
import { supabaseAdmin } from '../../../_lib/supabase-admin.js'

const paramsSchema = z.object({ id: z.string().uuid() })
const bodySchema = z.object({ decision: z.enum(['approve', 'reject']) })

/**
 * POST /api/admin/access-requests/:id/resolve — aprueba o rechaza (SPEC-004 §2).
 * La función SQL solo actúa si la solicitud sigue pending: si otro admin se
 * adelantó, se responde 409.
 */
export default route({
  POST: async (req, res) => {
    const admin = await requireAdmin(req)
    const { id } = parse(paramsSchema, req.query)
    const { decision } = parse(bodySchema, req.body)
    const status = decision === 'approve' ? 'approved' : 'rejected'

    const { data: outcome, error } = await supabaseAdmin().rpc('resolve_access_request', {
      p_request_id: id,
      p_admin_id: admin.id,
      p_decision: status,
    })
    if (error) throw error

    if (outcome === 'not_found') {
      throw new HttpError(404, 'not_found', 'La solicitud no existe')
    }
    if (outcome === 'already_resolved') {
      throw new HttpError(409, 'already_resolved', 'Otro administrador ya resolvió esta solicitud')
    }
    res.status(200).json({ id, status })
  },
})
