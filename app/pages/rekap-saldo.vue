<script setup lang="ts">
import { hitungBisaDipakai, parseNum } from '~/utils/format'

const api = useApi()
const { pics, load: loadPics } = usePics()
const depositoColors = useRowColors('deposito')
const hutangColors = useRowColors('hutang')
const bayarColors = useRowColors('bayar')
function closeColorMenus() {
  depositoColors.close()
  hutangColors.close()
  bayarColors.close()
}
type Group = { id: string; nama: string; warna: string | null }
type Balance = { id: string; pic: string | null; rek: string; saldo: number; bisaDipakai: number | null; ket: string | null; grup: string | null; locked: boolean }
type Deposito = { id: string; nama: string | null; nominal: number; tglMasuk: string | null; rate: string | null; jatuhTempo: string | null; ket: string | null }
type Hutang = { id: string; peminjam: string | null; kreditur: string | null; nominal: number; rate: string | null; tglPinjam: string | null; jatuhTempo: string | null; ket: string | null }
type Bayar = { id: string; pt: string | null; nominal: number; tglBayar: string | null; tglPesan: string | null; noCtr: string | null; payIam: string | null; payEkspds: string | null; ket: string | null }

const groups = ref<Group[]>([])
const balances = ref<Balance[]>([])
const deposito = ref<Deposito[]>([])
const hutang = ref<Hutang[]>([])
const bayar = ref<Bayar[]>([])

// Filter PIC di panel Saldo Rekening Bank. Preset ke PIC user yang lagi login (kalau di-set di Master Data).
const picFilter = ref<string | null>(null)

const today = new Date().toISOString().slice(0, 10)
const todayLabel = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

// Screenshot & export dipakai untuk laporan harian yang dikirim ke grup.
const { exportTables } = useXlsx()
const { busy: capturing, capture } = useScreenshot()
const { lockYm, label: lockLabel, refresh: refreshLock } = usePeriodLock()

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

async function toggleRowLock(b: Balance) {
  await patchBalance(b, 'locked', !b.locked)
}

async function addRow(kind: 'deposito' | 'hutang' | 'bayar') {
  await api(`/api/rekap/${kind}`, { method: 'POST' })
  await loadAll()
}
async function deleteRow(kind: 'deposito' | 'hutang' | 'bayar', id: string) {
  if (!confirm('Hapus baris ini?')) return
  await api(`/api/rekap/${kind}/${id}`, { method: 'DELETE' })
  await loadAll()
}
async function patchRow(kind: 'deposito' | 'hutang' | 'bayar', row: any, field: string, value: any) {
  try {
    await api(`/api/rekap/${kind}/${row.id}`, { method: 'PATCH', body: { [field]: value } })
    row[field] = value
  } catch (e: any) {
    alert(e?.data?.statusMessage || 'Gagal update.')
    await loadAll()
  }
}
const totalDeposito = computed(() => deposito.value.reduce((s, d) => s + (d.nominal || 0), 0))
const totalHutang = computed(() => hutang.value.reduce((s, h) => s + (h.nominal || 0), 0))
const totalBayar = computed(() => bayar.value.reduce((s, b) => s + (b.nominal || 0), 0))

const filteredBalances = computed(() => picFilter.value ? balances.value.filter(b => b.pic === picFilter.value) : balances.value)
function balancesForGroup(groupId: string | null) {
  return filteredBalances.value.filter(b => (b.grup || null) === groupId)
}
const groupsWithBalances = computed(() => groups.value.filter(g => balancesForGroup(g.id).length))
const noGroupBalances = computed(() => balancesForGroup(null))

function subtotal(rows: Balance[]) {
  return {
    saldo: rows.reduce((s, r) => s + (r.saldo || 0), 0),
    bisaDipakai: rows.reduce((s, r) => s + (r.bisaDipakai || 0), 0)
  }
}
const grandTotal = computed(() => subtotal(filteredBalances.value))

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

