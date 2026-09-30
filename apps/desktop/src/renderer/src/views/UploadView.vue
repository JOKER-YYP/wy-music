<template>
  <div class="upload-page">
    <h2>上传到公共曲库</h2>
    <p class="tip">
      支持 mp3 / wav / flac / m4a / aac，单文件不超过 500MB。
      <template v-if="isDesktop">
        桌面端可扫描文件夹批量上传；同目录下同名 <code>.lrc</code> 会自动匹配歌词。
        扫描后会对比公共曲库，将未收录的「新曲」标出并排在前面。
      </template>
      网页端请使用「单曲上传」，可另选 LRC 文件补充歌词。
    </p>

    <el-tabs v-model="tab">
      <el-tab-pane v-if="isDesktop" label="文件夹扫描" name="folder">
        <div class="toolbar">
          <el-button type="danger" :loading="scanning" @click="pickAndScan">
            选择文件夹并扫描
          </el-button>
          <el-button :disabled="!folderPath" :loading="scanning" @click="rescan">重新扫描</el-button>
          <span v-if="folderPath" class="folder-path" :title="folderPath">{{ folderPath }}</span>
          <span v-if="items.length" class="count">
            共 {{ items.length }} 首
            <template v-if="newTrackCount"> · 新曲 {{ newTrackCount }}</template>
            <template v-if="inLibraryCount"> · 曲库已有 {{ inLibraryCount }}</template>
            <template v-if="lyricMatchedCount"> · 已匹配歌词 {{ lyricMatchedCount }}</template>
          </span>
        </div>

        <div v-if="items.length" class="batch-bar">
          <el-button
            type="danger"
            :disabled="!selected.length"
            :loading="batchUploading"
            @click="uploadSelected"
          >
            上传选中（{{ selected.length }}）
          </el-button>
          <el-button :disabled="!newTrackCount" @click="selectNewTracks">
            全选新曲（{{ newTrackCount }}）
          </el-button>
          <el-button :disabled="!selected.length" @click="swapSelected">
            互换歌名/歌手（{{ selected.length || 0 }}）
          </el-button>
          <el-button type="danger" plain :disabled="!selected.length" @click="removeSelected">
            删除选中（{{ selected.length || 0 }}）
          </el-button>
          <el-button :disabled="!filteredItems.length" @click="playAll">播放全部</el-button>
          <el-radio-group v-model="libraryFilter" size="small" class="library-filter">
            <el-radio-button value="all">全部</el-radio-button>
            <el-radio-button value="new">仅新曲</el-radio-button>
            <el-radio-button value="library">仅已有</el-radio-button>
          </el-radio-group>
          <el-input
            v-model="listQuery"
            class="list-search"
            clearable
            placeholder="搜索歌名 / 歌手 / 专辑 / 文件名"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <span v-if="listQuery.trim() || libraryFilter !== 'all'" class="filter-count">
            显示 {{ filteredItems.length }} / {{ items.length }}
          </span>
        </div>

        <div ref="tableWrapRef" class="upload-table-wrap">
          <el-table
            ref="tableRef"
            v-loading="scanning"
            :data="filteredItems"
            :row-key="uploadRowKey"
            :row-class-name="uploadRowClass"
            stripe
            height="calc(100vh - 320px)"
            @selection-change="onSelectionChange"
            @row-dblclick="playOne"
          >
            <el-table-column type="selection" width="48" />
            <el-table-column type="index" width="50" label="#" />
            <el-table-column label="状态" width="88" align="center">
              <template #default="{ row }">
                <span v-if="row.inLibrary" class="lib-tag lib-exist" title="公共曲库已有相同文件">已有</span>
                <span v-else class="lib-tag lib-new" title="公共曲库中尚未收录">新曲</span>
              </template>
            </el-table-column>
            <el-table-column prop="name" label="歌曲" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">
                <UploadEditCell
                  :model-value="row.name || ''"
                  @update:model-value="(v) => onNameCommit(row, v)"
                />
              </template>
            </el-table-column>
            <el-table-column label="互换" width="64" align="center">
              <template #default="{ row }">
                <el-button
                  link
                  type="primary"
                  title="互换歌名与歌手"
                  @click.stop="swapRow(row)"
                >
                  ⇄
                </el-button>
              </template>
            </el-table-column>
            <el-table-column label="歌手" min-width="140">
              <template #default="{ row }">
                <UploadEditCell
                  :model-value="row.artists?.join(' / ') || ''"
                  placeholder="可留空，默认未知歌手"
                  empty-text="未知歌手"
                  @update:model-value="(v) => onArtistsCommit(row, v)"
                />
              </template>
            </el-table-column>
            <el-table-column label="专辑" min-width="120" show-overflow-tooltip>
              <template #default="{ row }">
                <UploadEditCell
                  :model-value="row.album || ''"
                  empty-text="未知专辑"
                  placeholder="可留空，默认未知专辑"
                  @update:model-value="(v) => onAlbumCommit(row, v)"
                />
              </template>
            </el-table-column>
            <el-table-column label="歌词" width="100">
              <template #default="{ row }">
                <span v-if="row.lyricFileName" class="lrc-ok" :title="row.lyricFileName">已匹配</span>
                <span v-else class="lrc-miss">无</span>
              </template>
            </el-table-column>
            <el-table-column label="时长" width="80">
              <template #default="{ row }">{{ formatDuration(row.durationMs) }}</template>
            </el-table-column>
            <el-table-column label="大小" width="90">
              <template #default="{ row }">{{ formatBytes(row.size) }}</template>
            </el-table-column>
            <el-table-column prop="fileName" label="文件名" min-width="140" show-overflow-tooltip />
            <el-table-column label="操作" width="220" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="playOne(row)">播放</el-button>
                <el-button
                  link
                  type="danger"
                  :loading="uploadingId === row.id"
                  @click="uploadOne(row)"
                >
                  上传
                </el-button>
                <el-button link type="info" @click="removeOne(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <PlayingLocateFab :visible="showLocate && tab === 'folder'" @click="locateCurrent" />
        </div>

        <el-empty
          v-if="!scanning && items.length && !filteredItems.length"
          description="没有匹配的歌曲"
        />
        <el-empty v-else-if="!scanning && !items.length" description="请选择文件夹开始扫描" />
      </el-tab-pane>

      <el-tab-pane label="单曲上传" name="single">
        <el-form label-width="80px" class="form">
          <el-form-item label="音频" required>
            <div class="single-pick">
              <!-- 网页端：原生文件选择 -->
              <template v-if="!isDesktop">
                <input
                  ref="webFileInput"
                  type="file"
                  accept=".mp3,.wav,.flac,.m4a,.aac,audio/*"
                  class="file-input"
                  @change="onWebFileChange"
                />
                <el-button type="danger" plain @click="triggerWebFile">选择音频文件</el-button>
              </template>
              <!-- 桌面端：系统对话框 -->
              <el-button v-else @click="pickSingleFile">选择文件</el-button>
              <span v-if="displayFileName" class="file-name">{{ displayFileName }}</span>
            </div>
          </el-form-item>
          <el-form-item label="歌名">
            <div class="name-artist-row">
              <el-input v-model="singleForm.name" placeholder="可留空，将使用文件名" />
              <el-button title="互换歌名与歌手" @click="swapSingleForm">⇄ 互换</el-button>
            </div>
          </el-form-item>
          <el-form-item label="歌手">
            <el-input
              v-model="singleForm.artists"
              placeholder="可留空，默认「未知歌手」，多个用逗号分隔"
            />
          </el-form-item>
          <el-form-item label="专辑">
            <el-input v-model="singleForm.album" placeholder="可留空，默认「未知专辑」" />
          </el-form-item>
          <el-form-item label="歌词">
            <div class="lyric-tools">
              <!-- 网页端选 LRC -->
              <input
                v-if="!isDesktop"
                ref="webLrcInput"
                type="file"
                accept=".lrc,text/plain"
                class="file-input"
                @change="onWebLrcChange"
              />
              <el-button size="small" @click="pickLrcFile">选择 LRC 文件</el-button>
              <el-button
                v-if="singleForm.lyricText"
                size="small"
                text
                type="danger"
                @click="clearLyric"
              >
                清空
              </el-button>
              <span v-if="singleLrcName" class="file-name">{{ singleLrcName }}</span>
            </div>
            <el-input
              v-model="singleForm.lyricText"
              type="textarea"
              :rows="5"
              placeholder="可选：粘贴 LRC 文本，或选择同名 .lrc 文件"
              style="margin-top: 8px"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" plain :disabled="!canPreview" @click="previewSingle">
              试听
            </el-button>
            <el-button type="danger" :loading="singleUploading" @click="submitSingle">
              上传到公共曲库
            </el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="progressVisible"
      title="批量上传进度"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-progress :percentage="progressPercent" :status="progressStatus" />
      <p class="progress-text">{{ progressText }}</p>
      <template v-if="!batchUploading && pendingRetries.length">
        <p class="retry-hint">有 {{ pendingRetries.length }} 首失败或跳过，可调整后再次上传</p>
        <el-button type="danger" @click="openRetryDialog">查看并处理</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="retryVisible"
      title="失败 / 跳过 — 调整后再次上传"
      width="860px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <div class="retry-toolbar">
        <el-button
          type="danger"
          :disabled="!pendingRetries.length"
          :loading="retryUploading"
          @click="retryUploadAll"
        >
          全部重新上传（{{ pendingRetries.length }}）
        </el-button>
        <el-button :disabled="!pendingRetries.length" @click="pendingRetries = []">清空列表</el-button>
      </div>
      <el-table :data="pendingRetries" stripe max-height="420" empty-text="没有待处理项">
        <el-table-column type="index" width="48" label="#" />
        <el-table-column label="原因" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <span :class="row.kind === 'skip' ? 'reason-skip' : 'reason-fail'">{{ row.reason }}</span>
          </template>
        </el-table-column>
        <el-table-column label="歌曲" min-width="160">
          <template #default="{ row }">
            <el-input v-model="row.item.name" size="small" />
          </template>
        </el-table-column>
        <el-table-column label="歌手" min-width="150">
          <template #default="{ row }">
            <el-input
              :model-value="row.item.artists?.join(' / ') || ''"
              size="small"
              placeholder="可留空，默认未知歌手"
              @update:model-value="(v) => setRowArtists(row.item, String(v ?? ''))"
            />
          </template>
        </el-table-column>
        <el-table-column label="专辑" min-width="120">
          <template #default="{ row }">
            <el-input v-model="row.item.album" size="small" placeholder="可留空，默认未知专辑" />
          </template>
        </el-table-column>
        <el-table-column label="文件名" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.item.fileName }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row, $index }">
            <el-button
              link
              type="danger"
              :loading="retryingId === row.item.id"
              @click="retryUploadOne(row, $index)"
            >
              上传
            </el-button>
            <el-button link @click="pendingRetries.splice($index, 1)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, shallowRef, triggerRef } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { TableInstance } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { decodeLyricBytes, parseAudioFilename, swapNameAndArtists } from '@wy-music/shared'
