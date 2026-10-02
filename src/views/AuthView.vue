<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { authErrorMessage } from '@/lib/authErrors'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const submitting = ref(false)
const error = ref<string | null>(null)
const info = ref<string | null>(null)

const title = computed(() => (mode.value === 'login' ? 'Iniciar sesión' : 'Crear cuenta'))

function switchMode(next: 'login' | 'register') {
  mode.value = next
  error.value = null
  info.value = null
}

async function submit() {
  submitting.value = true
  error.value = null
  info.value = null
  try {
    if (mode.value === 'login') {
      await auth.signIn(email.value, password.value)
      await router.replace('/')
    } else {
      const needsConfirmation = await auth.signUp(email.value, password.value)
      if (needsConfirmation) {
        switchMode('login')
        info.value = 'Te enviamos un email para confirmar tu cuenta. Después podrás iniciar sesión.'
      } else {
        await router.replace('/')
      }
    }
  } catch (err) {
    error.value = authErrorMessage(err)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="card auth-card" aria-labelledby="auth-title">
    <h1 id="auth-title">{{ title }}</h1>

    <div class="segmented" role="tablist" aria-label="Tipo de acceso">
      <button
        type="button"
        role="tab"
        :aria-selected="mode === 'login'"
        :class="{ active: mode === 'login' }"
        @click="switchMode('login')"
      >
        Entrar
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="mode === 'register'"
        :class="{ active: mode === 'register' }"
        @click="switchMode('register')"
      >
        Registrarse
      </button>
    </div>

    <form class="form" @submit.prevent="submit">
      <label class="field">
        <span>Email</span>
        <input v-model.trim="email" type="email" autocomplete="email" required />
      </label>
      <label class="field">
        <span>Contraseña</span>
        <input
          v-model="password"
          type="password"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          minlength="8"
          required
        />
      </label>

      <p v-if="mode === 'register'" class="muted">
        El acceso es privado: tras registrarte, un administrador revisará tu solicitud.
      </p>

      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
      <p v-if="info" class="alert alert-info" role="status">{{ info }}</p>

      <button type="submit" class="btn btn-primary" :disabled="submitting">
        {{ submitting ? 'Un momento…' : title }}
      </button>
    </form>
  </section>
</template>
