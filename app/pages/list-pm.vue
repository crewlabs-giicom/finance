<script setup lang="ts">
import { MONTH_NAMES, fmtNum, fmtRp, formatDateShort, lightenColor, parseNum, parseTagList } from '~/utils/format'

/**
 * List PM adalah tampilan turunan dari List Pajak — tidak punya tabel sendiri.
 * Yang ditampilkan hanya baris ppn_rows yang ditag "PM" (beda dari Norminatif,
 * tag "PM" boleh berdiri sendiri, gak perlu dipasangkan tag pajak lain); edit
 * di sini langsung menulis balik ke baris List Pajak yang sama.
 */

const api = useApi()
const { sections, load: loadGroups, myGroupId } = useGroups()
const { isLocked, refresh: refreshLock, label: lockLabel, lockYm } = usePeriodLock()
const { exportTables } = useXlsx()

type PpnRow = {
  id: string; groupId: string | null; tanggal: string; code: string | null
  description: string | null; tags: string | null
  npwpId: string | null; noInvoice: string | null; tanggalFp: string | null
  dpp: number | null; ppn: number | null; masaKredit: string | null
}
type Npwp = { id: string; noNpwp: string; namaNpwp: string }

const rows = ref<PpnRow[]>([])
const npwps = ref<Npwp[]>([])

const today = new Date()
const filterFromMonth = ref(today.getMonth() + 1)
const filterFromYear = ref(today.getFullYear())
const filterToMonth = ref(today.getMonth() + 1)
const filterToYear = ref(today.getFullYear())
const filterGroup = ref('')
const status = ref<{ type: 'ok' | 'err'; msg: string } | null>(null)

const fromYm = computed(() => `${filterFromYear.value}-${String(filterFromMonth.value).padStart(2, '0')}`)
const toYm = computed(() => `${filterToYear.value}-${String(filterToMonth.value).padStart(2, '0')}`)

async function loadAll() {
  ;[rows.value, npwps.value] = await Promise.all([
    api<PpnRow[]>('/api/ppn', { query: { from: `${fromYm.value}-01`, to: `${toYm.value}-31`, groupId: filterGroup.value || undefined } }),
    api<Npwp[]>('/api/master/npwp')
  ])
}
await Promise.all([loadAll(), loadGroups(), refreshLock()])
filterGroup.value = (await myGroupId()) || filterGroup.value
await loadAll() // re-fetch scoped ke grup default user (baru kesetel di atas)
watch([filterFromMonth, filterFromYear, filterToMonth, filterToYear, filterGroup], loadAll)

function inPeriod(tanggal: string) {
  const ym = (tanggal || '').slice(0, 7)
  return ym >= fromYm.value && ym <= toYm.value
}

function matchesTag(r: PpnRow) {
  return parseTagList(r.tags).includes('PM')
}
function npwpOf(id: string | null) {
  return npwps.value.find(n => n.id === id)
}
const npwpOptions = computed(() => npwps.value.map(n => ({ id: n.id, label: `${n.noNpwp} - ${n.namaNpwp}` })))

const visibleSections = computed(() =>
  sections.value
    .filter(s => !filterGroup.value || (s.id || '') === filterGroup.value)
    .map(s => ({
      ...s,
      rows: rows.value
        .filter(r => (r.groupId || '') === (s.id || '') && matchesTag(r) && inPeriod(r.tanggal))
        .sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0))
    }))
    .filter(s => s.rows.length)
)

const kreditYears = Array.from({ length: 6 }, (_, i) => today.getFullYear() - 3 + i)

async function patchRow(r: PpnRow, patch: Partial<PpnRow>) {
  try {
    await api(`/api/ppn/${r.id}`, { method: 'PATCH', body: patch })
    Object.assign(r, patch)
    status.value = null
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal update.' }
    await loadAll()
  }
}

async function onMasaKredit(r: PpnRow, part: 'y' | 'm', value: string) {
  const [curY, curM] = (r.masaKredit || '').split('-')
  const y = part === 'y' ? value : (curY || String(today.getFullYear()))
  const m = part === 'm' ? value : (curM || '')
  await patchRow(r, { masaKredit: y && m ? `${y}-${String(m).padStart(2, '0')}` : '' })
}