async function patchBalance(b: Balance, field: string, value: any) {
  try {
    await api(`/api/rekap/balances/${b.id}`, { method: 'PATCH', body: { [field]: value } })
    ;(b as any)[field] = value
    if (field === 'saldo') b.bisaDipakai = hitungBisaDipakai(value)
  } catch (e: any) {
    alert(e?.data?.statusMessage || 'Gagal update.')
    await loadAll()
  }
}
const newRow = reactive({ pic: '', rek: '' })
async function addBalance() {
  if (!newRow.rek) { alert('Isi nama rekening dulu.'); return }
  try {
    await api('/api/rekap/balances', { method: 'POST', body: { pic: newRow.pic, rek: newRow.rek, saldo: 0, bisaDipakai: 0, ket: '', grup: null } })
    newRow.pic = ''
    newRow.rek = ''
    await loadAll()
  } catch (e: any) {
    alert(e?.data?.statusMessage || 'Gagal nambah rekening.')
  }
}
async function deleteBalance(id: string) {
  if (!confirm('Hapus baris rekening ini?')) return
  await api(`/api/rekap/balances/${id}`, { method: 'DELETE' })
  await loadAll()
}

const totalSaldo = computed(() => filteredBalances.value.reduce((s, b) => s + (b.saldo || 0), 0))
</script>

