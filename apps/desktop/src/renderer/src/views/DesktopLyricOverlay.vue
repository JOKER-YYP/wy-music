<template>
  <div
    class="dl"
    :class="[
      `align-${align}`,
      `color-${color}`,
      { locked, hovering, vertical, panel: !locked },
    ]"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
  >
    <div v-show="!locked" class="dl-bar" @mousedown.stop>
      <button class="tool" type="button" title="打开主窗口" @click.stop="openMain">
        <span class="note">♪</span>
      </button>
      <button class="tool text" type="button" title="歌词提前 0.5 秒" @click.stop="nudgeOffset(0.5)">
        +0.5s
      </button>
      <button class="tool text" type="button" title="歌词延后 0.5 秒" @click.stop="nudgeOffset(-0.5)">
        -0.5s
      </button>
      <button class="tool" type="button" title="上一首" @click.stop="send({ type: 'prev' })">
        <el-icon :size="15"><DArrowLeft /></el-icon>
      </button>
      <button class="tool" type="button" title="播放/暂停" @click.stop="send({ type: 'toggle' })">
        <el-icon :size="16">
          <VideoPause v-if="state.playing" />
          <VideoPlay v-else />
        </el-icon>
      </button>
      <button class="tool" type="button" title="下一首" @click.stop="send({ type: 'next' })">
        <el-icon :size="15"><DArrowRight /></el-icon>
      </button>

      <button
        ref="settingsBtnRef"
        class="tool"
        type="button"
        title="设置"
        @click.stop="openSettingsMenu"
      >
        <el-icon :size="15"><Setting /></el-icon>
      </button>
      <button class="tool" type="button" title="锁定桌面歌词" @click.stop="setLocked(true)">
        <el-icon :size="15"><Unlock /></el-icon>
      </button>
      <button class="tool" type="button" title="关闭桌面歌词" @click.stop="close">
        <el-icon :size="15"><Close /></el-icon>
      </button>
    </div>

    <button
      v-if="locked"
      class="lock-fab"
      :class="{ show: hovering }"
      type="button"
      title="解锁后可拖拽 / 关闭"
      @click.stop.prevent="setLocked(false)"
      @mousedown.stop.prevent
    >
      <el-icon :size="16"><Lock /></el-icon>
    </button>

    <div class="dl-body">
      <div class="dl-current" :class="{ empty: !currentText }">
        {{ currentText || emptyHint }}
      </div>
      <div v-if="dualLine && nextText" class="dl-next">{{ nextText }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { findLyricIndex, parseLrc, type LyricLine } from '../utils/lrc'

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

type Align = 'left' | 'center' | 'right'
type ColorScheme = 'pink' | 'white' | 'green' | 'gold'

const PREF_KEY = 'wy_desktop_lyric_prefs'

type Prefs = {
  locked: boolean
  dualLine: boolean
  vertical: boolean
  alwaysOnTop: boolean
  align: Align
  color: ColorScheme
  offset: number
}

function defaultPrefs(): Prefs {
  return {
    locked: false,
    dualLine: true,
    vertical: false,
    alwaysOnTop: true,
    align: 'center',
    color: 'pink',
    offset: 0,
  }
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    if (raw) return { ...defaultPrefs(), ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return defaultPrefs()
}

const prefs0 = loadPrefs()
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
const hovering = ref(false)
const locked = ref(prefs0.locked)
const dualLine = ref(prefs0.dualLine)
const vertical = ref(prefs0.vertical)
const alwaysOnTop = ref(prefs0.alwaysOnTop)
const align = ref<Align>(prefs0.align)
const color = ref<ColorScheme>(prefs0.color)
const offset = ref(prefs0.offset)
const settingsBtnRef = ref<HTMLButtonElement | null>(null)

const hasLyric = computed(() => lines.value.length > 0)
const currentText = computed(() => {
  if (!hasLyric.value) return ''
  const i = activeIndex.value
  if (i < 0) return lines.value[0]?.text || ''
  return lines.value[i]?.text || ''
})
const nextText = computed(() => {
  const i = activeIndex.value < 0 ? 0 : activeIndex.value
  return lines.value[i + 1]?.text || ''
})
const emptyHint = computed(() => (!state.hasTrack ? '未在播放' : '暂无歌词'))

function savePrefs() {
  localStorage.setItem(
    PREF_KEY,
    JSON.stringify({
      locked: locked.value,
      dualLine: dualLine.value,
      vertical: vertical.value,
      alwaysOnTop: alwaysOnTop.value,
      align: align.value,
      color: color.value,
      offset: offset.value,
    } satisfies Prefs),
  )
}

function applyPrefs(p: Partial<Prefs>) {
  if (typeof p.dualLine === 'boolean') dualLine.value = p.dualLine
  if (typeof p.vertical === 'boolean') vertical.value = p.vertical
  if (typeof p.alwaysOnTop === 'boolean') alwaysOnTop.value = p.alwaysOnTop
  if (p.align) align.value = p.align
  if (p.color) color.value = p.color
  if (typeof p.offset === 'number') offset.value = p.offset
  if (typeof p.locked === 'boolean') locked.value = p.locked
  savePrefs()
}

function refreshActive() {
  activeIndex.value = findLyricIndex(lines.value, state.currentTime + offset.value)
}

function refreshLines() {
  lines.value = parseLrc(state.lyricText || '')
  refreshActive()
}

async function clearMouseIgnore() {
  await window.wyAPI?.setDesktopLyricIgnoreMouse?.(false)
}

function onEnter() {
  hovering.value = true
}

function onLeave() {
  hovering.value = false
}

function openSettingsMenu() {
  const el = settingsBtnRef.value
  if (!el || !window.wyAPI?.openDesktopLyricMenu) return
  const r = el.getBoundingClientRect()
  void window.wyAPI.openDesktopLyricMenu({
    x: r.left + r.width / 2,
    y: r.top,
  })
}

function setLocked(next: boolean) {
  locked.value = next
  savePrefs()
  void window.wyAPI?.closeDesktopLyricMenu?.()
  void clearMouseIgnore()
}

function nudgeOffset(delta: number) {
  offset.value = Math.round((offset.value + delta) * 10) / 10
  savePrefs()
  refreshActive()
}

function send(cmd: { type: 'toggle' | 'prev' | 'next' | 'openMain' }) {
  window.wyAPI?.sendPlayerCommand?.(cmd)
}

function openMain() {
  send({ type: 'openMain' })
}

function close() {
  if (locked.value) return
  void window.wyAPI?.closeDesktopLyricMenu?.()
  void window.wyAPI?.closeDesktopLyric?.()
}

let unsubState: (() => void) | undefined
let unsubPrefs: (() => void) | undefined

onMounted(() => {
  document.documentElement.classList.add('desktop-lyric-mode')
  document.body.classList.add('desktop-lyric-mode')
  void window.wyAPI?.setDesktopLyricAlwaysOnTop?.(alwaysOnTop.value)
  void clearMouseIgnore()
  unsubState = window.wyAPI?.onPlayerState?.((s) => {
    Object.assign(state, s)
  })
  unsubPrefs = window.wyAPI?.onDesktopLyricPrefs?.((p) => {
    applyPrefs(p as Partial<Prefs>)
  })
})

onUnmounted(() => {
  unsubState?.()
  unsubPrefs?.()
  document.documentElement.classList.remove('desktop-lyric-mode')
  document.body.classList.remove('desktop-lyric-mode')
  void clearMouseIgnore()
})

watch([dualLine, vertical, align, color, offset, locked], savePrefs)
watch(
  () => state.lyricText,
  () => refreshLines(),
  { immediate: true },
)
watch(
  () => state.currentTime,
  () => refreshActive(),
)
</script>

<style scoped lang="scss">
.dl {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 4px 16px 8px;
  user-select: none;
  background: transparent;
  border-radius: 8px;
  -webkit-app-region: drag;

  &.locked {
    -webkit-app-region: no-drag;
  }

  /* 未锁定时淡底，尺寸固定紧凑（对齐网易云） */
  &.panel {
    background: rgba(0, 0, 0, 0.32);
  }

  &.align-left .dl-body {
    align-items: flex-start;
    text-align: left;
    width: 100%;
  }
  &.align-right .dl-body {
    align-items: flex-end;
    text-align: right;
    width: 100%;
  }
  &.align-center .dl-body {
    align-items: center;
    text-align: center;
  }

  &.vertical .dl-current,
  &.vertical .dl-next {
    writing-mode: vertical-rl;
    letter-spacing: 0.12em;
    max-height: 80px;
  }
}

.dl-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  gap: 1px;
  height: 28px;
  -webkit-app-region: no-drag;
}

.tool {
  min-width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: rgba(255, 255, 255, 0.95);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  font-size: 12px;
  line-height: 1;
  &:hover {
    background: rgba(255, 255, 255, 0.14);
  }
  &.text {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .note {
    font-size: 15px;
  }
}

.lock-fab {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #fff;
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 0;
  -webkit-app-region: no-drag;
  opacity: 0.45;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
  &.show,
  &:hover {
    opacity: 1;
    color: #ffb0c0;
  }
}

.dl-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  min-width: 0;
  max-width: 100%;
  pointer-events: none;
  line-height: 1.2;
}

.dl-current {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.02em;
  word-break: break-word;
  paint-order: stroke fill;
  -webkit-text-stroke: 1px rgba(255, 255, 255, 0.5);
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.55),
    0 0 8px rgba(0, 0, 0, 0.35);
  &.empty {
    font-size: 16px;
    font-weight: 500;
    -webkit-text-stroke: 0;
    opacity: 0.7;
  }
}

.dl-next {
  margin-top: 2px;
  font-size: 13px;
  font-weight: 600;
  opacity: 0.5;
  word-break: break-word;
  paint-order: stroke fill;
  -webkit-text-stroke: 0.5px rgba(255, 255, 255, 0.35);
}

.color-pink .dl-current,
.color-pink .dl-next {
  color: #ff9eb5;
}
.color-white .dl-current,
.color-white .dl-next {
  color: #fff;
}
.color-green .dl-current,
.color-green .dl-next {
  color: #7dffa8;
}
.color-gold .dl-current,
.color-gold .dl-next {
  color: #ffd56a;
}
</style>

<style lang="scss">
html.desktop-lyric-mode,
body.desktop-lyric-mode,
body.desktop-lyric-mode #app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent !important;
}
</style>
