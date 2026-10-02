<script setup lang="ts">
import { computed } from 'vue'

/** Cuenta regresiva desde 7:00; cambia de color en el último minuto (SPEC-003 §3). */
const props = defineProps<{ remaining: number }>()

const label = computed(() => {
  const minutes = Math.floor(props.remaining / 60)
  const seconds = String(props.remaining % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
})
</script>

<template>
  <div
    class="session-timer"
    :class="{ 'last-minute': remaining <= 60 }"
    role="timer"
    :aria-label="`Tiempo restante ${label}`"
  >
    {{ label }}
  </div>
</template>
