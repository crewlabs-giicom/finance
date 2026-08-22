<script setup lang="ts">
const { user, clear } = useUserSession()
const route = useRoute()

// Urutan menunya mengikuti sidebar aplikasi HTML lama.
const navItems = [
  { to: '/rekap-saldo', icon: '📊', label: 'Rekap Saldo' },
  { to: '/rincian-mp', icon: '🧾', label: 'Rincian MP' },
  { to: '/rincian-bank', icon: '🏦', label: 'Rincian Bank' },
  { to: '/list-pajak', icon: '🧮', label: 'List Pajak' },
  { to: '/entertainment', icon: '🍽️', label: 'Entertainment' },
  { to: '/aktiva-pasiva', icon: '⚖️', label: 'Aktiva - Pasiva' },
  { to: '/daftar-norminatif', icon: '📑', label: 'Daftar Norminatif' },
  { to: '/tagihan-ekspedisi', icon: '🚚', label: 'Tagihan Ekspedisi' },
  { to: '/aset', icon: '🏢', label: 'Aset' },
  { to: '/master-data', icon: '🗂️', label: 'Master Data' }
]

const collapsed = ref(false)

async function onLogout() {
  await clear()
  await navigateTo('/login')
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar" :class="{ collapsed }">
      <button
        class="sidebar-toggle"
        :title="collapsed ? 'Lebarkan sidebar' : 'Sembunyikan sidebar'"
        @click="collapsed = !collapsed"
      >{{ collapsed ? '▶' : '◀' }}</button>

      <div class="sidebar-title">Finance System</div>
      <div class="sidebar-sub">Online — v2</div>

      <NuxtLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="nav-item"
        :class="{ active: route.path === item.to }"
        :title="item.label"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        <span class="nav-label">{{ item.label }}</span>
      </NuxtLink>

      <div class="sidebar-footer">
        <div class="sidebar-user">{{ user?.name }}</div>
        <div class="nav-label">{{ user?.email }}</div>
        <button class="btn secondary sidebar-logout" @click="onLogout">Keluar</button>
      </div>
    </aside>

    <main class="main">
      <slot />
    </main>
  </div>
</template>
