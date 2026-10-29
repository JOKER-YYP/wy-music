<template>
  <Teleport to="body">
    <Transition name="import-fade">
      <div v-if="visible" ref="rootRef" class="import-root">
        <div class="import-mask" @click.self="onMaskClick">
          <div
            class="import-dialog"
            :class="{ wide: step === 'pick' || step === 'searching' || step === 'importing' }"
            role="dialog"
            aria-label="歌单导入"
          >
            <header class="import-head">
              <h3>
                {{
                  step === 'pick'
                    ? '勾选搜索结果'
                    : step === 'searching'
                      ? '搜索缺失歌曲'
                      : step === 'importing'
                        ? '下载入库'
                        : '歌单导入'
                }}
              </h3>
              <button class="close-btn" type="button" :disabled="hardBusy" @click="close">
                <el-icon :size="18"><Close /></el-icon>
              </button>
            </header>

            <div class="import-body">
              <!-- 输入链接 -->
              <template v-if="step === 'input'">
                <div v-for="(link, idx) in links" :key="idx" class="link-row">
                  <span class="link-label">链接{{ idx + 1 }}</span>
                  <el-input
                    v-model="links[idx]"
                    clearable
                    placeholder="粘贴歌单链接（网易云 / QQ 音乐）"
                    @keydown.enter.prevent="onPreview"
                  />
                  <button
                    v-if="links.length > 1"
                    class="link-remove"
                    type="button"
                    title="移除"
                    @click="removeLink(idx)"
                  >
                    移除
                  </button>
                  <button
                    v-if="idx === links.length - 1 && links.length < 10"
                    class="link-add"
                    type="button"
                    @click="addLink"
                  >
                    添加
                  </button>
                </div>
                <p class="hint">
                  * 最多 10 个链接；先匹配公共曲库。缺失曲可多源搜索后勾选再下载入库并加入歌单
                </p>
                <el-button
                  class="start-btn"
                  type="danger"
                  round
                  :loading="loading"
                  @click="onPreview"
                >
                  开始导入
                </el-button>
              </template>

              <!-- 预览匹配 -->
              <template v-else-if="step === 'preview'">
                <div v-loading="loading" class="preview-wrap">
                  <div v-for="(src, i) in sources" :key="i" class="source-card">
                    <div class="source-head">
                      <div class="source-title">
                        <span class="platform">{{ platformLabel(src.platform) }}</span>
                        <strong>{{ src.ok ? src.name : '解析失败' }}</strong>
                      </div>
                      <div v-if="src.ok" class="source-stats">
                        共 {{ src.total }} 首 ·
                        <span class="ok-text">可导入 {{ src.matchedCount }}</span>
                        ·
                        <span class="miss-text">缺失 {{ src.missingCount }}</span>
                      </div>
                      <div v-else class="source-error">{{ src.error }}</div>
                    </div>
                    <div class="source-url" :title="src.url">{{ src.url }}</div>
                    <template v-if="src.ok">
                      <el-collapse>
                        <el-collapse-item
                          v-if="src.matched.length"
                          :title="`可导入（${src.matched.length}）`"
                          name="matched"
                        >
                          <ul class="song-list">
                            <li v-for="(s, j) in src.matched" :key="`m-${j}`">
                              <span class="song-name">{{ s.name }}</span>
                              <span class="song-artist">{{ (s.artists || []).join(' / ') }}</span>
                              <span class="match-tip">→ {{ s.trackName }}</span>
                            </li>
                          </ul>
                        </el-collapse-item>
                        <el-collapse-item
                          v-if="src.missing.length"
                          :title="`曲库缺失（${src.missing.length}）`"
                          name="missing"
                        >
                          <ul class="song-list miss">
                            <li v-for="(s, j) in src.missing" :key="`x-${j}`">
                              <span class="song-name">{{ s.name }}</span>
                              <span class="song-artist">{{ (s.artists || []).join(' / ') }}</span>
                            </li>
                          </ul>
                        </el-collapse-item>
                      </el-collapse>
                    </template>
                  </div>
                </div>

                <div class="preview-actions">
                  <div class="public-opt">
                    <el-switch v-model="isPublic" />
                    <span class="public-tip">导入为公开歌单（可出现在推荐 / 广场）</span>
                  </div>
                  <p v-if="totalMissing" class="fill-hint">
                    有 {{ totalMissing }} 首未匹配；确认后可多源搜索并勾选下载
                  </p>
                  <div class="action-btns">
                    <el-button :disabled="busy" @click="backToInput">返回修改</el-button>
                    <el-button
                      type="danger"
                      :loading="confirming"
                      :disabled="!canConfirm"
                      @click="onConfirm"
                    >
                      确认导入
                      <template v-if="totalMatched">（已匹配 {{ totalMatched }}）</template>
                      <template v-if="totalMissing"> · 缺失 {{ totalMissing }}</template>
                    </el-button>
                  </div>
                </div>
              </template>

              <!-- 搜索中 -->
              <template v-else-if="step === 'searching'">
                <div class="fill-panel">
                  <p class="fill-title">正在多源搜索缺失歌曲</p>
                  <el-progress
                    :percentage="searchPercent"
                    :stroke-width="10"
                    color="var(--wy-brand)"
                  />
                  <p class="fill-text">{{ searchTip }}</p>
                  <el-button size="small" text type="danger" @click="cancelSearch">取消搜索</el-button>
                </div>
              </template>

              <!-- 勾选结果（对齐批量搜歌） -->
              <template v-else-if="step === 'pick'">
                <div class="pick-summary">
                  缺失清单 {{ fillQueries.length }} 条 · 结果 {{ fillHits.length }} 首
                  <span>· 完全匹配 {{ exactHitCount }}</span>
                  <span v-if="exactOnly">· 当前显示 {{ displayHits.length }}</span>
                  <span v-if="selectedCount">· 已选 {{ selectedCount }}</span>
                </div>

                <div v-if="sourceTags.length" class="source-panel">
                  <div class="select-mode">
                    <span class="mode-label">勾选方式</span>
                    <el-radio-group v-model="selectMode" size="small" :disabled="importing">
                      <el-radio-button value="all">来源全部</el-radio-button>
                      <el-radio-button value="first">每首歌一首</el-radio-button>
                    </el-radio-group>
                    <label class="exact-check" :class="{ disabled: importing }">
                      <input v-model="exactOnly" type="checkbox" :disabled="importing" />
                      仅完全匹配
                    </label>
                  </div>
                  <p class="mode-hint">
                    「每首歌一首」按点选来源顺序跨源兜底；点选序号即优先级（含下歌吧，入库时本机经网盘下载再上传）
                  </p>
                  <div class="source-tags">
                    <button
                      type="button"
                      class="source-tag"
                      :class="{ active: !filterSource && !pickedSources.length }"
                      :disabled="importing"
                      @click="onSelectAllSources"
                    >
                      全部 {{ exactOnly ? exactHitCount : fillHits.length }}
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
                      :disabled="importing"
                      @click="onSourceTagClick(t.source)"
                    >
                      <span
                        v-if="selectMode === 'first' && pickedSourceSet.has(t.source)"
                        class="prio"
                      >
                        {{ pickedSources.indexOf(t.source) + 1 }}
                      </span>
                      {{ t.label }} {{ exactOnly ? t.exactCount : t.count }}
                    </button>
                  </div>
                </div>

                <div class="pick-toolbar">
                  <el-button
                    type="danger"
                    round
                    size="small"
                    :disabled="!selectedCount || importing"
                    :loading="importing"
                    @click="onDownloadSelected"
                  >
                    下载已选（{{ selectedCount }}）
                  </el-button>
                  <el-button round size="small" :disabled="importing" @click="selectAllResults">
                    {{
                      exactOnly && selectMode === 'first'
                        ? '每首歌勾一首'
                        : exactOnly
                          ? '全选完全匹配'
                          : '全选全部'
                    }}
                  </el-button>
                  <el-button
                    round
                    size="small"
                    :disabled="importing || !selectedCount"
                    @click="clearSelection"
                  >
                    取消勾选
                  </el-button>
                  <el-button round size="small" :disabled="importing" @click="finishWithoutDownload">
                    跳过下载，完成导入
                  </el-button>
                </div>

                <el-table
                  ref="tableRef"
                  :data="displayHits"
                  size="small"
                  max-height="360"
                  row-key="rowKey"
                  class="pick-table"
                  @selection-change="onTableSelectionChange"
                >
                  <el-table-column type="selection" width="42" :selectable="() => !importing" />
                  <el-table-column label="清单" min-width="120" show-overflow-tooltip>
                    <template #default="{ row }">
                      <div class="q-name">{{ row.queryName }}</div>
                      <div class="q-artist">{{ row.queryArtist || '—' }}</div>
                    </template>
                  </el-table-column>
                  <el-table-column label="结果" min-width="140" show-overflow-tooltip>
                    <template #default="{ row }">
                      <div class="q-name">{{ row.track.name }}</div>
                      <div class="q-artist">
                        {{ (row.track.artists || []).join(' / ') || '—' }}
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column label="源" width="100" show-overflow-tooltip>
                    <template #default="{ row }">
                      {{ sourceLabel(row.track) }}
                    </template>
                  </el-table-column>
                  <el-table-column label="匹配" width="88">
                    <template #default="{ row }">
                      <span class="match-tag" :class="row.exactMatch ? 'exact' : 'partial'">
                        {{ row.exactMatch ? '完全' : '候选' }}
                      </span>
                    </template>
                  </el-table-column>
                  <el-table-column label="歌单" width="100" show-overflow-tooltip>
                    <template #default="{ row }">
                      {{ playlistNameOf(row.queryIndex) }}
                    </template>
                  </el-table-column>
                </el-table>

                <p v-if="!displayHits.length" class="empty-pick">
                  当前筛选下无结果，可切换「仅完全匹配」或点选其它源
                </p>
              </template>

              <!-- 下载入库中 -->
              <template v-else>
                <div class="fill-panel">
                  <p class="fill-title">正在下载到曲库并加入歌单</p>
                  <el-progress
                    :percentage="importPercent"
                    :stroke-width="10"
                    color="var(--wy-brand)"
                  />
                  <p class="fill-text">{{ importTip }}</p>
                  <ul v-if="fillLogs.length" class="fill-log">
                    <li v-for="(line, i) in fillLogs" :key="i" :class="line.level">
                      {{ line.text }}
                    </li>
                  </ul>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Close } from '@element-plus/icons-vue'
