<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import LiveTranscript from '@/components/LiveTranscript.vue'
import SessionTimer from '@/components/SessionTimer.vue'
import VoiceVisualizer from '@/components/VoiceVisualizer.vue'
import { useVoiceSessionStore } from '@/stores/voiceSession'
import type { SessionMode } from '@/types'

/** Interfaz de voz estilo Gemini Live (SPEC-003 §3 y §4). */
const voice = useVoiceSessionStore()

const modes: { value: SessionMode; label: string; hint: string }[] = [
  { value: 'tutor', label: 'Tutor de inglés', hint: 'Corrige los errores importantes' },
  { value: 'free', label: 'Conversación libre', hint: 'Practica la fluidez sin correcciones' },
]

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

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

    <!-- Inactivo / Error -->
    <template v-if="voice.state === 'idle' || voice.state === 'error'">
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
        <button type="button" class="btn btn-ghost" @click="voice.dismissError()">Reintentar</button>
      </div>

      <p v-else-if="voice.lastResult" class="alert alert-info" role="status">
        Sesión {{ voice.lastResult.status === 'completed' ? 'finalizada' : 'interrumpida' }}
        ({{ formatDuration(voice.lastResult.duration) }}).
      </p>

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
      <p class="muted center">Pulsa el micrófono para empezar. Cada sesión dura como máximo 7 minutos.</p>
    </template>

    <!-- Conectando -->
    <div v-else-if="voice.state === 'connecting'" class="center" role="status">
      <div class="spinner" aria-hidden="true" />
      <p>Conectando…</p>
    </div>

    <!-- En conversación / Silenciado -->
    <template v-else-if="voice.inSession">
      <SessionTimer :remaining="voice.remaining" />
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
      <p>Guardando…</p>
    </div>
  </section>
</template>
