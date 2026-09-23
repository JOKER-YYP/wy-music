<template>
  <div>
    <h2>仪表盘</h2>
    <el-row :gutter="16">
      <el-col :span="4" v-for="item in cards" :key="item.label">
        <el-card shadow="hover">
          <div class="num">{{ item.value }}</div>
          <div class="label">{{ item.label }}</div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { DashboardStats } from '@wy-music/shared'
import { http } from '../services/http'

const stats = ref<DashboardStats | null>(null)
const cards = computed(() => [
  { label: '用户数', value: stats.value?.userCount ?? '-' },
  { label: '歌曲总数', value: stats.value?.trackCount ?? '-' },
  { label: '已发布', value: stats.value?.publishedCount ?? '-' },
  { label: '待审核', value: stats.value?.pendingCount ?? '-' },
  { label: '今日上传', value: stats.value?.todayUploadCount ?? '-' },
  { label: '今日播放', value: stats.value?.todayPlayCount ?? '-' },
])

onMounted(async () => {
  const { data } = await http.get('/api/admin/dashboard')
  stats.value = data.data
})
</script>

<style scoped>
.num {
  font-size: 28px;
  font-weight: 700;
  color: #ec4141;
}
.label {
  color: #666;
  margin-top: 8px;
}
</style>
