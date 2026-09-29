<template>
  <div ref="rootRef" class="song-list" :class="{ 'is-batch': batchMode }">
    <div v-if="batchMode" class="batch-bar">
      <div class="batch-actions">
        <button
          type="button"
          class="batch-play"
          title="播放选中"
          :disabled="!selectedCount"
          @click="batchPlay"
        >
          <span class="iconfont icon-play batch-play-ico" aria-hidden="true" />
        </button>
        <button type="button" class="batch-btn" :disabled="!selectedCount" @click="batchAddQueue">
          <el-icon :size="16"><List /></el-icon>
          <span>添加至播放列表</span>
        </button>
        <button type="button" class="batch-btn" disabled title="暂未开放">
          <el-icon :size="16"><Download /></el-icon>
          <span>下载</span>
        </button>
        <button type="button" class="batch-btn" :disabled="!selectedCount" @click="batchCollect">
          <el-icon :size="16"><FolderAdd /></el-icon>
          <span>收藏</span>
        </button>
        <button
          v-if="canBatchDelete"
          type="button"
          class="batch-btn"
          :disabled="!selectedCount"
          @click="batchDelete"
        >
          <el-icon :size="16"><Delete /></el-icon>
          <span>删除</span>
        </button>
      </div>
      <button type="button" class="batch-done" @click="exitBatch">完成</button>
    </div>

    <div class="table-head" :class="{ batch: batchMode }">
      <template v-if="batchMode">
        <label class="col-check">
          <input
            type="checkbox"
            :checked="allSelected"
            :indeterminate.prop="partialSelected"
            @change="toggleSelectAll"
          />
        </label>
        <span class="col-select-label">全选（共{{ tracks.length }}首）</span>
        <span class="col-album">专辑</span>
        <span class="col-like">喜欢</span>
        <span class="col-dur">时长</span>
      </template>
      <template v-else>
        <span class="col-idx">#</span>
        <span class="col-title">标题</span>
        <span class="col-album">专辑</span>
        <span class="col-like">喜欢</span>
        <span class="col-dur">时长</span>
      </template>
    </div>

    <div
      v-for="(row, idx) in tracks"
      :key="row.id"
      class="song-row"
      :data-track-id="row.id"
      :class="{
        playing: isPlaying(row),
        active: isCurrent(row),
        checked: batchMode && selected.has(row.id),
      }"
      @click="onRowClick(row)"
      @dblclick="onRowDblclick(row)"
      @contextmenu.prevent="onRowContext($event, row)"
    >
      <div v-if="batchMode" class="col-check" @click.stop>
        <input
          type="checkbox"
          :checked="selected.has(row.id)"
          @change="toggleSelect(row.id)"
        />
      </div>
      <div v-else class="col-idx">
        <span v-if="isPlaying(row)" class="eq"><i /><i /><i /></span>
        <button v-else class="idx-play" type="button" @click="playOne(row)">
          <span class="num">{{ String(idx + 1).padStart(2, '0') }}</span>
          <span class="iconfont icon-play play-ico" aria-hidden="true" />
        </button>
      </div>

      <div class="col-title">
        <div
          class="thumb"
          :style="coverStyle(row)"
          @click.stop="onThumbClick(row)"
        />
        <div class="title-meta">
          <div class="name-line">
            <span class="name" :title="row.name">{{ row.name }}</span>
            <div v-if="!batchMode" class="row-actions">
              <button type="button" title="下载" class="disabled-act" @click.stop>
                <el-icon><Download /></el-icon>
              </button>
              <button type="button" title="收藏到歌单" @click.stop="onCollect(row)">
                <el-icon><FolderAdd /></el-icon>
              </button>
              <button type="button" title="评论" @click.stop="onComments(row)">
                <el-icon><ChatDotRound /></el-icon>
              </button>
              <button type="button" title="更多" @click.stop="openMenu($event, row)">
                <el-icon><MoreFilled /></el-icon>
              </button>
            </div>
          </div>
          <div class="sub">
            <span v-if="qualityTag(row)" class="badge">{{ qualityTag(row) }}</span>
            <span class="artists">{{ row.artists?.join(' / ') || '未知歌手' }}</span>
          </div>
        </div>
      </div>

      <div class="col-album" :title="row.album || ''">{{ row.album || '-' }}</div>

      <div class="col-like">
        <button class="like-btn" type="button" @click.stop="toggleLike(row)">
          <el-icon :size="16" :color="row.liked ? '#ec4141' : '#bbb'">
            <StarFilled v-if="row.liked" />
            <Star v-else />
          </el-icon>
        </button>
      </div>

      <div class="col-dur">{{ formatDuration(row.durationMs) }}</div>
    </div>

    <el-empty v-if="!tracks.length" :description="emptyText" :image-size="72" />

    <TrackContextMenu
      :visible="menu.visible"
      :x="menu.x"
      :y="menu.y"
      :track="menu.track"
      :allow-delete="allowDelete"
      :allow-remove="allowRemove"
      @close="closeMenu"
      @action="onMenuAction"
    />

    <PlayingLocateFab :visible="showLocate && !batchMode" @click="locateCurrent" />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ChatDotRound,
  Delete,
  Download,
  FolderAdd,
  List,
  MoreFilled,
  Star,
  StarFilled,
} from '@element-plus/icons-vue'
import type { TrackDto } from '@wy-music/shared'
import { http, mediaUrl, streamUrl } from '../services/http'
import { usePlayerStore } from '../stores/player'
import { useUiStore } from '../stores/ui'
import { useUserStore } from '../stores/user'
import { formatDuration } from '../services/localUpload'
import { usePlayingLocate } from '../composables/usePlayingLocate'
import TrackContextMenu from './TrackContextMenu.vue'
import PlayingLocateFab from './PlayingLocateFab.vue'