import type { MusicSource } from '@wy-music/shared'
import { MUSIC_SOURCE_LABEL, MUSIC_SOURCES } from '@wy-music/shared'
import { http } from '../services/http'
import { usePlaylistStore } from '../stores/playlist'
import {
  runBatchExternalSearch,
  sourceLabel,
  trackHasLyric,
  type BatchQueryRow,
  type BatchSearchHit,
} from '../services/batchSearchImport'
import {
  downloadTracksToFolder,
  importTrackToLibraryQuiet,
  pickBatchDownloadMode,
} from '../services/trackDownload'
import { loadSearchSources } from '../services/searchSources'
import { useUiStore } from '../stores/ui'
import { useUserStore } from '../stores/user'

type MatchedSong = {
  name: string
  artists: string[]
  trackId: string
  trackName: string
  trackArtists: string[]
}

type MissingSong = {
  name: string
  artists: string[]
}

type ImportSource = {
  ok: boolean
  url: string
  platform: 'netease' | 'qq' | null
  name: string | null
  description?: string | null
  error?: string
  total: number
  matchedCount: number
  missingCount: number
  matched: MatchedSong[]
  missing: MissingSong[]
}

type CreatedPlaylist = {
  id: string
  name: string
  added?: number
}

type FillQuery = BatchQueryRow & {
  playlistId: string
  playlistName: string
}

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: []; imported: [] }>()

