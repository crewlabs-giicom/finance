<script setup lang="ts">
import { findHeaderRow, parseSheetNumber } from '~/utils/sheetImport'

const api = useApi()
const { pics, load: loadPics } = usePics()
const { exportTables, downloadTemplate, readFileRows } = useXlsx()
const { busy: capturing, capture } = useScreenshot()
const { lockYm, label: lockLabel, refresh: refreshLock } = usePeriodLock()
const depositoColors = useRowColors('deposito')
const hutangColors = useRowColors('hutang')
const bayarColors = useRowColors('bayar')

type Group = { id: string; nama: string; warna: string | null; picId: string | null }
type Balance = { id: string; pic: string | null; rek: string; saldo: number; bisaDipakai: number | null; ket: string | null; grup: string | null; locked: boolean }
type Deposito = { id: string; nama: string | null; nominal: number; tglMasuk: string | null; rate: string | null; jatuhTempo: string | null; ket: string | null; groupId: string | null }
type Hutang = { id: string; peminjam: string | null; kreditur: string | null; nominal: number; rate: string | null; tglPinjam: string | null; jatuhTempo: string | null; ket: string | null; groupId: string | null }
type Bayar = { id: string; pt: string | null; groupId: string | null; nominal: number; tglBayar: string | null; tglPesan: string | null; noCtr: string | null; payIam: string | null; payEkspds: string | null; ket: string | null }

const groups = ref<Group[]>([])
const balances = ref<Balance[]>([])
const deposito = ref<Deposito[]>([])
const hutang = ref<Hutang[]>([])
const bayar = ref<Bayar[]>([])

// Filter PIC di panel Saldo Rekening Bank. Preset ke PIC user yang lagi login (kalau di-set di Master Data).
const picFilter = ref<string | null>(null)

const todayLabel = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const status = ref<{ type: 'ok' | 'err'; msg: string } | null>(null)

const report = ref<HTMLElement | null>(null)
async function onScreenshot() {
  if (report.value) await capture(report.value, 'Rekap_Saldo')
}
async function onExport() {
  const tables = Array.from(report.value?.querySelectorAll<HTMLTableElement>('table[data-sheet]') || [])
  if (!tables.length) return
  await exportTables(tables.map(t => ({ table: t, sheetName: t.dataset.sheet || 'Sheet' })), 'Rekap_Saldo')
}

async function loadAll() {
  ;[groups.value, balances.value, deposito.value, hutang.value, bayar.value] = await Promise.all([
    api('/api/master/groups'),
    api('/api/rekap/balances'),
    api('/api/rekap/deposito'),
    api('/api/rekap/hutang'),
    api('/api/rekap/bayar')
  ])
}
async function loadMe() {
  const me = await api<{ picId: string | null }>('/api/auth/me')
  picFilter.value = me.picId
}
await Promise.all([loadAll(), refreshLock(), loadPics(), loadMe(), depositoColors.load(), hutangColors.load(), bayarColors.load()])

async function resetSaldo() {
  if (!confirm('Nge-nol-in kolom Saldo semua rekening bank? "Bisa Dipakai" ikut jadi 0 karena itu rumus turunan dari Saldo. Kolom lainnya (PIC, Rekening, Ket, Grup) tidak berubah. Biasanya dilakuin tiap pagi sebelum update data baru.')) return
  try {
    await api('/api/rekap/reset-saldo', { method: 'POST' })
  } catch (e: any) {
    alert(e?.data?.statusMessage || 'Gagal nol-in saldo. Coba lagi.')
    return
  }
  try {
    await loadAll()
  } catch {
    alert('Saldo udah di-reset di server, tapi tampilan gagal dimuat ulang. Refresh halaman ini biar keliatan hasilnya.')
  }
}

