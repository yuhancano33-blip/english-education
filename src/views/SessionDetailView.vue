<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api, ApiError } from '@/lib/api'
import { formatDuration, MODE_LABELS, sessionTitle } from '@/lib/sessionFormat'
import type { SessionSummary, SessionTurn } from '@/types'

/** Detalle de una sesión: audio y transcripción (SPEC-003 §5). El resumen llega en la Fase 4. */
const route = useRoute()

const session = ref<SessionSummary | null>(null)
const turns = ref<SessionTurn[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const audio = ref<HTMLAudioElement | null>(null)
const audioUrl = ref<string | null>(null)
const audioError = ref<string | null>(null)
const speed = ref(1)
const speeds = [0.75, 1, 1.25]

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'full', timeStyle: 'short' })

async function load(id: string) {
  loading.value = true
  error.value = null
  audioUrl.value = null
  audioError.value = null
  renewedUrl = false
  try {
    const data = await api<{ session: SessionSummary; turns: SessionTurn[] }>(`/api/chat/sessions/${id}`)
    session.value = data.session
    turns.value = data.turns
    if (data.session.has_audio) await loadAudioUrl()
  } catch (err) {
    session.value = null
    error.value =
      err instanceof ApiError && err.status === 404
        ? 'Esta conversación no existe o fue eliminada.'
        : err instanceof Error
          ? err.message
          : 'No se pudo cargar la conversación'
  } finally {
    loading.value = false
  }
}

/** La URL firmada caduca a los pocos minutos; se pide otra si hace falta. */
async function loadAudioUrl() {
  if (!session.value) return
  try {
    const data = await api<{ url: string }>(`/api/chat/sessions/${session.value.id}/audio`)
    audioUrl.value = data.url
    audioError.value = null
  } catch {
    audioError.value = 'No se pudo cargar el audio.'
  }
}

let renewedUrl = false
async function onAudioError() {
  // Un solo intento de renovar la URL; si vuelve a fallar se muestra el error
  if (renewedUrl) {
    audioError.value = 'No se pudo reproducir el audio.'
    return
  }
  renewedUrl = true
  const position = audio.value?.currentTime ?? 0
  await loadAudioUrl()
  if (audio.value && audioUrl.value) {
    audio.value.currentTime = position
  }
}

function setSpeed(value: number) {
  speed.value = value
  if (audio.value) audio.value.playbackRate = value
}

watch(
  () => route.params.id,
  (id) => {
    if (typeof id === 'string') void load(id)
  },
  { immediate: true },
)
</script>

<template>
  <section class="session-detail" aria-labelledby="session-title">
    <p v-if="loading" class="muted" role="status">Cargando…</p>
    <p v-else-if="error" class="alert alert-error" role="alert">{{ error }}</p>

    <template v-else-if="session">
      <header class="session-header">
        <h1 id="session-title">{{ sessionTitle(session) }}</h1>
        <p class="muted">
          {{ MODE_LABELS[session.mode] }} · {{ formatDuration(session.duration_seconds) }} ·
          {{ dateFormat.format(new Date(session.started_at)) }}
          <template v-if="session.status === 'interrupted'"> · Interrumpida</template>
        </p>
      </header>

      <div class="card audio-card">
        <h2 class="section-title">Audio</h2>
        <template v-if="session.has_audio">
          <p v-if="audioError" class="alert alert-error" role="alert">
            {{ audioError }}
            <button type="button" class="btn btn-ghost" @click="loadAudioUrl()">Reintentar</button>
          </p>
          <audio
            v-if="audioUrl"
            ref="audio"
            class="audio-player"
            :src="audioUrl"
            controls
            preload="metadata"
            @error="onAudioError"
            @loadedmetadata="setSpeed(speed)"
          />
          <div class="speed-picker" role="group" aria-label="Velocidad de reproducción">
            <button
              v-for="s in speeds"
              :key="s"
              type="button"
              class="btn btn-ghost"
              :class="{ active: speed === s }"
              :aria-pressed="speed === s"
              @click="setSpeed(s)"
            >
              {{ String(s).replace('.', ',') }}x
            </button>
          </div>
        </template>
        <p v-else-if="route.query.audio === 'fallo'" class="alert alert-error" role="alert">
          No se pudo subir el audio de esta conversación. La transcripción sí se guardó.
        </p>
        <p v-else class="muted">Esta conversación no tiene audio guardado.</p>
      </div>

      <div class="card">
        <h2 class="section-title">Transcripción</h2>
        <p v-if="turns.length === 0" class="muted">No hay transcripción para esta conversación.</p>
        <ol v-else class="chat">
          <li v-for="turn in turns" :key="turn.turn_index" :class="['chat-bubble', turn.sender]">
            <span class="visually-hidden">{{ turn.sender === 'user' ? 'Tú:' : 'Agente:' }}</span>
            {{ turn.content }}
          </li>
        </ol>
      </div>
    </template>
  </section>
</template>
