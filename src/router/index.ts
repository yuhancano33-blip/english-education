import { createRouter, createWebHistory } from 'vue-router'
import { devSkipAccessCheck } from '@/lib/devAccess'
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
      path: '/error',
      name: 'profile-error',
      component: () => import('@/views/ProfileErrorView.vue'),
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

  const accessScreens = ['waiting-room', 'profile-error']

  // Solo desarrollo local: se trata al usuario como aprobado (ver src/lib/devAccess.ts)
  if (devSkipAccessCheck) {
    if (to.meta.guestOnly || accessScreens.includes(String(to.name))) return { name: 'home' }
    if (to.meta.requiresAdmin && !auth.isAdmin) return { name: 'home' }
    return true
  }

  // Sin perfil = no se pudo cargar (/api/me falló). Es un error, nunca "pending".
  if (!auth.profile) {
    return to.name === 'profile-error' ? true : { name: 'profile-error' }
  }

  if (!auth.isApproved) {
    return to.name === 'waiting-room' ? true : { name: 'waiting-room' }
  }

  if (to.meta.guestOnly || accessScreens.includes(String(to.name))) return { name: 'home' }
  if (to.meta.requiresAdmin && !auth.isAdmin) return { name: 'home' }
  return true
})
