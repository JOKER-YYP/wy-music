<template>
  <div>
    <SongListTable :tracks="tracks" :allow-delete="allowDelete" @refresh="emit('refresh')" />
  </div>
</template>

<script setup lang="ts">
import type { TrackDto } from '@wy-music/shared'
import SongListTable from './SongListTable.vue'

withDefaults(
  defineProps<{
    tracks: TrackDto[]
    allowDelete?: boolean
  }>(),
  { allowDelete: true },
)
const emit = defineEmits<{ refresh: [] }>()
</script>
