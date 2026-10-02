import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { ApiError, api } from '@/lib/api'
import { LiveClient } from '@/voice/live-client'
import { Microphone } from '@/voice/microphone'
import { pcmToBase64 } from '@/voice/pcm'
import { PcmPlayer } from '@/voice/player'
import type { SessionMode } from '@/types'

/** Estados de la interfaz de voz (SPEC-003 §4). */
export type VoiceState = 'idle' | 'connecting' | 'active' | 'muted' | 'saving' | 'error'

export interface TranscriptEntry {
  id: number
  sender: 'user' | 'assistant'
  text: string
}

export interface VoiceError {
  code: string
  message: string
}

interface CreatedSession {
  sessionId: string
  token: string
  expiresAt: string
  maxDurationSec: number
  mode: SessionMode
  model: string
}

/** Tiempos de SPEC-002 §4 (segundos desde el inicio). */
const WARNING_AT = 6 * 60
const GOODBYE_AT = 6 * 60 + 45
const GOODBYE_MESSAGE =
  '[SYSTEM] The session ends in 15 seconds. Say a brief, warm goodbye to the user in the language you are currently using.'

export const useVoiceSessionStore = defineStore('voiceSession', () => {
  const state = ref<VoiceState>('idle')
  const mode = ref<SessionMode>('tutor')
  const elapsed = ref(0)
  const maxDuration = ref(420)
  const transcript = ref<TranscriptEntry[]>([])
  const error = ref<VoiceError | null>(null)
  const warning = ref(false)
  const lastResult = ref<{ status: 'completed' | 'interrupted'; duration: number } | null>(null)
  const analysers = shallowRef<{ input: AnalyserNode; output: AnalyserNode } | null>(null)

  const remaining = computed(() => Math.max(0, maxDuration.value - elapsed.value))
  const inSession = computed(() => state.value === 'active' || state.value === 'muted')

  let mic: Microphone | null = null
  let player: PcmPlayer | null = null
  let live: LiveClient | null = null
  let sessionId: string | null = null
  let startedAt = 0
  let timer: ReturnType<typeof setInterval> | null = null
  let goodbyeSent = false
  let ending = false
  let nextEntryId = 0

  /** Debe llamarse desde un clic: crea los AudioContext dentro del gesto. */
  async function start() {
    if (state.value !== 'idle' && state.value !== 'error') return
    resetSessionState()
    state.value = 'connecting'

    player = new PcmPlayer()
    mic = new Microphone()

    // 1. Micrófono primero: si se deniega, no se gasta una sesión del límite diario
    try {
      await mic.start((chunk) => {
        if (live && state.value === 'active') live.sendAudio(pcmToBase64(chunk))
      })
    } catch (err) {
      await releaseAudio()
      return fail(microphoneError(err))
    }

    // 2. Sesión + token efímero
    let created: CreatedSession
    try {
      created = await api<CreatedSession>('/api/voice/sessions', {
        method: 'POST',
        body: JSON.stringify({ mode: mode.value }),
      })
    } catch (err) {
      await releaseAudio()
      return fail(apiError(err))
    }
    sessionId = created.sessionId
    maxDuration.value = created.maxDurationSec

    // 3. Conexión directa a Gemini Live
    try {
      live = await LiveClient.connect(created.token, created.model, {
        onAudio: (data) => player?.enqueue(data),
        onInterrupted: () => player?.flush(),
        onInputTranscript: (text) => appendTranscript('user', text),
        onOutputTranscript: (text) => appendTranscript('assistant', text),
        onTurnComplete: () => {},
        onError: () => {},
        onClose: (event) => {
          if (!ending) void end('interrupted', closeError(event))
        },
      })
    } catch {
      await releaseAudio()
      await finishOnServer('interrupted', 0)
      return fail({
        code: 'connection_failed',
        message: 'No se pudo conectar con el servicio de voz. Inténtalo de nuevo.',
      })
    }

    await player.resume()
    analysers.value = { input: mic.analyser, output: player.analyser }
    startedAt = Date.now()
    state.value = 'active'
    timer = setInterval(tick, 250)
  }

  function tick() {
    elapsed.value = Math.min(maxDuration.value, Math.floor((Date.now() - startedAt) / 1000))

    if (elapsed.value >= WARNING_AT && !warning.value) {
      warning.value = true
      player?.beep()
    }
    if (elapsed.value >= GOODBYE_AT && !goodbyeSent) {
      goodbyeSent = true
      live?.sendText(GOODBYE_MESSAGE)
    }
    if (elapsed.value >= maxDuration.value) void end('completed')
  }

  function toggleMute() {
    if (state.value === 'active') {
      mic?.setEnabled(false)
      live?.sendAudioEnd()
      state.value = 'muted'
    } else if (state.value === 'muted') {
      mic?.setEnabled(true)
      state.value = 'active'
    }
  }

  /** Cierre por el usuario, por tiempo o por desconexión. */
  async function end(status: 'completed' | 'interrupted', withError?: VoiceError) {
    if (ending || !inSession.value) return
    ending = true
    state.value = 'saving'
    if (timer) clearInterval(timer)
    timer = null

    const duration = Math.min(maxDuration.value, elapsed.value)
    live?.close()
    live = null
    await releaseAudio()
    await finishOnServer(status, duration)

    lastResult.value = { status, duration }
    if (withError) return fail(withError)
    state.value = 'idle'
  }

  function dismissError() {
    if (state.value === 'error') state.value = 'idle'
    error.value = null
  }

  function appendTranscript(sender: TranscriptEntry['sender'], text: string) {
    const last = transcript.value.at(-1)
    if (last && last.sender === sender) {
      last.text += text
    } else {
      transcript.value.push({ id: nextEntryId++, sender, text: text.trimStart() })
    }
  }

  async function finishOnServer(status: 'completed' | 'interrupted', duration: number) {
    if (!sessionId) return
    try {
      await api(`/api/chat/sessions/${sessionId}/finish`, {
        method: 'POST',
        body: JSON.stringify({ duration_seconds: duration, status }),
      })
    } catch {
      // Si falla, el servidor la cerrará como interrumpida a los 10 min (SPEC-006 §3)
    }
  }

  async function releaseAudio() {
    analysers.value = null
    await Promise.allSettled([mic?.stop(), player?.close()])
    mic = null
    player = null
  }

  function fail(err: VoiceError) {
    error.value = err
    state.value = 'error'
  }

  function resetSessionState() {
    error.value = null
    lastResult.value = null
    transcript.value = []
    elapsed.value = 0
    warning.value = false
    goodbyeSent = false
    ending = false
    sessionId = null
  }

  return {
    state,
    mode,
    elapsed,
    remaining,
    maxDuration,
    transcript,
    error,
    warning,
    lastResult,
    analysers,
    inSession,
    start,
    toggleMute,
    end,
    dismissError,
  }
})

