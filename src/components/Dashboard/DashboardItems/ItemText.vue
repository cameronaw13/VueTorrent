<script setup lang="ts">
import { Torrent } from '@/types/vuetorrent'

defineProps<{ torrent: Torrent; title: string; value: string, color?: (v: any) => string }>()
</script>

<template>
  <div class="d-flex flex-column">
    <div class="text-caption text-grey">
      {{ $t(`torrent.properties.${title}`) }}
    </div>
    <div :class="color ? color(torrent[value]) : ''">{{ torrent[value] }}</div>
  </div>
</template>

<style scoped></style>
