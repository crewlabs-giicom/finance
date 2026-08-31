<script setup lang="ts">
import { daysInMonth, fmtNum, fmtRp, formatDateShort, parseNum, lightenColor } from '~/utils/format'

const api = useApi()
const { sections, load: loadGroups, myGroupId } = useGroups()
const { isLocked, refresh: refreshLock, label: lockLabel } = usePeriodLock()
const { exportTables } = useXlsx()

type Store = { id: string; groupId: string | null; nama: string; platform: string | null; saldoAwal: number }
type Entry = { id: string; storeId: string; tanggal: string; debet: number; kredit: number }

const stores = ref<Store[]>([])
const entries = ref<Entry[]>([])

const today = new Date()
const filterMonth = ref(today.getMonth() + 1)
const filterYear = ref(today.getFullYear())
const filterGroup = ref<string>('') // '' = semua grup

const status = ref<{ type: 'ok' | 'err'; msg: string } | null>(null)

async function loadAll() {
  ;[stores.value, entries.value] = await Promise.all([
    api<Store[]>('/api/mp/stores'),
    api<Entry[]>('/api/mp/entries')
  ])
}
await Promise.all([loadAll(), loadGroups(), refreshLock()])
filterGroup.value = (await myGroupId()) || filterGroup.value

const monthPrefix = computed(() => `${filterYear.value}-${String(filterMonth.value).padStart(2, '0')}-`)
const monthStart = computed(() => `${monthPrefix.value}01`)
const dayList = computed(() =>
  Array.from({ length: daysInMonth(filterYear.value, filterMonth.value) }, (_, i) =>
    `${monthPrefix.value}${String(i + 1).padStart(2, '0')}`)
)

const visibleSections = computed(() =>
  sections.value
    .filter(s => !filterGroup.value || (s.id || '') === filterGroup.value)
    .map(s => ({ ...s, stores: stores.value.filter(st => (st.groupId || '') === (s.id || '')) }))
    .filter(s => s.stores.length)
)

const entryIndex = computed(() => {
  const map = new Map<string, Entry>()
  for (const e of entries.value) map.set(`${e.storeId}|${e.tanggal}`, e)
  return map
})
function entryOf(storeId: string, tanggal: string) {
  return entryIndex.value.get(`${storeId}|${tanggal}`)
}

/**
 * Saldo berjalan per toko. Baseline = saldoAwal toko + seluruh mutasi SEBELUM
 * tanggal 1 bulan yang difilter, jadi saldo tetap nyambung lintas bulan
 * walaupun tampilan cuma menampilkan satu bulan.
 */
/** entries dikelompokkan per toko sekali, jadi cari mutasi sebelum bulan yang
 *  difilter gak perlu nyisir seluruh histori tiap kali saldoGrid dihitung ulang. */
const entriesByStore = computed(() => {
  const map = new Map<string, Entry[]>()
  for (const e of entries.value) {
    if (!map.has(e.storeId)) map.set(e.storeId, [])
    map.get(e.storeId)!.push(e)
  }
  return map
})

const saldoGrid = computed(() => {
  const result = new Map<string, number>()
  for (const st of stores.value) {
    let cum = st.saldoAwal || 0
    const storeEntries = entriesByStore.value.get(st.id)
    if (storeEntries) {
      for (const e of storeEntries) {
        if (e.tanggal < monthStart.value) cum += (e.debet || 0) - (e.kredit || 0)
      }
    }
    for (const iso of dayList.value) {
      const e = entryOf(st.id, iso)
      cum += (e?.debet || 0) - (e?.kredit || 0)
      result.set(`${st.id}|${iso}`, cum)
    }
  }
  return result
})

async function saveCell(storeId: string, tanggal: string, field: 'debet' | 'kredit', raw: string) {
  const value = parseNum(raw)
  const current = entryOf(storeId, tanggal)
  if ((current?.[field] || 0) === value) return

  try {
    await api('/api/mp/entries', {
      method: 'PUT',
      body: {
        storeId,
        tanggal,
        debet: field === 'debet' ? value : (current?.debet || 0),
        kredit: field === 'kredit' ? value : (current?.kredit || 0)
      }
    })
    await loadAll()
    status.value = null
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal simpan sel.' }
    await loadAll()
  }
}

async function patchStore(st: Store, field: keyof Store, value: unknown) {
  try {
    await api(`/api/mp/stores/${st.id}`, { method: 'PATCH', body: { [field]: value } })
    await loadAll()
  } catch (e: any) {
    status.value = { type: 'err', msg: e?.data?.statusMessage || 'Gagal update toko.' }
    await loadAll()
  }
}

