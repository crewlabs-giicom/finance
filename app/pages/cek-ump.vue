<script setup lang="ts">
import { defaultPeriod, fmtNum, fmtRp } from '~/utils/format'
import { findHeaderRow, parseSheetDate, parseSheetNumber } from '~/utils/sheetImport'

const api = useApi()
const { load: loadGroups, groups } = useGroups()
const { pics, load: loadPics, nameOf: picNameOf, myPicId } = usePics()
const { refresh: refreshLock, label: lockLabel, lockYm } = usePeriodLock()
const { readFileRows, exportTables } = useXlsx()

type CekUmpRow = {
  id: string; tanggal: string; transaksi: string | null; code: string | null
  description: string | null; coaId: string | null; debet: number; kredit: number
  pt: string | null; store: string | null; groupId: string | null; picId: string | null
  tag: string | null; matchNo: number | null; keterangan: string | null
}
type Coa = { id: string; noCoa: string; namaCoa: string }
type SortKey = 'tanggal' | 'transaksi' | 'code' | 'description' | 'coa' | 'debet' | 'kredit' | 'pt' | 'store' | 'pic' | 'match'

const rows = ref<CekUmpRow[]>([])
const coas = ref<Coa[]>([])
const status = ref<{ type: 'ok' | 'err'; msg: string } | null>(null)
const uploading = ref(false)

const today = new Date()
await refreshLock()
const { year: defYear, month: defMonth } = defaultPeriod(today, lockYm.value)
const filterFromMonth = ref(defMonth)
const filterFromYear = ref(defYear)
const filterToMonth = ref(defMonth)
const filterToYear = ref(defYear)
// Filter periode sengaja gak aktif di awal (biarkan user milih sendiri) -- beda dari
// halaman lain yang defaultnya langsung ke bulan berjalan. Dropdown bulan/tahun tetap
// kesetel ke bulan ini cuma sebagai starting point kalau nanti filternya diaktifkan.
const filterPeriodActive = ref(false)
const filterCoa = ref('')
const filterPic = ref('')
const filterTransaksi = ref<string[]>([])
const filterMatchStatus = ref<'all' | 'matched' | 'unmatched'>('unmatched')
const filterSearch = ref('')
const sortKey = ref<SortKey>('tanggal')
const sortDir = ref<'asc' | 'desc'>('asc')

async function loadAll() {
  ;[rows.value, coas.value] = await Promise.all([
    api<CekUmpRow[]>('/api/cek-ump'),
    api<Coa[]>('/api/master/coa')
  ])
}
await Promise.all([loadAll(), loadGroups(), loadPics()])
filterPic.value = (await myPicId()) || filterPic.value

const fromYm = computed(() => `${filterFromYear.value}-${String(filterFromMonth.value).padStart(2, '0')}`)
const toYm = computed(() => `${filterToYear.value}-${String(filterToMonth.value).padStart(2, '0')}`)
function inPeriod(tanggal: string) {
  if (!filterPeriodActive.value) return true
  const ym = (tanggal || '').slice(0, 7)
  return ym >= fromYm.value && ym <= toYm.value
}

/** Daftar jenis Transaction yang beneran ada di data, buat opsi filter multi-select. */
const transaksiOptions = computed(() =>
  [...new Set(rows.value.map(r => r.transaksi).filter((t): t is string => !!t))].sort().map(t => ({ value: t, label: t }))
)

function coaLabel(id: string | null) {
  return coas.value.find(x => x.id === id)?.namaCoa || '-'
}

/** Cari teks (Transaction/Code/Description/PT/Store/COA) atau nominal persis di
 *  Debet/Kredit -- pola sama kayak search di rincian-bank.vue. */
function matchesSearch(r: CekUmpRow) {
  const q = filterSearch.value.trim().toLowerCase()
  if (!q) return true
  if ([r.transaksi, r.code, r.description, r.pt, r.store, coaLabel(r.coaId)]
    .some(v => (v || '').toLowerCase().includes(q))) return true
  const qDigits = q.replace(/[^0-9]/g, '')
  if (qDigits && ((r.debet && String(Math.round(r.debet)).includes(qDigits)) || (r.kredit && String(Math.round(r.kredit)).includes(qDigits)))) return true
  return false
}