/** Pilihan "+ Tambah NPWP Baru" di dropdown, sama kayak Daftar Norminatif. */
async function onNpwpCreate(r: PpnRow) {
  const noNpwp = prompt('No. NPWP baru:')?.trim()
  if (!noNpwp) { await loadAll(); return }
  const namaNpwp = prompt('Nama NPWP:')?.trim()
  if (!namaNpwp) { await loadAll(); return }

  try {
    const created = await api<Npwp>('/api/master/npwp', { method: 'POST', body: { noNpwp, namaNpwp } })
    npwps.value = await api<Npwp[]>('/api/master/npwp')
    await patchRow(r, { npwpId: created.id })
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal tambah NPWP.' }
    await loadAll()
  }
}

const multi = useMultiSelect()
const selectedIds = multi.selectedIds
async function deleteSelected() {
  const ids = [...selectedIds]
  if (!ids.length) return
  if (!confirm(`Hapus ${ids.length} baris terpilih? Baris ini juga bakal hilang dari List Pajak.`)) return
  let ok = 0, fail = 0
  for (const id of ids) {
    try {
      await api(`/api/ppn/${id}`, { method: 'DELETE' })
      selectedIds.delete(id)
      ok++
    } catch {
      fail++
    }
  }
  await loadAll()
  status.value = fail
    ? { type: 'err', msg: `${ok} baris dihapus, ${fail} gagal (kemungkinan periode terkunci).` }
    : { type: 'ok', msg: `${ok} baris dihapus.` }
}

const root = ref<HTMLElement | null>(null)
async function onExport() {
  const tables = Array.from(root.value?.querySelectorAll<HTMLTableElement>('table[data-sheet]') || [])
  if (!tables.length) { status.value = { type: 'err', msg: 'Belum ada tabel untuk diexport.' }; return }
  await exportTables(tables.map(t => ({ table: t, sheetName: t.dataset.sheet || 'Sheet' })), 'List_PM')
}

function subtotal(list: PpnRow[], key: 'dpp' | 'ppn') {
  return list.reduce((a, r) => a + (Number(r[key]) || 0), 0)
}
</script>

