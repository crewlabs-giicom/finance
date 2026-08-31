<script setup lang="ts">
import { autoGrow, fmtNum, fmtRp, formatDateShort, parseNum, lightenColor } from '~/utils/format'
import { findHeaderRow, parseSheetDate, parseSheetNumber } from '~/utils/sheetImport'

const api = useApi()
const { sections, load: loadGroups, myGroupId } = useGroups()
const { isLocked, refresh: refreshLock, label: lockLabel, lockYm } = usePeriodLock()
const { readFileRows, exportTables } = useXlsx()
const rowColors = useRowColors('avp')

type AvpRow = {
  id: string; coaId: string | null; groupId: string | null; tanggal: string
  code: string | null; store: string | null; description: string | null; tags: string | null
  debet: number; kredit: number
}
type Coa = { id: string; noCoa: string; namaCoa: string }
type Lawan = { id: string; rowId: string; partnerId: string }

const rows = ref<AvpRow[]>([])
const coas = ref<Coa[]>([])
const lawan = ref<Lawan[]>([])

const today = new Date()
const filterFromMonth = ref(today.getMonth() + 1)
const filterFromYear = ref(today.getFullYear())
const filterToMonth = ref(today.getMonth() + 1)
const filterToYear = ref(today.getFullYear())
const filterGroup = ref('')
const filterCoa = ref('')
const filterNoLawan = ref(false)

