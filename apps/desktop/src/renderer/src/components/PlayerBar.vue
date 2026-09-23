<template>
  <div class="player-bar" :class="{ hovered: barHovered }" @mouseenter="barHovered = true" @mouseleave="onBarLeave">
    <!-- 顶部全宽进度条：默认细线，悬停加粗并显示时间气泡 -->
    <div
      class="progress-wrap"
      @mouseenter="progressHovered = true"
      @mouseleave="progressHovered = false"
    >
      <div v-show="progressHovered || dragging" class="time-tip">
        {{ formatTime(displayTime) }} / {{ formatTime(sliderMax) }}
      </div>
      <input
        class="seek"
        type="range"
        min="0"
        :max="sliderMax || 1"
        step="0.1"
        :value="displayTime"
        :disabled="!track || sliderMax <= 0"
        :style="{ '--pct': progressPct }"
        @pointerdown="onSeekStart"
        @input="onSeekInput"
        @change="onSeekCommit"
        @pointerup="onSeekCommit"
      />
    </div>

    <div class="body">
      <div class="meta">
        <button
          class="cover"
          type="button"
          title="打开播放页"
          :class="{ spinning: player.playing }"
          :style="{ backgroundImage: coverStyle }"
          :disabled="!track"
          @click="openNowPlaying"
        />
        <div class="info">
          <div class="title" :title="track?.name">{{ track?.name || '未在播放' }}</div>
          <div class="artists">{{ artists || ' ' }}</div>
        </div>

        <div v-if="track && !track.localPath && !track.previewFile" class="social">
          <button
            class="social-btn"
            type="button"
            title="喜欢"
            :class="{ on: track.liked }"
            @click="toggleLike"
          >
            <el-icon :size="16">
              <StarFilled v-if="track.liked" />
              <Star v-else />
            </el-icon>
            <span class="count" :class="{ on: track.liked }">{{ likeLabel }}</span>
          </button>
          <button class="social-btn" type="button" title="评论" @click="openComments">
            <el-icon :size="16"><ChatDotRound /></el-icon>
            <span class="count">{{ commentLabel }}</span>
          </button>
        </div>
      </div>

      <div class="controls">
        <button class="icon-btn" type="button" :title="modeTitle" @click="player.cycleMode()">
          <el-icon :size="18">
            <RefreshRight v-if="player.mode === 'loop'" />
            <RefreshLeft v-else-if="player.mode === 'single'" />
            <Sort v-else />
          </el-icon>
        </button>
        <button class="icon-btn" type="button" title="上一首" @click="player.prev()">
          <el-icon :size="20"><DArrowLeft /></el-icon>
        </button>
        <button
          class="play-btn"
          type="button"
          :disabled="!track || player.loading"
          @click="player.toggle()"
        >
          <el-icon v-if="!player.loading" :size="22">
            <VideoPause v-if="player.playing" />
            <VideoPlay v-else />
          </el-icon>
          <span v-else class="play-loading" />
        </button>
        <button class="icon-btn" type="button" title="下一首" @click="player.next()">
          <el-icon :size="20"><DArrowRight /></el-icon>
        </button>
        <el-popover
          placement="top"
          :width="280"
          trigger="click"
          :disabled="!player.queue.length"
        >
          <template #reference>
            <button class="icon-btn" type="button" title="播放列表" :disabled="!player.queue.length">
              <el-icon :size="18"><Expand /></el-icon>
            </button>
          </template>
          <div class="queue-pop">
            <div class="queue-head">播放列表 · {{ player.queue.length }}</div>
            <div
              v-for="(q, i) in player.queue"
              :key="q.id"
              class="queue-row"
              :class="{ active: i === player.currentIndex }"
              @dblclick="player.playAt(i)"
              @click="player.playAt(i)"
            >
              <span class="q-idx">{{ i + 1 }}</span>
              <span class="q-name">{{ q.name }}</span>
            </div>
          </div>
        </el-popover>
      </div>

      <div class="right">
        <span class="quality" title="音质">极高</span>
        <button
          class="icon-btn"
          type="button"
          title="收藏到歌单"
          :disabled="!track || !!track.localPath || !!track.previewFile"
          @click="openCollect"
        >
          <el-icon :size="18"><FolderAdd /></el-icon>
        </button>
        <button class="icon-btn lyric-btn" type="button" title="歌词" :disabled="!track" @click="openNowPlaying">
          词
        </button>
        <button
          class="icon-btn"
          type="button"
          title="桌面歌词"
          :class="{ on: desktopLyricOn }"
          :disabled="!isDesktop"
          @click="toggleDesktopLyric"
        >
          桌
        </button>
        <button class="icon-btn" type="button" title="桌面小组件" @click="toggleMini">
          <el-icon :size="18"><Monitor /></el-icon>
        </button>
        <el-popover placement="top" :width="140" trigger="click">
          <template #reference>
            <button class="icon-btn" type="button" title="音量">
              <el-icon :size="18"><Headset /></el-icon>
            </button>
          </template>
          <div class="vol-pop">
            <input
              class="vol"
              type="range"
              min="0"
              max="1"
              step="0.01"
              :value="player.volume"
              @input="onVolume"
            />
          </div>
        </el-popover>
        <el-dropdown trigger="click" :disabled="!track">
          <button class="icon-btn" type="button" title="更多">
            <el-icon :size="18"><MoreFilled /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item :disabled="!track" @click="openNowPlaying">打开播放页</el-dropdown-item>
              <el-dropdown-item
                v-if="isDesktop"
                :disabled="!isDesktop"
                @click="toggleDesktopLyric"
              >
                {{ desktopLyricOn ? '关闭桌面歌词' : '打开桌面歌词' }}
              </el-dropdown-item>
              <el-dropdown-item
                :disabled="!track || !!track?.localPath"
                @click="openComments"
              >
                查看评论
              </el-dropdown-item>
              <el-dropdown-item
                :disabled="!track || !!track?.localPath"
                @click="openCollect"
              >
                收藏到歌单
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '../stores/player'
import { useUiStore } from '../stores/ui'
import { useUserStore } from '../stores/user'
import { http, mediaUrl } from '../services/http'
import { isElectronApp } from '../services/localUpload'

