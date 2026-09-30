import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  protocol,
  net,
  dialog,
  nativeImage,
  screen,
  Menu,
} from 'electron'
import { join, extname, basename, dirname } from 'path'
import { pathToFileURL } from 'url'
import { createReadStream, existsSync } from 'fs'
import { readdir, stat, readFile } from 'fs/promises'
import { createHash, randomUUID } from 'crypto'
import FormData from 'form-data'
import axios from 'axios'
import { decodeLyricBytes, resolveTrackMeta } from '@wy-music/shared'

/** 与服务端默认上限一致；不从 shared 解构常量，避免未 build shared 时主进程起不来 */
const UPLOAD_MAX_SIZE_MB = 500

/** music-metadata v10 在 CJS(Electron main) 下 require 只有 loadMusicMetadata，需动态 import */
async function readAudioMetadata(filePath: string) {
  const mm = await import('music-metadata')
  return mm.parseFile(filePath, { duration: true, skipCovers: true })
}

const AUDIO_EXTS = new Set(['.mp3', '.wav', '.flac', '.m4a', '.aac'])
const LRC_EXTS = new Set(['.lrc'])
const API_BASE = process.env.WY_API_BASE || 'http://127.0.0.1:3001'
/** 上传/扫描忽略不足此时长的音频（毫秒） */
const MIN_UPLOAD_DURATION_MS = 30_000

function isTooShortAudio(durationMs: number) {
  return durationMs > 0 && durationMs < MIN_UPLOAD_DURATION_MS
}

let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null
let desktopLyricWindow: BrowserWindow | null = null
let desktopLyricMenuWindow: BrowserWindow | null = null
/** Windows 任务栏悬停预览：仅展示封面，避免缩略完整页面 */
let taskbarPreviewWindow: BrowserWindow | null = null
let lastPlayerState: {
  name?: string
  artists?: string
  coverUrl?: string
  playing?: boolean
  hasTrack?: boolean
  liked?: boolean
} | null = null
let focusingMainFromTaskbar = false
/** 收起/还原过渡期抑制预览窗 focus，避免主窗闪一下又被藏掉 */
let suppressTaskbarFocusRestore = false
/** 缩略图工具栏按钮点击时，短暂抑制 focus→开主窗 */
let thumbarClickGuard = false
/** 主窗是否被用户收起（比 isVisible 更稳，避免过渡态误判） */
let mainWindowCollapsed = false

const DESKTOP_LYRIC_H = 100
const DESKTOP_LYRIC_MENU_W = 300
const DESKTOP_LYRIC_MENU_H = 236
const TASKBAR_PREVIEW_SIZE = 240
let taskbarCoverCache: { src: string; dataUrl: string } | null = null
let taskbarStateSeq = 0

function absolutizeMediaUrl(u?: string | null) {
  if (!u) return ''
  if (/^(https?:|data:|blob:|file:|wy-local:)/i.test(u)) return u
  if (u.startsWith('/')) return `${API_BASE}${u}`
  return `${API_BASE}/media/${String(u).replace(/^\/+/, '')}`
}

async function coverToDataUrl(coverUrl?: string | null) {
  const abs = absolutizeMediaUrl(coverUrl)
  if (!abs) return ''
  if (abs.startsWith('data:')) return abs
  if (taskbarCoverCache?.src === abs) return taskbarCoverCache.dataUrl
  try {
    const res = await net.fetch(abs)
    if (!res.ok) return abs
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) return abs
    const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0]
    const dataUrl = `data:${ct};base64,${buf.toString('base64')}`
    taskbarCoverCache = { src: abs, dataUrl }
    return dataUrl
  } catch {
    return abs
  }
}

function placeTaskbarPreviewWindow(win: BrowserWindow) {
  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  const size = TASKBAR_PREVIEW_SIZE

  const overlapsAny = (x: number, y: number) =>
    displays.some((d) => {
      const b = d.bounds
      return x < b.x + b.width && x + size > b.x && y < b.y + b.height && y + size > b.y
    })

  // 优先放主屏左侧外侧；若多屏占用该区域，改放到所有屏下方外侧
  let x = primary.bounds.x - size - 8
  let y = primary.bounds.y + Math.max(0, Math.floor((primary.bounds.height - size) / 2))
  if (overlapsAny(x, y)) {
    const maxBottom = Math.max(...displays.map((d) => d.bounds.y + d.bounds.height))
    x = primary.bounds.x + Math.max(0, Math.floor((primary.bounds.width - size) / 2))
    y = maxBottom + 8
  }
  win.setBounds({ x, y, width: size, height: size })
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'wy-local',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
    },
  },
])

export interface LocalAudioItem {
  id: string
  path: string
  fileName: string
  name: string
  artists: string[]
  album: string
  durationMs: number
  size: number
  ext: string
  /** 音频文件内容 SHA256，用于精确去重 */
  fileHash?: string
  lyricText?: string | null
  lyricFileName?: string | null
}

function getParentWindow() {
  return (
    (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null) ||
    BrowserWindow.getFocusedWindow() ||
    BrowserWindow.getAllWindows()[0] ||
    undefined
  )
}

function loadRenderer(win: BrowserWindow, hash = '') {
  const h = hash ? (hash.startsWith('#') ? hash : `#${hash}`) : ''
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}${h}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: h.replace(/^#/, '') })
  }
}

