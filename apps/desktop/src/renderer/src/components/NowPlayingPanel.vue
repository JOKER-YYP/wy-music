<template>
  <Teleport to="body">
    <Transition name="np-fade">
      <div
        v-if="ui.nowPlayingVisible && track"
        class="now-playing"
        @wheel="onWheel"
      >
        <div class="np-bg" :style="bgStyle" />
        <div class="np-mask" />

        <header class="np-top">
          <button class="np-back" type="button" title="收起" @click="ui.closeNowPlaying()">
            <el-icon :size="22"><ArrowDown /></el-icon>
          </button>
          <div class="np-top-title">正在播放</div>
          <span />
        </header>

        <div class="np-body">
          <div class="np-left">
            <div class="vinyl-stage">
              <div class="tonearm" :class="{ on: player.playing }" />
              <div class="vinyl" :class="{ spinning: player.playing }">
                <div class="vinyl-disc">
                  <div class="vinyl-cover" :style="coverStyle" />
                </div>
              </div>
            </div>
          </div>

          <div class="np-right">
            <h1 class="song-name">{{ track.name }}</h1>
            <div class="song-meta">
              <span v-if="track.album">专辑：{{ track.album }}</span>
              <span>歌手：{{ artists }}</span>
            </div>

            <div class="tabs">
              <button
                type="button"
                class="tab"
                :class="{ active: tab === 'lyric' }"
                @click="tab = 'lyric'"
              >
                歌词
              </button>
              <button type="button" class="tab" disabled>百科</button>
              <button type="button" class="tab" disabled>相似推荐</button>
            </div>

            <div
              v-show="tab === 'lyric'"
              class="lyric-box"
              ref="lyricBoxRef"
              @wheel="onLyricWheel"
              @scroll="onLyricScroll"
            >
              <div v-if="!lines.length" class="lyric-empty">暂无歌词，可在上传时填写 LRC</div>
              <div
                v-for="(line, i) in lines"
                :key="i"
                class="lyric-line"
                :class="{ active: i === activeIndex, near: Math.abs(i - activeIndex) === 1 }"
                :ref="(el) => setLineRef(el, i)"
              >
                <span class="lyric-text">{{ line.text }}</span>
                <button
                  v-if="line.time >= 0"
                  type="button"
                  class="lyric-seek"
                  :title="`从此处播放 ${formatTime(line.time)}`"
                  @click.stop="playFromLine(line)"
                >
                  <el-icon :size="12"><VideoPlay /></el-icon>
                  <span>{{ formatTime(line.time) }}</span>
                </button>
              </div>
            </div>

            <button
              v-if="track && !track.id.startsWith('local:') && !track.id.startsWith('webfile:')"
              class="to-comments"
              type="button"
              @click="openComments"
            >
              <el-icon><ArrowDown /></el-icon>
              查看全部评论
            </button>
          </div>
        </div>

        <footer class="np-bar">
          <div class="np-progress">
            <span>{{ formatTime(player.currentTime) }}</span>
            <input
              type="range"
              min="0"
              :max="maxDur"
              step="0.1"
              :value="player.currentTime"
              @input="onSeek"
            />
            <span>{{ formatTime(maxDur) }}</span>
          </div>
          <div class="np-bar-row">
            <div class="np-meta">
              <div class="np-info">
                <div class="np-title">{{ track.name }}</div>
                <div class="np-artist">{{ artists }}</div>
              </div>
              <div class="np-social">
                <button
                  class="np-social-btn"
                  type="button"
                  title="喜欢"
                  :class="{ on: track.liked }"
                  @click="toggleLike"
                >
                  <el-icon :size="18">
                    <StarFilled v-if="track.liked" />
                    <Star v-else />
                  </el-icon>
                </button>
                <button
                  class="np-social-btn comment"
                  type="button"
                  title="评论"
                  @click="openComments"
                >
                  <el-icon :size="18"><ChatDotRound /></el-icon>
                  <span v-if="commentCount > 0" class="badge">{{ formatCount(commentCount) }}</span>
                </button>
              </div>
            </div>

            <div class="np-controls">
              <el-button text @click="player.cycleMode()">{{ modeLabel }}</el-button>
              <el-button circle @click="player.prev()">
                <el-icon><DArrowLeft /></el-icon>
              </el-button>
              <el-button type="danger" circle size="large" @click="player.toggle()">
                <el-icon :size="22">
                  <VideoPause v-if="player.playing" />
                  <VideoPlay v-else />
                </el-icon>
              </el-button>
              <el-button circle @click="player.next()">
                <el-icon><DArrowRight /></el-icon>
              </el-button>
            </div>

            <div class="np-right-tools">
              <el-button text title="收藏到歌单" @click="openCollect">
                <el-icon :size="18"><FolderAdd /></el-icon>
              </el-button>
              <el-button
                v-if="isDesktop"
                text
                title="桌面歌词"
                :class="{ 'dl-on': desktopLyricOn }"
                @click="toggleDesktopLyric"
              >
                桌词
              </el-button>
              <el-button text title="歌词" disabled>词</el-button>
            </div>
          </div>
        </footer>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '../stores/player'
