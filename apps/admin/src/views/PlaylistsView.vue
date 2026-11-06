<template>
  <div class="admin-page">
    <div class="admin-toolbar is-end">
      <el-checkbox v-model="onlyPublic" @change="onFilter">仅公开</el-checkbox>
      <el-checkbox v-model="onlyFeatured" @change="onFilter">仅推荐位</el-checkbox>
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
      <el-table-column label="推荐位" width="100">
        <template #default="{ row }">
          <el-tag v-if="row.featured" type="danger" size="small">推荐</el-tag>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="排序" width="110">
        <template #default="{ row }">
          <el-input-number
            v-if="row.featured"
            :model-value="row.recommendSort"
            :min="0"
            :max="9999"
            size="small"
            controls-position="right"
            @change="(v: number | undefined) => onSortChange(row, v)"
          />
          <span v-else class="muted">{{ row.recommendSort ?? 0 }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="170" />
      <el-table-column label="操作" width="260" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="togglePublic(row)">
            {{ row.isPublic ? '设为私密' : '设为公开' }}
          </el-button>
          <el-button link :type="row.featured ? 'warning' : 'success'" @click="toggleFeatured(row)">
            {{ row.featured ? '取消推荐' : '设为推荐' }}
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
  featured: boolean
  recommendSort: number
  createdAt: string
}

const list = ref<PlaylistRow[]>([])
const loading = ref(false)
const page = ref(1)
const pageSize = 20
const total = ref(0)
const keyword = ref('')
const onlyPublic = ref(false)
const onlyFeatured = ref(false)
const sortSaving = ref<string | null>(null)

async function load() {
  loading.value = true
  try {
    const { data } = await http.get('/api/admin/playlists', {
      params: {
        page: page.value,
        pageSize,
        keyword: keyword.value || undefined,
        public: onlyPublic.value ? '1' : undefined,
        featured: onlyFeatured.value ? '1' : undefined,
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

async function patchPlaylist(id: string, body: Record<string, unknown>, okMsg: string) {
  await http.patch(`/api/admin/playlists/${id}`, body)
  ElMessage.success(okMsg)
  await load()
}

async function togglePublic(row: PlaylistRow) {
  await patchPlaylist(row.id, { isPublic: !row.isPublic }, '已更新公开状态')
}

async function toggleFeatured(row: PlaylistRow) {
  const next = !row.featured
  await patchPlaylist(
    row.id,
    {
      featured: next,
      ...(next && !row.isPublic ? { isPublic: true } : {}),
    },
    next ? '已设为推荐位（将自动公开）' : '已取消推荐',
  )
}

async function onSortChange(row: PlaylistRow, value: number | undefined) {
  if (value == null || value === row.recommendSort) return
  if (sortSaving.value === row.id) return
  sortSaving.value = row.id
  try {
    await http.patch(`/api/admin/playlists/${row.id}`, { recommendSort: value })
    row.recommendSort = value
    ElMessage.success('排序已更新')
  } finally {
    sortSaving.value = null
  }
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
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
.muted {
  color: var(--wy-text-muted);
  font-size: 12px;
}
</style>