function createMiniPlayerWindow() {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.show()
    miniWindow.focus()
    return miniWindow
  }

  const appIcon = resolveAppIcon()
  miniWindow = new BrowserWindow({
    width: 340,
    height: 92,
    minWidth: 300,
    minHeight: 88,
    maxWidth: 480,
    maxHeight: 560,
    frame: false,
    transparent: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    title: 'WY Music 小组件',
    icon: appIcon,
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: true,
    },
  })

  miniWindow.setAlwaysOnTop(true, 'floating')

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const [ww, wh] = miniWindow.getSize()
  miniWindow.setPosition(Math.max(20, sw - ww - 24), Math.max(20, sh - wh - 24))

  loadRenderer(miniWindow, '#/mini-player')

  miniWindow.once('ready-to-show', () => {
    miniWindow?.show()
  })

  miniWindow.on('closed', () => {
    miniWindow = null
  })

  return miniWindow
}

function toggleMiniPlayer() {
  if (miniWindow && !miniWindow.isDestroyed()) {
    if (miniWindow.isVisible()) {
      miniWindow.hide()
      return { open: false }
    }
    miniWindow.show()
    miniWindow.focus()
    return { open: true }
  }
  createMiniPlayerWindow()
  return { open: true }
}

function createDesktopLyricWindow() {
  if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) {
    desktopLyricWindow.show()
    return desktopLyricWindow
  }

  const appIcon = resolveAppIcon()
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const ww = Math.min(880, Math.max(480, Math.floor(sw * 0.5)))

  desktopLyricWindow = new BrowserWindow({
    width: ww,
    height: DESKTOP_LYRIC_H,
    minWidth: 360,
    minHeight: DESKTOP_LYRIC_H,
    maxWidth: 1200,
    maxHeight: DESKTOP_LYRIC_H,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: true,
    title: 'WY Music 桌面歌词',
    icon: appIcon,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: true,
    },
  })

  desktopLyricWindow.setAlwaysOnTop(true, 'screen-saver')
  desktopLyricWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  desktopLyricWindow.setPosition(Math.round((sw - ww) / 2), Math.max(20, sh - DESKTOP_LYRIC_H - 48))

  loadRenderer(desktopLyricWindow, '#/desktop-lyric')

  desktopLyricWindow.once('ready-to-show', () => {
    desktopLyricWindow?.showInactive()
  })

  desktopLyricWindow.on('closed', () => {
    desktopLyricWindow = null
    closeDesktopLyricMenu()
  })

  return desktopLyricWindow
}

function closeDesktopLyricMenu() {
  if (desktopLyricMenuWindow && !desktopLyricMenuWindow.isDestroyed()) {
    desktopLyricMenuWindow.close()
  }
  desktopLyricMenuWindow = null
}

/** 独立设置弹窗：不影响歌词条尺寸（对齐网易云） */
function openDesktopLyricMenu(anchor: { x: number; y: number }) {
  const appIcon = resolveAppIcon()
  const mw = DESKTOP_LYRIC_MENU_W
  const mh = DESKTOP_LYRIC_MENU_H
  // 锚点为齿轮顶部中心：主菜单在上方居中，窗口加宽以容纳右侧子菜单
  let x = Math.round(anchor.x - 88)
  let y = Math.round(anchor.y - mh - 6)
  const display = screen.getDisplayNearestPoint({ x: Math.round(anchor.x), y: Math.round(anchor.y) })
  const area = display.workArea
  x = Math.min(Math.max(area.x + 4, x), area.x + area.width - mw - 4)
  y = Math.min(Math.max(area.y + 4, y), area.y + area.height - mh - 4)

  if (desktopLyricMenuWindow && !desktopLyricMenuWindow.isDestroyed()) {
    desktopLyricMenuWindow.setBounds({ x, y, width: mw, height: mh })
    desktopLyricMenuWindow.show()
    desktopLyricMenuWindow.focus()
    return desktopLyricMenuWindow
  }

  desktopLyricMenuWindow = new BrowserWindow({
    width: mw,
    height: mh,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    focusable: true,
    show: false,
    parent: desktopLyricWindow || undefined,
    modal: false,
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: true,
    },
  })

  desktopLyricMenuWindow.setAlwaysOnTop(true, 'screen-saver')
  loadRenderer(desktopLyricMenuWindow, '#/desktop-lyric-menu')

  desktopLyricMenuWindow.once('ready-to-show', () => {
    desktopLyricMenuWindow?.show()
    desktopLyricMenuWindow?.focus()
  })

  desktopLyricMenuWindow.on('blur', () => {
    // 稍延时，避免点击菜单项时立刻失焦关闭
    setTimeout(() => {
      if (desktopLyricMenuWindow && !desktopLyricMenuWindow.isDestroyed() && !desktopLyricMenuWindow.isFocused()) {
        closeDesktopLyricMenu()
      }
    }, 120)
  })

  desktopLyricMenuWindow.on('closed', () => {
    desktopLyricMenuWindow = null
  })

  return desktopLyricMenuWindow
}

function toggleDesktopLyric() {
  if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) {
    if (desktopLyricWindow.isVisible()) {
      closeDesktopLyricMenu()
      desktopLyricWindow.hide()
      return { open: false }
    }
    desktopLyricWindow.showInactive()
    return { open: true }
  }
  createDesktopLyricWindow()
  return { open: true }
}

