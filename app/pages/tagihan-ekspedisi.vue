<script setup lang="ts">
import { fmtNum, fmtRp, formatDateShort, parseNum } from '~/utils/format'
import { findHeaderRow, parseSheetDate, parseSheetNumber } from '~/utils/sheetImport'

const api = useApi()
const { isLocked, refresh: refreshLock, label: lockLabel, lockYm } = usePeriodLock()
const { readFileRows, exportTables } = useXlsx()

type Gudang = {
  id: string; tanggal: string | null; namaPengirim: string | null; namaPenerima: string | null
  invGii: string | null; noWaybill: string; biaya: number; keperluan: string | null
}
type Finance = {
  id: string; tanggal: string | null; noWaybill: string; biaya: number
  namaPenerima: string | null; keterangan: string | null
}
type Status = 'sesuai' | 'selisih' | 'belum-tagihan' | 'tanpa-gudang'

const gudang = ref<Gudang[]>([])
const finance = ref<Finance[]>([])

const today = new Date()
const filterMonth = ref(today.getMonth() + 1)
const filterYear = ref(today.getFullYear())
const filterStatus = ref<'all' | Status>('all')
const gudangStatus = ref<{ type: 'ok' | 'err'; msg: string } | null>(null)
const financeStatus = ref<{ type: 'ok' | 'err'; msg: string } | null>(null)

const addForm = reactive({ tanggal: '', namaPengirim: '', namaPenerima: '', invGii: '', noWaybill: '', biaya: '', keperluan: '' })

async function loadAll() {
  ;[gudang.value, finance.value] = await Promise.all([
    api<Gudang[]>('/api/te/gudang'),
    api<Finance[]>('/api/te/finance')
  ])
}
await Promise.all([loadAll(), refreshLock()])

/** Waybill dinormalisasi sebelum dicocokkan — export Excel kadang menyisipkan koma pemisah ribuan. */
function normWb(v: string | null | undefined) {
  return String(v ?? '').replace(/,/g, '').trim().toUpperCase()
}

const financeByWb = computed(() => {
  const m = new Map<string, Finance>()
  for (const f of finance.value) if (!m.has(normWb(f.noWaybill))) m.set(normWb(f.noWaybill), f)
  return m
})
const gudangByWb = computed(() => {
  const m = new Map<string, Gudang>()
  for (const g of gudang.value) if (!m.has(normWb(g.noWaybill))) m.set(normWb(g.noWaybill), g)
  return m
})

function gudangRowStatus(r: Gudang): Status {
  const f = financeByWb.value.get(normWb(r.noWaybill))
  if (!f) return 'belum-tagihan'
  return r.biaya === f.biaya ? 'sesuai' : 'selisih'
}
function financeRowStatus(r: Finance): Status {
  const g = gudangByWb.value.get(normWb(r.noWaybill))
  if (!g) return 'tanpa-gudang'
  return g.biaya === r.biaya ? 'sesuai' : 'selisih'
}

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  'sesuai': { label: '✓ Sesuai', cls: 'ok' },
  'selisih': { label: '⚠ Selisih Nominal', cls: 'warn' },
  'belum-tagihan': { label: '❌ Belum Ada Tagihan', cls: 'warn' },
  'tanpa-gudang': { label: '❗ Tanpa Data Gudang', cls: 'warn' }
}

const monthPrefix = computed(() => `${filterYear.value}-${String(filterMonth.value).padStart(2, '0')}`)
function inPeriod(iso: string | null) {
  return !iso || iso.startsWith(monthPrefix.value)
}

const visibleGudang = computed(() =>
  gudang.value
    .filter(r => inPeriod(r.tanggal) && (filterStatus.value === 'all' || gudangRowStatus(r) === filterStatus.value))
    .sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || '') || a.noWaybill.localeCompare(b.noWaybill))
)
const visibleFinance = computed(() =>
  finance.value
    .filter(r => inPeriod(r.tanggal) && (filterStatus.value === 'all' || financeRowStatus(r) === filterStatus.value))
    .sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || '') || a.noWaybill.localeCompare(b.noWaybill))
)

