<template>
  <div class="admin-page">
    <div class="admin-toolbar is-split">
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
          style="width: 200px"
          @keyup.enter="onFilter"
          @clear="onFilter"
        />
        <el-input
          v-model="uploader"
          placeholder="上传者"
          clearable
          style="width: 140px"
          @keyup.enter="onFilter"
          @clear="onFilter"
        />
        <el-button type="danger" @click="onFilter">查询</el-button>
        <el-button @click="loadDuplicates">重复检测</el-button>
        <el-button type="primary" plain :loading="lyricMatching" @click="startMatchLyrics">
          匹配歌词
        </el-button>
      </div>
      <div v-if="selected.length" class="batch">
        <span>已选 {{ selected.length }}</span>
        <el-button size="small" type="success" @click="batch('approve')">批量通过</el-button>
        <el-button size="small" type="warning" @click="batch('reject')">批量驳回</el-button>
        <el-button size="small" @click="batch('offline')">批量下架</el-button>
        <el-button size="small" type="danger" @click="batch('delete')">批量删除</el-button>
        <el-button size="small" type="primary" :loading="lyricMatching" @click="startMatchLyrics">
          匹配歌词
        </el-button>
      </div>
    </div>

    <el-table
      v-loading="loading"
      :data="list"
      stripe
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="42" />
      <el-table-column prop="name" label="歌曲" min-width="140" show-overflow-tooltip />
      <el-table-column label="歌手" min-width="110" show-overflow-tooltip>
        <template #default="{ row }">{{ row.artists?.join(' / ') }}</template>
      </el-table-column>
      <el-table-column prop="album" label="专辑" min-width="110" show-overflow-tooltip />
      <el-table-column label="时长" width="72">
        <template #default="{ row }">{{ formatDuration(row.durationMs) }}</template>
      </el-table-column>
      <el-table-column prop="uploaderNickname" label="上传者" width="96" show-overflow-tooltip />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="statusTag(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="playCount" label="播放" width="64" />
      <el-table-column label="歌词" width="72">
        <template #default="{ row }">
          <el-tag v-if="hasLyric(row.lyricText)" size="small" type="success">有</el-tag>
          <el-tag v-else size="small" type="info">无</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="360" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="preview(row)">试听</el-button>
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
          <el-button
            v-if="row.status === 'offline' || row.status === 'rejected'"
            link
            type="success"
            @click="approve(row.id)"
          >
            恢复
          </el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      class="pager"
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
        <el-form-item label="歌手">
          <el-input
            v-model="editForm.artists"
            placeholder="可留空，默认未知歌手；多个用逗号分隔"
          />
        </el-form-item>
        <el-form-item label="专辑">
          <el-input v-model="editForm.album" placeholder="可留空，默认未知专辑" />
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

    <el-dialog v-model="previewVisible" title="试听" width="420px" @closed="stopPreview">
      <div v-if="previewTrack" class="preview-box">
        <div class="preview-name">{{ previewTrack.name }}</div>
        <div class="preview-artists">{{ previewTrack.artists?.join(' / ') }}</div>
        <audio ref="audioRef" class="audio" controls :src="previewSrc" />
      </div>
    </el-dialog>

    <el-dialog v-model="dupVisible" title="重复曲目（相同文件哈希）" width="720px">
      <el-empty v-if="!dupGroups.length" description="未发现重复文件" />
      <div v-for="g in dupGroups" :key="g.fileHash" class="dup-group">
        <div class="dup-head">{{ g.count }} 首 · {{ g.fileHash.slice(0, 12) }}…</div>
        <div v-for="t in g.tracks" :key="t.id" class="dup-row">
          <span>{{ t.name }} — {{ t.artists?.join('/') }}</span>
          <el-tag size="small">{{ statusLabel(t.status) }}</el-tag>
          <el-button link type="danger" @click="remove(t)">删除</el-button>
        </div>
      </div>
    </el-dialog>

    <el-dialog
      v-model="lyricReportVisible"
      title="歌词匹配结果"
      width="780px"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <div class="lyric-summary">
        <el-tag type="success">成功 {{ lyricReport.matched.length }}</el-tag>
        <el-tag type="danger">失败 {{ lyricReport.failed.length }}</el-tag>
        <el-tag type="info">仍缺词 {{ lyricReport.remaining }}</el-tag>
        <span v-if="lyricMatching" class="lyric-progress">正在匹配… {{ lyricProgressText }}</span>
      </div>

      <template v-if="lyricReport.matched.length">
        <div class="lyric-section-title">匹配成功</div>
        <el-table :data="lyricReport.matched" size="small" max-height="220" stripe>
          <el-table-column prop="name" label="歌曲" min-width="140" show-overflow-tooltip />
          <el-table-column label="歌手" min-width="120" show-overflow-tooltip>
            <template #default="{ row }">{{ row.artists?.join(' / ') }}</template>
          </el-table-column>
          <el-table-column prop="sourceLabel" label="来源" width="100" />
          <el-table-column label="字数" width="72">
            <template #default="{ row }">{{ row.lyricChars }}</template>
          </el-table-column>
        </el-table>
      </template>

      <template v-if="lyricReport.failed.length">
        <div class="lyric-section-title">搜索 / 下载失败</div>
        <el-table :data="lyricReport.failed" size="small" max-height="280" stripe>
          <el-table-column prop="name" label="歌曲" min-width="130" show-overflow-tooltip />
          <el-table-column label="歌手" min-width="110" show-overflow-tooltip>
            <template #default="{ row }">{{ row.artists?.join(' / ') }}</template>
          </el-table-column>
          <el-table-column label="阶段" width="88">
            <template #default="{ row }">{{ stageLabel(row.stage) }}</template>
          </el-table-column>
          <el-table-column prop="reason" label="原因" min-width="180" show-overflow-tooltip />
        </el-table>
      </template>

      <el-empty
        v-if="!lyricMatching && !lyricReport.matched.length && !lyricReport.failed.length"
        description="本批没有需要处理的曲目"
      />

      <template #footer>
        <el-button
          v-if="lyricReport.remaining > 0 && !lyricMatching"
          type="primary"
          @click="continueMatchLyrics"
        >
          继续匹配剩余 {{ lyricReport.remaining }} 首
        </el-button>
        <el-button @click="lyricReportVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { TrackDto, TrackStatus } from '@wy-music/shared'
