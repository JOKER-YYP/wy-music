/// <reference types="vite/client" />

import type { LocalAudioItem } from './types/local'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

export {}

type MiniPlayerState = {
  name: string
  artists: string
  coverUrl: string
  playing: boolean
  currentTime: number
  duration: number
  hasTrack: boolean
  trackId?: string
  lyricText?: string
  liked?: boolean
}

type PlayerCommand =
  | { type: 'toggle' }
  | { type: 'prev' }
  | { type: 'next' }
  | { type: 'seek'; time: number }
  | { type: 'like' }
  | { type: 'openMain' }

declare global {
  interface Window {
    wyAPI?: {
      getVersion: () => Promise<string>
      minimizeWindow?: () => Promise<boolean>
      maximizeWindow?: () => Promise<boolean>
      closeWindow?: () => Promise<boolean>
      isWindowMaximized?: () => Promise<boolean>
      onWindowMaximized?: (handler: (maximized: boolean) => void) => () => void
      setThumbnailClip?: (
        clip: { x: number; y: number; width: number; height: number } | null,
      ) => void
      selectFolder: () => Promise<string | null>
      saveAudioFile?: (opts?: { defaultName?: string; title?: string }) => Promise<string | null>
      downloadFile?: (payload: {
        url: string
        destPath: string
        headers?: Record<string, string>
      }) => Promise<{ ok: boolean; path: string }>
      writeTextFile?: (payload: { path: string; text: string }) => Promise<{ ok: boolean; path: string }>
      selectAudioFiles: (multi?: boolean) => Promise<string[]>
      selectLrcFile?: () => Promise<{
        path: string
        fileName: string
        lyricText: string
      } | null>
      scanFolder: (folderPath: string) => Promise<{
        folderPath: string
        total: number
        items: LocalAudioItem[]
        lyricMatched?: number
        deduped?: number
        shortFiltered?: number
      }>
      parseFiles: (paths: string[]) => Promise<{
        items: LocalAudioItem[]
        shortFiltered: number
      }>
      readFileForUpload: (filePath: string) => Promise<{
        fileName: string
        mimeType: string
        data: Uint8Array
        dir: string
        id: string
      }>
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
      }) => Promise<{ ok: boolean; message?: string; data?: unknown }>
      toLocalPlayUrl: (filePath: string) => string
      fetchJson?: (url: string) => Promise<unknown>
      fetchFormJson?: (
        url: string,
        form: Record<string, string | number>,
      ) => Promise<unknown>
      quarkHasLogin?: () => Promise<boolean>
      quarkOpenLogin?: () => Promise<boolean>
      quarkEnsureLogin?: () => Promise<boolean>
      quarkLogout?: () => Promise<boolean>
      quarkResolveShare?: (shareUrl: string) => Promise<{ url: string; fileName: string }>
      quarkDownloadFile?: (payload: {
        url: string
        destPath: string
      }) => Promise<{ ok: boolean; path: string }>
      onQuarkLoginChanged?: (handler: (ok: boolean) => void) => () => void
      baiduHasLogin?: () => Promise<boolean>
      baiduOpenLogin?: () => Promise<boolean>
      baiduEnsureLogin?: () => Promise<boolean>
      baiduLogout?: () => Promise<boolean>
      baiduResolveShare?: (shareUrl: string) => Promise<{ url: string; fileName: string }>
      baiduDownloadFile?: (payload: {
        url: string
        destPath: string
      }) => Promise<{ ok: boolean; path: string }>
      onBaiduLoginChanged?: (handler: (ok: boolean) => void) => () => void
      toggleMiniPlayer?: () => Promise<{ open: boolean }>
      closeMiniPlayer?: () => Promise<boolean>
      isMiniPlayerOpen?: () => Promise<boolean>
      setMiniLayout?: (layout: 'compact' | 'lyric') => Promise<{ ok: boolean; width?: number; height?: number }>
      focusMainWindow?: () => Promise<boolean>
      pushPlayerState?: (state: MiniPlayerState) => void
      sendPlayerCommand?: (cmd: PlayerCommand) => void
      onPlayerState?: (handler: (state: MiniPlayerState) => void) => () => void
      onPlayerCommand?: (handler: (cmd: PlayerCommand) => void) => () => void
      toggleDesktopLyric?: () => Promise<{ open: boolean }>
      closeDesktopLyric?: () => Promise<boolean>
      isDesktopLyricOpen?: () => Promise<boolean>
      setDesktopLyricLocked?: (locked: boolean) => Promise<boolean>
      setDesktopLyricAlwaysOnTop?: (onTop: boolean) => Promise<boolean>
      setDesktopLyricIgnoreMouse?: (ignore: boolean) => Promise<boolean>
      openDesktopLyricMenu?: (anchor: { x: number; y: number }) => Promise<boolean>
      closeDesktopLyricMenu?: () => Promise<boolean>
      publishDesktopLyricPrefs?: (prefs: Record<string, unknown>) => void
      onDesktopLyricPrefs?: (handler: (prefs: Record<string, unknown>) => void) => () => void
    }
  }
}
