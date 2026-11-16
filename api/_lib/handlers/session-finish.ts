import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { requireApproved } from '../auth.js'
import { MAX_SESSION_SECONDS } from '../config.js'
import { HttpError, parse } from '../http.js'
import { MODE_FEATURES } from '../modes.js'
import {
  AUDIO_BUCKET,
  audioMimeSchema,
  audioPathFor,
  getOwnedSession,
  sessionIdFrom,
} from '../sessions.js'
import { supabaseAdmin } from '../supabase-admin.js'

// audio_path/audio_mime son opcionales: si la subida falló, la sesión se
// guarda sin audio (SPEC-002 §5).
const bodySchema = z
  .object({
    duration_seconds: z.number().int().min(0).max(MAX_SESSION_SECONDS),
    status: z.enum(['completed', 'interrupted']),
    audio_path: z.string().min(1).max(200).optional(),
    audio_mime: audioMimeSchema.optional(),
  })
  .refine((b) => !!b.audio_path === !!b.audio_mime, {
    message: 'audio_path y audio_mime van juntos',
  })

/** POST /api/chat/sessions/:id?action=finish — cierra una sesión activa del usuario. */
export async function finishSession(req: VercelRequest, res: VercelResponse) {
  const user = await requireApproved(req)
  const session = await getOwnedSession(sessionIdFrom(req.query), user.id)
  const body = parse(bodySchema, req.body)
  const db = supabaseAdmin()

  if (session.status !== 'active') {
    throw new HttpError(409, 'already_finished', 'La sesión ya estaba cerrada')
  }

  let audio: { audio_path: string; audio_mime: string } | null = null
  if (body.audio_path && body.audio_mime) {
    // Solo se acepta la ruta propia de esta sesión, y el archivo debe existir
    const expected = audioPathFor(user.id, session.id, body.audio_mime)
    if (body.audio_path !== expected) {
      throw new HttpError(400, 'invalid_audio_path', 'La ruta del audio no corresponde a esta sesión')
    }
    const [folder, file] = expected.split('/')
    const { data: found, error: listError } = await db.storage
      .from(AUDIO_BUCKET)
      .list(folder, { search: file, limit: 1 })
    if (listError) throw listError
    if (!found?.some((f) => f.name === file)) {
      throw new HttpError(400, 'audio_not_uploaded', 'El audio no se ha subido')
    }
    audio = { audio_path: expected, audio_mime: body.audio_mime }
  }

  const { data: updated, error } = await db
    .from('chat_sessions')
    .update({
      status: body.status,
      duration_seconds: body.duration_seconds,
      ended_at: new Date().toISOString(),
      ...(audio ?? {}),
    })
    .eq('id', session.id)
    .eq('status', 'active')
    .select('id, status, duration_seconds, audio_path')
    .maybeSingle()
  if (error) throw error
  // Otra petición la cerró entre la lectura y la escritura
  if (!updated) throw new HttpError(409, 'already_finished', 'La sesión ya estaba cerrada')

  // El resumen NO se genera aquí: Gemini puede tardar más que el tiempo de la
  // función, y un único intento dentro del cierre dejaba sesiones sin resumen.
  // En los modos con resumen (tutor) el cliente lo pide después con
  // POST ?action=summary, con reintentos (SPEC-002 §7).
  res.status(200).json({
    id: updated.id,
    status: updated.status,
    duration_seconds: updated.duration_seconds,
    has_audio: !!updated.audio_path,
    summary_status: MODE_FEATURES[session.mode].summary ? 'pending' : 'not_applicable',
  })
}
