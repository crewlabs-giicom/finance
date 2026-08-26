<script setup lang="ts">
import { MONTH_NAMES, fmtNum, fmtRp, formatDateShort, formatIsoDate, parseNum } from '~/utils/format'
import { findHeaderRow, parseSheetDate, parseSheetNumber } from '~/utils/sheetImport'

const api = useApi()
const { groups, sections, load: loadGroups, nameOf, myGroupId } = useGroups()
const { exportTables } = useXlsx()

type Aset = {
  id: string; tipe: string | null; kategori: string | null; grupId: string | null; div: string | null
  nama: string; deposit: number; bankAccountId: string | null; tglMulai: string | null
  noAset: string | null; keterangan: string | null; umurEkonomis: number; hargaPerolehan: number
}
type SimpleMaster = { id: string; kind: 'tipe' | 'kategori' | 'div'; value: string }
type DepLog = { id: string; asetId: string; periode: string; tanggal: string }
type Account = { id: string; bankType: string; namaRek: string; noRek: string }

const rows = ref<Aset[]>([])
const master = ref<SimpleMaster[]>([])
const depLogs = ref<DepLog[]>([])
const accounts = ref<Account[]>([])

const filterTipe = ref('')
const filterKategori = ref('')
const filterGroup = ref('')
const filterDiv = ref('')

const today = new Date()
const depPeriode = ref(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)

const status = ref<{ type: 'ok' | 'err'; msg: string } | null>(null)
const uploading = ref(false)

const addForm = reactive({
  tipe: '', kategori: '', grupId: '', div: '', nama: '', deposit: '',
  bankAccountId: '', tglMulai: '', noAset: '', keterangan: '', umurEkonomis: '', hargaPerolehan: ''
})

async function loadAll() {
  ;[rows.value, master.value, depLogs.value, accounts.value] = await Promise.all([
    api<Aset[]>('/api/aset'),
    api<SimpleMaster[]>('/api/master/aset-simple'),
    api<DepLog[]>('/api/aset/depresiasi'),
    api<Account[]>('/api/master/accounts')
  ])
}
await Promise.all([loadAll(), loadGroups()])
filterGroup.value = (await myGroupId()) || filterGroup.value

const tipeList = computed(() => master.value.filter(m => m.kind === 'tipe').map(m => m.value))
const kategoriList = computed(() => master.value.filter(m => m.kind === 'kategori').map(m => m.value))
const divList = computed(() => master.value.filter(m => m.kind === 'div').map(m => m.value))

const depCount = computed(() => {
  const m = new Map<string, DepLog[]>()
  for (const l of depLogs.value) {
    if (!m.has(l.asetId)) m.set(l.asetId, [])
    m.get(l.asetId)!.push(l)
  }
  for (const list of m.values()) list.sort((a, b) => a.periode.localeCompare(b.periode))
  return m
})

// ---------- perhitungan depresiasi (diport dari app HTML lama) ----------
function addMonths(iso: string | null, months: number): string | null {
  if (!iso || !months) return null
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const total = (m - 1) + months
  const newY = y + Math.floor(total / 12)
  const newM = ((total % 12) + 12) % 12 + 1
  const lastDay = new Date(newY, newM, 0).getDate()
  return formatIsoDate(new Date(newY, newM - 1, Math.min(d, lastDay)))
}
/** Tanggal habis = tanggal mulai + umur ekonomis, dikurangi satu hari. */
function tglSelesai(r: Aset): string | null {
  const plus = addMonths(r.tglMulai, r.umurEkonomis)
  if (!plus) return null
  const [y, m, d] = plus.split('-').map(Number) as [number, number, number]
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - 1)
  return formatIsoDate(dt)
}
function countOf(r: Aset) { return depCount.value.get(r.id)?.length || 0 }
function sisaManfaat(r: Aset) { return r.umurEkonomis ? Math.max(0, r.umurEkonomis - countOf(r)) : null }
function nilaiDepresiasi(r: Aset) { return r.umurEkonomis ? r.hargaPerolehan / r.umurEkonomis : null }
function nilaiSisa(r: Aset) {
  if (!r.umurEkonomis) return null
  return Math.max(0, r.hargaPerolehan - (r.hargaPerolehan / r.umurEkonomis) * countOf(r))
}
function periodeLabel(p: string) {
  const [y, m] = p.split('-')
  const mo = MONTH_NAMES[+m! - 1]
  return mo ? `${mo} ${y}` : p
}
function remark(r: Aset) {
  const log = depCount.value.get(r.id) || []
  if (!log.length) return 'Belum pernah didepresiasi'
  const habis = r.umurEkonomis && log.length >= r.umurEkonomis
  return `Sudah ${log.length}× (terakhir ${periodeLabel(log[log.length - 1]!.periode)})${habis ? ' · Umur ekonomis habis' : ''}`
}

