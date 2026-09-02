<script setup lang="ts">
import { hitungBisaDipakai, parseNum, formatDateShort, parseDateShort, autoGrow, lightenColor, darkenColor } from '~/utils/format'

type Group = { id: string; nama: string; warna: string | null }
type Pic = { id: string; nama: string }
type Balance = { id: string; pic: string | null; rek: string; saldo: number; bisaDipakai: number | null; ket: string | null; grup: string | null; locked: boolean }
type Deposito = { id: string; nama: string | null; nominal: number; tglMasuk: string | null; rate: string | null; jatuhTempo: string | null; ket: string | null; groupId: string | null }
type Hutang = { id: string; peminjam: string | null; kreditur: string | null; nominal: number; rate: string | null; tglPinjam: string | null; jatuhTempo: string | null; ket: string | null; groupId: string | null }
type Bayar = { id: string; pt: string | null; groupId: string | null; nominal: number; tglBayar: string | null; tglPesan: string | null; noCtr: string | null; payIam: string | null; payEkspds: string | null; ket: string | null }

const props = defineProps<{
  groupId: string | null
  groupNama: string
  groupWarna: string | null
  balances: Balance[]
  deposito: Deposito[]
  hutang: Hutang[]
  bayar: Bayar[]
  pics: Pic[]
  groups: Group[]
  depositoColors: ReturnType<typeof useRowColors>
  hutangColors: ReturnType<typeof useRowColors>
  bayarColors: ReturnType<typeof useRowColors>
}>()
const emit = defineEmits<{ reload: [] }>()

const api = useApi()
const today = new Date().toISOString().slice(0, 10)

function rowStyle(colors: ReturnType<typeof useRowColors>, id: string) {
  const manual = colors.colorOf(id)
  if (manual) return `background:${manual}`
  return props.groupWarna ? `background:${lightenColor(props.groupWarna)}` : ''
}

// -- Saldo RK --
async function toggleRowLock(b: Balance) {
  await patchBalance(b, 'locked', !b.locked)
}
async function patchBalance(b: Balance, field: string, value: any) {
  try {
    await api(`/api/rekap/balances/${b.id}`, { method: 'PATCH', body: { [field]: value } })
    ;(b as any)[field] = value
    if (field === 'saldo') b.bisaDipakai = hitungBisaDipakai(value)
  } catch (e: any) {
    alert(e?.data?.statusMessage || 'Gagal update.')
    emit('reload')
  }
}
async function addBalance() {
  try {
    await api('/api/rekap/balances', { method: 'POST', body: { pic: null, rek: '', saldo: 0, bisaDipakai: 0, ket: '', grup: props.groupId } })
    emit('reload')
  } catch (e: any) {
    alert(e?.data?.statusMessage || 'Gagal nambah rekening.')
  }
}
async function deleteBalance(id: string) {
  if (!confirm('Hapus baris rekening ini?')) return
  await api(`/api/rekap/balances/${id}`, { method: 'DELETE' })
  emit('reload')
}
function subtotalBalances(rows: Balance[]) {
  return {
    saldo: rows.reduce((s, r) => s + (r.saldo || 0), 0),
    bisaDipakai: rows.reduce((s, r) => s + (r.bisaDipakai || 0), 0)
  }
}

// -- Deposito / Hutang / Bayar (pola sama, generik) --
async function addRow(kind: 'deposito' | 'hutang' | 'bayar') {
  await api(`/api/rekap/${kind}`, { method: 'POST', body: { groupId: props.groupId } })
  emit('reload')
}
async function deleteRow(kind: 'deposito' | 'hutang' | 'bayar', id: string) {
  if (!confirm('Hapus baris ini?')) return
  await api(`/api/rekap/${kind}/${id}`, { method: 'DELETE' })
  emit('reload')
}
async function patchRow(kind: 'deposito' | 'hutang' | 'bayar', row: any, field: string, value: any) {
  try {
    await api(`/api/rekap/${kind}/${row.id}`, { method: 'PATCH', body: { [field]: value } })
    row[field] = value
  } catch (e: any) {
    alert(e?.data?.statusMessage || 'Gagal update.')
    emit('reload')
  }
}
function patchDateShort(kind: 'hutang' | 'bayar', row: any, field: string, rawText: string) {
  const trimmed = rawText.trim()
  if (!trimmed) { patchRow(kind, row, field, null); return }
  const iso = parseDateShort(trimmed)
  if (!iso) { alert('Format tanggal salah. Pakai dd/mm/yy, misal 25/09/26.'); return }
  patchRow(kind, row, field, iso)
}
function sumNominal(rows: { nominal: number }[]) {
  return rows.reduce((s, r) => s + (r.nominal || 0), 0)
}
</script>

