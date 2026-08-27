<script setup lang="ts">
import { parseTagList } from '~/utils/format'

const api = useApi()
const { pics, load: loadPics } = usePics()
type Account = { id: string; groupId: string | null; picId: string | null; bankType: string; namaRek: string; noRek: string; saldoAwal: number | null }
type Txn = {
  id: string; accountId: string; tanggal: string; transaksi: string; cabang: string | null;
  debet: number; kredit: number; saldo: number; bankType: string | null;
  noBankManual: string | null; ketTransaksiManual: string | null; tag: string | null;
  noteManual: string | null; checked: boolean; manual: boolean
}
type Tag = { id: string; nama: string }
type RowColor = { id: string; entityKind: string; entityId: string; color: string }

const accounts = ref<Account[]>([])
const txns = ref<Txn[]>([])
const tags = ref<Tag[]>([])
const rowColors = ref<RowColor[]>([])

const today = new Date()
const filterMonth = ref(today.getMonth() + 1)
const filterYear = ref(today.getFullYear())
const filterPic = ref('') // '' = semua PIC
const filterBank = ref('') // '' = semua bank

async function loadAll() {
  ;[accounts.value, txns.value, tags.value, rowColors.value] = await Promise.all([
    api('/api/master/accounts'),
    api('/api/bank-txns'),
    api('/api/master/tags'),
    api('/api/row-colors')
  ])
}
await Promise.all([loadAll(), loadPics()])
try {
  const me = await api<{ picId: string | null }>('/api/auth/me')
  if (me.picId) filterPic.value = me.picId
} catch {}

const visibleAccounts = computed(() =>
  accounts.value.filter(a =>
    (!filterPic.value || a.picId === filterPic.value) &&
    (!filterBank.value || a.bankType === filterBank.value)
  )
)

function txnsForAccount(accId: string) {
  const mm = String(filterMonth.value).padStart(2, '0')
  const prefix = `${filterYear.value}-${mm}-`
  return txns.value
    .filter(t => t.accountId === accId && t.tanggal?.startsWith(prefix))
    .sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0))
}

function rowColor(id: string) {
  return rowColors.value.find(c => c.entityKind === 'rbtxn' && c.entityId === id)?.color || ''
}

// -- add manual form state (per account) --
const addForm = reactive<Record<string, { tanggal: string; transaksi: string; cabang: string; debet: string; kredit: string }>>({})
function formFor(accId: string) {
  if (!addForm[accId]) addForm[accId] = { tanggal: '', transaksi: '', cabang: '', debet: '', kredit: '' }
  return addForm[accId]
}
async function addTxn(accId: string) {
  const f = formFor(accId)
  if (!f.tanggal) { alert('Isi tanggal transaksi dulu.'); return }
  try {
    await api('/api/bank-txns', {
      method: 'POST',
      body: { accountId: accId, tanggal: f.tanggal, transaksi: f.transaksi, cabang: f.cabang, debet: Number(f.debet) || 0, kredit: Number(f.kredit) || 0 }
    })
    addForm[accId] = { tanggal: '', transaksi: '', cabang: '', debet: '', kredit: '' }
    await loadAll()
  } catch (e: any) {
    alert(e?.data?.statusMessage || 'Gagal nambah transaksi.')
  }
}

async function deleteTxn(id: string) {
  if (!confirm('Hapus transaksi ini?')) return
  try {
    await api(`/api/bank-txns/${id}`, { method: 'DELETE' })
    await loadAll()
  } catch (e: any) {
    alert(e?.data?.statusMessage || 'Gagal hapus transaksi.')
  }
}

async function patchTxn(t: Txn, field: string, value: any) {
  try {
    await api(`/api/bank-txns/${t.id}`, { method: 'PATCH', body: { [field]: value } })
    ;(t as any)[field] = value
  } catch (e: any) {
    alert(e?.data?.statusMessage || 'Gagal update.')
    await loadAll()
  }
}

async function duplicateTxn(id: string) {
  try {
    await api(`/api/bank-txns/${id}/duplicate`, { method: 'POST' })
    await loadAll()
  } catch (e: any) {
    alert(e?.data?.statusMessage || 'Gagal duplicate.')
  }
  closeColorMenu()
}

