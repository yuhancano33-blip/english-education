<script setup lang="ts">
import type { SessionSummaryData } from '@/types'

/** Resumen en tarjetas (SPEC-003 §5): temas, correcciones, vocabulario y consejos. */
defineProps<{ summary: SessionSummaryData }>()
</script>

<template>
  <div class="summary-cards">
    <section class="card" aria-labelledby="summary-topics">
      <h2 id="summary-topics" class="section-title">Temas hablados</h2>
      <p class="summary-text">{{ summary.summary }}</p>
    </section>

    <section class="card" aria-labelledby="summary-corrections">
      <h2 id="summary-corrections" class="section-title">Correcciones</h2>
      <p v-if="summary.corrections.length === 0" class="muted">
        No hubo errores importantes en esta conversación. ¡Bien hecho!
      </p>
      <ul v-else class="correction-list">
        <li v-for="(c, i) in summary.corrections" :key="i" class="correction">
          <p class="correction-pair" lang="en">
            <span class="correction-original"><span class="visually-hidden">Dijiste: </span>{{ c.original }}</span>
            <span class="correction-arrow" aria-hidden="true">→</span>
            <span class="correction-corrected"><span class="visually-hidden">Mejor: </span>{{ c.corrected }}</span>
          </p>
          <p class="muted">{{ c.explanation }}</p>
        </li>
      </ul>
    </section>

    <section class="card" aria-labelledby="summary-vocabulary">
      <h2 id="summary-vocabulary" class="section-title">Vocabulario nuevo</h2>
      <p v-if="summary.vocabulary.length === 0" class="muted">Sin vocabulario destacado.</p>
      <dl v-else class="vocabulary-list">
        <div v-for="(v, i) in summary.vocabulary" :key="i" class="vocabulary-item">
          <dt lang="en">{{ v.term }}</dt>
          <dd>
            {{ v.meaning }}
            <span class="vocabulary-example" lang="en">“{{ v.example }}”</span>
          </dd>
        </div>
      </dl>
    </section>

    <section class="card" aria-labelledby="summary-tips">
      <h2 id="summary-tips" class="section-title">Consejos para la próxima sesión</h2>
      <ul class="tips-list">
        <li v-for="(tip, i) in summary.tips" :key="i">{{ tip }}</li>
      </ul>
    </section>
  </div>
</template>