const visibleRows = computed(() =>
  rows.value
    .filter(r =>
      (!filterTipe.value || r.tipe === filterTipe.value) &&
      (!filterKategori.value || r.kategori === filterKategori.value) &&
      (!filterGroup.value || r.grupId === filterGroup.value) &&
      (!filterDiv.value || r.div === filterDiv.value))
    .sort((a, b) => (b.tglMulai || '').localeCompare(a.tglMulai || ''))
)

function accountLabel(id: string | null) {
  const a = accounts.value.find(x => x.id === id)
  return a ? `${a.bankType} · ${a.namaRek}` : '-'
}

async function runDepresiasi() {
  if (!depPeriode.value) { status.value = { type: 'err', msg: 'Pilih periode (bulan) dulu.' }; return }
  try {
    const res = await api<{ didepresiasi: number; sudah: number; habis: number; belumMulai: number }>(
      '/api/aset/depresiasi', { method: 'POST', body: { periode: depPeriode.value } })
    await loadAll()
    status.value = {
      type: res.didepresiasi > 0 ? 'ok' : 'err',
      msg: `Depresiasi ${periodeLabel(depPeriode.value)}: ${res.didepresiasi} aset berhasil didepresiasi, ` +
        `${res.sudah} sudah pernah untuk periode ini, ${res.habis} habis umur ekonomisnya, ${res.belumMulai} belum mulai dipakai.`
    }
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal menjalankan depresiasi.' }
  }
}

async function addRow() {
  if (!addForm.nama.trim()) { status.value = { type: 'err', msg: 'Nama aset wajib diisi.' }; return }
  try {
    await api('/api/aset', {
      method: 'POST',
      body: {
        ...addForm,
        grupId: addForm.grupId || null,
        bankAccountId: addForm.bankAccountId || null,
        tglMulai: addForm.tglMulai || null,
        deposit: parseNum(addForm.deposit),
        umurEkonomis: parseNum(addForm.umurEkonomis),
        hargaPerolehan: parseNum(addForm.hargaPerolehan)
      }
    })
    Object.assign(addForm, { nama: '', deposit: '', tglMulai: '', noAset: '', keterangan: '', umurEkonomis: '', hargaPerolehan: '' })
    await loadAll()
    status.value = { type: 'ok', msg: 'Aset ditambahkan.' }
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal tambah aset.' }
  }
}

async function patchRow(r: Aset, patch: Partial<Aset>) {
  try {
    await api(`/api/aset/${r.id}`, { method: 'PATCH', body: patch })
    Object.assign(r, patch)
    status.value = null
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal update aset.' }
    await loadAll()
  }
}
async function deleteRow(r: Aset) {
  if (!confirm(`Hapus aset "${r.nama}"?`)) return
  try {
    await api(`/api/aset/${r.id}`, { method: 'DELETE' })
    await loadAll()
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal hapus aset — kemungkinan masih punya riwayat depresiasi.' }
  }
}
async function clearAll() {
  if (!confirm('Hapus SEMUA data aset? Tindakan ini tidak bisa dibatalkan.')) return
  try {
    await api('/api/aset/bulk', { method: 'DELETE' })
    await loadAll()
    status.value = { type: 'ok', msg: 'Semua data aset dihapus.' }
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal hapus — hapus dulu riwayat depresiasinya.' }
  }
}

