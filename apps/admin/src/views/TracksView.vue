<template>
  <div>
    <div class="head">
      <h2>歌曲管理</h2>
      <div class="filters">
        <el-select v-model="status" clearable placeholder="状态" style="width: 140px" @change="load">
          <el-option label="全部" value="" />
          <el-option label="待审核" value="pending" />
          <el-option label="已发布" value="published" />
          <el-option label="已驳回" value="rejected" />
          <el-option label="已下架" value="offline" />
        </el-select>
        <el-input
          v-model="keyword"
          placeholder="搜索歌名/歌手"
          clearable
          style="width: 220px"
          @keyup.enter="load"
        />
        <el-button type="danger" @click="load">查询</el-button>
      </div>
    </div>

    <el-table :data="list" stripe>
      <el-table-column prop="name" label="歌曲" min-width="160" />
      <el-table-column label="歌手" min-width="120">
        <template #default="{ row }">{{ row.artists?.join(' / ') }}</template>
      </el-table-column>
      <el-table-column prop="uploaderNickname" label="上传者" width="120" />
      <el-table-column prop="status" label="状态" width="100" />
      <el-table-column prop="playCount" label="播放" width="80" />
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button link type="success" @click="approve(row.id)">通过</el-button>
          <el-button link type="warning" @click="reject(row.id)">驳回</el-button>
          <el-button link @click="offline(row.id)">下架</el-button>
          <el-button link type="danger" @click="remove(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      class="pager"
      v-model:current-page="page"
      :page-size="pageSize"
      :total="total"
      layout="total, prev, pager, next"
      @current-change="load"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { TrackDto } from '@wy-music/shared'
import { ElMessage, ElMessageBox } from 'element-plus'
import { http } from '../services/http'

const list = ref<TrackDto[]>([])
const page = ref(1)
const pageSize = 20
const total = ref(0)
const status = ref('')
const keyword = ref('')

async function load() {
  const { data } = await http.get('/api/admin/tracks', {
    params: {
      page: page.value,
      pageSize,
      status: status.value || undefined,
      keyword: keyword.value || undefined,
    },
  })
  list.value = data.data.list
  total.value = data.data.total
}

async function approve(id: string) {
  await http.post(`/api/admin/tracks/${id}/approve`)
  ElMessage.success('已通过')
  load()
}

async function reject(id: string) {
  const { value } = await ElMessageBox.prompt('请输入驳回原因', '驳回', {
    inputValue: '不符合规范',
  })
  await http.post(`/api/admin/tracks/${id}/reject`, { reason: value })
  ElMessage.success('已驳回')
  load()
}

async function offline(id: string) {
  await http.post(`/api/admin/tracks/${id}/offline`)
  ElMessage.success('已下架')
  load()
}

async function remove(id: string) {
  await ElMessageBox.confirm('确认删除？此操作不可恢复', '警告', { type: 'warning' })
  await http.delete(`/api/admin/tracks/${id}`)
  ElMessage.success('已删除')
  load()
}

onMounted(load)
</script>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.filters {
  display: flex;
  gap: 8px;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
