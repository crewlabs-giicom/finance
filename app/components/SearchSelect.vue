<script setup lang="ts">
/**
 * Dropdown yang bisa dipilih dari daftar ATAU diketik buat nyari (kayak <select>
 * tapi searchable). Dipakai di sel tabel yang jumlah baris-nya banyak (mis. NPWP
 * di List Pajak / Daftar Norminatif), jadi listnya di-Teleport ke <body> dan
 * posisinya position:fixed — kalau enggak, bakal kepotong overflow:auto punya
 * .table-wrap pembungkusnya (beda dari combobox filter yang di luar tabel).
 */
type Option = { id: string; label: string }

const props = defineProps<{
  modelValue: string
  options: Option[]
  disabled?: boolean
  placeholder?: string
  allowCreate?: boolean
  createLabel?: string
}>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
  create: []
}>()

const query = ref('')
const open = ref(false)
const pos = ref({ top: 0, left: 0, width: 0 })
const inputEl = ref<HTMLInputElement | null>(null)

const selectedLabel = computed(() => props.options.find(o => o.id === props.modelValue)?.label || '')
watch(selectedLabel, (label) => { if (!open.value) query.value = label }, { immediate: true })

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q || q === selectedLabel.value.toLowerCase()) return props.options
  return props.options.filter(o => o.label.toLowerCase().includes(q))
})

function openDropdown() {
  if (props.disabled) return
  const r = inputEl.value?.getBoundingClientRect()
  if (r) pos.value = { top: r.bottom + 2, left: r.left, width: r.width }
  open.value = true
}
function onInput(value: string) {
  query.value = value
  openDropdown()
  if (!value.trim()) emit('update:modelValue', '')
}
function pick(o: Option) {
  emit('update:modelValue', o.id)
  query.value = o.label
  open.value = false
}
function pickCreate() {
  emit('create')
  open.value = false
}
function onEnter() {
  if (filtered.value.length === 1) pick(filtered.value[0]!)
}
function close() {
  open.value = false
  query.value = selectedLabel.value
}

// Dropdown-nya position:fixed jadi gak ngikut kalau tabelnya di-scroll — ditutup
// aja daripada nge-reposition terus-terusan tiap event scroll.
function onScroll(e: Event) {
  if (open.value && e.target instanceof Node && e.target !== inputEl.value) close()
}
onMounted(() => window.addEventListener('scroll', onScroll, true))
onUnmounted(() => window.removeEventListener('scroll', onScroll, true))
</script>

<template>
  <div class="search-select">
    <input
      ref="inputEl"
      type="text"
      class="cell-input"
      :placeholder="placeholder || '— pilih / ketik cari —'"
      :disabled="disabled"
      :value="query"
      @input="onInput(($event.target as HTMLInputElement).value)"
      @focus="openDropdown"
      @keydown.enter.prevent="onEnter"
      @keydown.esc="close"
      @blur="close"
    />
    <Teleport to="body">
      <ul
        v-if="open"
        class="search-select-list"
        :style="{ top: pos.top + 'px', left: pos.left + 'px', minWidth: pos.width + 'px' }"
      >
        <li v-if="!filtered.length && !allowCreate" class="search-select-empty">Gak ada yang cocok.</li>
        <li
          v-for="o in filtered" :key="o.id"
          :class="{ active: o.id === modelValue }"
          @mousedown.prevent="pick(o)"
        >{{ o.label }}</li>
        <li v-if="allowCreate" class="search-select-create" @mousedown.prevent="pickCreate">{{ createLabel || '+ Tambah Baru…' }}</li>
      </ul>
    </Teleport>
  </div>
</template>

<style scoped>
.search-select {
  display: inline-block;
  width: 100%;
}
.search-select input {
  width: 100%;
}
</style>

<style>
/* Bukan scoped: elemen ini di-Teleport ke <body>, di luar jangkauan <style scoped> komponen ini. */
.search-select-list {
  position: fixed;
  z-index: 60;
  max-height: 240px;
  overflow-y: auto;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .18);
}
.search-select-list li {
  padding: 6px 8px;
  font-size: 12.5px;
  border-radius: 5px;
  cursor: pointer;
  white-space: nowrap;
}
.search-select-list li:hover,
.search-select-list li.active {
  background: var(--accent-light);
}
.search-select-empty {
  color: var(--muted);
  cursor: default !important;
}
.search-select-empty:hover {
  background: transparent !important;
}
.search-select-create {
  border-top: 1px solid var(--border);
  margin-top: 2px;
  padding-top: 8px !important;
  font-weight: 600;
  color: var(--accent);
}
</style>
