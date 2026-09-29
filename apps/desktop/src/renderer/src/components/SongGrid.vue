<template>
  <div class="song-grid" :class="[`cols-${columns}`]">
    <div
      v-for="track in tracks"
      :key="track.id"
      class="song-row"
      @dblclick="onPlay(track)"
      @contextmenu.prevent="openMenu($event, track)"
    >
      <button class="cover-btn" type="button" :style="coverStyle(track)" @click="onPlay(track)">
        <span class="cover-play">
          <el-icon><VideoPlay /></el-icon>
        </span>
      </button>

      <div class="meta">
        <div class="name-line">
          <span class="name" :title="track.name">{{ track.name }}</span>
        </div>
        <div class="sub">
          <span v-if="track.liked" class="heart" title="已喜欢">♥</span>
          <span v-if="qualityTag(track)" class="badge badge-sq">{{ qualityTag(track) }}</span>
          <span class="badge badge-origin">原唱</span>
          <span class="artists">{{ track.artists?.join(' / ') || '未知歌手' }}</span>
        </div>
      </div>

      <div class="hover-actions">
        <button type="button" title="下载" class="disabled-act" @click.stop>
          <el-icon><Download /></el-icon>
        </button>
        <button type="button" title="喜欢" @click.stop="onLike(track)">
          <el-icon :color="track.liked ? '#ec4141' : undefined">
            <StarFilled v-if="track.liked" />
            <Star v-else />
          </el-icon>
        </button>
        <button type="button" title="更多" @click.stop="openMenu($event, track)">
          <el-icon><MoreFilled /></el-icon>
        </button>
      </div>
    </div>

    <el-empty v-if="!tracks.length" description="暂无歌曲" :image-size="72" />
  </div>

  <Teleport to="body">
    <div
      v-if="menu.visible"
      class="ctx-mask"
      @click="closeMenu"
      @contextmenu.prevent="closeMenu"
    >
      <ul
        class="ctx-menu"
        :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
        @click.stop
      >
        <li @click="run('play')">
          <el-icon><VideoPlay /></el-icon>
          <span>播放</span>
        </li>
        <li @click="run('next')">
          <el-icon><Plus /></el-icon>
          <span>下一首播放</span>
        </li>
        <li @click="run('comments')">
          <el-icon><ChatDotRound /></el-icon>
          <span>查看评论</span>
        </li>
        <li class="sep" />
        <li @click="run('collect')">
          <el-icon><FolderAdd /></el-icon>
          <span>收藏</span>
        </li>
        <li @click="run('like')">
          <el-icon><Star /></el-icon>
          <span>{{ menu.track?.liked ? '取消喜欢' : '喜欢' }}</span>
        </li>
        <li class="disabled">
          <el-icon><Download /></el-icon>
          <span>下载</span>
        </li>
        <li @click="run('copy')">
          <el-icon><Link /></el-icon>
          <span>复制链接</span>
        </li>
        <li class="sep" />
        <li class="disabled">
          <el-icon><RemoveFilled /></el-icon>
          <span>减少推荐</span>
        </li>
      </ul>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ChatDotRound,
  Download,
  FolderAdd,
  Link,
  MoreFilled,
  Plus,
  RemoveFilled,
  Star,
  StarFilled,
  VideoPlay,
} from '@element-plus/icons-vue'
import type { TrackDto } from '@wy-music/shared'
import { usePlayerStore } from '../stores/player'
import { useUserStore } from '../stores/user'
import { useUiStore } from '../stores/ui'
import { http, mediaUrl, streamUrl } from '../services/http'

const props = withDefaults(
  defineProps<{
    tracks: TrackDto[]
    columns?: 1 | 2 | 3
  }>(),
  { columns: 2 },
)

const emit = defineEmits<{ refresh: [] }>()

const router = useRouter()
const player = usePlayerStore()
const user = useUserStore()
const ui = useUiStore()

const menu = reactive({
  visible: false,
  x: 0,
  y: 0,
  track: null as TrackDto | null,
})

function coverStyle(track: TrackDto) {
  const url = mediaUrl(track.coverUrl)
  return url
    ? { backgroundImage: `url(${url})` }
    : { backgroundImage: 'linear-gradient(135deg,#ec4141,#ff8a80)' }
}

