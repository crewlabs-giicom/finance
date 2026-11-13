<script setup lang="ts">
/**
 * Dropdown filter yang bisa pilih LEBIH DARI SATU opsi sekaligus (checkbox list),
 * dipakai di filter bar (mis. filter "Transaction" di Cek UMP) -- beda dari
 * SearchSelect.vue yang cuma bisa milih 1 dan dipakai di sel tabel. Panel di-Teleport
 * ke <body> + position:fixed, pola sama kayak SearchSelect biar gak kepotong
 * overflow:auto pembungkusnya.
 */
type Option = { value: string; label: string }

const props = defineProps<{
  modelValue: string[]
  options: Option[]
  placeholder?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const open = ref(false)
const pos = ref({ top: 0, left: 0, width: 0 })
const btnEl = ref<HTMLElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)

const summary = computed(() => {
  if (!props.modelValue.length) return props.placeholder || 'Semua'
  if (props.modelValue.length <= 2) {
    return props.options.filter(o => props.modelValue.includes(o.value)).map(o => o.label).join(', ')
  }
  return `${props.modelValue.length} dipilih`
})

function openDropdown() {
  const r = btnEl.value?.getBoundingClientRect()
  if (r) pos.value = { top: r.bottom + 2, left: r.left, width: Math.max(r.width, 180) }
  open.value = true
}
function close() {
  open.value = false
}
function toggleOpen() {
  open.value ? close() : openDropdown()
}
function toggle(value: string) {
  const set = new Set(props.modelValue)
  set.has(value) ? set.delete(value) : set.add(value)
  emit('update:modelValue', [...set])
}
function clearAll() {
  emit('update:modelValue', [])
}

function onDocMousedown(e: MouseEvent) {
  if (!open.value) return
  const target = e.target as Node
  if (btnEl.value?.contains(target) || panelEl.value?.contains(target)) return
  close()
}
function onScroll(e: Event) {
  if (open.value && e.target instanceof Node && !panelEl.value?.contains(e.target) && e.target !== panelEl.value) close()
}
onMounted(() => {
  document.addEventListener('mousedown', onDocMousedown)
  window.addEventListener('scroll', onScroll, true)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', onDocMousedown)
  window.removeEventListener('scroll', onScroll, true)
})
</script>

<template>
  <div class="multi-select-filter">
    <button ref="btnEl" type="button" class="multi-select-btn" @click="toggleOpen">
      <span class="multi-select-summary">{{ summary }}</span>
      <span class="multi-select-caret">▾</span>
    </button>
    <Teleport to="body">
      <div
        v-if="open" ref="panelEl" class="multi-select-panel"
        :style="{ top: pos.top + 'px', left: pos.left + 'px', minWidth: pos.width + 'px' }"
      >
        <div class="multi-select-item multi-select-clear" @mousedown.prevent="clearAll">— Semua —</div>
        <label v-for="o in options" :key="o.value" class="multi-select-item" @mousedown.prevent="toggle(o.value)">
          <input type="checkbox" :checked="modelValue.includes(o.value)" tabindex="-1" />
          {{ o.label }}
        </label>
        <div v-if="!options.length" class="multi-select-empty">Belum ada data.</div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.multi-select-filter {
  display: inline-block;
}
.multi-select-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 140px;
  max-width: 220px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--card);
  font-size: 12.5px;
  cursor: pointer;
  text-align: left;
}
.multi-select-summary {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.multi-select-caret {
  color: var(--muted);
  font-size: 10px;
}
</style>

<style>
/* Bukan scoped: panel ini di-Teleport ke <body>, di luar jangkauan <style scoped> komponen ini. */
.multi-select-panel {
  position: fixed;
  z-index: 60;
  max-height: 260px;
  overflow-y: auto;
  margin: 0;
  padding: 4px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .18);
}
.multi-select-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  font-size: 12.5px;
  border-radius: 5px;
  cursor: pointer;
  white-space: nowrap;
}
.multi-select-item:hover {
  background: var(--accent-light);
}
.multi-select-clear {
  border-bottom: 1px solid var(--border);
  margin-bottom: 2px;
  font-weight: 600;
  color: var(--accent);
}
.multi-select-empty {
  padding: 6px 8px;
  font-size: 12.5px;
  color: var(--muted);
}
</style>