function isDesktopLyricOpen() {
  return Boolean(
    desktopLyricWindow && !desktopLyricWindow.isDestroyed() && desktopLyricWindow.isVisible(),
  )
}

function createWindow() {
  const appIcon = resolveAppIcon()
  if (appIcon && process.platform === 'darwin') {
    app.dock?.setIcon(appIcon)
  }
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 640,
    title: 'WY Music',
    icon: appIcon,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    // Windows：主窗进任务栏，缩略图按钮挂在主窗上（独立预览窗会导致按钮点击失效）
    skipTaskbar: false,
    backgroundColor: '#ec4141',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: true,
    },
  })
  mainWindow = win
  Menu.setApplicationMenu(null)

  win.once('ready-to-show', () => {
    win.show()
    updateThumbarButtons(lastPlayerState, true)
    updateTaskbarThumbnailClip()
  })

  win.on('resize', () => updateTaskbarThumbnailClip())

  win.on('closed', () => {
    mainWindow = null
    if (taskbarPreviewWindow && !taskbarPreviewWindow.isDestroyed()) {
      taskbarPreviewWindow.destroy()
      taskbarPreviewWindow = null
    }
  })

  const emitMaximized = () => {
    if (!win.isDestroyed()) {
      win.webContents.send('window:maximized', win.isMaximized())
    }
  }
  win.on('maximize', emitMaximized)
  win.on('unmaximize', emitMaximized)

  win.webContents.on('before-input-event', (event, input) => {
    if (
      input.type === 'keyDown' &&
      (input.key === 'F12' ||
        (input.key.toLowerCase() === 'i' && input.control && input.shift))
    ) {
      win.webContents.toggleDevTools()
      event.preventDefault()
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.on('closed', () => {
    mainWindow = null
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.close()
    }
    if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) {
      desktopLyricWindow.close()
    }
    closeDesktopLyricMenu()
  })

  loadRenderer(win)
}

async function walkMediaFiles(root: string): Promise<{ audios: string[]; lrcs: string[] }> {
  const audios: string[] = []
  const lrcs: string[] = []
  async function walk(dir: string) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue
      const full = join(dir, ent.name)
      if (ent.isDirectory()) {
        await walk(full)
      } else {
        const ext = extname(ent.name).toLowerCase()
        if (AUDIO_EXTS.has(ext)) audios.push(full)
        else if (LRC_EXTS.has(ext)) lrcs.push(full)
      }
    }
  }
  await walk(root)
  return { audios, lrcs }
}

/** 同目录、同名（去扩展名）优先匹配 LRC */
function buildLrcIndex(lrcPaths: string[]) {
  const map = new Map<string, string>()
  for (const p of lrcPaths) {
    const dir = dirname(p).toLowerCase()
    const base = basename(p, extname(p)).toLowerCase()
    map.set(`${dir}::${base}`, p)
  }
  return map
}

async function readLrcFile(filePath: string): Promise<string> {
  const buf = await readFile(filePath)
  return decodeLyricBytes(new Uint8Array(buf)).trim()
}

async function matchLrcForAudio(
  audioPath: string,
  lrcIndex?: Map<string, string>,
): Promise<{ lyricText: string; lyricFileName: string } | null> {
  const dir = dirname(audioPath)
  const base = basename(audioPath, extname(audioPath))
  const key = `${dir.toLowerCase()}::${base.toLowerCase()}`

  let lrcPath = lrcIndex?.get(key)
  if (!lrcPath) {
    const candidates = [join(dir, `${base}.lrc`), join(dir, `${base}.LRC`)]
    for (const c of candidates) {
      if (existsSync(c)) {
        lrcPath = c
        break
      }
    }
  }
  if (!lrcPath) return null
  try {
    const lyricText = (await readLrcFile(lrcPath)).trim()
    if (!lyricText) return null
    return { lyricText, lyricFileName: basename(lrcPath) }
  } catch {
    return null
  }
}

async function hashFileContent(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

async function parseLocalAudio(
  filePath: string,
  lrcIndex?: Map<string, string>,
): Promise<LocalAudioItem> {
  const st = await stat(filePath)
  const ext = extname(filePath).toLowerCase()
  const fileName = basename(filePath)
  const id = createHash('md5').update(filePath).digest('hex')

  let title = ''
  let tagArtists: string[] = []
  let album = ''
  let durationMs = 0
  let fileHash = ''

  try {
    const meta = await readAudioMetadata(filePath)
    if (meta.common.title) title = meta.common.title
    if (meta.common.artists?.length) tagArtists = meta.common.artists
    else if (meta.common.artist) tagArtists = [meta.common.artist]
    if (meta.common.album) album = meta.common.album
    durationMs = Math.round((meta.format.duration || 0) * 1000)
  } catch (e) {
    console.warn('[parseLocalAudio] metadata failed:', filePath, e)
  }

  try {
    fileHash = await hashFileContent(filePath)
  } catch (e) {
    console.warn('[parseLocalAudio] hash failed:', filePath, e)
  }

  const resolved = resolveTrackMeta({
    fileName,
    title,
    artists: tagArtists,
    album,
  })

  const lyric = await matchLrcForAudio(filePath, lrcIndex)

  return {
    id,
    path: filePath,
    fileName,
    name: resolved.name,
    artists: resolved.artists.length ? resolved.artists : ['未知歌手'],
    album: (resolved.album || '').trim() || '未知专辑',
    durationMs,
    size: st.size,
    ext,
    fileHash,
    lyricText: lyric?.lyricText || null,
    lyricFileName: lyric?.lyricFileName || null,
  }
}

function guessMime(ext: string) {
  switch (ext) {
    case '.wav':
      return 'audio/wav'
    case '.flac':
      return 'audio/flac'
    case '.m4a':
      return 'audio/mp4'
    case '.aac':
      return 'audio/aac'
    default:
      return 'audio/mpeg'
  }
}

function resolveAppIcon() {
  const candidates = [
    join(__dirname, '../../resources/icon.ico'),
    join(__dirname, '../../resources/icon.png'),
    join(process.cwd(), 'resources/icon.ico'),
    join(process.cwd(), 'resources/icon.png'),
  ]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    const img = nativeImage.createFromPath(p)
    if (!img.isEmpty()) return img
  }
  return undefined
}