/** Ringkasan dihitung per waybill unik dari kedua sisi, bukan per baris. */
const summary = computed(() => {
  const counts: Record<Status, number> = { 'sesuai': 0, 'selisih': 0, 'belum-tagihan': 0, 'tanpa-gudang': 0 }
  const all = new Set([...gudangByWb.value.keys(), ...financeByWb.value.keys()].filter(Boolean))
  for (const wb of all) {
    const g = gudangByWb.value.get(wb)
    const f = financeByWb.value.get(wb)
    if (g && f) counts[g.biaya === f.biaya ? 'sesuai' : 'selisih']++
    else if (g) counts['belum-tagihan']++
    else counts['tanpa-gudang']++
  }
  return counts
})

// -- import --
const GUDANG_HEADERS = {
  tanggal: ['TANGGAL'],
  namaPengirim: ['NAMA PENGIRIM'],
  namaPenerima: ['NAMA PENERIMA'],
  invGii: ['INV GII', 'INV.GII', 'INVGII', 'INV'],
  noWaybill: ['NO.WAYBILL', 'NO WAYBILL', 'NOWAYBILL', 'WAYBILL', 'NO. WAYBILL'],
  biaya: ['BIAYA ONGKOS KIRIM', 'ONGKOS KIRIM', 'BIAYA ONGKIR', 'ONGKIR'],
  keperluan: ['KEPERLUAN']
}
const FINANCE_HEADERS = {
  tanggal: ['TANGGAL PENGIRIMAN', 'TANGGAL'],
  noWaybill: ['NO.WAYBILL', 'NO WAYBILL', 'WAYBILL', 'NO. WAYBILL'],
  biaya: ['BIAYA ONGKOS KIRIM', 'ONGKOS KIRIM'],
  namaPenerima: ['NAMA PENERIMA'],
  keterangan: ['KETERANGAN']
}

const uploading = ref('')

async function importSheet(
  evt: Event,
  kind: 'gudang' | 'finance',
  headers: Record<string, string[]>,
  target: typeof gudangStatus
) {
  const input = evt.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  uploading.value = kind
  try {
    const sheet = await readFileRows(file)
    const header = findHeaderRow(sheet, headers, 2)
    if (!header) {
      target.value = { type: 'err', msg: 'Header kolom tidak ketemu. Minimal harus ada kolom No.Waybill dan Biaya Ongkos Kirim.' }
      return
    }

    const existing = kind === 'gudang' ? gudang.value : finance.value
    const seen = new Set(existing.map(r => normWb(r.noWaybill)))
    const payload: Record<string, unknown>[] = []
    let dup = 0, invalid = 0

    for (let i = header.index + 1; i < sheet.length; i++) {
      const r = sheet[i] || []
      const at = (f: string) => header.map[f] === undefined ? '' : r[header.map[f]!]
      const wb = normWb(String(at('noWaybill') ?? ''))
      if (!wb) { invalid++; continue }
      if (seen.has(wb)) { dup++; continue }
      seen.add(wb)

      const base = {
        tanggal: parseSheetDate(at('tanggal')),
        noWaybill: wb,
        biaya: parseSheetNumber(at('biaya')),
        namaPenerima: String(at('namaPenerima') || '').trim()
      }
      payload.push(kind === 'gudang'
        ? { ...base, namaPengirim: String(at('namaPengirim') || '').trim(), invGii: String(at('invGii') || '').trim(), keperluan: String(at('keperluan') || '').trim() }
        : { ...base, keterangan: String(at('keterangan') || '').trim() })
    }

    const res = await api<{ inserted: number; skipped: number }>(`/api/te/${kind}/bulk`, { method: 'POST', body: { rows: payload } })
    await loadAll()

    let msg = `${res.inserted} baris diimpor, ${dup} waybill duplikat dilewati`
    if (invalid) msg += `, ${invalid} baris tanpa No.Waybill dilewati`
    if (res.skipped) msg += `, ${res.skipped} baris ditolak server (periode terkunci / data kurang)`
    target.value = { type: res.inserted ? 'ok' : 'err', msg: msg + '.' }
  } catch (e: any) {
    target.value = { type: 'err', msg: e?.data?.statusMessage || e?.message || 'Gagal baca file Excel.' }
  } finally {
    uploading.value = ''
  }
}

