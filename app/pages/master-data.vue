<script setup lang="ts">
const api = useApi()
const { load: loadGroups } = useGroups()
const { lockYm, label: lockLabel, refresh: refreshLock, setLock } = usePeriodLock()

type Group = { id: string; nama: string; warna: string | null }
type Account = { id: string; groupId: string | null; bankType: string; namaRek: string; noRek: string; saldoAwal: number | null }
type Npwp = { id: string; noNpwp: string; namaNpwp: string; nik: string | null; alamat: string | null }
type Coa = { id: string; noCoa: string; namaCoa: string }
type Tag = { id: string; nama: string }
type SimpleMaster = { id: string; kind: 'tipe' | 'kategori' | 'div'; value: string }

const groups = ref<Group[]>([])
const accounts = ref<Account[]>([])
const npwps = ref<Npwp[]>([])
const coas = ref<Coa[]>([])
const tags = ref<Tag[]>([])
const asetMaster = ref<SimpleMaster[]>([])

const status = ref<{ type: 'ok' | 'err'; msg: string } | null>(null)

const newGroupNama = ref('')
const newAcc = reactive({ groupId: '', bankType: 'BCA', namaRek: '', noRek: '' })
const newNpwp = reactive({ noNpwp: '', namaNpwp: '', nik: '', alamat: '' })
const newCoa = reactive({ noCoa: '', namaCoa: '' })
const newTag = ref('')
const newAsetMaster = reactive({ tipe: '', kategori: '', div: '' })
const lockInput = ref('')

async function loadAll() {
  ;[groups.value, accounts.value, npwps.value, coas.value, tags.value, asetMaster.value] = await Promise.all([
    api<Group[]>('/api/master/groups'),
    api<Account[]>('/api/master/accounts'),
    api<Npwp[]>('/api/master/npwp'),
    api<Coa[]>('/api/master/coa'),
    api<Tag[]>('/api/master/tags'),
    api<SimpleMaster[]>('/api/master/aset-simple')
  ])
  await loadGroups(true)
}
await Promise.all([loadAll(), refreshLock()])
lockInput.value = lockYm.value || ''

/** Semua form di halaman ini polanya sama: kirim, muat ulang, tampilkan pesan. */
async function run(fn: () => Promise<unknown>, okMsg: string) {
  try {
    await fn()
    await loadAll()
    status.value = { type: 'ok', msg: okMsg }
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal menyimpan.' }
  }
}

const addGroup = () => {
  if (!newGroupNama.value.trim()) return
  return run(async () => {
    await api('/api/master/groups', { method: 'POST', body: { nama: newGroupNama.value.trim() } })
    newGroupNama.value = ''
  }, 'Grup ditambahkan.')
}
const deleteGroup = (id: string) => {
  if (!confirm('Hapus grup ini? Data yang masih ikut grup ini tidak ikut terhapus, hanya jadi Tanpa Grup.')) return
  return run(() => api(`/api/master/groups/${id}`, { method: 'DELETE' }), 'Grup dihapus.')
}

const addAccount = () => {
  if (!newAcc.namaRek.trim() || !newAcc.noRek.trim()) return
  return run(async () => {
    await api('/api/master/accounts', { method: 'POST', body: { ...newAcc, groupId: newAcc.groupId || null } })
    newAcc.namaRek = ''
    newAcc.noRek = ''
  }, 'Rekening ditambahkan.')
}
const deleteAccount = (id: string) => {
  if (!confirm('Hapus rekening ini?')) return
  return run(() => api(`/api/master/accounts/${id}`, { method: 'DELETE' }), 'Rekening dihapus.')
}
const patchAccount = (a: Account, patch: Partial<Account>) =>
  run(() => api(`/api/master/accounts/${a.id}`, { method: 'PATCH', body: patch }), 'Rekening diperbarui.')

const addNpwp = () => {
  if (!newNpwp.noNpwp.trim() || !newNpwp.namaNpwp.trim()) return
  return run(async () => {
    await api('/api/master/npwp', { method: 'POST', body: { ...newNpwp } })
    Object.assign(newNpwp, { noNpwp: '', namaNpwp: '', nik: '', alamat: '' })
  }, 'NPWP ditambahkan.')
}
const patchNpwp = (n: Npwp, patch: Partial<Npwp>) =>
  run(() => api(`/api/master/npwp/${n.id}`, { method: 'PATCH', body: patch }), 'NPWP diperbarui.')
const deleteNpwp = (id: string) => {
  if (!confirm('Hapus NPWP ini?')) return
  return run(() => api(`/api/master/npwp/${id}`, { method: 'DELETE' }), 'NPWP dihapus.')
}

const addCoa = () => {
  if (!newCoa.noCoa.trim() || !newCoa.namaCoa.trim()) return
  return run(async () => {
    await api('/api/master/coa', { method: 'POST', body: { ...newCoa } })
    Object.assign(newCoa, { noCoa: '', namaCoa: '' })
  }, 'COA ditambahkan.')
}
const deleteCoa = (id: string) => {
  if (!confirm('Hapus COA ini?')) return
  return run(() => api(`/api/master/coa/${id}`, { method: 'DELETE' }), 'COA dihapus.')
}