import { useUiStore } from '../stores/ui'
import { useUserStore } from '../stores/user'
import { http, mediaUrl } from '../services/http'
import { findLyricIndex, parseLrc, type LyricLine } from '../utils/lrc'
import { isElectronApp } from '../services/localUpload'

const player = usePlayerStore()
const ui = useUiStore()
const user = useUserStore()
const { currentTrack: track } = storeToRefs(player)

const isDesktop = isElectronApp()
const desktopLyricOn = ref(false)
const tab = ref<'lyric'>('lyric')
const lines = ref<LyricLine[]>([])
const activeIndex = ref(-1)
const lyricBoxRef = ref<HTMLElement | null>(null)
const lineEls = ref<(HTMLElement | null)[]>([])
const commentCount = ref(0)
const userBrowsing = ref(false)
let wheelLock = false
let browseTimer: number | null = null

const artists = computed(() => track.value?.artists?.join(' / ') || '未知歌手')
const coverUrl = computed(() => mediaUrl(track.value?.coverUrl))
const coverStyle = computed(() => {
  const url = coverUrl.value
  return url
    ? { backgroundImage: `url(${url})` }
    : { backgroundImage: 'linear-gradient(135deg,#ec4141,#ff8a80)' }
})
const bgStyle = computed(() => {
  const url = coverUrl.value
  return url
    ? { backgroundImage: `url(${url})` }
    : { backgroundImage: 'linear-gradient(135deg,#2b2b2b,#111)' }
})
const maxDur = computed(() => {
  if (player.duration > 0) return player.duration
  return (track.value?.durationMs || 0) / 1000
})
const modeLabel = computed(() => {
  if (player.mode === 'single') return '单曲'
  if (player.mode === 'shuffle') return '随机'
  return '循环'
})

function setLineRef(el: unknown, i: number) {
  lineEls.value[i] = (el as HTMLElement) || null
}

function formatTime(sec: number) {
  if (!sec || !Number.isFinite(sec)) return '00:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function onSeek(e: Event) {
  player.seek(Number((e.target as HTMLInputElement).value))
}

function markUserBrowsing() {
  userBrowsing.value = true
  if (browseTimer != null) window.clearTimeout(browseTimer)
  browseTimer = window.setTimeout(() => {
    userBrowsing.value = false
    browseTimer = null
  }, 3500)
}

function onLyricWheel() {
  markUserBrowsing()
}

function onLyricScroll() {
  if (userBrowsing.value) markUserBrowsing()
}