function qualityTag(track: TrackDto) {
  const mime = (track.mimeType || '').toLowerCase()
  if (mime.includes('flac') || mime.includes('wav')) return '超清母带'
  if (mime.includes('aac') || mime.includes('mp4')) return 'HQ'
  return ''
}

function onPlay(track: TrackDto) {
  player.playTrack(track, props.tracks)
}

function onCollect(track: TrackDto) {
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  ui.openCollect(track)
}

async function onLike(track: TrackDto) {
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  const { data } = await http.post(`/api/likes/${track.id}`)
  track.liked = data.data.liked
  emit('refresh')
}

function openMenu(e: MouseEvent, track: TrackDto) {
  menu.track = track
  const pad = 8
  const mw = 190
  const mh = 340
  menu.x = Math.min(e.clientX, window.innerWidth - mw - pad)
  menu.y = Math.min(e.clientY, window.innerHeight - mh - pad)
  menu.visible = true
}

function closeMenu() {
  menu.visible = false
  menu.track = null
}

async function run(action: string) {
  const track = menu.track
  closeMenu()
  if (!track) return

  switch (action) {
    case 'play':
      onPlay(track)
      break
    case 'next':
      player.playNext(track)
      ElMessage.success('已添加到下一首播放')
      break
    case 'collect':
      onCollect(track)
      break
    case 'comments':
      ui.openPageComments(track)
      router.push(`/comment/${track.id}`)
      break
    case 'like':
      await onLike(track)
      break
    case 'copy': {
      const url = streamUrl(track.id)
      try {
        await navigator.clipboard.writeText(url)
        ElMessage.success('链接已复制')
      } catch {
        ElMessage.info(url)
      }
      break
    }
    default:
      break
  }
}
</script>

<style scoped lang="scss">
.song-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
  &.cols-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 20px;
  }
  &.cols-3 {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 2px 16px;
  }
}
.song-row {
  display: grid;
  grid-template-columns: 48px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 8px;
  border-radius: 8px;
  cursor: default;
  min-width: 0;
  &:hover {
    background: #fff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
    .cover-play {
      opacity: 1;
    }
    .hover-actions {
      opacity: 1;
      pointer-events: auto;
    }
  }
}
.cover-btn {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  border: none;
  padding: 0;
  background-size: cover;
  background-position: center;
  position: relative;
  cursor: pointer;
  overflow: hidden;
  flex-shrink: 0;
}
.cover-play {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  opacity: 0;
  transition: opacity 0.15s;
}
.meta {
  min-width: 0;
}
.name-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.name {
  font-size: 14px;
  color: #222;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sub {
  margin-top: 5px;
  font-size: 12px;
  color: #999;
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  overflow: hidden;
}
.heart {
  color: #ec4141;
  font-size: 12px;
  flex-shrink: 0;
  line-height: 1;
}
.badge {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1;
  padding: 2px 3px;
  border-radius: 2px;
  border: 1px solid currentColor;
  transform: scale(0.92);
  transform-origin: left center;
}
.badge-sq {
  color: #c9a227;
}
.badge-origin {
  color: #ec4141;
}
.artists {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.hover-actions {
  display: flex;
  gap: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
  button {
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    border-radius: 50%;
    color: #888;
    cursor: pointer;
    display: grid;
    place-items: center;
    &:hover:not(.disabled-act) {
      background: rgba(0, 0, 0, 0.06);
      color: #ec4141;
    }
    &.disabled-act {
      opacity: 0.45;
      cursor: default;
    }
  }
}
.ctx-mask {
  position: fixed;
  inset: 0;
  z-index: 2200;
}
.ctx-menu {
  position: fixed;
  margin: 0;
  padding: 6px 0;
  list-style: none;
  min-width: 176px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.16);
  border: 1px solid #eee;
  li {
    padding: 9px 16px;
    font-size: 13px;
    color: #333;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    .el-icon {
      color: #888;
      font-size: 15px;
    }
    &:hover:not(.sep):not(.disabled) {
      background: #f5f5f5;
    }
    &.sep {
      height: 1px;
      padding: 0;
      margin: 6px 0;
      background: #eee;
      cursor: default;
    }
    &.disabled {
      color: #bbb;
      cursor: default;
      .el-icon {
        color: #ccc;
      }
    }
  }
}

@media (max-width: 1100px) {
  .song-grid.cols-3 {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 780px) {
  .song-grid.cols-2,
  .song-grid.cols-3 {
    grid-template-columns: 1fr;
  }
}
</style>
