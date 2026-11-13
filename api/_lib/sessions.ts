import { z } from 'zod'
import { HttpError, parse } from './http.js'
import { supabaseAdmin } from './supabase-admin.js'

export const AUDIO_BUCKET = 'session-audio'

/** Tipos de audio aceptados y su extensión (SPEC-002 §5, SPEC-006 §4). */
export const AUDIO_EXTENSIONS = { 'audio/webm': 'webm', 'audio/mp4': 'm4a' } as const
export type AudioMime = keyof typeof AUDIO_EXTENSIONS
export const audioMimeSchema = z.enum(['audio/webm', 'audio/mp4'])

/** Ruta del audio de una sesión: {user_id}/{session_id}.{ext} */
export function audioPathFor(userId: string, sessionId: string, mime: AudioMime): string {
  return `${userId}/${sessionId}.${AUDIO_EXTENSIONS[mime]}`
}

const idSchema = z.object({ id: z.string().uuid() })

export function sessionIdFrom(query: unknown): string {
  return parse(idSchema, query).id
}

export interface SessionRow {
  id: string
  user_id: string
  title: string | null
  mode: 'free' | 'tutor'
  status: 'active' | 'completed' | 'interrupted'
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  audio_path: string | null
  audio_mime: string | null
  summary: unknown
  created_at: string
}

export const SESSION_COLUMNS =
  'id, user_id, title, mode, status, started_at, ended_at, duration_seconds, audio_path, audio_mime, summary, created_at'

/** Carga una sesión del usuario o lanza 404 (no revela si existe para otro). */
export async function getOwnedSession(sessionId: string, userId: string): Promise<SessionRow> {
  const { data, error } = await supabaseAdmin()
    .from('chat_sessions')
    .select(SESSION_COLUMNS)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle<SessionRow>()
  if (error) throw error
  if (!data) throw new HttpError(404, 'not_found', 'La sesión no existe')
  return data
}

/** Forma pública de una sesión (sin user_id). */
export function toSessionDto(s: SessionRow) {
  return {
    id: s.id,
    title: s.title,
    mode: s.mode,
    status: s.status,
    started_at: s.started_at,
    ended_at: s.ended_at,
    duration_seconds: s.duration_seconds,
    has_audio: !!s.audio_path,
    audio_mime: s.audio_mime,
    summary: s.summary,
    created_at: s.created_at,
  }
}
