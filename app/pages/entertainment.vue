<script setup lang="ts">
import { autoGrow, fmtNum, fmtRp, parseNum } from '~/utils/format'

const api = useApi()
const { sections, load: loadGroups, myGroupId } = useGroups()
const { isLocked, refresh: refreshLock, label: lockLabel, lockYm } = usePeriodLock()
const { exportTables } = useXlsx()
const rowColors = useRowColors('ent')

type EntRow = {
  id: string; sourceTxnId: string | null; groupId: string | null; tanggal: string
  place: string | null; alamat: string | null; description: string | null; jenis: string | null
  amount: number; clientName: string | null; posisi: string | null; company: string | null
  jenisUsaha: string | null; note: string | null
}

const rows = ref<EntRow[]>([])
const today = new Date()
const filterFromMonth = ref(today.getMonth() + 1)
const filterFromYear = ref(today.getFullYear())
const filterToMonth = ref(today.getMonth() + 1)
const filterToYear = ref(today.getFullYear())
const filterGroup = ref('')
const status = ref<{ type: 'ok' | 'err'; msg: string } | null>(null)

const addForm = reactive({ groupId: '', tanggal: '' })

async function loadAll() {
  rows.value = await api<EntRow[]>('/api/ent')
  await rowColors.load()
}
await Promise.all([loadAll(), loadGroups(), refreshLock()])
filterGroup.value = (await myGroupId()) || filterGroup.value

const fromYm = computed(() => `${filterFromYear.value}-${String(filterFromMonth.value).padStart(2, '0')}`)
const toYm = computed(() => `${filterToYear.value}-${String(filterToMonth.value).padStart(2, '0')}`)
function inPeriod(tanggal: string) {
  const ym = (tanggal || '').slice(0, 7)
  return ym >= fromYm.value && ym <= toYm.value
}

const visibleSections = computed(() =>
  sections.value
    .filter(s => !filterGroup.value || (s.id || '') === filterGroup.value)
    .map(s => ({
      ...s,
      rows: rows.value.filter(r => (r.groupId || '') === (s.id || '') && inPeriod(r.tanggal))
    }))
    .filter(s => s.rows.length)
)

async function addRow() {
  if (!addForm.tanggal) { status.value = { type: 'err', msg: 'Isi tanggal dulu.' }; return }
  try {
    await api('/api/ent', { method: 'POST', body: { groupId: addForm.groupId || null, tanggal: addForm.tanggal } })
    addForm.tanggal = ''
    await loadAll()
    status.value = { type: 'ok', msg: 'Baris ditambahkan.' }
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal tambah baris.' }
  }
}

async function patchRow(r: EntRow, patch: Partial<EntRow>) {
  try {
    await api(`/api/ent/${r.id}`, { method: 'PATCH', body: patch })
    Object.assign(r, patch)
    status.value = null
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal update.' }
    await loadAll()
  }
}

async function deleteRow(r: EntRow) {
  if (!confirm('Hapus baris ini?')) return
  try {
    await api(`/api/ent/${r.id}`, { method: 'DELETE' })
    rows.value = rows.value.filter(x => x.id !== r.id)
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal hapus baris.' }
  }
}

const multi = useMultiSelect()
const selectedIds = multi.selectedIds
async function deleteSelected() {
  const ids = [...selectedIds]
  if (!ids.length) return
  if (!confirm(`Hapus ${ids.length} baris terpilih?`)) return
  const deleted: string[] = []
  let fail = 0
  for (const id of ids) {
    try {
      await api(`/api/ent/${id}`, { method: 'DELETE' })
      selectedIds.delete(id)
      deleted.push(id)
    } catch {
      fail++
    }
  }
  rows.value = rows.value.filter(x => !deleted.includes(x.id))
  status.value = fail
    ? { type: 'err', msg: `${deleted.length} baris dihapus, ${fail} gagal (kemungkinan periode terkunci).` }
    : { type: 'ok', msg: `${deleted.length} baris dihapus.` }
}

/** Duplicate lewat menu klik kanan — salin seluruh isi baris kecuali id & sumber transaksinya. */
async function duplicateRow(id: string) {
  const src = rows.value.find(r => r.id === id)
  rowColors.close()
  if (!src) return
  const { id: _id, sourceTxnId: _s, ...body } = src
  try {
    await api('/api/ent', { method: 'POST', body })
    await loadAll()
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal duplicate.' }
  }
}

const root = ref<HTMLElement | null>(null)
async function onExport() {
  const tables = Array.from(root.value?.querySelectorAll<HTMLTableElement>('table[data-sheet]') || [])
  if (!tables.length) { status.value = { type: 'err', msg: 'Belum ada tabel untuk diexport.' }; return }
  await exportTables(tables.map(t => ({ table: t, sheetName: t.dataset.sheet || 'Sheet' })), 'Entertainment')
}
</script>

