<template>
  <div class="batch-page">
    <div class="page-head">
      <div>
        <h1>批量搜歌</h1>
        <p class="sub">
          按 Excel 清单批量搜索；请尽量填写「歌手」列以优先命中原唱，翻唱/伴奏会降权
        </p>
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

    <div v-if="queries.length && (hits.length || searching)" class="summary">
      清单 {{ queries.length }} 条 · 结果 {{ hits.length }} 首
      <span v-if="selectedCount">· 已选 {{ selectedCount }}</span>
    </div>

    <div v-if="sourceTags.length" class="source-panel">
      <div class="select-mode">
        <span class="mode-label">勾选方式</span>
        <el-radio-group v-model="selectMode" size="small" :disabled="downloading">
          <el-radio-button value="all">当前标签全部</el-radio-button>
          <el-radio-button value="first">每首歌第一条</el-radio-button>
        </el-radio-group>
      </div>
      <div class="source-tags">
        <button
          type="button"
          class="source-tag"
          :class="{ active: !filterSource }"
          :disabled="downloading"
          @click="onSourceTagClick(null)"
        >
          全部 {{ hits.length }}
        </button>
        <button
          v-for="t in sourceTags"
          :key="t.source"
          type="button"
          class="source-tag"
          :class="{ active: filterSource === t.source, selected: isSourceFullySelected(t.source) }"
          :disabled="downloading"
          :title="
            selectMode === 'first'
              ? `筛选「${t.label}」并勾选每首歌第一条`
              : `筛选并勾选「${t.label}」全部结果`
          "
          @click="onSourceTagClick(t.source)"
        >
          {{ t.label }} {{ t.count }}
        </button>
      </div>
    </div>

    <div v-if="hits.length" class="toolbar">
      <el-button
        type="danger"
        round
        size="small"
        :disabled="!selectedCount || downloading"
        :loading="downloading"
        @click="onBatchDownload"
      >
        批量下载（已选 {{ selectedCount }}）
      </el-button>
      <el-button round size="small" :disabled="downloading" @click="selectCurrentPage">
        全选本页
      </el-button>
      <el-button round size="small" :disabled="downloading" @click="selectAllResults">
        全选全部
      </el-button>
      <el-button round size="small" :disabled="downloading || !selectedCount" @click="clearSelection">
        取消勾选
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
      ref="tableRef"
      :data="pagedHits"
      row-key="rowKey"
      height="calc(100vh - 320px)"
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

    <div v-if="hits.length" class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="filteredHits.length"
        :page-sizes="[50, 100, 200]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        small
      />
    </div>

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
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { MusicSource, TrackDto } from '@wy-music/shared'
import { MUSIC_SOURCES, MUSIC_SOURCE_LABEL } from '@wy-music/shared'
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
const tableRef = ref<{
  clearSelection: () => void
  toggleRowSelection: (row: BatchSearchHit, selected?: boolean) => void
} | null>(null)
const queries = ref<BatchQueryRow[]>([])
/** 大数据量用 shallowRef，避免深度响应拖垮页面 */
const hits = shallowRef<BatchSearchHit[]>([])
const selectedKeySet = ref<Set<string>>(new Set())
const searching = ref(false)
const downloading = ref(false)
const downloadTip = ref('')
const failList = ref<BatchDownloadFailItem[]>([])
const progress = ref<BatchQueryProgress>({ total: 0, done: 0 })
const cancelFlag = { cancelled: false }
const page = ref(1)
const pageSize = ref(100)
/** 当前筛选的来源；null 表示全部 */
const filterSource = ref<string | null>(null)
/** 标签勾选方式：全部 / 每首歌第一条 */
const selectMode = ref<'all' | 'first'>('all')
/** 同步表格勾选时忽略 selection-change，避免覆盖跨页选中 */
let syncingSelection = false

const progressPct = computed(() => {
  if (!progress.value.total) return 0
  return Math.min(100, Math.round((progress.value.done / progress.value.total) * 100))
})

const selectedCount = computed(() => selectedKeySet.value.size)

const sourceTags = computed(() => {
  const map = new Map<string, number>()
  for (const h of hits.value) {
    const src = String(h.track.source || '')
    if (!src || src === 'local') continue
    map.set(src, (map.get(src) || 0) + 1)
  }
  const ordered: { source: string; label: string; count: number }[] = []
  for (const s of MUSIC_SOURCES) {
    const count = map.get(s)
    if (!count) continue
    ordered.push({
      source: s,
      label: MUSIC_SOURCE_LABEL[s as MusicSource] || s,
      count,
    })
    map.delete(s)
  }
  // 未在 MUSIC_SOURCES 中的兜底
  for (const [source, count] of map) {
    ordered.push({ source, label: source, count })
  }
  return ordered
})

const filteredHits = computed(() => {
  if (!filterSource.value) return hits.value
  return hits.value.filter((h) => String(h.track.source || '') === filterSource.value)
})

const pagedHits = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredHits.value.slice(start, start + pageSize.value)
})

function isSourceFullySelected(source: string) {
  const selected = selectedKeySet.value
  let any = false
  for (const h of hits.value) {
    if (String(h.track.source || '') !== source) continue
    any = true
    if (!selected.has(h.rowKey)) return false
  }
  return any
}

