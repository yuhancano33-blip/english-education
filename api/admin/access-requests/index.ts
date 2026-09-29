import { z } from 'zod'
import { requireAdmin } from '../../_lib/auth.js'
import { parse, route } from '../../_lib/http.js'
import { supabaseAdmin } from '../../_lib/supabase-admin.js'

const querySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
})

/** GET /api/admin/access-requests?status= — solicitudes de acceso (SPEC-005). */
export default route({
  GET: async (req, res) => {
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
})
