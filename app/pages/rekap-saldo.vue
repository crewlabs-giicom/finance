<script setup lang="ts">
type Group = { id: string; nama: string; warna: string | null }
type Balance = { id: string; pic: string | null; rek: string; saldo: number; bisaDipakai: number | null; ket: string | null; grup: string | null }
type Deposito = { id: string; nama: string | null; nominal: number; tglMasuk: string | null; rate: string | null; jatuhTempo: string | null; ket: string | null }
type Hutang = { id: string; peminjam: string | null; kreditur: string | null; nominal: number; rate: string | null; tglPinjam: string | null; jatuhTempo: string | null; ket: string | null }
type Bayar = { id: string; pt: string | null; nominal: number; tglBayar: string | null; tglPesan: string | null; noCtr: string | null; payIam: string | null; payEkspds: string | null; ket: string | null }

const groups = ref<Group[]>([])
const balances = ref<Balance[]>([])
const deposito = ref<Deposito[]>([])
const hutang = ref<Hutang[]>([])
const bayar = ref<Bayar[]>([])

const today = new Date().toISOString().slice(0, 10)

async function loadAll() {
  ;[groups.value, balances.value, deposito.value, hutang.value, bayar.value] = await Promise.all([
    $fetch('/api/master/groups'),
    $fetch('/api/rekap/balances'),
    $fetch('/api/rekap/deposito'),
    $fetch('/api/rekap/hutang'),
    $fetch('/api/rekap/bayar')
  ])
}
await loadAll()

async function addRow(kind: 'deposito' | 'hutang' | 'bayar') {
  await $fetch(`/api/rekap/${kind}`, { method: 'POST' })
  await loadAll()
}
async function deleteRow(kind: 'deposito' | 'hutang' | 'bayar', id: string) {
  if (!confirm('Hapus baris ini?')) return
  await $fetch(`/api/rekap/${kind}/${id}`, { method: 'DELETE' })
  await loadAll()
}
async function patchRow(kind: 'deposito' | 'hutang' | 'bayar', row: any, field: string, value: any) {
  try {
    await $fetch(`/api/rekap/${kind}/${row.id}`, { method: 'PATCH', body: { [field]: value } })
    row[field] = value
  } catch (e: any) {
    alert(e?.data?.statusMessage || 'Gagal update.')
    await loadAll()
  }
}
const totalDeposito = computed(() => deposito.value.reduce((s, d) => s + (d.nominal || 0), 0))
const totalHutang = computed(() => hutang.value.reduce((s, h) => s + (h.nominal || 0), 0))
const totalBayar = computed(() => bayar.value.reduce((s, b) => s + (b.nominal || 0), 0))

function balancesForGroup(groupId: string | null) {
  return balances.value.filter(b => (b.grup || null) === groupId)
}
const groupsWithBalances = computed(() => groups.value.filter(g => balancesForGroup(g.id).length))
const noGroupBalances = computed(() => balancesForGroup(null))

function subtotal(rows: Balance[]) {
  return {
    saldo: rows.reduce((s, r) => s + (r.saldo || 0), 0),
    bisaDipakai: rows.reduce((s, r) => s + (r.bisaDipakai || 0), 0)
  }
}
const grandTotal = computed(() => subtotal(balances.value))

async function resetSaldo() {
  if (!confirm('Nge-nol-in kolom Saldo semua rekening bank? Kolom "Bisa Dipakai" dan lainnya tidak berubah. Biasanya dilakuin tiap pagi sebelum update data baru.')) return
  await $fetch('/api/rekap/reset-saldo', { method: 'POST' })
  await loadAll()
}

async function patchBalance(b: Balance, field: string, value: any) {
  try {
    await $fetch(`/api/rekap/balances/${b.id}`, { method: 'PATCH', body: { [field]: value } })
    ;(b as any)[field] = value
  } catch (e: any) {
    alert(e?.data?.statusMessage || 'Gagal update.')
    await loadAll()
  }
}
function numFromInput(ev: Event) {
  const raw = (ev.target as HTMLInputElement).value.replace(/[^\d.-]/g, '')
  return Number(raw) || 0
}

const newRow = reactive({ pic: '', rek: '' })
async function addBalance() {
  if (!newRow.rek) { alert('Isi nama rekening dulu.'); return }
  await $fetch('/api/rekap/balances', { method: 'POST', body: { pic: newRow.pic, rek: newRow.rek, saldo: 0, bisaDipakai: 0, ket: '', grup: null } })
  newRow.pic = ''
  newRow.rek = ''
  await loadAll()
}
async function deleteBalance(id: string) {
  if (!confirm('Hapus baris rekening ini?')) return
  await $fetch(`/api/rekap/balances/${id}`, { method: 'DELETE' })
  await loadAll()
}

