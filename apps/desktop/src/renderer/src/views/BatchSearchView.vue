<template>
  <div class="batch-page">
    <div class="page-head">
      <div>
        <h1>批量搜歌</h1>
        <p class="sub">
          按 Excel 清单批量搜索；请填写「歌手」以便完全匹配。可勾选「仅完全匹配」并同时点选多个来源
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
      <span v-if="exactHitCount">· 完全匹配 {{ exactHitCount }}</span>
      <span v-if="unmatchedQueries.length">· 未完全匹配 {{ unmatchedQueries.length }}</span>
      <span v-if="selectedCount">· 已选 {{ selectedCount }}</span>
    </div>

    <div v-if="sourceTags.length" class="source-panel">
      <div class="select-mode">
        <span class="mode-label">勾选方式</span>
        <el-radio-group v-model="selectMode" size="small" :disabled="downloading">
          <el-radio-button value="all">来源全部</el-radio-button>
          <el-radio-button value="first">每首歌一首</el-radio-button>
        </el-radio-group>
        <label class="exact-check" :class="{ disabled: downloading }">
          <input v-model="exactOnly" type="checkbox" :disabled="downloading" />
          仅完全匹配
        </label>
      </div>
      <p class="mode-hint">
        「每首歌一首」：每条清单只勾一首；有歌词的完全匹配优先，其次按点选来源顺序跨源兜底（如先源2后源3）。再点可取消该源。
      </p>
      <div class="source-tags">
        <button
          type="button"
          class="source-tag"
          :class="{ active: !filterSource && !pickedSources.length }"
          :disabled="downloading"
          @click="onSelectAllSources"
        >
          全部 {{ exactOnly ? exactHitCount : hits.length }}
        </button>
        <button
          v-for="t in sourceTags"
          :key="t.source"
          type="button"
          class="source-tag"
          :class="{
            active: filterSource === t.source,
            selected: pickedSourceSet.has(t.source),
          }"
          :disabled="downloading"
          :title="
            selectMode === 'first'
              ? `优先级；点选切换「${t.label}」`
              : `点选叠加「${t.label}」全部结果`
          "
          @click="onSourceTagClick(t.source)"
        >
          <span v-if="selectMode === 'first' && pickedSourceSet.has(t.source)" class="prio">
            {{ pickedSources.indexOf(t.source) + 1 }}
          </span>
          {{ t.label }} {{ exactOnly ? t.exactCount : t.count }}
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
        {{
          exactOnly && selectMode === 'first'
            ? '每首歌勾一首'
            : exactOnly
              ? '全选完全匹配'
              : '全选全部'
        }}
      </el-button>
      <el-button round size="small" :disabled="downloading || !selectedCount" @click="clearSelection">
        取消勾选
      </el-button>
      <el-button round size="small" :disabled="downloading" @click="clearResults">
        清空结果
      </el-button>
      <span v-if="downloadTip" class="dl-tip">{{ downloadTip }}</span>
    </div>

    <div v-if="unmatchedQueries.length" class="fail-panel unmatched-panel">
      <div class="fail-head">
        <span>未完全匹配 {{ unmatchedQueries.length }} 首（歌名或歌手不一致 / 无结果）</span>
        <el-button size="small" text type="danger" @click="hideUnmatched = !hideUnmatched">
          {{ hideUnmatched ? '展开' : '收起' }}
        </el-button>
      </div>
      <el-table
        v-if="!hideUnmatched"
        :data="unmatchedQueries"
        size="small"
        max-height="220"
        class="fail-table"
      >
        <el-table-column label="#" width="56" prop="index" />
        <el-table-column label="清单歌名" min-width="140" show-overflow-tooltip prop="name" />
        <el-table-column label="清单歌手" min-width="100" show-overflow-tooltip prop="artist" />
        <el-table-column label="说明" min-width="160" show-overflow-tooltip prop="reason" />
      </el-table>
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
      <el-table-column label="匹配" width="120">
        <template #default="{ row }">
          <span :class="['match-tag', row.exactMatch ? 'exact' : 'partial']">
            {{ row.exactMatch ? '完全' : '部分' }}
          </span>
          <span v-if="trackHasLyric(row.track)" class="match-tag lyric">有词</span>
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
  trackHasLyric,
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
/** 当前表格筛选的来源；null 表示全部（仅影响列表展示） */
const filterSource = ref<string | null>(null)
/** 已点选来源（顺序 = 跨源兜底优先级） */
const pickedSources = ref<string[]>([])
/** 标签勾选方式：全部 / 每首歌一首（跨源按优先级） */
const selectMode = ref<'all' | 'first'>('first')
/** 仅勾选歌名+歌手完全一致的结果 */
const exactOnly = ref(true)
const hideUnmatched = ref(false)
/** 同步表格勾选时忽略 selection-change，避免覆盖跨页选中 */
let syncingSelection = false

