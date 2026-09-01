<script setup lang="ts">
import { MONTH_NAMES, autoGrow, fmtNum, fmtRp, formatDateShort, parseNum, parseTagList, lightenColor } from '~/utils/format'
import { findHeaderRow, parseSheetDate, parseSheetNumber } from '~/utils/sheetImport'

const api = useApi()
const { sections, load: loadGroups, myGroupId } = useGroups()
const { isLocked, refresh: refreshLock, label: lockLabel, lockYm } = usePeriodLock()
const { readFileRows, exportTables } = useXlsx()
const rowColors = useRowColors('ppn')

type PpnRow = {
  id: string; sourceTxnId: string | null; groupId: string | null; tanggal: string
  code: string | null; store: string | null; description: string | null; tags: string | null
  debet: number; kredit: number; note: string | null; npwpId: string | null; noInvoice: string | null
  netDibayarkan: number | null; ppn: number | null; dpp: number | null
  pph23: number | null; pph23_4a2: number | null; pph21bp: number | null
  lampiranFakturPajak: string | null; masaKredit: string | null; bentukJenisBiaya: string | null
}
type Npwp = { id: string; noNpwp: string; namaNpwp: string }
type Tag = { id: string; nama: string }

const rows = ref<PpnRow[]>([])
const npwps = ref<Npwp[]>([])
const tags = ref<Tag[]>([])

const today = new Date()
const filterFromMonth = ref(today.getMonth() + 1)
const filterFromYear = ref(today.getFullYear())
const filterToMonth = ref(today.getMonth() + 1)
const filterToYear = ref(today.getFullYear())
const filterGroup = ref('')
const filterMasaKredit = ref('')
const uploadGroup = ref('')
const status = ref<{ type: 'ok' | 'err'; msg: string } | null>(null)

async function loadAll() {
  ;[rows.value, npwps.value, tags.value] = await Promise.all([
    api<PpnRow[]>('/api/ppn'),
    api<Npwp[]>('/api/master/npwp'),
    api<Tag[]>('/api/master/tags')
  ])
  await rowColors.load()
}
await Promise.all([loadAll(), loadGroups(), refreshLock()])
filterGroup.value = (await myGroupId()) || filterGroup.value

const fromYm = computed(() => `${filterFromYear.value}-${String(filterFromMonth.value).padStart(2, '0')}`)
const toYm = computed(() => `${filterToYear.value}-${String(filterToMonth.value).padStart(2, '0')}`)

function inPeriod(r: PpnRow) {
  const ym = (r.tanggal || '').slice(0, 7)
  return ym >= fromYm.value && ym <= toYm.value
}

const npwpOptions = computed(() => npwps.value.map(n => ({ id: n.id, label: n.namaNpwp })))

const visibleSections = computed(() =>
  sections.value
    .filter(s => !filterGroup.value || (s.id || '') === filterGroup.value)
    .map(s => ({
      ...s,
      rows: rows.value.filter(r =>
        (r.groupId || '') === (s.id || '') && inPeriod(r) &&
        (!filterMasaKredit.value || r.masaKredit === filterMasaKredit.value)
      )
    }))
    .filter(s => s.rows.length)
)

// -- ringkasan masa kredit --
const masaKreditOptions = computed(() =>
  [...new Set(rows.value.map(r => r.masaKredit).filter(Boolean) as string[])].sort()
)
function masaKreditLabel(mk: string | null) {
  if (!mk) return ''
  const [y, m] = mk.split('-')
  const mi = +m! - 1
  return mi >= 0 && mi < 12 ? `${MONTH_NAMES[mi]} ${y}` : mk
}
const masaKreditSummary = computed(() => {
  if (!filterMasaKredit.value) return null
  const sel = rows.value.filter(r => r.masaKredit === filterMasaKredit.value)
  const s = (k: keyof PpnRow) => sel.reduce((a, r) => a + (Number(r[k]) || 0), 0)
  return { count: sel.length, debet: s('debet'), pph23: s('pph23'), final: s('pph23_4a2'), pph21bp: s('pph21bp') }
})