const totalSaldo = computed(() => balances.value.reduce((s, b) => s + (b.saldo || 0), 0))
</script>

<template>
  <div>
    <div class="topbar">
      <div>
        <h2>Rekap Saldo</h2>
        <p>Ringkasan saldo semua rekening bank per grup.</p>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3>💳 Saldo Rekening Bank</h3>
        <button class="btn danger" @click="resetSaldo">🔄 Nol-in Semua Saldo</button>
      </div>
      <div class="hint" style="margin-bottom:10px;">Total saldo saat ini: <b>Rp {{ totalSaldo.toLocaleString('id-ID') }}</b></div>

      <div class="toolbar" style="margin-bottom:14px;">
        <span class="gm-label">+ Tambah baris:</span>
        <input type="text" v-model="newRow.pic" placeholder="PIC" style="width:120px;" />
        <input type="text" v-model="newRow.rek" placeholder="Nama Rekening" style="width:180px;" />
        <button class="btn" @click="addBalance">+ Tambah</button>
      </div>

      <div v-for="g in groupsWithBalances" :key="g.id" style="margin-bottom:18px;">
        <div style="font-weight:700;margin-bottom:6px;border-left:4px solid var(--accent);padding-left:8px;">{{ g.nama }}</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>PIC</th><th>Rekening</th><th class="num">Saldo</th><th class="num">Bisa Dipakai</th><th>Ket</th><th>Grup</th><th></th></tr></thead>
            <tbody>
              <tr v-for="b in balancesForGroup(g.id)" :key="b.id" :style="g.warna ? `background:${g.warna}` : ''">
                <td><input type="text" :value="b.pic" class="cell-edit" style="width:90px;" @change="patchBalance(b, 'pic', ($event.target as HTMLInputElement).value)" /></td>
                <td><input type="text" :value="b.rek" class="cell-edit" style="width:170px;" @change="patchBalance(b, 'rek', ($event.target as HTMLInputElement).value)" /></td>
                <td class="num"><input type="text" :value="b.saldo.toLocaleString('id-ID')" style="width:130px;text-align:right;" @change="patchBalance(b, 'saldo', numFromInput($event))" /></td>
                <td class="num"><input type="text" :value="(b.bisaDipakai ?? 0).toLocaleString('id-ID')" style="width:130px;text-align:right;" @change="patchBalance(b, 'bisaDipakai', numFromInput($event))" /></td>
                <td><input type="text" :value="b.ket" class="cell-edit" style="width:140px;" @change="patchBalance(b, 'ket', ($event.target as HTMLInputElement).value)" /></td>
                <td>
                  <select :value="b.grup" style="width:100px;" @change="patchBalance(b, 'grup', ($event.target as HTMLSelectElement).value || null)">
                    <option :value="null">Tanpa Grup</option>
                    <option v-for="gr in groups" :key="gr.id" :value="gr.id">{{ gr.nama }}</option>
                  </select>
                </td>
                <td><span class="row-del" @click="deleteBalance(b.id)">✕</span></td>
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

      <div v-if="noGroupBalances.length">
        <div style="font-weight:700;margin-bottom:6px;border-left:4px solid #ccc;padding-left:8px;">Tanpa Grup</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>PIC</th><th>Rekening</th><th class="num">Saldo</th><th class="num">Bisa Dipakai</th><th>Ket</th><th>Grup</th><th></th></tr></thead>
            <tbody>
              <tr v-for="b in noGroupBalances" :key="b.id">
                <td><input type="text" :value="b.pic" class="cell-edit" style="width:90px;" @change="patchBalance(b, 'pic', ($event.target as HTMLInputElement).value)" /></td>
                <td><input type="text" :value="b.rek" class="cell-edit" style="width:170px;" @change="patchBalance(b, 'rek', ($event.target as HTMLInputElement).value)" /></td>
                <td class="num"><input type="text" :value="b.saldo.toLocaleString('id-ID')" style="width:130px;text-align:right;" @change="patchBalance(b, 'saldo', numFromInput($event))" /></td>
                <td class="num"><input type="text" :value="(b.bisaDipakai ?? 0).toLocaleString('id-ID')" style="width:130px;text-align:right;" @change="patchBalance(b, 'bisaDipakai', numFromInput($event))" /></td>
                <td><input type="text" :value="b.ket" class="cell-edit" style="width:140px;" @change="patchBalance(b, 'ket', ($event.target as HTMLInputElement).value)" /></td>
                <td>
                  <select :value="b.grup" style="width:100px;" @change="patchBalance(b, 'grup', ($event.target as HTMLSelectElement).value || null)">
                    <option :value="null">Tanpa Grup</option>
                    <option v-for="gr in groups" :key="gr.id" :value="gr.id">{{ gr.nama }}</option>
                  </select>
                </td>
                <td><span class="row-del" @click="deleteBalance(b.id)">✕</span></td>
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
        <table>
          <tbody>
            <tr class="grand-total-row">
              <td style="width:280px;">TOTAL BANK</td>
              <td class="num">Rp {{ grandTotal.saldo.toLocaleString('id-ID') }}</td>
              <td class="num">Rp {{ grandTotal.bisaDipakai.toLocaleString('id-ID') }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="!balances.length" class="empty-state">
        Belum ada rekening bank. Tambahkan lewat form di atas.
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3>🏦 Deposito</h3>
        <button class="btn" @click="addRow('deposito')">+ Tambah</button>
      </div>
      <div class="hint" style="margin-bottom:10px;">Total deposito: <b>Rp {{ totalDeposito.toLocaleString('id-ID') }}</b></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nama</th><th class="num">Nominal</th><th>Tgl Masuk</th><th>Rate</th><th>Jatuh Tempo</th><th>Keterangan</th><th></th></tr></thead>
          <tbody>
            <tr v-if="!deposito.length"><td colspan="7" class="empty-state">Belum ada data deposito.</td></tr>
            <tr v-for="d in deposito" :key="d.id">
              <td><input type="text" :value="d.nama" class="cell-edit" style="width:120px;" @change="patchRow('deposito', d, 'nama', ($event.target as HTMLInputElement).value)" /></td>
              <td class="num"><input type="text" :value="d.nominal.toLocaleString('id-ID')" style="width:120px;text-align:right;" @change="patchRow('deposito', d, 'nominal', Number(($event.target as HTMLInputElement).value.replace(/[^\d.-]/g,'')) || 0)" /></td>
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
        <table>
          <thead><tr><th>Peminjam</th><th>Kreditur</th><th class="num">Nominal</th><th>Rate</th><th>Tgl Pinjam</th><th>Jatuh Tempo</th><th>Keterangan</th><th></th></tr></thead>
          <tbody>
            <tr v-if="!hutang.length"><td colspan="8" class="empty-state">Belum ada data hutang.</td></tr>
            <tr v-for="h in hutang" :key="h.id">
              <td><input type="text" :value="h.peminjam" class="cell-edit" style="width:110px;" @change="patchRow('hutang', h, 'peminjam', ($event.target as HTMLInputElement).value)" /></td>
              <td><input type="text" :value="h.kreditur" class="cell-edit" style="width:110px;" @change="patchRow('hutang', h, 'kreditur', ($event.target as HTMLInputElement).value)" /></td>
              <td class="num"><input type="text" :value="h.nominal.toLocaleString('id-ID')" style="width:120px;text-align:right;" @change="patchRow('hutang', h, 'nominal', Number(($event.target as HTMLInputElement).value.replace(/[^\d.-]/g,'')) || 0)" /></td>
              <td><input type="text" :value="h.rate" class="cell-edit" style="width:70px;" @change="patchRow('hutang', h, 'rate', ($event.target as HTMLInputElement).value)" /></td>
              <td><input type="date" :value="h.tglPinjam" style="width:130px;" @change="patchRow('hutang', h, 'tglPinjam', ($event.target as HTMLInputElement).value || null)" /></td>
              <td>
                <input type="date" :value="h.jatuhTempo" style="width:130px;" @change="patchRow('hutang', h, 'jatuhTempo', ($event.target as HTMLInputElement).value || null)" />
                <span v-if="h.jatuhTempo && h.jatuhTempo < today" class="pill overdue">Lewat tempo</span>
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
        <table>
          <thead><tr><th>PT</th><th class="num">Nominal</th><th>Tgl Bayar</th><th>Tgl Pesan</th><th>No Ctr</th><th>Pay IAM</th><th>Pay Ekspds</th><th>Keterangan</th><th></th></tr></thead>
          <tbody>
            <tr v-if="!bayar.length"><td colspan="9" class="empty-state">Belum ada data bayar.</td></tr>
            <tr v-for="b in bayar" :key="b.id">
              <td><input type="text" :value="b.pt" class="cell-edit" style="width:90px;" @change="patchRow('bayar', b, 'pt', ($event.target as HTMLInputElement).value)" /></td>
              <td class="num"><input type="text" :value="b.nominal.toLocaleString('id-ID')" style="width:120px;text-align:right;" @change="patchRow('bayar', b, 'nominal', Number(($event.target as HTMLInputElement).value.replace(/[^\d.-]/g,'')) || 0)" /></td>
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
</template>
