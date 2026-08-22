<script setup lang="ts">
import { fmtNum, fmtRp, formatDateShort, parseNum } from '~/utils/format'
import { findHeaderRow, parseSheetDate, parseSheetNumber } from '~/utils/sheetImport'

const api = useApi()
const { sections, load: loadGroups } = useGroups()
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
const filterMonth = ref(today.getMonth() + 1)
const filterYear = ref(today.getFullYear())
const filterGroup = ref('')
const filterCoa = ref('')
const filterNoLawan = ref(false)

const uploadCoa = ref('')
const uploadGroup = ref('')
const uploading = ref(false)
const status = ref<{ type: 'ok' | 'err'; msg: string } | null>(null)

const addForm = reactive({ tanggal: '', description: '', code: '', store: '', tags: '', debet: '', kredit: '' })

async function loadAll() {
  ;[rows.value, coas.value, lawan.value] = await Promise.all([
    api<AvpRow[]>('/api/avp'),
    api<Coa[]>('/api/master/coa'),
    api<Lawan[]>('/api/avp/lawan')
  ])
  await rowColors.load()
}
await Promise.all([loadAll(), loadGroups(), refreshLock()])

const monthPrefix = computed(() => `${filterYear.value}-${String(filterMonth.value).padStart(2, '0')}`)

function partnersOf(rowId: string) {
  const ids = lawan.value.filter(l => l.rowId === rowId).map(l => l.partnerId)
  return rows.value.filter(r => ids.includes(r.id))
}
/** Nilai baris = sisi yang terisi; dipakai untuk membandingkan dengan total lawannya. */
function rowAmount(r: AvpRow) {
  return r.debet > 0 ? r.debet : r.kredit
}
function matchedTotal(r: AvpRow) {
  return partnersOf(r.id).reduce((a, p) => a + rowAmount(p), 0)
}

