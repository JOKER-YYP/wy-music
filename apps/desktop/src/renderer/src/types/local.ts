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
  /** 匹配到的 LRC 文本 */
  lyricText?: string | null
  /** 匹配到的歌词文件名 */
  lyricFileName?: string | null
}