const router = useRouter()
const player = usePlayerStore()
const ui = useUiStore()
const user = useUserStore()
const { currentTrack: track } = storeToRefs(player)

const isDesktop = isElectronApp()
const desktopLyricOn = ref(false)
const dragging = ref(false)
const displayTime = ref(0)
const commentCount = ref(0)
const barHovered = ref(false)
const progressHovered = ref(false)

watch(
  () => player.currentTime,
  (t) => {
    if (!dragging.value && !player.seeking) {
      displayTime.value = t
    }
  },
)

watch(
  () => track.value?.id,
  (id) => {
    dragging.value = false
    displayTime.value = 0
    commentCount.value = 0
    if (id && !id.startsWith('local:') && !id.startsWith('webfile:')) {
      void loadCommentCount(id)
    }
  },
  { immediate: true },
)

watch(
  () => ui.commentsVisible,
  (v) => {
    if (!v && track.value?.id && !track.value.id.startsWith('local:')) {
      void loadCommentCount(track.value.id)
    }
  },
)

const artists = computed(() => track.value?.artists?.join(' / ') || '')
const coverStyle = computed(() => {
  const url = mediaUrl(track.value?.coverUrl)
  return url ? `url(${url})` : 'linear-gradient(135deg,#ec4141,#ff8a80)'
})
const modeTitle = computed(() => {
  if (player.mode === 'single') return '单曲循环'
  if (player.mode === 'shuffle') return '随机播放'
  return '列表循环'
})
const sliderMax = computed(() => {
  if (player.duration > 0 && Number.isFinite(player.duration)) return player.duration
  const ms = track.value?.durationMs || 0
  return ms > 0 ? ms / 1000 : 0
})
const progressPct = computed(() => {
  if (sliderMax.value <= 0) return '0%'
  return `${Math.min(100, (displayTime.value / sliderMax.value) * 100)}%`
})
const likeLabel = computed(() => (track.value?.liked ? '已喜欢' : ''))
const commentLabel = computed(() => formatCount(commentCount.value))

function formatTime(sec: number) {
  if (!sec || !Number.isFinite(sec)) return '00:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function onBarLeave() {
  if (!dragging.value) barHovered.value = false
}

function openNowPlaying() {
  if (!track.value) return
  ui.openNowPlaying()
}

function openCollect() {
  if (!track.value) return
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  ui.openCollect(track.value)
}

function openComments() {
  if (!track.value) return
  if (track.value.id.startsWith('local:') || track.value.id.startsWith('webfile:')) return
  ui.openPageComments(track.value)
  router.push(`/comment/${track.value.id}`)
}

async function loadCommentCount(id: string) {
  try {
    const { data } = await http.get(`/api/comments/track/${id}/count`)
    commentCount.value = data.data?.total || 0
  } catch {
    commentCount.value = 0
  }
}

function formatCount(n: number) {
  if (!n) return ''
  if (n >= 10000) return `${Math.floor(n / 10000)}w+`
  if (n >= 1000) return '999+'
  if (n > 99) return '99+'
  return String(n)
}

function onSeekStart() {
  dragging.value = true
  barHovered.value = true
  progressHovered.value = true
}

function onSeekInput(e: Event) {
  dragging.value = true
  displayTime.value = Number((e.target as HTMLInputElement).value)
}

function onSeekCommit(e: Event) {
  const time = Number((e.target as HTMLInputElement).value)
  displayTime.value = time
  player.seek(time)
  window.setTimeout(() => {
    dragging.value = false
  }, 320)
}

function onVolume(e: Event) {
  player.setVolume(Number((e.target as HTMLInputElement).value))
}

async function toggleLike() {
  if (!track.value) return
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  const { data } = await http.post(`/api/likes/${track.value.id}`)
  track.value.liked = data.data.liked
}

async function toggleMini() {
  if (!window.wyAPI?.toggleMiniPlayer) {
    return
  }
  await window.wyAPI.toggleMiniPlayer()
}

