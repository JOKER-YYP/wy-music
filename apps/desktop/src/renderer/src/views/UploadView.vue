<template>
  <div class="upload-page">
    <h2>上传到公共曲库</h2>
    <p class="tip">
      支持 mp3 / wav / flac / m4a / aac，单文件不超过 50MB。
      <template v-if="isDesktop">
        桌面端可扫描文件夹批量上传；同目录下同名 <code>.lrc</code> 会自动匹配歌词。
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
          <el-button :disabled="!selected.length" @click="swapSelected">
            互换歌名/歌手（{{ selected.length || 0 }}）
          </el-button>
          <el-button :disabled="!items.length" @click="playAll">播放全部</el-button>
        </div>

        <el-table
          v-loading="scanning"
          :data="items"
          stripe
          height="calc(100vh - 320px)"
          @selection-change="onSelectionChange"
          @row-dblclick="playOne"
        >
          <el-table-column type="selection" width="48" />
          <el-table-column type="index" width="50" label="#" />
          <el-table-column prop="name" label="歌曲" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">
              <el-input
                v-if="editingCell === `${row.id}:name`"
                v-model="nameDraft"
                size="small"
                @click.stop
                @blur="commitNameEdit(row)"
                @keydown.enter="blurActiveInput"
              />
              <span
                v-else
                class="cell-edit"
                :title="row.name"
                @click.stop="startEditName(row)"
              >
                {{ row.name || '—' }}
              </span>
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
              <el-input
                v-if="editingCell === `${row.id}:artists`"
                v-model="artistDraft"
                size="small"
                :class="{ 'need-artist': isUnknownArtist(row) }"
                placeholder="必填，如：许嵩"
                @click.stop
                @blur="commitArtistEdit(row)"
                @keydown.enter="blurActiveInput"
              />
              <span
                v-else
                class="cell-edit"
                :class="{ 'need-artist-text': isUnknownArtist(row) }"
                :title="row.artists?.join(' / ') || ''"
                @click.stop="startEditArtists(row)"
              >
                {{ row.artists?.join(' / ') || '点击填写' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="album" label="专辑" min-width="120" show-overflow-tooltip />
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
          <el-table-column label="操作" width="180" fixed="right">
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
            </template>
          </el-table-column>
        </el-table>

        <el-empty v-if="!scanning && !items.length" description="请选择文件夹开始扫描" />
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
          <el-form-item label="歌手" required>
            <el-input
              v-model="singleForm.artists"
              placeholder="未解析到时请手动填写，多个歌手用逗号分隔"
            />
            <div v-if="!singleForm.artists.trim()" class="hint warn">未识别到歌手，请手动填写后再上传</div>
          </el-form-item>
          <el-form-item label="专辑">
            <el-input v-model="singleForm.album" />
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
      <ul v-if="failMessages.length" class="fail-list">
        <li v-for="(msg, i) in failMessages" :key="i">{{ msg }}</li>
      </ul>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { decodeLyricBytes, parseAudioFilename, swapNameAndArtists } from '@wy-music/shared'
import type { LocalAudioItem } from '../types/local'
import { usePlayerStore } from '../stores/player'
import {
  browserFileToQueueTrack,
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
const items = ref<LocalAudioItem[]>([])
const selected = ref<LocalAudioItem[]>([])
const lyricMatchedCount = computed(() => items.value.filter((i) => i.lyricText).length)
const uploadingId = ref('')
const batchUploading = ref(false)
const singleUploading = ref(false)
/** 仅编辑当前单元格，避免千行同时挂载 el-input；草稿写入避免每键触发表格重渲染 */
const editingCell = ref('')
const nameDraft = ref('')
const artistDraft = ref('')

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
const failMessages = ref<string[]>([])
const progressStatus = ref<'' | 'success' | 'exception'>('')

const player = usePlayerStore()

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

function setRowArtists(row: LocalAudioItem, value: string) {
  row.artists = value
    .split(/[,，/、]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function startEdit(rowId: string, field: 'name' | 'artists') {
  editingCell.value = `${rowId}:${field}`
  void nextTick(() => {
    const el = document.querySelector(
      '.el-table .el-input__inner, .el-table .el-input__wrapper input',
    ) as HTMLInputElement | null
    el?.focus()
    el?.select()
  })
}

function blurActiveInput() {
  const el = document.activeElement as HTMLElement | null
  el?.blur?.()
}

function startEditName(row: LocalAudioItem) {
  nameDraft.value = row.name || ''
  startEdit(row.id, 'name')
}

function commitNameEdit(row: LocalAudioItem) {
  if (editingCell.value !== `${row.id}:name`) return
  row.name = nameDraft.value.trim()
  editingCell.value = ''
  nameDraft.value = ''
}

function startEditArtists(row: LocalAudioItem) {
  artistDraft.value = row.artists?.join(' / ') || ''
  startEdit(row.id, 'artists')
}

function commitArtistEdit(row: LocalAudioItem) {
  if (editingCell.value !== `${row.id}:artists`) return
  setRowArtists(row, artistDraft.value)
  editingCell.value = ''
  artistDraft.value = ''
}

function swapRow(row: LocalAudioItem) {
  const next = swapNameAndArtists({
    name: row.name || '',
    artists: row.artists || [],
  })
  row.name = next.name
  row.artists = next.artists.length ? next.artists : ['未知歌手']
}

function swapSelected() {
  const list = selected.value.length ? selected.value : []
  if (!list.length) {
    ElMessage.warning('请先勾选要互换的歌曲')
    return
  }
  for (const row of list) swapRow(row)
  ElMessage.success(`已互换 ${list.length} 首`)
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

async function ensureArtistsFilled(item: LocalAudioItem): Promise<boolean> {
  if (!isUnknownArtist(item)) return true
  try {
    const { value } = await ElMessageBox.prompt(
      `「${item.name}」未识别到歌手，请填写后继续上传`,
      '填写歌手',
      {
        confirmButtonText: '确定',
        cancelButtonText: '跳过',
        inputPattern: /\S+/,
        inputErrorMessage: '歌手不能为空',
        inputPlaceholder: '例如：许嵩',
      },
    )
    setRowArtists(item, value.trim())
    return true
  } catch {
    return false
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
  try {
    const result = await window.wyAPI!.scanFolder(folder)
    items.value = result.items
    const matched = result.lyricMatched ?? result.items.filter((i) => i.lyricText).length
    ElMessage.success(
      matched
        ? `扫描完成：${result.total} 首音频，自动匹配歌词 ${matched} 首`
        : `扫描完成，共 ${result.total} 首音频`,
    )
  } catch (e) {
    console.error('[scan]', e)
    ElMessage.error(e instanceof Error ? `扫描失败：${e.message}` : '扫描失败')
  } finally {
    scanning.value = false
  }
}

function playOne(item: LocalAudioItem) {
  const source = items.value.length ? items.value : [item]
  const queue = source.map(localItemToQueueTrack)
  player.playTrack(localItemToQueueTrack(item), queue)
}

function playAll() {
  if (!items.value.length) return
  player.setQueue(items.value.map(localItemToQueueTrack), 0)
}

async function uploadOne(item: LocalAudioItem) {
  const ok = await ensureArtistsFilled(item)
  if (!ok) {
    ElMessage.info('已取消上传')
    return
  }
  uploadingId.value = item.id
  try {
    const result = await uploadLocalItem(item, {
      name: item.name,
      artists: item.artists.join(','),
      album: item.album,
      lyricText: item.lyricText || undefined,
    })
    ElMessage.success(result.message || `「${item.name}」上传成功`)
  } catch (e) {
    console.error(e)
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
  failMessages.value = []
  let okCount = 0
  for (const item of list) {
    progressText.value = `正在上传：${item.name}`
    const filled = await ensureArtistsFilled(item)
    if (!filled) {
      failMessages.value.push(`${item.name}：未填写歌手，已跳过`)
      progressDone.value += 1
      continue
    }
    try {
      await uploadLocalItem(item, {
        name: item.name,
        artists: item.artists.join(','),
        album: item.album,
        lyricText: item.lyricText || undefined,
      })
      okCount += 1
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: string }).message)
          : '失败'
      failMessages.value.push(`${item.name}：${msg}`)
    }
    progressDone.value += 1
  }
  progressText.value = `完成：成功 ${okCount} / ${list.length}`
  progressStatus.value = failMessages.value.length ? 'exception' : 'success'
  batchUploading.value = false
  if (okCount) ElMessage.success(`成功上传 ${okCount} 首`)
}

function triggerWebFile() {
  webFileInput.value?.click()
}

function onWebFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

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
    const parsed = await window.wyAPI!.parseFiles(paths)
    if (!parsed.length) {
      ElMessage.warning('未识别到有效音频')
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
  if (!singleForm.artists.trim()) {
    ElMessage.warning('请填写歌手名称')
    return
  }
  singleUploading.value = true
  try {
    if (isDesktop && singleItem.value) {
      setRowArtists(singleItem.value, singleForm.artists)
      singleItem.value.name = singleForm.name || singleItem.value.name
      const result = await uploadLocalItem(singleItem.value, {
        name: singleForm.name,
        artists: singleForm.artists,
        album: singleForm.album,
        lyricText: singleForm.lyricText,
      })
      ElMessage.success(result.message || '上传成功')
      return
    }

    if (webFile.value) {
      const result = await uploadBrowserFile(webFile.value, {
        name: singleForm.name,
        artists: singleForm.artists,
        album: singleForm.album,
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
:deep(.need-artist .el-input__wrapper) {
  box-shadow: 0 0 0 1px #e6a23c inset;
}
.cell-edit {
  display: inline-block;
  width: 100%;
  min-height: 24px;
  line-height: 24px;
  padding: 0 4px;
  border-radius: 4px;
  cursor: text;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
}
.need-artist-text {
  color: #e6a23c;
}
.progress-text {
  margin-top: 12px;
  color: #666;
}
.fail-list {
  margin: 8px 0 0;
  padding-left: 18px;
  color: #f56c6c;
  font-size: 12px;
  max-height: 160px;
  overflow: auto;
}
</style>