const visibleSections = computed(() =>
  sections.value
    .filter(s => !filterGroup.value || (s.id || '') === filterGroup.value)
    .map(s => {
      const secRows = rows.value.filter(r =>
        (r.groupId || '') === (s.id || '') &&
        (r.tanggal || '').startsWith(monthPrefix.value) &&
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

/** Kandidat lawan: baris di sisi berlawanan yang belum dipasangkan dengan baris ini. */
function candidatesFor(r: AvpRow) {
  const already = new Set(partnersOf(r.id).map(p => p.id))
  const wantKredit = r.debet > 0
  return rows.value.filter(x =>
    x.id !== r.id && !already.has(x.id) && (wantKredit ? x.kredit > 0 : x.debet > 0)
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

async function addRow() {
  if (!addForm.tanggal) { status.value = { type: 'err', msg: 'Isi tanggal dulu.' }; return }
  if (!uploadCoa.value) { status.value = { type: 'err', msg: 'Pilih COA dulu di bagian atas.' }; return }
  try {
    await api('/api/avp', {
      method: 'POST',
      body: {
        coaId: uploadCoa.value, groupId: uploadGroup.value || null, tanggal: addForm.tanggal,
        description: addForm.description, code: addForm.code, store: addForm.store, tags: addForm.tags,
        debet: parseNum(addForm.debet), kredit: parseNum(addForm.kredit)
      }
    })
    Object.assign(addForm, { tanggal: '', description: '', code: '', store: '', tags: '', debet: '', kredit: '' })
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
    const sheet = await readFileRows(file)
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
        <p>Upload transaksi (.xlsx) per COA, lalu carikan pasangan debit-kreditnya. Baris yang totalnya sudah imbang ditandai hijau.</p>
      </div>
      <button class="btn secondary no-export" @click="onExport">📥 Export Excel</button>
    </div>

    <StatusBox :status="status" />

    <div v-if="lockYm" class="lock-banner no-export">
      🔒 Periode terkunci sampai <strong>{{ lockLabel }}</strong>.
    </div>

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
      </div>
      <p class="hint">Wajib pilih COA dulu (Grup opsional). File butuh kolom Date, Code, Store, Description, Tags, Debet, Kredit.</p>

      <div class="toolbar" style="margin-top:10px;">
        <span class="gm-label">+ Tambah manual:</span>
        <input v-model="addForm.tanggal" type="date" />
        <input v-model="addForm.description" placeholder="Description…" style="width:180px;" />
        <input v-model="addForm.code" placeholder="Code" style="width:90px;" />
        <input v-model="addForm.store" placeholder="Store" style="width:110px;" />
        <input v-model="addForm.tags" placeholder="Tags" style="width:90px;" />
        <input v-model="addForm.debet" placeholder="Debet" style="width:100px;text-align:right;" />
        <input v-model="addForm.kredit" placeholder="Kredit" style="width:100px;text-align:right;" />
        <button class="btn" @click="addRow">+ Tambah</button>
      </div>
      <p class="hint">Tambah manual memakai COA &amp; Grup yang dipilih di atas.</p>
    </div>

    <PeriodFilter v-model:month="filterMonth" v-model:year="filterYear">
      <span class="gm-label" style="margin-left:10px;">Grup:</span>
      <select v-model="filterGroup">
        <option value="">Semua grup</option>
        <option v-for="s in sections" :key="s.id || 'none'" :value="s.id || ''">{{ s.nama }}</option>
      </select>
      <span class="gm-label" style="margin-left:10px;">COA:</span>
      <select v-model="filterCoa">
        <option value="">Semua COA</option>
        <option v-for="c in coas" :key="c.id" :value="c.id">{{ c.noCoa }} — {{ c.namaCoa }}</option>
      </select>
      <label style="display:flex;align-items:center;gap:5px;margin-left:10px;font-size:12.5px;font-weight:600;cursor:pointer;">
        <input v-model="filterNoLawan" type="checkbox" /> Belum ada lawan
      </label>
    </PeriodFilter>

    <div v-if="!visibleSections.length" class="empty-state">Belum ada data Aktiva-Pasiva sesuai filter ini.</div>

    <div v-for="sec in visibleSections" :key="sec.id || 'none'" class="panel">
      <div class="group-head">
        <span class="group-dot" :style="{ background: sec.warna }" />
        {{ sec.nama }}
      </div>

      <div v-for="cg in sec.coaGroups" :key="cg.coaId" style="margin-bottom:14px;">
        <div class="gm-label" style="margin-bottom:6px;">{{ cg.label }}</div>
        <div class="table-wrap">
          <table class="dense" :data-sheet="`${sec.nama} ${cg.label}`">
            <thead>
              <tr>
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
                <td class="no-export"><span class="row-del" @click="deleteRow(r)">✕</span></td>
                <td><input type="date" class="cell-input" :value="r.tanggal" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { tanggal: ($event.target as HTMLInputElement).value })" /></td>
                <td><input class="cell-input" :value="r.code" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { code: ($event.target as HTMLInputElement).value })" /></td>
                <td><input class="cell-input" :value="r.store" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { store: ($event.target as HTMLInputElement).value })" /></td>
                <td><input class="cell-input" style="min-width:180px;" :value="r.description" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { description: ($event.target as HTMLInputElement).value })" /></td>
                <td><input class="cell-input" :value="r.tags" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { tags: ($event.target as HTMLInputElement).value })" /></td>
                <td class="num"><input class="cell-input" :value="fmtNum(r.debet, true)" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { debet: parseNum(($event.target as HTMLInputElement).value) })" /></td>
                <td class="num"><input class="cell-input" :value="fmtNum(r.kredit, true)" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { kredit: parseNum(($event.target as HTMLInputElement).value) })" /></td>
                <td>
                  <div style="display:flex;flex-direction:column;gap:3px;min-width:190px;">
                    <span v-for="p in partnersOf(r.id)" :key="p.id" class="chip">
                      {{ formatDateShort(p.tanggal) }} · {{ fmtRp(rowAmount(p)) }}
                      <span class="chip-del no-export" title="Lepas pasangan" @click="removeLawan(r, p.id)">✕</span>
                    </span>
                    <select class="no-export" @change="addLawan(r, ($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
                      <option value="">+ tambah lawan…</option>
                      <option v-for="c in candidatesFor(r)" :key="c.id" :value="c.id">
                        {{ formatDateShort(c.tanggal) }} · {{ fmtRp(rowAmount(c)) }} · {{ c.description }}
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

    <RowColorMenu :menu="rowColors.menu" @pick="rowColors.pick" />
  </div>
</template>