const kreditYears = Array.from({ length: 6 }, (_, i) => today.getFullYear() - 3 + i)

/** Mirror computeTagFormula() di server/utils/tagSync.ts — beberapa tag pajak bisa
 *  aktif sekaligus, tiap tag ngisi kolom pajaknya sendiri, gak saling timpa. Semua
 *  tarif langsung dari nilai Debet (bukan dari DPP/Debet-dibagi-11%). */
function computeTagFormula(tagList: string[], debet: number) {
  const d = debet || 0
  let pph23: number | null = null, pph23_4a2: number | null = null, pph21bp: number | null = null
  if (tagList.includes('PPH 23')) pph23 = Math.round(d * 0.02)
  if (tagList.includes('PP 23')) pph23_4a2 = Math.round(d * 0.005)
  if (tagList.includes('Final') || tagList.includes('PPH 4')) pph23_4a2 = Math.round(d * 0.10)
  if (tagList.includes('21 BP')) pph21bp = Math.round(d * 0.025)
  return { pph23, pph23_4a2, pph21bp }
}

// -- klik buat pilih tag, bisa lebih dari satu (disimpen comma-separated), pola sama kayak Rincian Bank --
function clampMenuPos(evt: MouseEvent, menuWidth: number, menuHeight: number) {
  const x = Math.min(evt.clientX, window.innerWidth - menuWidth - 8)
  const y = Math.min(evt.clientY, window.innerHeight - menuHeight - 8)
  return { x: Math.max(8, x), y: Math.max(8, y) }
}
const tagMenu = reactive({ visible: false, x: 0, y: 0, targetId: '' })
function openTagMenu(evt: MouseEvent, id: string) {
  evt.stopPropagation()
  const pos = clampMenuPos(evt, 170, Math.min(260, 40 + tags.value.length * 27))
  tagMenu.visible = true
  tagMenu.x = pos.x
  tagMenu.y = pos.y
  tagMenu.targetId = id
}
function closeTagMenu() { tagMenu.visible = false }
const tagMenuSelected = computed(() => parseTagList(rows.value.find(x => x.id === tagMenu.targetId)?.tags))
async function toggleTag(tagName: string) {
  const r = rows.value.find(x => x.id === tagMenu.targetId)
  if (!r) return
  const list = parseTagList(r.tags)
  const i = list.indexOf(tagName)
  if (i > -1) list.splice(i, 1)
  else list.push(tagName)
  await patchRow(r, { tags: list.join(','), ...computeTagFormula(list, r.debet) })
}

async function patchRow(r: PpnRow, patch: Partial<PpnRow>) {
  try {
    await api(`/api/ppn/${r.id}`, { method: 'PATCH', body: patch })
    Object.assign(r, patch)
    status.value = null
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal update baris.' }
    await loadAll()
  }
}

async function onMasaKredit(r: PpnRow, part: 'y' | 'm', value: string) {
  const [curY, curM] = (r.masaKredit || '').split('-')
  const y = part === 'y' ? value : (curY || String(today.getFullYear()))
  const m = part === 'm' ? value : (curM || '')
  await patchRow(r, { masaKredit: y && m ? `${y}-${String(m).padStart(2, '0')}` : '' })
}

async function addRow(groupId: string | null) {
  try {
    const created = await api<PpnRow>('/api/ppn', {
      method: 'POST',
      body: { groupId, tanggal: `${fromYm.value}-01` }
    })
    rows.value.push(created)
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal tambah baris.' }
  }
}