import type { LocalAudioItem } from '../types/local'
import { usePlayerStore } from '../stores/player'
import UploadEditCell from '../components/UploadEditCell.vue'
import PlayingLocateFab from '../components/PlayingLocateFab.vue'
import { usePlayingLocate } from '../composables/usePlayingLocate'
import {
  browserFileToQueueTrack,
  checkLibraryHashes,
  formatBytes,
  formatDuration,
  isElectronApp,
  localItemToQueueTrack,
  uploadBrowserFile,
  uploadLocalItem,
} from '../services/localUpload'

const isDesktop = isElectronApp()
const tab = ref(isDesktop ? 'folder' : 'single')

const scanning = ref(false)
const folderPath = ref('')
/** shallow：行内字段改动不触发整表深响应，避免失焦保存卡顿 */
const items = shallowRef<LocalAudioItem[]>([])
const selected = shallowRef<LocalAudioItem[]>([])
const listQuery = ref('')
const libraryFilter = ref<'all' | 'new' | 'library'>('all')
const lyricMatchedCount = computed(() => items.value.filter((i) => i.lyricText).length)
const newTrackCount = computed(() => items.value.filter((i) => !i.inLibrary).length)
const inLibraryCount = computed(() => items.value.filter((i) => i.inLibrary).length)

