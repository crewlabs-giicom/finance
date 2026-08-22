<script setup lang="ts">
defineProps<{ status: { type: 'ok' | 'err'; msg: string } | null }>()
</script>

<template>
  <div v-if="status" class="status-box no-export" :class="status.type === 'ok' ? 'status-ok' : 'status-err'">
    {{ status.msg }}
  </div>
</template>