const multi = useMultiSelect()
const selectedIds = multi.selectedIds
async function deleteSelected() {
  const ids = [...selectedIds]
  if (!ids.length) return
  if (!confirm(`Hapus ${ids.length} baris terpilih?`)) return
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

/** Duplicate lewat menu klik kanan — salin seluruh isi baris kecuali id & sumber transaksinya.
 *  Hasil duplicate diselipin persis di bawah baris aslinya, bukan ke ujung bawah daftar. */
async function duplicateRow(id: string) {
  const srcIndex = rows.value.findIndex(r => r.id === id)
  rowColors.close()
  if (srcIndex === -1) return
  const { id: _id, sourceTxnId: _s, ...body } = rows.value[srcIndex]!
  try {
    const created = await api<PpnRow>('/api/ppn', { method: 'POST', body })
    rows.value.splice(srcIndex + 1, 0, created)
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal duplicate.' }
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

const uploading = ref(false)
async function onUpload(evt: Event) {
  const input = evt.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

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

      const debet = parseSheetNumber(at('debet'))
      const tag = String(at('tags') || '').trim()
      const cand = {
        groupId: uploadGroup.value || null,
        tanggal,
        code: String(at('code') || '').trim(),
        store: String(at('store') || '').trim(),
        description: String(at('description') || '').trim(),
        tags: tag,
        debet,
        kredit: parseSheetNumber(at('kredit')),
        ...computeTagFormula(tag ? [tag] : [], debet)
      }
      const key = dupKey(cand as PpnRow)
      if (seen.has(key)) { dup++; continue }
      seen.add(key)
      payload.push(cand)
    }

    const res = await api<{ inserted: number; skipped: number }>('/api/ppn/bulk', { method: 'POST', body: { rows: payload } })
    await loadAll()

    let msg = `${res.inserted} baris diimpor, ${dup} duplikat dilewati`
    if (invalid) msg += `, ${invalid} baris tanpa tanggal valid dilewati`
    if (res.skipped) msg += `, ${res.skipped} baris ditolak server (periode terkunci / data kurang)`
    status.value = { type: res.inserted ? 'ok' : 'err', msg: msg + '.' }
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || e?.message || 'Gagal baca file Excel.' }
  } finally {
    uploading.value = false
  }
}

function dupKey(r: Pick<PpnRow, 'groupId' | 'tanggal' | 'code' | 'description' | 'debet' | 'kredit'>) {
  return `${r.groupId}|${r.tanggal}|${r.code}|${r.description}|${r.debet}|${r.kredit}`
}

const root = ref<HTMLElement | null>(null)
async function onExport() {
  const tables = Array.from(root.value?.querySelectorAll<HTMLTableElement>('table[data-sheet]') || [])
  if (!tables.length) { status.value = { type: 'err', msg: 'Belum ada tabel untuk diexport.' }; return }
  await exportTables(tables.map(t => ({ table: t, sheetName: t.dataset.sheet || 'Sheet' })), 'List_Pajak')
}

function subtotal(list: PpnRow[], key: keyof PpnRow) {
  return list.reduce((a, r) => a + (Number(r[key]) || 0), 0)
}
</script>