const progressPct = computed(() => {
  if (!progress.value.total) return 0
  return Math.min(100, Math.round((progress.value.done / progress.value.total) * 100))
})

const selectedCount = computed(() => selectedKeySet.value.size)

const exactHitCount = computed(() => hits.value.filter((h) => h.exactMatch).length)

const pickedSourceSet = computed(() => new Set(pickedSources.value))

/** 跨源优先级：点选顺序优先；未点选时用标签默认顺序 */
const sourcePriority = computed(() => {
  if (pickedSources.value.length) return [...pickedSources.value]
  return sourceTags.value.map((t) => t.source)
})

const sourceTags = computed(() => {
  const map = new Map<string, { count: number; exactCount: number }>()
  for (const h of hits.value) {
    const src = String(h.track.source || '')
    if (!src || src === 'local') continue
    const cur = map.get(src) || { count: 0, exactCount: 0 }
    cur.count += 1
    if (h.exactMatch) cur.exactCount += 1
    map.set(src, cur)
  }
  const ordered: { source: string; label: string; count: number; exactCount: number }[] = []
  for (const s of MUSIC_SOURCES) {
    const cur = map.get(s)
    if (!cur) continue
    ordered.push({
      source: s,
      label: MUSIC_SOURCE_LABEL[s as MusicSource] || s,
      count: cur.count,
      exactCount: cur.exactCount,
    })
    map.delete(s)
  }
  for (const [source, cur] of map) {
    ordered.push({ source, label: source, count: cur.count, exactCount: cur.exactCount })
  }
  return ordered
})

/** 清单中没有任何完全匹配结果的条目 */
const unmatchedQueries = computed(() => {
  if (!queries.value.length) return []
  const exactQuery = new Set<number>()
  for (const h of hits.value) {
    if (h.exactMatch) exactQuery.add(h.queryIndex)
  }
  const out: { index: number; name: string; artist: string; reason: string }[] = []
  for (const q of queries.value) {
    if (exactQuery.has(q.index)) continue
    const hasAny = hits.value.some((h) => h.queryIndex === q.index)
    out.push({
      index: q.index + 1,
      name: q.name,
      artist: q.artist || '—',
      reason: !q.artist.trim()
        ? '清单未填歌手'
        : hasAny
          ? '有候选但无歌名+歌手完全一致'
          : '无搜索结果',
    })
  }
  return out
})

const filteredHits = computed(() => {
  let list = hits.value
  if (filterSource.value) {
    list = list.filter((h) => String(h.track.source || '') === filterSource.value)
  }
  if (exactOnly.value) {
    list = list.filter((h) => h.exactMatch)
  }
  return list
})

const pagedHits = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredHits.value.slice(start, start + pageSize.value)
})

function isBetterHit(a: BatchSearchHit, b: BatchSearchHit): boolean {
  const aLyric = trackHasLyric(a.track)
  const bLyric = trackHasLyric(b.track)
  if (aLyric !== bLyric) return aLyric
  return a.score > b.score
}

/**
 * 收集勾选 key。
 * - all：范围内全部（可仅完全匹配）
 * - first：每条清单只一首；优先有歌词，再按 sources 优先级跨源兜底
 */