const root = ref<HTMLElement | null>(null)
async function onExport() {
  const tables = Array.from(root.value?.querySelectorAll<HTMLTableElement>('table[data-sheet]') || [])
  if (!tables.length) { status.value = { type: 'err', msg: 'Belum ada tabel untuk diexport.' }; return }
  await exportTables(tables.map(t => ({ table: t, sheetName: t.dataset.sheet || 'Sheet' })), 'Rincian_MP')
}
</script>

<template>
  <div ref="root">
    <div class="topbar">
      <div>
        <h2>Rincian MP</h2>
      </div>
    </div>

    <div class="panel no-export">
      <div class="upload-box">
        <button class="btn secondary" @click="onExport">📥 Export Excel</button>
        <div v-if="lockLabel !== 'Belum ada periode yang dikunci'" class="lock-banner no-export" style="margin:0 0 0 auto;">
          🔒 {{ lockLabel }}
        </div>
      </div>
      <StatusBox :status="status" />
    </div>

    <PeriodFilter v-model:month="filterMonth" v-model:year="filterYear">
      <span class="gm-label" style="margin-left:10px;">Grup:</span>
      <select v-model="filterGroup">
        <option value="">Semua grup</option>
        <option v-for="s in sections" :key="s.id || 'none'" :value="s.id || ''">{{ s.nama }}</option>
      </select>
    </PeriodFilter>

    <div v-if="!visibleSections.length" class="empty-state">
      Belum ada toko di grup ini. Tambahkan lewat menu Master Data.
    </div>

    <div v-for="sec in visibleSections" :key="sec.id || 'none'" class="panel">
      <div class="group-head">
        <span class="group-dot" :style="{ background: sec.warna }" />
        {{ sec.nama }}
      </div>

      <div class="table-wrap">
        <table class="dense" :data-sheet="sec.nama">
          <thead :style="{ '--group-thead-bg': lightenColor(sec.warna) }">
            <tr>
              <th rowspan="2">Tanggal</th>
              <th v-for="st in sec.stores" :key="st.id" colspan="3" style="text-align:center;">
                {{ st.platform ? st.platform + ' · ' : '' }}{{ st.nama }}
              </th>
            </tr>
            <tr>
              <template v-for="st in sec.stores" :key="st.id">
                <th class="num">Debet</th>
                <th class="num">Kredit</th>
                <th class="num">Saldo</th>
              </template>
            </tr>
          </thead>
          <tbody>
            <tr v-for="iso in dayList" :key="iso">
              <td>{{ formatDateShort(iso) }}</td>
              <template v-for="st in sec.stores" :key="st.id">
                <td class="num">
                  <input
                    class="cell-input"
                    :value="fmtNum(entryOf(st.id, iso)?.debet, true)"
                    :disabled="isLocked(iso)"
                    @change="saveCell(st.id, iso, 'debet', ($event.target as HTMLInputElement).value)"
                    @keyup.enter="($event.target as HTMLInputElement).blur()"
                  />
                </td>
                <td class="num">
                  <input
                    class="cell-input"
                    :value="fmtNum(entryOf(st.id, iso)?.kredit, true)"
                    :disabled="isLocked(iso)"
                    @change="saveCell(st.id, iso, 'kredit', ($event.target as HTMLInputElement).value)"
                    @keyup.enter="($event.target as HTMLInputElement).blur()"
                  />
                </td>
                <td class="num">{{ fmtRp(saldoGrid.get(`${st.id}|${iso}`) || 0) }}</td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="toolbar no-export" style="margin-top:8px;">
        <span class="gm-label">Saldo awal toko:</span>
        <template v-for="st in sec.stores" :key="st.id">
          <span class="gm-label">{{ st.nama }}</span>
          <input
            style="width:130px;text-align:right;"
            :value="st.saldoAwal"
            @change="patchStore(st, 'saldoAwal', parseNum(($event.target as HTMLInputElement).value))"
            @keyup.enter="($event.target as HTMLInputElement).blur()"
          />
        </template>
      </div>
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
.panel.no-export .lock-banner {
  padding: 4px 8px;
  font-size: 11px;
}

/* Header tabel ikut tone warna Grup (custom property di <thead>, berlaku ke kedua
   baris header, sticky per-<th> tetap normal). */
.table-wrap table.dense thead th {
  background: var(--group-thead-bg, var(--accent-light));
}
</style>
