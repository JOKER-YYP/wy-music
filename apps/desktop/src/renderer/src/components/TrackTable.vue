<template>
  <div class="track-table">
    <div v-if="!batchMode" class="list-tools">
      <button type="button" class="batch-entry" @click="batchMode = true">
        <el-icon :size="14"><Operation /></el-icon>
        <span>批量操作</span>
      </button>
    </div>
    <SongListTable
      v-model:batch-mode="batchMode"
      :tracks="tracks"
      :allow-delete="allowDelete"
      :allow-remove="allowRemove"
      :allow-reorder="allowReorder"
      :playlist-id="playlistId"
      :empty-text="emptyText"
      @refresh="emit('refresh')"
      @reorder="(list) => emit('reorder', list)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Operation } from '@element-plus/icons-vue'
import type { TrackDto } from '@wy-music/shared'
import type { QueueTrack } from '../stores/player'
import SongListTable from './SongListTable.vue'

withDefaults(
  defineProps<{
    tracks: Array<TrackDto | QueueTrack>
    allowDelete?: boolean
    allowRemove?: boolean
    allowReorder?: boolean
    playlistId?: string
    emptyText?: string
  }>(),
  { allowDelete: true, allowRemove: false, allowReorder: false },
)
const emit = defineEmits<{
  refresh: []
  reorder: [tracks: Array<TrackDto | QueueTrack>]
}>()
const batchMode = ref(false)
</script>

<style scoped lang="scss">
.list-tools {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 4px;
}
.batch-entry {
  border: none;
  background: transparent;
  color: var(--wy-text-secondary);
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  &:hover {
    color: var(--wy-brand);
    background: rgba(236, 65, 65, 0.06);
  }
}
</style>