/** Posisi popup di-clamp biar gak kepotong tepi bawah/kanan viewport — dia position:fixed,
 * jadi kalau kepotong, scroll halaman gak nolongin nampilin sisanya. */
function clampMenuPos(evt: MouseEvent, menuWidth: number, menuHeight: number) {
  const x = Math.min(evt.clientX, window.innerWidth - menuWidth - 8)
  const y = Math.min(evt.clientY, window.innerHeight - menuHeight - 8)
  return { x: Math.max(8, x), y: Math.max(8, y) }
}

// -- right click color menu --
const colorMenu = reactive({ visible: false, x: 0, y: 0, targetId: '' as string })
const COLORS = ['#FFF3B0', '#B7F0AD', '#AEE3F5', '#F5B7B1', '#D7BDE2', '']
function openColorMenu(evt: MouseEvent, id: string) {
  evt.preventDefault()
  const pos = clampMenuPos(evt, 180, 130)
  colorMenu.visible = true
  colorMenu.x = pos.x
  colorMenu.y = pos.y
  colorMenu.targetId = id
}
function closeColorMenu() { colorMenu.visible = false }
async function pickColor(color: string) {
  if (!color) {
    await api(`/api/row-colors?entityKind=rbtxn&entityId=${colorMenu.targetId}`, { method: 'DELETE' })
  } else {
    await api('/api/row-colors', { method: 'PUT', body: { entityKind: 'rbtxn', entityId: colorMenu.targetId, color } })
  }
  await loadAll()
  closeColorMenu()
}

// -- klik buat pilih tag, bisa lebih dari satu (disimpen comma-separated) --
const tagMenu = reactive({ visible: false, x: 0, y: 0, targetId: '' as string })
function openTagMenu(evt: MouseEvent, id: string) {
  evt.preventDefault()
  evt.stopPropagation()
  closeColorMenu()
  const pos = clampMenuPos(evt, 170, Math.min(260, 40 + tags.value.length * 27))
  tagMenu.visible = true
  tagMenu.x = pos.x
  tagMenu.y = pos.y
  tagMenu.targetId = id
}
function closeTagMenu() { tagMenu.visible = false }
function closeMenus() { closeColorMenu(); closeTagMenu() }
const tagMenuSelected = computed(() => parseTagList(txns.value.find(x => x.id === tagMenu.targetId)?.tag))
async function toggleTag(tagName: string) {
  const t = txns.value.find(x => x.id === tagMenu.targetId)
  if (!t) return
  const list = parseTagList(t.tag)
  const i = list.indexOf(tagName)
  if (i >= 0) list.splice(i, 1)
  else list.push(tagName)
  await patchTxn(t, 'tag', list.join(','))
}

const expandedRows = reactive<Set<string>>(new Set())
function toggleExpand(id: string) {
  expandedRows.has(id) ? expandedRows.delete(id) : expandedRows.add(id)
}

const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

// -- import CSV mutasi bank --
// Parsing & dedup dikerjakan di server (server/api/bank-txns/import-csv.post.ts),
// halaman ini cuma mengirim isi file mentahnya.
const { exportTables } = useXlsx()
const importing = ref(false)
const importStatus = ref<{ type: 'ok' | 'err'; msg: string } | null>(null)

async function onCsvUpload(evt: Event) {
  const input = evt.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  importing.value = true
  importStatus.value = null
  try {
    const csv = await file.text()
    const res = await api<{
      format: string; rekening: string; imported: number; duplikat: number
      terkunci: number; rekeningTidakTerdaftar: number; tanggalTerbaru: string | null
    }>('/api/bank-txns/import-csv', { method: 'POST', body: { csv } })

    await loadAll()

    // Lompat ke bulan data terbaru supaya hasil import langsung kelihatan.
    if (res.tanggalTerbaru) {
      filterYear.value = +res.tanggalTerbaru.slice(0, 4)
      filterMonth.value = +res.tanggalTerbaru.slice(5, 7)
    }

    let msg = `${res.format.toUpperCase()} · ${res.rekening}: ${res.imported} transaksi baru, ${res.duplikat} duplikat dilewati`
    if (res.terkunci) msg += `, ${res.terkunci} dilewati karena periode terkunci`
    if (res.rekeningTidakTerdaftar) msg += `, ${res.rekeningTidakTerdaftar} baris rekeningnya belum terdaftar`
    importStatus.value = { type: res.imported ? 'ok' : 'err', msg: msg + '.' }
  } catch (e: any) {
    importStatus.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal import CSV.' }
  } finally {
    importing.value = false
  }
}

