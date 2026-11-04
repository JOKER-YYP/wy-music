<template>
  <div class="admin-page">
    <div class="head">
      <el-input
        v-model="keyword"
        placeholder="搜索评论内容 / 用户 / 歌曲"
        clearable
        style="width: 280px"
        @keyup.enter="onFilter"
        @clear="onFilter"
      />
      <el-button type="danger" @click="onFilter">查询</el-button>
    </div>

    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="content" label="内容" min-width="220" show-overflow-tooltip />
      <el-table-column label="用户" width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.user?.nickname || '—' }}</template>
      </el-table-column>
      <el-table-column label="歌曲" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.track?.name || '—' }}</template>
      </el-table-column>
      <el-table-column prop="likeCount" label="赞" width="64" />
      <el-table-column prop="createdAt" label="时间" width="170" />
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
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

type CommentRow = {
  id: string
  content: string
  likeCount: number
  createdAt: string
  user?: { nickname: string }
  track?: { name: string }
}

const list = ref<CommentRow[]>([])
const loading = ref(false)
const page = ref(1)
const pageSize = 20
const total = ref(0)
const keyword = ref('')

async function load() {
  loading.value = true
  try {
    const { data } = await http.get('/api/admin/comments', {
      params: { page: page.value, pageSize, keyword: keyword.value || undefined },
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

async function remove(row: CommentRow) {
  await ElMessageBox.confirm('确认删除该评论？', '提示', { type: 'warning' })
  await http.delete(`/api/admin/comments/${row.id}`)
  ElMessage.success('已删除')
  load()
}

onMounted(load)
</script>

<style scoped>
.head {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-bottom: 14px;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
