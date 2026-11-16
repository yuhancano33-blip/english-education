import type { SessionMode } from './instructions.js'

/**
 * Qué ofrece cada modo de conversación (SPEC-002 §6 y §7). Es el único sitio
 * donde se decide si un modo tiene resumen; el resto del código pregunta aquí
 * en lugar de comparar el modo directamente.
 *
 * - tutor: resumen con correcciones, vocabulario y consejos al terminar.
 * - free:  solo práctica; sin resumen ni correcciones y sin llamadas al
 *          modelo de texto.
 */
export interface ModeFeatures {
  summary: boolean
}

export const MODE_FEATURES: Record<SessionMode, ModeFeatures> = {
  tutor: { summary: true },
  free: { summary: false },
}