const filteredItems = computed(() => {
  let list = items.value
  if (libraryFilter.value === 'new') {
    list = list.filter((row) => !row.inLibrary)
  } else if (libraryFilter.value === 'library') {
    list = list.filter((row) => row.inLibrary)
  }
  const q = listQuery.value.trim().toLowerCase()
  if (!q) return list
  return list.filter((row) => {
    const artists = (row.artists || []).join(' ')
    const hay = `${row.name || ''} ${artists} ${row.album || ''} ${row.fileName || ''}`.toLowerCase()
    return hay.includes(q)
  })
})

const uploadingId = ref('')
const batchUploading = ref(false)
const singleUploading = ref(false)

/** 桌面端选中的本地文件元数据 */
const singleItem = ref<LocalAudioItem | null>(null)
/** 网页端选中的 File */
const webFile = ref<File | null>(null)
const webPreviewUrl = ref('')
const webFileInput = ref<HTMLInputElement | null>(null)

const singleForm = reactive({
  name: '',
  artists: '',
  album: '',
  lyricText: '',
})
const singleLrcName = ref('')
const webLrcInput = ref<HTMLInputElement | null>(null)

const progressVisible = ref(false)
const progressDone = ref(0)
const progressTotal = ref(0)
const progressText = ref('')
const progressStatus = ref<'' | 'success' | 'exception'>('')