const router = useRouter()
const playlistStore = usePlaylistStore()
const user = useUserStore()
const ui = useUiStore()

const step = ref<'input' | 'preview' | 'searching' | 'pick' | 'importing'>('input')
const links = ref<string[]>([''])
const loading = ref(false)
const confirming = ref(false)
const importing = ref(false)
const isPublic = ref(false)
const sources = ref<ImportSource[]>([])
const rootRef = ref<HTMLElement | null>(null)
const createdPlaylists = ref<CreatedPlaylist[]>([])

const fillQueries = ref<FillQuery[]>([])
const fillHits = ref<BatchSearchHit[]>([])
const selectedKeySet = ref<Set<string>>(new Set())
const selectMode = ref<'all' | 'first'>('first')
const exactOnly = ref(true)
const filterSource = ref<string | null>(null)
const pickedSources = ref<string[]>([])
const searchTip = ref('')
const searchDone = ref(0)
const searchTotal = ref(0)
const importTip = ref('')
const importDone = ref(0)
const importTotal = ref(0)
const fillLogs = ref<{ text: string; level: 'ok' | 'fail' | 'info' }[]>([])
const cancelFlag = { cancelled: false }
const tableRef = ref<{
  clearSelection: () => void
  toggleRowSelection: (row: BatchSearchHit, selected?: boolean) => void
} | null>(null)
const tableRefSyncing = ref(false)

const hardBusy = computed(
  () => loading.value || confirming.value || step.value === 'searching' || importing.value,
)
const busy = computed(() => hardBusy.value)

const totalMatched = computed(() =>
  sources.value.reduce((n, s) => n + (s.ok ? s.matchedCount : 0), 0),
)
const totalMissing = computed(() =>
  sources.value.reduce((n, s) => n + (s.ok ? s.missingCount : 0), 0),
)
const canConfirm = computed(() =>
  sources.value.some((s) => s.ok && (s.matchedCount > 0 || s.missingCount > 0)),
)
const searchPercent = computed(() => {
  if (!searchTotal.value) return 0
  return Math.min(100, Math.round((searchDone.value / searchTotal.value) * 100))
})
const importPercent = computed(() => {
  if (!importTotal.value) return 0
  return Math.min(100, Math.round((importDone.value / importTotal.value) * 100))
})
const selectedCount = computed(() => selectedKeySet.value.size)
const exactHitCount = computed(() => fillHits.value.filter((h) => h.exactMatch).length)
const pickedSourceSet = computed(() => new Set(pickedSources.value))

