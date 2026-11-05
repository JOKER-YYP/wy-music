import {
  Tray,
  Menu,
  app,
  nativeImage,
  globalShortcut,
  ipcMain,
  type NativeImage,
} from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

export type ShellPrefs = {
  /** 显示系统托盘图标 */
  showTray: boolean
  /** 关闭主窗口时最小化到托盘（需 showTray）；默认关闭，点 X / 任务栏关闭即退出 */
  closeToTray: boolean
  /** 启用全局媒体键 */
  mediaKeysEnabled: boolean
}

type StoredShellPrefs = Partial<ShellPrefs> & { prefsVersion?: number }

export type PlayerTrayState = {
  name?: string
  artists?: string
  playing?: boolean
  hasTrack?: boolean
} | null

/** 配置版本：v2 起默认「关闭=退出」，不再默认藏到托盘 */
const PREFS_VERSION = 2

const DEFAULT_PREFS: ShellPrefs = {
  showTray: true,
  closeToTray: false,
  mediaKeysEnabled: true,
}

type TrayMediaDeps = {
  resolveIcon: () => NativeImage | undefined
  focusMain: () => boolean
  collapseMain: () => boolean
  sendPlayerCommand: (cmd: { type: 'toggle' | 'prev' | 'next' }) => void
  toggleMiniPlayer: () => { open: boolean }
  toggleDesktopLyric: () => { open: boolean }
  isMiniOpen: () => boolean
  isDesktopLyricOpen: () => boolean
}

let prefs: ShellPrefs = { ...DEFAULT_PREFS }
let tray: Tray | null = null
let isQuitting = false
let lastState: PlayerTrayState = null
let deps: TrayMediaDeps | null = null
let prefsPath = ''
let mediaKeysRegistered = false

function prefsFilePath() {
  if (prefsPath) return prefsPath
  const dir = app.getPath('userData')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* ignore */
  }
  prefsPath = join(dir, 'shell-prefs.json')
  return prefsPath
}

function writePrefsFile(data: ShellPrefs & { prefsVersion: number }) {
  try {
    writeFileSync(prefsFilePath(), JSON.stringify(data, null, 2), 'utf8')
  } catch (e) {
    console.warn('[tray] save prefs failed', e)
  }
}

export function loadShellPrefs(): ShellPrefs {
  try {
    const raw = readFileSync(prefsFilePath(), 'utf8')
    const parsed = JSON.parse(raw) as StoredShellPrefs
    const version = Number(parsed.prefsVersion) || 1
    prefs = {
      showTray: parsed.showTray !== false,
      // 仅显式开启才启用；旧版默认 true，升级时关掉以免「关不掉」
      closeToTray: parsed.closeToTray === true,
      mediaKeysEnabled: parsed.mediaKeysEnabled !== false,
    }
    if (!prefs.showTray) prefs.closeToTray = false
    if (version < PREFS_VERSION) {
      prefs.closeToTray = false
      writePrefsFile({ ...prefs, prefsVersion: PREFS_VERSION })
    }
  } catch {
    prefs = { ...DEFAULT_PREFS }
  }
  return { ...prefs }
}

export function getShellPrefs(): ShellPrefs {
  return { ...prefs }
}

export function saveShellPrefs(partial: Partial<ShellPrefs>): ShellPrefs {
  prefs = {
    showTray: partial.showTray ?? prefs.showTray,
    closeToTray: partial.closeToTray ?? prefs.closeToTray,
    mediaKeysEnabled: partial.mediaKeysEnabled ?? prefs.mediaKeysEnabled,
  }
  if (!prefs.showTray) {
    // 无托盘时关闭到托盘无意义
    prefs.closeToTray = false
  }
  writePrefsFile({ ...prefs, prefsVersion: PREFS_VERSION })
  applyTrayVisibility()
  applyMediaKeys()
  return { ...prefs }
}

export function isAppQuitting() {
  return isQuitting
}

export function requestAppQuit() {
  isQuitting = true
  unregisterMediaKeys()
  destroyTray()
  app.quit()
}

function trayTooltip(state: PlayerTrayState) {
  if (state?.hasTrack && state.name) {
    const artists = state.artists?.trim()
    return artists ? `${state.name} - ${artists}` : state.name
  }
  return 'WY Music'
}

