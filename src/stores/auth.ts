import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const profile = ref<Profile | null>(null)
  const profileError = ref<string | null>(null)

  const isAdmin = computed(() => profile.value?.role === 'admin')
  const isApproved = computed(() => profile.value?.status === 'approved')

  let initPromise: Promise<void> | null = null

  /** Carga la sesión una sola vez y escucha cambios de autenticación. */
  function init() {
    initPromise ??= (async () => {
      const { data } = await supabase.auth.getSession()
      session.value = data.session
      if (session.value) await fetchProfile()

      supabase.auth.onAuthStateChange((_event, newSession) => {
        const userChanged = newSession?.user.id !== session.value?.user.id
        session.value = newSession
        if (!newSession) {
          profile.value = null
        } else if (userChanged) {
          void fetchProfile()
        }
      })
    })()
    return initPromise
  }

  /** Rol y estado vienen del backend (users_profile), nunca de user_metadata. */
  async function fetchProfile() {
    try {
      profile.value = await api<Profile>('/api/me')
      profileError.value = null
    } catch (err) {
      profile.value = null
      profileError.value = err instanceof Error ? err.message : 'No se pudo cargar el perfil'
    }
  }

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    session.value = data.session
    await fetchProfile()
  }

  /** Devuelve true si Supabase exige confirmar el email antes de iniciar sesión. */
  async function signUp(email: string, password: string): Promise<boolean> {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    session.value = data.session
    if (data.session) await fetchProfile()
    return !data.session
  }

  async function signOut() {
    await supabase.auth.signOut()
    session.value = null
    profile.value = null
  }

  return {
    session,
    profile,
    profileError,
    isAdmin,
    isApproved,
    init,
    fetchProfile,
    signIn,
    signUp,
    signOut,
  }
})
