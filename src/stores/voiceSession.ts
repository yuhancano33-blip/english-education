import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { ApiError, api } from '@/lib/api'
import { LiveClient } from '@/voice/live-client'
import { Microphone } from '@/voice/microphone'
import { pcmToBase64 } from '@/voice/pcm'
import { TranscriptSync, uploadRecording } from '@/voice/persistence'
import { PcmPlayer } from '@/voice/player'
import { SessionRecorder, type Recording } from '@/voice/recorder'
import type { SessionMode } from '@/types'

/** Estados de la interfaz de voz (SPEC-003 §4). */
export type VoiceState = 'idle' | 'connecting' | 'active' | 'muted' | 'saving' | 'error'

/** Paso actual de la pantalla "Guardando…" */
export type SavingStep = 'transcript' | 'audio' | 'closing'

export interface TranscriptEntry {
  id: number
  sender: 'user' | 'assistant'
  text: string
}

export interface VoiceError {
  code: string
  message: string
}

export interface SessionResult {
  sessionId: string
  status: 'completed' | 'interrupted'
  duration: number
  audioSaved: boolean
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
  const savingStep = ref<SavingStep>('transcript')
  const mode = ref<SessionMode>('tutor')
  const elapsed = ref(0)
  const maxDuration = ref(420)
  const transcript = ref<TranscriptEntry[]>([])
  const error = ref<VoiceError | null>(null)
  const warning = ref(false)
  const lastResult = ref<SessionResult | null>(null)
  const analysers = shallowRef<{ input: AnalyserNode; output: AnalyserNode } | null>(null)

  const remaining = computed(() => Math.max(0, maxDuration.value - elapsed.value))
  const inSession = computed(() => state.value === 'active' || state.value === 'muted')

  // Un único AudioContext para captura, reproducción y grabación
  let context: AudioContext | null = null
  let mic: Microphone | null = null
  let player: PcmPlayer | null = null
  let recorder: SessionRecorder | null = null
  let live: LiveClient | null = null
  let transcriptSync: TranscriptSync | null = null
  let sessionId: string | null = null
  let startedAt = 0
  let timer: ReturnType<typeof setInterval> | null = null
  let goodbyeSent = false
  let ending = false
  let nextEntryId = 0

  /** Debe llamarse desde un clic: crea el AudioContext dentro del gesto. */
  async function start() {
    if (state.value !== 'idle' && state.value !== 'error') return
    resetSessionState()
    state.value = 'connecting'

    context = new AudioContext()
    player = new PcmPlayer(context)
    mic = new Microphone(context)

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
    transcriptSync = new TranscriptSync(created.sessionId)

    // 3. Conexión directa a Gemini Live
    try {
      live = await LiveClient.connect(created.token, created.model, {
        onAudio: (data) => player?.enqueue(data),
        onInterrupted: () => player?.flush(),
        onInputTranscript: (text) => appendTranscript('user', text),
        onOutputTranscript: (text) => appendTranscript('assistant', text),
        // Al cerrar cada turno se guarda la transcripción (SPEC-002 §3)
        onTurnComplete: () => void syncTranscript(),
        onError: () => {},
        onClose: (event) => {
          if (!ending) void end('interrupted', closeError(event))
        },
      })
    } catch {
      await releaseAudio()
      await finishOnServer('interrupted', 0, null)
      return fail({
        code: 'connection_failed',
        message: 'No se pudo conectar con el servicio de voz. Inténtalo de nuevo.',
      })
    }

    await context.resume()
    // 4. Grabación de micrófono + agente (SPEC-002 §5). Si el navegador no
    // puede grabar, la conversación sigue y se guarda sin audio.
    try {
      if (mic.source) {
        recorder = new SessionRecorder(context, [mic.source, player.analyser])
        recorder.start()
      }
    } catch {
      recorder = null
    }

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

  /**
   * Cierre por el usuario, por tiempo o por desconexión: guarda los últimos
   * turnos, sube el audio y cierra la sesión en el servidor (SPEC-001 §4).
   */
  async function end(status: 'completed' | 'interrupted', withError?: VoiceError) {
    if (ending || !inSession.value) return
    ending = true
    state.value = 'saving'
    savingStep.value = 'transcript'
    if (timer) clearInterval(timer)
    timer = null

    const duration = Math.min(maxDuration.value, elapsed.value)
    live?.close()
    live = null

    const recording: Recording | null = recorder ? await recorder.stop() : null
    recorder = null
    await releaseAudio()
    await syncTranscript()

    let audioPath: string | null = null
    if (recording && sessionId) {
      savingStep.value = 'audio'
      audioPath = await uploadRecording(sessionId, recording)
    }

    savingStep.value = 'closing'
    await finishOnServer(status, duration, audioPath && recording ? { path: audioPath, mime: recording.mime } : null)

    if (sessionId) {
      lastResult.value = { sessionId, status, duration, audioSaved: !!audioPath }
    }
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

  function syncTranscript() {
    if (!transcriptSync) return Promise.resolve()
    return transcriptSync.sync(
      transcript.value.map((e) => ({ turn_index: e.id, sender: e.sender, content: e.text })),
    )
  }

  async function finishOnServer(
    status: 'completed' | 'interrupted',
    duration: number,
    audio: { path: string; mime: string } | null,
  ) {
    if (!sessionId) return
    const body = {
      duration_seconds: duration,
      status,
      ...(audio ? { audio_path: audio.path, audio_mime: audio.mime } : {}),
    }
    try {
      await api(`/api/chat/sessions/${sessionId}?action=finish`, { method: 'POST', body: JSON.stringify(body) })
    } catch {
      if (!audio) return
      // Si el audio no se aceptó, la sesión se cierra igualmente sin él
      try {
        await api(`/api/chat/sessions/${sessionId}?action=finish`, {
          method: 'POST',
          body: JSON.stringify({ duration_seconds: duration, status }),
        })
      } catch {
        // Si falla, el servidor la cerrará como interrumpida a los 10 min (SPEC-006 §3)
      }
    }
  }

  async function releaseAudio() {
    analysers.value = null
    mic?.stop()
    player?.stop()
    mic = null
    player = null
    if (context && context.state !== 'closed') await context.close().catch(() => {})
    context = null
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
    transcriptSync = null
    nextEntryId = 0
  }

  return {
    state,
    savingStep,
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
