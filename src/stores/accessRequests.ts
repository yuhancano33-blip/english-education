import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { AccessRequest, UserStatus } from '@/types'

/** Solicitudes de acceso y notificaciones in-app para administradores (SPEC-003 §6). */
export const useAccessRequestsStore = defineStore('accessRequests', () => {
  const requests = ref<AccessRequest[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const notice = ref<string | null>(null)

  const pendingCount = computed(() => requests.value.filter((r) => r.status === 'pending').length)

  let channel: RealtimeChannel | null = null

  async function load() {
    loading.value = true
    try {
      const data = await api<{ requests: AccessRequest[] }>('/api/admin/access-requests')
      requests.value = data.requests
      error.value = null
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'No se pudieron cargar las solicitudes'
    } finally {
      loading.value = false
    }
  }

  async function resolve(id: string, decision: 'approve' | 'reject') {
    await api<{ id: string; status: UserStatus }>(
      `/api/admin/access-requests/${id}/resolve`,
      { method: 'POST', body: JSON.stringify({ decision }) },
    )
    await load()
  }

  /** Escucha nuevas solicitudes y resoluciones de otro admin vía Realtime. */
  function subscribe() {
    if (channel) return
    channel = supabase
      .channel('admin-access-requests')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'access_requests' },
        () => {
          notice.value = 'Nueva solicitud de acceso'
          void load()
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'access_requests' },
        () => void load(),
      )
      .subscribe()
  }

  async function unsubscribe() {
    if (channel) await supabase.removeChannel(channel)
    channel = null
    requests.value = []
  }

  return {
    requests,
    loading,
    error,
    notice,
    pendingCount,
    load,
    resolve,
    subscribe,
    unsubscribe,
  }
})
