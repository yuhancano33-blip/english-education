<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import LiveTranscript from '@/components/LiveTranscript.vue'
import SessionTimer from '@/components/SessionTimer.vue'
import VoiceVisualizer from '@/components/VoiceVisualizer.vue'
import { useAuthStore } from '@/stores/auth'
import { useHistoryStore } from '@/stores/history'
import { useVoiceSessionStore } from '@/stores/voiceSession'
import type { SessionMode } from '@/types'

/** Interfaz de voz estilo Gemini Live (SPEC-003 §3 y §4). */
const voice = useVoiceSessionStore()
const auth = useAuthStore()
const history = useHistoryStore()
const router = useRouter()

const modes: { value: SessionMode; label: string; hint: string }[] = [
  { value: 'tutor', label: 'Tutor de inglés', hint: 'Corrige los errores importantes' },
  { value: 'free', label: 'Conversación libre', hint: 'Practica la fluidez sin correcciones' },
]

const savingLabels = {
  transcript: 'Guardando la transcripción…',
  audio: 'Subiendo el audio…',
  closing: 'Cerrando la sesión…',
} as const

// Consentimiento de grabación antes de la primera sesión (SPEC-006 §7)
const needsConsent = computed(() => !!auth.profile && !auth.profile.recording_consent_at)
const accepting = ref(false)
const consentError = ref<string | null>(null)

async function acceptConsent() {
  accepting.value = true
  consentError.value = null
  try {
    await auth.acceptRecording()
  } catch (err) {
    consentError.value = err instanceof Error ? err.message : 'No se pudo guardar tu respuesta'
  } finally {
    accepting.value = false
  }
}

// Al terminar de guardar: actualizar el historial y abrir el detalle (SPEC-003 §3)
watch(
  () => voice.state,
  (state, previous) => {
    if (previous !== 'saving' || !voice.lastResult) return
    void history.load()
    if (state === 'idle') {
      const { sessionId, audioSaved } = voice.lastResult
      void router.push({
        name: 'session-detail',
        params: { id: sessionId },
        // Avisar si la subida del audio falló (SPEC-002 §5)
        query: audioSaved ? {} : { audio: 'fallo' },
      })
    }
  },
)

// Si el usuario cierra la pestaña o sale de la pantalla, la sesión queda interrumpida
function onPageHide() {
  if (voice.inSession) void voice.end('interrupted')
}
onMounted(() => window.addEventListener('pagehide', onPageHide))
onBeforeUnmount(() => {
  window.removeEventListener('pagehide', onPageHide)
  onPageHide()
})
</script>

<template>
  <section class="voice" aria-labelledby="voice-title">
    <h1 id="voice-title" class="visually-hidden">Conversación por voz</h1>

    <!-- Consentimiento de grabación (SPEC-006 §7) -->
    <div v-if="needsConsent" class="card consent" role="region" aria-labelledby="consent-title">
      <h2 id="consent-title">Antes de empezar</h2>
      <p>
        Tus conversaciones se graban (audio y transcripción) y se guardan en tu historial para que
        puedas volver a escucharlas. Solo tú puedes acceder a ellas y puedes borrarlas cuando quieras.
        El audio se procesa con Google Gemini para generar las respuestas.
      </p>
      <p v-if="consentError" class="alert alert-error" role="alert">{{ consentError }}</p>
      <button type="button" class="btn btn-primary" :disabled="accepting" @click="acceptConsent">
        {{ accepting ? 'Guardando…' : 'Acepto' }}
      </button>
    </div>

    <!-- Inactivo / Error -->
    <template v-else-if="voice.state === 'idle' || voice.state === 'error'">
      <fieldset class="mode-picker">
        <legend>Modo de conversación</legend>
        <label v-for="m in modes" :key="m.value" class="mode-option" :class="{ active: voice.mode === m.value }">
          <input v-model="voice.mode" type="radio" name="mode" :value="m.value" />
          <span class="mode-label">{{ m.label }}</span>
          <span class="muted">{{ m.hint }}</span>
        </label>
      </fieldset>

      <div v-if="voice.error" class="alert alert-error" role="alert">
        <p>{{ voice.error.message }}</p>
        <p v-if="voice.lastResult">
          <RouterLink :to="{ name: 'session-detail', params: { id: voice.lastResult.sessionId } }">
            Ver la conversación guardada
          </RouterLink>
        </p>
        <button type="button" class="btn btn-ghost" @click="voice.dismissError()">Reintentar</button>
      </div>

      <button
        type="button"
        class="mic-button"
        :disabled="voice.state === 'error'"
        aria-label="Iniciar conversación por voz"
        @click="voice.start()"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" width="40" height="40">
          <path
            fill="currentColor"
            d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"
          />
        </svg>
      </button>
      <p class="muted center">
        Pulsa el micrófono para empezar. Cada sesión dura como máximo 7 minutos.<br />
        La conversación se graba y se guarda en tu historial.
      </p>
    </template>

    <!-- Conectando -->
    <div v-else-if="voice.state === 'connecting'" class="center" role="status">
      <div class="spinner" aria-hidden="true" />
      <p>Conectando…</p>
    </div>

    <!-- En conversación / Silenciado -->
    <template v-else-if="voice.inSession">
      <SessionTimer :remaining="voice.remaining" />
      <p class="recording-indicator" role="status">
        <span class="recording-dot" aria-hidden="true" /> Grabando
      </p>
      <p v-if="voice.warning" class="alert alert-info center" role="status">Queda menos de 1 minuto</p>

      <VoiceVisualizer
        :input="voice.analysers?.input ?? null"
        :output="voice.analysers?.output ?? null"
        :muted="voice.state === 'muted'"
      />

      <div class="voice-controls">
        <button
          type="button"
          class="btn btn-ghost"
          :aria-pressed="voice.state === 'muted'"
          @click="voice.toggleMute()"
        >
          {{ voice.state === 'muted' ? 'Reactivar micrófono' : 'Silenciar' }}
        </button>
        <button type="button" class="btn btn-danger" @click="voice.end('completed')">
          Finalizar
        </button>
      </div>

      <LiveTranscript :entries="voice.transcript" />
    </template>

    <!-- Guardando -->
    <div v-else-if="voice.state === 'saving'" class="center" role="status">
      <div class="spinner" aria-hidden="true" />
      <p>{{ savingLabels[voice.savingStep] }}</p>
    </div>
  </section>
</template>
