import type { SessionMode } from '@/types'

/**
 * Definición de cada modo de conversación (SPEC-002 §6 y §7). Es el único
 * sitio del frontend donde se decide qué ofrece un modo: las vistas preguntan
 * aquí en lugar de comparar `mode === 'tutor'`.
 *
 * Debe coincidir con `api/_lib/modes.ts`.
 */
export interface SessionModeDefinition {
  value: SessionMode
  /** Nombre corto (historial, cabeceras) */
  label: string
  /** Nombre en el selector de modo */
  title: string
  hint: string
  /** Resumen con correcciones al terminar */
  summary: boolean
}

export const SESSION_MODES: Record<SessionMode, SessionModeDefinition> = {
  tutor: {
    value: 'tutor',
    label: 'Tutor',
    title: 'Tutor de inglés',
    hint: 'Corrige los errores importantes y al final te da un resumen',
    summary: true,
  },
  free: {
    value: 'free',
    label: 'Libre',
    title: 'Conversación libre',
    hint: 'Practica la fluidez sin correcciones',
    summary: false,
  },
}

/** Orden del selector: Tutor primero (modo por defecto, SPEC-000). */
export const SESSION_MODE_LIST: SessionModeDefinition[] = [SESSION_MODES.tutor, SESSION_MODES.free]

export function modeHasSummary(mode: SessionMode): boolean {
  return SESSION_MODES[mode].summary
}
