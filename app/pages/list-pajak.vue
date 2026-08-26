<script setup lang="ts">
import { MONTH_NAMES, fmtNum, fmtRp, formatDateShort, parseNum } from '~/utils/format'
import { findHeaderRow, parseSheetDate, parseSheetNumber } from '~/utils/sheetImport'

const api = useApi()
const { sections, load: loadGroups } = useGroups()
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
const filterMonth = ref(today.getMonth() + 1)
const filterYear = ref(today.getFullYear())
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

const monthPrefix = computed(() => `${filterYear.value}-${String(filterMonth.value).padStart(2, '0')}`)

function inPeriod(r: PpnRow) {
  return (r.tanggal || '').startsWith(monthPrefix.value)
}

const visibleSections = computed(() =>
  sections.value
    .filter(s => !filterGroup.value || (s.id || '') === filterGroup.value)
    .map(s => ({ ...s, rows: rows.value.filter(r => (r.groupId || '') === (s.id || '') && inPeriod(r)) }))
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

/**
 * Formula otomatis per Tag, diport dari ppnComputeTagFormula():
 * DPP = Debet / 11%, lalu dikali tarif masing-masing jenis pajak.
 */
function tagFormula(tag: string, debet: number): Partial<PpnRow> {
  const base = (debet || 0) / 0.11
  if (tag === 'PPH 23') return { pph23: Math.round(base * 0.02) }
  if (tag === 'PP 23') return { pph23_4a2: Math.round(base * 0.005) }
  if (tag === 'PPH 4') return { pph23_4a2: Math.round(base * 0.10) }
  if (tag === '21 BP') return { pph21bp: Math.round(base * 0.025) }
  return {}
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

/** Ganti tag = reset kolom pajak turunan, lalu isi ulang sesuai formula tag baru. */
async function onTagChange(r: PpnRow, tag: string) {
  await patchRow(r, { tags: tag, pph23: null, pph23_4a2: null, pph21bp: null, ...tagFormula(tag, r.debet) })
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
      body: { groupId, tanggal: `${monthPrefix.value}-01` }
    })
    rows.value.push(created)
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal tambah baris.' }
  }
}
async function deleteRow(r: PpnRow) {
  if (!confirm('Hapus baris ini?')) return
  try {
    await api(`/api/ppn/${r.id}`, { method: 'DELETE' })
    rows.value = rows.value.filter(x => x.id !== r.id)
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

const uploading = ref(false)
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
        ...tagFormula(tag, debet)
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
  <div ref="root" @click="rowColors.close()">
    <div class="topbar">
      <div>
        <h2>List Pajak</h2>
        <p>Upload transaksi dari sistem lain (.xlsx), lengkapi kolom pajaknya, lalu dikelompokkan sesuai grup.</p>
      </div>
      <button class="btn secondary no-export" @click="onExport">📥 Export Excel</button>
    </div>

    <StatusBox :status="status" />

    <div v-if="lockYm" class="lock-banner no-export">
      🔒 Periode terkunci sampai <strong>{{ lockLabel }}</strong>.
    </div>

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
      </div>
      <p class="hint">
        File butuh kolom: Date, Code, Store, Description, Tags, Debet, Kredit (nama kolom boleh sedikit berbeda, dicocokkan otomatis).
        Kolom pajak PPh diisi otomatis dari Tags; NPWP, No Invoice, dan Masa Kredit diisi manual setelah data masuk.
      </p>
    </div>

    <PeriodFilter v-model:month="filterMonth" v-model:year="filterYear">
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
    </PeriodFilter>

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
          <thead>
            <tr>
              <th class="no-export"></th>
              <th>Tanggal</th><th>Code</th><th>Store</th><th>Description</th><th>Tags</th>
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
              <td class="no-export"><span class="row-del" @click="deleteRow(r)">✕</span></td>
              <td>
                <input type="date" class="cell-input" :value="r.tanggal" :disabled="isLocked(r.tanggal)"
                  @change="patchRow(r, { tanggal: ($event.target as HTMLInputElement).value })" />
              </td>
              <td><input class="cell-input" style="min-width:110px;" :value="r.code" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { code: ($event.target as HTMLInputElement).value })" /></td>
              <td><input class="cell-input" :value="r.store" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { store: ($event.target as HTMLInputElement).value })" /></td>
              <td><input class="cell-input" style="min-width:180px;" :value="r.description" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { description: ($event.target as HTMLInputElement).value })" /></td>
              <td>
                <select :value="r.tags" :disabled="isLocked(r.tanggal)" @change="onTagChange(r, ($event.target as HTMLSelectElement).value)">
                  <option value="">-</option>
                  <option v-for="t in tags" :key="t.id" :value="t.nama">{{ t.nama }}</option>
                </select>
              </td>
              <td class="num"><input class="cell-input" :value="fmtNum(r.debet, true)" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { debet: parseNum(($event.target as HTMLInputElement).value) })" /></td>
              <td class="num"><input class="cell-input" :value="fmtNum(r.kredit, true)" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { kredit: parseNum(($event.target as HTMLInputElement).value) })" /></td>
              <td>
                <select :value="r.npwpId || ''" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { npwpId: ($event.target as HTMLSelectElement).value || null })">
                  <option value="">-</option>
                  <option v-for="n in npwps" :key="n.id" :value="n.id">{{ n.namaNpwp }}</option>
                </select>
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

    <RowColorMenu :menu="rowColors.menu" @pick="rowColors.pick" />
  </div>
</template>