// -- import Excel --
const HEADERS = {
  tipe: ['TIPE'],
  kategori: ['KATEGORI'],
  grup: ['GROUP', 'GRUP'],
  div: ['DIV', 'DIVISI'],
  nama: ['ASET', 'NAMA ASET'],
  deposit: ['DEPOSIT'],
  rekening: ['REKENING BANK', 'REKENING'],
  tglMulai: ['TANGGAL BELI', 'TGL BELI', 'TANGGAL MULAI', 'TGL MULAI'],
  noAset: ['NO. ASET', 'NO ASET', 'NOASET'],
  keterangan: ['KETERANGAN'],
  umurEkonomis: ['UMUR EKONOMIS', 'UE'],
  hargaPerolehan: ['HARGA PEROLEHAN', 'HARGA']
}

async function onUpload(evt: Event) {
  const input = evt.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  uploading.value = true
  try {
    const sheet = await readFileRows(file)
    const header = findHeaderRow(sheet, HEADERS, 3)
    if (!header) {
      status.value = { type: 'err', msg: 'Header kolom tidak ketemu. Minimal butuh kolom Aset, Umur Ekonomis, dan Harga Perolehan.' }
      return
    }

    const payload: Record<string, unknown>[] = []
    let invalid = 0

    for (let i = header.index + 1; i < sheet.length; i++) {
      const r = sheet[i] || []
      const at = (f: string) => header.map[f] === undefined ? '' : r[header.map[f]!]
      const nama = String(at('nama') || '').trim()
      if (!nama) { invalid++; continue }

      // Grup & rekening dicocokkan longgar dari teks di file ke master yang sudah ada.
      const grupText = String(at('grup') || '').trim().toUpperCase()
      const grup = groups.value.find(g => g.nama.toUpperCase() === grupText)
        || groups.value.find(g => grupText && (g.nama.toUpperCase().includes(grupText) || grupText.includes(g.nama.toUpperCase())))
      const rekText = String(at('rekening') || '').trim().toUpperCase()
      const rek = accounts.value.find(a => rekText && (a.noRek === rekText || a.namaRek.toUpperCase().includes(rekText)))

      payload.push({
        tipe: String(at('tipe') || '').trim(),
        kategori: String(at('kategori') || '').trim(),
        grupId: grup?.id || null,
        div: String(at('div') || '').trim(),
        nama,
        deposit: parseSheetNumber(at('deposit')),
        bankAccountId: rek?.id || null,
        tglMulai: parseSheetDate(at('tglMulai')),
        noAset: String(at('noAset') || '').trim(),
        keterangan: String(at('keterangan') || '').trim(),
        umurEkonomis: parseSheetNumber(at('umurEkonomis')),
        hargaPerolehan: parseSheetNumber(at('hargaPerolehan'))
      })
    }

    const res = await api<{ inserted: number; skipped: number }>('/api/aset/bulk', { method: 'POST', body: { rows: payload } })
    await loadAll()

    let msg = `${res.inserted} aset diimpor`
    if (invalid) msg += `, ${invalid} baris tanpa nama aset dilewati`
    if (res.skipped) msg += `, ${res.skipped} baris ditolak server`
    status.value = { type: res.inserted ? 'ok' : 'err', msg: msg + '.' }
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || e?.message || 'Gagal baca file Excel.' }
  } finally {
    uploading.value = false
  }
}

const root = ref<HTMLElement | null>(null)
async function onExport() {
  const tables = Array.from(root.value?.querySelectorAll<HTMLTableElement>('table[data-sheet]') || [])
  await exportTables(tables.map(t => ({ table: t, sheetName: t.dataset.sheet || 'Sheet' })), 'Daftar_Aset')
}
</script>