<template>
  <div ref="root">
    <div class="topbar">
      <div>
        <h2>List PM</h2>
      </div>
    </div>

    <StatusBox :status="status" />

    <div class="panel no-export">
      <div class="upload-box">
        <button class="btn secondary" @click="onExport">📥 Export Excel</button>
        <div v-if="lockYm" class="lock-banner no-export" style="margin:0 0 0 auto;">
          🔒 Periode terkunci sampai <strong>{{ lockLabel }}</strong>.
        </div>
      </div>
    </div>

    <PeriodRangeFilter
      v-model:from-month="filterFromMonth" v-model:from-year="filterFromYear"
      v-model:to-month="filterToMonth" v-model:to-year="filterToYear"
    >
      <span class="gm-label" style="margin-left:10px;">Grup:</span>
      <select v-model="filterGroup">
        <option value="">Semua grup</option>
        <option v-for="s in sections" :key="s.id || 'none'" :value="s.id || ''">{{ s.nama }}</option>
      </select>
    </PeriodRangeFilter>

    <div v-if="!visibleSections.length" class="empty-state">
      Belum ada data. Pastikan ada transaksi di Rincian Bank yang ditag "PM", lalu cek filter periode di atas.
    </div>

    <div v-for="sec in visibleSections" :key="sec.id || 'none'" class="panel">
      <div class="group-head">
        <span class="group-dot" :style="{ background: sec.warna }" />
        {{ sec.nama }}
        <button v-if="selectedIds.size" class="btn danger no-export" style="margin-left:auto;" @click="deleteSelected">🗑 Hapus {{ selectedIds.size }} Terpilih</button>
      </div>

      <div class="table-wrap">
        <table class="dense" :data-sheet="sec.nama">
          <thead :style="{ '--group-thead-bg': lightenColor(sec.warna) }">
            <tr>
              <th class="no-export">
                <input
                  type="checkbox"
                  :checked="sec.rows.length > 0 && sec.rows.every(r => selectedIds.has(r.id))"
                  @change="multi.toggleAll(sec.rows.map(r => r.id))"
                  title="Pilih semua"
                />
              </th>
              <th>No</th>
              <th>Tanggal Bank</th><th>No Bank</th><th>Keterangan</th>
              <th>NPWP</th><th>Nama Penerbit</th>
              <th>No Faktur Pajak</th><th>Tanggal FP</th>
              <th class="num">DPP</th><th class="num">PPN</th>
              <th>Masa Kredit</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in sec.rows" :key="r.id">
              <td class="no-export"><input type="checkbox" :checked="selectedIds.has(r.id)" @change="multi.toggle(r.id)" /></td>
              <td>{{ i + 1 }}</td>
              <td>{{ formatDateShort(r.tanggal) }}</td>
              <td><input class="cell-input" style="min-width:110px;" :value="r.code" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { code: ($event.target as HTMLInputElement).value })" /></td>
              <td style="min-width:200px;">{{ r.description }}</td>
              <td style="min-width:220px;">
                <SearchSelect
                  :model-value="r.npwpId || ''"
                  :options="npwpOptions"
                  :disabled="isLocked(r.tanggal)"
                  placeholder="- pilih NPWP -"
                  allow-create
                  create-label="+ Tambah NPWP Baru…"
                  @update:model-value="(v) => patchRow(r, { npwpId: v || null })"
                  @create="onNpwpCreate(r)"
                />
              </td>
              <td>{{ npwpOf(r.npwpId)?.namaNpwp || '-' }}</td>
              <td><input class="cell-input" :value="r.noInvoice" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { noInvoice: ($event.target as HTMLInputElement).value })" /></td>
              <td>
                <input type="date" class="cell-input" :value="r.tanggalFp" :disabled="isLocked(r.tanggal)"
                  @change="patchRow(r, { tanggalFp: ($event.target as HTMLInputElement).value })" />
              </td>
              <td class="num"><input class="cell-input" :value="fmtNum(r.dpp, true)" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { dpp: parseNum(($event.target as HTMLInputElement).value) })" /></td>
              <td class="num"><input class="cell-input" :value="fmtNum(r.ppn, true)" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { ppn: parseNum(($event.target as HTMLInputElement).value) })" /></td>
              <td>
                <div style="display:flex;gap:2px;">
                  <select style="width:52px;" :value="(r.masaKredit || '').split('-')[1] || ''" :disabled="isLocked(r.tanggal)" @change="onMasaKredit(r, 'm', ($event.target as HTMLSelectElement).value)">
                    <option value="">-</option>
                    <option v-for="(m, mi) in MONTH_NAMES" :key="m" :value="String(mi + 1).padStart(2, '0')">{{ String(mi + 1).padStart(2, '0') }}</option>
                  </select>
                  <select style="width:56px;" :value="(r.masaKredit || '').split('-')[0] || String(today.getFullYear())" :disabled="isLocked(r.tanggal)" @change="onMasaKredit(r, 'y', ($event.target as HTMLSelectElement).value)">
                    <option v-for="y in kreditYears" :key="y" :value="String(y)">{{ String(y).slice(-2) }}</option>
                  </select>
                </div>
              </td>
            </tr>
            <tr class="grand-total-row">
              <td colspan="9" style="text-align:right;">TOTAL</td>
              <td class="num">{{ fmtRp(subtotal(sec.rows, 'dpp')) }}</td>
              <td class="num">{{ fmtRp(subtotal(sec.rows, 'ppn')) }}</td>
              <td></td>
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

.panel.no-export {
  padding: 6px 10px;
  margin-bottom: 8px;
}
.panel.no-export .upload-box {
  padding: 4px 8px;
  gap: 6px;
  margin-bottom: 4px;
}
.panel.no-export .btn {
  padding: 4px 9px;
  font-size: 11px;
}
.panel.no-export .lock-banner {
  padding: 4px 8px;
  font-size: 11px;
}

.table-wrap table.dense thead th {
  background: var(--group-thead-bg, var(--accent-light));
}
</style>