async function refreshDesktopLyricState() {
  if (!window.wyAPI?.isDesktopLyricOpen) {
    desktopLyricOn.value = false
    return
  }
  desktopLyricOn.value = await window.wyAPI.isDesktopLyricOpen()
}

async function toggleDesktopLyric() {
  if (!window.wyAPI?.toggleDesktopLyric) return
  const res = await window.wyAPI.toggleDesktopLyric()
  desktopLyricOn.value = Boolean(res?.open)
}

onMounted(() => {
  void refreshDesktopLyricState()
})
</script>

<style scoped lang="scss">
.player-bar {
  grid-column: 1 / -1;
  height: var(--wy-player-h);
  border-top: 1px solid #e8e8e8;
  background: #fff;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 20;
}
.progress-wrap {
  position: relative;
  height: 14px;
  margin-top: -7px;
  display: flex;
  align-items: center;
  z-index: 2;
}
.time-tip {
  position: absolute;
  left: 12px;
  bottom: calc(100% - 2px);
  padding: 4px 10px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
  font-size: 12px;
  color: #333;
  white-space: nowrap;
  pointer-events: none;
  z-index: 3;
}
.seek {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 2px;
  border-radius: 1px;
  outline: none;
  cursor: pointer;
  background: linear-gradient(
    to right,
    #ec4141 0%,
    #ec4141 var(--pct, 0%),
    #ddd var(--pct, 0%),
    #ddd 100%
  );
  transition: height 0.12s ease;
  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
  &:hover,
  .progress-wrap:hover &,
  .hovered & {
    height: 4px;
  }
  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #c8c8c8;
    border: none;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.04);
    opacity: 1;
    transition: background 0.12s, transform 0.12s, border 0.12s;
  }
  .progress-wrap:hover &,
  .hovered &,
  &:hover {
    &::-webkit-slider-thumb {
      background: #fff;
      border: 2px solid #ec4141;
      box-shadow: 0 0 0 1px rgba(236, 65, 65, 0.2);
      transform: scale(1.08);
    }
  }
  &:disabled::-webkit-slider-thumb {
    opacity: 0;
  }
  &::-moz-range-thumb {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #c8c8c8;
    border: none;
  }
  .progress-wrap:hover &,
  .hovered & {
    &::-moz-range-thumb {
      background: #fff;
      border: 2px solid #ec4141;
    }
  }
  &::-moz-range-track {
    height: 2px;
    background: transparent;
  }
}
.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(240px, 1fr) auto minmax(200px, 1fr);
  align-items: center;
  padding: 0 16px 4px;
  gap: 12px;
}
.meta {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.cover {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
  border: 3px solid #2a2a2a;
  cursor: pointer;
  padding: 0;
  box-shadow:
    0 0 0 1px #111,
    inset 0 0 0 1px rgba(255, 255, 255, 0.15);
  position: relative;
  transition: transform 0.2s ease;
  &:disabled {
    cursor: default;
    opacity: 0.7;
  }
  &:not(:disabled):hover {
    transform: scale(1.04);
  }
  &.spinning {
    animation: spin 12s linear infinite;
  }
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.info {
  min-width: 0;
  .title {
    font-size: 13px;
    font-weight: 600;
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 160px;
  }
  .artists {
    margin-top: 2px;
    font-size: 12px;
    color: #999;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 160px;
  }
}
.social {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: 4px;
}
.social-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  padding: 0;
  font-size: 12px;
  &:hover,
  &.on {
    color: #ec4141;
  }
  .count {
    color: inherit;
    font-size: 12px;
    &.on {
      color: #ec4141;
    }
  }
}
.controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
}
.icon-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: #666;
  border-radius: 50%;
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 0;
  font-size: 13px;
  &:hover:not(:disabled) {
    color: #333;
    background: rgba(0, 0, 0, 0.04);
  }
  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
  &.on {
    color: #ec4141;
    font-weight: 700;
  }
}
.lyric-btn {
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 1px;
}
.play-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: #ec4141;
  color: #fff;
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 0;
  box-shadow: 0 4px 12px rgba(236, 65, 65, 0.35);
  transition: transform 0.12s, background 0.12s;
  &:hover:not(:disabled) {
    background: #e03333;
    transform: scale(1.05);
  }
  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
}
.play-loading {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
.right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}
.quality {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  padding: 0 5px;
  margin-right: 4px;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 11px;
  color: #888;
  line-height: 1;
  user-select: none;
}
.vol-pop {
  padding: 4px 2px;
}
.vol {
  width: 100%;
  accent-color: #ec4141;
  cursor: pointer;
}
.queue-pop {
  max-height: 280px;
  overflow: auto;
}
.queue-head {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #333;
}
.queue-row {
  display: flex;
  gap: 8px;
  align-items: center;
  height: 32px;
  padding: 0 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  &:hover {
    background: #f5f5f5;
  }
  &.active {
    color: #ec4141;
  }
}
.q-idx {
  width: 20px;
  color: #bbb;
  font-size: 12px;
  text-align: center;
}
.q-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
