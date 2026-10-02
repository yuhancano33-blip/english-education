<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

/**
 * Animación reactiva a la voz (SPEC-003 §3): dos halos con colores distintos
 * para el usuario y el agente. Con prefers-reduced-motion se muestra un
 * indicador estático de quién habla (SPEC-003 §7).
 */
const props = defineProps<{
  input: AnalyserNode | null
  output: AnalyserNode | null
  muted: boolean
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const speaker = ref<'user' | 'assistant' | null>(null)

const SPEAKING_THRESHOLD = 0.04
let frame = 0
let interval: ReturnType<typeof setInterval> | null = null
let userLevel = 0
let agentLevel = 0
const samples = new Uint8Array(512)

function level(analyser: AnalyserNode | null): number {
  if (!analyser) return 0
  analyser.getByteTimeDomainData(samples)
  let sum = 0
  for (let i = 0; i < analyser.fftSize; i++) {
    const v = (samples[i] - 128) / 128
    sum += v * v
  }
  return Math.sqrt(sum / analyser.fftSize)
}

function sampleLevels() {
  // Suavizado para que la animación sea fluida
  userLevel = userLevel * 0.7 + (props.muted ? 0 : level(props.input)) * 0.3
  agentLevel = agentLevel * 0.7 + level(props.output) * 0.3
  speaker.value =
    agentLevel > SPEAKING_THRESHOLD && agentLevel >= userLevel
      ? 'assistant'
      : userLevel > SPEAKING_THRESHOLD
        ? 'user'
        : null
}

function draw() {
  const el = canvas.value
  const ctx = el?.getContext('2d')
  if (!el || !ctx) return

  const dpr = window.devicePixelRatio || 1
  const size = el.clientWidth
  if (el.width !== size * dpr) {
    el.width = size * dpr
    el.height = size * dpr
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, size, size)

  sampleLevels()
  const style = getComputedStyle(el)
  const center = size / 2
  const base = size * 0.22

  const halo = (color: string, amount: number, scale: number) => {
    const radius = base * scale + Math.min(1, amount * 6) * size * 0.18
    const gradient = ctx.createRadialGradient(center, center, base * 0.3, center, center, radius)
    gradient.addColorStop(0, color)
    gradient.addColorStop(1, 'transparent')
    ctx.globalAlpha = props.muted ? 0.35 : 0.85
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(center, center, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  halo(style.getPropertyValue('--voice-agent').trim(), agentLevel, 1.15)
  halo(style.getPropertyValue('--voice-user').trim(), userLevel, 0.9)
  ctx.globalAlpha = 1

  frame = requestAnimationFrame(draw)
}

onMounted(() => {
  if (reducedMotion) {
    interval = setInterval(sampleLevels, 300)
  } else {
    frame = requestAnimationFrame(draw)
  }
})

onUnmounted(() => {
  cancelAnimationFrame(frame)
  if (interval) clearInterval(interval)
})
</script>

<template>
  <div class="visualizer" :class="{ muted }">
    <canvas v-if="!reducedMotion" ref="canvas" class="visualizer-canvas" aria-hidden="true" />
    <div v-else class="visualizer-static" :data-speaker="speaker ?? 'none'" aria-hidden="true" />
    <p class="visually-hidden" aria-live="polite">
      {{ muted ? 'Micrófono silenciado' : speaker === 'assistant' ? 'El agente está hablando' : '' }}
    </p>
  </div>
</template>
