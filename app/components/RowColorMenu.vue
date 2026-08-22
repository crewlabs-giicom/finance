<script setup lang="ts">
import { ROW_PALETTE } from '~/composables/useRowColors'

defineProps<{
  menu: { visible: boolean; x: number; y: number; targetId: string }
  /** Aksi ekstra di bawah palet, misal tombol duplicate baris. */
  showDuplicate?: boolean
}>()

const emit = defineEmits<{ pick: [color: string]; duplicate: [id: string] }>()
</script>

<template>
  <div
    v-if="menu.visible"
    class="panel color-menu"
    :style="{ top: menu.y + 'px', left: menu.x + 'px' }"
    @click.stop
  >
    <div class="color-menu-swatches">
      <span
        v-for="c in ROW_PALETTE"
        :key="c"
        class="swatch"
        :style="{ background: c }"
        :title="c"
        @click="emit('pick', c)"
      />
      <span class="swatch clear" title="Hapus warna" @click="emit('pick', '')">✕</span>
    </div>
    <button
      v-if="showDuplicate"
      class="btn secondary color-menu-action"
      @click="emit('duplicate', menu.targetId)"
    >🔁 Duplicate baris</button>
  </div>
</template>