const thumbarIconCache = new Map<string, Electron.NativeImage>()
let lastThumbarKey = ''
let lastSentPreviewCover = ''
let lastSentPreviewHasTrack = false

function flipNativeImageHorizontal(img: Electron.NativeImage) {
  try {
    if (typeof img.flipHorizontally === 'function') {
      return img.flipHorizontally()
    }
  } catch {
    // fall through
  }
  const { width, height } = img.getSize()
  const src = img.toBitmap()
  const dst = Buffer.alloc(src.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4
      const di = (y * width + (width - 1 - x)) * 4
      dst[di] = src[si]
      dst[di + 1] = src[si + 1]
      dst[di + 2] = src[si + 2]
      dst[di + 3] = src[si + 3]
    }
  }
  return nativeImage.createFromBitmap(dst, { width, height })
}

/** 抠纯黑底后缩到 16×16 */
function normalizeThumbarIcon(img: Electron.NativeImage) {
  const { width, height } = img.getSize()
  const buf = Buffer.from(img.toBitmap())
  for (let i = 0; i < buf.length; i += 4) {
    const b = buf[i]
    const g = buf[i + 1]
    const r = buf[i + 2]
    if (r <= 10 && g <= 10 && b <= 10) buf[i + 3] = 0
  }
  let out = nativeImage.createFromBitmap(buf, { width, height })
  if (width !== 16 || height !== 16) {
    out = out.resize({ width: 16, height: 16, quality: 'best' })
  }
  return nativeImage.createFromBuffer(out.toPNG())
}

/** 16×16 像素心爱心（避免数学公式画成「黑桃」） */
function createHeartThumbarIcon(filled: boolean) {
  // 1=实心像素；描边模式只取边缘
  const mask = [
    '001100011000',
    '011110111100',
    '111111111110',
    '111111111110',
    '111111111110',
    '011111111100',
    '001111111000',
    '000111110000',
    '000011100000',
    '000001000000',
  ]
  const w = 16
  const h = 16
  const buf = Buffer.alloc(w * h * 4, 0)
  const ox = 2
  const oy = 3
  const solid = new Set<string>()
  for (let y = 0; y < mask.length; y++) {
    for (let x = 0; x < mask[y].length; x++) {
      if (mask[y][x] === '1') solid.add(`${x + ox},${y + oy}`)
    }
  }
  const isSolid = (x: number, y: number) => solid.has(`${x},${y}`)
  const put = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const i = (y * w + x) * 4
    buf[i] = b
    buf[i + 1] = g
    buf[i + 2] = r
    buf[i + 3] = 255
  }
  for (const key of solid) {
    const [xs, ys] = key.split(',')
    const x = Number(xs)
    const y = Number(ys)
    if (filled) {
      put(x, y, 236, 65, 65)
    } else {
      const edge =
        !isSolid(x + 1, y) ||
        !isSolid(x - 1, y) ||
        !isSolid(x, y + 1) ||
        !isSolid(x, y - 1)
      if (edge) put(x, y, 90, 90, 90)
    }
  }
  return nativeImage.createFromBuffer(
    nativeImage.createFromBitmap(buf, { width: w, height: h }).toPNG(),
  )
}

function resolveThumbarIcon(name: 'play' | 'pause' | 'prev' | 'next' | 'like' | 'like-off') {
  const cached = thumbarIconCache.get(name)
  if (cached && !cached.isEmpty()) return cached

  // 喜欢：优先用程序像素心，资源图缩略后在任务栏常不可见/变形
  if (name === 'like' || name === 'like-off') {
    const drawn = createHeartThumbarIcon(name === 'like')
    thumbarIconCache.set(name, drawn)
    return drawn
  }

  const fileName = name === 'prev' ? 'next' : name === 'pause' ? 'stop' : name
  const candidates = [
    join(__dirname, `../../resources/thumbar/${fileName}.png`),
    join(process.cwd(), `resources/thumbar/${fileName}.png`),
  ]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    try {
      let img = nativeImage.createFromPath(p)
      if (img.isEmpty()) continue
      if (name === 'prev') img = flipNativeImageHorizontal(img)
      img = normalizeThumbarIcon(img)
      if (img.isEmpty()) continue
      thumbarIconCache.set(name, img)
      return img
    } catch (e) {
      console.warn('[taskbar] load icon failed', name, p, e)
    }
  }
  console.warn('[taskbar] missing icon', name, candidates)
  return nativeImage.createEmpty()
}