type PendingRetry = {
  item: LocalAudioItem
  reason: string
  kind: 'skip' | 'fail'
}
const pendingRetries = ref<PendingRetry[]>([])
const retryVisible = ref(false)
const retryUploading = ref(false)
const retryingId = ref('')

const player = usePlayerStore()
const tableWrapRef = ref<HTMLElement | null>(null)
const tableRef = ref<TableInstance>()

const currentInUploadList = computed(() => {
  if (tab.value !== 'folder') return false
  const id = player.currentTrack?.id
  if (!id?.startsWith('local:')) return false
  const localId = id.slice('local:'.length)
  return filteredItems.value.some((i) => i.id === localId)
})

const { showLocate, locateCurrent } = usePlayingLocate({
  rootRef: tableWrapRef,
  hasCurrent: () => currentInUploadList.value,
  getActiveEl: () =>
    tableWrapRef.value?.querySelector(
      '.el-table__body tr.is-playing-row',
    ) as HTMLElement | null,
  deps: () =>
    [
      player.currentTrack?.id,
      filteredItems.value.length,
      tab.value,
      listQuery.value,
      libraryFilter.value,
    ] as const,
})

function uploadRowKey(row: LocalAudioItem) {
  return row.id
}

function uploadRowClass({ row }: { row: LocalAudioItem }) {
  const classes: string[] = []
  if (player.currentTrack?.id === `local:${row.id}`) classes.push('is-playing-row')
  if (!row.inLibrary) classes.push('is-new-track-row')
  return classes.join(' ')
}

function sortItemsByLibrary(list: LocalAudioItem[]) {
  return [...list].sort((a, b) => {
    const an = a.inLibrary ? 1 : 0
    const bn = b.inLibrary ? 1 : 0
    if (an !== bn) return an - bn
    return (a.name || '').localeCompare(b.name || '', 'zh')
  })
}

async function markLibraryStatus(list: LocalAudioItem[]) {
  const hashes = list.map((i) => i.fileHash || '').filter(Boolean)
  let existing = new Set<string>()
  try {
    existing = await checkLibraryHashes(hashes)
  } catch (e) {
    console.warn('[markLibraryStatus]', e)
  }
  for (const item of list) {
    const hash = (item.fileHash || '').trim()
    item.inLibrary = Boolean(hash && existing.has(hash))
  }
  return sortItemsByLibrary(list)
}

function selectNewTracks() {
  const table = tableRef.value
  if (!table) return
  table.clearSelection()
  for (const row of filteredItems.value) {
    if (!row.inLibrary) table.toggleRowSelection(row, true)
  }
}

function markItemUploaded(item: LocalAudioItem) {
  item.inLibrary = true
  items.value = sortItemsByLibrary(items.value)
  triggerRef(items)
}

const progressPercent = computed(() => {
  if (!progressTotal.value) return 0
  return Math.round((progressDone.value / progressTotal.value) * 100)
})

const displayFileName = computed(
  () => singleItem.value?.fileName || webFile.value?.name || '',
)

const canPreview = computed(() => Boolean(singleItem.value || webFile.value))

function revokeWebPreview() {
  if (webPreviewUrl.value) {
    URL.revokeObjectURL(webPreviewUrl.value)
    webPreviewUrl.value = ''
  }
}

onBeforeUnmount(() => {
  revokeWebPreview()
})

function isUnknownArtist(item: LocalAudioItem) {
  const a = item.artists || []
  return !a.length || a.every((x) => !x || x === '未知歌手')
}

const DEFAULT_ARTIST = '未知歌手'
const DEFAULT_ALBUM = '未知专辑'
const MIN_UPLOAD_DURATION_MS = 30_000

function isTooShortAudio(durationMs: number) {
  return durationMs > 0 && durationMs < MIN_UPLOAD_DURATION_MS
}