function collectKeysForTag(source: string | null, mode: 'all' | 'first'): Set<string> {
  const scoped = source
    ? hits.value.filter((h) => String(h.track.source || '') === source)
    : hits.value

  if (mode === 'all') {
    return new Set(scoped.map((h) => h.rowKey))
  }

  // 每首歌（清单行）在该范围内取匹配分最高的一条
  const bestByQuery = new Map<number, BatchSearchHit>()
  for (const h of scoped) {
    const prev = bestByQuery.get(h.queryIndex)
    if (!prev || h.score > prev.score) bestByQuery.set(h.queryIndex, h)
  }
  return new Set([...bestByQuery.values()].map((h) => h.rowKey))
}

/** 点击来源标签：筛选，并按勾选方式一键勾选 */
function onSourceTagClick(source: string | null) {
  filterSource.value = source
  page.value = 1

  const next = collectKeysForTag(source, selectMode.value)
  selectedKeySet.value = next
  void restorePageSelection()

  const label = source
    ? MUSIC_SOURCE_LABEL[source as MusicSource] || source
    : '全部'
  const modeTip = selectMode.value === 'first' ? '每首歌第一条' : '全部结果'
  ElMessage.success(`「${label}」已勾选${modeTip}：${next.size} 首`)
}

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
  selectedKeySet.value = new Set()
  downloadTip.value = ''
  failList.value = []
  page.value = 1
  filterSource.value = null
  selectMode.value = 'all'
}

function clearSelection() {
  selectedKeySet.value = new Set()
  void restorePageSelection()
}

function selectCurrentPage() {
  const next = new Set(selectedKeySet.value)
  for (const row of pagedHits.value) next.add(row.rowKey)
  selectedKeySet.value = next
  void restorePageSelection()
}

function selectAllResults() {
  selectedKeySet.value = new Set(hits.value.map((h) => h.rowKey))
  void restorePageSelection()
  ElMessage.success(`已全选 ${selectedKeySet.value.size} 首`)
}

function onSelectionChange(rows: BatchSearchHit[]) {
  if (syncingSelection) return
  const pageKeys = new Set(pagedHits.value.map((h) => h.rowKey))
  const next = new Set(selectedKeySet.value)
  for (const k of pageKeys) next.delete(k)
  for (const r of rows) next.add(r.rowKey)
  selectedKeySet.value = next
}

async function restorePageSelection() {
  await nextTick()
  const table = tableRef.value
  if (!table) return
  syncingSelection = true
  table.clearSelection()
  const selected = selectedKeySet.value
  for (const row of pagedHits.value) {
    if (selected.has(row.rowKey)) table.toggleRowSelection(row, true)
  }
  syncingSelection = false
}

watch([page, pageSize, filterSource], () => {
  void restorePageSelection()
})

function playOne(track: TrackDto) {
  player.playTrack(track, [track])
}

let pendingHits: BatchSearchHit[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function flushPendingHits() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (!pendingHits.length) return
  const chunk = pendingHits
  pendingHits = []
  hits.value = hits.value.concat(chunk)
}

function queueHits(chunk: BatchSearchHit[]) {
  if (!chunk.length) return
  pendingHits.push(...chunk)
  if (flushTimer) return
  // 节流追加，避免每条查询都整表拷贝导致卡顿
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushPendingHits()
  }, 400)
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
    pendingHits = []
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    selectedKeySet.value = new Set()
    failList.value = []
    page.value = 1
    filterSource.value = null
    cancelFlag.cancelled = false
    searching.value = true
    progress.value = { total: rows.length, done: 0 }
    if (rows.length > 50) {
      ElMessage.info(`共 ${rows.length} 条，将逐条搜索，可随时取消`)
    }

    const list = await runBatchExternalSearch(rows, {
      perSource: 3,
      pageSize: 20,
      onProgress: (p) => {
        progress.value = { ...p }
      },
      onHits: (chunk) => {
        queueHits(chunk)
      },
      signal: cancelFlag,
    })
    flushPendingHits()
    // 以最终结果为准（避免并发拼接顺序问题导致遗漏）
    hits.value = list
    if (cancelFlag.cancelled) {
      ElMessage.info(`已取消，当前得到 ${list.length} 首`)
    } else if (!list.length) {
      ElMessage.warning('未搜索到匹配结果')
    } else {
      ElMessage.success(`完成，共 ${list.length} 首候选（分页浏览）`)
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '导入失败')
  } finally {
    searching.value = false
  }
}

async function onBatchDownload() {
  if (!selectedKeySet.value.size) return
  const selected = hits.value.filter((h) => selectedKeySet.value.has(h.rowKey))
  if (!selected.length) return

  const tracks = selected.map((h) => h.track)
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
.source-panel {
  margin-bottom: 10px;
}
.select-mode {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.mode-label {
  font-size: 12px;
  color: #888;
  flex-shrink: 0;
}
.source-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.source-tag {
  border: 1px solid #e5e5e5;
  background: #fafafa;
  color: #666;
  font-size: 12px;
  line-height: 1;
  height: 28px;
  padding: 0 12px;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.15s;
  &:hover:not(:disabled) {
    border-color: #ec4141;
    color: #ec4141;
  }
  &.active {
    border-color: #ec4141;
    background: #ec4141;
    color: #fff;
  }
  &.selected:not(.active) {
    border-color: #f5a5a5;
    background: #fff5f5;
    color: #c45656;
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
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
.pager {
  display: flex;
  justify-content: flex-end;
  padding: 12px 0 4px;
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