const root = ref<HTMLElement | null>(null)
async function onExport() {
  const tables = Array.from(root.value?.querySelectorAll<HTMLTableElement>('table[data-sheet]') || [])
  if (!tables.length) return
  await exportTables(tables.map(t => ({ table: t, sheetName: t.dataset.sheet || 'Sheet' })), 'Rincian_Bank')
}
</script>

<template>
  <div ref="root" @click="closeMenus">
    <div class="topbar">
      <div>
        <h2>Rincian Bank</h2>
        <p>Detail mutasi transaksi per rekening bank, lengkap dengan Tag, No Bank, Ket Transaksi, dan Catatan.</p>
      </div>
      <button class="btn secondary no-export" @click="onExport">📥 Export Excel</button>
    </div>

    <div class="panel no-export">
      <div class="upload-box">
        <span class="gm-label">Import mutasi bank:</span>
        <label class="btn" style="cursor:pointer;">
          {{ importing ? '⏳ Memproses…' : '📤 Upload CSV (BCA / BRI / BNI)' }}
          <input type="file" accept=".csv,text/csv" style="display:none;" :disabled="importing" @change="onCsvUpload" />
        </label>
      </div>
      <p class="hint">
        Format BCA, BRI, maupun BNI dideteksi otomatis dari isi file. Transaksi duplikat dan baris di periode terkunci dilewati,
        lalu kolom Saldo dihitung ulang dari Saldo Awal rekening. Khusus file BNI (gak nyimpen nomor rekening di file-nya),
        pastikan cuma satu rekening bertipe BNI yang terdaftar di Master Data.
      </p>
      <StatusBox :status="importStatus" />
    </div>

    <div class="toolbar">
      <span class="gm-label">Tampilkan:</span>
      <select v-model.number="filterMonth">
        <option v-for="(m, i) in months" :key="m" :value="i + 1">{{ m }}</option>
      </select>
      <select v-model.number="filterYear">
        <option v-for="y in [today.getFullYear()-2, today.getFullYear()-1, today.getFullYear(), today.getFullYear()+1]" :key="y" :value="y">{{ y }}</option>
      </select>
      <span class="gm-label" style="margin-left:10px;">PIC:</span>
      <select v-model="filterPic">
        <option value="">Semua PIC</option>
        <option v-for="p in pics" :key="p.id" :value="p.id">{{ p.nama }}</option>
      </select>
      <span class="gm-label" style="margin-left:10px;">Bank:</span>
      <select v-model="filterBank">
        <option value="">Semua Bank</option>
        <option value="BCA">BCA</option><option value="BRI">BRI</option><option value="BNI">BNI</option>
        <option value="MANDIRI">Mandiri</option><option value="OTHER">Lainnya</option>
      </select>
    </div>

    <div v-if="!accounts.length" class="empty-state">Belum ada rekening bank. Tambahkan dulu lewat menu "Master Data".</div>
    <div v-else-if="!visibleAccounts.length" class="empty-state">Gak ada rekening yang cocok sama filter ini.</div>

    <div v-for="acc in visibleAccounts" :key="acc.id" class="panel">
      <div class="panel-head">
        <h3><span class="pill">{{ acc.bankType }}</span> {{ acc.namaRek }} <span style="color:var(--muted);font-weight:400;">({{ acc.noRek }})</span></h3>
      </div>

      <div class="toolbar">
        <span class="gm-label">+ Tambah manual:</span>
        <input type="date" v-model="formFor(acc.id).tanggal" />
        <input type="text" v-model="formFor(acc.id).transaksi" placeholder="Transaksi..." style="width:200px;" />
        <input type="text" v-model="formFor(acc.id).cabang" placeholder="Cabang" style="width:80px;" />
        <input type="number" v-model="formFor(acc.id).debet" placeholder="Debet" style="width:100px;" />
        <input type="number" v-model="formFor(acc.id).kredit" placeholder="Kredit" style="width:100px;" />
        <button class="btn" @click="addTxn(acc.id)">+ Tambah</button>
      </div>

      <div class="table-wrap">
        <table :data-sheet="acc.namaRek">
          <thead>
            <tr>
              <th class="no-export"></th><th>Nomor</th><th>Transaksi</th><th>Tanggal</th><th>Cabang</th>
              <th class="num">Debet</th><th class="num">Kredit</th><th class="num">Saldo</th>
              <th>Tag</th><th>No Bank</th><th>Ket Transaksi</th><th>Catatan</th><th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!txnsForAccount(acc.id).length"><td colspan="13" class="empty-state">Belum ada transaksi di periode ini.</td></tr>
            <tr
              v-for="(t, i) in txnsForAccount(acc.id)"
              :key="t.id"
              :style="rowColor(t.id) ? `background:${rowColor(t.id)}` : ''"
              @contextmenu="openColorMenu($event, t.id)"
              title="Klik kanan buat warnain / duplicate baris"
            >
              <td><input type="checkbox" :checked="t.checked" @change="patchTxn(t, 'checked', ($event.target as HTMLInputElement).checked)" /></td>
              <td>{{ i + 1 }}</td>
              <td
                :style="expandedRows.has(t.id) ? 'white-space:normal;max-width:280px;' : 'max-width:220px;overflow:hidden;text-overflow:ellipsis;cursor:pointer;'"
                @click="toggleExpand(t.id)"
                title="Klik buat lihat lengkap"
              >{{ t.transaksi }}</td>
              <td>{{ t.tanggal }}</td>
              <td>
                <input type="text" :value="t.cabang" class="cell-edit" style="width:60px;" @change="patchTxn(t, 'cabang', ($event.target as HTMLInputElement).value)" />
              </td>
              <td class="num">{{ t.debet ? t.debet.toLocaleString('id-ID') : '' }}</td>
              <td class="num">{{ t.kredit ? t.kredit.toLocaleString('id-ID') : '' }}</td>
              <td class="num">{{ t.saldo.toLocaleString('id-ID') }}</td>
              <td>
                <span class="tag-cell" style="width:90px;" @click="openTagMenu($event, t.id)" title="Klik buat pilih tag (bisa lebih dari satu)">
                  {{ t.tag ? t.tag.split(',').join(', ') : '-' }}
                </span>
              </td>
              <td><input type="text" :value="t.noBankManual" class="cell-edit" style="width:110px;" @change="patchTxn(t, 'noBankManual', ($event.target as HTMLInputElement).value)" /></td>
              <td><input type="text" :value="t.ketTransaksiManual" class="cell-edit" style="width:140px;" @change="patchTxn(t, 'ketTransaksiManual', ($event.target as HTMLInputElement).value)" /></td>
              <td><input type="text" :value="t.noteManual" class="cell-edit" style="width:140px;" @change="patchTxn(t, 'noteManual', ($event.target as HTMLInputElement).value)" /></td>
              <td class="no-export"><span class="row-del" @click="deleteTxn(t.id)">✕</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div
      v-if="colorMenu.visible"
      class="panel"
      style="position:fixed;z-index:50;padding:8px;width:180px;box-shadow:0 8px 24px rgba(0,0,0,.18);"
      :style="{ top: colorMenu.y + 'px', left: colorMenu.x + 'px' }"
      @click.stop
    >
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
        <span
          v-for="c in COLORS.filter(Boolean)"
          :key="c"
          style="width:22px;height:22px;border-radius:5px;cursor:pointer;border:1px solid var(--border);"
          :style="{ background: c }"
          @click="pickColor(c)"
        />
        <span
          style="width:22px;height:22px;border-radius:5px;cursor:pointer;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;"
          title="Hapus warna"
          @click="pickColor('')"
        >✕</span>
      </div>
      <button class="btn secondary" style="width:100%;font-size:12px;" @click="duplicateTxn(colorMenu.targetId)">🔁 Duplicate baris</button>
    </div>

    <div
      v-if="tagMenu.visible"
      class="panel tag-picker-menu"
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