// --- Mensajes de error (SPEC-002 §8) ---

function microphoneError(err: unknown): VoiceError {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      code: 'mic_denied',
      message:
        'No tenemos permiso para usar el micrófono. Habilítalo desde el icono del candado junto a la dirección de la página y vuelve a intentarlo.',
    }
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return { code: 'mic_missing', message: 'No se encontró ningún micrófono conectado.' }
  }
  return { code: 'mic_error', message: 'No se pudo acceder al micrófono.' }
}

function apiError(err: unknown): VoiceError {
  if (!(err instanceof ApiError)) {
    return { code: 'network', message: 'No se pudo contactar con el servidor. Revisa tu conexión.' }
  }
  if (err.status === 429) {
    const resetsAt = typeof err.details.resetsAt === 'string' ? new Date(err.details.resetsAt) : null
    const when = resetsAt
      ? ` Se renueva el ${resetsAt.toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}.`
      : ''
    return { code: 'daily_limit', message: `${err.message}.${when}` }
  }
  if (err.status === 409) {
    return {
      code: 'active_session',
      message:
        'Ya tienes una sesión de voz activa en otra pestaña o dispositivo. Si la cerraste sin finalizarla, se liberará en unos minutos.',
    }
  }
  if (err.status === 502) {
    return { code: 'token_error', message: 'No se pudo iniciar el servicio de voz. Inténtalo de nuevo.' }
  }
  return { code: err.code, message: err.message }
}

function closeError(event: CloseEvent): VoiceError {
  const reason = event.reason.toLowerCase()
  if (reason.includes('quota') || reason.includes('resource_exhausted') || reason.includes('rate')) {
    return {
      code: 'service_unavailable',
      message: 'El servicio de voz no está disponible temporalmente. Inténtalo más tarde.',
    }
  }
  return {
    code: 'connection_closed',
    message: 'La conexión se cerró antes de tiempo. La sesión quedó guardada como interrumpida.',
  }
}
