<template>
  <div>
    <div class="head">
      <h2>用户管理</h2>
      <el-input
        v-model="keyword"
        placeholder="搜索账号/昵称"
        style="width: 240px"
        clearable
        @keyup.enter="load"
      />
    </div>
    <el-table :data="list" stripe>
      <el-table-column prop="account" label="账号" />
      <el-table-column prop="nickname" label="昵称" />
      <el-table-column prop="role" label="角色" width="100" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'danger'">
            {{ row.status === 1 ? '正常' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="注册时间" min-width="160" />
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button
            v-if="row.role !== 'admin'"
            link
            :type="row.status === 1 ? 'danger' : 'success'"
            @click="toggle(row)"
          >
            {{ row.status === 1 ? '禁用' : '启用' }}
          </el-button>
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
import { ElMessage } from 'element-plus'
import { http } from '../services/http'

interface UserRow {
  id: string
  account: string
  nickname: string
  role: string
  status: number
  createdAt: string
}

const list = ref<UserRow[]>([])
const page = ref(1)
const pageSize = 20
const total = ref(0)
const keyword = ref('')

async function load() {
  const { data } = await http.get('/api/admin/users', {
    params: { page: page.value, pageSize, keyword: keyword.value || undefined },
  })
  list.value = data.data.list
  total.value = data.data.total
}

async function toggle(row: UserRow) {
  const status = row.status === 1 ? 0 : 1
  await http.patch(`/api/admin/users/${row.id}/status`, { status })
  ElMessage.success('已更新')
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
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
