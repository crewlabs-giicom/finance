<script setup lang="ts">
import { MONTH_NAMES, defaultPeriod, fmtNum, fmtRp, lightenColor, parseNum, parseTagList } from '~/utils/format'
import { findHeaderRow, parseSheetDate, parseSheetNumber } from '~/utils/sheetImport'

/**
 * List PM adalah tampilan turunan dari List Pajak — tidak punya tabel sendiri.
 * Yang ditampilkan hanya baris ppn_rows yang ditag "PM" (beda dari Norminatif,
 * tag "PM" boleh berdiri sendiri, gak perlu dipasangkan tag pajak lain); edit
 * di sini langsung menulis balik ke baris List Pajak yang sama.
 */

const api = useApi()
const { sections, load: loadGroups, myGroupId } = useGroups()
const { isLocked, refresh: refreshLock, label: lockLabel, lockYm } = usePeriodLock()
const { readFileRows, exportTablesColored } = useXlsx()
const rowColors = useRowColors('ppn')

type PpnRow = {
  id: string; sourceTxnId: string | null; groupId: string | null; tanggal: string; code: string | null
  description: string | null; tags: string | null
  npwpId: string | null; noInvoice: string | null; tanggalFp: string | null
  dpp: number | null; ppn: number | null; masaKredit: string | null; note: string | null
  ketStatus: string | null; ketKategori: string | null
}
type Npwp = { id: string; noNpwp: string; namaNpwp: string }
type PmKategori = { id: string; nama: string }

const rows = ref<PpnRow[]>([])
const npwps = ref<Npwp[]>([])
const pmKategoris = ref<PmKategori[]>([])

const today = new Date()
await refreshLock()
const { year: defYear, month: defMonth } = defaultPeriod(today, lockYm.value)
const filterFromMonth = ref(defMonth)
const filterFromYear = ref(defYear)
const filterToMonth = ref(defMonth)
const filterToYear = ref(defYear)
const filterGroup = ref('')
const filterMasaKredit = ref('')
const status = ref<{ type: 'ok' | 'err'; msg: string } | null>(null)
const root = ref<HTMLElement | null>(null)

const fromYm = computed(() => `${filterFromYear.value}-${String(filterFromMonth.value).padStart(2, '0')}`)
const toYm = computed(() => `${filterToYear.value}-${String(filterToMonth.value).padStart(2, '0')}`)

async function loadAll() {
  ;[rows.value, npwps.value, pmKategoris.value] = await Promise.all([
    api<PpnRow[]>('/api/ppn', { query: { from: `${fromYm.value}-01`, to: `${toYm.value}-31`, groupId: filterGroup.value || undefined } }),
    api<Npwp[]>('/api/master/npwp'),
    api<PmKategori[]>('/api/master/pm-kategori')
  ])
  await rowColors.load()
}
await Promise.all([loadAll(), loadGroups()])
filterGroup.value = (await myGroupId()) || filterGroup.value
await loadAll() // re-fetch scoped ke grup default user (baru kesetel di atas)

/** Ganti filter periode/grup bikin data (jumlah baris per section) berubah total,
 *  tapi posisi scroll tiap .table-wrap gak ikut ke-reset -- kalau user kebetulan
 *  udah scroll ke bawah sebelum ganti filter, tampilannya jadi nyangkut di tengah
 *  konten baru (keliatan berantakan/ketutupan). Reset ke atas tiap abis refetch. */
async function resetScroll() {
  await loadAll()
  await nextTick()
  root.value?.querySelectorAll('.table-wrap').forEach(el => { el.scrollTop = 0 })
}
watch([filterFromMonth, filterFromYear, filterToMonth, filterToYear, filterGroup], resetScroll)

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
const npwpOptions = computed(() => npwps.value.map(n => ({ id: n.id, label: n.namaNpwp })))

