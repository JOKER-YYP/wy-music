<template>
  <div class="mini" :class="[`layout-${layout}`]" @dblclick="openMain">
    <!-- 紧凑样式 -->
    <template v-if="layout === 'compact'">
      <div class="cover" :style="coverStyle" />
      <div class="body">
        <div class="meta">
          <div class="title">{{ state.name || '未在播放' }}</div>
          <div class="artists">{{ state.artists || ' ' }}</div>
        </div>
        <div class="controls">
          <button class="btn" type="button" title="上一首" @click.stop="send({ type: 'prev' })">
            <el-icon :size="16"><DArrowLeft /></el-icon>
          </button>
          <button class="btn play" type="button" title="播放/暂停" @click.stop="send({ type: 'toggle' })">
            <el-icon :size="18">
              <VideoPause v-if="state.playing" />
              <VideoPlay v-else />
            </el-icon>
          </button>
          <button class="btn" type="button" title="下一首" @click.stop="send({ type: 'next' })">
            <el-icon :size="16"><DArrowRight /></el-icon>
          </button>
        </div>
        <input
          class="seek"
          type="range"
          min="0"
          :max="seekMax"
          step="0.1"
          :value="state.currentTime"
          :disabled="!state.hasTrack || seekMax <= 0"
          :style="{ '--pct': progressPct }"
          @click.stop
          @pointerdown.stop
          @input="onSeekInput"
          @change="onSeekCommit"
        />
      </div>
    </template>

    <!-- 歌词样式（更高） -->
    <template v-else>
      <div class="lyric-top">
        <div class="cover lg" :style="coverStyle" />
        <div class="lyric-meta">
          <div class="title">{{ state.name || '未在播放' }}</div>
          <div class="artists">{{ state.artists || ' ' }}</div>
          <div class="controls">
            <button class="btn" type="button" title="上一首" @click.stop="send({ type: 'prev' })">
              <el-icon :size="16"><DArrowLeft /></el-icon>
            </button>
            <button class="btn play" type="button" title="播放/暂停" @click.stop="send({ type: 'toggle' })">
              <el-icon :size="18">
                <VideoPause v-if="state.playing" />
                <VideoPlay v-else />
              </el-icon>
            </button>
            <button class="btn" type="button" title="下一首" @click.stop="send({ type: 'next' })">
              <el-icon :size="16"><DArrowRight /></el-icon>
            </button>
          </div>
        </div>
      </div>

      <div ref="lyricBoxRef" class="lyric-box" @wheel.stop @mousedown.stop>
        <div v-if="!lines.length" class="lyric-empty">暂无歌词</div>
        <div
          v-for="(line, i) in lines"
          :key="`${line.time}-${i}`"
          class="lyric-line"
          :class="{ active: i === activeIndex, near: Math.abs(i - activeIndex) === 1 }"
          :ref="(el) => setLineEl(el, i)"
        >
          {{ line.text }}
        </div>
      </div>

      <input
        class="seek"
        type="range"
        min="0"
        :max="seekMax"
        step="0.1"
        :value="state.currentTime"
        :disabled="!state.hasTrack || seekMax <= 0"
        :style="{ '--pct': progressPct }"
        @click.stop
        @pointerdown.stop
        @input="onSeekInput"
        @change="onSeekCommit"
      />
    </template>

    <div class="toolbar">
          <button
            class="tool"
            type="button"
            :title="layout === 'compact' ? '切换歌词样式' : '切换紧凑样式'"
            @click.stop="cycleLayout"
          >
            <el-icon v-if="layout === 'compact'" :size="14"><Notebook /></el-icon>
            <el-icon v-else :size="14"><Minus /></el-icon>
          </button>
      <button class="tool" type="button" title="关闭小组件" @click.stop="close">
        <el-icon :size="14"><Close /></el-icon>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { mediaUrl } from '../services/http'
import { findLyricIndex, parseLrc, type LyricLine } from '../utils/lrc'

type MiniLayout = 'compact' | 'lyric'

type MiniState = {
  name: string
  artists: string
  coverUrl: string
  playing: boolean
  currentTime: number
  duration: number
  hasTrack: boolean
  trackId?: string
  lyricText?: string
}

const LAYOUT_KEY = 'wy_mini_layout'

const layout = ref<MiniLayout>(
  (localStorage.getItem(LAYOUT_KEY) as MiniLayout) === 'lyric' ? 'lyric' : 'compact',
)

const state = reactive<MiniState>({
  name: '',
  artists: '',
  coverUrl: '',
  playing: false,
  currentTime: 0,
  duration: 0,
  hasTrack: false,
  trackId: '',
  lyricText: '',
})

const lines = ref<LyricLine[]>([])
const activeIndex = ref(-1)
const lyricBoxRef = ref<HTMLElement | null>(null)
const lineEls = ref<(HTMLElement | null)[]>([])

let unsub: (() => void) | undefined

const coverStyle = computed(() => {
  const url = mediaUrl(state.coverUrl)
  return {
    backgroundImage: url
      ? `url(${url})`
      : 'linear-gradient(135deg,#ec4141,#ff8a80)',
  }
})