// -- data per Grup: satuan utama halaman ini sekarang Grup, bukan jenis data --
const filteredBalances = computed(() => picFilter.value ? balances.value.filter(b => b.pic === picFilter.value) : balances.value)
function balancesForGroup(groupId: string | null) { return filteredBalances.value.filter(b => (b.grup || null) === groupId) }
function depositoForGroup(groupId: string | null) { return deposito.value.filter(d => (d.groupId || null) === groupId) }
function hutangForGroup(groupId: string | null) { return hutang.value.filter(h => (h.groupId || null) === groupId) }
function bayarForGroup(groupId: string | null) { return bayar.value.filter(b => (b.groupId || null) === groupId) }

/** Kolom kiri/kanan sesuai urutan yang diminta eksplisit — beda dikit dari `urutan`
 *  di Master Data (yang naruh JNT sebelum IAM-R), jadi di-reorder di sini aja,
 *  gak ubah `urutan` global biar halaman lain yang pakai grup ini gak kepengaruh. */
const LEFT_NAMES = ['GIM', 'SUM', 'BII', 'RUW']
const RIGHT_NAMES = ['GDS', 'GPO', 'Others', 'IAM-R', 'JNT']
function resolveGroups(names: string[]) {
  return names
    .map(n => groups.value.find(g => g.nama.trim().toUpperCase() === n.toUpperCase()))
    .filter((g): g is Group => !!g)
    // Filter PIC = grup yang PIC PENANGGUNG JAWABNYA (bank_groups.picId, di-set di Master
    // Data) sesuai PIC yang dipilih — bukan cuma nyaring baris Saldo RK di dalam card-nya,
    // tapi nentuin card GRUP mana aja yang ditampilin sama sekali.
    .filter(g => !picFilter.value || g.picId === picFilter.value)
}
const leftGroups = computed(() => resolveGroups(LEFT_NAMES))
const rightGroups = computed(() => resolveGroups(RIGHT_NAMES))

const noGroupHasData = computed(() =>
  balancesForGroup(null).length > 0 || depositoForGroup(null).length > 0 ||
  hutangForGroup(null).length > 0 || bayarForGroup(null).length > 0
)

function subtotal(rows: Balance[]) {
  return {
    saldo: rows.reduce((s, r) => s + (r.saldo || 0), 0),
    bisaDipakai: rows.reduce((s, r) => s + (r.bisaDipakai || 0), 0)
  }
}
const grandTotal = computed(() => subtotal(filteredBalances.value))
const totalDeposito = computed(() => deposito.value.reduce((s, d) => s + (d.nominal || 0), 0))
const totalHutang = computed(() => hutang.value.reduce((s, h) => s + (h.nominal || 0), 0))
const totalBayar = computed(() => bayar.value.reduce((s, b) => s + (b.nominal || 0), 0))