<template>
  <div class="panel">
    <div class="group-head">
      <span class="group-dot" :style="{ background: groupWarna || '#999' }" />
      {{ groupNama }}
    </div>

    <!-- Saldo RK -->
    <div class="rekap-subhead"><span class="card-icon card-icon-bank">💳</span> Saldo RK</div>
    <div class="table-wrap">
      <table class="dense bank-dense" :data-sheet="`${groupNama} - Saldo RK`">
        <colgroup>
          <col style="width:45px"><col style="width:88px"><col style="width:82px"><col style="width:82px"><col style="width:69px"><col style="width:56px">
        </colgroup>
        <thead><tr><th>PIC</th><th>Rekening</th><th class="num">Saldo</th><th class="num">Bisa Dipakai</th><th>Ket</th><th></th></tr></thead>
        <tbody>
          <tr v-if="!balances.length"><td colspan="6" class="empty-state">Belum ada rekening.</td></tr>
          <tr v-for="b in balances" :key="b.id" :style="{ background: groupWarna ? lightenColor(groupWarna) : '' }">
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
          <tr v-if="balances.length" class="subtotal-row" :style="{ background: darkenColor(groupWarna) || '#F1F1F1', color: groupWarna ? '#fff' : 'inherit' }">
            <td colspan="2">TOTAL</td>
            <td class="num">{{ subtotalBalances(balances).saldo.toLocaleString('id-ID') }}</td>
            <td class="num">{{ subtotalBalances(balances).bisaDipakai.toLocaleString('id-ID') }}</td>
            <td colspan="2"></td>
          </tr>
        </tbody>
      </table>
    </div>
    <button class="btn secondary no-export" style="margin:6px 0 12px;padding:3px 9px;font-size:11px;" @click="addBalance">+ Rekening</button>

    <!-- Deposito -->
    <template v-if="deposito.length">
    <div class="rekap-subhead"><span class="card-icon card-icon-deposito">🏦</span> Deposito</div>
    <div class="table-wrap">
      <table class="dense deposito-dense" :data-sheet="`${groupNama} - Deposito`">
        <colgroup>
          <col style="width:90px"><col style="width:75px"><col style="width:35px"><col style="width:68px"><col style="width:68px"><col style="width:85px"><col style="width:28px">
        </colgroup>
        <thead><tr><th>Nama</th><th class="num">Nominal</th><th>Rate</th><th>Tgl Masuk</th><th>Jatuh Tempo</th><th>Keterangan</th><th></th></tr></thead>
        <tbody>
          <tr
            v-for="d in deposito" :key="d.id"
            :style="rowStyle(depositoColors, d.id)"
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
            <td class="num"><input type="text" :value="d.nominal.toLocaleString('id-ID')" style="width:110px;text-align:right;" @change="patchRow('deposito', d, 'nominal', parseNum(($event.target as HTMLInputElement).value))" /></td>
            <td><input type="text" :value="d.rate" class="cell-edit" style="width:60px;" @change="patchRow('deposito', d, 'rate', ($event.target as HTMLInputElement).value)" /></td>
            <td><input type="date" :value="d.tglMasuk" style="width:120px;" @change="patchRow('deposito', d, 'tglMasuk', ($event.target as HTMLInputElement).value || null)" /></td>
            <td><input type="date" :value="d.jatuhTempo" style="width:120px;" @change="patchRow('deposito', d, 'jatuhTempo', ($event.target as HTMLInputElement).value || null)" /></td>
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
            <td class="num">{{ sumNominal(deposito).toLocaleString('id-ID') }}</td>
            <td colspan="5"></td>
          </tr>
        </tbody>
      </table>
    </div>
    </template>
    <button class="btn secondary no-export" style="margin:6px 0 12px;padding:3px 9px;font-size:11px;" @click="addRow('deposito')">+ Deposito</button>

    <!-- Hutang -->
    <template v-if="hutang.length">
    <div class="rekap-subhead"><span class="card-icon card-icon-hutang">💸</span> Hutang</div>
    <div class="table-wrap">
      <table class="dense" :data-sheet="`${groupNama} - Hutang`">
        <colgroup>
          <col style="width:150px"><col style="width:90px"><col style="width:100px"><col style="width:50px"><col style="width:85px"><col style="width:95px"><col style="width:160px"><col style="width:30px">
        </colgroup>
        <thead><tr><th>Kreditur</th><th>Grup</th><th class="num">Nominal</th><th>Rate</th><th>Tgl Pinjam</th><th>Jatuh Tempo</th><th>Keterangan</th><th></th></tr></thead>
        <tbody>
          <tr
            v-for="h in hutang" :key="h.id"
            :style="rowStyle(hutangColors, h.id)"
            @contextmenu="hutangColors.open($event, h.id)"
            title="Klik kanan buat warnain baris"
          >
            <td>
              <textarea
                :ref="(el) => autoGrow(el)" class="cell-edit wrap-textarea" rows="1"
                :value="h.kreditur" @input="autoGrow($event.target)"
                @change="patchRow('hutang', h, 'kreditur', ($event.target as HTMLTextAreaElement).value)"
              ></textarea>
            </td>
            <td>
              <select :value="h.groupId" @change="patchRow('hutang', h, 'groupId', ($event.target as HTMLSelectElement).value || null)">
                <option value="">Tanpa Grup</option>
                <option v-for="gr in groups" :key="gr.id" :value="gr.id">{{ gr.nama }}</option>
              </select>
            </td>
            <td class="num"><input type="text" :value="h.nominal.toLocaleString('id-ID')" style="width:120px;text-align:right;" @change="patchRow('hutang', h, 'nominal', parseNum(($event.target as HTMLInputElement).value))" /></td>
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
            <td class="num">{{ sumNominal(hutang).toLocaleString('id-ID') }}</td>
            <td colspan="5"></td>
          </tr>
        </tbody>
      </table>
    </div>
    </template>
    <button class="btn secondary no-export" style="margin:6px 0 12px;padding:3px 9px;font-size:11px;" @click="addRow('hutang')">+ Hutang</button>

    <!-- Bayar -->
    <template v-if="bayar.length">
    <div class="rekap-subhead"><span class="card-icon card-icon-bayar">🧾</span> Bayar</div>
    <div class="table-wrap">
      <table class="dense bayar-dense" :data-sheet="`${groupNama} - Bayar`">
        <colgroup>
          <col style="width:70px"><col style="width:50px"><col style="width:50px"><col style="width:50px"><col style="width:42px"><col style="width:42px"><col style="width:75px"><col style="width:20px">
        </colgroup>
        <thead><tr><th class="num">Nominal</th><th>Tgl Bayar</th><th>Tgl Pesan</th><th>No Ctr</th><th>Pay IAM</th><th>Pay Ekspds</th><th>Keterangan</th><th></th></tr></thead>
        <tbody>
          <tr
            v-for="b in bayar" :key="b.id"
            :style="rowStyle(bayarColors, b.id)"
            @contextmenu="bayarColors.open($event, b.id)"
            title="Klik kanan buat warnain baris"
          >
            <td class="num"><input type="text" :value="b.nominal.toLocaleString('id-ID')" style="width:120px;text-align:right;" @change="patchRow('bayar', b, 'nominal', parseNum(($event.target as HTMLInputElement).value))" /></td>
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
          <tr v-if="bayar.length" class="subtotal-row">
            <td class="num">TOTAL {{ sumNominal(bayar).toLocaleString('id-ID') }}</td>
            <td colspan="7"></td>
          </tr>
        </tbody>
      </table>
    </div>
    </template>
    <button class="btn secondary no-export" style="margin:6px 0 0;padding:3px 9px;font-size:11px;" @click="addRow('bayar')">+ Bayar</button>
  </div>