const sourcePriority = computed(() => {
  if (pickedSources.value.length) return [...pickedSources.value]
  return sourceTags.value.map((t) => t.source)
})

const sourceTags = computed(() => {
  const map = new Map<string, { count: number; exactCount: number }>()
  for (const h of fillHits.value) {
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
      label: MUSIC_SOURCE_LABEL[s] || s,
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

const displayHits = computed(() => {
  let list = fillHits.value
  if (filterSource.value) {
    list = list.filter((h) => String(h.track.source || '') === filterSource.value)
  } else if (pickedSources.value.length) {
    const set = pickedSourceSet.value
    list = list.filter((h) => set.has(String(h.track.source || '')))
  }
  if (exactOnly.value) list = list.filter((h) => h.exactMatch)
  return list
})

watch(
  () => props.visible,
  (v) => {
    if (v) resetAll()
  },
)

watch([selectMode, exactOnly], () => {
  if (step.value !== 'pick' || !fillHits.value.length) return
  if (pickedSources.value.length) applyPickedSelection()
  else {
    selectedKeySet.value = collectKeysForSources(null, selectMode.value, exactOnly.value)
  }
})

function resetAll() {
  step.value = 'input'
  links.value = ['']
  sources.value = []
  isPublic.value = false
  loading.value = false
  confirming.value = false
  importing.value = false
  createdPlaylists.value = []
  fillQueries.value = []
  fillHits.value = []
  selectedKeySet.value = new Set()
  selectMode.value = 'first'
  exactOnly.value = true
  filterSource.value = null
  pickedSources.value = []
  searchTip.value = ''
  searchDone.value = 0
  searchTotal.value = 0
  importTip.value = ''
  importDone.value = 0
  importTotal.value = 0
  fillLogs.value = []
  cancelFlag.cancelled = false
}

function close() {
  if (hardBusy.value) {
    ElMessage.warning('请等待当前操作完成…')
    return
  }
  emit('close')
}

function onMaskClick() {
  if (!busy.value) close()
}

function addLink() {
  if (links.value.length >= 10) return
  links.value.push('')
}

function removeLink(idx: number) {
  links.value.splice(idx, 1)
  if (!links.value.length) links.value = ['']
}

function platformLabel(p: ImportSource['platform']) {
  if (p === 'netease') return '网易云'
  if (p === 'qq') return 'QQ音乐'
  return '未知'
}

function backToInput() {
  step.value = 'input'
}

function pushLog(text: string, level: 'ok' | 'fail' | 'info' = 'info') {
  fillLogs.value.push({ text, level })
  if (fillLogs.value.length > 100) fillLogs.value.shift()
}

/** 与批量搜歌一致：使用用户勾选的全部音源（含下歌吧） */
function missingSearchSources(): MusicSource[] {
  return loadSearchSources()
}

function playlistNameOf(queryIndex: number) {
  return fillQueries.value[queryIndex]?.playlistName || '—'
}

async function onPreview() {
  const urls = links.value.map((s) => s.trim()).filter(Boolean)
  if (!urls.length) {
    ElMessage.warning('请粘贴歌单链接')
    return
  }
  loading.value = true
  try {
    const { data } = await http.post('/api/playlists/import/preview', { urls })
    sources.value = (data.data?.sources || []) as ImportSource[]
    step.value = 'preview'
    const okCount = sources.value.filter((s) => s.ok).length
    if (!okCount) {
      ElMessage.error('链接解析失败，请检查是否为公开歌单分享链接')
    } else if (totalMatched.value === 0 && totalMissing.value === 0) {
      ElMessage.warning('解析成功，但歌单为空')
    } else if (totalMatched.value === 0) {
      ElMessage.warning(
        `解析成功：公共曲库未匹配到歌曲，缺失 ${totalMissing.value} 首可搜索后勾选下载`,
      )
    } else {
      ElMessage.success(
        `解析完成：可导入 ${totalMatched.value} 首` +
          (totalMissing.value ? `，缺失 ${totalMissing.value} 首` : ''),
      )
    }
  } catch (e) {
    console.error('[import preview]', e)
  } finally {
    loading.value = false
  }
}

async function askSearchMissing(count: number): Promise<'search' | 'matched-only' | 'abort'> {
  try {
    await ElMessageBox.confirm(
      `有 ${count} 首未在公共曲库匹配。\n确定后将按当前勾选音源多源搜索（含下歌吧），由你勾选后再下载到曲库并加入歌单。\n下歌吧会先经本机网盘下载，再上传到公共曲库。`,
      '搜索缺失歌曲？',
      {
        distinguishCancelAndClose: true,
        confirmButtonText: '去搜索勾选',
        cancelButtonText: '仅导入已匹配',
        type: 'info',
        closeOnClickModal: false,
        appendTo: rootRef.value || document.body,
        customClass: 'wy-import-missing-msgbox',
      },
    )
    return 'search'
  } catch (action) {
    if (action === 'cancel') return 'matched-only'
    return 'abort'
  }
}

async function createPlaylistsFromSources(): Promise<CreatedPlaylist[]> {
  const items = sources.value
    .filter((s) => s.ok && (s.matched.length || s.missing.length))
    .map((s) => ({
      name: (s.name || '导入歌单').slice(0, 40),
      description: s.description || undefined,
      isPublic: isPublic.value,
      trackIds: s.matched.map((m) => m.trackId),
    }))
  if (!items.length) return []
  const { data } = await http.post('/api/playlists/import/confirm', { items })
  return (data.data?.playlists || []) as CreatedPlaylist[]
}

function isBetterHit(a: BatchSearchHit, b: BatchSearchHit) {
  const al = trackHasLyric(a.track) ? 1 : 0
  const bl = trackHasLyric(b.track) ? 1 : 0
  if (al !== bl) return al > bl
  if (a.exactMatch !== b.exactMatch) return a.exactMatch
  return a.score > b.score
}

function collectKeysForSources(
  srcList: string[] | null,
  mode: 'all' | 'first',
  exact: boolean,
): Set<string> {
  let scoped = fillHits.value
  if (exact) scoped = scoped.filter((h) => h.exactMatch)

  if (mode === 'all') {
    if (srcList?.length) {
      const set = new Set(srcList)
      scoped = scoped.filter((h) => set.has(String(h.track.source || '')))
    }
    return new Set(scoped.map((h) => h.rowKey))
  }

  const priority =
    srcList?.length
      ? srcList
      : sourcePriority.value.length
        ? sourcePriority.value
        : [...new Set(scoped.map((h) => String(h.track.source || '')).filter(Boolean))]

  const allowed = srcList?.length ? new Set(srcList) : null
  if (allowed) {
    scoped = scoped.filter((h) => allowed.has(String(h.track.source || '')))
  }

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
    for (const src of priority) {
      const hit = bySrc.get(src)
      if (hit && trackHasLyric(hit.track)) {
        chosen = hit
        break
      }
    }
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

function applyPickedSelection() {
  const list = pickedSources.value.length ? [...pickedSources.value] : null
  selectedKeySet.value = collectKeysForSources(list, selectMode.value, exactOnly.value)
}

function onSelectAllSources() {
  filterSource.value = null
  pickedSources.value = []
  selectedKeySet.value = collectKeysForSources(null, selectMode.value, exactOnly.value)
  ElMessage.success(`已按规则勾选 ${selectedKeySet.value.size} 首`)
}

function onSourceTagClick(source: string) {
  filterSource.value = source
  const nextPicked = [...pickedSources.value]
  const idx = nextPicked.indexOf(source)
  if (idx >= 0) nextPicked.splice(idx, 1)
  else nextPicked.push(source)
  pickedSources.value = nextPicked
  if (!nextPicked.length) {
    selectedKeySet.value = new Set()
    return
  }
  selectedKeySet.value = collectKeysForSources(nextPicked, selectMode.value, exactOnly.value)
}

function selectAllResults() {
  const mode = exactOnly.value ? selectMode.value : 'all'
  selectedKeySet.value = collectKeysForSources(null, mode, exactOnly.value)
  pickedSources.value = []
  filterSource.value = null
  ElMessage.success(`已勾选 ${selectedKeySet.value.size} 首`)
}

function clearSelection() {
  selectedKeySet.value = new Set()
  pickedSources.value = []
}

function onTableSelectionChange(rows: BatchSearchHit[]) {
  if (tableRefSyncing.value) return
  const visibleKeys = new Set(displayHits.value.map((h) => h.rowKey))
  const next = new Set(selectedKeySet.value)
  for (const k of visibleKeys) next.delete(k)
  for (const r of rows) next.add(r.rowKey)
  selectedKeySet.value = next
}

async function syncTableSelection() {
  await nextTick()
  const table = tableRef.value
  if (!table || step.value !== 'pick') return
  tableRefSyncing.value = true
  try {
    table.clearSelection()
    for (const row of displayHits.value) {
      if (selectedKeySet.value.has(row.rowKey)) {
        table.toggleRowSelection(row, true)
      }
    }
  } finally {
    await nextTick()
    tableRefSyncing.value = false
  }
}

watch([selectedKeySet, displayHits, step], () => {
  if (step.value === 'pick') void syncTableSelection()
})

function cancelSearch() {
  cancelFlag.cancelled = true
}

async function runMissingSearch(playlists: CreatedPlaylist[]) {
  const searchSources = missingSearchSources()
  if (!searchSources.length) {
    ElMessage.warning('未勾选任何搜索音源，已仅导入已匹配歌曲')
    return false
  }

  const okSources = sources.value.filter((s) => s.ok && (s.matched.length || s.missing.length))
  const queries: FillQuery[] = []
  for (let i = 0; i < okSources.length; i++) {
    const src = okSources[i]
    const pl = playlists[i]
    if (!pl?.id || !src.missing.length) continue
    for (const m of src.missing) {
      const name = String(m.name || '').trim() || '未知歌名'
      const artist = (m.artists || []).filter(Boolean).join(' ')
      const index = queries.length
      queries.push({
        index,
        name,
        artist,
        keyword: artist ? `${name} ${artist}` : name,
        playlistId: pl.id,
        playlistName: pl.name || src.name || '导入歌单',
      })
    }
  }

  if (!queries.length) {
    ElMessage.info('没有需要搜索的缺失歌曲')
    return false
  }

  fillQueries.value = queries
  fillHits.value = []
  selectedKeySet.value = new Set()
  cancelFlag.cancelled = false
  step.value = 'searching'
  searchTotal.value = queries.length
  searchDone.value = 0
  searchTip.value = `准备搜索 ${queries.length} 首…`

  const hits = await runBatchExternalSearch(queries, {
    sources: searchSources,
    perSource: 3,
    pageSize: 20,
    signal: cancelFlag,
    onProgress: (p) => {
      searchDone.value = p.done
      searchTip.value = `搜索中 ${p.done}/${p.total}${p.current ? ` · ${p.current}` : ''}`
    },
    onHits: (chunk) => {
      fillHits.value = [...fillHits.value, ...chunk]
    },
  })

  if (cancelFlag.cancelled) {
    ElMessage.info('已取消搜索；歌单已创建（仅含已匹配曲）')
    return false
  }

  fillHits.value = hits
  step.value = 'pick'
  selectMode.value = 'first'
  pickedSources.value = []
  filterSource.value = null
  const exactCount = hits.filter((h) => h.exactMatch).length
  // 无完全匹配时不要默认开「仅完全匹配」，否则会显示 162 结果但表格为空
  exactOnly.value = exactCount > 0
  selectedKeySet.value = collectKeysForSources(
    null,
    'first',
    exactOnly.value,
  )
  ElMessage.success(
    exactCount
      ? `搜索完成：${hits.length} 条结果，完全匹配 ${exactCount}，已默认勾选 ${selectedKeySet.value.size} 首`
      : `搜索完成：${hits.length} 条结果（无完全匹配，已展示全部候选），已默认勾选 ${selectedKeySet.value.size} 首`,
  )
  return true
}

async function onDownloadSelected() {
  const selected = fillHits.value.filter((h) => selectedKeySet.value.has(h.rowKey))
  if (!selected.length) {
    ElMessage.warning('请先勾选要下载的结果')
    return
  }

  const mode = await pickBatchDownloadMode()
  if (!mode) return

  if (mode === 'library' && !user.accessToken) {
    ui.openLogin('login')
    return
  }

  importing.value = true
  step.value = 'importing'
  fillLogs.value = []
  importTotal.value = selected.length
  importDone.value = 0
  let ok = 0
  let fail = 0

  try {
    if (mode === 'folder') {
      const tracks = selected.map((h) => h.track)
      const seen = new Set<string>()
      const unique = tracks.filter((t) => {
        if (!t?.id || seen.has(t.id)) return false
        seen.add(t.id)
        return true
      })
      const result = await downloadTracksToFolder(unique, (done, total, name) => {
        importDone.value = done
        importTotal.value = total
        importTip.value =
          done >= total ? '' : `本地下载中 ${done + 1}/${total}${name ? ` · ${name}` : ''}`
      })
      if (!result.folder) {
        step.value = 'pick'
        return
      }
      ok = result.ok
      fail = result.fail
      for (const f of result.failures) {
        pushLog(`失败：${f.name}（${f.error}）`, 'fail')
      }
      if (ok) pushLog(`已保存到文件夹 ${ok} 首（文件夹下载不会加入歌单）`, 'ok')
      importTip.value = `完成：成功 ${ok}` + (fail ? `，失败 ${fail}` : '')
      if (fail) ElMessage.warning(`已保存到文件夹：成功 ${ok}，失败 ${fail}`)
      else ElMessage.success(`已保存到文件夹：成功 ${ok}`)
      finishAndOpen()
      return
    }

    for (const hit of selected) {
      const q = fillQueries.value[hit.queryIndex]
      const name = hit.track.name || q?.name || '未命名'
      importTip.value = `入库 ${importDone.value + 1}/${importTotal.value} · ${name}`
      try {
        const imported = await importTrackToLibraryQuiet(hit.track)
        if (imported.status !== 'published') {
          fail += 1
          pushLog(`「${imported.name}」待审核，暂未加入歌单`, 'fail')
        } else if (q?.playlistId) {
          await http.post(`/api/playlists/${q.playlistId}/tracks`, { trackId: imported.id })
          ok += 1
          pushLog(`已加入：${imported.name}`, 'ok')
        } else {
          ok += 1
          pushLog(`已入库：${imported.name}`, 'ok')
        }
      } catch (e) {
        fail += 1
        const msg = e instanceof Error ? e.message : String(e)
        pushLog(`失败：${name}（${msg.slice(0, 80)}）`, 'fail')
      }
      importDone.value += 1
    }
    await playlistStore.fetchMine()
    importTip.value = `完成：成功 ${ok}` + (fail ? `，失败 ${fail}` : '')
    ElMessage.success(`曲库下载完成：成功 ${ok}` + (fail ? `，失败 ${fail}` : ''))
    finishAndOpen()
  } catch (e) {
    console.error('[import download]', e)
    step.value = 'pick'
  } finally {
    importing.value = false
  }
}

function finishWithoutDownload() {
  ElMessage.success('已完成导入（未下载缺失曲）')
  finishAndOpen()
}

function finishAndOpen() {
  emit('imported')
  importing.value = false
  confirming.value = false
  emit('close')
  const id = createdPlaylists.value[0]?.id
  if (id) router.push(`/playlist/${id}`)
}

async function onConfirm() {
  if (!canConfirm.value) {
    ElMessage.warning('没有可导入的内容')
    return
  }

  let mode: 'search' | 'matched-only' | 'abort' = 'matched-only'
  if (totalMissing.value > 0) {
    mode = await askSearchMissing(totalMissing.value)
    if (mode === 'abort') return
  }

  if (mode === 'matched-only' && totalMatched.value === 0) {
    ElMessage.warning('没有已匹配歌曲可导入；请选择「去搜索勾选」补齐缺失曲')
    return
  }

  confirming.value = true
  try {
    const playlists = await createPlaylistsFromSources()
    if (!playlists.length) {
      ElMessage.warning('没有成功创建的歌单')
      return
    }
    createdPlaylists.value = playlists
    await playlistStore.fetchMine()

    if (mode === 'search') {
      confirming.value = false
      const ok = await runMissingSearch(playlists)
      if (!ok) {
        ElMessage.success(`已导入 ${playlists.length} 个歌单`)
        finishAndOpen()
      }
      return
    }

    ElMessage.success(`已导入 ${playlists.length} 个歌单`)
    finishAndOpen()
  } catch (e) {
    console.error('[import confirm]', e)
    if (step.value === 'searching') step.value = 'preview'
  } finally {
    confirming.value = false
  }
}
</script>

<style scoped lang="scss">
.import-root {
  position: fixed;
  inset: 0;
  z-index: 2800;
}
.import-mask {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.import-dialog {
  width: min(640px, 100%);
  max-height: min(86vh, 820px);
  background: var(--wy-surface);
  border-radius: var(--wy-radius-md);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--wy-shadow-sm);
  &.wide {
    width: min(920px, 100%);
  }
}
.import-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--wy-border);
  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
}
.close-btn {
  border: 0;
  background: transparent;
  cursor: pointer;
  color: var(--wy-text-muted);
  display: inline-flex;
  padding: 4px;
  &:hover:not(:disabled) {
    color: var(--wy-text);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
.import-body {
  padding: 20px;
  overflow: auto;
}
.link-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  background: var(--wy-surface-muted);
  border-radius: 8px;
  padding: 8px 10px;
  :deep(.el-input__wrapper) {
    box-shadow: none;
    background: transparent;
  }
}
.link-label {
  flex: none;
  color: var(--wy-text-secondary);
  font-size: 13px;
  width: 48px;
}
.link-add,
.link-remove {
  flex: none;
  border: 0;
  background: transparent;
  color: var(--wy-brand);
  cursor: pointer;
  font-size: 13px;
  padding: 0 4px;
}
.hint {
  margin: 4px 0 18px;
  color: var(--wy-text-muted);
  font-size: 12px;
  line-height: 1.45;
}
.start-btn {
  display: block;
  width: 200px;
  margin: 0 auto;
  height: 40px;
}
.preview-wrap {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 120px;
}
.source-card {
  border: 1px solid var(--wy-border);
  border-radius: var(--wy-radius-md);
  padding: 12px 14px;
}
.source-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.source-title {
  display: flex;
  align-items: center;
  gap: 8px;
  strong {
    font-size: 15px;
  }
}
.platform {
  font-size: 12px;
  color: var(--wy-brand);
  background: var(--wy-brand-soft);
  padding: 1px 6px;
  border-radius: 4px;
}
.source-stats {
  font-size: 13px;
  color: var(--wy-text-secondary);
}
.ok-text {
  color: var(--el-color-success, #67c23a);
}
.miss-text {
  color: var(--el-color-warning, #e6a23c);
}
.source-error {
  color: var(--el-color-danger, #f56c6c);
  font-size: 13px;
}
.source-url {
  margin: 6px 0 8px;
  font-size: 12px;
  color: var(--wy-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.song-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 180px;
  overflow: auto;
  li {
    display: flex;
    gap: 10px;
    align-items: baseline;
    padding: 4px 0;
    font-size: 13px;
    border-bottom: 1px solid var(--wy-surface-muted);
  }
}
.song-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.song-artist {
  color: var(--wy-text-muted);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.match-tip {
  color: var(--el-color-success, #67c23a);
  font-size: 12px;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.song-list.miss .song-name {
  color: var(--el-color-warning, #e6a23c);
}
.preview-actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  margin-top: 16px;
}
.public-opt {
  display: flex;
  align-items: center;
  gap: 10px;
}
.public-tip {
  font-size: 13px;
  color: var(--wy-text-secondary);
}
.fill-hint {
  margin: 0;
  font-size: 12px;
  color: var(--wy-text-muted);
  line-height: 1.4;
}
.action-btns {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.fill-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 160px;
}
.fill-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.fill-text {
  margin: 0;
  font-size: 13px;
  color: var(--wy-text-secondary);
}
.fill-log {
  list-style: none;
  margin: 0;
  padding: 8px 10px;
  max-height: 240px;
  overflow: auto;
  border-radius: var(--wy-radius-sm);
  background: var(--wy-surface-muted);
  border: 1px solid var(--wy-border);
  li {
    font-size: 12px;
    line-height: 1.45;
    padding: 2px 0;
    color: var(--wy-text-secondary);
    &.ok {
      color: var(--el-color-success, #67c23a);
    }
    &.fail {
      color: var(--el-color-danger, #f56c6c);
    }
  }
}
.pick-summary {
  font-size: 13px;
  color: var(--wy-text-secondary);
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: var(--wy-radius-sm);
  background: var(--wy-surface-muted);
  border: 1px solid var(--wy-border);
}
.source-panel {
  margin-bottom: 12px;
  padding: 12px;
  border-radius: var(--wy-radius-md);
  background: var(--wy-surface);
  border: 1px solid var(--wy-border);
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
  font-weight: 600;
  color: var(--wy-text-secondary);
}
.exact-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--wy-text);
  cursor: pointer;
  input {
    accent-color: var(--wy-brand);
  }
  &.disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
}
.mode-hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--wy-text-muted);
  line-height: 1.4;
}
.source-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.source-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding: 5px 12px;
  border-radius: var(--wy-radius-pill);
  border: 1px solid var(--wy-border);
  background: var(--wy-surface-muted);
  color: var(--wy-text-secondary);
  font-size: 12px;
  cursor: pointer;
  .prio {
    display: inline-grid;
    place-items: center;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    border-radius: 7px;
    font-size: 10px;
    font-weight: 700;
    background: var(--wy-brand-soft-strong);
    color: var(--wy-brand);
  }
  &:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--wy-brand) 35%, var(--wy-border));
    color: var(--wy-brand);
    background: var(--wy-brand-soft);
  }
  &.active {
    border-color: var(--wy-brand);
    background: var(--wy-brand);
    color: var(--wy-text-on-brand);
    .prio {
      background: rgba(255, 255, 255, 0.25);
      color: var(--wy-text-on-brand);
    }
  }
  &.selected:not(.active) {
    border-color: color-mix(in srgb, var(--wy-brand) 45%, var(--wy-border));
    background: var(--wy-brand-soft);
    color: var(--wy-brand);
    font-weight: 600;
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
}
.pick-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.pick-table {
  width: 100%;
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
.match-tag {
  display: inline-flex;
  height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 12px;
  align-items: center;
  &.exact {
    color: var(--wy-brand);
    background: var(--wy-brand-soft);
    font-weight: 600;
  }
  &.partial {
    color: var(--wy-text-muted);
    background: var(--wy-surface-muted);
  }
}
.empty-pick {
  margin: 16px 0 0;
  text-align: center;
  font-size: 13px;
  color: var(--wy-text-muted);
}
.import-fade-enter-active,
.import-fade-leave-active {
  transition: opacity 0.18s ease;
}
.import-fade-enter-from,
.import-fade-leave-to {
  opacity: 0;
}
</style>
