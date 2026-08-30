<script setup lang="ts">
import { hitungBisaDipakai, parseNum, formatDateShort, parseDateShort, autoGrow, lightenColor, darkenColor } from '~/utils/format'

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
type Bayar = { id: string; pt: string | null; groupId: string | null; nominal: number; tglBayar: string | null; tglPesan: string | null; noCtr: string | null; payIam: string | null; payEkspds: string | null; ket: string | null }

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
function patchDateShort(kind: 'hutang' | 'bayar', row: any, field: string, rawText: string) {
  const trimmed = rawText.trim()
  if (!trimmed) { patchRow(kind, row, field, null); return }
  const iso = parseDateShort(trimmed)
  if (!iso) { alert('Format tanggal salah. Pakai dd/mm/yy, misal 25/09/26.'); return }
  patchRow(kind, row, field, iso)
}
const totalDeposito = computed(() => deposito.value.reduce((s, d) => s + (d.nominal || 0), 0))
const totalHutang = computed(() => hutang.value.reduce((s, h) => s + (h.nominal || 0), 0))
const totalBayar = computed(() => bayar.value.reduce((s, b) => s + (b.nominal || 0), 0))

function bayarForGroup(groupId: string | null) {
  return bayar.value.filter(b => (b.groupId || null) === groupId)
}
const groupsWithBayar = computed(() => groups.value.filter(g => bayarForGroup(g.id).length))
const noGroupBayar = computed(() => bayarForGroup(null))
function bayarSubtotal(rows: Bayar[]) {
  return rows.reduce((s, r) => s + (r.nominal || 0), 0)
}
/** Warna baris Bayar: warna manual (klik kanan) menang kalau ada, else tint terang dari warna Group-nya. */
function bayarRowStyle(b: Bayar, groupWarna?: string | null) {
  const manual = bayarColors.colorOf(b.id)
  if (manual) return `background:${manual}`
  if (groupWarna) return `background:${lightenColor(groupWarna)}`
  return ''
}

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
const newRow = reactive({ pic: '', rek: '', grup: '' })
async function addBalance() {
  if (!newRow.rek) { alert('Isi nama rekening dulu.'); return }
  try {
    await api('/api/rekap/balances', { method: 'POST', body: { pic: newRow.pic, rek: newRow.rek, saldo: 0, bisaDipakai: 0, ket: '', grup: newRow.grup || null } })
    newRow.pic = ''
    newRow.rek = ''
    newRow.grup = ''
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
</script>

<template>
  <div @click="closeColorMenus">
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

    <div class="rekap-grid">
    <div class="rekap-col">
    <div class="panel">
      <div class="panel-head">
        <h3><span class="card-icon card-icon-bank">💳</span> Saldo RK</h3>
        <button class="btn danger" @click="resetSaldo">🔄 Reset Saldo</button>
      </div>

      <div class="toolbar no-export" style="margin-bottom:10px;">
        <span class="gm-label">Filter PIC:</span>
        <select :value="picFilter" @change="picFilter = ($event.target as HTMLSelectElement).value || null">
          <option value="">Semua PIC</option>
          <option v-for="p in pics" :key="p.id" :value="p.id">{{ p.nama }}</option>
        </select>
      </div>

      <div v-for="g in groupsWithBalances" :key="g.id" style="margin-bottom:10px;">
        <div class="table-wrap">
          <table class="dense bank-dense" :data-sheet="g.nama">
            <colgroup>
              <col style="width:10%"><col style="width:18%"><col style="width:19%"><col style="width:19%"><col style="width:22%"><col style="width:12%">
            </colgroup>
            <thead><tr><th>PIC</th><th>Rekening</th><th class="num">Saldo</th><th class="num">Bisa Dipakai</th><th>Ket</th><th></th></tr></thead>
            <tbody>
              <tr v-for="b in balancesForGroup(g.id)" :key="b.id" :style="{ background: lightenColor(g.warna) }">
                <td>
                  <select :value="b.pic" @change="patchBalance(b, 'pic', ($event.target as HTMLSelectElement).value || null)">
                    <option value="">-</option>
                    <option v-for="p in pics" :key="p.id" :value="p.id">{{ p.nama }}</option>
                  </select>
                </td>
                <td><input type="text" :value="b.rek" class="cell-edit" @change="patchBalance(b, 'rek', ($event.target as HTMLInputElement).value)" /></td>
                <td class="num"><input type="text" class="saldo-locked-input" :value="b.saldo.toLocaleString('id-ID')" style="text-align:right;" :disabled="b.locked" :title="b.locked ? 'Saldo digembok' : ''" @focus="($event.target as HTMLInputElement).select()" @change="patchBalance(b, 'saldo', parseNum(($event.target as HTMLInputElement).value))" /></td>
                <td class="num" :title="'Rumus: saldo > 12jt ? bulatkan ke juta - 12jt : 0'">{{ (b.bisaDipakai ?? 0).toLocaleString('id-ID') }}</td>
                <td><input type="text" :value="b.ket" class="cell-edit" @change="patchBalance(b, 'ket', ($event.target as HTMLInputElement).value)" /></td>
                <td class="row-actions">
                  <span class="row-lock" :class="{ 'is-locked': b.locked }" :title="b.locked ? 'Terkunci — klik buat buka' : 'Terbuka — klik buat kunci'" @click="toggleRowLock(b)">{{ b.locked ? '🔒' : '🔓' }}</span>
                  <span class="row-del" @click="deleteBalance(b.id)">✕</span>
                </td>
              </tr>
              <tr class="subtotal-row" :style="{ background: darkenColor(g.warna) || '#F1F1F1', color: g.warna ? '#fff' : 'inherit' }">
                <td colspan="2">TOTAL {{ g.nama }}</td>
                <td class="num">{{ subtotal(balancesForGroup(g.id)).saldo.toLocaleString('id-ID') }}</td>
                <td class="num">{{ subtotal(balancesForGroup(g.id)).bisaDipakai.toLocaleString('id-ID') }}</td>
                <td colspan="2"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="noGroupBalances.length" style="margin-bottom:10px;">
        <div class="table-wrap">
          <table class="dense bank-dense" data-sheet="Tanpa Grup">
            <colgroup>
              <col style="width:10%"><col style="width:18%"><col style="width:19%"><col style="width:19%"><col style="width:22%"><col style="width:12%">
            </colgroup>
            <thead><tr><th>PIC</th><th>Rekening</th><th class="num">Saldo</th><th class="num">Bisa Dipakai</th><th>Ket</th><th></th></tr></thead>
            <tbody>
              <tr v-for="b in noGroupBalances" :key="b.id">
                <td>
                  <select :value="b.pic" @change="patchBalance(b, 'pic', ($event.target as HTMLSelectElement).value || null)">
                    <option value="">-</option>
                    <option v-for="p in pics" :key="p.id" :value="p.id">{{ p.nama }}</option>
                  </select>
                </td>
                <td><input type="text" :value="b.rek" class="cell-edit" @change="patchBalance(b, 'rek', ($event.target as HTMLInputElement).value)" /></td>
                <td class="num"><input type="text" class="saldo-locked-input" :value="b.saldo.toLocaleString('id-ID')" style="text-align:right;" :disabled="b.locked" :title="b.locked ? 'Saldo digembok' : ''" @focus="($event.target as HTMLInputElement).select()" @change="patchBalance(b, 'saldo', parseNum(($event.target as HTMLInputElement).value))" /></td>
                <td class="num" :title="'Rumus: saldo > 12jt ? bulatkan ke juta - 12jt : 0'">{{ (b.bisaDipakai ?? 0).toLocaleString('id-ID') }}</td>
                <td><input type="text" :value="b.ket" class="cell-edit" @change="patchBalance(b, 'ket', ($event.target as HTMLInputElement).value)" /></td>
                <td class="row-actions">
                  <span class="row-lock" :class="{ 'is-locked': b.locked }" :title="b.locked ? 'Terkunci — klik buat buka' : 'Terbuka — klik buat kunci'" @click="toggleRowLock(b)">{{ b.locked ? '🔒' : '🔓' }}</span>
                  <span class="row-del" @click="deleteBalance(b.id)">✕</span>
                </td>
              </tr>
              <tr class="subtotal-row" style="background:#F1F1F1">
                <td colspan="2">TOTAL Tanpa Grup</td>
                <td class="num">{{ subtotal(noGroupBalances).saldo.toLocaleString('id-ID') }}</td>
                <td class="num">{{ subtotal(noGroupBalances).bisaDipakai.toLocaleString('id-ID') }}</td>
                <td colspan="2"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="table-wrap" style="margin-top:6px;">
        <table class="dense bank-dense" data-sheet="Total Bank">
          <colgroup>
            <col style="width:58%"><col style="width:21%"><col style="width:21%">
          </colgroup>
          <tbody>
            <tr class="grand-total-row">
              <td>TOTAL BANK</td>
              <td class="num">{{ grandTotal.saldo.toLocaleString('id-ID') }}</td>
              <td class="num">{{ grandTotal.bisaDipakai.toLocaleString('id-ID') }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="!balances.length" class="empty-state">
        Belum ada rekening bank. Tambahkan lewat form di bawah.
      </div>

      <div class="toolbar" style="margin-top:10px;">
        <select v-model="newRow.pic" style="width:120px;">
          <option value="">Tanpa PIC</option>
          <option v-for="p in pics" :key="p.id" :value="p.id">{{ p.nama }}</option>
        </select>
        <input type="text" v-model="newRow.rek" placeholder="Nama Rekening" style="width:180px;" />
        <select v-model="newRow.grup" style="width:120px;">
          <option value="">Tanpa Grup</option>
          <option v-for="gr in groups" :key="gr.id" :value="gr.id">{{ gr.nama }}</option>
        </select>
        <button class="btn" @click="addBalance">+ Tambah</button>
      </div>
    </div>
    </div>

    <div class="rekap-col">
    <div class="panel">
      <div class="panel-head">
        <h3><span class="card-icon card-icon-deposito">🏦</span> Deposito</h3>
        <button class="btn" @click="addRow('deposito')">+ Tambah</button>
      </div>
      <div class="table-wrap">
        <table class="dense" data-sheet="Deposito">
          <colgroup>
            <col style="width:20%"><col style="width:16%"><col style="width:9%"><col style="width:15%"><col style="width:15%"><col style="width:19%"><col style="width:6%">
          </colgroup>
          <thead><tr><th>Nama</th><th class="num">Nominal</th><th>Rate</th><th>Tgl Masuk</th><th>Jatuh Tempo</th><th>Keterangan</th><th></th></tr></thead>
          <tbody>
            <tr v-if="!deposito.length"><td colspan="7" class="empty-state">Belum ada data deposito.</td></tr>
            <tr
              v-for="d in deposito" :key="d.id"
              :style="depositoColors.colorOf(d.id) ? `background:${depositoColors.colorOf(d.id)}` : ''"
              @contextmenu="depositoColors.open($event, d.id)"
              title="Klik kanan buat warnain baris"
            >
              <td>
                <textarea
                  :ref="(el) => autoGrow(el)" class="cell-edit wrap-textarea" rows="1"
                  :value="d.nama" @input="autoGrow($event.target)"
                  @change="patchRow('deposito', d, 'nama', ($event.target as HTMLTextAreaElement).value)"
                ></textarea>
              </td>
              <td class="num"><input type="text" :value="d.nominal.toLocaleString('id-ID')" style="width:120px;text-align:right;" @change="patchRow('deposito', d, 'nominal', parseNum(($event.target as HTMLInputElement).value))" /></td>
              <td><input type="text" :value="d.rate" class="cell-edit" style="width:70px;" @change="patchRow('deposito', d, 'rate', ($event.target as HTMLInputElement).value)" /></td>
              <td><input type="date" :value="d.tglMasuk" style="width:130px;" @change="patchRow('deposito', d, 'tglMasuk', ($event.target as HTMLInputElement).value || null)" /></td>
              <td><input type="date" :value="d.jatuhTempo" style="width:130px;" @change="patchRow('deposito', d, 'jatuhTempo', ($event.target as HTMLInputElement).value || null)" /></td>
              <td>
                <textarea
                  :ref="(el) => autoGrow(el)" class="cell-edit wrap-textarea" rows="1"
                  :value="d.ket" @input="autoGrow($event.target)"
                  @change="patchRow('deposito', d, 'ket', ($event.target as HTMLTextAreaElement).value)"
                ></textarea>
              </td>
              <td><span class="row-del" @click="deleteRow('deposito', d.id)">✕</span></td>
            </tr>
            <tr v-if="deposito.length" class="subtotal-row">
              <td>TOTAL</td>
              <td class="num">{{ totalDeposito.toLocaleString('id-ID') }}</td>
              <td colspan="5"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3><span class="card-icon card-icon-hutang">💸</span> Hutang</h3>
        <button class="btn" @click="addRow('hutang')">+ Tambah</button>
      </div>
      <div class="table-wrap">
        <table class="dense" data-sheet="Hutang">
          <colgroup>
            <col style="width:7%"><col style="width:19%"><col style="width:17%"><col style="width:5%"><col style="width:13%"><col style="width:14%"><col style="width:19%"><col style="width:6%">
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
              <td>
                <textarea
                  :ref="(el) => autoGrow(el)" class="cell-edit wrap-textarea" rows="1"
                  :value="h.peminjam" @input="autoGrow($event.target)"
                  @change="patchRow('hutang', h, 'peminjam', ($event.target as HTMLTextAreaElement).value)"
                ></textarea>
              </td>
              <td>
                <textarea
                  :ref="(el) => autoGrow(el)" class="cell-edit wrap-textarea" rows="1"
                  :value="h.kreditur" @input="autoGrow($event.target)"
                  @change="patchRow('hutang', h, 'kreditur', ($event.target as HTMLTextAreaElement).value)"
                ></textarea>
              </td>
              <td class="num"><input type="text" :value="h.nominal.toLocaleString('id-ID')" style="width:130px;text-align:right;" @change="patchRow('hutang', h, 'nominal', parseNum(($event.target as HTMLInputElement).value))" /></td>
              <td><input type="text" :value="h.rate" class="cell-edit" style="width:44px;" @change="patchRow('hutang', h, 'rate', ($event.target as HTMLInputElement).value)" /></td>
              <td><input type="text" :value="formatDateShort(h.tglPinjam)" placeholder="dd/mm/yy" @change="patchDateShort('hutang', h, 'tglPinjam', ($event.target as HTMLInputElement).value)" /></td>
              <td>
                <div style="display:flex;flex-direction:column;gap:2px;">
                  <input type="text" :value="formatDateShort(h.jatuhTempo)" placeholder="dd/mm/yy" @change="patchDateShort('hutang', h, 'jatuhTempo', ($event.target as HTMLInputElement).value)" />
                  <span v-if="h.jatuhTempo && h.jatuhTempo < today" class="pill overdue" style="margin-left:0;">Lewat tempo</span>
                </div>
              </td>
              <td>
                <textarea
                  :ref="(el) => autoGrow(el)" class="cell-edit wrap-textarea" rows="1"
                  :value="h.ket" @input="autoGrow($event.target)"
                  @change="patchRow('hutang', h, 'ket', ($event.target as HTMLTextAreaElement).value)"
                ></textarea>
              </td>
              <td><span class="row-del" @click="deleteRow('hutang', h.id)">✕</span></td>
            </tr>
            <tr v-if="hutang.length" class="subtotal-row">
              <td colspan="2">TOTAL</td>
              <td class="num">{{ totalHutang.toLocaleString('id-ID') }}</td>
              <td colspan="5"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3><span class="card-icon card-icon-bayar">🧾</span> Bayar</h3>
        <button class="btn" @click="addRow('bayar')">+ Tambah</button>
      </div>

      <div v-for="g in groupsWithBayar" :key="g.id" style="margin-bottom:10px;">
        <div class="table-wrap">
          <table class="dense bayar-dense" :data-sheet="`Bayar ${g.nama}`">
            <colgroup>
              <col style="width:9%"><col style="width:20%"><col style="width:11%"><col style="width:11%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:16%"><col style="width:6%">
            </colgroup>
            <thead><tr><th>Group</th><th class="num">Nominal</th><th>Tgl Bayar</th><th>Tgl Pesan</th><th>No Ctr</th><th>Pay IAM</th><th>Pay Ekspds</th><th>Keterangan</th><th></th></tr></thead>
            <tbody>
              <tr
                v-for="b in bayarForGroup(g.id)" :key="b.id"
                :style="bayarRowStyle(b, g.warna)"
                @contextmenu="bayarColors.open($event, b.id)"
                title="Klik kanan buat warnain baris"
              >
                <td>
                  <select :value="b.groupId" @change="patchRow('bayar', b, 'groupId', ($event.target as HTMLSelectElement).value || null)">
                    <option value="">Tanpa Grup</option>
                    <option v-for="gr in groups" :key="gr.id" :value="gr.id">{{ gr.nama }}</option>
                  </select>
                </td>
                <td class="num"><input type="text" :value="b.nominal.toLocaleString('id-ID')" style="width:130px;text-align:right;" @change="patchRow('bayar', b, 'nominal', parseNum(($event.target as HTMLInputElement).value))" /></td>
                <td><input type="text" :value="formatDateShort(b.tglBayar)" placeholder="dd/mm/yy" @change="patchDateShort('bayar', b, 'tglBayar', ($event.target as HTMLInputElement).value)" /></td>
                <td><input type="text" :value="formatDateShort(b.tglPesan)" placeholder="dd/mm/yy" @change="patchDateShort('bayar', b, 'tglPesan', ($event.target as HTMLInputElement).value)" /></td>
                <td>
                  <textarea
                    :ref="(el) => autoGrow(el)" class="cell-edit wrap-textarea" rows="1"
                    :value="b.noCtr" @input="autoGrow($event.target)"
                    @change="patchRow('bayar', b, 'noCtr', ($event.target as HTMLTextAreaElement).value)"
                  ></textarea>
                </td>
                <td>
                  <textarea
                    :ref="(el) => autoGrow(el)" class="cell-edit wrap-textarea" rows="1"
                    :value="b.payIam" @input="autoGrow($event.target)"
                    @change="patchRow('bayar', b, 'payIam', ($event.target as HTMLTextAreaElement).value)"
                  ></textarea>
                </td>
                <td>
                  <textarea
                    :ref="(el) => autoGrow(el)" class="cell-edit wrap-textarea" rows="1"
                    :value="b.payEkspds" @input="autoGrow($event.target)"
                    @change="patchRow('bayar', b, 'payEkspds', ($event.target as HTMLTextAreaElement).value)"
                  ></textarea>
                </td>
                <td>
                  <textarea
                    :ref="(el) => autoGrow(el)" class="cell-edit wrap-textarea" rows="1"
                    :value="b.ket" @input="autoGrow($event.target)"
                    @change="patchRow('bayar', b, 'ket', ($event.target as HTMLTextAreaElement).value)"
                  ></textarea>
                </td>
                <td><span class="row-del" @click="deleteRow('bayar', b.id)">✕</span></td>
              </tr>
              <tr class="subtotal-row" :style="{ background: darkenColor(g.warna) || '#F1F1F1', color: g.warna ? '#fff' : 'inherit' }">
                <td>TOTAL {{ g.nama }}</td>
                <td class="num">{{ bayarSubtotal(bayarForGroup(g.id)).toLocaleString('id-ID') }}</td>
                <td colspan="7"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="noGroupBayar.length" style="margin-bottom:10px;">
        <div class="table-wrap">
          <table class="dense bayar-dense" data-sheet="Bayar Tanpa Grup">
            <colgroup>
              <col style="width:9%"><col style="width:20%"><col style="width:11%"><col style="width:11%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:16%"><col style="width:6%">
            </colgroup>
            <thead><tr><th>Group</th><th class="num">Nominal</th><th>Tgl Bayar</th><th>Tgl Pesan</th><th>No Ctr</th><th>Pay IAM</th><th>Pay Ekspds</th><th>Keterangan</th><th></th></tr></thead>
            <tbody>
              <tr
                v-for="b in noGroupBayar" :key="b.id"
                :style="bayarRowStyle(b)"
                @contextmenu="bayarColors.open($event, b.id)"
                title="Klik kanan buat warnain baris"
              >
                <td>
                  <select :value="b.groupId" @change="patchRow('bayar', b, 'groupId', ($event.target as HTMLSelectElement).value || null)">
                    <option value="">Tanpa Grup</option>
                    <option v-for="gr in groups" :key="gr.id" :value="gr.id">{{ gr.nama }}</option>
                  </select>
                </td>
                <td class="num"><input type="text" :value="b.nominal.toLocaleString('id-ID')" style="width:130px;text-align:right;" @change="patchRow('bayar', b, 'nominal', parseNum(($event.target as HTMLInputElement).value))" /></td>
                <td><input type="text" :value="formatDateShort(b.tglBayar)" placeholder="dd/mm/yy" @change="patchDateShort('bayar', b, 'tglBayar', ($event.target as HTMLInputElement).value)" /></td>
                <td><input type="text" :value="formatDateShort(b.tglPesan)" placeholder="dd/mm/yy" @change="patchDateShort('bayar', b, 'tglPesan', ($event.target as HTMLInputElement).value)" /></td>
                <td>
                  <textarea
                    :ref="(el) => autoGrow(el)" class="cell-edit wrap-textarea" rows="1"
                    :value="b.noCtr" @input="autoGrow($event.target)"
                    @change="patchRow('bayar', b, 'noCtr', ($event.target as HTMLTextAreaElement).value)"
                  ></textarea>
                </td>
                <td>
                  <textarea
                    :ref="(el) => autoGrow(el)" class="cell-edit wrap-textarea" rows="1"
                    :value="b.payIam" @input="autoGrow($event.target)"
                    @change="patchRow('bayar', b, 'payIam', ($event.target as HTMLTextAreaElement).value)"
                  ></textarea>
                </td>
                <td>
                  <textarea
                    :ref="(el) => autoGrow(el)" class="cell-edit wrap-textarea" rows="1"
                    :value="b.payEkspds" @input="autoGrow($event.target)"
                    @change="patchRow('bayar', b, 'payEkspds', ($event.target as HTMLTextAreaElement).value)"
                  ></textarea>
                </td>
                <td>
                  <textarea
                    :ref="(el) => autoGrow(el)" class="cell-edit wrap-textarea" rows="1"
                    :value="b.ket" @input="autoGrow($event.target)"
                    @change="patchRow('bayar', b, 'ket', ($event.target as HTMLTextAreaElement).value)"
                  ></textarea>
                </td>
                <td><span class="row-del" @click="deleteRow('bayar', b.id)">✕</span></td>
              </tr>
              <tr class="subtotal-row" style="background:#F1F1F1">
                <td>TOTAL Tanpa Grup</td>
                <td class="num">{{ bayarSubtotal(noGroupBayar).toLocaleString('id-ID') }}</td>
                <td colspan="7"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="!bayar.length" class="empty-state">Belum ada data bayar.</div>

      <div class="table-wrap" style="margin-top:6px;">
        <table class="dense" data-sheet="Bayar Total">
          <colgroup>
            <col style="width:75%"><col style="width:25%">
          </colgroup>
          <tbody>
            <tr class="grand-total-row">
              <td>TOTAL BAYAR</td>
              <td class="num">{{ totalBayar.toLocaleString('id-ID') }}</td>
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
  min-width: 0;
  box-sizing: border-box;
  padding: 1px 4px;
  height: 22px;
  line-height: 1.2;
  font-size: 11.5px;
}
.rekap-grid table.dense textarea.wrap-textarea {
  width: 100% !important;
  box-sizing: border-box;
  padding: 1px 4px;
  min-height: 22px;
  line-height: 1.2;
  font-size: 11.5px;
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  resize: none;
  overflow: hidden;
  display: block;
}
/* Baris subtotal/grand-total nampilin teks polos (bukan input yang bisa clip sendiri) —
   dibolehin wrap biar angka besar gak pernah numpuk ke kolom sebelah, baik di layar maupun di screenshot. */
.rekap-grid table.dense .subtotal-row td.num,
.rekap-grid table.dense .grand-total-row td.num {
  white-space: normal;
  word-break: break-word;
  line-height: 1.3;
}

/* Baris card Saldo Rekening Bank dibikin lebih pendek dari default .dense —
   selector lebih spesifik ini otomatis menang, jadi card Deposito/Hutang/Bayar gak ikut kepengaruh. */
.rekap-grid table.dense.bank-dense thead th,
.rekap-grid table.dense.bank-dense tbody td {
  padding: 1px 5px;
}
.rekap-grid table.dense.bank-dense input,
.rekap-grid table.dense.bank-dense select {
  height: 18px;
  padding: 0 3px;
}

/* Badge bulat berwarna di belakang icon judul card. */
.card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  margin-right: 6px;
  font-size: 13px;
  vertical-align: middle;
}
.card-icon-bank { background: var(--accent-light); }
.card-icon-deposito { background: var(--green-bg); }
.card-icon-hutang { background: var(--red-bg); }
.card-icon-bayar { background: #F3E8FD; }

/* Input/select di card Saldo Rekening Bank dibikin transparan biar warna tone baris
   (di-set inline lewat lightenColor(g.warna) di <tr>) keliatan tembus — bukan ketutup
   background putih bawaan input/select global. Saldo yang lagi 🔒 tetap merah solid. */
.rekap-grid table.dense.bank-dense tbody input,
.rekap-grid table.dense.bank-dense tbody select {
  background: transparent !important;
}
.rekap-grid table.dense.bank-dense tbody .saldo-locked-input:disabled {
  background: var(--red-bg) !important;
  color: var(--red) !important;
}

/* Sama kayak Saldo Rekening Bank di atas — card Bayar juga transparan biar tone
   baris (warna Group / warna manual) keliatan tembus, gak ketutup putih bawaan. */
.rekap-grid table.dense.bayar-dense tbody input,
.rekap-grid table.dense.bayar-dense tbody select,
.rekap-grid table.dense.bayar-dense tbody textarea {
  background: transparent !important;
}

/* Teks di semua tabel Rekap Saldo di-tengahin vertikal, biar baris yang tingginya beda
   (mis. gara-gara textarea wrap ke 2+ baris) tetap rapi sejajar tengah. */
.rekap-grid table.dense tbody td {
  vertical-align: middle;
}
/* Kecuali card Saldo RK — tabelnya balik ke top align. */
.rekap-grid table.dense.bank-dense tbody td {
  vertical-align: top;
}

/* Proporsi 2 kolom Rekap Saldo: kiri (Saldo RK) 45%, kanan (Deposito/Hutang/Bayar) 55%. */
.rekap-grid {
  grid-template-columns: 45% 55%;
}
</style>
