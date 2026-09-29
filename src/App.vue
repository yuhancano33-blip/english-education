<script setup lang="ts">
import { watch } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'
import { useAccessRequestsStore } from '@/stores/accessRequests'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const requests = useAccessRequestsStore()
const router = useRouter()

// Los admins reciben notificaciones in-app mientras tengan la app abierta (SPEC-004 §2)
watch(
  () => auth.isAdmin,
  (isAdmin) => {
    if (isAdmin) {
      void requests.load()
      requests.subscribe()
    } else {
      void requests.unsubscribe()
    }
  },
  { immediate: true },
)

async function signOut() {
  await auth.signOut()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <header v-if="auth.session" class="app-header">
    <RouterLink to="/" class="brand">English Education</RouterLink>
    <nav aria-label="Principal" class="nav">
      <RouterLink
        v-if="auth.isAdmin"
        to="/admin"
        class="nav-link"
        :aria-label="`Solicitudes de acceso: ${requests.pendingCount} pendientes`"
      >
        Solicitudes
        <span v-if="requests.pendingCount > 0" class="badge" aria-hidden="true">
          {{ requests.pendingCount }}
        </span>
      </RouterLink>
      <button type="button" class="btn btn-ghost" @click="signOut">Cerrar sesión</button>
    </nav>
  </header>

  <main class="app-main">
    <RouterView />
  </main>

  <div class="toast-region" role="status" aria-live="polite">
    <div v-if="requests.notice" class="toast">
      <span>{{ requests.notice }}</span>
      <RouterLink to="/admin" class="toast-link" @click="requests.notice = null">Ver</RouterLink>
      <button
        type="button"
        class="btn btn-ghost"
        aria-label="Cerrar notificación"
        @click="requests.notice = null"
      >
        ×
      </button>
    </div>
  </div>
</template>
