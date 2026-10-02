import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    guestOnly?: boolean
    requiresAuth?: boolean
    requiresApproved?: boolean
    requiresAdmin?: boolean
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/AuthView.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/espera',
      name: 'waiting-room',
      component: () => import('@/views/WaitingRoomView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
      meta: { requiresAuth: true, requiresApproved: true },
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/admin/AccessRequestsView.vue'),
      meta: { requiresAuth: true, requiresApproved: true, requiresAdmin: true },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

/** Reglas de acceso por estado (SPEC-004 §3). */
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.init()

  if (!auth.session) {
    return to.meta.guestOnly ? true : { name: 'login' }
  }

  // Con sesión pero sin perfil (error al cargarlo): la sala de espera muestra el error
  if (!auth.profile) {
    return to.name === 'waiting-room' ? true : { name: 'waiting-room' }
  }

  if (!auth.isApproved) {
    return to.name === 'waiting-room' ? true : { name: 'waiting-room' }
  }

  if (to.meta.guestOnly || to.name === 'waiting-room') return { name: 'home' }
  if (to.meta.requiresAdmin && !auth.isAdmin) return { name: 'home' }
  return true
})