/** 从该句时间戳起播 */
function playFromLine(line: LyricLine) {
  if (!Number.isFinite(line.time) || line.time < 0) return
  userBrowsing.value = false
  if (browseTimer != null) {
    window.clearTimeout(browseTimer)
    browseTimer = null
  }
  player.seek(line.time)
  if (!player.playing) player.toggle()
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

function openComments() {
  if (!track.value) return
  if (track.value.id.startsWith('local:') || track.value.id.startsWith('webfile:')) return
  ui.openPlayerComments(track.value)
}

/** 向下滚动进入暗色评论层 */
function onWheel(e: WheelEvent) {
  if (ui.commentsVisible || wheelLock) return
  if (!track.value) return
  if (track.value.id.startsWith('local:') || track.value.id.startsWith('webfile:')) return
  if (e.deltaY <= 20) return

  const box = lyricBoxRef.value
  // 歌词区未滚到底时，先让歌词滚动
  if (box && box.scrollHeight > box.clientHeight + 8) {
    const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 4
    if (!atBottom) return
  }
  e.preventDefault()
  wheelLock = true
  ui.openPlayerComments(track.value)
  window.setTimeout(() => {
    wheelLock = false
  }, 450)
}

function openCollect() {
  if (!track.value) return
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  ui.openCollect(track.value)
}

async function toggleLike() {
  if (!track.value) return
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  if (track.value.id.startsWith('local:') || track.value.id.startsWith('webfile:')) return
  const { data } = await http.post(`/api/likes/${track.value.id}`)
  track.value.liked = data.data.liked
}

function formatCount(n: number) {
  if (n >= 10000) return `${Math.floor(n / 10000)}w+`
  if (n >= 1000) return '999+'
  if (n > 99) return '99+'
  return String(n)
}

async function loadCommentCount(id: string) {
  if (!id || id.startsWith('local:') || id.startsWith('webfile:')) {
    commentCount.value = 0
    return
  }
  try {
    const { data } = await http.get(`/api/comments/track/${id}/count`)
    commentCount.value = data.data?.total || 0
  } catch {
    commentCount.value = 0
  }
}

async function loadLyric() {
  lines.value = []
  activeIndex.value = -1
  lineEls.value = []
  if (!track.value) return

  let raw = track.value.lyricText || ''
  if (
    !raw &&
    track.value.id &&
    !track.value.id.startsWith('local:') &&
    !track.value.id.startsWith('webfile:')
  ) {
    try {
      const { data } = await http.get(`/api/tracks/${track.value.id}/lyric`)
      raw = data.data?.lyricText || ''
    } catch {
      raw = ''
    }
  }
  lines.value = parseLrc(raw)
}

watch(
  () => track.value?.id,
  (id) => {
    void loadLyric()
    void loadCommentCount(id || '')
  },
  { immediate: true },
)

watch(
  () => ui.nowPlayingVisible,
  (v) => {
    if (v && track.value?.id) void loadCommentCount(track.value.id)
  },
)

watch(
  () => ui.commentsVisible,
  (v) => {
    if (!v && track.value?.id) void loadCommentCount(track.value.id)
  },
)

watch(
  () => player.currentTime,
  (t) => {
    if (!ui.nowPlayingVisible) return
    const idx = findLyricIndex(lines.value, t)
    if (idx === activeIndex.value) return
    activeIndex.value = idx
    if (userBrowsing.value) return
    nextTick(() => {
      const el = lineEls.value[idx]
      const box = lyricBoxRef.value
      if (!el || !box) return
      const top = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2
      box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    })
  },
)

watch(
  () => ui.nowPlayingVisible,
  (v) => {
    if (v) {
      void loadLyric()
      nextTick(() => {
        const el = lineEls.value[activeIndex.value]
        const box = lyricBoxRef.value
        if (!el || !box) return
        const top = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2
        box.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
      })
    }
  },
)
</script>

<style scoped lang="scss">
.now-playing {
  position: fixed;
  inset: 0;
  z-index: 1800;
  display: flex;
  flex-direction: column;
  color: #fff;
  overflow: hidden;
}
.np-bg {
  position: absolute;
  inset: -40px;
  background-size: cover;
  background-position: center;
  filter: blur(48px) brightness(0.32);
  transform: scale(1.12);
}
.np-mask {
  position: absolute;
  inset: 0;
  background: rgba(18, 18, 18, 0.62);
}
.np-top,
.np-body,
.np-bar {
  position: relative;
  z-index: 1;
}
.np-top {
  height: 56px;
  display: grid;
  grid-template-columns: 48px 1fr 48px;
  align-items: center;
  padding: 0 12px;
}
.np-back {
  border: none;
  background: transparent;
  color: #fff;
  cursor: pointer;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }
}
.np-top-title {
  text-align: center;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
}
.np-body {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  padding: 12px 8% 8px;
  min-height: 0;
}
.np-left {
  display: grid;
  place-items: center;
}
.vinyl-stage {
  position: relative;
  width: min(400px, 72%);
  aspect-ratio: 1;
}
.tonearm {
  position: absolute;
  top: 6%;
  right: 8%;
  width: 8px;
  height: 42%;
  background: linear-gradient(180deg, #ddd, #888);
  border-radius: 4px;
  transform-origin: top center;
  transform: rotate(-28deg);
  transition: transform 0.45s ease;
  z-index: 2;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  &::before {
    content: '';
    position: absolute;
    top: -10px;
    left: 50%;
    transform: translateX(-50%);
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #ccc;
    box-shadow: inset 0 0 0 4px #999;
  }
  &::after {
    content: '';
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
    width: 14px;
    height: 18px;
    background: #bbb;
    border-radius: 2px;
  }
  &.on {
    transform: rotate(-8deg);
  }
}
.vinyl {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
}
.vinyl-disc {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background:
    radial-gradient(circle at center, #222 17%, #111 18%, transparent 19%),
    repeating-radial-gradient(circle at center, #1a1a1a 0 2px, #0d0d0d 2px 4px);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  display: grid;
  place-items: center;
  animation: spin 22s linear infinite;
  animation-play-state: paused;
}
.vinyl.spinning .vinyl-disc {
  animation-play-state: running;
}
.vinyl-cover {
  width: 56%;
  height: 56%;
  border-radius: 50%;
  background-size: cover;
  background-position: center;
  border: 3px solid rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35);
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.np-right {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding-top: 18px;
}
.song-name {
  margin: 0;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.song-meta {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.62);
}
.tabs {
  margin-top: 22px;
  display: flex;
  gap: 8px;
}
.tab {
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.55);
  font-size: 13px;
  padding: 6px 16px;
  border-radius: 16px;
  cursor: pointer;
  &.active {
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
    font-weight: 600;
  }
  &:disabled {
    cursor: default;
    opacity: 0.4;
  }
}
.lyric-box {
  margin-top: 20px;
  flex: 1;
  overflow: auto;
  padding: 24px 8px 100px;
  scroll-behavior: smooth;
  mask-image: linear-gradient(transparent, #000 10%, #000 90%, transparent);
}
.lyric-empty {
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
  margin-top: 48px;
  font-size: 14px;
}
.lyric-line {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
  padding: 11px 72px 11px 8px;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.32);
  transition: color 0.28s ease, font-size 0.28s ease;
  line-height: 1.55;
  &:hover {
    color: rgba(255, 255, 255, 0.72);
    .lyric-seek {
      opacity: 1;
      pointer-events: auto;
    }
  }
}
.lyric-text {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}
.lyric-seek {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px 0 8px;
  border: none;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.16);
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease, background 0.18s ease;
  flex-shrink: 0;
  white-space: nowrap;
  &:hover {
    background: rgba(255, 255, 255, 0.28);
  }
}
.lyric-line.near {
  color: rgba(255, 255, 255, 0.52);
}
.lyric-line.active {
  color: #fff;
  font-size: 22px;
  font-weight: 700;
  .lyric-seek {
    opacity: 1;
    pointer-events: auto;
  }
}
.to-comments {
  margin-top: 12px;
  align-self: center;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border-radius: 16px;
  &:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
  }
}
.np-bar {
  padding: 4px 4% 16px;
}
.np-progress {
  display: grid;
  grid-template-columns: 42px 1fr 42px;
  gap: 10px;
  align-items: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
  margin-bottom: 4px;
  input[type='range'] {
    width: 100%;
    accent-color: #ec4141;
  }
}
.np-bar-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
}
.np-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.np-info {
  min-width: 0;
}
.np-title {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.np-artist {
  margin-top: 2px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.np-social {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.np-social-btn {
  position: relative;
  width: 34px;
  height: 34px;
  border: none;
  background: transparent;
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 0;
  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
  &.on {
    color: #ec4141;
  }
  &.comment .badge {
    position: absolute;
    top: 0;
    right: -4px;
    min-width: 18px;
    padding: 0 3px;
    font-size: 10px;
    line-height: 12px;
    color: #ec4141;
    font-weight: 600;
    pointer-events: none;
    white-space: nowrap;
  }
}
.np-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 14px;
  :deep(.el-button) {
    color: #fff;
  }
}
.np-right-tools {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
  :deep(.el-button) {
    color: rgba(255, 255, 255, 0.85);
  }
  :deep(.dl-on) {
    color: #ec4141 !important;
  }
}
.np-fade-enter-active,
.np-fade-leave-active {
  transition: opacity 0.28s ease, transform 0.28s ease;
}
.np-fade-enter-from,
.np-fade-leave-to {
  opacity: 0;
  transform: translateY(28px);
}
@media (max-width: 900px) {
  .np-body {
    grid-template-columns: 1fr;
    padding: 8px 20px;
    gap: 12px;
  }
  .vinyl-stage {
    width: 200px;
  }
  .song-name {
    font-size: 22px;
  }
}
</style>
