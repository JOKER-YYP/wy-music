export type Role = 'user' | 'admin'

export type TrackStatus = 'pending' | 'published' | 'rejected' | 'offline'

export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

export interface UserPublic {
  id: string
  account: string
  nickname: string
  avatarUrl?: string | null
  bio?: string | null
  role: Role
  createdAt: string
}

export interface TrackDto {
  id: string
  name: string
  artists: string[]
  album?: string | null
  durationMs: number
  coverUrl?: string | null
  lyricText?: string | null
  status: TrackStatus
  rejectReason?: string | null
  uploaderId: string
  uploaderNickname?: string
  playCount: number
  liked?: boolean
  fileSize: number
  mimeType: string
  createdAt: string
  updatedAt: string
}

export interface PlaylistDto {
  id: string
  name: string
  coverUrl?: string | null
  description?: string | null
  isSystem: boolean
  isPublic: boolean
  ownerId: string
  trackCount?: number
  createdAt: string
}

export interface CommentDto {
  id: string
  trackId: string
  content: string
  parentId?: string | null
  likeCount: number
  liked?: boolean
  replyCount?: number
  createdAt: string
  user: {
    id: string
    nickname: string
    avatarUrl?: string | null
  }
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  user: UserPublic
}

export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export interface DashboardStats {
  userCount: number
  trackCount: number
  publishedCount: number
  pendingCount: number
  todayUploadCount: number
  todayPlayCount: number
}

export const AUDIO_MIME_WHITELIST = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
  'audio/x-flac',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
] as const

export const AUDIO_EXT_WHITELIST = ['.mp3', '.wav', '.flac', '.m4a', '.aac'] as const

export const DEFAULT_PAGE_SIZE = 20

/** 从文件名解析歌名/歌手，支持「歌手 - 歌名」「歌手-歌名」等 */
export function parseAudioFilename(fileName: string): {
  name: string
  artists: string[]
} {
  const base = fileName.replace(/\.[^.]+$/i, '').trim()
  if (!base) {
    return { name: '未命名', artists: [] }
  }

  // 去掉常见前缀编号：01. / 01- / [12]
  const cleaned = base
    .replace(/^\s*[\(\[【]?\d{1,3}[\)\]】]?[\.\-_、\s]+/, '')
    .trim()

  const seps = [' - ', ' – ', ' — ', ' － ', '-', '–', '—', '_']
  for (const sep of seps) {
    const idx = cleaned.indexOf(sep)
    if (idx <= 0) continue
    const left = cleaned.slice(0, idx).trim()
    const right = cleaned.slice(idx + sep.length).trim()
    if (left && right) {
      // 多歌手：A/B 或 A、B 或 A&B
      const artists = left
        .split(/[/、,&＆]/)
        .map((s) => s.trim())
        .filter(Boolean)
      return { name: right, artists }
    }
  }

  return { name: cleaned, artists: [] }
}

/** 合并元数据与文件名解析；优先用标签，缺失时用文件名补齐 */
export function resolveTrackMeta(input: {
  fileName: string
  title?: string | null
  artists?: string[] | null
  album?: string | null
}): { name: string; artists: string[]; album: string } {
  const fromFile = parseAudioFilename(input.fileName)
  const tagTitle = (input.title || '').trim()
  const tagArtists = (input.artists || []).map((s) => s.trim()).filter(Boolean)
  const unknown = (a: string[]) =>
    !a.length || a.every((x) => !x || x === '未知歌手' || x.toLowerCase() === 'unknown')

  // 标签歌名里也可能是「歌手 - 歌名」
  const fromTitle = tagTitle.includes('-') || tagTitle.includes('–') || tagTitle.includes('—')
    ? parseAudioFilename(`${tagTitle}.mp3`)
    : { name: tagTitle, artists: [] as string[] }

  let artists = !unknown(tagArtists) ? tagArtists : fromFile.artists
  if (unknown(artists) && fromTitle.artists.length) artists = fromTitle.artists

  let name = tagTitle || fromFile.name
  // 若歌名仍带着「歌手 - 」且歌手已解析出，用右侧歌名
  if (fromTitle.artists.length && fromTitle.name) name = fromTitle.name
  else if (!tagTitle) name = fromFile.name

  return {
    name: name || fromFile.name || '未命名',
    artists,
    album: (input.album || '').trim(),
  }
}

/** 歌词文本打分：中文多、替换字符少者为优（用于编码探测） */
function scoreLyricText(text: string): number {
  const replacement = (text.match(/\uFFFD/g) || []).length
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const hasLrc = /\[\d{1,2}:\d{2}/.test(text) ? 80 : 0
  const hasMeta = /\[(ti|ar|al|offset):/i.test(text) ? 20 : 0
  // Latin-1 误读 GBK 时常见的高位拉丁字符
  const latin1Noise = (text.match(/[\u00c0-\u00ff]/g) || []).length
  return cjk * 3 + hasLrc + hasMeta - replacement * 40 - latin1Noise * 2
}

/**
 * 自动探测歌词编码（UTF-8 / UTF-16 / GBK / GB18030）。
 * 国内很多 .lrc 为 GBK，按 UTF-8 读会变成 � / ÿ 乱码。
 */
export function decodeLyricBytes(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  }

  const encodings = ['utf-8', 'gb18030', 'gbk'] as const
  let best = ''
  let bestScore = Number.NEGATIVE_INFINITY

  for (const enc of encodings) {
    try {
      const text = new TextDecoder(enc, { fatal: false }).decode(bytes)
      const score = scoreLyricText(text)
      if (score > bestScore) {
        bestScore = score
        best = text
      }
    } catch {
      // 部分运行时可能不支持 gbk 标签，跳过
    }
  }

  return best || new TextDecoder('utf-8').decode(bytes)
}
