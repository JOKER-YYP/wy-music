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
      :playlist-id="playlistId"
      :empty-text="emptyText"
      @refresh="emit('refresh')"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Operation } from '@element-plus/icons-vue'
import type { TrackDto } from '@wy-music/shared'
import SongListTable from './SongListTable.vue'

withDefaults(
  defineProps<{
    tracks: TrackDto[]
    allowDelete?: boolean
    allowRemove?: boolean
    playlistId?: string
    emptyText?: string
  }>(),
  { allowDelete: true, allowRemove: false },
)
const emit = defineEmits<{ refresh: [] }>()
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
  color: #666;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  &:hover {
    color: #ec4141;
    background: rgba(236, 65, 65, 0.06);
  }
}
</style>
