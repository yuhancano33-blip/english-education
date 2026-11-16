<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
let channel: RealtimeChannel | null = null

// Escucha cambios del propio perfil y redirige al ser aprobado (SPEC-004 §2)
onMounted(() => {
  const userId = auth.session?.user.id
  if (!userId) return
  channel = supabase
    .channel(`profile-${userId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'users_profile', filter: `id=eq.${userId}` },
      () => void auth.fetchProfile(),
    )
    .subscribe()
})

onUnmounted(() => {
  if (channel) void supabase.removeChannel(channel)
})

watch(
  () => auth.isApproved,
  (approved) => {
    if (approved) void router.replace('/')
  },
)
</script>

<template>
  <section class="card waiting" aria-labelledby="waiting-title">
    <!-- Sin perfil = error de carga, nunca "pending" -->
    <template v-if="!auth.profile">
      <h1 id="waiting-title">No pudimos cargar tu cuenta</h1>
      <p class="alert alert-error" role="alert">
        {{ auth.profileError ?? 'Ocurrió un error al cargar tu perfil.' }}
      </p>
      <button type="button" class="btn btn-primary" @click="auth.fetchProfile()">Reintentar</button>
    </template>

    <template v-else-if="auth.profile.status === 'rejected'">
      <h1 id="waiting-title">Solicitud no aprobada</h1>
      <p>
        Tu solicitud de acceso fue revisada y no fue aprobada. Si crees que es un error,
        contacta con los administradores.
      </p>
    </template>

    <template v-else-if="auth.profile.status === 'pending'">
      <h1 id="waiting-title">Tu solicitud está en revisión</h1>
      <p>
        Un administrador revisará tu acceso pronto. Esta pantalla se actualizará sola
        cuando tu cuenta sea aprobada.
      </p>
      <p class="muted">{{ auth.profile.email }}</p>
    </template>
  </section>
</template>