function buildTrayMenu() {
  const playing = Boolean(lastState?.playing)
  const hasTrack = Boolean(lastState?.hasTrack)
  return Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => deps?.focusMain(),
    },
    { type: 'separator' },
    {
      label: playing ? '暂停' : '播放',
      enabled: hasTrack,
      click: () => deps?.sendPlayerCommand({ type: 'toggle' }),
    },
    {
      label: '上一首',
      enabled: hasTrack,
      click: () => deps?.sendPlayerCommand({ type: 'prev' }),
    },
    {
      label: '下一首',
      enabled: hasTrack,
      click: () => deps?.sendPlayerCommand({ type: 'next' }),
    },
    { type: 'separator' },
    {
      label: deps?.isMiniOpen() ? '关闭迷你播放器' : '打开迷你播放器',
      click: () => {
        deps?.toggleMiniPlayer()
        refreshTrayMenu()
      },
    },
    {
      label: deps?.isDesktopLyricOpen() ? '关闭桌面歌词' : '打开桌面歌词',
      click: () => {
        deps?.toggleDesktopLyric()
        refreshTrayMenu()
      },
    },
    { type: 'separator' },
    {
      label: '退出 WY Music',
      click: () => requestAppQuit(),
    },
  ])
}

function refreshTrayMenu() {
  if (!tray) return
  try {
    tray.setContextMenu(buildTrayMenu())
    tray.setToolTip(trayTooltip(lastState))
  } catch (e) {
    console.warn('[tray] refresh menu failed', e)
  }
}

function createTray() {
  if (tray) return
  if (!deps) return
  const icon = deps.resolveIcon()
  if (!icon || icon.isEmpty()) {
    console.warn('[tray] no icon, skip tray')
    return
  }
  // Windows 托盘建议 16x16
  const trayImg =
    process.platform === 'win32' ? icon.resize({ width: 16, height: 16 }) : icon
  tray = new Tray(trayImg)
  tray.setToolTip(trayTooltip(lastState))
  tray.setContextMenu(buildTrayMenu())
  tray.on('click', () => {
    // Windows：左键单击显示主窗
    deps?.focusMain()
  })
  tray.on('double-click', () => {
    deps?.focusMain()
  })
}

function destroyTray() {
  if (!tray) return
  try {
    tray.destroy()
  } catch {
    /* ignore */
  }
  tray = null
}

function applyTrayVisibility() {
  if (prefs.showTray) createTray()
  else destroyTray()
}

function unregisterMediaKeys() {
  if (!mediaKeysRegistered) return
  try {
    globalShortcut.unregister('MediaPlayPause')
    globalShortcut.unregister('MediaNextTrack')
    globalShortcut.unregister('MediaPreviousTrack')
  } catch {
    /* ignore */
  }
  mediaKeysRegistered = false
}

function registerMediaKeys() {
  if (mediaKeysRegistered || !deps) return
  const okPlay = globalShortcut.register('MediaPlayPause', () => {
    deps?.sendPlayerCommand({ type: 'toggle' })
  })
  const okNext = globalShortcut.register('MediaNextTrack', () => {
    deps?.sendPlayerCommand({ type: 'next' })
  })
  const okPrev = globalShortcut.register('MediaPreviousTrack', () => {
    deps?.sendPlayerCommand({ type: 'prev' })
  })
  mediaKeysRegistered = okPlay || okNext || okPrev
  if (!okPlay || !okNext || !okPrev) {
    console.warn('[mediaKeys] register partial', { okPlay, okNext, okPrev })
  }
}

function applyMediaKeys() {
  if (prefs.mediaKeysEnabled) registerMediaKeys()
  else unregisterMediaKeys()
}

/** 关闭主窗口时：若启用关闭到托盘则拦截并隐藏 */
export function shouldCloseToTray() {
  return !isQuitting && prefs.showTray && prefs.closeToTray
}

export function handleMainWindowClose(e: { preventDefault: () => void }) {
  if (!shouldCloseToTray()) return false
  e.preventDefault()
  deps?.collapseMain()
  return true
}

/** 自定义标题栏关闭按钮：返回 true 表示已处理（隐藏），false 表示应真正关闭 */
export function handleCloseButton(): boolean {
  if (!shouldCloseToTray()) return false
  deps?.collapseMain()
  return true
}

export function updateTrayPlayerState(state: PlayerTrayState) {
  lastState = state
  refreshTrayMenu()
}

export function initTrayAndMediaKeys(d: TrayMediaDeps) {
  deps = d
  loadShellPrefs()
  applyTrayVisibility()
  applyMediaKeys()

  ipcMain.handle('shell:getPrefs', () => getShellPrefs())
  ipcMain.handle('shell:setPrefs', (_e, partial: Partial<ShellPrefs>) => {
    return saveShellPrefs(partial || {})
  })

  app.on('before-quit', () => {
    isQuitting = true
    unregisterMediaKeys()
  })

  app.on('will-quit', () => {
    unregisterMediaKeys()
    destroyTray()
  })
}

export function resolveTrayIconFromCandidates(candidates: string[]): NativeImage | undefined {
  for (const p of candidates) {
    if (!existsSync(p)) continue
    const img = nativeImage.createFromPath(p)
    if (!img.isEmpty()) return img
  }
  return undefined
}
