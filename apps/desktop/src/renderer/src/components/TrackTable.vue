<template>
  <div>
    <SongGrid :tracks="tracks" :columns="1" @refresh="emit('refresh')" />
  </div>
</template>

<script setup lang="ts">
import type { TrackDto } from '@wy-music/shared'
import SongGrid from './SongGrid.vue'

defineProps<{ tracks: TrackDto[] }>()
const emit = defineEmits<{ refresh: [] }>()
</script>
