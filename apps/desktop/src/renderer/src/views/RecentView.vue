<template>
  <div>
    <div class="head">
      <h2>最近播放</h2>
      <el-button @click="clear">清空</el-button>
    </div>
    <TrackTable :tracks="list" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { TrackDto } from '@wy-music/shared'
import { ElMessage } from 'element-plus'
import { http } from '../services/http'
import TrackTable from '../components/TrackTable.vue'

const list = ref<TrackDto[]>([])
async function load() {
  const { data } = await http.get('/api/history')
  list.value = data.data
}
async function clear() {
  await http.delete('/api/history')
  ElMessage.success('已清空')
  list.value = []
}
onMounted(load)
</script>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