const props = withDefaults(
  defineProps<{
    tracks: TrackDto[]
    allowDelete?: boolean
    allowRemove?: boolean
    playlistId?: string
    emptyText?: string
    batchMode?: boolean
  }>(),
  {
    allowDelete: true,
    allowRemove: false,
    emptyText: '暂无歌曲',
    batchMode: false,
  },
)

const emit = defineEmits<{
  refresh: []
  'update:batchMode': [boolean]
}>()

const router = useRouter()
const player = usePlayerStore()
const ui = useUiStore()
const user = useUserStore()
const rootRef = ref<HTMLElement | null>(null)
const selected = ref<Set<string>>(new Set())

const batchMode = computed({
  get: () => props.batchMode,
  set: (v: boolean) => emit('update:batchMode', v),
})

const selectedCount = computed(() => selected.value.size)
const allSelected = computed(
  () => props.tracks.length > 0 && props.tracks.every((t) => selected.value.has(t.id)),
)
const partialSelected = computed(() => selectedCount.value > 0 && !allSelected.value)
const canBatchDelete = computed(() => props.allowDelete || (props.allowRemove && !!props.playlistId))

const selectedTracks = computed(() => props.tracks.filter((t) => selected.value.has(t.id)))

const currentInList = computed(() => {
  const id = player.currentTrack?.id
  if (!id) return false
  return props.tracks.some((t) => t.id === id)
})

const { showLocate, locateCurrent } = usePlayingLocate({
  rootRef,
  hasCurrent: () => currentInList.value && !batchMode.value,
  getActiveEl: () => {
    const id = player.currentTrack?.id
    if (!id || !rootRef.value) return null
    return rootRef.value.querySelector(
      `.song-row[data-track-id="${CSS.escape(id)}"]`,
    ) as HTMLElement | null
  },
  deps: () => [player.currentTrack?.id, props.tracks.length, batchMode.value] as const,
})

const menu = reactive({
  visible: false,
  x: 0,
  y: 0,
  track: null as TrackDto | null,
})

watch(
  () => props.batchMode,
  (v) => {
    if (!v) selected.value = new Set()
  },
)

watch(
  () => props.tracks.map((t) => t.id).join(','),
  () => {
    if (!selected.value.size) return
    const ids = new Set(props.tracks.map((t) => t.id))
    selected.value = new Set([...selected.value].filter((id) => ids.has(id)))
  },
)

function enterBatch() {
  batchMode.value = true
}

function exitBatch() {
  batchMode.value = false
  selected.value = new Set()
}

defineExpose({ enterBatch, exitBatch })

function toggleSelect(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function toggleSelectAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked
  selected.value = checked ? new Set(props.tracks.map((t) => t.id)) : new Set()
}

function onRowClick(row: TrackDto) {
  if (batchMode.value) toggleSelect(row.id)
}

function onRowDblclick(row: TrackDto) {
  if (batchMode.value) return
  playOne(row)
}

function onRowContext(e: MouseEvent, row: TrackDto) {
  if (batchMode.value) return
  openMenu(e, row)
}