<template>
  <div ref="root" @click="rowColors.close(); closeTagMenu()">
    <div class="topbar">
      <div>
        <h2>List Pajak</h2>
      </div>
      <button v-if="selectedIds.size" class="btn danger no-export" @click="deleteSelected">🗑 Hapus {{ selectedIds.size }} Terpilih</button>
    </div>

    <StatusBox :status="status" />

    <div class="panel no-export">
      <div class="upload-box">
        <span class="gm-label">Upload ke Grup:</span>
        <select v-model="uploadGroup">
          <option value="">Tanpa Grup</option>
          <option v-for="s in sections.filter(x => x.id)" :key="s.id!" :value="s.id!">{{ s.nama }}</option>
        </select>
        <label class="btn" :class="{ disabled: uploading }" style="cursor:pointer;">
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
      <span class="gm-label" style="margin-left:10px;">Masa Kredit:</span>
      <select v-model="filterMasaKredit">
        <option value="">Semua Masa Kredit</option>
        <option v-for="mk in masaKreditOptions" :key="mk" :value="mk">{{ masaKreditLabel(mk) }}</option>
      </select>
    </PeriodRangeFilter>

    <div v-if="masaKreditSummary" class="status-box status-ok no-export" style="display:flex;gap:22px;flex-wrap:wrap;">
      <span>📊 Total Masa Kredit <b>{{ masaKreditLabel(filterMasaKredit) }}</b> ({{ masaKreditSummary.count }} baris):</span>
      <span>Debet: <b>{{ fmtRp(masaKreditSummary.debet) }}</b></span>
      <span>PPh 23: <b>{{ fmtRp(masaKreditSummary.pph23) }}</b></span>
      <span>Final: <b>{{ fmtRp(masaKreditSummary.final) }}</b></span>
      <span>PPh 21 BP: <b>{{ fmtRp(masaKreditSummary.pph21bp) }}</b></span>
    </div>

    <div v-if="!visibleSections.length" class="empty-state">
      Belum ada data pajak di periode ini. Upload file Excel atau tambah baris manual lewat tombol di tiap grup.
    </div>

    <div v-for="sec in visibleSections" :key="sec.id || 'none'" class="panel">
      <div class="group-head">
        <span class="group-dot" :style="{ background: sec.warna }" />
        {{ sec.nama }}
        <button class="btn secondary no-export" style="margin-left:auto;" @click="addRow(sec.id)">+ Baris</button>
      </div>

      <div class="table-wrap">
        <table class="dense" :data-sheet="sec.nama">
          <thead :style="{ '--group-thead-bg': lightenColor(sec.warna) }">
            <tr>
              <th class="no-export"><input type="checkbox" :checked="sec.rows.length > 0 && sec.rows.every(r => selectedIds.has(r.id))" @change="multi.toggleAll(sec.rows.map(r => r.id))" /></th>
              <th>Tanggal</th><th>No Bank</th><th>Store</th><th>Description</th><th>Tags</th>
              <th class="num">Debet</th><th class="num">Kredit</th>
              <th>NPWP</th><th>No Invoice</th>
              <th class="num">PPh 23</th><th class="num">Final</th><th class="num">PPh 21 BP</th>
              <th>Nomor Bukti Potong</th><th>Masa Kredit</th><th>Catatan</th>
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
              <td>
                <input type="date" class="cell-input" :value="r.tanggal" :disabled="isLocked(r.tanggal)"
                  @change="patchRow(r, { tanggal: ($event.target as HTMLInputElement).value })" />
              </td>
              <td><input class="cell-input" style="min-width:110px;" :value="r.code" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { code: ($event.target as HTMLInputElement).value })" /></td>
              <td><input class="cell-input" :value="r.store" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { store: ($event.target as HTMLInputElement).value })" /></td>
              <td style="min-width:200px;">
                <textarea
                  :ref="(el) => autoGrow(el)" class="wrap-textarea" rows="1" :disabled="isLocked(r.tanggal)"
                  :value="r.description" @input="autoGrow($event.target)"
                  @change="patchRow(r, { description: ($event.target as HTMLTextAreaElement).value })"
                ></textarea>
              </td>
              <td>
                <span
                  class="tag-cell" style="width:90px;"
                  :title="isLocked(r.tanggal) ? 'Periode terkunci' : 'Klik buat pilih tag (bisa lebih dari satu)'"
                  @click="!isLocked(r.tanggal) && openTagMenu($event, r.id)"
                >{{ r.tags ? r.tags.split(',').join(', ') : '-' }}</span>
              </td>
              <td class="num"><input class="cell-input" :value="fmtNum(r.debet, true)" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { debet: parseNum(($event.target as HTMLInputElement).value) })" /></td>
              <td class="num"><input class="cell-input" :value="fmtNum(r.kredit, true)" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { kredit: parseNum(($event.target as HTMLInputElement).value) })" /></td>
              <td style="min-width:220px;">
                <SearchSelect
                  :model-value="r.npwpId || ''"
                  :options="npwpOptions"
                  :disabled="isLocked(r.tanggal)"
                  placeholder="-"
                  @update:model-value="(v) => patchRow(r, { npwpId: v || null })"
                />
              </td>
              <td><input class="cell-input" :value="r.noInvoice" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { noInvoice: ($event.target as HTMLInputElement).value })" /></td>
              <td class="num"><input class="cell-input" :value="fmtNum(r.pph23, true)" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { pph23: parseNum(($event.target as HTMLInputElement).value) })" /></td>
              <td class="num"><input class="cell-input" :value="fmtNum(r.pph23_4a2, true)" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { pph23_4a2: parseNum(($event.target as HTMLInputElement).value) })" /></td>
              <td class="num"><input class="cell-input" :value="fmtNum(r.pph21bp, true)" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { pph21bp: parseNum(($event.target as HTMLInputElement).value) })" /></td>
              <td><input class="cell-input" :value="r.lampiranFakturPajak" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { lampiranFakturPajak: ($event.target as HTMLInputElement).value })" /></td>
              <td>
                <div style="display:flex;gap:2px;">
                  <select style="width:52px;" :value="(r.masaKredit || '').split('-')[1] || ''" :disabled="isLocked(r.tanggal)" @change="onMasaKredit(r, 'm', ($event.target as HTMLSelectElement).value)">
                    <option value="">-</option>
                    <option v-for="(m, i) in MONTH_NAMES" :key="m" :value="String(i + 1).padStart(2, '0')">{{ String(i + 1).padStart(2, '0') }}</option>
                  </select>
                  <select style="width:56px;" :value="(r.masaKredit || '').split('-')[0] || String(today.getFullYear())" :disabled="isLocked(r.tanggal)" @change="onMasaKredit(r, 'y', ($event.target as HTMLSelectElement).value)">
                    <option v-for="y in kreditYears" :key="y" :value="String(y)">{{ String(y).slice(-2) }}</option>
                  </select>
                </div>
              </td>
              <td><input class="cell-input" :value="r.note" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { note: ($event.target as HTMLInputElement).value })" /></td>
            </tr>
            <tr class="subtotal-row">
              <td class="no-export"></td>
              <td colspan="5">Subtotal {{ sec.nama }} ({{ sec.rows.length }} baris)</td>
              <td class="num">{{ fmtRp(subtotal(sec.rows, 'debet')) }}</td>
              <td class="num">{{ fmtRp(subtotal(sec.rows, 'kredit')) }}</td>
              <td colspan="2"></td>
              <td class="num">{{ fmtRp(subtotal(sec.rows, 'pph23')) }}</td>
              <td class="num">{{ fmtRp(subtotal(sec.rows, 'pph23_4a2')) }}</td>
              <td class="num">{{ fmtRp(subtotal(sec.rows, 'pph21bp')) }}</td>
              <td colspan="3"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <RowColorMenu :menu="rowColors.menu" show-duplicate @pick="rowColors.pick" @duplicate="duplicateRow" />

    <div
      v-if="tagMenu.visible" class="panel tag-picker-menu"
      style="position:fixed;z-index:50;padding:8px;width:170px;max-height:260px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.18);"
      :style="{ top: tagMenu.y + 'px', left: tagMenu.x + 'px' }"
      @click.stop
    >
      <div v-if="!tags.length" class="hint">Belum ada tag. Tambahin dulu di Master Data.</div>
      <label v-for="tg in tags" :key="tg.id" style="display:flex;align-items:center;gap:6px;padding:4px 2px;font-size:12.5px;cursor:pointer;">
        <input type="checkbox" :checked="tagMenuSelected.includes(tg.nama)" @change="toggleTag(tg.nama)" />
        {{ tg.nama }}
      </label>
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

/* Header tabel ikut tone warna Grup (di-set lewat custom property di <thead>, biar
   posisi sticky per-<th> tetap kepake normal). */
.table-wrap table.dense thead th {
  background: var(--group-thead-bg, var(--accent-light));
}
</style>
