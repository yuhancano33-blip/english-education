import { computed, ref, type Ref } from 'vue'
import { api, ApiError } from '@/lib/api'
import { modeHasSummary } from '@/lib/sessionModes'
import type { SessionSummary, SessionSummaryData, SessionTurn } from '@/types'

/** Esperas antes de cada intento: 3 intentos en total. */
const RETRY_DELAYS_MS = [0, 3_000, 8_000]

/** Errores transitorios en los que vale la pena reintentar. */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true
  return err.status === 0 || err.status === 429 || err.status >= 500
}

/**
 * Resumen de una sesión (SPEC-002 §7). Se genera después de cerrar la sesión,
 * no dentro del cierre: Gemini puede tardar o estar saturado, así que aquí se
 * reintenta y, si aun así falla, se ofrece reintentar a mano.
 *
 * Cada carga de sesión llama a `reset()`, que invalida cualquier generación en
 * curso de la sesión anterior para que su respuesta no se aplique a esta.
 */
export function useSessionSummary(
  session: Ref<SessionSummary | null>,
  turns: Ref<SessionTurn[]>,
  onGenerated: () => void = () => {},
) {
  const generating = ref(false)
  const error = ref<string | null>(null)
  /** No hubo conversación del usuario: no hay nada que resumir */
  const empty = ref(false)
  let run = 0

  const hasUserTurns = computed(() => turns.value.some((t) => t.sender === 'user'))

  function reset() {
    run++
    generating.value = false
    error.value = null
    empty.value = false
  }

  async function generate() {
    const target = session.value
    if (!target || generating.value || !modeHasSummary(target.mode)) return
    const current = ++run
    generating.value = true
    error.value = null

    try {
      for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
        if (RETRY_DELAYS_MS[attempt]) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
        if (current !== run) return
        try {
          const data = await api<{ summary: SessionSummaryData; title: string | null }>(
            `/api/chat/sessions/${target.id}?action=summary`,
            { method: 'POST' },
          )
          if (current !== run || session.value?.id !== target.id) return
          session.value.summary = data.summary
          session.value.title = data.title
          onGenerated()
          return
        } catch (err) {
          if (current !== run) return
          if (err instanceof ApiError && err.code === 'empty_transcript') {
            empty.value = true
            return
          }
          const last = attempt === RETRY_DELAYS_MS.length - 1
          if (last || !isRetryable(err)) {
            error.value = err instanceof Error ? err.message : 'No se pudo generar el resumen'
            return
          }
        }
      }
    } finally {
      if (current === run) generating.value = false
    }
  }

  /**
   * Genera solo si hace falta: modo con resumen (tutor), sesión cerrada, sin
   * resumen y con turnos del usuario. En conversación libre nunca llama al API.
   */
  function ensure() {
    const s = session.value
    if (!s || !modeHasSummary(s.mode)) return
    if (s.summary || s.status === 'active' || !hasUserTurns.value) return
    void generate()
  }

  return { generating, error, empty, hasUserTurns, generate, ensure, reset }
}
