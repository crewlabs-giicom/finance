<script setup lang="ts">
type Group = { id: string; nama: string; warna: string | null }
type Account = { id: string; groupId: string | null; bankType: string; namaRek: string; noRek: string; saldo: number }

const groups = ref<Group[]>([])
const accounts = ref<Account[]>([])

const newGroupNama = ref('')
const newAccGroupId = ref('')
const newAccBankType = ref('BCA')
const newAccNamaRek = ref('')
const newAccNoRek = ref('')

async function loadAll() {
  groups.value = await $fetch('/api/master/groups')
  accounts.value = await $fetch('/api/master/accounts')
}
await loadAll()

async function addGroup() {
  if (!newGroupNama.value.trim()) return
  await $fetch('/api/master/groups', { method: 'POST', body: { nama: newGroupNama.value } })
  newGroupNama.value = ''
  await loadAll()
}
async function deleteGroup(id: string) {
  if (!confirm('Hapus grup ini? Rekening yang masih ikut grup ini gak ikut kehapus, cuma jadi Tanpa Grup.')) return
  await $fetch(`/api/master/groups/${id}`, { method: 'DELETE' })
  await loadAll()
}
async function addAccount() {
  if (!newAccNamaRek.value.trim() || !newAccNoRek.value.trim()) return
  await $fetch('/api/master/accounts', {
    method: 'POST',
    body: {
      groupId: newAccGroupId.value || null,
      bankType: newAccBankType.value,
      namaRek: newAccNamaRek.value,
      noRek: newAccNoRek.value
    }
  })
  newAccNamaRek.value = ''
  newAccNoRek.value = ''
  await loadAll()
}
async function deleteAccount(id: string) {
  if (!confirm('Hapus rekening ini?')) return
  await $fetch(`/api/master/accounts/${id}`, { method: 'DELETE' })
  await loadAll()
}
function groupLabel(id: string | null) {
  return groups.value.find(g => g.id === id)?.nama || 'Tanpa Grup'
}
</script>

<template>
  <div>
    <div class="topbar">
      <div>
        <h2>Master Data</h2>
        <p>Kelola Grup PT/rekening dan daftar rekening bank — dipakai bareng di seluruh menu.</p>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>🏢 Grup PT / Rekening</h3></div>
      <div class="toolbar">
        <input v-model="newGroupNama" placeholder="Nama grup (misal: GIM)" @keyup.enter="addGroup" />
        <button class="btn" @click="addGroup">+ Tambah Grup</button>
      </div>
      <div v-if="!groups.length" class="empty-state">Belum ada grup.</div>
      <div v-else style="display:flex;gap:8px;flex-wrap:wrap;">
        <span v-for="g in groups" :key="g.id" class="pill" style="display:flex;align-items:center;gap:6px;">
          {{ g.nama }}
          <span class="row-del" style="font-size:11px;" @click="deleteGroup(g.id)">✕</span>
        </span>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>🏦 Rekening Bank</h3></div>
      <div class="toolbar">
        <select v-model="newAccBankType">
          <option value="BCA">BCA</option>
          <option value="BRI">BRI</option>
          <option value="MANDIRI">Mandiri</option>
          <option value="OTHER">Lainnya</option>
        </select>
        <select v-model="newAccGroupId">
          <option value="">Tanpa Grup</option>
          <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.nama }}</option>
        </select>
        <input v-model="newAccNamaRek" placeholder="Nama rekening" style="width:180px;" />
        <input v-model="newAccNoRek" placeholder="No. rekening" style="width:160px;" @keyup.enter="addAccount" />
        <button class="btn" @click="addAccount">+ Tambah Rekening</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th><th>Bank</th><th>Grup</th><th>Nama Rekening</th><th>No. Rekening</th><th class="num">Saldo</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!accounts.length"><td colspan="6" class="empty-state">Belum ada rekening.</td></tr>
            <tr v-for="a in accounts" :key="a.id">
              <td><span class="row-del" @click="deleteAccount(a.id)">✕</span></td>
              <td><span class="pill">{{ a.bankType }}</span></td>
              <td>{{ groupLabel(a.groupId) }}</td>
              <td>{{ a.namaRek }}</td>
              <td>{{ a.noRek }}</td>
              <td class="num">Rp {{ a.saldo.toLocaleString('id-ID') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