function assertUploadDuration(item: LocalAudioItem) {
  if (isTooShortAudio(item.durationMs)) {
    throw new Error('音频时长过短（需至少 30 秒）')
  }
}

function probeBrowserAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    audio.preload = 'metadata'
    const done = (ms: number) => {
      URL.revokeObjectURL(url)
      resolve(ms)
    }
    audio.onloadedmetadata = () => {
      const sec = audio.duration
      done(Number.isFinite(sec) ? Math.round(sec * 1000) : 0)
    }
    audio.onerror = () => done(0)
    audio.src = url
  })
}

/** 上传前补齐歌手/专辑默认值（非必填） */
function applyUploadDefaults(item: LocalAudioItem) {
  if (isUnknownArtist(item)) {
    item.artists = [DEFAULT_ARTIST]
  }
  if (!(item.album || '').trim()) {
    item.album = DEFAULT_ALBUM
  }
  return {
    name: item.name,
    artists: item.artists.join(','),
    album: item.album,
    lyricText: item.lyricText || undefined,
  }
}

function setRowArtists(row: LocalAudioItem, value: string) {
  row.artists = value
    .split(/[,，/、]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function onNameCommit(row: LocalAudioItem, value: string) {
  row.name = value
}

function onArtistsCommit(row: LocalAudioItem, value: string) {
  setRowArtists(row, value)
}

function onAlbumCommit(row: LocalAudioItem, value: string) {
  row.album = value
}

function swapRow(row: LocalAudioItem, refresh = true) {
  const next = swapNameAndArtists({
    name: row.name || '',
    artists: row.artists || [],
  })
  row.name = next.name
  row.artists = next.artists.length ? next.artists : ['未知歌手']
  if (refresh) triggerRef(items)
}

function swapSelected() {
  const list = selected.value.length ? selected.value : []
  if (!list.length) {
    ElMessage.warning('请先勾选要互换的歌曲')
    return
  }
  for (const row of list) swapRow(row, false)
  triggerRef(items)
  ElMessage.success(`已互换 ${list.length} 首`)
}

function removeItemsByIds(ids: Set<string>) {
  if (!ids.size) return 0
  const before = items.value.length
  items.value = items.value.filter((i) => !ids.has(i.id))
  selected.value = selected.value.filter((i) => !ids.has(i.id))
  return before - items.value.length
}

function removeOne(row: LocalAudioItem) {
  const n = removeItemsByIds(new Set([row.id]))
  if (n) ElMessage.success(`已从列表移除「${row.name}」`)
}

async function removeSelected() {
  const list = selected.value
  if (!list.length) {
    ElMessage.warning('请先勾选要删除的歌曲')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认从上传列表移除选中的 ${list.length} 首？不会删除本地文件。`,
      '删除选中',
      { type: 'warning', confirmButtonText: '移除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  const n = removeItemsByIds(new Set(list.map((i) => i.id)))
  if (n) ElMessage.success(`已从列表移除 ${n} 首`)
}

function swapSingleForm() {
  const artists = singleForm.artists
    .split(/[,，/、]/)
    .map((s) => s.trim())
    .filter(Boolean)
  const next = swapNameAndArtists({ name: singleForm.name, artists })
  singleForm.name = next.name
  singleForm.artists = next.artists.join(',')
  if (singleItem.value) {
    singleItem.value.name = next.name
    singleItem.value.artists = next.artists.length ? next.artists : ['未知歌手']
  }
}

function clearLyric() {
  singleForm.lyricText = ''
  singleLrcName.value = ''
}

async function pickLrcFile() {
  if (!isDesktop) {
    webLrcInput.value?.click()
    return
  }
  try {
    const result = await window.wyAPI!.selectLrcFile?.()
    if (!result) {
      ElMessage.info('已取消选择')
      return
    }
    if (!result.lyricText) {
      ElMessage.warning('歌词文件为空')
      return
    }
    singleForm.lyricText = result.lyricText
    singleLrcName.value = result.fileName
    ElMessage.success(`已载入歌词：${result.fileName}`)
  } catch (e) {
    console.error('[pickLrcFile]', e)
    ElMessage.error(e instanceof Error ? e.message : '读取歌词失败')
  }
}

function onWebLrcChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const buf = reader.result
    if (!(buf instanceof ArrayBuffer)) {
      ElMessage.error('读取歌词失败')
      return
    }
    const text = decodeLyricBytes(buf).trim()
    if (!text) {
      ElMessage.warning('歌词文件为空')
      return
    }
    singleForm.lyricText = text
    singleLrcName.value = file.name
    ElMessage.success(`已载入歌词：${file.name}`)
  }
  reader.onerror = () => ElMessage.error('读取歌词失败')
  reader.readAsArrayBuffer(file)
  input.value = ''
}

function applyItemLyric(item: LocalAudioItem) {
  if (item.lyricText) {
    singleForm.lyricText = item.lyricText
    singleLrcName.value = item.lyricFileName || '已匹配 LRC'
  } else {
    singleForm.lyricText = ''
    singleLrcName.value = ''
  }
}

function onSelectionChange(rows: LocalAudioItem[]) {
  selected.value = rows
}

async function pickAndScan() {
  if (!isDesktop) {
    ElMessage.warning('文件夹扫描仅支持 Electron 桌面端，网页请用单曲上传')
    return
  }
  try {
    const folder = await window.wyAPI!.selectFolder()
    if (!folder) {
      ElMessage.info('已取消选择')
      return
    }
    folderPath.value = folder
    await doScan(folder)
  } catch (e) {
    console.error('[pickAndScan]', e)
    ElMessage.error(e instanceof Error ? e.message : '选择文件夹失败')
  }
}

async function rescan() {
  if (!folderPath.value) return
  await doScan(folderPath.value)
}

async function doScan(folder: string) {
  scanning.value = true
  selected.value = []
  listQuery.value = ''
  libraryFilter.value = 'all'
  try {
    const result = await window.wyAPI!.scanFolder(folder)
    const sorted = await markLibraryStatus(result.items)
    items.value = sorted
    const matched = result.lyricMatched ?? result.items.filter((i) => i.lyricText).length
    const deduped = result.deduped || 0
    const shortFiltered = result.shortFiltered || 0
    const newCount = sorted.filter((i) => !i.inLibrary).length
    const existCount = sorted.length - newCount
    const parts = [`扫描完成：${result.total} 首`]
    if (newCount) parts.push(`新曲 ${newCount}`)
    if (existCount) parts.push(`曲库已有 ${existCount}`)
    if (matched) parts.push(`已匹配歌词 ${matched} 首`)
    if (deduped) parts.push(`已过滤重复 ${deduped} 首`)
    if (shortFiltered) parts.push(`已过滤过短（<30秒）${shortFiltered} 首`)
    ElMessage.success(parts.join('，'))
    if (newCount && existCount) {
      libraryFilter.value = 'new'
    }
  } catch (e) {
    console.error('[scan]', e)
    ElMessage.error(e instanceof Error ? `扫描失败：${e.message}` : '扫描失败')
  } finally {
    scanning.value = false
  }
}

function playOne(item: LocalAudioItem) {
  const source = filteredItems.value.length ? filteredItems.value : items.value.length ? items.value : [item]
  player.playTrack(localItemToQueueTrack(item), source.map(localItemToQueueTrack))
}

function playAll() {
  const list = filteredItems.value
  if (!list.length) return
  player.setQueue(list.map(localItemToQueueTrack), 0)
}

async function uploadOne(item: LocalAudioItem) {
  uploadingId.value = item.id
  try {
    assertUploadDuration(item)
    const result = await uploadLocalItem(item, applyUploadDefaults(item))
    markItemUploaded(item)
    ElMessage.success(result.message || `「${item.name}」上传成功`)
  } catch (e) {
    console.error(e)
    ElMessage.error(e instanceof Error ? e.message : '上传失败')
  } finally {
    uploadingId.value = ''
  }
}

async function uploadSelected() {
  const list = selected.value
  if (!list.length) {
    ElMessage.warning('请先勾选要上传的歌曲')
    return
  }
  batchUploading.value = true
  progressVisible.value = true
  progressDone.value = 0
  progressTotal.value = list.length
  progressStatus.value = ''
  pendingRetries.value = []
  let okCount = 0
  for (const item of list) {
    progressText.value = `正在上传：${item.name}`
    try {
      assertUploadDuration(item)
      await uploadLocalItem(item, applyUploadDefaults(item))
      item.inLibrary = true
      okCount += 1
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: string }).message)
          : '上传失败'
      pendingRetries.value.push({ item, reason: msg, kind: 'fail' })
    }
    progressDone.value += 1
  }
  if (okCount) {
    items.value = sortItemsByLibrary(items.value)
    triggerRef(items)
  }
  progressText.value = `完成：成功 ${okCount} / ${list.length}`
  progressStatus.value = pendingRetries.value.length ? 'exception' : 'success'
  batchUploading.value = false
  if (okCount) ElMessage.success(`成功上传 ${okCount} 首`)
  if (pendingRetries.value.length) {
    ElMessage.warning(`${pendingRetries.value.length} 首上传失败，可在弹窗中调整后重试`)
    retryVisible.value = true
  }
}

function openRetryDialog() {
  progressVisible.value = false
  retryVisible.value = true
}

async function doUploadItem(item: LocalAudioItem) {
  assertUploadDuration(item)
  await uploadLocalItem(item, applyUploadDefaults(item))
}

async function retryUploadOne(row: PendingRetry, index: number) {
  retryingId.value = row.item.id
  try {
    await doUploadItem(row.item)
    markItemUploaded(row.item)
    pendingRetries.value.splice(index, 1)
    ElMessage.success(`「${row.item.name}」上传成功`)
    if (!pendingRetries.value.length) {
      retryVisible.value = false
      ElMessage.success('待处理项已全部上传完成')
    }
  } catch (e: unknown) {
    const msg =
      e && typeof e === 'object' && 'message' in e
        ? String((e as { message: string }).message)
        : '上传失败'
    row.reason = msg
    row.kind = 'fail'
    ElMessage.error(msg)
  } finally {
    retryingId.value = ''
  }
}

async function retryUploadAll() {
  const list = [...pendingRetries.value]
  if (!list.length) return
  retryUploading.value = true
  let okCount = 0
  const remain: PendingRetry[] = []
  for (const row of list) {
    retryingId.value = row.item.id
    try {
      await doUploadItem(row.item)
      row.item.inLibrary = true
      okCount += 1
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: string }).message)
          : '上传失败'
      remain.push({ item: row.item, reason: msg, kind: 'fail' })
    }
  }
  retryingId.value = ''
  pendingRetries.value = remain
  if (okCount) {
    items.value = sortItemsByLibrary(items.value)
    triggerRef(items)
  }
  retryUploading.value = false
  if (okCount) ElMessage.success(`成功上传 ${okCount} 首`)
  if (!remain.length) {
    retryVisible.value = false
    ElMessage.success('待处理项已全部上传完成')
  } else {
    ElMessage.warning(`仍有 ${remain.length} 首失败，请检查后重试`)
  }
}

function triggerWebFile() {
  webFileInput.value?.click()
}

async function onWebFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const durationMs = await probeBrowserAudioDuration(file)
  if (isTooShortAudio(durationMs)) {
    input.value = ''
    ElMessage.warning('音频时长过短（需至少 30 秒），已忽略')
    return
  }

  revokeWebPreview()
  singleItem.value = null
  webFile.value = file
  // 仅作展示/兼容；真正播放用 File 强制 MIME
  webPreviewUrl.value = URL.createObjectURL(file)

  const parsed = parseAudioFilename(file.name)
  singleForm.name = parsed.name
  singleForm.artists = parsed.artists.join(',')
  singleForm.album = ''
  singleForm.lyricText = ''
  singleLrcName.value = ''
}

async function pickSingleFile() {
  if (!isDesktop) {
    triggerWebFile()
    return
  }
  try {
    const paths = await window.wyAPI!.selectAudioFiles(false)
    if (!paths.length) {
      ElMessage.info('已取消选择')
      return
    }
    const { items: parsed, shortFiltered } = await window.wyAPI!.parseFiles(paths)
    if (!parsed.length) {
      ElMessage.warning(
        shortFiltered ? '音频时长过短（需至少 30 秒），已忽略' : '未识别到有效音频',
      )
      return
    }
    revokeWebPreview()
    webFile.value = null
    singleItem.value = parsed[0]
    singleForm.name = parsed[0].name
    singleForm.artists = isUnknownArtist(parsed[0]) ? '' : parsed[0].artists.join(',')
    singleForm.album = parsed[0].album
    applyItemLyric(parsed[0])
    if (parsed[0].lyricFileName) {
      ElMessage.success(`已自动匹配歌词：${parsed[0].lyricFileName}`)
    }
  } catch (e) {
    console.error('[pickSingleFile]', e)
    ElMessage.error(e instanceof Error ? e.message : '选择文件失败')
  }
}

function previewSingle() {
  if (isDesktop && singleItem.value) {
    playOne(singleItem.value)
    return
  }
  if (webFile.value) {
    const artists = singleForm.artists
      ? singleForm.artists
          .split(/[,，/]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined
    const track = browserFileToQueueTrack(webFile.value, {
      name: singleForm.name || undefined,
      artists,
      previewUrl: webPreviewUrl.value || undefined,
    })
    player.playTrack(track, [track])
    return
  }
  ElMessage.warning('请先选择音频文件')
}

async function submitSingle() {
  if (!singleItem.value && !webFile.value) {
    ElMessage.warning('请先选择音频文件')
    return
  }
  const artists = singleForm.artists.trim() || DEFAULT_ARTIST
  const album = singleForm.album.trim() || DEFAULT_ALBUM
  singleForm.artists = artists
  singleForm.album = album
  singleUploading.value = true
  try {
    if (isDesktop && singleItem.value) {
      assertUploadDuration(singleItem.value)
      setRowArtists(singleItem.value, artists)
      singleItem.value.name = singleForm.name || singleItem.value.name
      singleItem.value.album = album
      const result = await uploadLocalItem(singleItem.value, {
        name: singleForm.name,
        artists,
        album,
        lyricText: singleForm.lyricText,
      })
      ElMessage.success(result.message || '上传成功')
      return
    }

    if (webFile.value) {
      const durationMs = await probeBrowserAudioDuration(webFile.value)
      if (isTooShortAudio(durationMs)) {
        ElMessage.warning('音频时长过短（需至少 30 秒），已忽略')
        return
      }
      const result = await uploadBrowserFile(webFile.value, {
        name: singleForm.name,
        artists,
        album,
        lyricText: singleForm.lyricText,
      })
      ElMessage.success(result?.message || '上传成功')
      const uploaded = result?.data
      // 先清掉预览 blob，避免播放器指向已释放的地址
      const oldPreview = webPreviewUrl.value
      player.clearIfPreview(oldPreview)
      revokeWebPreview()
      webFile.value = null
      if (webFileInput.value) webFileInput.value.value = ''
      // 自动播放刚上传的曲目（服务端返回）
      if (uploaded && typeof uploaded === 'object' && 'id' in (uploaded as object)) {
        player.playUploadedTrack(uploaded as import('@wy-music/shared').TrackDto)
      }
      return
    }

    ElMessage.warning('请先选择音频文件')
  } catch (e) {
    console.error('[submitSingle]', e)
  } finally {
    singleUploading.value = false
  }
}
</script>

<style scoped lang="scss">
.upload-page {
  h2 {
    margin: 0 0 8px;
  }
}
.upload-table-wrap {
  position: relative;
}
:deep(.el-table .is-playing-row) {
  td {
    color: #ec4141;
  }
}
:deep(.el-table .is-new-track-row) {
  td {
    background-color: rgba(236, 65, 65, 0.04);
  }
}
.lib-tag {
  display: inline-block;
  padding: 0 6px;
  font-size: 12px;
  line-height: 20px;
  border-radius: 3px;
}
.lib-new {
  color: #ec4141;
  background: rgba(236, 65, 65, 0.12);
  font-weight: 600;
}
.lib-exist {
  color: #909399;
  background: #f4f4f5;
}
.library-filter {
  margin-left: 4px;
}
.tip {
  color: #888;
  margin: 0 0 12px;
  font-size: 13px;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.folder-path {
  color: #666;
  font-size: 12px;
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.count {
  color: #ec4141;
  font-size: 13px;
}
.batch-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.list-search {
  width: 240px;
  margin-left: auto;
}
.filter-count {
  color: #888;
  font-size: 12px;
}
.name-artist-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  .el-input {
    flex: 1;
  }
}
.form {
  max-width: 640px;
  margin-top: 8px;
}
.single-pick {
  display: flex;
  align-items: center;
  gap: 12px;
}
.file-input {
  display: none;
}
.file-name {
  color: #666;
  font-size: 13px;
}
.lyric-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.lrc-ok {
  color: #67c23a;
  font-size: 12px;
}
.lrc-miss {
  color: #ccc;
  font-size: 12px;
}
.hint {
  margin-top: 6px;
  font-size: 12px;
  color: #999;
  &.warn {
    color: #e6a23c;
  }
}
.progress-text {
  margin-top: 12px;
  color: #666;
}
.retry-hint {
  margin: 12px 0 8px;
  color: #e6a23c;
  font-size: 13px;
}
.retry-toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}
.reason-skip {
  color: #e6a23c;
  font-size: 12px;
}
.reason-fail {
  color: #f56c6c;
  font-size: 12px;
}
</style>
