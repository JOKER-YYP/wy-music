import { contextBridge, ipcRenderer } from 'electron'

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

export type MiniPlayerState = {
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

export type PlayerCommand =
  | { type: 'toggle' }
  | { type: 'prev' }
  | { type: 'next' }
  | { type: 'seek'; time: number }
  | { type: 'openMain' }

function toBase64Url(text: string) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const wyAPI = {
  getVersion: () => ipcRenderer.invoke('app:getVersion') as Promise<string>,
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder') as Promise<string | null>,
  selectAudioFiles: (multi = false) =>
    ipcRenderer.invoke('dialog:selectAudioFiles', multi) as Promise<string[]>,
  selectLrcFile: () =>
    ipcRenderer.invoke('dialog:selectLrcFile') as Promise<{
      path: string
      fileName: string
      lyricText: string
    } | null>,
  scanFolder: (folderPath: string) =>
    ipcRenderer.invoke('local:scanFolder', folderPath) as Promise<{
      folderPath: string
      total: number
      items: LocalAudioItem[]
      lyricMatched?: number
    }>,
  parseFiles: (paths: string[]) =>
    ipcRenderer.invoke('local:parseFiles', paths) as Promise<LocalAudioItem[]>,
  readFileForUpload: (filePath: string) =>
    ipcRenderer.invoke('local:readFileForUpload', filePath) as Promise<{
      fileName: string
      mimeType: string
      data: Uint8Array
      dir: string
      id: string
    }>,
  uploadTrack: (payload: {
    filePath: string
    accessToken: string
    apiBase?: string
    fields?: {
      name?: string
      artists?: string
      album?: string
      lyricText?: string
    }
  }) =>
    ipcRenderer.invoke('local:uploadTrack', payload) as Promise<{
      ok: boolean
      message?: string
      data?: unknown
    }>,
  toLocalPlayUrl: (filePath: string) => `wy-local://play/${toBase64Url(filePath)}`,

  // 桌面小组件
  toggleMiniPlayer: () =>
    ipcRenderer.invoke('mini:toggle') as Promise<{ open: boolean }>,
  closeMiniPlayer: () => ipcRenderer.invoke('mini:close') as Promise<boolean>,
  isMiniPlayerOpen: () => ipcRenderer.invoke('mini:isOpen') as Promise<boolean>,
  setMiniLayout: (layout: 'compact' | 'lyric') =>
    ipcRenderer.invoke('mini:setLayout', layout) as Promise<{ ok: boolean; width?: number; height?: number }>,
  focusMainWindow: () => ipcRenderer.invoke('mini:focusMain') as Promise<boolean>,
  pushPlayerState: (state: MiniPlayerState) => {
    ipcRenderer.send('player:pushState', state)
  },
  sendPlayerCommand: (cmd: PlayerCommand) => {
    ipcRenderer.send('player:command', cmd)
  },
  onPlayerState: (handler: (state: MiniPlayerState) => void) => {
    const listener = (_: Electron.IpcRendererEvent, state: MiniPlayerState) => handler(state)
    ipcRenderer.on('player:state', listener)
    return () => ipcRenderer.removeListener('player:state', listener)
  },
  onPlayerCommand: (handler: (cmd: PlayerCommand) => void) => {
    const listener = (_: Electron.IpcRendererEvent, cmd: PlayerCommand) => handler(cmd)
    ipcRenderer.on('player:command', listener)
    return () => ipcRenderer.removeListener('player:command', listener)
  },

  // 桌面歌词
  toggleDesktopLyric: () =>
    ipcRenderer.invoke('desktopLyric:toggle') as Promise<{ open: boolean }>,
  closeDesktopLyric: () => ipcRenderer.invoke('desktopLyric:close') as Promise<boolean>,
  isDesktopLyricOpen: () => ipcRenderer.invoke('desktopLyric:isOpen') as Promise<boolean>,
  setDesktopLyricLocked: (locked: boolean) =>
    ipcRenderer.invoke('desktopLyric:setLocked', locked) as Promise<boolean>,
  setDesktopLyricAlwaysOnTop: (onTop: boolean) =>
    ipcRenderer.invoke('desktopLyric:setAlwaysOnTop', onTop) as Promise<boolean>,
  setDesktopLyricIgnoreMouse: (ignore: boolean) =>
    ipcRenderer.invoke('desktopLyric:setIgnoreMouse', ignore) as Promise<boolean>,
  openDesktopLyricMenu: (anchor: { x: number; y: number }) =>
    ipcRenderer.invoke('desktopLyric:openMenu', anchor) as Promise<boolean>,
  closeDesktopLyricMenu: () => ipcRenderer.invoke('desktopLyric:closeMenu') as Promise<boolean>,
  publishDesktopLyricPrefs: (prefs: Record<string, unknown>) => {
    ipcRenderer.send('desktopLyric:prefsChanged', prefs)
  },
  onDesktopLyricPrefs: (handler: (prefs: Record<string, unknown>) => void) => {
    const listener = (_: Electron.IpcRendererEvent, prefs: Record<string, unknown>) => handler(prefs)
    ipcRenderer.on('desktopLyric:prefs', listener)
    return () => ipcRenderer.removeListener('desktopLyric:prefs', listener)
  },
}

contextBridge.exposeInMainWorld('wyAPI', wyAPI)
console.log('[preload] wyAPI ready')
