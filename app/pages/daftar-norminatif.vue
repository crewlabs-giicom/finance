<script setup lang="ts">
import { fmtRp, formatDateShort, lightenColor, parseTagList } from '~/utils/format'

/**
 * Daftar Norminatif adalah tampilan turunan dari List Pajak — tidak punya tabel
 * sendiri. Yang ditampilkan hanya baris ppn_rows yang ditag "Norm" BARENG PPh 23
 * atau 21 BP (tag "Norm" sengaja gak bisa berdiri sendiri — harus dipasangkan
 * sama tag pajak biar user bisa milih baris mana yang mau dilaporin di sini);
 * edit di sini langsung menulis balik ke baris List Pajak yang sama.
 */

const api = useApi()
const { sections, load: loadGroups, myGroupId } = useGroups()
const { isLocked, refresh: refreshLock, label: lockLabel, lockYm } = usePeriodLock()
const { exportTables } = useXlsx()

type PpnRow = {
  id: string; groupId: string | null; tanggal: string; code: string | null
  description: string | null; tags: string | null; debet: number
  npwpId: string | null; pph23: number | null; pph23_4a2: number | null; pph21bp: number | null
  lampiranFakturPajak: string | null; bentukJenisBiaya: string | null
}
type Npwp = { id: string; noNpwp: string; namaNpwp: string; nik: string | null; alamat: string | null }

const rows = ref<PpnRow[]>([])
const npwps = ref<Npwp[]>([])

const today = new Date()
const filterFromMonth = ref(today.getMonth() + 1)
const filterFromYear = ref(today.getFullYear())
const filterToMonth = ref(today.getMonth() + 1)
const filterToYear = ref(today.getFullYear())
const filterGroup = ref('')
const filterJenis = ref<'all' | 'pph23' | 'pph21bp'>('all')
const status = ref<{ type: 'ok' | 'err'; msg: string } | null>(null)

const fromYm = computed(() => `${filterFromYear.value}-${String(filterFromMonth.value).padStart(2, '0')}`)
const toYm = computed(() => `${filterToYear.value}-${String(filterToMonth.value).padStart(2, '0')}`)

/** /api/ppn di-scope ke rentang tanggal — beda dari List Pajak yang butuh
 *  seluruh histori buat ringkasan Masa Kredit lintas periode, halaman ini
 *  cuma nampilin baris dalam rentang filter jadi aman di-scope. */
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

/** Baris cuma masuk Norminatif kalau ditag "Norm" DI Rincian Bank/List Pajak —
 *  tag pajak (PPH 23/21 BP) doang gak cukup, harus dipasangkan sama "Norm" biar
 *  user bisa milih-milih baris pajak mana yang beneran mau dilaporin di sini. */
function matchesJenis(r: PpnRow) {
  const list = parseTagList(r.tags)
  if (!list.includes('Norm')) return false
  if (filterJenis.value === 'pph23') return list.includes('PPH 23')
  if (filterJenis.value === 'pph21bp') return list.includes('21 BP')
  return list.includes('PPH 23') || list.includes('21 BP')
}
function jumlahPph(r: PpnRow) {
  return (r.pph23 || 0) + (r.pph23_4a2 || 0) + (r.pph21bp || 0)
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
        .filter(r => (r.groupId || '') === (s.id || '') && matchesJenis(r) && inPeriod(r.tanggal))
        .sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0))
    }))
    .filter(s => s.rows.length)
)

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

/** Pilihan "+ Tambah NPWP Baru" di dropdown, seperti onDnNpwpChange() di app lama. */
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
  await exportTables(tables.map(t => ({ table: t, sheetName: t.dataset.sheet || 'Sheet' })), 'Daftar_Norminatif')
}
</script>

<template>
  <div ref="root">
    <div class="topbar">
      <div>
        <h2>Daftar Norminatif</h2>
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
      <span class="gm-label" style="margin-left:10px;">Jenis PPh:</span>
      <select v-model="filterJenis">
        <option value="all">PPh 23 &amp; PPh 21 BP</option>
        <option value="pph23">PPh 23 saja</option>
        <option value="pph21bp">PPh 21 BP saja</option>
      </select>
    </PeriodRangeFilter>

    <div v-if="!visibleSections.length" class="empty-state">
      Belum ada data. Pastikan ada baris di List Pajak yang ditag "Norm" BARENG "PPH 23" atau "21 BP" (dua tag sekaligus), lalu cek filter periode di atas.
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
              <th rowspan="2" class="no-export">
                <input
                  type="checkbox"
                  :checked="sec.rows.length > 0 && sec.rows.every(r => selectedIds.has(r.id))"
                  @change="multi.toggleAll(sec.rows.map(r => r.id))"
                  title="Pilih semua"
                />
              </th>
              <th rowspan="2" title="Status tag &quot;21 BP&quot; di Rincian Bank/List Pajak">PPh 21</th>
              <th rowspan="2">No</th>
              <th colspan="4" style="text-align:center;">Data Penerima</th>
              <th rowspan="2">No. Transaksi</th>
              <th rowspan="2">Tanggal</th>
              <th rowspan="2">Bentuk dan Jenis Biaya</th>
              <th rowspan="2" class="num">Jumlah (Rp)</th>
              <th rowspan="2">Keterangan</th>
              <th colspan="2" style="text-align:center;">Pemotongan PPh</th>
            </tr>
            <tr>
              <th>Nama</th><th>NPWP</th><th>NIK</th><th>Alamat</th>
              <th class="num">Jumlah PPh</th><th>Nomor Bukti Potong</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in sec.rows" :key="r.id">
              <td class="no-export"><input type="checkbox" :checked="selectedIds.has(r.id)" @change="multi.toggle(r.id)" /></td>
              <td class="num"><input type="checkbox" :checked="parseTagList(r.tags).includes('21 BP')" disabled /></td>
              <td>{{ i + 1 }}</td>
              <td>{{ npwpOf(r.npwpId)?.namaNpwp || '-' }}</td>
              <td>
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
              <td>{{ npwpOf(r.npwpId)?.nik || '-' }}</td>
              <td>{{ npwpOf(r.npwpId)?.alamat || '-' }}</td>
              <td><input class="cell-input" :value="r.code" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { code: ($event.target as HTMLInputElement).value })" /></td>
              <td>{{ formatDateShort(r.tanggal) }}</td>
              <td><input class="cell-input" style="min-width:150px;" :value="r.bentukJenisBiaya" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { bentukJenisBiaya: ($event.target as HTMLInputElement).value })" /></td>
              <td class="num">{{ fmtRp(r.debet || 0) }}</td>
              <td>{{ r.description }}</td>
              <td class="num">{{ fmtRp(jumlahPph(r)) }}</td>
              <td><input class="cell-input" :value="r.lampiranFakturPajak" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { lampiranFakturPajak: ($event.target as HTMLInputElement).value })" /></td>
            </tr>
            <tr class="grand-total-row">
              <td colspan="10" style="text-align:right;">TOTAL</td>
              <td class="num">{{ fmtRp(sec.rows.reduce((a, r) => a + (r.debet || 0), 0)) }}</td>
              <td></td>
              <td class="num">{{ fmtRp(sec.rows.reduce((a, r) => a + jumlahPph(r), 0)) }}</td>
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

/* Header tabel ikut tone warna Grup (custom property di <thead>, berlaku ke kedua
   baris header, sticky per-<th> tetap normal). */
.table-wrap table.dense thead th {
  background: var(--group-thead-bg, var(--accent-light));
}
</style>
