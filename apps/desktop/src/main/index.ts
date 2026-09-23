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
} from 'electron'
import { join, extname, basename, dirname } from 'path'
import { pathToFileURL } from 'url'
import { createReadStream, existsSync } from 'fs'
import { readdir, stat, readFile } from 'fs/promises'
import { createHash, randomUUID } from 'crypto'
import { parseFile } from 'music-metadata'
import FormData from 'form-data'
import axios from 'axios'
import { decodeLyricBytes, resolveTrackMeta } from '@wy-music/shared'

const AUDIO_EXTS = new Set(['.mp3', '.wav', '.flac', '.m4a', '.aac'])
const LRC_EXTS = new Set(['.lrc'])
const API_BASE = process.env.WY_API_BASE || 'http://127.0.0.1:3001'

let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null
let desktopLyricWindow: BrowserWindow | null = null
let desktopLyricMenuWindow: BrowserWindow | null = null

const DESKTOP_LYRIC_H = 100
const DESKTOP_LYRIC_MENU_W = 300
const DESKTOP_LYRIC_MENU_H = 236

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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: true,
    },
  })
  mainWindow = win

  win.once('ready-to-show', () => {
    win.show()
  })

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

  try {
    const meta = await parseFile(filePath, { duration: true })
    if (meta.common.title) title = meta.common.title
    if (meta.common.artists?.length) tagArtists = meta.common.artists
    else if (meta.common.artist) tagArtists = [meta.common.artist]
    if (meta.common.album) album = meta.common.album
    durationMs = Math.round((meta.format.duration || 0) * 1000)
  } catch {
    // ignore metadata errors
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
    album: resolved.album,
    durationMs,
    size: st.size,
    ext,
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

app.whenReady().then(() => {
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
  ipcMain.handle('mini:focusMain', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
    return true
  })

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

  // 主窗口 → 小组件 / 桌面歌词：播放状态同步
  ipcMain.on('player:pushState', (_e, state) => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.webContents.send('player:state', state)
    }
    if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) {
      desktopLyricWindow.webContents.send('player:state', state)
    }
  })

  // 小组件 → 主窗口：控制指令
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
      return { folderPath: '', total: 0, items: [] as LocalAudioItem[], lyricMatched: 0 }
    }
    console.log('[scan] start', folderPath)
    try {
      const { audios, lrcs } = await walkMediaFiles(folderPath)
      const lrcIndex = buildLrcIndex(lrcs)
      const items: LocalAudioItem[] = []
      let lyricMatched = 0
      for (const file of audios) {
        const item = await parseLocalAudio(file, lrcIndex)
        if (item.lyricText) lyricMatched += 1
        items.push(item)
      }
      items.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      console.log('[scan] done', items.length, 'lrc matched', lyricMatched, '/', lrcs.length)
      return { folderPath, total: items.length, items, lyricMatched }
    } catch (e) {
      console.error('[scan] error', e)
      throw e
    }
  })

  ipcMain.handle('local:parseFiles', async (_e, paths: string[]) => {
    const items: LocalAudioItem[] = []
    for (const p of paths || []) {
      if (!AUDIO_EXTS.has(extname(p).toLowerCase())) continue
      items.push(await parseLocalAudio(p))
    }
    return items
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
        const maxBytes = 50 * 1024 * 1024
        if (st.size > maxBytes) {
          return { ok: false, message: '文件超过 50MB 限制' }
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
          timeout: 120000,
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
