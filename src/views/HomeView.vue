<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
</script>

<template>
  <!-- La interfaz de voz llega en la Fase 2 (SPEC-002, SPEC-003 §3) -->
  <section class="card" aria-labelledby="home-title">
    <h1 id="home-title">Hola{{ auth.profile?.display_name ? `, ${auth.profile.display_name}` : '' }}</h1>
    <p>Tu cuenta está aprobada. La conversación por voz estará disponible próximamente.</p>
  </section>
</template>
