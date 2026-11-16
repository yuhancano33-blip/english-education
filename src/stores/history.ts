import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/lib/api'
import type { SessionSummary } from '@/types'

interface SessionPage {
  sessions: SessionSummary[]
  nextCursor: string | null
}

export interface SessionGroup {
  label: string
  sessions: SessionSummary[]
}

/** Historial del sidebar (SPEC-003 §2). */
export const useHistoryStore = defineStore('history', () => {
  const sessions = ref<SessionSummary[]>([])
  const nextCursor = ref<string | null>(null)
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<string | null>(null)

  /** Agrupadas en Hoy, Últimos 7 días y Anteriores. */
  const groups = computed<SessionGroup[]>(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const weekAgo = new Date(startOfToday)
    weekAgo.setDate(weekAgo.getDate() - 7)

    const today: SessionSummary[] = []
    const week: SessionSummary[] = []
    const older: SessionSummary[] = []
    for (const s of sessions.value) {
      const date = new Date(s.started_at)
      if (date >= startOfToday) today.push(s)
      else if (date >= weekAgo) week.push(s)
      else older.push(s)
    }
    return [
      { label: 'Hoy', sessions: today },
      { label: 'Últimos 7 días', sessions: week },
      { label: 'Anteriores', sessions: older },
    ].filter((g) => g.sessions.length > 0)
  })

  async function load() {
    loading.value = true
    try {
      const page = await api<SessionPage>('/api/chat/sessions')
      sessions.value = page.sessions
      nextCursor.value = page.nextCursor
      error.value = null
      loaded.value = true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'No se pudo cargar el historial'
    } finally {
      loading.value = false
    }
  }

  async function loadMore() {
    if (!nextCursor.value || loading.value) return
    loading.value = true
    try {
      const page = await api<SessionPage>(
        `/api/chat/sessions?before=${encodeURIComponent(nextCursor.value)}`,
      )
      sessions.value.push(...page.sessions)
      nextCursor.value = page.nextCursor
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'No se pudo cargar el historial'
    } finally {
      loading.value = false
    }
  }

  async function rename(id: string, title: string) {
    const { title: saved } = await api<{ id: string; title: string }>(`/api/chat/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    })
    const item = sessions.value.find((s) => s.id === id)
    if (item) item.title = saved
  }

  async function remove(id: string) {
    await api(`/api/chat/sessions/${id}`, { method: 'DELETE' })
    sessions.value = sessions.value.filter((s) => s.id !== id)
  }

  function clear() {
    sessions.value = []
    nextCursor.value = null
    loaded.value = false
  }

  return { sessions, nextCursor, loading, loaded, error, groups, load, loadMore, rename, remove, clear }
})