<template>
  <div ref="root" @click="rowColors.close()">
    <div class="topbar">
      <div>
        <h2>Entertainment</h2>
        <p>Pemberian entertainment &amp; relasi usaha. Baris bertanda 🔗 berasal dari transaksi bank yang di-tag di menu Rincian Bank.</p>
      </div>
      <button v-if="selectedIds.size" class="btn danger no-export" @click="deleteSelected">🗑 Hapus {{ selectedIds.size }} Terpilih</button>
      <button class="btn secondary no-export" @click="onExport">📥 Export Excel</button>
    </div>

    <StatusBox :status="status" />

    <div v-if="lockYm" class="lock-banner no-export">
      🔒 Periode terkunci sampai <strong>{{ lockLabel }}</strong>.
    </div>

    <div class="panel no-export">
      <div class="toolbar">
        <span class="gm-label">+ Tambah manual ke Grup:</span>
        <select v-model="addForm.groupId">
          <option value="">Tanpa Grup</option>
          <option v-for="s in sections.filter(x => x.id)" :key="s.id!" :value="s.id!">{{ s.nama }}</option>
        </select>
        <input v-model="addForm.tanggal" type="date" />
        <button class="btn" @click="addRow">+ Tambah</button>
      </div>
      <p class="hint">Semua kolom bisa langsung diketik di tabel. Klik kanan baris untuk mewarnai atau menduplikasi.</p>
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

    <div v-if="!visibleSections.length" class="empty-state">Belum ada data entertainment di periode ini.</div>

    <div v-for="sec in visibleSections" :key="sec.id || 'none'" class="panel">
      <div class="group-head">
        <span class="group-dot" :style="{ background: sec.warna }" />
        {{ sec.nama }}
        <span class="pill" style="margin-left:auto;">{{ fmtRp(sec.rows.reduce((a, r) => a + (r.amount || 0), 0)) }}</span>
      </div>

      <div class="table-wrap">
        <table class="dense" :data-sheet="sec.nama">
          <thead>
            <tr>
              <th class="no-export"><input type="checkbox" :checked="sec.rows.length > 0 && sec.rows.every(r => selectedIds.has(r.id))" @change="multi.toggleAll(sec.rows.map(r => r.id))" /></th>
              <th class="no-export"></th>
              <th>Tanggal</th><th>Place</th><th>Alamat</th><th>Description</th><th>Jenis</th>
              <th class="num">Amount</th><th>Client's Name</th><th>Posisi</th><th>Company</th>
              <th>Jenis Usaha</th><th>Note</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in sec.rows"
              :key="r.id"
              :style="rowColors.colorOf(r.id) ? `background:${rowColors.colorOf(r.id)}` : ''"
              @contextmenu="rowColors.open($event, r.id)"
            >
              <td class="no-export"><input type="checkbox" :checked="selectedIds.has(r.id)" @change="multi.toggle(r.id)" /></td>
              <td class="no-export">
                <span v-if="r.sourceTxnId" title="Berasal dari transaksi bank">🔗</span>
                <span class="row-del" @click="deleteRow(r)">✕</span>
              </td>
              <td><input type="date" class="cell-input" :value="r.tanggal" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { tanggal: ($event.target as HTMLInputElement).value })" /></td>
              <td><input class="cell-input" :value="r.place" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { place: ($event.target as HTMLInputElement).value })" /></td>
              <td><input class="cell-input" :value="r.alamat" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { alamat: ($event.target as HTMLInputElement).value })" /></td>
              <td style="min-width:200px;">
                <textarea
                  :ref="(el) => autoGrow(el)" class="wrap-textarea" rows="1" :disabled="isLocked(r.tanggal)"
                  :value="r.description" @input="autoGrow($event.target)"
                  @change="patchRow(r, { description: ($event.target as HTMLTextAreaElement).value })"
                ></textarea>
              </td>
              <td><input class="cell-input" :value="r.jenis" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { jenis: ($event.target as HTMLInputElement).value })" /></td>
              <td class="num"><input class="cell-input" :value="fmtNum(r.amount, true)" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { amount: parseNum(($event.target as HTMLInputElement).value) })" /></td>
              <td><input class="cell-input" :value="r.clientName" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { clientName: ($event.target as HTMLInputElement).value })" /></td>
              <td><input class="cell-input" :value="r.posisi" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { posisi: ($event.target as HTMLInputElement).value })" /></td>
              <td><input class="cell-input" :value="r.company" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { company: ($event.target as HTMLInputElement).value })" /></td>
              <td><input class="cell-input" :value="r.jenisUsaha" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { jenisUsaha: ($event.target as HTMLInputElement).value })" /></td>
              <td style="min-width:160px;">
                <textarea
                  :ref="(el) => autoGrow(el)" class="wrap-textarea" rows="1" :disabled="isLocked(r.tanggal)"
                  :value="r.note" @input="autoGrow($event.target)"
                  @change="patchRow(r, { note: ($event.target as HTMLTextAreaElement).value })"
                ></textarea>
              </td>
            </tr>
            <tr class="subtotal-row">
              <td class="no-export"></td>
              <td class="no-export"></td>
              <td colspan="5">Subtotal {{ sec.nama }} ({{ sec.rows.length }} baris)</td>
              <td class="num">{{ fmtRp(sec.rows.reduce((a, r) => a + (r.amount || 0), 0)) }}</td>
              <td colspan="5"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <RowColorMenu :menu="rowColors.menu" show-duplicate @pick="rowColors.pick" @duplicate="duplicateRow" />
  </div>
</template>