// -- Bayar: template + import Excel --
function downloadBayarTemplate() {
  downloadTemplate(
    ['Grup', 'Nominal', 'Tgl Bayar', 'Tgl Pesan', 'No Ctr', 'Pay IAM', 'Pay Ekspds', 'Keterangan'],
    [['GIM', 5000000, '01/09/2026', '28/08/2026', 'CTR-001', 'IAM-01', 'EKS-01', 'Contoh bayar bulanan']],
    'Template_Bayar'
  )
}
const BAYAR_HEADERS = {
  grup: ['GRUP', 'GROUP'],
  nominal: ['NOMINAL'],
  tglBayar: ['TGL BAYAR', 'TANGGAL BAYAR'],
  tglPesan: ['TGL PESAN', 'TANGGAL PESAN'],
  noCtr: ['NO CTR', 'NO. CTR'],
  payIam: ['PAY IAM'],
  payEkspds: ['PAY EKSPDS'],
  ket: ['KETERANGAN', 'KET']
}
/** Terima tanggal format Excel (Date/serial/teks dd/mm/yyyy) sekaligus dd/mm/yy pendek. */
function parseBayarDate(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000))
    return isNaN(d.getTime()) ? null : new Date(d.getTime() + d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  }
  const s = String(val).trim()
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (dmy) {
    let [, d, m, y] = dmy as unknown as [string, string, string, string]
    if (y.length === 2) y = (parseInt(y, 10) < 70 ? '20' : '19') + y
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}
const uploadingBayar = ref(false)
async function onBayarUpload(evt: Event) {
  const input = evt.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  uploadingBayar.value = true
  try {
    const sheet = await readFileRows(file, BAYAR_HEADERS, 2)
    const header = findHeaderRow(sheet, BAYAR_HEADERS, 2)
    if (!header) {
      status.value = { type: 'err', msg: 'Header kolom tidak ketemu. Minimal butuh kolom Grup dan Nominal — download Template dulu buat contoh formatnya.' }
      return
    }

    const payload: Record<string, unknown>[] = []
    let noGroupMatch = 0
    for (let i = header.index + 1; i < sheet.length; i++) {
      const r = sheet[i] || []
      const at = (f: string) => header.map[f] === undefined ? '' : r[header.map[f]!]
      const grupText = String(at('grup') || '').trim()
      const nominal = parseSheetNumber(at('nominal'))
      if (!grupText && !nominal) continue // baris kosong, dilewati diam-diam
      const g = groups.value.find(x => x.nama.trim().toUpperCase() === grupText.toUpperCase())
      // Nama Grup gak cocok Master Data -> tetap diimpor (masuk "Tanpa Grup"), bukan dibuang,
      // biar datanya gak ilang — tinggal di-assign manual lewat dropdown Grup di kartunya.
      if (!g) noGroupMatch++
      payload.push({
        groupId: g?.id || null,
        nominal,
        tglBayar: parseBayarDate(at('tglBayar')),
        tglPesan: parseBayarDate(at('tglPesan')),
        noCtr: String(at('noCtr') || '').trim(),
        payIam: String(at('payIam') || '').trim(),
        payEkspds: String(at('payEkspds') || '').trim(),
        ket: String(at('ket') || '').trim()
      })
    }

    const res = await api<{ inserted: number; duplikat: number }>('/api/rekap/bayar/bulk', { method: 'POST', body: { rows: payload } })
    await loadAll()

    let msg = `${res.inserted} baris Bayar diimpor, ${res.duplikat} duplikat dilewati`
    if (noGroupMatch) msg += `, ${noGroupMatch} baris nama Grup-nya gak cocok Master Data (masuk "Tanpa Grup", tinggal di-assign manual)`
    status.value = { type: res.inserted ? 'ok' : 'err', msg: msg + '.' }
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || e?.message || 'Gagal baca file Excel.' }
  } finally {
    uploadingBayar.value = false
  }
}
</script>

