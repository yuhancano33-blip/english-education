<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { formatDuration, MODE_LABELS, sessionTitle } from '@/lib/sessionFormat'
import { useHistoryStore } from '@/stores/history'
import type { SessionSummary } from '@/types'

/**
 * Historial de sesiones estilo Gemini (SPEC-003 §2): agrupado por fecha, con
 * renombrar y eliminar. En móvil es un panel superpuesto.
 */
defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const history = useHistoryStore()
const route = useRoute()
const router = useRouter()

const editingId = ref<string | null>(null)
const draftTitle = ref('')
const actionError = ref<string | null>(null)
const renameInput = ref<HTMLInputElement[]>([])

onMounted(() => {
  if (!history.loaded) void history.load()
})

function newConversation() {
  emit('close')
  void router.push({ name: 'home' })
}

async function startRename(session: SessionSummary) {
  editingId.value = session.id
  draftTitle.value = sessionTitle(session)
  await nextTick()
  renameInput.value[0]?.select()
}

async function saveRename(session: SessionSummary) {
  const title = draftTitle.value.trim()
  editingId.value = null
  if (!title || title === sessionTitle(session)) return
  try {
    await history.rename(session.id, title)
    actionError.value = null
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : 'No se pudo renombrar'
  }
}

async function remove(session: SessionSummary) {
  const ok = window.confirm(
    `¿Eliminar "${sessionTitle(session)}"? Se borrarán también su transcripción y su audio. Esta acción no se puede deshacer.`,
  )
  if (!ok) return
  try {
    await history.remove(session.id)
    actionError.value = null
    if (route.params.id === session.id) await router.replace({ name: 'home' })
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : 'No se pudo eliminar'
  }
}
</script>

<template>
  <div v-if="open" class="sidebar-backdrop" aria-hidden="true" @click="emit('close')" />
  <aside id="app-sidebar" class="sidebar" :class="{ open }" aria-label="Historial de conversaciones">
    <button type="button" class="btn btn-primary sidebar-new" @click="newConversation">
      + Nueva conversación
    </button>

    <p v-if="actionError" class="alert alert-error" role="alert">{{ actionError }}</p>
    <p v-if="history.error" class="alert alert-error" role="alert">
      {{ history.error }}
      <button type="button" class="btn btn-ghost" @click="history.load()">Reintentar</button>
    </p>

    <p v-if="history.loading && !history.loaded" class="muted">Cargando…</p>
    <p v-else-if="history.loaded && history.sessions.length === 0" class="muted">
      Aún no tienes conversaciones.
    </p>

    <nav v-for="group in history.groups" :key="group.label" class="sidebar-group" :aria-label="group.label">
      <h2 class="sidebar-group-title">{{ group.label }}</h2>
      <ul class="sidebar-list">
        <li v-for="session in group.sessions" :key="session.id" class="sidebar-item">
          <form v-if="editingId === session.id" class="sidebar-rename" @submit.prevent="saveRename(session)">
            <label class="visually-hidden" :for="`rename-${session.id}`">Nuevo nombre</label>
            <input
              :id="`rename-${session.id}`"
              ref="renameInput"
              v-model="draftTitle"
              maxlength="120"
              @keydown.esc="editingId = null"
              @blur="saveRename(session)"
            />
          </form>
          <template v-else>
            <RouterLink
              :to="{ name: 'session-detail', params: { id: session.id } }"
              class="sidebar-link"
              active-class="active"
              @click="emit('close')"
            >
              <span class="sidebar-link-title">{{ sessionTitle(session) }}</span>
              <span class="sidebar-link-meta">
                {{ MODE_LABELS[session.mode] }} · {{ formatDuration(session.duration_seconds) }}
                <template v-if="session.status === 'interrupted'"> · interrumpida</template>
              </span>
            </RouterLink>
            <div class="sidebar-actions">
              <button
                type="button"
                class="icon-button"
                :aria-label="`Renombrar ${sessionTitle(session)}`"
                title="Renombrar"
                @click="startRename(session)"
              >
                ✎
              </button>
              <button
                type="button"
                class="icon-button"
                :aria-label="`Eliminar ${sessionTitle(session)}`"
                title="Eliminar"
                @click="remove(session)"
              >
                🗑
              </button>
            </div>
          </template>
        </li>
      </ul>
    </nav>

    <button
      v-if="history.nextCursor"
      type="button"
      class="btn btn-ghost"
      :disabled="history.loading"
      @click="history.loadMore()"
    >
      Ver más
    </button>
  </aside>
</template>