function collectKeysForSources(
  sources: string[] | null,
  mode: 'all' | 'first',
  exact: boolean,
): Set<string> {
  let scoped = hits.value
  if (exact) scoped = scoped.filter((h) => h.exactMatch)

  if (mode === 'all') {
    if (sources?.length) {
      const set = new Set(sources)
      scoped = scoped.filter((h) => set.has(String(h.track.source || '')))
    }
    return new Set(scoped.map((h) => h.rowKey))
  }

  const priority =
    sources?.length
      ? sources
      : sourcePriority.value.length
        ? sourcePriority.value
        : ([...new Set(scoped.map((h) => String(h.track.source || '')).filter(Boolean))] as string[])

  const allowed = sources?.length ? new Set(sources) : null
  if (allowed) {
    scoped = scoped.filter((h) => allowed.has(String(h.track.source || '')))
  }

  // queryIndex -> source -> best hit（同源内也优先有歌词）
  const byQuery = new Map<number, Map<string, BatchSearchHit>>()
  for (const h of scoped) {
    const src = String(h.track.source || '')
    if (!src) continue
    let bySrc = byQuery.get(h.queryIndex)
    if (!bySrc) {
      bySrc = new Map()
      byQuery.set(h.queryIndex, bySrc)
    }
    const prev = bySrc.get(src)
    if (!prev || isBetterHit(h, prev)) bySrc.set(src, h)
  }

  const keys = new Set<string>()
  for (const bySrc of byQuery.values()) {
    let chosen: BatchSearchHit | undefined
    // 1) 优先：有歌词的完全匹配，按源优先级
    for (const src of priority) {
      const hit = bySrc.get(src)
      if (hit && trackHasLyric(hit.track)) {
        chosen = hit
        break
      }
    }
    // 2) 否则：按源优先级取第一首可用
    if (!chosen) {
      for (const src of priority) {
        const hit = bySrc.get(src)
        if (hit) {
          chosen = hit
          break
        }
      }
    }
    if (!chosen) {
      for (const hit of bySrc.values()) {
        if (!chosen || isBetterHit(hit, chosen)) chosen = hit
      }
    }
    if (chosen) keys.add(chosen.rowKey)
  }
  return keys
}

function applyPickedSelection(tip?: string) {
  const sources = pickedSources.value.length ? [...pickedSources.value] : null
  const next = collectKeysForSources(sources, selectMode.value, exactOnly.value)
  selectedKeySet.value = next
  void restorePageSelection()
  if (tip) ElMessage.success(tip)
}

function sourceLabelList(sources: string[]) {
  return sources.map((s) => MUSIC_SOURCE_LABEL[s as MusicSource] || s).join(' → ')
}

/** 点选「全部」：清空优先级点选，按默认源顺序每首歌一首 / 或全选 */
function onSelectAllSources() {
  filterSource.value = null
  pickedSources.value = []
  page.value = 1
  const next = collectKeysForSources(null, selectMode.value, exactOnly.value)
  selectedKeySet.value = next
  void restorePageSelection()
  const tip =
    selectMode.value === 'first'
      ? exactOnly.value
        ? '已按默认源顺序，每首歌勾一首完全匹配'
        : '已按默认源顺序，每首歌勾一首'
      : exactOnly.value
        ? '已勾选全部完全匹配'
        : '已勾选全部结果'
  ElMessage.success(`${tip}：${next.size} 首`)
}

/** 点击来源：切换进优先级列表；「每首歌一首」时按点选顺序跨源兜底 */
function onSourceTagClick(source: string) {
  filterSource.value = source
  page.value = 1

  const nextPicked = [...pickedSources.value]
  const idx = nextPicked.indexOf(source)
  if (idx >= 0) nextPicked.splice(idx, 1)
  else nextPicked.push(source)
  pickedSources.value = nextPicked

  if (!nextPicked.length) {
    selectedKeySet.value = new Set()
    void restorePageSelection()
    ElMessage.info('已取消来源勾选')
    return
  }

  const next = collectKeysForSources(nextPicked, selectMode.value, exactOnly.value)
  selectedKeySet.value = next
  void restorePageSelection()

  const label = MUSIC_SOURCE_LABEL[source as MusicSource] || source
  if (selectMode.value === 'first') {
    ElMessage.success(
      `优先级 ${sourceLabelList(nextPicked)} · 每首歌一首${exactOnly.value ? '完全匹配' : ''} ${next.size} 首`,
    )
  } else {
    ElMessage.success(
      (idx >= 0 ? `已取消「${label}」· ` : `已叠加「${label}」· `) +
        `当前 ${sourceLabelList(nextPicked)} · ${exactOnly.value ? '完全匹配' : '结果'} ${next.size} 首`,
    )
  }
}

