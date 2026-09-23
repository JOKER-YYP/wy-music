<template>
  <div class="menu-root" @mousedown.stop>
    <button type="button" class="item" @click="toggle('alwaysOnTop')">
      <span>总在最前</span>
      <el-icon v-if="prefs.alwaysOnTop" class="check" :size="14"><Check /></el-icon>
    </button>
    <button type="button" class="item" @click="toggle('dualLine')">
      <span>切换双行模式</span>
      <el-icon v-if="prefs.dualLine" class="check" :size="14"><Check /></el-icon>
    </button>

    <div class="item has-sub" @mouseenter="sub = 'align'" @mouseleave="onSubLeave">
      <span>对齐方式</span>
      <el-icon :size="12"><ArrowRight /></el-icon>
      <div v-show="sub === 'align'" class="submenu" @mouseenter="sub = 'align'">
        <button type="button" :class="{ on: prefs.align === 'left' }" @click="setAlign('left')">左对齐</button>
        <button type="button" :class="{ on: prefs.align === 'center' }" @click="setAlign('center')">居中</button>
        <button type="button" :class="{ on: prefs.align === 'right' }" @click="setAlign('right')">右对齐</button>
      </div>
    </div>

    <div class="item has-sub" @mouseenter="sub = 'color'" @mouseleave="onSubLeave">
      <span>更换配色</span>
      <el-icon :size="12"><ArrowRight /></el-icon>
      <div v-show="sub === 'color'" class="submenu" @mouseenter="sub = 'color'">
        <button type="button" :class="{ on: prefs.color === 'pink' }" @click="setColor('pink')">粉白</button>
        <button type="button" :class="{ on: prefs.color === 'white' }" @click="setColor('white')">纯白</button>
        <button type="button" :class="{ on: prefs.color === 'green' }" @click="setColor('green')">青绿</button>
        <button type="button" :class="{ on: prefs.color === 'gold' }" @click="setColor('gold')">金黄</button>
      </div>
    </div>

    <button type="button" class="item" @click="toggle('vertical')">
      <span>切换竖排歌词</span>
      <el-icon v-if="prefs.vertical" class="check" :size="14"><Check /></el-icon>
    </button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'

const PREF_KEY = 'wy_desktop_lyric_prefs'

type Align = 'left' | 'center' | 'right'
type ColorScheme = 'pink' | 'white' | 'green' | 'gold'

type Prefs = {
  locked: boolean
  dualLine: boolean
  vertical: boolean
  alwaysOnTop: boolean
  align: Align
  color: ColorScheme
  offset: number
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    if (raw) {
      return {
        locked: false,
        dualLine: true,
        vertical: false,
        alwaysOnTop: true,
        align: 'center',
        color: 'pink',
        offset: 0,
        ...JSON.parse(raw),
      }
    }
  } catch {
    /* ignore */
  }
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

const prefs = reactive<Prefs>(loadPrefs())
const sub = ref<'align' | 'color' | null>(null)
let leaveTimer: number | null = null

function persist() {
  localStorage.setItem(PREF_KEY, JSON.stringify({ ...prefs }))
  window.wyAPI?.publishDesktopLyricPrefs?.({ ...prefs })
}

function toggle(key: 'alwaysOnTop' | 'dualLine' | 'vertical') {
  prefs[key] = !prefs[key]
  persist()
  if (key === 'alwaysOnTop') {
    void window.wyAPI?.setDesktopLyricAlwaysOnTop?.(prefs.alwaysOnTop)
  }
}

function setAlign(v: Align) {
  prefs.align = v
  persist()
}

function setColor(v: ColorScheme) {
  prefs.color = v
  persist()
}

function onSubLeave() {
  if (leaveTimer != null) window.clearTimeout(leaveTimer)
  leaveTimer = window.setTimeout(() => {
    sub.value = null
    leaveTimer = null
  }, 180)
}

onMounted(() => {
  document.documentElement.classList.add('desktop-lyric-menu-mode')
  document.body.classList.add('desktop-lyric-menu-mode')
  // 子菜单需要更宽：通知主进程可选，这里用 CSS 溢出到窗外风险——加宽窗口
  // 子菜单在右侧，窗口宽度已含余量则更好；暂时靠 hasShadow 窗口 188，子菜单 absolute 可能被裁
})

onUnmounted(() => {
  if (leaveTimer != null) window.clearTimeout(leaveTimer)
  document.documentElement.classList.remove('desktop-lyric-menu-mode')
  document.body.classList.remove('desktop-lyric-menu-mode')
})
</script>

<style scoped lang="scss">
.menu-root {
  width: 176px;
  height: 100%;
  box-sizing: border-box;
  padding: 6px 0;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
  overflow: visible;
  user-select: none;
}
.item {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: none;
  background: transparent;
  padding: 10px 14px;
  font-size: 13px;
  color: #333;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
  &:hover {
    background: #f5f5f5;
  }
  .check {
    color: #ec4141;
  }
}
.submenu {
  position: absolute;
  left: calc(100% + 2px);
  top: 0;
  min-width: 108px;
  padding: 6px 0;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
  z-index: 10;
  button {
    display: block;
    width: 100%;
    border: none;
    background: transparent;
    padding: 8px 14px;
    text-align: left;
    font-size: 13px;
    color: #333;
    cursor: pointer;
    white-space: nowrap;
    &:hover,
    &.on {
      background: #f5f5f5;
      color: #ec4141;
    }
  }
}
</style>

<style lang="scss">
html.desktop-lyric-menu-mode,
body.desktop-lyric-menu-mode,
body.desktop-lyric-menu-mode #app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  background: transparent !important;
}
</style>
