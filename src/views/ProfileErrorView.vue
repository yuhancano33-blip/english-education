<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/** No se pudo cargar el perfil (/api/me). Nunca se interpreta como pending. */
const auth = useAuthStore()
const router = useRouter()
const retrying = ref(false)

async function retry() {
  retrying.value = true
  await auth.fetchProfile()
  retrying.value = false
  // El router decide de nuevo la pantalla según el perfil cargado
  if (auth.profile) await router.replace('/')
}

async function signOut() {
  await auth.signOut()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <section class="card waiting" aria-labelledby="profile-error-title">
    <h1 id="profile-error-title">No pudimos cargar tu cuenta</h1>
    <p class="alert alert-error" role="alert">
      {{ auth.profileError ?? 'Ocurrió un error al cargar tu perfil.' }}
    </p>
    <div class="request-actions">
      <button type="button" class="btn btn-primary" :disabled="retrying" @click="retry">
        {{ retrying ? 'Reintentando…' : 'Reintentar' }}
      </button>
      <button type="button" class="btn btn-ghost" @click="signOut">Cerrar sesión</button>
    </div>
  </section>
</template>