<template>
  <div>
    <div class="topbar">
      <div>
        <h2>Rekap Saldo</h2>
      </div>
      <div style="display:flex;gap:8px;" class="no-export">
        <button class="btn secondary" @click="onExport">📥 Export Excel</button>
        <button class="btn secondary" :disabled="capturing" @click="onScreenshot">
          {{ capturing ? '⏳ Memproses…' : '📸 Screenshot' }}
        </button>
      </div>
    </div>

    <div ref="report">
      <div class="date-banner" style="display:flex;justify-content:space-between;align-items:center;">
        <span>📅 Data per hari ini: <b>{{ todayLabel }}</b></span>
        <span v-if="lockYm">🔒 {{ lockLabel }}</span>
      </div>

      <div class="panel no-export" style="padding:10px 14px;">
        <div class="toolbar">
          <button class="btn danger" @click="resetSaldo">🔄 Reset Saldo</button>
          <span class="gm-label" style="margin-left:10px;">Filter PIC:</span>
          <select :value="picFilter" @change="picFilter = ($event.target as HTMLSelectElement).value || null">
            <option value="">Semua PIC</option>
            <option v-for="p in pics" :key="p.id" :value="p.id">{{ p.nama }}</option>
          </select>
          <span class="gm-label" style="margin-left:auto;">Bayar:</span>
          <button class="btn secondary" @click="downloadBayarTemplate">📄 Template</button>
          <label class="btn secondary" style="cursor:pointer;">
            {{ uploadingBayar ? '⏳ Memproses…' : '📤 Upload Excel' }}
            <input type="file" accept=".xlsx,.xls" style="display:none;" :disabled="uploadingBayar" @change="onBayarUpload" />
          </label>
        </div>
        <StatusBox :status="status" />
      </div>

      <div class="rekap-grid">
        <div class="rekap-col">
          <RekapGroupCard
            v-for="g in leftGroups" :key="g.id"
            :group-id="g.id" :group-nama="g.nama" :group-warna="g.warna"
            :balances="balancesForGroup(g.id)" :deposito="depositoForGroup(g.id)"
            :hutang="hutangForGroup(g.id)" :bayar="bayarForGroup(g.id)"
            :pics="pics" :groups="groups"
            :deposito-colors="depositoColors" :hutang-colors="hutangColors" :bayar-colors="bayarColors"
            @reload="loadAll"
          />
        </div>
        <div class="rekap-col">
          <RekapGroupCard
            v-for="g in rightGroups" :key="g.id"
            :group-id="g.id" :group-nama="g.nama" :group-warna="g.warna"
            :balances="balancesForGroup(g.id)" :deposito="depositoForGroup(g.id)"
            :hutang="hutangForGroup(g.id)" :bayar="bayarForGroup(g.id)"
            :pics="pics" :groups="groups"
            :deposito-colors="depositoColors" :hutang-colors="hutangColors" :bayar-colors="bayarColors"
            @reload="loadAll"
          />
        </div>
      </div>

      <RekapGroupCard
        v-if="noGroupHasData"
        :group-id="null" group-nama="Tanpa Grup" :group-warna="null"
        :balances="balancesForGroup(null)" :deposito="depositoForGroup(null)"
        :hutang="hutangForGroup(null)" :bayar="bayarForGroup(null)"
        :pics="pics" :groups="groups"
        :deposito-colors="depositoColors" :hutang-colors="hutangColors" :bayar-colors="bayarColors"
        @reload="loadAll"
      />

      <div class="panel" data-sheet="Ringkasan Total">
        <div class="group-head">Ringkasan Total</div>
        <table class="dense">
          <tbody>
            <tr class="grand-total-row"><td>TOTAL BANK (Saldo)</td><td class="num">{{ grandTotal.saldo.toLocaleString('id-ID') }}</td></tr>
            <tr class="grand-total-row"><td>TOTAL BANK (Bisa Dipakai)</td><td class="num">{{ grandTotal.bisaDipakai.toLocaleString('id-ID') }}</td></tr>
            <tr class="grand-total-row"><td>TOTAL DEPOSITO</td><td class="num">{{ totalDeposito.toLocaleString('id-ID') }}</td></tr>
            <tr class="grand-total-row"><td>TOTAL HUTANG</td><td class="num">{{ totalHutang.toLocaleString('id-ID') }}</td></tr>
            <tr class="grand-total-row"><td>TOTAL BAYAR</td><td class="num">{{ totalBayar.toLocaleString('id-ID') }}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <RowColorMenu :menu="depositoColors.menu" @pick="depositoColors.pick" />
    <RowColorMenu :menu="hutangColors.menu" @pick="hutangColors.pick" />
    <RowColorMenu :menu="bayarColors.menu" @pick="bayarColors.pick" />
  </div>
</template>

<style scoped>
/* Proporsi 2 kolom sekarang 50/50 — kedua kolom isinya sama-sama card per Grup
   (beda dari layout lama yang 45/55, waktu kiri cuma satu card Saldo RK). */
.rekap-grid {
  grid-template-columns: 50% 50%;
}
</style>