/** 缩略图按钮点击：只发播放指令 */
function onThumbarClick(type: 'prev' | 'next' | 'toggle' | 'like') {
  sendPlayerCommand({ type })
}

function updateThumbarButtons(state: typeof lastPlayerState, force = false) {
  if (process.platform !== 'win32') return
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  const enabled = Boolean(state?.hasTrack)
  const playing = Boolean(state?.playing)
  const liked = Boolean(state?.liked)
  const key = `${enabled ? 1 : 0}|${playing ? 1 : 0}|${liked ? 1 : 0}`
  if (!force && key === lastThumbarKey) return

  const icons = {
    prev: resolveThumbarIcon('prev'),
    playPause: resolveThumbarIcon(playing ? 'pause' : 'play'),
    next: resolveThumbarIcon('next'),
    like: resolveThumbarIcon(liked ? 'like' : 'like-off'),
  }
  if (
    icons.prev.isEmpty() ||
    icons.playPause.isEmpty() ||
    icons.next.isEmpty() ||
    icons.like.isEmpty()
  ) {
    console.warn('[taskbar] thumbar icons empty, skip setThumbarButtons', {
      prev: icons.prev.isEmpty(),
      playPause: icons.playPause.isEmpty(),
      next: icons.next.isEmpty(),
      like: icons.like.isEmpty(),
    })
    return
  }

  try {
    const ok = win.setThumbarButtons([
      {
        tooltip: '上一首',
        icon: icons.prev,
        flags: enabled ? ['enabled'] : ['disabled'],
        click: () => onThumbarClick('prev'),
      },
      {
        tooltip: playing ? '暂停' : '播放',
        icon: icons.playPause,
        flags: enabled ? ['enabled'] : ['disabled'],
        click: () => onThumbarClick('toggle'),
      },
      {
        tooltip: '下一首',
        icon: icons.next,
        flags: enabled ? ['enabled'] : ['disabled'],
        click: () => onThumbarClick('next'),
      },
      {
        tooltip: liked ? '取消喜欢' : '喜欢',
        icon: icons.like,
        flags: enabled ? ['enabled'] : ['disabled'],
        click: () => onThumbarClick('like'),
      },
    ])
    if (ok) lastThumbarKey = key
    else console.warn('[taskbar] setThumbarButtons returned false')
  } catch (e) {
    console.warn('[taskbar] setThumbarButtons failed', e)
  }
}

function sendPlayerCommand(cmd: { type: string }) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('player:command', cmd)
  }
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false
  mainWindowCollapsed = false
  if (mainWindow.isMinimized()) mainWindow.restore()
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
  return true
}

function playerTitle(state: typeof lastPlayerState) {
  if (!state?.hasTrack) return 'WY Music'
  const name = (state.name || '未知歌曲').trim()
  const artists = (state.artists || '').trim()
  const title = artists ? `${name} - ${artists}` : name
  return title.slice(0, 80)
}

/** 任务栏悬停缩略图：裁切到播放栏封面区域 */
let lastThumbnailClip: { x: number; y: number; width: number; height: number } | null =
  null

function updateTaskbarThumbnailClip(
  clip?: { x: number; y: number; width: number; height: number } | null,
) {
  if (process.platform !== 'win32') return
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  try {
    if (clip && clip.width > 0 && clip.height > 0) {
      lastThumbnailClip = clip
      win.setThumbnailClip({
        x: Math.max(0, Math.round(clip.x)),
        y: Math.max(0, Math.round(clip.y)),
        width: Math.round(clip.width),
        height: Math.round(clip.height),
      })
      return
    }
    if (lastThumbnailClip && lastThumbnailClip.width > 0) {
      win.setThumbnailClip({
        x: Math.max(0, Math.round(lastThumbnailClip.x)),
        y: Math.max(0, Math.round(lastThumbnailClip.y)),
        width: Math.round(lastThumbnailClip.width),
        height: Math.round(lastThumbnailClip.height),
      })
      return
    }
    // 无精确区域时退回左下角播放栏封面近似位置
    const [, height] = win.getContentSize()
    const size = 72
    win.setThumbnailClip({
      x: 10,
      y: Math.max(0, height - 70),
      width: size,
      height: size,
    })
  } catch (e) {
    console.warn('[taskbar] setThumbnailClip failed', e)
  }
}

function applyTaskbarPlayerState(state: typeof lastPlayerState) {
  lastPlayerState = state
  const title = playerTitle(state)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle(title)
  }
  if (process.platform !== 'win32') return
  updateThumbarButtons(state)
  updateTaskbarThumbnailClip()
}

/** @deprecated 已改为主窗任务栏 + setThumbnailClip，保留空函数避免旧调用报错 */
function createTaskbarPreviewWindow() {
  // no-op
}

