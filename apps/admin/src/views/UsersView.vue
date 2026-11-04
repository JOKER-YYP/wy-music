<template>
  <div class="admin-page">
    <div class="head">
      <el-select v-model="status" clearable placeholder="状态" style="width: 120px" @change="onFilter">
        <el-option label="全部" value="" />
        <el-option label="正常" value="1" />
        <el-option label="禁用" value="0" />
      </el-select>
      <el-input
        v-model="keyword"
        placeholder="搜索账号/昵称"
        style="width: 240px"
        clearable
        @keyup.enter="onFilter"
        @clear="onFilter"
      />
      <el-button type="danger" @click="onFilter">查询</el-button>
    </div>
    <el-table :data="list" stripe>
      <el-table-column prop="account" label="账号" min-width="110" />
      <el-table-column prop="nickname" label="昵称" min-width="110" />
      <el-table-column prop="role" label="角色" width="90" />
      <el-table-column label="上传" width="72">
        <template #default="{ row }">{{ row.trackCount ?? 0 }}</template>
      </el-table-column>
      <el-table-column label="歌单" width="72">
        <template #default="{ row }">{{ row.playlistCount ?? 0 }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
            {{ row.status === 1 ? '正常' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="注册时间" min-width="160" />
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          <el-button
            v-if="row.role !== 'admin'"
            link
            :type="row.status === 1 ? 'danger' : 'success'"
            @click="toggle(row)"
          >
            {{ row.status === 1 ? '禁用' : '启用' }}
          </el-button>
          <el-button v-if="row.role !== 'admin'" link @click="resetPassword(row)">重置密码</el-button>
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

    <el-dialog v-model="detailVisible" title="用户详情" width="480px" destroy-on-close>
      <el-descriptions v-if="detail" :column="1" border>
        <el-descriptions-item label="账号">{{ detail.account }}</el-descriptions-item>
        <el-descriptions-item label="昵称">{{ detail.nickname }}</el-descriptions-item>
        <el-descriptions-item label="角色">{{ detail.role }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          {{ detail.status === 1 ? '正常' : '禁用' }}
        </el-descriptions-item>
        <el-descriptions-item label="上传数">{{ detail.trackCount }}</el-descriptions-item>
        <el-descriptions-item label="歌单数">{{ detail.playlistCount }}</el-descriptions-item>
        <el-descriptions-item label="喜欢数">{{ detail.likeCount }}</el-descriptions-item>
        <el-descriptions-item label="评论数">{{ detail.commentCount }}</el-descriptions-item>
        <el-descriptions-item label="注册时间">{{ detail.createdAt }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { http } from '../services/http'

interface UserRow {
  id: string
  account: string
  nickname: string
  role: string
  status: number
  createdAt: string
  trackCount?: number
  playlistCount?: number
  likeCount?: number
  commentCount?: number
}

const list = ref<UserRow[]>([])
const page = ref(1)
const pageSize = 20
const total = ref(0)
const keyword = ref('')
const status = ref('')
const detailVisible = ref(false)
const detail = ref<UserRow | null>(null)

async function load() {
  const { data } = await http.get('/api/admin/users', {
    params: {
      page: page.value,
      pageSize,
      keyword: keyword.value || undefined,
      status: status.value || undefined,
    },
  })
  list.value = data.data.list
  total.value = data.data.total
}

function onFilter() {
  page.value = 1
  load()
}

async function toggle(row: UserRow) {
  const next = row.status === 1 ? 0 : 1
  await http.patch(`/api/admin/users/${row.id}/status`, { status: next })
  ElMessage.success('已更新')
  load()
}

async function resetPassword(row: UserRow) {
  await ElMessageBox.confirm(
    `确认为「${row.nickname}」重置密码？将生成临时密码。`,
    '重置密码',
    { type: 'warning' },
  )
  const { data } = await http.post(`/api/admin/users/${row.id}/reset-password`, {})
  const pwd = data.data?.temporaryPassword
  await ElMessageBox.alert(`临时密码：${pwd}\n请妥善告知用户并提醒尽快修改。`, '重置成功', {
    confirmButtonText: '已复制/已知晓',
  })
  try {
    if (pwd) await navigator.clipboard.writeText(String(pwd))
  } catch {
    /* ignore */
  }
}

async function openDetail(row: UserRow) {
  const { data } = await http.get(`/api/admin/users/${row.id}`)
  detail.value = data.data
  detailVisible.value = true
}

onMounted(load)
</script>

<style scoped>
.head {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 14px;
  gap: 8px;
  flex-wrap: wrap;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
