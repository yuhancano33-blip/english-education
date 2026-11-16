<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import { devSkipAccessCheck } from '@/lib/devAccess'
import { useAccessRequestsStore } from '@/stores/accessRequests'
import { useAuthStore } from '@/stores/auth'
import { useHistoryStore } from '@/stores/history'

const auth = useAuthStore()
const requests = useAccessRequestsStore()
const history = useHistoryStore()
const route = useRoute()
const router = useRouter()

const sidebarOpen = ref(false)
// El historial solo existe para usuarios aprobados (SPEC-004 §3)
const showSidebar = computed(() => !!auth.session && auth.isApproved && !!route.meta.requiresApproved)

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
  history.clear()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <div v-if="devSkipAccessCheck" class="dev-banner" role="status">
    Modo desarrollo: control de acceso desactivado
  </div>

  <header v-if="auth.session" class="app-header">
    <div class="header-start">
      <button
        v-if="showSidebar"
        type="button"
        class="icon-button menu-button"
        aria-controls="app-sidebar"
        :aria-expanded="sidebarOpen"
        aria-label="Abrir historial"
        @click="sidebarOpen = !sidebarOpen"
      >
        ☰
      </button>
      <RouterLink to="/" class="brand">English Education</RouterLink>
    </div>
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
      <RouterLink v-if="auth.profile" to="/cuenta" class="nav-link">Mi cuenta</RouterLink>
      <button type="button" class="btn btn-ghost" @click="signOut">Cerrar sesión</button>
    </nav>
  </header>

  <div class="app-body" :class="{ 'with-sidebar': showSidebar }">
    <AppSidebar v-if="showSidebar" :open="sidebarOpen" @close="sidebarOpen = false" />
    <main class="app-main">
      <RouterView />
    </main>
  </div>

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