function normalizeDedupePart(s: string) {
  return (s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function knownArtistsKey(artists?: string[]) {
  return (artists || [])
    .map(normalizeDedupePart)
    .filter((a) => a && a !== '未知歌手' && a !== 'unknown')
    .sort()
    .join(',')
}

function isUnknownArtists(artists?: string[]) {
  return !knownArtistsKey(artists)
}

function pickBetterName(a: string, b: string) {
  const na = (a || '').trim()
  const nb = (b || '').trim()
  if (!na || na === '未命名') return nb || na
  if (!nb || nb === '未命名') return na
  // 更长的通常信息更全（带副标题等）
  return na.length >= nb.length ? na : nb
}

function pickBetterArtists(a?: string[], b?: string[]) {
  if (isUnknownArtists(a) && !isUnknownArtists(b)) return [...(b || [])]
  if (isUnknownArtists(b) && !isUnknownArtists(a)) return [...(a || [])]
  const aa = a || []
  const bb = b || []
  return aa.length >= bb.length ? [...aa] : [...bb]
}

function fileQualityScore(item: LocalAudioItem) {
  let score = 0
  const ext = (item.ext || '').toLowerCase()
  if (ext === '.flac') score += 80
  else if (ext === '.wav') score += 60
  else if (ext === '.m4a' || ext === '.aac') score += 40
  else if (ext === '.mp3') score += 20
  score += Math.min(item.size / (1024 * 1024), 80)
  if (item.durationMs > 0) score += 5
  return score
}

/**
 * 整合两首重复曲：逐字段取两边更优值
 * （如 A 有歌词无专辑、B 有专辑无歌词 → 结果两者都有）
 */
function mergeLocalTrackKeepBest(a: LocalAudioItem, b: LocalAudioItem): LocalAudioItem {
  const base = fileQualityScore(a) >= fileQualityScore(b) ? a : b
  const lyricFrom =
    (a.lyricText?.trim().length || 0) >= (b.lyricText?.trim().length || 0) ? a : b

  return {
    id: base.id,
    path: base.path,
    fileName: base.fileName,
    ext: base.ext,
    size: base.size,
    name: pickBetterName(a.name, b.name),
    artists: pickBetterArtists(a.artists, b.artists),
    album: (a.album || '').trim() || (b.album || '').trim() || '',
    durationMs: Math.max(a.durationMs || 0, b.durationMs || 0),
    fileHash: a.fileHash || b.fileHash || '',
    lyricText: lyricFrom.lyricText || null,
    lyricFileName: lyricFrom.lyricFileName || null,
  }
}

/** 歌名维度能否合并：同名近时长；若两边都有明确且不同的歌手则不合并 */
function canMergeByMeta(a: LocalAudioItem, b: LocalAudioItem) {
  if (normalizeDedupePart(a.name) !== normalizeDedupePart(b.name)) return false
  if (!normalizeDedupePart(a.name)) return false

  const da = a.durationMs > 0 ? Math.round(a.durationMs / 2000) : -1
  const db = b.durationMs > 0 ? Math.round(b.durationMs / 2000) : -1
  if (da >= 0 && db >= 0 && Math.abs(da - db) > 1) return false

  const aa = knownArtistsKey(a.artists)
  const bb = knownArtistsKey(b.artists)
  if (aa && bb && aa !== bb) return false
  return true
}

function keepBetterInMap(
  map: Map<string, LocalAudioItem>,
  key: string,
  item: LocalAudioItem,
): boolean {
  const prev = map.get(key)
  if (!prev) {
    map.set(key, item)
    return false
  }
  map.set(key, mergeLocalTrackKeepBest(prev, item))
  return true
}

/**
 * 去重策略：
 * 1) 音频文件内容 SHA256 相同 → 必为重复
 * 2) 同歌名+近时长（歌手不冲突）→ 合并，并整合两边元数据
 */
function dedupeLocalTracks(items: LocalAudioItem[]): {
  items: LocalAudioItem[]
  removed: number
} {
  const byHash = new Map<string, LocalAudioItem>()
  const noHash: LocalAudioItem[] = []
  let removed = 0

  for (const item of items) {
    const hash = (item.fileHash || '').trim()
    if (!hash) {
      noHash.push(item)
      continue
    }
    if (keepBetterInMap(byHash, hash, item)) removed += 1
  }

  // 第二轮：按歌名合并，并做歌手冲突校验
  const merged: LocalAudioItem[] = []
  for (const item of [...byHash.values(), ...noHash]) {
    let absorbed = false
    for (let i = 0; i < merged.length; i++) {
      if (!canMergeByMeta(merged[i], item)) continue
      merged[i] = mergeLocalTrackKeepBest(merged[i], item)
      removed += 1
      absorbed = true
      break
    }
    if (!absorbed) merged.push(item)
  }

  merged.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  return { items: merged, removed }
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.wy-music.desktop')
  }

  protocol.handle('wy-local', (request) => {
    try {
      const raw = request.url.replace(/^wy-local:\/\/play\//, '').split(/[?#]/)[0]
      const filePath = Buffer.from(decodeURIComponent(raw), 'base64url').toString('utf8')
      return net.fetch(pathToFileURL(filePath).href)
    } catch (e) {
      console.error('[wy-local] protocol error', e)
      return new Response('Not Found', { status: 404 })
    }
  })

  ipcMain.handle('app:getVersion', () => app.getVersion())

  ipcMain.handle('window:minimize', () => {
    const win = mainWindow
    if (win && !win.isDestroyed()) win.minimize()
    return true
  })
  ipcMain.handle('window:maximize', () => {
    const win = mainWindow
    if (!win || win.isDestroyed()) return false
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })
  ipcMain.handle('window:close', () => {
    const win = mainWindow
    if (win && !win.isDestroyed()) win.close()
    return true
  })
  ipcMain.handle('window:isMaximized', () => {
    const win = mainWindow
    return Boolean(win && !win.isDestroyed() && win.isMaximized())
  })
  ipcMain.on(
    'window:thumbnailClip',
    (
      _e,
      clip: { x: number; y: number; width: number; height: number } | null,
    ) => {
      updateTaskbarThumbnailClip(clip)
    },
  )

  ipcMain.handle('mini:toggle', () => toggleMiniPlayer())
  ipcMain.handle('mini:close', () => {
    if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close()
    return true
  })
  ipcMain.handle('mini:isOpen', () => Boolean(miniWindow && !miniWindow.isDestroyed() && miniWindow.isVisible()))
  ipcMain.handle('mini:setLayout', (_e, layout: 'compact' | 'lyric') => {
    if (!miniWindow || miniWindow.isDestroyed()) return { ok: false }
    const size = layout === 'lyric' ? { width: 360, height: 420 } : { width: 340, height: 92 }
    const [x, y] = miniWindow.getPosition()
    const [, , , sh] = (() => {
      const area = screen.getPrimaryDisplay().workArea
      return [area.x, area.y, area.width, area.height] as const
    })()
    // 尽量保持底部对齐，避免切换后跑出屏幕
    const bottom = y + miniWindow.getBounds().height
    const nextY = Math.min(Math.max(20, bottom - size.height), Math.max(20, sh - size.height - 12))
    miniWindow.setMinimumSize(layout === 'lyric' ? 320 : 300, layout === 'lyric' ? 320 : 88)
    miniWindow.setSize(size.width, size.height, true)
    miniWindow.setPosition(x, nextY)
    return { ok: true, ...size }
  })
  ipcMain.handle('mini:focusMain', () => focusMainWindow())

  ipcMain.handle('desktopLyric:toggle', () => toggleDesktopLyric())
  ipcMain.handle('desktopLyric:close', () => {
    closeDesktopLyricMenu()
    if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) desktopLyricWindow.close()
    return true
  })
  ipcMain.handle('desktopLyric:isOpen', () => isDesktopLyricOpen())
  ipcMain.handle('desktopLyric:setLocked', (_e, locked: boolean) => {
    if (!desktopLyricWindow || desktopLyricWindow.isDestroyed()) return false
    if (locked) {
      desktopLyricWindow.setIgnoreMouseEvents(true, { forward: true })
    } else {
      desktopLyricWindow.setIgnoreMouseEvents(false)
    }
    return true
  })
  ipcMain.handle('desktopLyric:setAlwaysOnTop', (_e, onTop: boolean) => {
    if (!desktopLyricWindow || desktopLyricWindow.isDestroyed()) return false
    desktopLyricWindow.setAlwaysOnTop(Boolean(onTop), 'screen-saver')
    return true
  })
  ipcMain.handle('desktopLyric:setIgnoreMouse', (_e, ignore: boolean) => {
    if (!desktopLyricWindow || desktopLyricWindow.isDestroyed()) return false
    if (ignore) {
      desktopLyricWindow.setIgnoreMouseEvents(true, { forward: true })
    } else {
      desktopLyricWindow.setIgnoreMouseEvents(false)
    }
    return true
  })
  ipcMain.handle('desktopLyric:openMenu', (e, anchor: { x: number; y: number }) => {
    if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return false
    const senderWin = BrowserWindow.fromWebContents(e.sender)
    const b = senderWin?.getContentBounds()
    const screenAnchor = b
      ? { x: b.x + anchor.x, y: b.y + anchor.y }
      : anchor
    openDesktopLyricMenu(screenAnchor)
    return true
  })
  ipcMain.handle('desktopLyric:closeMenu', () => {
    closeDesktopLyricMenu()
    return true
  })
  // 设置窗 → 歌词窗：偏好同步
  ipcMain.on('desktopLyric:prefsChanged', (_e, prefs) => {
    if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) {
      desktopLyricWindow.webContents.send('desktopLyric:prefs', prefs)
    }
  })

  // 主窗口 → 小组件 / 桌面歌词 / 任务栏预览：播放状态同步
  ipcMain.on('player:pushState', (_e, state) => {
    applyTaskbarPlayerState(state || null)
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.webContents.send('player:state', state)
    }
    if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) {
      desktopLyricWindow.webContents.send('player:state', state)
    }
  })

  // 小组件 / 任务栏 → 主窗口：控制指令
  ipcMain.on('player:command', (_e, cmd) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('player:command', cmd)
    }
  })

  ipcMain.handle('dialog:selectFolder', async () => {
    const parent = getParentWindow()
    const options: Electron.OpenDialogOptions = {
      title: '选择音乐文件夹',
      properties: ['openDirectory'],
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    console.log('[dialog] folder =', result.filePaths[0])
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:selectAudioFiles', async (_e, multi = false) => {
    const parent = getParentWindow()
    const options: Electron.OpenDialogOptions = {
      title: multi ? '选择音频文件' : '选择一首音频',
      properties: multi ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: [
        { name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'm4a', 'aac'] },
        { name: 'All', extensions: ['*'] },
      ],
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths.length) return []
    console.log('[dialog] files =', result.filePaths)
    return result.filePaths
  })

  ipcMain.handle('dialog:selectLrcFile', async () => {
    const parent = getParentWindow()
    const options: Electron.OpenDialogOptions = {
      title: '选择歌词文件',
      properties: ['openFile'],
      filters: [{ name: 'LRC 歌词', extensions: ['lrc'] }],
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    const filePath = result.filePaths[0]
    try {
      const lyricText = (await readLrcFile(filePath)).trim()
      return {
        path: filePath,
        fileName: basename(filePath),
        lyricText,
      }
    } catch (e) {
      console.error('[dialog] read lrc failed', e)
      throw new Error('读取歌词文件失败')
    }
  })

  ipcMain.handle('local:scanFolder', async (_e, folderPath: string) => {
    if (!folderPath) {
      return {
        folderPath: '',
        total: 0,
        items: [] as LocalAudioItem[],
        lyricMatched: 0,
        deduped: 0,
        shortFiltered: 0,
      }
    }
    console.log('[scan] start', folderPath)
    try {
      const { audios, lrcs } = await walkMediaFiles(folderPath)
      const lrcIndex = buildLrcIndex(lrcs)
      const rawItems: LocalAudioItem[] = []
      for (const file of audios) {
        rawItems.push(await parseLocalAudio(file, lrcIndex))
      }
      const longEnough = rawItems.filter((i) => !isTooShortAudio(i.durationMs))
      const shortFiltered = rawItems.length - longEnough.length
      const { items, removed } = dedupeLocalTracks(longEnough)
      const lyricMatched = items.filter((i) => i.lyricText).length
      console.log(
        '[scan] done',
        items.length,
        'raw',
        rawItems.length,
        'shortFiltered',
        shortFiltered,
        'deduped',
        removed,
        'lrc matched',
        lyricMatched,
        '/',
        lrcs.length,
      )
      return {
        folderPath,
        total: items.length,
        items,
        lyricMatched,
        deduped: removed,
        shortFiltered,
      }
    } catch (e) {
      console.error('[scan] error', e)
      throw e
    }
  })

  ipcMain.handle('local:parseFiles', async (_e, paths: string[]) => {
    const items: LocalAudioItem[] = []
    let shortFiltered = 0
    for (const p of paths || []) {
      if (!AUDIO_EXTS.has(extname(p).toLowerCase())) continue
      const item = await parseLocalAudio(p)
      if (isTooShortAudio(item.durationMs)) {
        shortFiltered += 1
        continue
      }
      items.push(item)
    }
    return { items, shortFiltered }
  })

  ipcMain.handle('local:readFileForUpload', async (_e, filePath: string) => {
    const buf = await readFile(filePath)
    const ext = extname(filePath).toLowerCase()
    return {
      fileName: basename(filePath),
      mimeType: guessMime(ext),
      data: buf,
      dir: dirname(filePath),
      id: randomUUID(),
    }
  })

  ipcMain.handle(
    'local:uploadTrack',
    async (
      _e,
      payload: {
        filePath: string
        accessToken: string
        apiBase?: string
        fields?: {
          name?: string
          artists?: string
          album?: string
          lyricText?: string
        }
      },
    ) => {
      try {
        const { filePath, accessToken, fields = {} } = payload
        if (!filePath) return { ok: false, message: '缺少文件路径' }
        if (!accessToken) return { ok: false, message: '未登录或 Token 缺失' }

        const ext = extname(filePath).toLowerCase()
        if (!AUDIO_EXTS.has(ext)) {
          return { ok: false, message: `不支持的音频格式: ${ext}` }
        }

        const st = await stat(filePath)
        const maxBytes = UPLOAD_MAX_SIZE_MB * 1024 * 1024
        if (st.size > maxBytes) {
          return {
            ok: false,
            message: `文件过大，单文件不能超过 ${UPLOAD_MAX_SIZE_MB}MB（当前 ${(st.size / 1024 / 1024).toFixed(1)}MB）`,
          }
        }

        try {
          const meta = await readAudioMetadata(filePath)
          const durationMs = Math.round((meta.format.duration || 0) * 1000)
          if (isTooShortAudio(durationMs)) {
            return { ok: false, message: '音频时长过短（需至少 30 秒），已忽略' }
          }
        } catch {
          // 时长解析失败不阻断，交由服务端再校验
        }

        const fileName = basename(filePath)
        const mimeType = guessMime(ext)
        const form = new FormData()
        form.append('audio', createReadStream(filePath), {
          filename: fileName,
          contentType: mimeType,
          knownLength: st.size,
        })
        if (fields.name) form.append('name', fields.name)
        if (fields.artists) form.append('artists', fields.artists)
        if (fields.album !== undefined) form.append('album', fields.album ?? '')
        if (fields.lyricText !== undefined) form.append('lyricText', fields.lyricText ?? '')

        const base = (payload.apiBase || API_BASE).replace(/\/$/, '')
        const url = `${base}/api/tracks/upload`
        console.log('[upload] posting', fileName, '->', url, 'size=', st.size)

        const res = await axios.post(url, form, {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${accessToken}`,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 300000,
          validateStatus: () => true,
        })

        const json = res.data as { code?: number; message?: string; data?: unknown }
        if (res.status >= 400 || json?.code !== 0) {
          console.error('[upload] failed', res.status, json)
          return {
            ok: false,
            message: json?.message || `上传失败 HTTP ${res.status}`,
          }
        }

        console.log('[upload] success', fileName)
        return { ok: true, data: json.data, message: json.message || 'ok' }
      } catch (e) {
        console.error('[upload] error', e)
        const msg =
          axios.isAxiosError(e) && e.code === 'ECONNREFUSED'
            ? '无法连接后端，请先启动 pnpm dev:server'
            : e instanceof Error
              ? e.message
              : '上传异常'
        return { ok: false, message: msg }
      }
    },
  )

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