/** Nilai yang dibandingkan buat sort per kolom -- COA/PIC di-sort by LABEL yang
 *  ditampilkan (bukan raw id, yang urutannya acak gak nyambung sama nama). */
function sortValue(r: CekUmpRow, key: SortKey): string | number {
  switch (key) {
    case 'coa': return coaLabel(r.coaId)
    case 'pic': return picNameOf(r.picId)
    case 'debet': return r.debet || 0
    case 'kredit': return r.kredit || 0
    case 'match': return r.matchNo ?? -1
    default: return r[key] || ''
  }
}
function toggleSort(key: SortKey) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortKey.value = key; sortDir.value = 'asc' }
}
function sortIcon(key: SortKey) {
  if (sortKey.value !== key) return '⇅'
  return sortDir.value === 'asc' ? '▲' : '▼'
}

const visibleRows = computed(() => {
  const filtered = rows.value.filter(r =>
    inPeriod(r.tanggal) &&
    (!filterCoa.value || r.coaId === filterCoa.value) &&
    (!filterPic.value || r.picId === filterPic.value) &&
    (!filterTransaksi.value.length || filterTransaksi.value.includes(r.transaksi || '')) &&
    (filterMatchStatus.value === 'all' || (filterMatchStatus.value === 'matched' ? r.matchNo !== null : r.matchNo === null)) &&
    matchesSearch(r)
  )
  const key = sortKey.value
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...filtered].sort((a, b) => {
    const av = sortValue(a, key)
    const bv = sortValue(b, key)
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
    return String(av).localeCompare(String(bv)) * dir
  })
})

async function patchRow(r: CekUmpRow, patch: Partial<CekUmpRow>) {
  try {
    await api(`/api/cek-ump/${r.id}`, { method: 'PATCH', body: patch })
    Object.assign(r, patch)
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal update.' }
    await loadAll()
  }
}

// -- checkbox select + submit match --
// Set bawaan JS mempertahankan URUTAN INSERT (termasuk setelah uncheck+check ulang --
// jadi dianggap "centangan baru" di posisi akhir) -- dipakai apa adanya sebagai urutan
// centang user, gak perlu state tambahan.
const multi = useMultiSelect()
const selectedIds = multi.selectedIds
const unmatchedVisibleIds = computed(() => visibleRows.value.filter(r => r.matchNo === null).map(r => r.id))
const orderedSelectedIds = computed(() => [...selectedIds])
function selectionOrder(id: string): number | null {
  const idx = orderedSelectedIds.value.indexOf(id)
  return idx === -1 ? null : idx + 1
}
const selectedRows = computed(() =>
  orderedSelectedIds.value.map(id => rows.value.find(r => r.id === id)).filter((r): r is CekUmpRow => !!r)
)
const selectedTotalDebet = computed(() => selectedRows.value.reduce((a, r) => a + (r.debet || 0), 0))
const selectedTotalKredit = computed(() => selectedRows.value.reduce((a, r) => a + (r.kredit || 0), 0))

/** Pecah baris yang dicentang (SESUAI URUTAN centangnya) jadi beberapa grup match
 *  berurutan: jalan dari centangan pertama, akumulasi Debet/Kredit berjalan, begitu
 *  akumulasinya imbang (dan minimal 2 baris) -- itu nutup satu grup -- lanjut akumulasi
 *  dari nol lagi buat grup berikutnya. Contoh: centang 1-2-3-4-5-6-7, kalau 1+2 imbang
 *  jadi grup pertama, 3+4 imbang jadi grup kedua, 5+6+7 imbang jadi grup ketiga -- submit
 *  SEKALI langsung bikin match1/match2/match3 sekaligus, gak perlu submit satu-satu.
 *  Sisa baris di ekor yang belum sempat imbang dibalikin sebagai `leftover` (tetap
 *  tercentang, biar user tinggal nambah centangan lain lalu submit ulang). */
