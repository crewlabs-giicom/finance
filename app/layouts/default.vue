<script setup lang="ts">
const { user, clear } = useUserSession()
const route = useRoute()

const navItems = [
  { to: '/rekap-saldo', icon: '📗', label: 'Rekap Saldo' },
  { to: '/rincian-bank', icon: '🏦', label: 'Rincian Bank' },
  { to: '/master-data', icon: '🗂️', label: 'Master Data' }
]

async function onLogout() {
  await clear()
  await navigateTo('/login')
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="sidebar-title">Finance System</div>
      <div class="sidebar-sub">Online — v2</div>
      <NuxtLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="nav-item"
        :class="{ active: route.path === item.to }"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        <span>{{ item.label }}</span>
      </NuxtLink>
      <div class="sidebar-footer">
        <div style="color:#fff;font-weight:600;">{{ user?.name }}</div>
        <div style="margin-bottom:10px;">{{ user?.email }}</div>
        <button class="btn secondary" style="width:100%;" @click="onLogout">Keluar</button>
      </div>
    </aside>
    <main class="main">
      <slot />
    </main>
  </div>
</template>
