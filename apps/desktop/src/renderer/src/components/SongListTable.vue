<template>
  <div ref="rootRef" class="song-list">
    <div class="table-head">
      <span class="col-idx">#</span>
      <span class="col-title">标题</span>
      <span class="col-album">专辑</span>
      <span class="col-like">喜欢</span>
      <span class="col-dur">时长</span>
    </div>

    <div
      v-for="(row, idx) in tracks"
      :key="row.id"
      class="song-row"
      :data-track-id="row.id"
      :class="{ playing: isPlaying(row), active: isCurrent(row) }"
      @dblclick="playOne(row)"
      @contextmenu.prevent="openMenu($event, row)"
    >
      <div class="col-idx">
        <span v-if="isPlaying(row)" class="eq"><i /><i /><i /></span>
        <button v-else class="idx-play" type="button" @click="playOne(row)">
          <span class="num">{{ String(idx + 1).padStart(2, '0') }}</span>
          <el-icon class="play-ico"><VideoPlay /></el-icon>
        </button>
      </div>

      <div class="col-title">
        <div class="thumb" :style="coverStyle(row)" @click="playOne(row)" />
        <div class="title-meta">
          <div class="name-line">
            <span class="name" :title="row.name">{{ row.name }}</span>
            <div class="row-actions">
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

    <el-empty v-if="!tracks.length" description="暂无歌曲" :image-size="72" />

    <TrackContextMenu
      :visible="menu.visible"
      :x="menu.x"
      :y="menu.y"
      :track="menu.track"
      :allow-delete="allowDelete"
      @close="closeMenu"
      @action="onMenuAction"
    />

    <PlayingLocateFab :visible="showLocate" @click="locateCurrent" />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ChatDotRound,
  Download,
  FolderAdd,
  MoreFilled,
  Star,
  StarFilled,
  VideoPlay,
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
  }>(),
  { allowDelete: true },
)

const emit = defineEmits<{ refresh: [] }>()

const router = useRouter()
const player = usePlayerStore()
const ui = useUiStore()
const user = useUserStore()
const rootRef = ref<HTMLElement | null>(null)

const currentInList = computed(() => {
  const id = player.currentTrack?.id
  if (!id) return false
  return props.tracks.some((t) => t.id === id)
})

const { showLocate, locateCurrent } = usePlayingLocate({
  rootRef,
  hasCurrent: () => currentInList.value,
  getActiveEl: () => {
    const id = player.currentTrack?.id
    if (!id || !rootRef.value) return null
    return rootRef.value.querySelector(
      `.song-row[data-track-id="${CSS.escape(id)}"]`,
    ) as HTMLElement | null
  },
  deps: () => [player.currentTrack?.id, props.tracks.length] as const,
})

const menu = reactive({
  visible: false,
  x: 0,
  y: 0,
  track: null as TrackDto | null,
})

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
.table-head,
.song-row {
  display: grid;
  grid-template-columns: 48px minmax(180px, 1.4fr) minmax(100px, 1fr) 48px 56px;
  gap: 8px;
  align-items: center;
  padding: 0 8px;
}
.table-head {
  height: 36px;
  font-size: 12px;
  color: #999;
  border-bottom: 1px solid #f0f0f0;
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
  &.active .name,
  &.playing .name,
  &.active .artists,
  &.playing .artists {
    color: #ec4141;
  }
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
  .col-album {
    display: none;
  }
}
</style>