function computeMatchGroups(ordered: CekUmpRow[]): { groups: CekUmpRow[][]; leftover: CekUmpRow[] } {
  const groups: CekUmpRow[][] = []
  let current: CekUmpRow[] = []
  let runDebet = 0, runKredit = 0
  for (const r of ordered) {
    current.push(r)
    runDebet += r.debet || 0
    runKredit += r.kredit || 0
    if (current.length >= 2 && (runDebet > 0 || runKredit > 0) && Math.abs(runDebet - runKredit) <= 0.5) {
      groups.push(current)
      current = []
      runDebet = 0
      runKredit = 0
    }
  }
  return { groups, leftover: current }
}

async function submitMatch() {
  if (orderedSelectedIds.value.length < 2) return
  const { groups, leftover } = computeMatchGroups(selectedRows.value)
  if (!groups.length) {
    status.value = { type: 'err', msg: `Belum ada subset yang imbang dari urutan centang ini (Debet ${fmtRp(selectedTotalDebet.value)} / Kredit ${fmtRp(selectedTotalKredit.value)}).` }
    return
  }

  let done = 0
  try {
    for (const g of groups) {
      await api<{ matchNo: number; count: number }>('/api/cek-ump/match', { method: 'POST', body: { ids: g.map(r => r.id) } })
      for (const r of g) selectedIds.delete(r.id)
      done++
    }
    await loadAll()
    let msg = done === 1 ? `1 grup match dibuat.` : `${done} grup match dibuat.`
    if (leftover.length) msg += ` ${leftover.length} baris terakhir belum imbang, masih tercentang.`
    status.value = { type: 'ok', msg }
  } catch (e: any) {
    await loadAll()
    status.value = { type: 'err', msg: `${done} grup berhasil dibuat sebelum error: ${e?.data?.statusMessage || 'Gagal submit match.'}` }
  }
}

async function unmatchGroup(matchNo: number) {
  if (!confirm(`Batalkan Match ${matchNo}?`)) return
  try {
    await api('/api/cek-ump/unmatch', { method: 'POST', body: { matchNo } })
    await loadAll()
    status.value = { type: 'ok', msg: `Match ${matchNo} dibatalkan.` }
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal batalkan match.' }
  }
}

async function removeAll() {
  // Server cuma hapus baris yang BELUM match -- baris yang udah di-match gak akan
  // ikut terhapus ("data yang sudah match gak boleh diotak-atik").
  if (!confirm('Hapus SEMUA baris yang BELUM match? Baris yang udah di-match gak akan ikut terhapus. Aksi ini tidak bisa dibatalkan.')) return
  try {
    await api('/api/cek-ump/bulk', { method: 'DELETE' })
    multi.clear()
    await loadAll()
    status.value = { type: 'ok', msg: 'Baris yang belum match udah dihapus.' }
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal hapus semua.' }
  }
}

// -- import Excel --
// "Code" vs "COA Kode" bisa collide kalau alias "COA CODE"/"KODE" didaftarkan -- matching
// di detectHeaderMap itu longgar substring dua arah (lihat app/utils/sheetImport.ts), sama
// persis kasus "No. NPWP" vs "NPWP" di list-pajak.vue. Makanya alias `coaKode` CUMA "COA
// KODE" (gak ada varian lain), dan "COA Name" diambil dari kolom index+1 di sebelah kanan
// "COA Kode" (bukan lewat alias HEADERS terpisah).
const HEADERS = {
  tanggal: ['TANGGAL', 'DATE'],
  transaksi: ['TRANSACTION'],
  code: ['CODE'],
  description: ['DESKRIPSI', 'DESCRIPTION'],
  coaKode: ['COA KODE'],
  debet: ['DEBET', 'DEBIT'],
  kredit: ['KREDIT', 'CREDIT'],
  pt: ['PT'],
  store: ['STORE'],
  tag: ['TAG', 'TAGS']
}

