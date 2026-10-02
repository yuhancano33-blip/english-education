<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { TranscriptEntry } from '@/stores/voiceSession'

/** Transcripción en vivo, que sirve también de subtítulos (SPEC-003 §3 y §7). */
const props = defineProps<{ entries: TranscriptEntry[] }>()

const visible = ref(true)
const list = ref<HTMLElement | null>(null)

watch(
  () => props.entries.map((e) => e.text.length).join(),
  async () => {
    await nextTick()
    list.value?.scrollTo({ top: list.value.scrollHeight })
  },
)
</script>

<template>
  <section class="transcript" aria-label="Transcripción en vivo">
    <button
      type="button"
      class="btn btn-ghost transcript-toggle"
      :aria-expanded="visible"
      aria-controls="live-transcript"
      @click="visible = !visible"
    >
      {{ visible ? 'Ocultar transcripción' : 'Mostrar transcripción' }}
    </button>
    <ol v-show="visible" id="live-transcript" ref="list" class="transcript-list">
      <li v-if="entries.length === 0" class="muted">Empieza a hablar cuando quieras…</li>
      <li v-for="entry in entries" :key="entry.id" :class="['transcript-entry', entry.sender]">
        <span class="transcript-sender">{{ entry.sender === 'user' ? 'Tú' : 'Agente' }}</span>
        {{ entry.text }}
      </li>
    </ol>
  </section>
</template>