</template>

<style scoped>
.rekap-subhead {
  font-size: 13px;
  font-weight: 800;
  color: var(--text);
  margin: 10px 0 4px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

table.dense thead th,
table.dense tbody td {
  padding: 2px 6px;
}
table.dense thead th {
  white-space: normal;
  line-height: 1.2;
}
.group-head {
  justify-content: center;
}
table.dense input,
table.dense select {
  width: 100% !important;
  min-width: 0;
  box-sizing: border-box;
  padding: 1px 4px;
  height: 22px;
  line-height: 1.2;
  font-size: 11.5px;
}
table.dense textarea.wrap-textarea {
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
table.dense .subtotal-row td.num {
  white-space: normal;
  word-break: break-word;
  line-height: 1.3;
}
table.dense.bank-dense thead th,
table.dense.bank-dense tbody td {
  padding: 1px 5px;
}
table.dense.bank-dense input,
table.dense.bank-dense select {
  height: 18px;
  padding: 0 3px;
}
/* Saldo RK, Deposito & Bayar udah gak punya kolom Grup lagi (redundan — baris udah
   pasti satu grup sesuai card-nya), kolomnya sengaja dibikin muat tanpa perlu scroll
   horizontal — override min-width:900px global punya table.dense. */
table.dense.bank-dense,
table.dense.deposito-dense,
table.dense.bayar-dense {
  min-width: 0;
  table-layout: fixed;
  width: 100%;
}
.card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  margin-right: 6px;
  font-size: 12px;
  vertical-align: middle;
}
.card-icon-bank { background: var(--accent-light); }
.card-icon-deposito { background: var(--green-bg); }
.card-icon-hutang { background: var(--red-bg); }
.card-icon-bayar { background: #F3E8FD; }
table.dense.bank-dense tbody input,
table.dense.bank-dense tbody select {
  background: transparent !important;
}
table.dense.bank-dense tbody .saldo-locked-input:disabled {
  background: var(--red-bg) !important;
  color: var(--red) !important;
}
table.dense.bayar-dense tbody input,
table.dense.bayar-dense tbody select,
table.dense.bayar-dense tbody textarea {
  background: transparent !important;
}
table.dense tbody td {
  vertical-align: middle;
}
table.dense.bank-dense tbody td {
  vertical-align: top;
}
</style>