/** COA exact match (trim+case-insensitive) by noCoa di master; kalau belum ada, auto-create
 *  (mirror resolveNpwpId di list-pajak.vue). Cache per-batch biar gak dobel create. */
async function resolveCoaId(noCoaRaw: string, namaRaw: string, cache: Map<string, string | null>): Promise<string | null> {
  const noCoa = noCoaRaw.trim()
  if (!noCoa) return null
  const key = noCoa.toLowerCase()
  if (cache.has(key)) return cache.get(key)!

  const existing = coas.value.find(c => c.noCoa.trim().toLowerCase() === key)
  if (existing) { cache.set(key, existing.id); return existing.id }

  const created = await api<Coa>('/api/master/coa', { method: 'POST', body: { noCoa, namaCoa: namaRaw.trim() || noCoa } })
  coas.value.push(created)
  cache.set(key, created.id)
  return created.id
}

/** PT (teks, kode grup kayak "GIM"/"SUM"/"BII") -> cari di Master Data > Grup by nama
 *  (exact match, trim+case-insensitive) -> grup itu punya picId -> itu PIC-nya. PT gak
 *  ketemu di master grup -> null. */
function resolveGroupAndPic(ptRaw: string): { groupId: string | null; picId: string | null } {
  const key = ptRaw.trim().toLowerCase()
  if (!key) return { groupId: null, picId: null }
  const group = groups.value.find(g => g.nama.trim().toLowerCase() === key)
  if (!group) return { groupId: null, picId: null }
  return { groupId: group.id, picId: group.picId || null }
}

async function onUpload(evt: Event) {
  const input = evt.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  // Upload baru REPLACE semua baris yang belum match (yang udah match gak kesentuh) --
  // bukan nambah/append biasa, jadi user perlu tau dulu sebelum lanjut.
  if (!confirm('Upload ini bakal GANTI semua baris yang belum match dengan isi file ini. Baris yang udah di-match gak akan kesentuh. Lanjut?')) return

  uploading.value = true
  try {
    const sheet = await readFileRows(file, HEADERS, 3)
    const header = findHeaderRow(sheet, HEADERS, 3)
    if (!header) {
      status.value = { type: 'err', msg: 'Header kolom tidak ketemu. File butuh minimal kolom Tanggal, COA Kode, Debet, Kredit.' }
      return
    }

    const payload: Record<string, unknown>[] = []
    const coaCache = new Map<string, string | null>()
    let invalid = 0

    for (let i = header.index + 1; i < sheet.length; i++) {
      const r = sheet[i] || []
      const at = (f: string) => header.map[f] === undefined ? '' : r[header.map[f]!]
      const tanggal = parseSheetDate(at('tanggal'))
      if (!tanggal) { invalid++; continue }

      const coaKodeColIdx = header.map['coaKode']
      const coaKodeRaw = String(at('coaKode') || '').trim()
      const coaNamaRaw = coaKodeColIdx !== undefined ? String(r[coaKodeColIdx + 1] ?? '') : ''
      const coaId = await resolveCoaId(coaKodeRaw, coaNamaRaw, coaCache)

      const ptRaw = String(at('pt') || '').trim()
      const { groupId, picId } = resolveGroupAndPic(ptRaw)

      payload.push({
        tanggal,
        transaksi: String(at('transaksi') || '').trim(),
        code: String(at('code') || '').trim(),
        description: String(at('description') || '').trim(),
        coaId,
        debet: parseSheetNumber(at('debet')),
        kredit: parseSheetNumber(at('kredit')),
        pt: ptRaw,
        store: String(at('store') || '').trim(),
        groupId,
        picId,
        tag: String(at('tag') || '').trim()
      })
    }

    const res = await api<{ inserted: number; skipped: number; removed: number }>('/api/cek-ump/import', { method: 'POST', body: { rows: payload } })
    await loadAll()

    let msg = `${res.removed} baris lama (belum match) diganti, ${res.inserted} baris baru diimpor`
    if (invalid) msg += `, ${invalid} baris tanpa tanggal valid dilewati`
    if (res.skipped) msg += `, ${res.skipped} baris dilewati (duplikat / periode terkunci / data kurang)`
    status.value = { type: res.inserted ? 'ok' : 'err', msg: msg + '.' }
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || e?.message || 'Gagal baca file Excel.' }
  } finally {
    uploading.value = false
  }
}

