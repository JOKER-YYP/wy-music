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
      selectFolder: () => Promise<string | null>
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
