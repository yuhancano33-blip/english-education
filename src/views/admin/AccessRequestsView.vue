<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApiError } from '@/lib/api'
import { useAccessRequestsStore } from '@/stores/accessRequests'
import type { AccessRequest } from '@/types'

const store = useAccessRequestsStore()
const tab = ref<'pending' | 'resolved'>('pending')
const busyId = ref<string | null>(null)
const message = ref<{ kind: 'error' | 'info'; text: string } | null>(null)

const visible = computed(() =>
  store.requests.filter((r) =>
    tab.value === 'pending' ? r.status === 'pending' : r.status !== 'pending',
  ),
)

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' })
const formatDate = (iso: string) => dateFormat.format(new Date(iso))
const statusLabel = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' } as const

onMounted(() => {
  store.notice = null
  void store.load()
})

async function resolve(request: AccessRequest, decision: 'approve' | 'reject') {
  busyId.value = request.id
  message.value = null
  try {
    await store.resolve(request.id, decision)
    message.value = {
      kind: 'info',
      text: `${request.user?.email ?? 'Solicitud'}: ${decision === 'approve' ? 'aprobada' : 'rechazada'}.`,
    }
  } catch (err) {
    // 409: otro administrador resolvió primero (SPEC-004 §2)
    if (err instanceof ApiError && err.status === 409) {
      message.value = { kind: 'info', text: err.message }
      await store.load()
    } else {
      message.value = {
        kind: 'error',
        text: err instanceof Error ? err.message : 'No se pudo resolver la solicitud',
      }
    }
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <section class="admin" aria-labelledby="admin-title">
    <h1 id="admin-title">Solicitudes de acceso</h1>

    <div class="segmented" role="tablist" aria-label="Filtrar solicitudes">
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'pending'"
        :class="{ active: tab === 'pending' }"
        @click="tab = 'pending'"
      >
        Pendientes ({{ store.pendingCount }})
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'resolved'"
        :class="{ active: tab === 'resolved' }"
        @click="tab = 'resolved'"
      >
        Resueltas
      </button>
    </div>

    <p
      v-if="message"
      :class="['alert', message.kind === 'error' ? 'alert-error' : 'alert-info']"
      :role="message.kind === 'error' ? 'alert' : 'status'"
    >
      {{ message.text }}
    </p>
    <p v-if="store.error" class="alert alert-error" role="alert">{{ store.error }}</p>

    <p v-if="store.loading && store.requests.length === 0" class="muted">Cargando…</p>
    <p v-else-if="visible.length === 0" class="muted">
      {{ tab === 'pending' ? 'No hay solicitudes pendientes.' : 'Aún no hay solicitudes resueltas.' }}
    </p>

    <ul v-else class="request-list">
      <li v-for="request in visible" :key="request.id" class="card request">
        <div class="request-info">
          <strong>{{ request.user?.email ?? 'Usuario eliminado' }}</strong>
          <span class="muted">Solicitada el {{ formatDate(request.created_at) }}</span>
          <span v-if="request.status !== 'pending'" class="muted">
            {{ statusLabel[request.status] }}
            <template v-if="request.resolved_at">el {{ formatDate(request.resolved_at) }}</template>
            <template v-if="request.resolver"> por {{ request.resolver.email }}</template>
          </span>
        </div>
        <div v-if="request.status === 'pending'" class="request-actions">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="busyId === request.id"
            :aria-label="`Aprobar a ${request.user?.email}`"
            @click="resolve(request, 'approve')"
          >
            Aprobar
          </button>
          <button
            type="button"
            class="btn btn-danger"
            :disabled="busyId === request.id"
            :aria-label="`Rechazar a ${request.user?.email}`"
            @click="resolve(request, 'reject')"
          >
            Rechazar
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
