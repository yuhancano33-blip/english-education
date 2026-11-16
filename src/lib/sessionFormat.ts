import type { SessionMode, SessionSummary } from '@/types'

export const MODE_LABELS: Record<SessionMode, string> = {
  tutor: 'Tutor',
  free: 'Libre',
}

const dateFormat = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Título visible. Hasta la Fase 4 (título desde el resumen) se usa modo y
 * fecha, p. ej. "Tutor · 12 nov, 15:30" (SPEC-000, registro de decisiones).
 */
export function sessionTitle(session: Pick<SessionSummary, 'title' | 'mode' | 'started_at'>): string {
  if (session.title) return session.title
  return `${MODE_LABELS[session.mode]} · ${dateFormat.format(new Date(session.started_at))}`
}

export function formatDuration(seconds: number | null): string {
  const s = Math.max(0, seconds ?? 0)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