const seekMax = computed(() => (state.duration > 0 ? state.duration : 0))
const progressPct = computed(() => {
  if (seekMax.value <= 0) return '0%'
  return `${Math.min(100, (state.currentTime / seekMax.value) * 100)}%`
})

function setLineEl(el: unknown, i: number) {
  lineEls.value[i] = (el as HTMLElement) || null
}

function send(cmd: { type: string; time?: number }) {
  window.wyAPI?.sendPlayerCommand?.(cmd as never)
}

function openMain() {
  void window.wyAPI?.focusMainWindow?.()
}

function close() {
  void window.wyAPI?.closeMiniPlayer?.()
}

function onSeekInput(e: Event) {
  state.currentTime = Number((e.target as HTMLInputElement).value)
}

function onSeekCommit(e: Event) {
  const time = Number((e.target as HTMLInputElement).value)
  send({ type: 'seek', time })
}

async function applyLayout(next: MiniLayout) {
  layout.value = next
  localStorage.setItem(LAYOUT_KEY, next)
  await window.wyAPI?.setMiniLayout?.(next)
  await nextTick()
  scrollActiveLyric(true)
}

async function cycleLayout() {
  await applyLayout(layout.value === 'compact' ? 'lyric' : 'compact')
}

function rebuildLyric() {
  lines.value = parseLrc(state.lyricText || '')
  lineEls.value = []
  activeIndex.value = findLyricIndex(lines.value, state.currentTime)
  void nextTick(() => scrollActiveLyric(true))
}

function scrollActiveLyric(force = false) {
  if (layout.value !== 'lyric') return
  const box = lyricBoxRef.value
  const el = lineEls.value[activeIndex.value]
  if (!box || !el || activeIndex.value < 0) return
  const target = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2
  if (force) {
    box.scrollTop = Math.max(0, target)
  } else {
    box.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }
}

watch(
  () => state.lyricText,
  () => rebuildLyric(),
)

watch(
  () => state.currentTime,
  (t) => {
    const idx = findLyricIndex(lines.value, t)
    if (idx !== activeIndex.value) {
      activeIndex.value = idx
      scrollActiveLyric()
    }
  },
)

onMounted(async () => {
  document.documentElement.classList.add('mini-mode')
  document.body.classList.add('mini-mode')
  unsub = window.wyAPI?.onPlayerState?.((s) => {
    const trackChanged = s.trackId !== state.trackId
    Object.assign(state, s)
    if (trackChanged) rebuildLyric()
  })
  await applyLayout(layout.value)
})

onUnmounted(() => {
  unsub?.()
  document.documentElement.classList.remove('mini-mode')
  document.body.classList.remove('mini-mode')
})
</script>

<style scoped lang="scss">
.mini {
  position: relative;
  height: 100vh;
  width: 100vw;
  box-sizing: border-box;
  background: #fff;
  border: 1px solid #eee;
  border-radius: 14px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.12);
  -webkit-app-region: drag;
  user-select: none;
  overflow: hidden;
}

.layout-compact {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 36px 10px 12px;
}

.layout-lyric {
  display: flex;
  flex-direction: column;
  padding: 12px 12px 10px;
  gap: 8px;
}

.cover {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
  &.lg {
    width: 64px;
    height: 64px;
    border-radius: 10px;
  }
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta,
.lyric-meta {
  min-width: 0;
}

.title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.artists {
  margin-top: 2px;
  font-size: 11px;
  color: #999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.controls {
  display: flex;
  align-items: center;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.lyric-top {
  display: flex;
  gap: 12px;
  align-items: center;
  padding-right: 28px;
}

.lyric-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lyric-box {
  flex: 1;
  min-height: 0;
  overflow: auto;
  text-align: center;
  padding: 8px 6px;
  border-radius: 10px;
  background: #fafafa;
  -webkit-app-region: no-drag;
  overscroll-behavior: contain;
}

.lyric-empty {
  height: 100%;
  min-height: 120px;
  display: grid;
  place-items: center;
  color: #bbb;
  font-size: 13px;
}

.lyric-line {
  padding: 8px 6px;
  font-size: 13px;
  line-height: 1.5;
  color: #aaa;
  transition: color 0.2s, font-size 0.2s, transform 0.2s;
  &.near {
    color: #888;
  }
  &.active {
    color: #ec4141;
    font-size: 15px;
    font-weight: 700;
  }
}

.btn {
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  color: #666;
  border-radius: 50%;
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  &:hover {
    background: #f3f3f3;
    color: #333;
  }
  &.play {
    width: 30px;
    height: 30px;
    background: #ec4141;
    color: #fff;
    &:hover {
      background: #e03333;
      color: #fff;
    }
  }
}

.seek {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 3px;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  -webkit-app-region: no-drag;
  background: linear-gradient(
    to right,
    #ec4141 0%,
    #ec4141 var(--pct, 0%),
    #e5e5e5 var(--pct, 0%),
    #e5e5e5 100%
  );
  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ec4141;
    border: none;
  }
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}

.toolbar {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 2px;
  -webkit-app-region: no-drag;
}

.tool {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #bbb;
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 0;
  &:hover {
    background: #f0f0f0;
    color: #666;
  }
}
</style>

<style lang="scss">
html.mini-mode,
body.mini-mode,
body.mini-mode #app {
  margin: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent !important;
}
</style>
