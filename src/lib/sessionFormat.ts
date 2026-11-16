import type { SessionMode, SessionSummary } from '@/types'
import { SESSION_MODES } from './sessionModes'

export const MODE_LABELS: Record<SessionMode, string> = {
  tutor: SESSION_MODES.tutor.label,
  free: SESSION_MODES.free.label,
}

const dateFormat = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Título visible. Si la sesión no tiene título (conversación libre, o tutor
 * antes de generar el resumen) se usa modo y fecha, p. ej. "Tutor · 12 nov,
 * 15:30" (SPEC-000, registro de decisiones).
 */
export function sessionTitle(session: Pick<SessionSummary, 'title' | 'mode' | 'started_at'>): string {
  if (session.title) return session.title
  return `${MODE_LABELS[session.mode]} · ${dateFormat.format(new Date(session.started_at))}`
}

export function formatDuration(seconds: number | null): string {
  const s = Math.max(0, seconds ?? 0)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