import { ElMessage, ElMessageBox } from 'element-plus'
import { http } from '../services/http'
import { adminStreamUrl, formatBytes } from '../services/media'

const route = useRoute()
const router = useRouter()
const list = ref<TrackDto[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const status = ref(String(route.query.status || ''))
const keyword = ref('')
const uploader = ref('')
const loading = ref(false)
const selected = ref<TrackDto[]>([])

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

const previewVisible = ref(false)
const previewTrack = ref<TrackDto | null>(null)
const previewSrc = ref('')
const audioRef = ref<HTMLAudioElement | null>(null)

const dupVisible = ref(false)
const dupGroups = ref<Array<{ fileHash: string; count: number; tracks: TrackDto[] }>>([])

type LyricMatchOk = {
  trackId: string
  name: string
  artists: string[]
  source: string
  sourceLabel: string
  lyricChars: number
}
type LyricMatchFail = {
  trackId: string
  name: string
  artists: string[]
  stage: 'search' | 'match' | 'download' | 'write'
  reason: string
}

const lyricMatching = ref(false)
const lyricReportVisible = ref(false)
const lyricProgressText = ref('')
const lyricScopeIds = ref<string[] | null>(null)
const lyricReport = reactive({
  matched: [] as LyricMatchOk[],
  failed: [] as LyricMatchFail[],
  remaining: 0,
})

function hasLyric(text?: string | null) {
  const t = String(text || '').trim()
  if (!t) return false
  if (/暂无歌词|无效歌词/.test(t) && t.length < 40) return false
  return true
}

function stageLabel(stage: string) {
  return (
    {
      search: '搜索',
      match: '匹配',
      download: '下载',
      write: '写入',
    }[stage] || stage
  )
}

function formatDuration(ms: number) {
  const s = Math.floor((ms || 0) / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
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
        uploader: uploader.value || undefined,
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
  const q: Record<string, string> = {}
  if (status.value) q.status = status.value
  void router.replace({ path: '/tracks', query: q })
  load()
}

function onSelectionChange(rows: TrackDto[]) {
  selected.value = rows
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
  const artists = editForm.artists.trim() || '未知歌手'
  const album = editForm.album.trim() || '未知专辑'
  saving.value = true
  try {
    await http.put(`/api/admin/tracks/${editForm.id}`, {
      name: editForm.name.trim(),
      artists,
      album,
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

function preview(row: TrackDto) {
  previewTrack.value = row
  previewSrc.value = adminStreamUrl(row.id)
  previewVisible.value = true
}

function stopPreview() {
  audioRef.value?.pause()
  previewSrc.value = ''
  previewTrack.value = null
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
    `确认删除「${row.name}」？文件将永久删除。`,
    '警告',
    { type: 'warning' },
  )
  await http.delete(`/api/admin/tracks/${row.id}`)
  ElMessage.success('已删除')
  load()
  if (dupVisible.value) loadDuplicates()
}

async function batch(action: 'approve' | 'reject' | 'offline' | 'delete') {
  const ids = selected.value.map((t) => t.id)
  if (!ids.length) return
  let reason = '不符合规范'
  if (action === 'reject') {
    const { value } = await ElMessageBox.prompt('请输入驳回原因', '批量驳回', {
      inputValue: reason,
    })
    reason = value
  } else {
    const labels = { approve: '通过', reject: '驳回', offline: '下架', delete: '删除' }
    await ElMessageBox.confirm(`确认批量${labels[action]} ${ids.length} 首？`, '批量操作', {
      type: 'warning',
    })
  }
  await http.post('/api/admin/tracks/batch', { action, ids, reason })
  ElMessage.success('批量处理完成')
  selected.value = []
  load()
}

async function loadDuplicates() {
  const { data } = await http.get('/api/admin/tracks/duplicates')
  dupGroups.value = data.data.groups || []
  dupVisible.value = true
}

async function startMatchLyrics() {
  if (lyricMatching.value) return

  const selectedIds = selected.value.map((t) => t.id)
  const scopeIds = selectedIds.length ? selectedIds : undefined

  const countParams = scopeIds?.length
    ? { params: { ids: scopeIds.join(',') } }
    : undefined
  const { data: countRes } = await http.get('/api/admin/tracks/missing-lyrics-count', countParams)
  const missing = Number(countRes.data?.missing || 0)
  if (!missing) {
    ElMessage.info(scopeIds?.length ? '所选曲目均已有歌词' : '曲库暂无缺歌词的歌曲')
    return
  }

  const scopeText = scopeIds?.length
    ? `已选 ${scopeIds.length} 首中缺词 ${missing} 首`
    : `全库缺词约 ${missing} 首`
  await ElMessageBox.confirm(
    `${scopeText}。将通过外部搜索拉取歌词并写入曲库，每批约 15 首，可随后继续。是否开始？`,
    '匹配歌词',
    { type: 'info', confirmButtonText: '开始匹配' },
  )

  lyricScopeIds.value = scopeIds || null
  lyricReport.matched = []
  lyricReport.failed = []
  lyricReport.remaining = missing
  lyricReportVisible.value = true
  await runMatchLyricsBatches()
}

async function continueMatchLyrics() {
  if (lyricMatching.value || lyricReport.remaining <= 0) return
  await runMatchLyricsBatches()
}

async function runMatchLyricsBatches() {
  lyricMatching.value = true
  lyricProgressText.value = '准备中'
  try {
    // 自动多批，单次会话最多 8 批，避免一次卡太久
    const maxBatches = 8
    for (let i = 0; i < maxBatches; i++) {
      lyricProgressText.value = `第 ${i + 1} 批…`
      const { data } = await http.post(
        '/api/admin/tracks/match-lyrics',
        {
          ids: lyricScopeIds.value || undefined,
          limit: 15,
          concurrency: 2,
        },
        { timeout: 10 * 60 * 1000 },
      )
      const report = data.data as {
        matched?: LyricMatchOk[]
        failed?: LyricMatchFail[]
        remaining?: number
        scanned?: number
      }
      if (report.matched?.length) lyricReport.matched.push(...report.matched)
      if (report.failed?.length) lyricReport.failed.push(...report.failed)
      lyricReport.remaining = Number(report.remaining || 0)

      if (!report.scanned || lyricReport.remaining <= 0) break
      // 本批无成功也无失败推进（异常空扫）则停
      if (!(report.matched?.length || report.failed?.length)) break
    }
    ElMessage.success(
      `匹配完成：成功 ${lyricReport.matched.length}，失败 ${lyricReport.failed.length}`,
    )
    load()
  } finally {
    lyricMatching.value = false
    lyricProgressText.value = ''
  }
}

watch(
  () => route.query.status,
  (v) => {
    const next = String(v || '')
    if (next !== status.value) {
      status.value = next
      page.value = 1
      load()
    }
  },
)

onMounted(load)
</script>

<style scoped>
.filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.batch {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--wy-text-secondary);
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
.meta {
  color: var(--wy-text-muted);
  font-size: 13px;
}
.preview-box {
  text-align: center;
}
.preview-name {
  font-weight: 600;
  font-size: 16px;
}
.preview-artists {
  color: var(--wy-text-secondary);
  margin: 6px 0 14px;
  font-size: 13px;
}
.audio {
  width: 100%;
}
.dup-group {
  border: 1px solid var(--wy-border);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.dup-head {
  font-size: 12px;
  color: var(--wy-text-muted);
  margin-bottom: 8px;
}
.dup-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  font-size: 13px;
}
.dup-row span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lyric-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.lyric-progress {
  font-size: 12px;
  color: var(--wy-text-muted);
}
.lyric-section-title {
  margin: 12px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--wy-text-secondary);
}
</style>
