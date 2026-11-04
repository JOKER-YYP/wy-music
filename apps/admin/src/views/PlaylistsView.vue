<template>
  <div class="admin-page">
    <div class="head">
      <el-checkbox v-model="onlyPublic" @change="onFilter">仅公开</el-checkbox>
      <el-input
        v-model="keyword"
        placeholder="搜索歌单名 / 创建者"
        clearable
        style="width: 240px"
        @keyup.enter="onFilter"
        @clear="onFilter"
      />
      <el-button type="danger" @click="onFilter">查询</el-button>
    </div>

    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="name" label="歌单" min-width="160" show-overflow-tooltip />
      <el-table-column label="创建者" width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.ownerNickname }}</template>
      </el-table-column>
      <el-table-column prop="trackCount" label="曲目" width="72" />
      <el-table-column label="公开" width="90">
        <template #default="{ row }">
          <el-tag :type="row.isPublic ? 'success' : 'info'" size="small">
            {{ row.isPublic ? '公开' : '私密' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="170" />
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="togglePublic(row)">
            {{ row.isPublic ? '设为私密' : '设为公开' }}
          </el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
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
import { ElMessage, ElMessageBox } from 'element-plus'
import { http } from '../services/http'

type PlaylistRow = {
  id: string
  name: string
  ownerNickname: string
  trackCount: number
  isPublic: boolean
  createdAt: string
}

const list = ref<PlaylistRow[]>([])
const loading = ref(false)
const page = ref(1)
const pageSize = 20
const total = ref(0)
const keyword = ref('')
const onlyPublic = ref(false)

async function load() {
  loading.value = true
  try {
    const { data } = await http.get('/api/admin/playlists', {
      params: {
        page: page.value,
        pageSize,
        keyword: keyword.value || undefined,
        public: onlyPublic.value ? '1' : undefined,
      },
    })
    list.value = data.data.list
    total.value = data.data.total
  } finally {
    loading.value = false
  }
}

function onFilter() {
  page.value = 1
  load()
}

async function togglePublic(row: PlaylistRow) {
  await http.patch(`/api/admin/playlists/${row.id}`, { isPublic: !row.isPublic })
  ElMessage.success('已更新')
  load()
}

async function remove(row: PlaylistRow) {
  await ElMessageBox.confirm(`确认删除歌单「${row.name}」？`, '警告', { type: 'warning' })
  await http.delete(`/api/admin/playlists/${row.id}`)
  ElMessage.success('已删除')
  load()
}

onMounted(load)
</script>

<style scoped>
.head {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: flex-end;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