function coverStyle(t: TrackDto) {
  const u = mediaUrl(t.coverUrl)
  return u
    ? { backgroundImage: `url(${u})` }
    : { background: 'linear-gradient(135deg,#f3c4c4,#ec4141)' }
}

function qualityTag(t: TrackDto): string | null {
  const size = Number(t.fileSize || 0)
  const dur = Number(t.durationMs || 0)
  if (size > 0 && dur > 0) {
    const kbps = (size * 8) / (dur / 1000) / 1000
    if (kbps >= 900) return 'Hi-Res'
    if (kbps >= 300) return 'SQ'
    if (kbps >= 180) return 'HQ'
  }
  return null
}

function isCurrent(row: TrackDto) {
  return player.currentTrack?.id === row.id
}

function isPlaying(row: TrackDto) {
  return isCurrent(row) && player.playing
}

function playOne(row: TrackDto) {
  player.playTrack(row, props.tracks)
}

function onThumbClick(row: TrackDto) {
  if (batchMode.value) {
    toggleSelect(row.id)
    return
  }
  playOne(row)
}

function batchPlay() {
  const list = selectedTracks.value
  if (!list.length) return
  player.setQueue(list, 0)
}

function batchAddQueue() {
  const list = selectedTracks.value
  if (!list.length) return
  const added = player.appendToQueue(list)
  ElMessage.success(added ? `已添加 ${added} 首到播放列表` : '所选歌曲已在播放列表中')
}

function batchCollect() {
  const list = selectedTracks.value
  if (!list.length) return
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  ui.openCollectMany(list)
}

async function batchDelete() {
  const list = selectedTracks.value
  if (!list.length) return
  try {
    if (props.allowRemove && props.playlistId) {
      await ElMessageBox.confirm(`确定从歌单中删除选中的 ${list.length} 首歌曲？`, '删除', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      })
      for (const t of list) {
        await http.delete(`/api/playlists/${props.playlistId}/tracks/${t.id}`)
      }
      ElMessage.success('已从歌单中删除')
    } else if (props.allowDelete) {
      await ElMessageBox.confirm(
        `确定删除选中的 ${list.length} 首歌曲？此操作不可恢复。`,
        '删除歌曲',
        {
          type: 'warning',
          confirmButtonText: '删除',
          cancelButtonText: '取消',
        },
      )
      for (const t of list) {
        await http.delete(`/api/tracks/${t.id}`)
      }
      ElMessage.success('已删除')
    }
    selected.value = new Set()
    emit('refresh')
  } catch {
    /* cancel */
  }
}

function onCollect(row: TrackDto) {
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  ui.openCollect(row)
}

function onComments(row: TrackDto) {
  ui.openPageComments(row)
  router.push(`/comment/${row.id}`)
}

async function toggleLike(row: TrackDto) {
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  const { data } = await http.post(`/api/likes/${row.id}`)
  row.liked = data.data.liked
}

function openMenu(e: MouseEvent, track: TrackDto) {
  menu.track = track
  menu.x = Math.min(e.clientX, window.innerWidth - 200)
  menu.y = Math.min(e.clientY, window.innerHeight - 360)
  menu.visible = true
}

function closeMenu() {
  menu.visible = false
  menu.track = null
}

async function onMenuAction(action: string) {
  const track = menu.track
  closeMenu()
  if (!track) return
  if (action === 'play') playOne(track)
  else if (action === 'next') {
    player.playNext(track)
    ElMessage.success('已添加到下一首播放')
  } else if (action === 'comments') onComments(track)
  else if (action === 'collect') onCollect(track)
  else if (action === 'like') await toggleLike(track)
  else if (action === 'copy') {
    try {
      await navigator.clipboard.writeText(streamUrl(track.id))
      ElMessage.success('链接已复制')
    } catch {
      ElMessage.info(streamUrl(track.id))
    }
  } else if (action === 'remove' && props.playlistId) {
    try {
      await ElMessageBox.confirm(`确定将「${track.name}」从歌单中删除？`, '提示', {
        type: 'warning',
      })
      await http.delete(`/api/playlists/${props.playlistId}/tracks/${track.id}`)
      ElMessage.success('已移除')
      emit('refresh')
    } catch {
      /* cancel */
    }
  } else if (action === 'delete') {
    try {
      await ElMessageBox.confirm(`确定删除「${track.name}」？此操作不可恢复。`, '删除歌曲', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      })
      await http.delete(`/api/tracks/${track.id}`)
      ElMessage.success('已删除')
      emit('refresh')
    } catch {
      /* cancel */
    }
  }
}
</script>