/** Dropdown "Keterangan" sempat 2 tingkat (Status "Credited" + Kategori terpisah) sebelum
 *  disederhanain jadi 1 dropdown langsung (Uncredited / nama kategori). Baris lama yang
 *  kesimpen pas masih 2 tingkat (`ketStatus` literal "Credited" + `ketKategori` keisi)
 *  tetap kebaca bener di sini — begitu baris itu di-edit lagi, kesimpen ulang pakai pola baru. */
function ketDisplay(r: PpnRow): string {
  if (r.ketStatus === 'Credited') return r.ketKategori || 'Uncredited'
  return r.ketStatus || 'Uncredited'
}

const masaKreditOptions = computed(() =>
  [...new Set(rows.value.filter(matchesTag).map(r => r.masaKredit).filter(Boolean) as string[])].sort()
)
function masaKreditLabel(mk: string | null) {
  if (!mk) return ''
  const [y, m] = mk.split('-')
  const mi = +m! - 1
  return mi >= 0 && mi < 12 ? `${MONTH_NAMES[mi]} ${y}` : mk
}

const visibleSections = computed(() =>
  sections.value
    .filter(s => !filterGroup.value || (s.id || '') === filterGroup.value)
    .map(s => ({
      ...s,
      rows: rows.value
        .filter(r => (r.groupId || '') === (s.id || '') && matchesTag(r) && inPeriod(r.tanggal) &&
          (!filterMasaKredit.value || r.masaKredit === filterMasaKredit.value))
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

/** Kolom "No. NPWP" bisa diketik bebas — gak perlu buka Master Data dulu. Kalau
 *  nomornya udah ada di master, tinggal di-link; kalau belum, baris master baru
 *  langsung dibikin otomatis (Nama NPWP-nya sementara disamain sama nomornya,
 *  bisa diganti belakangan lewat Master Data). Pola sama persis kayak List Pajak. */
async function onNpwpNumberChange(r: PpnRow, value: string) {
  const noNpwp = value.trim()
  if (!noNpwp) { await patchRow(r, { npwpId: null }); return }

  const existing = npwps.value.find(n => n.noNpwp.trim().toLowerCase() === noNpwp.toLowerCase())
  if (existing) { await patchRow(r, { npwpId: existing.id }); return }

  try {
    const created = await api<Npwp>('/api/master/npwp', { method: 'POST', body: { noNpwp, namaNpwp: noNpwp } })
    npwps.value.push(created)
    await patchRow(r, { npwpId: created.id })
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal tambah NPWP.' }
    await loadAll()
  }
}

/** DPP berubah -> PPN otomatis 11% dari DPP (tetap bisa diedit manual belakangan). */
async function onDppChange(r: PpnRow, value: string) {
  const dpp = parseNum(value)
  await patchRow(r, { dpp, ppn: Math.round(dpp * 0.11) })
}

/** Baris manual baru — tag dipaksa "PM" biar langsung muncul di List PM (filter matchesTag). */
async function addRow(groupId: string | null) {
  try {
    const created = await api<PpnRow>('/api/ppn', {
      method: 'POST',
      body: { groupId, tanggal: `${fromYm.value}-01`, tags: 'PM', ketStatus: 'Uncredited' }
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

/** Duplicate lewat menu klik kanan. Urutan baris baru dihitung di server (ppnUrutanAfter,
 *  nyisip persis di antara urutan baris sumber & baris berikutnya) jadi posisinya tetap
 *  nempel di bawah baris sumber walau nanti di-refetch. Tag dipaksa jadi "PM" doang lewat
 *  `overrides` (buang tag pajak lain yang mungkin ikut ke-copy dari baris campuran) — baris
 *  hasil duplicate di List PM murni milik List PM, gak boleh ikut nongol di List Pajak. */
async function duplicateRow(id: string) {
  const srcIndex = rows.value.findIndex(r => r.id === id)
  rowColors.close()
  if (srcIndex === -1) return
  try {
    const created = await api<PpnRow>(`/api/ppn/${id}/duplicate`, { method: 'POST', body: { overrides: { tags: 'PM' } } })
    rows.value.splice(srcIndex + 1, 0, created)
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal duplicate.' }
  }
}

// -- import Excel --
// Alias 'tanggal' SENGAJA cuma ['TANGGAL BANK', 'DATE'] (gak ada 'TANGGAL' generik)
// -- biar gak ada risiko collide sama kolom "Tanggal FP" terlepas dari urutan kolom
// file Excel-nya (detectHeaderMap matching-nya longgar substring, field yang
// diproses duluan menang -- safer kalau alias-nya spesifik dari awal).
// Field "ketStatus" SENGAJA gak didaftarin alias -- kolomnya dicari manual lewat
// findKetStatusCol() di bawah, karena List PM punya 2 kolom "Keterangan" (description
// di depan, status di belakang) yang bakal collide kalau didaftar sama-sama.
const HEADERS = {
  tanggal: ['TANGGAL BANK', 'DATE'],
  code: ['CODE', 'KODE', 'NO BANK'],
  description: ['DESCRIPTION', 'DESKRIPSI', 'KETERANGAN'],
  noNpwp: ['NO. NPWP', 'NO NPWP', 'NOMOR NPWP'],
  noInvoice: ['NO INVOICE', 'NO. INVOICE', 'NO FAKTUR', 'NO FAKTUR PAJAK'],
  tanggalFp: ['TANGGAL FP', 'TGL FP'],
  dpp: ['DPP'],
  ppn: ['PPN'],
  masaKredit: ['MASA KREDIT']
}

/** Cari kolom "Keterangan" status -- kolom TERAKHIR yang teksnya "Keterangan" TAPI
 *  BUKAN index yang udah diklaim description. Ambil yang PALING KANAN (robust walau
 *  Masa Kredit gak ada di file, gak gantung ke kolom anchor tertentu). Gak ketemu
 *  (cuma 1 "Keterangan") -> undefined -> default "Uncredited" dipakai semua baris. */
function findKetStatusCol(headerRow: unknown[], descColIdx: number | undefined): number | undefined {
  const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
  let last: number | undefined
  headerRow.forEach((cell, i) => {
    if (i === descColIdx) return
    const h = norm(cell)
    if (h.includes('KETERANGAN')) last = i
  })
  return last
}

function parseMasaKredit(raw: unknown): string {
  const s = String(raw ?? '').trim()
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : ''
}

/** Kunci duplikasi: No Faktur Pajak dipakai duluan kalau diisi (identifier dokumen
 *  resmi, lebih andal dibanding DPP/PPN yang bisa kebetulan sama di baris beda).
 *  Kosong -> fallback ke tanggal+NoBank+Keterangan+DPP+PPN+No.NPWP. Pakai NOMOR NPWP
 *  MENTAH (bukan npwpId hasil resolve) biar dupKey bisa dihitung SEBELUM resolve ke
 *  Master Data -- baris yang ke-skip duplikat gak bikin NPWP master baru sia-sia. */
function dupKey(o: { tanggal: string; code: string; description: string; dpp: number; ppn: number; noInvoice: string; noNpwp: string }): string {
  const inv = o.noInvoice.trim().toLowerCase()
  if (inv) return `inv:${inv}`
  return ['row', o.tanggal, o.code.trim().toLowerCase(), o.description.trim().toLowerCase(), o.dpp || 0, o.ppn || 0, o.noNpwp.trim().toLowerCase()].join('|')
}

/** Sama persis pola resolveNpwpId di list-pajak.vue. */
async function resolveNpwpId(noNpwpRaw: string, namaRaw: string, cache: Map<string, string | null>): Promise<string | null> {
  const noNpwp = noNpwpRaw.trim()
  if (!noNpwp) return null
  const key = noNpwp.toLowerCase()
  if (cache.has(key)) return cache.get(key)!
  const existing = npwps.value.find(n => n.noNpwp.trim().toLowerCase() === key)
  if (existing) { cache.set(key, existing.id); return existing.id }
  const created = await api<Npwp>('/api/master/npwp', { method: 'POST', body: { noNpwp, namaNpwp: namaRaw.trim() || noNpwp } })
  npwps.value.push(created)
  cache.set(key, created.id)
  return created.id
}

const uploading = ref(false)
const uploadGroup = ref('')
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
      status.value = { type: 'err', msg: 'Header kolom tidak ketemu. File butuh minimal kolom Tanggal Bank, No Bank, Keterangan.' }
      return
    }
    const ketStatusCol = findKetStatusCol(sheet[header.index] || [], header.map['description'])

    // PENTING: dedup WAJIB dibandingkan terhadap SEMUA baris List PM yang ada di
    // database -- BUKAN `rows.value` (itu udah kefilter periode yang lagi aktif di
    // UI, jadi kalau user lagi liat November tapi file isinya data Oktober yang
    // udah ada, duplikat gak akan ketahuan kalau pakai rows.value). Fetch ulang
    // tanpa query from/to supaya balikin semua data.
    const allRows = await api<PpnRow[]>('/api/ppn')
    const existingKeys = new Set(
      allRows.filter(matchesTag).map(r => dupKey({
        tanggal: r.tanggal, code: r.code || '', description: r.description || '',
        dpp: r.dpp || 0, ppn: r.ppn || 0, noInvoice: r.noInvoice || '',
        noNpwp: npwpOf(r.npwpId)?.noNpwp || ''
      }))
    )

    const payload: Record<string, unknown>[] = []
    const npwpCache = new Map<string, string | null>()
    let invalid = 0
    let duplicate = 0

    for (let i = header.index + 1; i < sheet.length; i++) {
      const r = sheet[i] || []
      const at = (f: string) => header.map[f] === undefined ? '' : r[header.map[f]!]
      const tanggal = parseSheetDate(at('tanggal'))
      if (!tanggal) { invalid++; continue }

      const code = String(at('code') || '').trim()
      const description = String(at('description') || '').trim()
      const noNpwpRaw = String(at('noNpwp') || '').trim()
      const noNpwpColIdx = header.map['noNpwp']
      const npwpNamaRaw = noNpwpColIdx !== undefined ? String(r[noNpwpColIdx + 1] ?? '') : ''
      const noInvoice = String(at('noInvoice') || '').trim()

      const hasCell = (v: unknown) => v !== '' && v !== undefined && v !== null
      const dpp = parseSheetNumber(at('dpp'))
      const ppnCell = at('ppn')
      const ppn = hasCell(ppnCell) ? parseSheetNumber(ppnCell) : Math.round(dpp * 0.11)

      const key = dupKey({ tanggal, code, description, dpp, ppn, noInvoice, noNpwp: noNpwpRaw })
      if (existingKeys.has(key)) { duplicate++; continue }
      existingKeys.add(key)

      const npwpId = await resolveNpwpId(noNpwpRaw, npwpNamaRaw, npwpCache)
      const ketStatusRaw = ketStatusCol !== undefined ? String(r[ketStatusCol] ?? '').trim() : ''

      payload.push({
        groupId: uploadGroup.value || null,
        tanggal,
        code,
        description,
        tags: 'PM',
        npwpId,
        noInvoice,
        tanggalFp: parseSheetDate(at('tanggalFp')),
        dpp,
        ppn,
        masaKredit: parseMasaKredit(at('masaKredit')),
        ketStatus: ketStatusRaw || 'Uncredited',
        ketKategori: ''
      })
    }

    if (!payload.length) {
      status.value = { type: 'err', msg: `Tidak ada baris yang bisa diimpor${duplicate ? ` (${duplicate} baris duplikat dilewati)` : ''}.` }
      return
    }

    // Warning SEBELUM kirim ke server kalau ada baris di periode terkunci --
    // server (crud.ppn.bulkCreate) udah otomatis skip baris itu, tapi user perlu
    // tau DI MUKA, bukan cuma lewat pesan status setelah proses selesai.
    const lockedCount = payload.filter(p => isLocked(p.tanggal as string)).length
    if (lockedCount > 0) {
      const proceed = confirm(
        `${lockedCount} dari ${payload.length} baris ada di periode terkunci (sampai ${lockLabel.value}) dan TIDAK akan diimpor.\n\nLanjut import ${payload.length - lockedCount} baris sisanya?`
      )
      if (!proceed) {
        status.value = { type: 'err', msg: 'Import dibatalkan.' }
        return
      }
    }

    const res = await api<{ inserted: number; skipped: number }>('/api/ppn/bulk', { method: 'POST', body: { rows: payload } })
    await loadAll()

    let msg = `${res.inserted} baris diimpor`
    if (duplicate) msg += `, ${duplicate} baris duplikat dilewati`
    if (invalid) msg += `, ${invalid} baris tanpa tanggal valid dilewati`
    if (res.skipped) msg += `, ${res.skipped} baris ditolak server (periode terkunci / data kurang)`
    status.value = { type: res.inserted ? 'ok' : 'err', msg: msg + '.' }
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || e?.message || 'Gagal baca file Excel.' }
  } finally {
    uploading.value = false
  }
}

// -- update Masa Kredit rame-rame buat baris yang lagi dicentang --
const bulkMasaKreditMonth = ref('')
const bulkMasaKreditYear = ref(String(today.getFullYear()))
async function applyBulkMasaKredit() {
  const ids = [...selectedIds]
  if (!ids.length) return
  if (!bulkMasaKreditMonth.value) { status.value = { type: 'err', msg: 'Pilih bulan Masa Kredit dulu.' }; return }
  const masaKredit = `${bulkMasaKreditYear.value}-${bulkMasaKreditMonth.value}`
  let ok = 0, fail = 0
  for (const id of ids) {
    try {
      await api(`/api/ppn/${id}`, { method: 'PATCH', body: { masaKredit } })
      ok++
    } catch {
      fail++
    }
  }
  await loadAll()
  status.value = fail
    ? { type: 'err', msg: `${ok} baris di-update, ${fail} gagal (kemungkinan periode terkunci).` }
    : { type: 'ok', msg: `${ok} baris Masa Kredit-nya di-update ke ${MONTH_NAMES[+bulkMasaKreditMonth.value - 1]} ${bulkMasaKreditYear.value}.` }
}

// -- update Keterangan rame-rame buat baris yang lagi dicentang --
const bulkKet = ref('Uncredited')
async function applyBulkKet() {
  const ids = [...selectedIds]
  if (!ids.length) return
  let ok = 0, fail = 0
  for (const id of ids) {
    try {
      await api(`/api/ppn/${id}`, { method: 'PATCH', body: { ketStatus: bulkKet.value, ketKategori: '' } })
      ok++
    } catch {
      fail++
    }
  }
  await loadAll()
  status.value = fail
    ? { type: 'err', msg: `${ok} baris di-update, ${fail} gagal (kemungkinan periode terkunci).` }
    : { type: 'ok', msg: `${ok} baris Keterangan-nya di-update ke "${bulkKet.value}".` }
}

// Kolom di tabel (index setelah kolom .no-export dibuang).
const COL_NO_NPWP = 4
const COL_NO_FAKTUR_PAJAK = 6
const COL_DPP = 8
const COL_PPN = 9
const COL_MASA_KREDIT = 10

async function onExport() {
  const tables = Array.from(root.value?.querySelectorAll<HTMLTableElement>('table[data-sheet]') || [])
  if (!tables.length) { status.value = { type: 'err', msg: 'Belum ada tabel untuk diexport.' }; return }
  const sectionsList = visibleSections.value
  await exportTablesColored(tables.map((t, ti) => ({
    table: t,
    sheetName: t.dataset.sheet || 'Sheet',
    // DPP & PPN ditulis sebagai angka biner asli biar gak ada separator ribuan
    // yang bisa kebaca beda tergantung setting regional Excel.
    numericCell: (rowIdx: number, colIdx: number) => {
      const r = sectionsList[ti]?.rows[rowIdx]
      if (!r) return null
      if (colIdx === COL_DPP) return r.dpp
      if (colIdx === COL_PPN) return r.ppn
      return null
    },
    // No. NPWP & No Faktur Pajak dipaksa jadi teks eksplisit — gampang ke-tebak
    // table_to_sheet sebagai angka/tanggal padahal harus tetap teks apa adanya.
    // Masa Kredit JUGA wajib textCell: selnya berisi 2 <select> (bulan+tahun) yang
    // pas di-export ke-replace jadi 2 text node tanpa pemisah (mis. "01"+"26" ->
    // "0126") -- gabungan mentah itu ke-tebak table_to_sheet sebagai tanggal/angka
    // dan keluar jadi nilai ngaco (mis. "-23"), bukan dibiarin apa adanya kayak teks.
    textCell: (rowIdx: number, colIdx: number) => {
      const r = sectionsList[ti]?.rows[rowIdx]
      if (!r) return null
      if (colIdx === COL_NO_NPWP) return npwpOf(r.npwpId)?.noNpwp || null
      if (colIdx === COL_NO_FAKTUR_PAJAK) return r.noInvoice || null
      if (colIdx === COL_MASA_KREDIT) return masaKreditLabel(r.masaKredit) || '-'
      return null
    }
  })), 'List_PM')
}

function subtotal(list: PpnRow[], key: 'dpp' | 'ppn') {
  return list.reduce((a, r) => a + (Number(r[key]) || 0), 0)
}
</script>

<template>
  <div ref="root" @click="rowColors.close()">
    <div class="topbar">
      <div>
        <h2>List PM</h2>
      </div>
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

    <div v-if="!visibleSections.length" class="empty-state">
      Belum ada data. Pastikan ada transaksi di Rincian Bank yang ditag "PM", lalu cek filter periode di atas.
    </div>

    <div v-for="sec in visibleSections" :key="sec.id || 'none'" class="panel">
      <div class="group-head">
        <span class="group-dot" :style="{ background: sec.warna }" />
        {{ sec.nama }}
        <button class="btn secondary no-export" style="margin-left:auto;" @click="addRow(sec.id)">+ Baris</button>
        <div v-if="selectedIds.size" class="no-export" style="display:flex;align-items:center;gap:6px;">
          <span class="gm-label">Set Keterangan ({{ selectedIds.size }} terpilih):</span>
          <select v-model="bulkKet" style="width:140px;">
            <option value="Uncredited">Uncredited</option>
            <option v-for="k in pmKategoris" :key="k.id" :value="k.nama">{{ k.nama }}</option>
          </select>
          <button class="btn secondary" @click="applyBulkKet">Terapkan</button>
          <span class="gm-label" style="margin-left:10px;">Set Masa Kredit:</span>
          <select v-model="bulkMasaKreditMonth" style="width:100px;">
            <option value="">- Bulan -</option>
            <option v-for="(m, mi) in MONTH_NAMES" :key="m" :value="String(mi + 1).padStart(2, '0')">{{ m }}</option>
          </select>
          <select v-model="bulkMasaKreditYear" style="width:75px;">
            <option v-for="y in kreditYears" :key="y" :value="String(y)">{{ y }}</option>
          </select>
          <button class="btn secondary" @click="applyBulkMasaKredit">Terapkan</button>
          <button class="btn danger" @click="deleteSelected">🗑 Hapus Terpilih</button>
        </div>
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
              <th>No. NPWP</th><th>Nama Penerbit</th>
              <th>No Faktur Pajak</th><th>Tanggal FP</th>
              <th class="num">DPP</th><th class="num">PPN</th>
              <th>Masa Kredit</th><th class="col-sticky">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(r, i) in sec.rows" :key="r.id"
              :style="rowColors.colorOf(r.id) ? `background:${rowColors.colorOf(r.id)}` : ''"
              @contextmenu="rowColors.open($event, r.id)"
            >
              <td class="no-export"><input type="checkbox" :checked="selectedIds.has(r.id)" @change="multi.toggle(r.id)" /></td>
              <td>{{ i + 1 }}</td>
              <td>
                <input type="date" class="cell-input" :value="r.tanggal" :disabled="isLocked(r.tanggal)"
                  @change="patchRow(r, { tanggal: ($event.target as HTMLInputElement).value })" />
              </td>
              <td><input class="cell-input" style="min-width:110px;" :value="r.code" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { code: ($event.target as HTMLInputElement).value })" /></td>
              <td style="min-width:200px;">{{ r.description }}</td>
              <td>
                <input
                  class="cell-input" style="min-width:150px;" :value="npwpOf(r.npwpId)?.noNpwp"
                  :disabled="isLocked(r.tanggal)" placeholder="Ketik No. NPWP..."
                  @change="onNpwpNumberChange(r, ($event.target as HTMLInputElement).value)"
                />
              </td>
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
              <td>
                <input type="date" class="cell-input" :value="r.tanggalFp" :disabled="isLocked(r.tanggal)"
                  @change="patchRow(r, { tanggalFp: ($event.target as HTMLInputElement).value })" />
              </td>
              <td class="num"><input class="cell-input" :value="fmtNum(r.dpp, true)" :disabled="isLocked(r.tanggal)" @change="onDppChange(r, ($event.target as HTMLInputElement).value)" /></td>
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
              <td class="col-sticky" :style="rowColors.colorOf(r.id) ? `background:${rowColors.colorOf(r.id)}` : ''">
                <select :value="ketDisplay(r)" :disabled="isLocked(r.tanggal)" @change="patchRow(r, { ketStatus: ($event.target as HTMLSelectElement).value, ketKategori: '' })">
                  <option value="Uncredited">Uncredited</option>
                  <option v-for="k in pmKategoris" :key="k.id" :value="k.nama">{{ k.nama }}</option>
                </select>
              </td>
            </tr>
            <tr class="grand-total-row">
              <td colspan="9" style="text-align:right;">TOTAL</td>
              <td class="num">{{ fmtRp(subtotal(sec.rows, 'dpp')) }}</td>
              <td class="num">{{ fmtRp(subtotal(sec.rows, 'ppn')) }}</td>
              <td></td>
              <td class="col-sticky"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <RowColorMenu :menu="rowColors.menu" show-duplicate @pick="rowColors.pick" @duplicate="duplicateRow" />
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

.table-wrap table.dense thead th.col-sticky {
  position: sticky;
  right: 0;
  z-index: 2;
}
.table-wrap table.dense tbody td.col-sticky {
  position: sticky;
  right: 0;
  z-index: 1;
  background: var(--card);
  box-shadow: -2px 0 4px -2px rgba(0, 0, 0, .15);
}
/* .grand-total-row td punya specificity (0,0,2,0) -- LEBIH RENDAH dari selector
   td.col-sticky di atas (0,0,3,3), jadi tanpa override khusus ini, td terakhir di
   baris Total bakal keputihan (var(--card)) bukan ikut warna accent-light baris
   Total lainnya. Selector ini sengaja dibikin lebih spesifik lagi biar menang. */
.table-wrap table.dense tbody tr.grand-total-row td.col-sticky {
  background: var(--accent-light);
}
</style>
