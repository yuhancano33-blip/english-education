import { createHash, timingSafeEqual } from 'node:crypto'
import type { VercelRequest } from '@vercel/node'
import { z } from 'zod'
import { sendEmail } from '../_lib/email.js'
import { HttpError, parse, route } from '../_lib/http.js'
import { supabaseAdmin } from '../_lib/supabase-admin.js'

const bodySchema = z.object({ request_id: z.string().uuid() })

function digest(value: string) {
  return createHash('sha256').update(value).digest()
}

/** Compara el secreto compartido en tiempo constante. */
function verifySecret(req: VercelRequest) {
  const expected = process.env.ACCESS_WEBHOOK_SECRET
  const received = req.headers['x-webhook-secret']
  if (!expected || typeof received !== 'string' || !timingSafeEqual(digest(received), digest(expected))) {
    throw new HttpError(401, 'unauthorized', 'Secreto de webhook inválido')
  }
}

/**
 * POST /api/webhooks/access-request-created — lo llama el trigger de la base de
 * datos al crearse una solicitud y envía un email a los administradores (SPEC-004 §2).
 */
export default route({
  POST: async (req, res) => {
    verifySecret(req)
    const { request_id } = parse(bodySchema, req.body)
    const db = supabaseAdmin()

    const { data: request, error } = await db
      .from('access_requests')
      .select('status, user:users_profile!access_requests_user_id_fkey (email)')
      .eq('id', request_id)
      .maybeSingle<{ status: string; user: { email: string } | null }>()
    if (error) throw error
    if (!request || request.status !== 'pending') {
      return res.status(200).json({ sent: 0 })
    }

    const { data: admins, error: adminsError } = await db
      .from('users_profile')
      .select('email')
      .eq('role', 'admin')
    if (adminsError) throw adminsError
    const to = (admins ?? []).map((a) => a.email as string)
    if (to.length === 0) {
      return res.status(200).json({ sent: 0 })
    }

    const appUrl = process.env.APP_URL?.replace(/\/$/, '') ?? ''
    await sendEmail({
      to,
      subject: 'Nueva solicitud de acceso',
      text: [
        `${request.user?.email ?? 'Un usuario'} ha solicitado acceso a la aplicación.`,
        '',
        appUrl ? `Revísala en ${appUrl}/admin` : 'Revísala en el panel de administración.',
      ].join('\n'),
    })
    res.status(200).json({ sent: to.length })
  },
})