const addTag = () => {
  if (!newTag.value.trim()) return
  return run(async () => {
    await api('/api/master/tags', { method: 'POST', body: { nama: newTag.value.trim() } })
    newTag.value = ''
  }, 'Tag ditambahkan.')
}
const deleteTag = (id: string) => run(() => api(`/api/master/tags/${id}`, { method: 'DELETE' }), 'Tag dihapus.')

const addAsetMaster = (kind: 'tipe' | 'kategori' | 'div') => {
  const value = newAsetMaster[kind].trim()
  if (!value) return
  return run(async () => {
    await api('/api/master/aset-simple', { method: 'POST', body: { kind, value } })
    newAsetMaster[kind] = ''
  }, 'Master aset ditambahkan.')
}
const deleteAsetMaster = (id: string) =>
  run(() => api(`/api/master/aset-simple/${id}`, { method: 'DELETE' }), 'Master aset dihapus.')

const asetOf = (kind: 'tipe' | 'kategori' | 'div') => computed(() => asetMaster.value.filter(m => m.kind === kind))
const tipeList = asetOf('tipe')
const kategoriList = asetOf('kategori')
const divList = asetOf('div')

async function applyLock() {
  try {
    await setLock(lockInput.value || null)
    status.value = {
      type: 'ok',
      msg: lockInput.value ? `Periode dikunci sampai ${lockLabel.value}.` : 'Kunci periode dibuka.'
    }
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal mengubah kunci periode.' }
  }
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
        <p>Grup PT, rekening bank, NPWP, COA, Tag, dan master Aset — dipakai bersama di seluruh menu.</p>
      </div>
    </div>

    <StatusBox :status="status" />

    <div class="panel">
      <div class="panel-head"><h3>🔒 Kunci Periode</h3></div>
      <div class="toolbar">
        <span class="gm-label">Kunci sampai bulan:</span>
        <input v-model="lockInput" type="month" />
        <button class="btn" @click="applyLock">Terapkan</button>
        <button class="btn secondary" @click="lockInput = ''; applyLock()">Buka Kunci</button>
        <span class="pill">{{ lockLabel }}</span>
      </div>
      <p class="hint">
        Data yang tanggalnya di bulan terkunci ke bawah tidak bisa ditambah, diubah, atau dihapus di seluruh menu.
        Aturan ini ditegakkan di server, jadi berlaku untuk semua pengguna.
      </p>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>🏢 Grup PT / Rekening</h3></div>
      <div class="toolbar">
        <input v-model="newGroupNama" placeholder="Nama grup (misal: GIM)" @keyup.enter="addGroup" />
        <button class="btn" @click="addGroup">+ Tambah Grup</button>
      </div>
      <div v-if="!groups.length" class="empty-state">Belum ada grup.</div>
      <div v-else class="chip-row">
        <span v-for="g in groups" :key="g.id" class="chip" :style="{ background: g.warna || undefined, color: '#1e2433' }">
          {{ g.nama }}
          <span class="chip-del" @click="deleteGroup(g.id)">✕</span>
        </span>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>🏦 Rekening Bank</h3></div>
      <div class="toolbar">
        <select v-model="newAcc.bankType">
          <option value="BCA">BCA</option><option value="BRI">BRI</option>
          <option value="MANDIRI">Mandiri</option><option value="OTHER">Lainnya</option>
        </select>
        <select v-model="newAcc.groupId">
          <option value="">Tanpa Grup</option>
          <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.nama }}</option>
        </select>
        <input v-model="newAcc.namaRek" placeholder="Nama rekening" style="width:180px;" />
        <input v-model="newAcc.noRek" placeholder="No. rekening" style="width:160px;" @keyup.enter="addAccount" />
        <button class="btn" @click="addAccount">+ Tambah Rekening</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th></th><th>Bank</th><th>Grup</th><th>Nama Rekening</th><th>No. Rekening</th><th class="num">Saldo Awal</th></tr>
          </thead>
          <tbody>
            <tr v-if="!accounts.length"><td colspan="6" class="empty-state">Belum ada rekening.</td></tr>
            <tr v-for="a in accounts" :key="a.id">
              <td><span class="row-del" @click="deleteAccount(a.id)">✕</span></td>
              <td><span class="pill">{{ a.bankType }}</span></td>
              <td>{{ groupLabel(a.groupId) }}</td>
              <td>{{ a.namaRek }}</td>
              <td>{{ a.noRek }}</td>
              <td class="num">
                <input
                  class="cell-input" style="text-align:right;width:140px;"
                  :value="a.saldoAwal ?? ''" placeholder="belum ditentukan"
                  @change="patchAccount(a, { saldoAwal: ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value) })"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="hint">Saldo awal jadi baseline perhitungan saldo berjalan di Rincian Bank. Kosongkan agar diisi otomatis dari file CSV saat import.</p>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>🏷️ Tag Transaksi</h3></div>
      <div class="toolbar">
        <input v-model="newTag" placeholder="Nama tag (misal: PPH 23)" @keyup.enter="addTag" />
        <button class="btn" @click="addTag">+ Tambah Tag</button>
      </div>
      <div v-if="!tags.length" class="empty-state">Belum ada tag.</div>
      <div v-else class="chip-row">
        <span v-for="t in tags" :key="t.id" class="chip">{{ t.nama }}<span class="chip-del" @click="deleteTag(t.id)">✕</span></span>
      </div>
      <p class="hint">Tag "PPH 23", "PP 23", "PPH 4", dan "21 BP" memicu perhitungan otomatis kolom pajak di List Pajak.</p>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>🧾 Master NPWP</h3></div>
      <div class="toolbar">
        <input v-model="newNpwp.noNpwp" placeholder="No. NPWP" style="width:170px;" />
        <input v-model="newNpwp.namaNpwp" placeholder="Nama NPWP" style="width:190px;" />
        <input v-model="newNpwp.nik" placeholder="NIK" style="width:160px;" />
        <input v-model="newNpwp.alamat" placeholder="Alamat" style="width:220px;" @keyup.enter="addNpwp" />
        <button class="btn" @click="addNpwp">+ Tambah NPWP</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th></th><th>No. NPWP</th><th>Nama</th><th>NIK</th><th>Alamat</th></tr></thead>
          <tbody>
            <tr v-if="!npwps.length"><td colspan="5" class="empty-state">Belum ada NPWP.</td></tr>
            <tr v-for="n in npwps" :key="n.id">
              <td><span class="row-del" @click="deleteNpwp(n.id)">✕</span></td>
              <td><input class="cell-input" :value="n.noNpwp" @change="patchNpwp(n, { noNpwp: ($event.target as HTMLInputElement).value })" /></td>
              <td><input class="cell-input" :value="n.namaNpwp" @change="patchNpwp(n, { namaNpwp: ($event.target as HTMLInputElement).value })" /></td>
              <td><input class="cell-input" :value="n.nik" @change="patchNpwp(n, { nik: ($event.target as HTMLInputElement).value })" /></td>
              <td><input class="cell-input" style="min-width:220px;" :value="n.alamat" @change="patchNpwp(n, { alamat: ($event.target as HTMLInputElement).value })" /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="hint">NIK &amp; Alamat dipakai di Daftar Norminatif.</p>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>📚 Master COA</h3></div>
      <div class="toolbar">
        <input v-model="newCoa.noCoa" placeholder="No. COA" style="width:140px;" />
        <input v-model="newCoa.namaCoa" placeholder="Nama COA" style="width:220px;" @keyup.enter="addCoa" />
        <button class="btn" @click="addCoa">+ Tambah COA</button>
      </div>
      <div v-if="!coas.length" class="empty-state">Belum ada COA. Modul Aktiva-Pasiva butuh minimal satu COA.</div>
      <div v-else class="chip-row">
        <span v-for="c in coas" :key="c.id" class="chip">{{ c.noCoa }} — {{ c.namaCoa }}<span class="chip-del" @click="deleteCoa(c.id)">✕</span></span>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>🏢 Master Aset</h3></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px;">
        <div>
          <div class="gm-label" style="margin-bottom:6px;">Tipe</div>
          <div class="toolbar">
            <input v-model="newAsetMaster.tipe" placeholder="Tipe baru" style="width:130px;" @keyup.enter="addAsetMaster('tipe')" />
            <button class="btn secondary" @click="addAsetMaster('tipe')">+</button>
          </div>
          <div class="chip-row">
            <span v-for="m in tipeList" :key="m.id" class="chip">{{ m.value }}<span class="chip-del" @click="deleteAsetMaster(m.id)">✕</span></span>
          </div>
        </div>
        <div>
          <div class="gm-label" style="margin-bottom:6px;">Kategori</div>
          <div class="toolbar">
            <input v-model="newAsetMaster.kategori" placeholder="Kategori baru" style="width:130px;" @keyup.enter="addAsetMaster('kategori')" />
            <button class="btn secondary" @click="addAsetMaster('kategori')">+</button>
          </div>
          <div class="chip-row">
            <span v-for="m in kategoriList" :key="m.id" class="chip">{{ m.value }}<span class="chip-del" @click="deleteAsetMaster(m.id)">✕</span></span>
          </div>
        </div>
        <div>
          <div class="gm-label" style="margin-bottom:6px;">DIV</div>
          <div class="toolbar">
            <input v-model="newAsetMaster.div" placeholder="DIV baru" style="width:130px;" @keyup.enter="addAsetMaster('div')" />
            <button class="btn secondary" @click="addAsetMaster('div')">+</button>
          </div>
          <div class="chip-row">
            <span v-for="m in divList" :key="m.id" class="chip">{{ m.value }}<span class="chip-del" @click="deleteAsetMaster(m.id)">✕</span></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