async function clearAll(kind: 'gudang' | 'finance') {
  const label = kind === 'gudang' ? 'Data Gudang' : 'Tagihan Ekspedisi (Finance)'
  if (!confirm(`Hapus SEMUA ${label}? Tindakan ini tidak bisa dibatalkan.`)) return
  try {
    await api(`/api/te/${kind}/bulk`, { method: 'DELETE' })
    await loadAll()
    const target = kind === 'gudang' ? gudangStatus : financeStatus
    target.value = { type: 'ok', msg: `${label} dikosongkan.` }
  } catch (e: any) {
    const target = kind === 'gudang' ? gudangStatus : financeStatus
    target.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal hapus data.' }
  }
}

async function addGudang() {
  if (!addForm.noWaybill.trim()) { gudangStatus.value = { type: 'err', msg: 'No. Waybill wajib diisi.' }; return }
  try {
    await api('/api/te/gudang', {
      method: 'POST',
      body: { ...addForm, noWaybill: normWb(addForm.noWaybill), biaya: parseNum(addForm.biaya), tanggal: addForm.tanggal || null }
    })
    Object.assign(addForm, { tanggal: '', namaPengirim: '', namaPenerima: '', invGii: '', noWaybill: '', biaya: '', keperluan: '' })
    await loadAll()
    gudangStatus.value = { type: 'ok', msg: 'Baris ditambahkan.' }
  } catch (e: any) {
    gudangStatus.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal tambah baris.' }
  }
}

async function patchRow(kind: 'gudang' | 'finance', r: { id: string; tanggal: string | null }, patch: Record<string, unknown>) {
  try {
    await api(`/api/te/${kind}/${r.id}`, { method: 'PATCH', body: patch })
    Object.assign(r, patch)
  } catch (e: any) {
    const target = kind === 'gudang' ? gudangStatus : financeStatus
    target.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal update.' }
    await loadAll()
  }
}
async function deleteRow(kind: 'gudang' | 'finance', id: string) {
  if (!confirm('Hapus baris ini?')) return
  try {
    await api(`/api/te/${kind}/${id}`, { method: 'DELETE' })
    await loadAll()
  } catch (e: any) {
    const target = kind === 'gudang' ? gudangStatus : financeStatus
    target.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal hapus baris.' }
  }
}

const multiGudang = useMultiSelect()
const multiFinance = useMultiSelect()
async function deleteSelected(kind: 'gudang' | 'finance') {
  const multi = kind === 'gudang' ? multiGudang : multiFinance
  const target = kind === 'gudang' ? gudangStatus : financeStatus
  const ids = [...multi.selectedIds]
  if (!ids.length) return
  if (!confirm(`Hapus ${ids.length} baris terpilih?`)) return
  let ok = 0, fail = 0
  for (const id of ids) {
    try {
      await api(`/api/te/${kind}/${id}`, { method: 'DELETE' })
      multi.selectedIds.delete(id)
      ok++
    } catch {
      fail++
    }
  }
  await loadAll()
  target.value = fail
    ? { type: 'err', msg: `${ok} baris dihapus, ${fail} gagal (kemungkinan periode terkunci).` }
    : { type: 'ok', msg: `${ok} baris dihapus.` }
}

