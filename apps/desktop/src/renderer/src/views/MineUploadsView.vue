<template>
  <div>
    <h2>我的上传</h2>
    <el-table :data="list" stripe>
      <el-table-column prop="name" label="歌曲" />
      <el-table-column label="歌手">
        <template #default="{ row }">{{ row.artists?.join(' / ') }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="120" />
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button link type="primary" @click="play(row)">播放</el-button>
          <el-button link type="danger" @click="remove(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { TrackDto } from '@wy-music/shared'
import { ElMessage, ElMessageBox } from 'element-plus'
import { http } from '../services/http'
import { usePlayerStore } from '../stores/player'

const list = ref<TrackDto[]>([])
const player = usePlayerStore()

async function load() {
  const { data } = await http.get('/api/tracks/mine')
  list.value = data.data
}
function play(row: TrackDto) {
  player.playTrack(row, list.value)
}
async function remove(id: string) {
  await ElMessageBox.confirm('确认删除该歌曲？', '提示')
  await http.delete(`/api/tracks/${id}`)
  ElMessage.success('已删除')
  load()
}
onMounted(load)
</script>
