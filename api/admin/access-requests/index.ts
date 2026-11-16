import { z } from 'zod'
import { requireAdmin } from '../../_lib/auth.js'
import { resolveAccessRequest } from '../../_lib/handlers/resolve-access-request.js'
import { byAction, parse, route } from '../../_lib/http.js'
import { supabaseAdmin } from '../../_lib/supabase-admin.js'

const querySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
})

/**
 * /api/admin/access-requests — solicitudes de acceso (SPEC-004, SPEC-005):
 *   GET   ?status=                    lista
 *   POST  ?id=:id&action=resolve      aprueba o rechaza
 */
export default route({
  GET: byAction({
    '': async (req, res) => {
      await requireAdmin(req)
      const { status } = parse(querySchema, req.query)

      let query = supabaseAdmin()
        .from('access_requests')
        .select(
          `id, status, created_at, resolved_at,
           user:users_profile!access_requests_user_id_fkey (id, email, display_name),
           resolver:users_profile!access_requests_resolved_by_fkey (id, email)`,
        )
        .order('created_at', { ascending: false })
        .limit(200)
      if (status) query = query.eq('status', status)

      const { data, error } = await query
      if (error) throw error
      res.status(200).json({ requests: data })
    },
  }),

  POST: byAction({ resolve: resolveAccessRequest }),
})