<style scoped lang="scss">
.song-list {
  width: 100%;
}
.batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  padding: 4px 0 8px;
}
.batch-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}
.batch-play {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: #ec4141;
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
  flex-shrink: 0;
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  &:not(:disabled):hover {
    background: #e03535;
  }
}
.batch-btn {
  height: 32px;
  padding: 0 14px;
  border: 1px solid #e0e0e0;
  border-radius: 16px;
  background: #fff;
  color: #333;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  &:hover:not(:disabled) {
    background: #f5f5f5;
  }
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}
.batch-done {
  border: none;
  background: transparent;
  color: #666;
  font-size: 14px;
  cursor: pointer;
  padding: 6px 8px;
  flex-shrink: 0;
  &:hover {
    color: #ec4141;
  }
}
.table-head,
.song-row {
  display: grid;
  grid-template-columns: 48px minmax(180px, 1.4fr) minmax(100px, 1fr) 48px 56px;
  gap: 8px;
  align-items: center;
  padding: 0 8px;
}
.table-head.batch,
.song-row.checked,
.is-batch .song-row {
  grid-template-columns: 40px minmax(180px, 1.4fr) minmax(100px, 1fr) 48px 56px;
}
.table-head {
  height: 36px;
  font-size: 12px;
  color: #999;
  border-bottom: 1px solid #f0f0f0;
}
.col-select-label {
  font-size: 13px;
  color: #666;
}
.col-check {
  display: grid;
  place-items: center;
  input {
    width: 16px;
    height: 16px;
    accent-color: #ec4141;
    cursor: pointer;
  }
}
.song-row {
  height: 56px;
  border-radius: 6px;
  cursor: default;
  &:hover {
    background: #f5f5f5;
    .row-actions {
      display: flex;
    }
    .num {
      display: none;
    }
    .play-ico {
      display: inline-flex;
    }
  }
  &.checked {
    background: #f5f5f5;
  }
  &.active .name,
  &.playing .name,
  &.active .artists,
  &.playing .artists {
    color: #ec4141;
  }
}
.is-batch .song-row {
  cursor: pointer;
}
.col-idx {
  display: grid;
  place-items: center;
}
.idx-play {
  border: none;
  background: transparent;
  width: 28px;
  height: 28px;
  padding: 0;
  cursor: pointer;
  color: #999;
  display: grid;
  place-items: center;
}
.num {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.play-ico {
  display: none;
  font-size: 16px;
  color: #666;
  line-height: 1;
}
.batch-play-ico {
  font-size: 18px;
  line-height: 1;
  color: #fff;
}
.eq {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
  i {
    display: block;
    width: 2px;
    background: #ec4141;
    border-radius: 1px;
    animation: eq 0.8s ease-in-out infinite;
    &:nth-child(1) {
      height: 6px;
      animation-delay: 0s;
    }
    &:nth-child(2) {
      height: 12px;
      animation-delay: 0.15s;
    }
    &:nth-child(3) {
      height: 8px;
      animation-delay: 0.3s;
    }
  }
}
@keyframes eq {
  0%,
  100% {
    transform: scaleY(0.5);
  }
  50% {
    transform: scaleY(1);
  }
}
.col-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.thumb {
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  border-radius: 4px;
  background-size: cover;
  background-position: center;
  cursor: pointer;
}
.title-meta {
  min-width: 0;
  flex: 1;
}
.name-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.name {
  font-size: 14px;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row-actions {
  display: none;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  button {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: #666;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    &:hover {
      background: #ebebeb;
      color: #333;
    }
  }
  .disabled-act {
    opacity: 0.35;
    cursor: not-allowed;
  }
}
.sub {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  min-width: 0;
}
.badge {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 2px;
  color: #c8a45c;
  border: 1px solid rgba(200, 164, 92, 0.55);
}
.artists {
  font-size: 12px;
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.col-album {
  font-size: 13px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.col-like {
  display: grid;
  place-items: center;
}
.like-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  &:hover {
    background: rgba(236, 65, 65, 0.08);
  }
}
.col-dur {
  font-size: 13px;
  color: #999;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 900px) {
  .table-head,
  .song-row {
    grid-template-columns: 48px 1fr 48px 56px;
  }
  .table-head.batch,
  .is-batch .song-row {
    grid-template-columns: 40px 1fr 48px 56px;
  }
  .col-album {
    display: none;
  }
}
</style>