<template>
  <div ref="root">
    <div class="topbar">
      <div>
        <h2>Aset</h2>
        <p>Daftar aset perusahaan &amp; penyusutan bulanan. Tanggal Habis dihitung otomatis dari Tanggal Mulai + Umur Ekonomis.</p>
      </div>
      <button class="btn secondary no-export" @click="onExport">📥 Export Excel</button>
    </div>

    <StatusBox :status="status" />

    <div class="panel no-export">
      <div class="panel-head"><h3>📦 Input Data Aset</h3></div>

      <div class="toolbar">
        <span class="gm-label">📉 Depresiasi Periode:</span>
        <input v-model="depPeriode" type="month" />
        <button class="btn" @click="runDepresiasi">▶ Jalankan Depresiasi</button>
        <span style="width:1px;align-self:stretch;background:var(--border);margin:0 6px;" />
        <label class="btn" style="cursor:pointer;">
          {{ uploading ? '⏳ Memproses…' : '📤 Upload Excel Aset' }}
          <input type="file" accept=".xlsx,.xls" style="display:none;" :disabled="uploading" @change="onUpload" />
        </label>
        <button class="btn danger" @click="clearAll">🗑️ Hapus Semua Data Aset</button>
      </div>
      <p class="hint">
        Depresiasi: sekali klik, sistem menambah 1× penyusutan bulan itu ke semua aset yang belum didepresiasi untuk periode tersebut
        (dan belum habis umur ekonomisnya). Aman diklik berkali-kali — yang sudah didepresiasi otomatis dilewati.
      </p>

      <div class="toolbar" style="margin-top:10px;">
        <span class="gm-label">+ Tambah manual:</span>
        <select v-model="addForm.tipe"><option value="">Tipe</option><option v-for="t in tipeList" :key="t" :value="t">{{ t }}</option></select>
        <select v-model="addForm.kategori"><option value="">Kategori</option><option v-for="k in kategoriList" :key="k" :value="k">{{ k }}</option></select>
        <select v-model="addForm.grupId"><option value="">Grup</option><option v-for="g in groups" :key="g.id" :value="g.id">{{ g.nama }}</option></select>
        <select v-model="addForm.div"><option value="">DIV</option><option v-for="d in divList" :key="d" :value="d">{{ d }}</option></select>
        <input v-model="addForm.nama" placeholder="Nama Aset" style="width:150px;" />
        <input v-model="addForm.deposit" placeholder="Deposit" style="width:100px;text-align:right;" />
        <select v-model="addForm.bankAccountId">
          <option value="">Rekening</option>
          <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.bankType }} · {{ a.namaRek }}</option>
        </select>
        <input v-model="addForm.tglMulai" type="date" />
        <input v-model="addForm.noAset" placeholder="No. Aset" style="width:110px;" />
        <input v-model="addForm.keterangan" placeholder="Keterangan" style="width:130px;" />
        <input v-model="addForm.umurEkonomis" placeholder="UE (bulan)" style="width:100px;text-align:right;" />
        <input v-model="addForm.hargaPerolehan" placeholder="Harga Perolehan" style="width:130px;text-align:right;" />
        <button class="btn" @click="addRow">+ Tambah</button>
      </div>
      <p class="hint">Master Tipe, Kategori &amp; DIV dikelola di menu Master Data. Grup &amp; Rekening Bank memakai master yang sudah ada.</p>
    </div>

    <div class="toolbar no-export">
      <span class="gm-label">Filter:</span>
      <select v-model="filterTipe"><option value="">Semua Tipe</option><option v-for="t in tipeList" :key="t" :value="t">{{ t }}</option></select>
      <select v-model="filterKategori"><option value="">Semua Kategori</option><option v-for="k in kategoriList" :key="k" :value="k">{{ k }}</option></select>
      <select v-model="filterGroup"><option value="">Semua Grup</option><option v-for="s in sections.filter(x => x.id)" :key="s.id!" :value="s.id!">{{ s.nama }}</option></select>
      <select v-model="filterDiv"><option value="">Semua DIV</option><option v-for="d in divList" :key="d" :value="d">{{ d }}</option></select>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3>🗂️ Daftar Aset</h3>
        <span class="gm-label">{{ visibleRows.length }} / {{ rows.length }} aset</span>
      </div>

      <div v-if="!visibleRows.length" class="empty-state">Tidak ada aset yang cocok dengan filter ini.</div>
      <div v-else class="table-wrap">
        <table class="dense" data-sheet="Daftar Aset">
          <thead>
            <tr>
              <th class="no-export"></th><th>No</th><th>Tipe</th><th>Kategori</th><th>Group</th><th>DIV</th><th>Aset</th>
              <th class="num">Deposit</th><th>Rekening Bank</th><th>Tgl Beli/Mulai</th><th>Tgl Habis</th><th>No. Aset</th>
              <th>Keterangan</th>
              <th class="num" title="Umur Ekonomis (bulan)">UE</th>
              <th class="num" title="Sisa Masa Manfaat (bulan)">Sisa UE</th>
              <th class="num">Harga Perolehan</th><th class="num">Nilai Sisa Manfaat</th>
              <th class="num" title="Harga Perolehan ÷ Umur Ekonomis">Nilai Depresiasi/bln</th>
              <th>Riwayat Depresiasi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in visibleRows" :key="r.id">
              <td class="no-export"><span class="row-del" @click="deleteRow(r)">✕</span></td>
              <td>{{ i + 1 }}</td>
              <td>
                <select :value="r.tipe" @change="patchRow(r, { tipe: ($event.target as HTMLSelectElement).value })">
                  <option value="">-</option><option v-for="t in tipeList" :key="t" :value="t">{{ t }}</option>
                </select>
              </td>
              <td>
                <select :value="r.kategori" @change="patchRow(r, { kategori: ($event.target as HTMLSelectElement).value })">
                  <option value="">-</option><option v-for="k in kategoriList" :key="k" :value="k">{{ k }}</option>
                </select>
              </td>
              <td>
                <select :value="r.grupId || ''" @change="patchRow(r, { grupId: ($event.target as HTMLSelectElement).value || null })">
                  <option value="">Tanpa Grup</option><option v-for="g in groups" :key="g.id" :value="g.id">{{ g.nama }}</option>
                </select>
              </td>
              <td>
                <select :value="r.div" @change="patchRow(r, { div: ($event.target as HTMLSelectElement).value })">
                  <option value="">-</option><option v-for="d in divList" :key="d" :value="d">{{ d }}</option>
                </select>
              </td>
              <td><input class="cell-input" style="min-width:150px;" :value="r.nama" @change="patchRow(r, { nama: ($event.target as HTMLInputElement).value })" /></td>
              <td class="num"><input class="cell-input" :value="fmtNum(r.deposit, true)" @change="patchRow(r, { deposit: parseNum(($event.target as HTMLInputElement).value) })" /></td>
              <td>
                <select :value="r.bankAccountId || ''" @change="patchRow(r, { bankAccountId: ($event.target as HTMLSelectElement).value || null })">
                  <option value="">-</option>
                  <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.bankType }} · {{ a.namaRek }}</option>
                </select>
              </td>
              <td><input type="date" class="cell-input" :value="r.tglMulai" @change="patchRow(r, { tglMulai: ($event.target as HTMLInputElement).value })" /></td>
              <td style="color:var(--muted);">{{ tglSelesai(r) ? formatDateShort(tglSelesai(r)) : '-' }}</td>
              <td><input class="cell-input" :value="r.noAset" @change="patchRow(r, { noAset: ($event.target as HTMLInputElement).value })" /></td>
              <td><input class="cell-input" :value="r.keterangan" @change="patchRow(r, { keterangan: ($event.target as HTMLInputElement).value })" /></td>
              <td class="num"><input class="cell-input" :value="r.umurEkonomis || 0" @change="patchRow(r, { umurEkonomis: parseNum(($event.target as HTMLInputElement).value) })" /></td>
              <td class="num" style="color:var(--muted);">{{ sisaManfaat(r) ?? '-' }}</td>
              <td class="num"><input class="cell-input" :value="fmtNum(r.hargaPerolehan, true)" @change="patchRow(r, { hargaPerolehan: parseNum(($event.target as HTMLInputElement).value) })" /></td>
              <td class="num" style="color:var(--muted);">{{ nilaiSisa(r) !== null ? fmtRp(nilaiSisa(r)) : '-' }}</td>
              <td class="num" style="color:var(--muted);">{{ nilaiDepresiasi(r) !== null ? fmtRp(nilaiDepresiasi(r)) : '-' }}</td>
              <td style="color:var(--muted);font-size:11.5px;">{{ remark(r) }}</td>
            </tr>
            <tr class="grand-total-row">
              <td class="no-export"></td>
              <td colspan="14">Total {{ visibleRows.length }} aset</td>
              <td class="num">{{ fmtRp(visibleRows.reduce((a, r) => a + r.hargaPerolehan, 0)) }}</td>
              <td class="num">{{ fmtRp(visibleRows.reduce((a, r) => a + (nilaiSisa(r) || 0), 0)) }}</td>
              <td class="num">{{ fmtRp(visibleRows.reduce((a, r) => a + (nilaiDepresiasi(r) || 0), 0)) }}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
