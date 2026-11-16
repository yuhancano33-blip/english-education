<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useHistoryStore } from '@/stores/history'

/** Datos de la cuenta y eliminación de todos los datos (SPEC-006 §7). */
const auth = useAuthStore()
const history = useHistoryStore()
const router = useRouter()

const CONFIRM_WORD = 'ELIMINAR'
const confirmText = ref('')
const deleting = ref(false)
const error = ref<string | null>(null)

const canDelete = computed(() => confirmText.value.trim() === CONFIRM_WORD)
const statusLabel = { pending: 'En revisión', approved: 'Aprobada', rejected: 'No aprobada' } as const
const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'long', timeStyle: 'short' })

async function deleteAccount() {
  if (!canDelete.value) return
  deleting.value = true
  error.value = null
  try {
    await api('/api/me', { method: 'DELETE', body: JSON.stringify({ confirm: CONFIRM_WORD }) })
    history.clear()
    await auth.signOut().catch(() => {})
    await router.replace({ name: 'login', query: { cuenta: 'eliminada' } })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'No se pudo eliminar la cuenta'
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <section class="account" aria-labelledby="account-title">
    <h1 id="account-title">Mi cuenta</h1>

    <div v-if="auth.profile" class="card">
      <dl class="account-data">
        <div>
          <dt>Email</dt>
          <dd>{{ auth.profile.email }}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>{{ statusLabel[auth.profile.status] }}{{ auth.isAdmin ? ' · Administrador' : '' }}</dd>
        </div>
        <div v-if="auth.profile.recording_consent_at">
          <dt>Grabación aceptada</dt>
          <dd>{{ dateFormat.format(new Date(auth.profile.recording_consent_at)) }}</dd>
        </div>
      </dl>
    </div>

    <div class="card danger-zone" aria-labelledby="delete-title">
      <h2 id="delete-title" class="section-title">Eliminar mi cuenta</h2>
      <p v-if="auth.isAdmin" class="muted">
        Las cuentas de administrador no se pueden eliminar desde la aplicación.
      </p>
      <form v-else class="form" @submit.prevent="deleteAccount">
        <p>
          Se borrarán para siempre tu cuenta, todas tus conversaciones, sus transcripciones, resúmenes
          y audios. Esta acción no se puede deshacer.
        </p>
        <label class="field">
          <span>Escribe <strong>{{ CONFIRM_WORD }}</strong> para confirmar</span>
          <input v-model="confirmText" type="text" autocomplete="off" spellcheck="false" />
        </label>
        <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
        <button type="submit" class="btn btn-danger" :disabled="!canDelete || deleting">
          {{ deleting ? 'Eliminando…' : 'Eliminar mi cuenta' }}
        </button>
      </form>
    </div>
  </section>
</template>