const root = ref<HTMLElement | null>(null)
async function onExport() {
  const tables = Array.from(root.value?.querySelectorAll<HTMLTableElement>('table[data-sheet]') || [])
  await exportTables(tables.map(t => ({ table: t, sheetName: t.dataset.sheet || 'Sheet' })), 'Tagihan_Ekspedisi')
}
</script>

<template>
  <div ref="root">
    <div class="topbar">
      <div>
        <h2>Tagihan Ekspedisi</h2>
        <p>Cocokkan data pengiriman tim Gudang dengan tagihan resmi ekspedisi yang diupload tim Finance — dicocokkan lewat No. Waybill &amp; Biaya Ongkos Kirim.</p>
      </div>
      <button class="btn secondary no-export" @click="onExport">📥 Export Excel</button>
    </div>

    <div v-if="lockYm" class="lock-banner no-export">
      🔒 Periode terkunci sampai <strong>{{ lockLabel }}</strong>.
    </div>

    <div class="stat-row">
      <div class="stat ok"><div class="stat-label">✓ Sesuai</div><div class="stat-value">{{ summary.sesuai }}</div></div>
      <div class="stat warn"><div class="stat-label">⚠ Selisih Nominal</div><div class="stat-value">{{ summary.selisih }}</div></div>
      <div class="stat warn"><div class="stat-label">❌ Belum Ada Tagihan</div><div class="stat-value">{{ summary['belum-tagihan'] }}</div></div>
      <div class="stat warn"><div class="stat-label">❗ Tanpa Data Gudang</div><div class="stat-value">{{ summary['tanpa-gudang'] }}</div></div>
    </div>

    <div class="panel no-export">
      <div class="panel-head"><h3>📥 Input Data</h3></div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div>
          <h4 style="margin:0 0 8px;font-size:13px;">📦 Data Gudang</h4>
          <div class="toolbar">
            <label class="btn" style="cursor:pointer;">
              {{ uploading === 'gudang' ? '⏳ Memproses…' : '📤 Upload Excel Gudang' }}
              <input type="file" accept=".xlsx,.xls" style="display:none;" :disabled="!!uploading" @change="importSheet($event, 'gudang', GUDANG_HEADERS, gudangStatus)" />
            </label>
            <button class="btn danger" @click="clearAll('gudang')">🗑️ Hapus Semua</button>
          </div>
          <p class="hint">Kolom: Tanggal, Nama Pengirim, Nama Penerima, INV GII, No.Waybill, Biaya Ongkos Kirim, Keperluan.</p>
          <StatusBox :status="gudangStatus" />

          <div class="toolbar" style="margin-top:8px;">
            <span class="gm-label">+ Tambah manual:</span>
            <input v-model="addForm.tanggal" type="date" />
            <input v-model="addForm.namaPengirim" placeholder="Nama Pengirim" style="width:120px;" />
            <input v-model="addForm.namaPenerima" placeholder="Nama Penerima" style="width:120px;" />
            <input v-model="addForm.invGii" placeholder="INV GII" style="width:100px;" />
            <input v-model="addForm.noWaybill" placeholder="No. Waybill" style="width:130px;" />
            <input v-model="addForm.biaya" placeholder="Biaya" style="width:100px;text-align:right;" />
            <input v-model="addForm.keperluan" placeholder="Keperluan" style="width:120px;" />
            <button class="btn" @click="addGudang">+ Tambah</button>
          </div>
        </div>

        <div>
          <h4 style="margin:0 0 8px;font-size:13px;">🧾 Tagihan Ekspedisi (Finance)</h4>
          <div class="toolbar">
            <label class="btn" style="cursor:pointer;">
              {{ uploading === 'finance' ? '⏳ Memproses…' : '📤 Upload Excel Tagihan' }}
              <input type="file" accept=".xlsx,.xls" style="display:none;" :disabled="!!uploading" @change="importSheet($event, 'finance', FINANCE_HEADERS, financeStatus)" />
            </label>
            <button class="btn danger" @click="clearAll('finance')">🗑️ Hapus Semua</button>
          </div>
          <p class="hint">Wajib ada kolom No.Waybill &amp; Biaya Ongkos Kirim; kolom lain diabaikan.</p>
          <StatusBox :status="financeStatus" />
        </div>
      </div>
    </div>

    <PeriodFilter v-model:month="filterMonth" v-model:year="filterYear">
      <span class="gm-label" style="margin-left:10px;">Status:</span>
      <select v-model="filterStatus">
        <option value="all">Semua Status</option>
        <option value="sesuai">✓ Sesuai</option>
        <option value="selisih">⚠ Selisih Nominal</option>
        <option value="belum-tagihan">❌ Belum Ada Tagihan Ekspedisi</option>
        <option value="tanpa-gudang">❗ Tagihan Tanpa Data Gudang</option>
      </select>
    </PeriodFilter>

    <div class="panel">
      <div class="panel-head">
        <h3>📦 Data Gudang ({{ visibleGudang.length }} baris)</h3>
        <button v-if="multiGudang.selectedIds.size" class="btn danger no-export" @click="deleteSelected('gudang')">🗑 Hapus {{ multiGudang.selectedIds.size }} Terpilih</button>
      </div>
      <div class="table-wrap">
        <table class="dense" data-sheet="Data Gudang">
          <thead>
            <tr>
              <th class="no-export">
                <input
                  type="checkbox"
                  :checked="visibleGudang.length > 0 && visibleGudang.every(r => multiGudang.selectedIds.has(r.id))"
                  @change="multiGudang.toggleAll(visibleGudang.map(r => r.id))"
                  title="Pilih semua"
                />
              </th>
              <th class="no-export"></th>
              <th>Tanggal</th><th>Nama Pengirim</th><th>Nama Penerima</th><th>INV GII</th><th>No. Waybill</th>
              <th class="num">Biaya (Gudang)</th><th class="num">Biaya (Ekspedisi)</th><th class="num">Selisih</th>
              <th>Status</th><th>Keperluan</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!visibleGudang.length"><td colspan="12" class="empty-state">Belum ada data gudang di periode/status ini.</td></tr>
            <tr v-for="r in visibleGudang" :key="r.id">
              <td class="no-export"><input type="checkbox" :checked="multiGudang.selectedIds.has(r.id)" @change="multiGudang.toggle(r.id)" /></td>
              <td class="no-export"><span class="row-del" @click="deleteRow('gudang', r.id)">✕</span></td>
              <td><input type="date" class="cell-input" :value="r.tanggal" :disabled="isLocked(r.tanggal)" @change="patchRow('gudang', r, { tanggal: ($event.target as HTMLInputElement).value })" /></td>
              <td><input class="cell-input" :value="r.namaPengirim" :disabled="isLocked(r.tanggal)" @change="patchRow('gudang', r, { namaPengirim: ($event.target as HTMLInputElement).value })" /></td>
              <td><input class="cell-input" :value="r.namaPenerima" :disabled="isLocked(r.tanggal)" @change="patchRow('gudang', r, { namaPenerima: ($event.target as HTMLInputElement).value })" /></td>
              <td><input class="cell-input" :value="r.invGii" :disabled="isLocked(r.tanggal)" @change="patchRow('gudang', r, { invGii: ($event.target as HTMLInputElement).value })" /></td>
              <td>{{ r.noWaybill }}</td>
              <td class="num"><input class="cell-input" :value="fmtNum(r.biaya, true)" :disabled="isLocked(r.tanggal)" @change="patchRow('gudang', r, { biaya: parseNum(($event.target as HTMLInputElement).value) })" /></td>
              <td class="num">{{ financeByWb.get(normWb(r.noWaybill)) ? fmtRp(financeByWb.get(normWb(r.noWaybill))!.biaya) : '—' }}</td>
              <td class="num">
                <span v-if="financeByWb.get(normWb(r.noWaybill))">{{ fmtRp(financeByWb.get(normWb(r.noWaybill))!.biaya - r.biaya) }}</span>
                <span v-else>—</span>
              </td>
              <td>
                <span class="pill" :class="{ overdue: STATUS_META[gudangRowStatus(r)].cls === 'warn' }">
                  {{ STATUS_META[gudangRowStatus(r)].label }}
                </span>
              </td>
              <td><input class="cell-input" :value="r.keperluan" :disabled="isLocked(r.tanggal)" @change="patchRow('gudang', r, { keperluan: ($event.target as HTMLInputElement).value })" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3>🧾 Tagihan Ekspedisi ({{ visibleFinance.length }} baris)</h3>
        <button v-if="multiFinance.selectedIds.size" class="btn danger no-export" @click="deleteSelected('finance')">🗑 Hapus {{ multiFinance.selectedIds.size }} Terpilih</button>
      </div>
      <div class="table-wrap">
        <table class="dense" data-sheet="Tagihan Finance">
          <thead>
            <tr>
              <th class="no-export">
                <input
                  type="checkbox"
                  :checked="visibleFinance.length > 0 && visibleFinance.every(r => multiFinance.selectedIds.has(r.id))"
                  @change="multiFinance.toggleAll(visibleFinance.map(r => r.id))"
                  title="Pilih semua"
                />
              </th>
              <th class="no-export"></th>
              <th>Tanggal</th><th>No. Waybill</th><th>Nama Penerima</th>
              <th class="num">Biaya (Ekspedisi)</th><th class="num">Biaya (Gudang)</th><th class="num">Selisih</th>
              <th>Status</th><th>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!visibleFinance.length"><td colspan="10" class="empty-state">Belum ada tagihan di periode/status ini.</td></tr>
            <tr v-for="r in visibleFinance" :key="r.id">
              <td class="no-export"><input type="checkbox" :checked="multiFinance.selectedIds.has(r.id)" @change="multiFinance.toggle(r.id)" /></td>
              <td class="no-export"><span class="row-del" @click="deleteRow('finance', r.id)">✕</span></td>
              <td><input type="date" class="cell-input" :value="r.tanggal" :disabled="isLocked(r.tanggal)" @change="patchRow('finance', r, { tanggal: ($event.target as HTMLInputElement).value })" /></td>
              <td>{{ r.noWaybill }}</td>
              <td><input class="cell-input" :value="r.namaPenerima" :disabled="isLocked(r.tanggal)" @change="patchRow('finance', r, { namaPenerima: ($event.target as HTMLInputElement).value })" /></td>
              <td class="num"><input class="cell-input" :value="fmtNum(r.biaya, true)" :disabled="isLocked(r.tanggal)" @change="patchRow('finance', r, { biaya: parseNum(($event.target as HTMLInputElement).value) })" /></td>
              <td class="num">{{ gudangByWb.get(normWb(r.noWaybill)) ? fmtRp(gudangByWb.get(normWb(r.noWaybill))!.biaya) : '—' }}</td>
              <td class="num">
                <span v-if="gudangByWb.get(normWb(r.noWaybill))">{{ fmtRp(r.biaya - gudangByWb.get(normWb(r.noWaybill))!.biaya) }}</span>
                <span v-else>—</span>
              </td>
              <td>
                <span class="pill" :class="{ overdue: STATUS_META[financeRowStatus(r)].cls === 'warn' }">
                  {{ STATUS_META[financeRowStatus(r)].label }}
                </span>
              </td>
              <td><input class="cell-input" :value="r.keterangan" :disabled="isLocked(r.tanggal)" @change="patchRow('finance', r, { keterangan: ($event.target as HTMLInputElement).value })" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