watch([selectMode, exactOnly], () => {
  if (!hits.value.length) return
  if (pickedSources.value.length) {
    applyPickedSelection()
  } else {
    selectedKeySet.value = collectKeysForSources(null, selectMode.value, exactOnly.value)
    void restorePageSelection()
  }
  page.value = 1
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
  selectedKeySet.value = new Set()
  downloadTip.value = ''
  failList.value = []
  page.value = 1
  filterSource.value = null
  pickedSources.value = []
  selectMode.value = 'first'
  exactOnly.value = true
  hideUnmatched.value = false
}

function clearSelection() {
  selectedKeySet.value = new Set()
  pickedSources.value = []
  void restorePageSelection()
}

function selectCurrentPage() {
  const next = new Set(selectedKeySet.value)
  for (const row of pagedHits.value) next.add(row.rowKey)
  selectedKeySet.value = next
  void restorePageSelection()
}

function selectAllResults() {
  // 工具栏「全选」：完全匹配 + 每首歌一首时走跨源兜底，避免同一首勾多个源
  const mode = exactOnly.value ? selectMode.value : 'all'
  selectedKeySet.value = collectKeysForSources(null, mode, exactOnly.value)
  pickedSources.value = []
  filterSource.value = null
  void restorePageSelection()
  ElMessage.success(
    exactOnly.value && selectMode.value === 'first'
      ? `已按源顺序每首歌勾一首完全匹配：${selectedKeySet.value.size} 首`
      : exactOnly.value
        ? `已全选完全匹配 ${selectedKeySet.value.size} 首`
        : `已全选 ${selectedKeySet.value.size} 首`,
  )
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

watch([page, pageSize, filterSource, exactOnly], () => {
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
    pickedSources.value = []
    hideUnmatched.value = false
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
    // 默认：仅完全匹配 + 每首歌一首（跨源按默认顺序兜底）
    if (list.length && exactOnly.value && selectMode.value === 'first') {
      selectedKeySet.value = collectKeysForSources(null, 'first', true)
      void restorePageSelection()
    }
    if (cancelFlag.cancelled) {
      ElMessage.info(`已取消，当前得到 ${list.length} 首`)
    } else if (!list.length) {
      ElMessage.warning('未搜索到匹配结果')
    } else if (exactOnly.value && selectMode.value === 'first') {
      ElMessage.success(
        `完成 ${list.length} 首候选 · 已按源顺序勾选完全匹配 ${selectedKeySet.value.size} 首`,
      )
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
  color: var(--wy-text-muted);
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
  background: var(--wy-brand-soft);
  border: 1px solid rgba(236, 65, 65, 0.15);
  .el-progress {
    flex: 1;
  }
}
.progress-text {
  font-size: 13px;
  color: var(--wy-text-secondary);
  min-width: 180px;
}
.summary {
  font-size: 13px;
  color: var(--wy-text-secondary);
  margin-bottom: 10px;
}
.source-panel {
  margin-bottom: 10px;
}
.select-mode {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.mode-label {
  font-size: 12px;
  color: var(--wy-text-muted);
  flex-shrink: 0;
}
.exact-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 4px;
  font-size: 12px;
  color: var(--wy-text);
  cursor: pointer;
  user-select: none;
  &.disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  input {
    accent-color: var(--wy-brand);
  }
}
.mode-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--wy-text-muted);
}
.unmatched-panel {
  border-color: rgba(236, 65, 65, 0.28);
}
.match-tag {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1;
  margin-right: 4px;
  &.exact {
    color: var(--wy-brand);
    background: var(--wy-brand-soft);
  }
  &.partial {
    color: var(--wy-text-muted);
    background: var(--wy-surface-muted);
  }
  &.lyric {
    color: #2f7d4a;
    background: rgba(47, 125, 74, 0.1);
  }
}
.source-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.source-tag {
  border: 1px solid var(--wy-border);
  background: var(--wy-surface);
  color: var(--wy-text-secondary);
  font-size: 12px;
  line-height: 1;
  height: 28px;
  padding: 0 12px;
  border-radius: 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
  .prio {
    display: inline-grid;
    place-items: center;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    border-radius: 7px;
    font-size: 10px;
    font-weight: 700;
    background: rgba(236, 65, 65, 0.15);
    color: var(--wy-brand);
  }
  &:hover:not(:disabled) {
    border-color: var(--wy-brand);
    color: var(--wy-brand);
    background: var(--wy-brand-soft);
  }
  &.active {
    border-color: var(--wy-brand);
    background: var(--wy-brand);
    color: var(--wy-text-on-brand);
    .prio {
      background: rgba(255, 255, 255, 0.25);
      color: #fff;
    }
  }
  &.selected:not(.active) {
    border-color: rgba(236, 65, 65, 0.35);
    background: var(--wy-brand-soft);
    color: var(--wy-brand);
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
  color: var(--wy-text-muted);
}
.fail-panel {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--wy-brand-soft);
  border: 1px solid rgba(236, 65, 65, 0.2);
}
.fail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--wy-brand-hover);
}
.fail-table {
  width: 100%;
  :deep(.el-table__cell) {
    color: var(--wy-text-secondary);
  }
}
.pager {
  display: flex;
  justify-content: flex-end;
  padding: 12px 0 4px;
}
.q-name {
  font-size: 13px;
  color: var(--wy-text);
}
.q-artist {
  font-size: 12px;
  color: var(--wy-text-muted);
  margin-top: 2px;
}
</style>
