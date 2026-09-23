<template>
  <div class="song-grid" :class="{ cols2: columns === 2 }">
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
          <span v-if="track.liked" class="tag liked">♥</span>
        </div>
        <div class="sub">{{ track.artists?.join(' / ') || '未知歌手' }}</div>
      </div>

      <div class="hover-actions">
        <button type="button" title="喜欢" @click.stop="onLike(track)">
          <el-icon :color="track.liked ? '#ec4141' : undefined"><Star /></el-icon>
        </button>
        <button type="button" title="收藏到歌单" @click.stop="onCollect(track)">
          <el-icon><FolderAdd /></el-icon>
        </button>
        <button type="button" title="更多" @click.stop="openMenu($event, track)">
          <el-icon><MoreFilled /></el-icon>
        </button>
      </div>
    </div>

    <el-empty v-if="!tracks.length" description="暂无歌曲" :image-size="72" />
  </div>

  <!-- 右键 / 更多菜单：故意不含「购买单曲」 -->
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
        <li @click="run('play')">播放</li>
        <li @click="run('next')">下一首播放</li>
        <li @click="run('comments')">查看评论</li>
        <li class="sep" />
        <li @click="run('collect')">收藏</li>
        <li @click="run('like')">{{ menu.track?.liked ? '取消喜欢' : '喜欢' }}</li>
        <li @click="run('copy')">复制链接</li>
        <li class="sep" />
        <li class="disabled">减少推荐</li>
      </ul>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { TrackDto } from '@wy-music/shared'
import { usePlayerStore } from '../stores/player'
import { useUserStore } from '../stores/user'
import { useUiStore } from '../stores/ui'
import { http, mediaUrl, streamUrl } from '../services/http'

const props = withDefaults(
  defineProps<{
    tracks: TrackDto[]
    columns?: 1 | 2
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
  const mw = 168
  const mh = 280
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
  &.cols2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 24px;
  }
}
.song-row {
  display: grid;
  grid-template-columns: 52px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: default;
  min-width: 0;
  &:hover {
    background: #f5f5f5;
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
  width: 48px;
  height: 48px;
  border-radius: 6px;
  border: none;
  padding: 0;
  background-size: cover;
  background-position: center;
  position: relative;
  cursor: pointer;
  overflow: hidden;
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
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag.liked {
  color: #ec4141;
  font-size: 12px;
}
.sub {
  margin-top: 4px;
  font-size: 12px;
  color: #999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hover-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
  button {
    width: 30px;
    height: 30px;
    border: none;
    background: transparent;
    border-radius: 50%;
    color: #666;
    cursor: pointer;
    display: grid;
    place-items: center;
    &:hover {
      background: rgba(0, 0, 0, 0.06);
      color: #ec4141;
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
  min-width: 160px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.16);
  border: 1px solid #eee;
  li {
    padding: 9px 18px;
    font-size: 13px;
    color: #333;
    cursor: pointer;
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
    }
  }
}
</style>
