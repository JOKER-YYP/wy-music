<template>
  <div>
    <div class="head">
      <h2>公共曲库管理</h2>
      <div class="filters">
        <el-select v-model="status" clearable placeholder="状态" style="width: 140px" @change="onFilter">
          <el-option label="全部" value="" />
          <el-option label="待审核" value="pending" />
          <el-option label="已发布" value="published" />
          <el-option label="已驳回" value="rejected" />
          <el-option label="已下架" value="offline" />
        </el-select>
        <el-input
          v-model="keyword"
          placeholder="搜索歌名 / 歌手 / 专辑"
          clearable
          style="width: 240px"
          @keyup.enter="onFilter"
          @clear="onFilter"
        />
        <el-button type="danger" @click="onFilter">查询</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="name" label="歌曲" min-width="150" show-overflow-tooltip />
      <el-table-column label="歌手" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.artists?.join(' / ') }}</template>
      </el-table-column>
      <el-table-column prop="album" label="专辑" min-width="120" show-overflow-tooltip />
      <el-table-column label="时长" width="80">
        <template #default="{ row }">{{ formatDuration(row.durationMs) }}</template>
      </el-table-column>
      <el-table-column label="大小" width="90">
        <template #default="{ row }">{{ formatBytes(row.fileSize) }}</template>
      </el-table-column>
      <el-table-column prop="uploaderNickname" label="上传者" width="100" show-overflow-tooltip />
      <el-table-column label="状态" width="96">
        <template #default="{ row }">
          <el-tag :type="statusTag(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="playCount" label="播放" width="72" />
      <el-table-column label="操作" width="320" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button
            v-if="row.status !== 'published'"
            link
            type="success"
            @click="approve(row.id)"
          >
            通过
          </el-button>
          <el-button
            v-if="row.status === 'pending'"
            link
            type="warning"
            @click="reject(row.id)"
          >
            驳回
          </el-button>
          <el-button
            v-if="row.status === 'published'"
            link
            @click="offline(row.id)"
          >
            下架
          </el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      class="pager"
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :page-sizes="[20, 50, 100]"
      :total="total"
      layout="total, sizes, prev, pager, next"
      @current-change="load"
      @size-change="onFilter"
    />

    <el-dialog
      v-model="editVisible"
      title="编辑歌曲"
      width="640px"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <el-form v-if="editForm" label-width="88px">
        <el-form-item label="歌名" required>
          <el-input v-model="editForm.name" />
        </el-form-item>
        <el-form-item label="歌手" required>
          <el-input v-model="editForm.artists" placeholder="多个用逗号分隔" />
        </el-form-item>
        <el-form-item label="专辑">
          <el-input v-model="editForm.album" />
        </el-form-item>
        <el-form-item label="时长(秒)">
          <el-input-number v-model="editForm.durationSec" :min="0" :step="1" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="editForm.status" style="width: 180px">
            <el-option label="待审核" value="pending" />
            <el-option label="已发布" value="published" />
            <el-option label="已驳回" value="rejected" />
            <el-option label="已下架" value="offline" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="editForm.status === 'rejected'" label="驳回原因">
          <el-input v-model="editForm.rejectReason" />
        </el-form-item>
        <el-form-item label="歌词">
          <el-input v-model="editForm.lyricText" type="textarea" :rows="8" placeholder="LRC 歌词文本" />
        </el-form-item>
        <el-form-item label="文件信息">
          <span class="meta">
            {{ editForm.mimeType }} · {{ formatBytes(editForm.fileSize) }} ·
            上传者 {{ editForm.uploaderNickname || '—' }} · 播放 {{ editForm.playCount }}
          </span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="danger" :loading="saving" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { TrackDto, TrackStatus } from '@wy-music/shared'
import { ElMessage, ElMessageBox } from 'element-plus'
import { http } from '../services/http'

const list = ref<TrackDto[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const status = ref('')
const keyword = ref('')
const loading = ref(false)

const editVisible = ref(false)
const saving = ref(false)
const editForm = reactive({
  id: '',
  name: '',
  artists: '',
  album: '',
  durationSec: 0,
  status: 'published' as TrackStatus,
  rejectReason: '',
  lyricText: '',
  mimeType: '',
  fileSize: 0,
  uploaderNickname: '',
  playCount: 0,
})

function formatDuration(ms: number) {
  const s = Math.floor((ms || 0) / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

function formatBytes(n: number) {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function statusLabel(s: string) {
  return (
    {
      pending: '待审核',
      published: '已发布',
      rejected: '已驳回',
      offline: '已下架',
    }[s] || s
  )
}

function statusTag(s: string) {
  return (
    {
      pending: 'warning',
      published: 'success',
      rejected: 'danger',
      offline: 'info',
    }[s] || ''
  ) as '' | 'success' | 'warning' | 'danger' | 'info'
}

async function load() {
  loading.value = true
  try {
    const { data } = await http.get('/api/admin/tracks', {
      params: {
        page: page.value,
        pageSize: pageSize.value,
        status: status.value || undefined,
        keyword: keyword.value || undefined,
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

async function openEdit(row: TrackDto) {
  const { data } = await http.get(`/api/admin/tracks/${row.id}`)
  const t = data.data as TrackDto
  editForm.id = t.id
  editForm.name = t.name
  editForm.artists = (t.artists || []).join(',')
  editForm.album = t.album || ''
  editForm.durationSec = Math.round((t.durationMs || 0) / 1000)
  editForm.status = t.status
  editForm.rejectReason = t.rejectReason || ''
  editForm.lyricText = t.lyricText || ''
  editForm.mimeType = t.mimeType
  editForm.fileSize = t.fileSize
  editForm.uploaderNickname = t.uploaderNickname || ''
  editForm.playCount = t.playCount
  editVisible.value = true
}

async function saveEdit() {
  if (!editForm.name.trim()) {
    ElMessage.warning('请填写歌名')
    return
  }
  if (!editForm.artists.trim()) {
    ElMessage.warning('请填写歌手')
    return
  }
  saving.value = true
  try {
    await http.put(`/api/admin/tracks/${editForm.id}`, {
      name: editForm.name.trim(),
      artists: editForm.artists.trim(),
      album: editForm.album,
      lyricText: editForm.lyricText,
      durationMs: Math.round(editForm.durationSec * 1000),
      status: editForm.status,
      rejectReason: editForm.status === 'rejected' ? editForm.rejectReason : null,
    })
    ElMessage.success('已保存')
    editVisible.value = false
    load()
  } finally {
    saving.value = false
  }
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
  await ElMessageBox.confirm(
    '确认下架？已收藏/加入歌单的用户下次进入会收到「歌曲已被下架」提示。',
    '下架',
    { type: 'warning' },
  )
  await http.post(`/api/admin/tracks/${id}/offline`)
  ElMessage.success('已下架')
  load()
}

async function remove(row: TrackDto) {
  await ElMessageBox.confirm(
    `确认删除「${row.name}」？文件将永久删除，相关用户下次进入会收到下架提示。`,
    '警告',
    { type: 'warning' },
  )
  await http.delete(`/api/admin/tracks/${row.id}`)
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
  gap: 12px;
  flex-wrap: wrap;
}
.filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
.meta {
  color: #888;
  font-size: 13px;
}
</style>
