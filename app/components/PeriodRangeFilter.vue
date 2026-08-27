<script setup lang="ts">
import { MONTH_NAMES } from '~/utils/format'

const fromMonth = defineModel<number>('fromMonth', { required: true })
const fromYear = defineModel<number>('fromYear', { required: true })
const toMonth = defineModel<number>('toMonth', { required: true })
const toYear = defineModel<number>('toYear', { required: true })

withDefaults(defineProps<{ label?: string }>(), { label: 'Periode:' })

const thisYear = new Date().getFullYear()
const years = Array.from({ length: 6 }, (_, i) => thisYear - 3 + i)
</script>

<template>
  <div class="toolbar no-export">
    <span class="gm-label">{{ label }}</span>
    <select v-model.number="fromMonth">
      <option v-for="(m, i) in MONTH_NAMES" :key="m" :value="i + 1">{{ m }}</option>
    </select>
    <select v-model.number="fromYear">
      <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
    </select>
    <span class="gm-label">s/d</span>
    <select v-model.number="toMonth">
      <option v-for="(m, i) in MONTH_NAMES" :key="m" :value="i + 1">{{ m }}</option>
    </select>
    <select v-model.number="toYear">
      <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
    </select>
    <slot />
  </div>
</template>
