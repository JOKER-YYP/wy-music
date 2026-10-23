<template>
  <div class="batch-page">
    <div class="page-head">
      <div>
        <h1>批量搜歌</h1>
        <p class="sub">按 Excel 清单批量搜索外部源，勾选后下载到曲库或本地文件夹</p>
      </div>
      <div class="head-actions">
        <el-button round @click="onDownloadTemplate">下载导入模板</el-button>
        <el-button type="danger" round :loading="searching" @click="triggerImport">
          导入 Excel 搜索
        </el-button>
        <input
          ref="fileInputRef"
          class="file-input"
          type="file"
          accept=".xlsx,.xls,.csv"
          @change="onFilePicked"
        />
      </div>
    </div>

    <div v-if="searching" class="progress-card">
      <div class="progress-text">
        正在搜索 {{ progress.done }}/{{ progress.total }}
        <span v-if="progress.current">· {{ progress.current }}</span>
      </div>
      <el-progress
        :percentage="progressPct"
        :stroke-width="10"
        color="#ec4141"
      />
      <el-button size="small" text type="danger" @click="cancelSearch">取消</el-button>
    </div>

    <div v-if="queries.length && !searching" class="summary">
      清单 {{ queries.length }} 条 · 结果 {{ hits.length }} 首
      <span v-if="selectedKeys.length">· 已选 {{ selectedKeys.length }}</span>
    </div>

    <div v-if="hits.length" class="toolbar">
      <el-button
        type="danger"
        round
        size="small"
        :disabled="!selectedKeys.length || downloading"
        :loading="downloading"
        @click="onBatchDownload"
      >
        批量下载（已选 {{ selectedKeys.length }}）
      </el-button>
      <el-button round size="small" :disabled="downloading" @click="clearResults">
        清空结果
      </el-button>
      <span v-if="downloadTip" class="dl-tip">{{ downloadTip }}</span>
    </div>

    <div v-if="failList.length" class="fail-panel">
      <div class="fail-head">
        <span>下载失败 {{ failList.length }} 首</span>
        <el-button size="small" text type="danger" @click="failList = []">关闭</el-button>
      </div>
      <el-table :data="failList" size="small" max-height="220" class="fail-table">
        <el-table-column label="歌曲" min-width="140" show-overflow-tooltip prop="name" />
        <el-table-column label="歌手" min-width="100" show-overflow-tooltip prop="artists" />
        <el-table-column label="失败原因" min-width="220" show-overflow-tooltip prop="error" />
      </el-table>
    </div>

    <el-table
      v-if="hits.length"
      :data="hits"
      row-key="rowKey"
      height="calc(100vh - 280px)"
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="48" />
      <el-table-column label="清单" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">
          <div class="q-name">{{ row.queryName }}</div>
          <div v-if="row.queryArtist" class="q-artist">{{ row.queryArtist }}</div>
        </template>
      </el-table-column>
      <el-table-column label="匹配歌曲" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ row.track.name }}</template>
      </el-table-column>
      <el-table-column label="歌手" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">
          {{ (row.track.artists || []).join(' / ') || '—' }}
        </template>
      </el-table-column>
      <el-table-column label="来源" width="100">
        <template #default="{ row }">
          {{ sourceLabel(row.track) || '—' }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="danger" @click="playOne(row.track)">播放</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty
      v-else-if="!searching"
      :description="
        queries.length
          ? '未匹配到可用结果，可调整清单后重新导入'
          : '先下载模板填写歌名/歌手，再导入 Excel'
      "
      :image-size="80"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { TrackDto } from '@wy-music/shared'
import {
  downloadBatchSearchTemplate,
  parseBatchSearchFile,
  runBatchExternalSearch,
  sourceLabel,
  type BatchQueryProgress,
  type BatchQueryRow,
  type BatchSearchHit,
} from '../services/batchSearchImport'
import {
  downloadTracksToFolder,
  downloadTracksToLibrary,
  pickBatchDownloadMode,
  type BatchDownloadFailItem,
} from '../services/trackDownload'
import { usePlayerStore } from '../stores/player'
import { useUiStore } from '../stores/ui'
import { useUserStore } from '../stores/user'

const player = usePlayerStore()
const user = useUserStore()
const ui = useUiStore()

const fileInputRef = ref<HTMLInputElement | null>(null)
const queries = ref<BatchQueryRow[]>([])
const hits = ref<BatchSearchHit[]>([])
const selectedKeys = ref<string[]>([])
const searching = ref(false)
const downloading = ref(false)
const downloadTip = ref('')
const failList = ref<BatchDownloadFailItem[]>([])
const progress = ref<BatchQueryProgress>({ total: 0, done: 0 })
const cancelFlag = { cancelled: false }

const progressPct = computed(() => {
  if (!progress.value.total) return 0
  return Math.min(100, Math.round((progress.value.done / progress.value.total) * 100))
})

function onDownloadTemplate() {
  downloadBatchSearchTemplate()
  ElMessage.success('模板已下载')
}

function triggerImport() {
  fileInputRef.value?.click()
}

function cancelSearch() {
  cancelFlag.cancelled = true
}

function clearResults() {
  hits.value = []
  queries.value = []
  selectedKeys.value = []
  downloadTip.value = ''
  failList.value = []
}

function onSelectionChange(rows: BatchSearchHit[]) {
  selectedKeys.value = rows.map((r) => r.rowKey)
}

function playOne(track: TrackDto) {
  player.playTrack(track, [track])
}

async function onFilePicked(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  try {
    const rows = await parseBatchSearchFile(file)
    queries.value = rows
    hits.value = []
    selectedKeys.value = []
    failList.value = []
    cancelFlag.cancelled = false
    searching.value = true
    progress.value = { total: rows.length, done: 0 }
    if (rows.length > 50) {
      ElMessage.info(`共 ${rows.length} 条，将逐条搜索，可随时取消`)
    }

    const list = await runBatchExternalSearch(rows, {
      // 每个有结果的源各留 3 首，保证全源都进列表
      perSource: 3,
      pageSize: 20,
      onProgress: (p) => {
        progress.value = { ...p }
      },
      signal: cancelFlag,
    })
    hits.value = list
    if (cancelFlag.cancelled) {
      ElMessage.info(`已取消，当前得到 ${list.length} 首`)
    } else if (!list.length) {
      ElMessage.warning('未搜索到匹配结果')
    } else {
      ElMessage.success(`完成，共 ${list.length} 首候选`)
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '导入失败')
  } finally {
    searching.value = false
  }
}

async function onBatchDownload() {
  const selected = hits.value.filter((h) => selectedKeys.value.includes(h.rowKey))
  if (!selected.length) return

  const tracks = selected.map((h) => h.track)
  // 按 track.id 去重，避免同一首歌下两次
  const seen = new Set<string>()
  const unique: TrackDto[] = []
  for (const t of tracks) {
    if (!t?.id || seen.has(t.id)) continue
    seen.add(t.id)
    unique.push(t)
  }

  const mode = await pickBatchDownloadMode()
  if (!mode) return

  if (mode === 'library' && !user.accessToken) {
    ui.openLogin('login')
    return
  }

  downloading.value = true
  downloadTip.value = ''
  failList.value = []
  try {
    if (mode === 'library') {
      const { ok, fail, failures } = await downloadTracksToLibrary(unique, (done, total, name) => {
        downloadTip.value =
          done >= total ? '' : `曲库下载中 ${done + 1}/${total}${name ? ` · ${name}` : ''}`
      })
      failList.value = failures
      if (fail) ElMessage.warning(`曲库下载完成：成功 ${ok}，失败 ${fail}`)
      else ElMessage.success(`曲库下载完成：成功 ${ok}`)
    } else {
      const { ok, fail, failures, folder } = await downloadTracksToFolder(
        unique,
        (done, total, name) => {
          downloadTip.value =
            done >= total ? '' : `本地下载中 ${done + 1}/${total}${name ? ` · ${name}` : ''}`
        },
      )
      if (!folder) return
      failList.value = failures
      if (fail) ElMessage.warning(`已保存到文件夹：成功 ${ok}，失败 ${fail}`)
      else ElMessage.success(`已保存到文件夹：成功 ${ok}`)
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '批量下载失败')
  } finally {
    downloading.value = false
    downloadTip.value = ''
  }
}
</script>

<style scoped lang="scss">
.batch-page {
  padding: 8px 4px 24px;
  min-height: 100%;
}
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    color: #222;
  }
}
.sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: #888;
}
.head-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
}
.file-input {
  display: none;
}
.progress-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  margin-bottom: 14px;
  border-radius: 10px;
  background: #fff5f5;
  border: 1px solid rgba(236, 65, 65, 0.15);
  .el-progress {
    flex: 1;
  }
}
.progress-text {
  font-size: 13px;
  color: #666;
  min-width: 180px;
}
.summary {
  font-size: 13px;
  color: #666;
  margin-bottom: 10px;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.dl-tip {
  font-size: 12px;
  color: #999;
}
.fail-panel {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff7f7;
  border: 1px solid rgba(236, 65, 65, 0.2);
}
.fail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #c45656;
}
.fail-table {
  width: 100%;
  :deep(.el-table__cell) {
    color: #666;
  }
}
.q-name {
  font-size: 13px;
  color: #333;
}
.q-artist {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}
</style>
