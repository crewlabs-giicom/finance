<script setup lang="ts">
import { MONTH_NAMES } from '~/utils/format'

const month = defineModel<number>('month', { required: true })
const year = defineModel<number>('year', { required: true })

withDefaults(defineProps<{ label?: string }>(), { label: 'Tampilkan:' })

const thisYear = new Date().getFullYear()
const years = Array.from({ length: 6 }, (_, i) => thisYear - 3 + i)
</script>

<template>
  <div class="toolbar no-export">
    <span class="gm-label">{{ label }}</span>
    <select v-model.number="month">
      <option v-for="(m, i) in MONTH_NAMES" :key="m" :value="i + 1">{{ m }}</option>
    </select>
    <select v-model.number="year">
      <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
    </select>
    <slot />
  </div>
</template>
