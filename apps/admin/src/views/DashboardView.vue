<template>
  <div class="dash">
    <p class="lead">曲库与用户运营概览</p>
    <el-row :gutter="16">
      <el-col :xs="12" :sm="8" :md="4" v-for="item in cards" :key="item.label">
        <el-card class="stat-card" shadow="never">
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
.dash {
  max-width: 1100px;
}
.lead {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--wy-text-muted);
}
.stat-card {
  margin-bottom: 16px;
  border-radius: var(--wy-radius-md);
  border: 1px solid var(--wy-border);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.stat-card:hover {
  border-color: rgba(236, 65, 65, 0.35);
  box-shadow: var(--wy-shadow-sm);
}
.num {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--wy-brand);
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}
.label {
  color: var(--wy-text-secondary);
  margin-top: 8px;
  font-size: 13px;
}
</style>
