<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { fetch: refreshSession } = useUserSession()
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function onSubmit() {
  error.value = ''
  loading.value = true
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { email: email.value, password: password.value } })
    await refreshSession()
    await navigateTo('/rekap-saldo')
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Gagal login.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-card">
    <h1>Masuk</h1>
    <p class="sub">Finance System — akses tim internal.</p>
    <div v-if="error" class="auth-error">{{ error }}</div>
    <form @submit.prevent="onSubmit">
      <div class="field">
        <label>Email</label>
        <input v-model="email" type="email" required autocomplete="email" />
      </div>
      <div class="field">
        <label>Password</label>
        <input v-model="password" type="password" required autocomplete="current-password" />
      </div>
      <button class="btn auth-submit" type="submit" :disabled="loading">
        {{ loading ? 'Memproses...' : 'Masuk' }}
      </button>
    </form>
    <div class="auth-switch">
      Belum punya akun? <NuxtLink to="/register">Daftar di sini</NuxtLink>
    </div>
  </div>
</template>