const root = ref<HTMLElement | null>(null)
async function onExport() {
  const table = root.value?.querySelector<HTMLTableElement>('table[data-sheet]')
  if (!table) { status.value = { type: 'err', msg: 'Belum ada tabel untuk diexport.' }; return }
  await exportTables([{ table, sheetName: 'Cek UMP' }], 'Cek_UMP')
}
</script>

<template>
  <div ref="root">
    <div class="topbar">
      <div><h2>Cek UMP</h2></div>
      <button v-if="selectedIds.size >= 2" class="btn no-export" @click="submitMatch">
        ✔ Submit Match ({{ selectedIds.size }} baris dicentang, Debet {{ fmtRp(selectedTotalDebet) }} / Kredit {{ fmtRp(selectedTotalKredit) }})
      </button>
    </div>

    <StatusBox :status="status" />

    <div class="panel no-export">
      <div class="upload-box">
        <label class="btn" :class="{ disabled: uploading }" style="cursor:pointer;">
          {{ uploading ? '⏳ Memproses…' : '📤 Upload Excel' }}
          <input type="file" accept=".xlsx,.xls" style="display:none;" :disabled="uploading" @change="onUpload" />
        </label>
        <button class="btn secondary" @click="onExport">📥 Export Excel</button>
        <button class="btn danger" @click="removeAll">🗑 Hapus Semua</button>
        <div v-if="lockYm" class="lock-banner no-export" style="margin:0 0 0 auto;">
          🔒 Periode terkunci sampai <strong>{{ lockLabel }}</strong>.
        </div>
      </div>
    </div>

    <PeriodRangeFilter
      v-model:from-month="filterFromMonth" v-model:from-year="filterFromYear"
      v-model:to-month="filterToMonth" v-model:to-year="filterToYear"
      short-month
    >
      <label style="display:flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600;cursor:pointer;">
        <input v-model="filterPeriodActive" type="checkbox" /> Filter periode
      </label>
      <span class="gm-label" style="margin-left:10px;">COA:</span>
      <select v-model="filterCoa">
        <option value="">Semua COA</option>
        <option v-for="c in coas" :key="c.id" :value="c.id">{{ c.namaCoa }}</option>
      </select>
      <span class="gm-label" style="margin-left:10px;">PIC:</span>
      <select v-model="filterPic">
        <option value="">Semua PIC</option>
        <option v-for="p in pics" :key="p.id" :value="p.id">{{ p.nama }}</option>
      </select>
      <span class="gm-label" style="margin-left:10px;">Transaction:</span>
      <MultiSelectFilter v-model="filterTransaksi" :options="transaksiOptions" placeholder="Semua" />
      <span class="gm-label" style="margin-left:10px;">Match:</span>
      <select v-model="filterMatchStatus">
        <option value="all">Semua</option>
        <option value="matched">Sudah Match</option>
        <option value="unmatched">Belum Match</option>
      </select>
      <span class="gm-label" style="margin-left:10px;">Cari:</span>
      <input type="text" v-model="filterSearch" placeholder="Cari transaksi, nominal..." style="width:200px;" />
    </PeriodRangeFilter>

    <div v-if="!visibleRows.length" class="empty-state">Belum ada data Cek UMP sesuai filter ini.</div>

    <div v-else class="panel">
      <div class="table-wrap">
        <table class="dense" data-sheet="Cek UMP">
          <thead>
            <tr>
              <th class="no-export">
                <input
                  type="checkbox"
                  :checked="unmatchedVisibleIds.length > 0 && unmatchedVisibleIds.every(id => selectedIds.has(id))"
                  @change="multi.toggleAll(unmatchedVisibleIds)"
                />
              </th>
              <th class="sortable" @click="toggleSort('tanggal')">Tanggal <span class="sort-icon">{{ sortIcon('tanggal') }}</span></th>
              <th class="sortable" @click="toggleSort('transaksi')">Transaction <span class="sort-icon">{{ sortIcon('transaksi') }}</span></th>
              <th class="sortable" @click="toggleSort('code')">Code <span class="sort-icon">{{ sortIcon('code') }}</span></th>
              <th class="sortable" @click="toggleSort('description')">Description <span class="sort-icon">{{ sortIcon('description') }}</span></th>
              <th class="sortable" @click="toggleSort('coa')">COA <span class="sort-icon">{{ sortIcon('coa') }}</span></th>
              <th class="num sortable" @click="toggleSort('debet')">Debet <span class="sort-icon">{{ sortIcon('debet') }}</span></th>
              <th class="num sortable" @click="toggleSort('kredit')">Kredit <span class="sort-icon">{{ sortIcon('kredit') }}</span></th>
              <th class="sortable" @click="toggleSort('pt')">PT <span class="sort-icon">{{ sortIcon('pt') }}</span></th>
              <th class="sortable" @click="toggleSort('store')">Store <span class="sort-icon">{{ sortIcon('store') }}</span></th>
              <th class="sortable" @click="toggleSort('pic')">PIC <span class="sort-icon">{{ sortIcon('pic') }}</span></th>
              <th>Keterangan</th>
              <th class="sortable" @click="toggleSort('match')">Match <span class="sort-icon">{{ sortIcon('match') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in visibleRows" :key="r.id">
              <td class="no-export select-cell">
                <input type="checkbox" :disabled="r.matchNo !== null" :checked="selectedIds.has(r.id)" @change="multi.toggle(r.id)" />
                <span v-if="selectedIds.has(r.id)" class="select-order-badge">{{ selectionOrder(r.id) }}</span>
              </td>
              <td>{{ r.tanggal }}</td>
              <td>{{ r.transaksi }}</td>
              <td>{{ r.code }}</td>
              <td class="wrap-cell" :title="r.description || ''">{{ r.description }}</td>
              <td>{{ coaLabel(r.coaId) }}</td>
              <td class="num">{{ fmtNum(r.debet, true) }}</td>
              <td class="num">{{ fmtNum(r.kredit, true) }}</td>
              <td>{{ r.pt }}</td>
              <td>{{ r.store }}</td>
              <td>{{ picNameOf(r.picId) }}</td>
              <td>
                <input
                  class="cell-input" :value="r.keterangan" placeholder="Keterangan..."
                  @change="patchRow(r, { keterangan: ($event.target as HTMLInputElement).value })"
                />
              </td>
              <td>
                <span v-if="r.matchNo === null" class="pill">-</span>
                <span v-else class="pill" style="background:var(--green-bg);color:var(--green);">
                  Match {{ r.matchNo }}
                  <span class="no-export" style="cursor:pointer;margin-left:4px;" title="Batalkan" @click="unmatchGroup(r.matchNo)">✕</span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.table-wrap {
  max-height: 520px;
  overflow-y: auto;
}
.sortable {
  cursor: pointer;
  user-select: none;
}
.sortable:hover {
  background: var(--accent-light);
}
.sort-icon {
  font-size: 9px;
  color: var(--muted);
  margin-left: 2px;
}
.wrap-cell {
  max-width: 260px;
  white-space: normal;
  word-break: break-word;
  /* Dibatasi 2 baris (truncate "...") biar tinggi tiap baris tabel seragam -- kalau
     dibiarin wrap bebas, baris dengan Description panjang jadi jauh lebih tinggi dari
     baris lain dan garis antar baris keliatan "naik turun". Teks lengkapnya tetap bisa
     dibaca lewat tooltip (atribut title). */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.select-cell {
  display: flex;
  align-items: center;
  gap: 5px;
}
.select-order-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}
</style>