const multi = useMultiSelect()
const selectedIds = multi.selectedIds
async function deleteSelected() {
  const ids = [...selectedIds]
  if (!ids.length) return
  if (!confirm(`Hapus ${ids.length} baris terpilih? Pasangan lawannya ikut lepas.`)) return
  let ok = 0, fail = 0
  for (const id of ids) {
    try {
      const r = rows.value.find(x => x.id === id)
      if (r) for (const p of partnersOf(r.id)) await removeLawan(r, p.id)
      await api(`/api/avp/${id}`, { method: 'DELETE' })
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

const uploadCoa = ref('')
const uploadGroup = ref('')
const uploading = ref(false)
const status = ref<{ type: 'ok' | 'err'; msg: string } | null>(null)

type AddForm = { tanggal: string; description: string; code: string; store: string; tags: string; debet: string; kredit: string }
const addForms = reactive<Record<string, AddForm>>({})
function addFormKey(groupId: string | null, coaId: string | null) {
  return `${groupId || ''}|${coaId || ''}`
}
function toggleAddForm(groupId: string | null, coaId: string | null) {
  const key = addFormKey(groupId, coaId)
  if (addForms[key]) delete addForms[key]
  else addForms[key] = { tanggal: '', description: '', code: '', store: '', tags: '', debet: '', kredit: '' }
}

async function loadAll() {
  ;[rows.value, coas.value, lawan.value] = await Promise.all([
    api<AvpRow[]>('/api/avp'),
    api<Coa[]>('/api/master/coa'),
    api<Lawan[]>('/api/avp/lawan')
  ])
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

/** rowId -> array partnerId, dikelompokkan sekali (bukan filter ulang tiap baris dirender). */
const lawanByRow = computed(() => {
  const map = new Map<string, string[]>()
  for (const l of lawan.value) {
    if (!map.has(l.rowId)) map.set(l.rowId, [])
    map.get(l.rowId)!.push(l.partnerId)
  }
  return map
})
const rowById = computed(() => new Map(rows.value.map(r => [r.id, r])))
function partnersOf(rowId: string) {
  const ids = lawanByRow.value.get(rowId)
  if (!ids) return []
  const byId = rowById.value
  return ids.map(id => byId.get(id)).filter((r): r is AvpRow => !!r)
}
/** Nilai baris = sisi yang terisi; dipakai untuk membandingkan dengan total lawannya. */
function rowAmount(r: AvpRow) {
  return r.debet > 0 ? r.debet : r.kredit
}
function matchedTotal(r: AvpRow) {
  return partnersOf(r.id).reduce((a, p) => a + rowAmount(p), 0)
}
/** Baris di-split per sisi sekali, biar candidatesFor gak nyisir baris sisi yang sama. */
const debetRows = computed(() => rows.value.filter(r => r.debet > 0))
const kreditRows = computed(() => rows.value.filter(r => r.kredit > 0))

const visibleSections = computed(() =>
  sections.value
    .filter(s => !filterGroup.value || (s.id || '') === filterGroup.value)
    .map(s => {
      const secRows = rows.value.filter(r =>
        (r.groupId || '') === (s.id || '') &&
        inPeriod(r.tanggal) &&
        (!filterCoa.value || r.coaId === filterCoa.value) &&
        (!filterNoLawan.value || partnersOf(r.id).length === 0)
      )
      // Dikelompokkan per COA supaya tiap COA punya subtotal sendiri, seperti app lama.
      const byCoa = new Map<string, AvpRow[]>()
      for (const r of secRows) {
        const key = r.coaId || ''
        if (!byCoa.has(key)) byCoa.set(key, [])
        byCoa.get(key)!.push(r)
      }
      return {
        ...s,
        coaGroups: [...byCoa.entries()].map(([coaId, list]) => ({
          coaId,
          label: coaLabel(coaId),
          rows: list
        }))
      }
    })
    .filter(s => s.coaGroups.length)
)

function coaLabel(id: string | null) {
  const c = coas.value.find(x => x.id === id)
  return c ? `${c.noCoa} — ${c.namaCoa}` : 'Tanpa COA'
}

/** Kandidat lawan: baris di sisi berlawanan yang belum dipasangkan dan masih muat di sisa kapasitas baris ini
 *  (total lawan gak boleh lebih dari nilai baris itu sendiri). */
function candidatesFor(r: AvpRow) {
  const already = new Set(partnersOf(r.id).map(p => p.id))
  const wantKredit = r.debet > 0
  const remaining = rowAmount(r) - matchedTotal(r)
  const pool = wantKredit ? kreditRows.value : debetRows.value
  return pool.filter(x =>
    x.id !== r.id && !already.has(x.id) &&
    rowAmount(x) <= remaining + 0.5
  )
}

async function addLawan(r: AvpRow, partnerId: string) {
  if (!partnerId) return
  try {
    await api('/api/avp/lawan', { method: 'POST', body: { rowId: r.id, partnerId } })
    lawan.value = await api<Lawan[]>('/api/avp/lawan')
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal pasangkan lawan.' }
  }
}
async function removeLawan(r: AvpRow, partnerId: string) {
  try {
    await api(`/api/avp/lawan?rowId=${r.id}&partnerId=${partnerId}`, { method: 'DELETE' })
    lawan.value = await api<Lawan[]>('/api/avp/lawan')
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal lepas lawan.' }
  }
}

async function addRowFor(groupId: string | null, coaId: string | null) {
  const key = addFormKey(groupId, coaId)
  const f = addForms[key]
  if (!f) return
  if (!f.tanggal) { status.value = { type: 'err', msg: 'Isi tanggal dulu.' }; return }
  try {
    await api('/api/avp', {
      method: 'POST',
      body: {
        coaId, groupId, tanggal: f.tanggal,
        description: f.description, code: f.code, store: f.store, tags: f.tags,
        debet: parseNum(f.debet), kredit: parseNum(f.kredit)
      }
    })
    delete addForms[key]
    await loadAll()
    status.value = { type: 'ok', msg: 'Baris ditambahkan.' }
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal tambah baris.' }
  }
}

async function patchRow(r: AvpRow, patch: Partial<AvpRow>) {
  try {
    await api(`/api/avp/${r.id}`, { method: 'PATCH', body: patch })
    Object.assign(r, patch)
    status.value = null
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal update.' }
    await loadAll()
  }
}
async function deleteRow(r: AvpRow) {
  if (!confirm('Hapus baris ini? Pasangan lawannya ikut lepas.')) return
  try {
    for (const p of partnersOf(r.id)) await removeLawan(r, p.id)
    await api(`/api/avp/${r.id}`, { method: 'DELETE' })
    await loadAll()
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal hapus baris.' }
  }
}

// -- import Excel --
const HEADERS = {
  tanggal: ['DATE', 'TANGGAL'],
  code: ['CODE', 'KODE'],
  store: ['STORE', 'TOKO'],
  description: ['DESCRIPTION', 'DESKRIPSI', 'KETERANGAN'],
  tags: ['TAGS', 'TAG'],
  debet: ['DEBET', 'DEBIT'],
  kredit: ['KREDIT', 'CREDIT']
}
function dupKey(r: Pick<AvpRow, 'coaId' | 'groupId' | 'tanggal' | 'code' | 'description' | 'debet' | 'kredit'>) {
  return `${r.coaId}|${r.groupId}|${r.tanggal}|${r.code}|${r.description}|${r.debet}|${r.kredit}`
}

async function onUpload(evt: Event) {
  const input = evt.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!uploadCoa.value) { status.value = { type: 'err', msg: 'Pilih COA dulu sebelum upload.' }; return }

  uploading.value = true
  try {
    const sheet = await readFileRows(file, HEADERS, 3)
    const header = findHeaderRow(sheet, HEADERS, 3)
    if (!header) {
      status.value = { type: 'err', msg: 'Header kolom tidak ketemu. File butuh kolom Date, Code, Store, Description, Tags, Debet, Kredit.' }
      return
    }

    const seen = new Set(rows.value.map(dupKey))
    const payload: Record<string, unknown>[] = []
    let dup = 0, invalid = 0

    for (let i = header.index + 1; i < sheet.length; i++) {
      const r = sheet[i] || []
      const at = (f: string) => header.map[f] === undefined ? '' : r[header.map[f]!]
      const tanggal = parseSheetDate(at('tanggal'))
      if (!tanggal) { invalid++; continue }
      const cand = {
        coaId: uploadCoa.value,
        groupId: uploadGroup.value || null,
        tanggal,
        code: String(at('code') || '').trim(),
        store: String(at('store') || '').trim(),
        description: String(at('description') || '').trim(),
        tags: String(at('tags') || '').trim(),
        debet: parseSheetNumber(at('debet')),
        kredit: parseSheetNumber(at('kredit'))
      }
      const key = dupKey(cand as AvpRow)
      if (seen.has(key)) { dup++; continue }
      seen.add(key)
      payload.push(cand)
    }

    const res = await api<{ inserted: number; skipped: number }>('/api/avp/bulk', { method: 'POST', body: { rows: payload } })
    await loadAll()

    let msg = `${res.inserted} baris diimpor ke COA ${coaLabel(uploadCoa.value)}, ${dup} duplikat dilewati`
    if (invalid) msg += `, ${invalid} baris tanpa tanggal valid dilewati`
    if (res.skipped) msg += `, ${res.skipped} baris ditolak server (periode terkunci / data kurang)`
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
  if (!tables.length) { status.value = { type: 'err', msg: 'Belum ada tabel untuk diexport.' }; return }
  await exportTables(tables.map(t => ({ table: t, sheetName: t.dataset.sheet || 'Sheet' })), 'Aktiva_Pasiva')
}
</script>

<template>
  <div ref="root" @click="rowColors.close()">
    <div class="topbar">
      <div>
        <h2>Aktiva - Pasiva</h2>
      </div>
      <button v-if="selectedIds.size" class="btn danger no-export" @click="deleteSelected">🗑 Hapus {{ selectedIds.size }} Terpilih</button>
    </div>

    <StatusBox :status="status" />

    <div class="panel no-export">
      <div class="upload-box">
        <span class="gm-label">Upload ke COA:</span>
        <select v-model="uploadCoa">
          <option value="">— pilih COA —</option>
          <option v-for="c in coas" :key="c.id" :value="c.id">{{ c.noCoa }} — {{ c.namaCoa }}</option>
        </select>
        <span class="gm-label">Grup:</span>
        <select v-model="uploadGroup">
          <option value="">Tanpa Grup</option>
          <option v-for="s in sections.filter(x => x.id)" :key="s.id!" :value="s.id!">{{ s.nama }}</option>
        </select>
        <label class="btn" style="cursor:pointer;">
          {{ uploading ? '⏳ Memproses…' : '📤 Upload Excel' }}
          <input type="file" accept=".xlsx,.xls" style="display:none;" :disabled="uploading" @change="onUpload" />
        </label>
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
      <span class="gm-label" style="margin-left:10px;">COA:</span>
      <select v-model="filterCoa">
        <option value="">— pilih COA —</option>
        <option v-for="c in coas" :key="c.id" :value="c.id">{{ c.noCoa }} — {{ c.namaCoa }}</option>
      </select>
      <label style="display:flex;align-items:center;gap:5px;margin-left:10px;font-size:12.5px;font-weight:600;cursor:pointer;">
        <input v-model="filterNoLawan" type="checkbox" /> Belum ada lawan
      </label>
    </PeriodRangeFilter>

    <div v-if="!filterCoa" class="empty-state">Pilih COA dulu di filter "COA" di atas buat lihat datanya.</div>
    <template v-else>
      <div v-if="!visibleSections.length" class="empty-state">Belum ada data Aktiva-Pasiva sesuai filter ini.</div>

      <div v-for="sec in visibleSections" :key="sec.id || 'none'" class="panel">
        <div class="group-head">
          <span class="group-dot" :style="{ background: sec.warna }" />
          {{ sec.nama }}
        </div>

      <div v-for="cg in sec.coaGroups" :key="cg.coaId" style="margin-bottom:14px;">
        <div class="gm-label" style="margin-bottom:6px;display:flex;align-items:center;gap:8px;">
          {{ cg.label }}
          <button
            class="btn secondary no-export" style="padding:2px 9px;font-size:11px;"
            @click="toggleAddForm(sec.id, cg.coaId || null)"
          >{{ addForms[addFormKey(sec.id, cg.coaId || null)] ? '✕ Batal' : '+ Tambah' }}</button>
        </div>
        <div v-if="addForms[addFormKey(sec.id, cg.coaId || null)]" class="toolbar no-export" style="margin-bottom:8px;">
          <input v-model="addForms[addFormKey(sec.id, cg.coaId || null)].tanggal" type="date" />
          <input v-model="addForms[addFormKey(sec.id, cg.coaId || null)].description" placeholder="Description…" style="width:180px;" />
          <input v-model="addForms[addFormKey(sec.id, cg.coaId || null)].code" placeholder="Code" style="width:90px;" />
          <input v-model="addForms[addFormKey(sec.id, cg.coaId || null)].store" placeholder="Store" style="width:110px;" />
          <input v-model="addForms[addFormKey(sec.id, cg.coaId || null)].tags" placeholder="Tags" style="width:90px;" />
          <input v-model="addForms[addFormKey(sec.id, cg.coaId || null)].debet" placeholder="Debet" style="width:100px;text-align:right;" />
          <input v-model="addForms[addFormKey(sec.id, cg.coaId || null)].kredit" placeholder="Kredit" style="width:100px;text-align:right;" />
          <button class="btn" @click="addRowFor(sec.id, cg.coaId || null)">+ Tambah</button>
        </div>
        <div class="table-wrap">
          <table class="dense" :data-sheet="`${sec.nama} ${cg.label}`">
            <thead :style="{ '--group-thead-bg': lightenColor(sec.warna) }">
              <tr>
                <th class="no-export"><input type="checkbox" :checked="cg.rows.length > 0 && cg.rows.every(r => selectedIds.has(r.id))" @change="multi.toggleAll(cg.rows.map(r => r.id))" /></th>
                <th class="no-export"></th>
                <th>Tanggal</th><th>Code</th><th>Store</th><th>Description</th><th>Tags</th>
                <th class="num">Debet</th><th class="num">Kredit</th>
                <th>Lawan</th><th class="num">Total Lawan</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in cg.rows"
                :key="r.id"
                :style="rowColors.colorOf(r.id) ? `background:${rowColors.colorOf(r.id)}` : ''"
                @contextmenu="rowColors.open($event, r.id)"
              >
                <td class="no-export"><input type="checkbox" :checked="selectedIds.has(r.id)" @change="multi.toggle(r.id)" /></td>
                <td class="no-export"><span class="row-del" @click="deleteRow(r)">✕</span></td>
                <td><input type="date" class="cell-input" :value="r.tanggal" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { tanggal: ($event.target as HTMLInputElement).value })" /></td>
                <td style="min-width:110px;">
                  <textarea
                    :ref="(el) => autoGrow(el)" class="wrap-textarea" rows="1" :disabled="isLocked(r.tanggal)"
                    :value="r.code" @input="autoGrow($event.target)"
                    @change="patchRow(r, { code: ($event.target as HTMLTextAreaElement).value })"
                  ></textarea>
                </td>
                <td><input class="cell-input" :value="r.store" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { store: ($event.target as HTMLInputElement).value })" /></td>
                <td style="min-width:220px;">
                  <textarea
                    :ref="(el) => autoGrow(el)" class="wrap-textarea" rows="1" :disabled="isLocked(r.tanggal)"
                    :value="r.description" @input="autoGrow($event.target)"
                    @change="patchRow(r, { description: ($event.target as HTMLTextAreaElement).value })"
                  ></textarea>
                </td>
                <td><input class="cell-input" :value="r.tags" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { tags: ($event.target as HTMLInputElement).value })" /></td>
                <td class="num"><input class="cell-input" :value="fmtNum(r.debet, true)" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { debet: parseNum(($event.target as HTMLInputElement).value) })" /></td>
                <td class="num"><input class="cell-input" :value="fmtNum(r.kredit, true)" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { kredit: parseNum(($event.target as HTMLInputElement).value) })" /></td>
                <td>
                  <div style="display:flex;flex-direction:column;gap:3px;min-width:190px;">
                    <span v-for="p in partnersOf(r.id)" :key="p.id" class="chip">
                      {{ formatDateShort(p.tanggal) }} · {{ p.code || '-' }} · {{ fmtRp(rowAmount(p)) }}
                      <span class="chip-del no-export" title="Lepas pasangan" @click="removeLawan(r, p.id)">✕</span>
                    </span>
                    <select class="no-export" @change="addLawan(r, ($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
                      <option value="">+ tambah lawan…</option>
                      <option v-for="c in candidatesFor(r)" :key="c.id" :value="c.id">
                        {{ formatDateShort(c.tanggal) }} · {{ c.code || '-' }} · {{ fmtRp(rowAmount(c)) }} · {{ c.description }}
                      </option>
                    </select>
                  </div>
                </td>
                <td class="num">{{ fmtRp(matchedTotal(r)) }}</td>
                <td>
                  <span v-if="!partnersOf(r.id).length" class="pill">belum ada lawan</span>
                  <span v-else-if="Math.round(matchedTotal(r)) === Math.round(rowAmount(r))" class="pill" style="background:var(--green-bg);color:var(--green);">imbang</span>
                  <span v-else class="pill overdue">selisih {{ fmtRp(rowAmount(r) - matchedTotal(r)) }}</span>
                </td>
              </tr>
              <tr class="subtotal-row">
                <td class="no-export"></td>
                <td class="no-export"></td>
                <td colspan="5">Subtotal {{ cg.label }} ({{ cg.rows.length }} baris)</td>
                <td class="num">{{ fmtRp(cg.rows.reduce((a, r) => a + r.debet, 0)) }}</td>
                <td class="num">{{ fmtRp(cg.rows.reduce((a, r) => a + r.kredit, 0)) }}</td>
                <td colspan="3"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    </template>

    <RowColorMenu :menu="rowColors.menu" @pick="rowColors.pick" />
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
.panel.no-export .gm-label {
  font-size: 11px;
}
.panel.no-export .upload-box select {
  padding: 4px 7px;
  font-size: 11px;
}
.panel.no-export .lock-banner {
  padding: 4px 8px;
  font-size: 11px;
}

/* Header tabel ikut tone warna Grup (custom property di <thead>, sticky per-<th> tetap normal). */
.table-wrap table.dense thead th {
  background: var(--group-thead-bg, var(--accent-light));
}
</style>
