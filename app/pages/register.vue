<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { fetch: refreshSession } = useUserSession()
const name = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function onSubmit() {
  error.value = ''
  loading.value = true
  try {
    await $fetch('/api/auth/register', { method: 'POST', body: { name: name.value, email: email.value, password: password.value } })
    await refreshSession()
    await navigateTo('/rekap-saldo')
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Gagal daftar.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-card">
    <h1>Daftar Akun</h1>
    <p class="sub">Buat akun baru buat akses Finance System.</p>
    <div v-if="error" class="auth-error">{{ error }}</div>
    <form @submit.prevent="onSubmit">
      <div class="field">
        <label>Nama</label>
        <input v-model="name" type="text" required autocomplete="name" />
      </div>
      <div class="field">
        <label>Email</label>
        <input v-model="email" type="email" required autocomplete="email" />
      </div>
      <div class="field">
        <label>Password</label>
        <input v-model="password" type="password" required minlength="6" autocomplete="new-password" />
      </div>
      <button class="btn auth-submit" type="submit" :disabled="loading">
        {{ loading ? 'Memproses...' : 'Daftar' }}
      </button>
    </form>
    <div class="auth-switch">
      Udah punya akun? <NuxtLink to="/login">Masuk di sini</NuxtLink>
    </div>
  </div>
</template>