<template>
  <div @click="closeColorMenus">
    <div class="topbar">
      <div>
        <h2>Rekap Saldo</h2>
        <p>Ringkasan saldo semua rekening bank per grup, plus panel Deposito, Hutang, dan Bayar.</p>
      </div>
      <div style="display:flex;gap:8px;" class="no-export">
        <button class="btn secondary" @click="onExport">📥 Export Excel</button>
        <button class="btn secondary" :disabled="capturing" @click="onScreenshot">
          {{ capturing ? '⏳ Memproses…' : '📸 Screenshot' }}
        </button>
      </div>
    </div>

    <div v-if="lockYm" class="lock-banner no-export">
      🔒 Periode terkunci sampai <strong>{{ lockLabel }}</strong> — data di bulan itu ke bawah tidak bisa diubah.
    </div>

    <div ref="report">
    <div class="date-banner">📅 Data per hari ini: <b>{{ todayLabel }}</b></div>

    <div class="rekap-grid">
    <div class="rekap-col">
    <div class="panel">
      <div class="panel-head">
        <h3>💳 Saldo Rekening Bank</h3>
        <button class="btn danger" @click="resetSaldo">🔄 Nol-in Semua Saldo</button>
      </div>
      <div class="hint" style="margin-bottom:10px;">Total saldo saat ini: <b>Rp {{ totalSaldo.toLocaleString('id-ID') }}</b></div>

      <div class="toolbar no-export" style="margin-bottom:10px;">
        <span class="gm-label">Filter PIC:</span>
        <select :value="picFilter" @change="picFilter = ($event.target as HTMLSelectElement).value || null">
          <option value="">Semua PIC</option>
          <option v-for="p in pics" :key="p.id" :value="p.id">{{ p.nama }}</option>
        </select>
      </div>

      <div v-for="g in groupsWithBalances" :key="g.id" style="margin-bottom:10px;">
        <div class="table-wrap">
          <table class="dense" :data-sheet="g.nama">
            <colgroup>
              <col style="width:10%"><col style="width:19%"><col style="width:15%"><col style="width:15%"><col style="width:16%"><col style="width:14%"><col style="width:11%">
            </colgroup>
            <thead><tr><th>PIC</th><th>Rekening</th><th class="num">Saldo</th><th class="num">Bisa Dipakai</th><th>Ket</th><th>Grup</th><th></th></tr></thead>
            <tbody>
              <tr v-for="b in balancesForGroup(g.id)" :key="b.id" :style="g.warna ? `background:${g.warna}` : ''">
                <td>
                  <select :value="b.pic" @change="patchBalance(b, 'pic', ($event.target as HTMLSelectElement).value || null)">
                    <option value="">-</option>
                    <option v-for="p in pics" :key="p.id" :value="p.id">{{ p.nama }}</option>
                  </select>
                </td>
                <td><input type="text" :value="b.rek" class="cell-edit" style="width:150px;" @change="patchBalance(b, 'rek', ($event.target as HTMLInputElement).value)" /></td>
                <td class="num"><input type="text" :value="b.saldo.toLocaleString('id-ID')" style="width:110px;text-align:right;" :disabled="b.locked" :title="b.locked ? 'Saldo digembok' : ''" @focus="($event.target as HTMLInputElement).select()" @change="patchBalance(b, 'saldo', parseNum(($event.target as HTMLInputElement).value))" /></td>
                <td class="num" :title="'Rumus: saldo > 12jt ? bulatkan ke juta - 12jt : 0'">{{ (b.bisaDipakai ?? 0).toLocaleString('id-ID') }}</td>
                <td><input type="text" :value="b.ket" class="cell-edit" style="width:120px;" @change="patchBalance(b, 'ket', ($event.target as HTMLInputElement).value)" /></td>
                <td>
                  <select :value="b.grup" style="width:90px;" @change="patchBalance(b, 'grup', ($event.target as HTMLSelectElement).value || null)">
                    <option value="">Tanpa Grup</option>
                    <option v-for="gr in groups" :key="gr.id" :value="gr.id">{{ gr.nama }}</option>
                  </select>
                </td>
                <td class="row-actions">
                  <span class="row-lock" :title="b.locked ? 'Buka gembok' : 'Gembok baris ini'" @click="toggleRowLock(b)">{{ b.locked ? '🔒' : '🔓' }}</span>
                  <span class="row-del" @click="deleteBalance(b.id)">✕</span>
                </td>
              </tr>
              <tr class="subtotal-row" :style="g.warna ? `background:${g.warna}` : 'background:#F1F1F1'">
                <td colspan="2">TOTAL {{ g.nama }}</td>
                <td class="num">Rp {{ subtotal(balancesForGroup(g.id)).saldo.toLocaleString('id-ID') }}</td>
                <td class="num">Rp {{ subtotal(balancesForGroup(g.id)).bisaDipakai.toLocaleString('id-ID') }}</td>
                <td colspan="3"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="noGroupBalances.length" style="margin-bottom:10px;">
        <div class="table-wrap">
          <table class="dense" data-sheet="Tanpa Grup">
            <colgroup>
              <col style="width:10%"><col style="width:19%"><col style="width:15%"><col style="width:15%"><col style="width:16%"><col style="width:14%"><col style="width:11%">
            </colgroup>
            <thead><tr><th>PIC</th><th>Rekening</th><th class="num">Saldo</th><th class="num">Bisa Dipakai</th><th>Ket</th><th>Grup</th><th></th></tr></thead>
            <tbody>
              <tr v-for="b in noGroupBalances" :key="b.id">
                <td>
                  <select :value="b.pic" @change="patchBalance(b, 'pic', ($event.target as HTMLSelectElement).value || null)">
                    <option value="">-</option>
                    <option v-for="p in pics" :key="p.id" :value="p.id">{{ p.nama }}</option>
                  </select>
                </td>
                <td><input type="text" :value="b.rek" class="cell-edit" style="width:150px;" @change="patchBalance(b, 'rek', ($event.target as HTMLInputElement).value)" /></td>
                <td class="num"><input type="text" :value="b.saldo.toLocaleString('id-ID')" style="width:110px;text-align:right;" :disabled="b.locked" :title="b.locked ? 'Saldo digembok' : ''" @focus="($event.target as HTMLInputElement).select()" @change="patchBalance(b, 'saldo', parseNum(($event.target as HTMLInputElement).value))" /></td>
                <td class="num" :title="'Rumus: saldo > 12jt ? bulatkan ke juta - 12jt : 0'">{{ (b.bisaDipakai ?? 0).toLocaleString('id-ID') }}</td>
                <td><input type="text" :value="b.ket" class="cell-edit" style="width:120px;" @change="patchBalance(b, 'ket', ($event.target as HTMLInputElement).value)" /></td>
                <td>
                  <select :value="b.grup" style="width:90px;" @change="patchBalance(b, 'grup', ($event.target as HTMLSelectElement).value || null)">
                    <option value="">Tanpa Grup</option>
                    <option v-for="gr in groups" :key="gr.id" :value="gr.id">{{ gr.nama }}</option>
                  </select>
                </td>
                <td class="row-actions">
                  <span class="row-lock" :title="b.locked ? 'Buka gembok' : 'Gembok baris ini'" @click="toggleRowLock(b)">{{ b.locked ? '🔒' : '🔓' }}</span>
                  <span class="row-del" @click="deleteBalance(b.id)">✕</span>
                </td>
              </tr>
              <tr class="subtotal-row" style="background:#F1F1F1">
                <td colspan="2">TOTAL Tanpa Grup</td>
                <td class="num">Rp {{ subtotal(noGroupBalances).saldo.toLocaleString('id-ID') }}</td>
                <td class="num">Rp {{ subtotal(noGroupBalances).bisaDipakai.toLocaleString('id-ID') }}</td>
                <td colspan="3"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="table-wrap" style="margin-top:6px;">
        <table class="dense" data-sheet="Total Bank">
          <colgroup>
            <col style="width:70%"><col style="width:15%"><col style="width:15%">
          </colgroup>
          <tbody>
            <tr class="grand-total-row">
              <td>TOTAL BANK</td>
              <td class="num">Rp {{ grandTotal.saldo.toLocaleString('id-ID') }}</td>
              <td class="num">Rp {{ grandTotal.bisaDipakai.toLocaleString('id-ID') }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="!balances.length" class="empty-state">
        Belum ada rekening bank. Tambahkan lewat form di bawah.
      </div>

      <div class="toolbar" style="margin-top:10px;">
        <span class="gm-label">+ Tambah baris:</span>
        <select v-model="newRow.pic" style="width:120px;">
          <option value="">Tanpa PIC</option>
          <option v-for="p in pics" :key="p.id" :value="p.id">{{ p.nama }}</option>
        </select>
        <input type="text" v-model="newRow.rek" placeholder="Nama Rekening" style="width:180px;" />
        <button class="btn" @click="addBalance">+ Tambah</button>
      </div>
    </div>
    </div>

    <div class="rekap-col">
    <div class="panel">
      <div class="panel-head">
        <h3>🏦 Deposito</h3>
        <button class="btn" @click="addRow('deposito')">+ Tambah</button>
      </div>
      <div class="hint" style="margin-bottom:10px;">Total deposito: <b>Rp {{ totalDeposito.toLocaleString('id-ID') }}</b></div>
      <div class="table-wrap">
        <table class="dense" data-sheet="Deposito">
          <colgroup>
            <col style="width:20%"><col style="width:16%"><col style="width:15%"><col style="width:9%"><col style="width:15%"><col style="width:19%"><col style="width:6%">
          </colgroup>
          <thead><tr><th>Nama</th><th class="num">Nominal</th><th>Tgl Masuk</th><th>Rate</th><th>Jatuh Tempo</th><th>Keterangan</th><th></th></tr></thead>
          <tbody>
            <tr v-if="!deposito.length"><td colspan="7" class="empty-state">Belum ada data deposito.</td></tr>
            <tr
              v-for="d in deposito" :key="d.id"
              :style="depositoColors.colorOf(d.id) ? `background:${depositoColors.colorOf(d.id)}` : ''"
              @contextmenu="depositoColors.open($event, d.id)"
              title="Klik kanan buat warnain baris"
            >
              <td><input type="text" :value="d.nama" class="cell-edit" style="width:120px;" @change="patchRow('deposito', d, 'nama', ($event.target as HTMLInputElement).value)" /></td>
              <td class="num"><input type="text" :value="d.nominal.toLocaleString('id-ID')" style="width:120px;text-align:right;" @change="patchRow('deposito', d, 'nominal', parseNum(($event.target as HTMLInputElement).value))" /></td>
              <td><input type="date" :value="d.tglMasuk" style="width:130px;" @change="patchRow('deposito', d, 'tglMasuk', ($event.target as HTMLInputElement).value || null)" /></td>
              <td><input type="text" :value="d.rate" class="cell-edit" style="width:70px;" @change="patchRow('deposito', d, 'rate', ($event.target as HTMLInputElement).value)" /></td>
              <td><input type="date" :value="d.jatuhTempo" style="width:130px;" @change="patchRow('deposito', d, 'jatuhTempo', ($event.target as HTMLInputElement).value || null)" /></td>
              <td><input type="text" :value="d.ket" class="cell-edit" style="width:140px;" @change="patchRow('deposito', d, 'ket', ($event.target as HTMLInputElement).value)" /></td>
              <td><span class="row-del" @click="deleteRow('deposito', d.id)">✕</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3>💸 Hutang</h3>
        <button class="btn" @click="addRow('hutang')">+ Tambah</button>
      </div>
      <div class="hint" style="margin-bottom:10px;">Total hutang: <b>Rp {{ totalHutang.toLocaleString('id-ID') }}</b></div>
      <div class="table-wrap">
        <table class="dense" data-sheet="Hutang">
          <colgroup>
            <col style="width:13%"><col style="width:13%"><col style="width:13%"><col style="width:7%"><col style="width:13%"><col style="width:17%"><col style="width:18%"><col style="width:6%">
          </colgroup>
          <thead><tr><th>Peminjam</th><th>Kreditur</th><th class="num">Nominal</th><th>Rate</th><th>Tgl Pinjam</th><th>Jatuh Tempo</th><th>Keterangan</th><th></th></tr></thead>
          <tbody>
            <tr v-if="!hutang.length"><td colspan="8" class="empty-state">Belum ada data hutang.</td></tr>
            <tr
              v-for="h in hutang" :key="h.id"
              :style="hutangColors.colorOf(h.id) ? `background:${hutangColors.colorOf(h.id)}` : ''"
              @contextmenu="hutangColors.open($event, h.id)"
              title="Klik kanan buat warnain baris"
            >
              <td><input type="text" :value="h.peminjam" class="cell-edit" style="width:110px;" @change="patchRow('hutang', h, 'peminjam', ($event.target as HTMLInputElement).value)" /></td>
              <td><input type="text" :value="h.kreditur" class="cell-edit" style="width:110px;" @change="patchRow('hutang', h, 'kreditur', ($event.target as HTMLInputElement).value)" /></td>
              <td class="num"><input type="text" :value="h.nominal.toLocaleString('id-ID')" style="width:120px;text-align:right;" @change="patchRow('hutang', h, 'nominal', parseNum(($event.target as HTMLInputElement).value))" /></td>
              <td><input type="text" :value="h.rate" class="cell-edit" style="width:70px;" @change="patchRow('hutang', h, 'rate', ($event.target as HTMLInputElement).value)" /></td>
              <td><input type="date" :value="h.tglPinjam" style="width:130px;" @change="patchRow('hutang', h, 'tglPinjam', ($event.target as HTMLInputElement).value || null)" /></td>
              <td>
                <div style="display:flex;flex-direction:column;gap:2px;">
                  <input type="date" :value="h.jatuhTempo" @change="patchRow('hutang', h, 'jatuhTempo', ($event.target as HTMLInputElement).value || null)" />
                  <span v-if="h.jatuhTempo && h.jatuhTempo < today" class="pill overdue" style="margin-left:0;">Lewat tempo</span>
                </div>
              </td>
              <td><input type="text" :value="h.ket" class="cell-edit" style="width:140px;" @change="patchRow('hutang', h, 'ket', ($event.target as HTMLInputElement).value)" /></td>
              <td><span class="row-del" @click="deleteRow('hutang', h.id)">✕</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3>🧾 Bayar</h3>
        <button class="btn" @click="addRow('bayar')">+ Tambah</button>
      </div>
      <div class="hint" style="margin-bottom:10px;">Total bayar: <b>Rp {{ totalBayar.toLocaleString('id-ID') }}</b></div>
      <div class="table-wrap">
        <table class="dense" data-sheet="Bayar">
          <colgroup>
            <col style="width:9%"><col style="width:11%"><col style="width:11%"><col style="width:11%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:25%"><col style="width:6%">
          </colgroup>
          <thead><tr><th>PT</th><th class="num">Nominal</th><th>Tgl Bayar</th><th>Tgl Pesan</th><th>No Ctr</th><th>Pay IAM</th><th>Pay Ekspds</th><th>Keterangan</th><th></th></tr></thead>
          <tbody>
            <tr v-if="!bayar.length"><td colspan="9" class="empty-state">Belum ada data bayar.</td></tr>
            <tr
              v-for="b in bayar" :key="b.id"
              :style="bayarColors.colorOf(b.id) ? `background:${bayarColors.colorOf(b.id)}` : ''"
              @contextmenu="bayarColors.open($event, b.id)"
              title="Klik kanan buat warnain baris"
            >
              <td><input type="text" :value="b.pt" class="cell-edit" style="width:90px;" @change="patchRow('bayar', b, 'pt', ($event.target as HTMLInputElement).value)" /></td>
              <td class="num"><input type="text" :value="b.nominal.toLocaleString('id-ID')" style="width:120px;text-align:right;" @change="patchRow('bayar', b, 'nominal', parseNum(($event.target as HTMLInputElement).value))" /></td>
              <td><input type="date" :value="b.tglBayar" style="width:130px;" @change="patchRow('bayar', b, 'tglBayar', ($event.target as HTMLInputElement).value || null)" /></td>
              <td><input type="date" :value="b.tglPesan" style="width:130px;" @change="patchRow('bayar', b, 'tglPesan', ($event.target as HTMLInputElement).value || null)" /></td>
              <td><input type="text" :value="b.noCtr" class="cell-edit" style="width:90px;" @change="patchRow('bayar', b, 'noCtr', ($event.target as HTMLInputElement).value)" /></td>
              <td><input type="text" :value="b.payIam" class="cell-edit" style="width:90px;" @change="patchRow('bayar', b, 'payIam', ($event.target as HTMLInputElement).value)" /></td>
              <td><input type="text" :value="b.payEkspds" class="cell-edit" style="width:90px;" @change="patchRow('bayar', b, 'payEkspds', ($event.target as HTMLInputElement).value)" /></td>
              <td><input type="text" :value="b.ket" class="cell-edit" style="width:130px;" @change="patchRow('bayar', b, 'ket', ($event.target as HTMLInputElement).value)" /></td>
              <td><span class="row-del" @click="deleteRow('bayar', b.id)">✕</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    </div>
    </div>
    </div>

    <RowColorMenu :menu="depositoColors.menu" @pick="depositoColors.pick" />
    <RowColorMenu :menu="hutangColors.menu" @pick="hutangColors.pick" />
    <RowColorMenu :menu="bayarColors.menu" @pick="bayarColors.pick" />
  </div>
</template>

<style scoped>
.rekap-grid table.dense {
  table-layout: fixed;
  width: 100%;
  min-width: 0;
}
.rekap-grid table.dense thead th,
.rekap-grid table.dense tbody td {
  padding: 2px 6px;
}
.rekap-grid table.dense input,
.rekap-grid table.dense select {
  width: 100% !important;
  box-sizing: border-box;
  padding: 1px 4px;
  height: 22px;
  line-height: 1.2;
  font-size: 11.5px;
}
</style>
