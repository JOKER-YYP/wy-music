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

function cjkCount(s: string): number {
  return (s.match(/[\u4e00-\u9fff]/g) || []).length
}

/** 去掉网易云尾部歌曲数字 ID：-466821 */
function stripTrailingSongId(s: string): string {
  return s.replace(/[-_]\d{5,}\s*$/u, '').replace(/_+$/u, '').trim()
}

/** 去掉下载站杂质：[mqms2] 等 */
function stripPlatformTags(s: string): string {
  return s
    .replace(/\s*\[(mqms\d*|ok|sq|hq|hires?|flac|320|128)\]\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikeArtistIdToken(s: string): boolean {
  return /^.+[-_]\d{5,}$/.test(s.trim())
}

function artistLikeness(s: string): number {
  let score = 0
  if (looksLikeArtistIdToken(s)) score += 80
  if (/^[A-Za-z][A-Za-z0-9_\s.]*$/.test(s) && s.length <= 28) score += 30
  const cjk = cjkCount(s)
  if (cjk >= 1 && cjk <= 4 && s.length <= 8 && !/[《》]/.test(s)) score += 20
  if (/^[A-Za-z0-9]+([\u4e00-\u9fff]+)?$/u.test(s) && s.length <= 16) score += 15
  if (/\b(feat\.?|ft\.?)\b/i.test(s)) score -= 15
  if (/[《》]|主题曲|片尾曲|插曲|片头曲/.test(s)) score -= 40
  return score
}

function titleLikeness(s: string): number {
  let score = 0
  if (looksLikeArtistIdToken(s)) score -= 60
  const cjk = cjkCount(s)
  if (cjk >= 2) score += 8 + cjk
  if (cjk >= 4) score += 12
  if (/[《》]|主题曲|片尾曲|插曲|\(Live\)|\(合唱|\(正式|\(纯歌/i.test(s)) score += 25
  if (/\([^)]+\)|（[^）]+）/.test(s)) score += 8
  return score
}

function splitArtistNames(raw: string): string[] {
  return raw
    .split(/[/、,&＆]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function decideOrder(
  left: string,
  right: string,
  spaced: boolean,
): 'artist-title' | 'title-artist' {
  // 无空格 + 两侧短中文：优先「歌名-歌手」（网易云，如 半生雪-是七叔呢）
  if (
    !spaced &&
    cjkCount(left) >= 2 &&
    cjkCount(right) >= 2 &&
    left.length <= 12 &&
    right.length <= 14 &&
    !/[《》]/.test(left) &&
    !/[《》]/.test(right) &&
    !looksLikeArtistIdToken(left) &&
    !looksLikeArtistIdToken(right)
  ) {
    return 'title-artist'
  }

  const scoreArtistLeft = artistLikeness(left) + titleLikeness(right)
  const scoreArtistRight = artistLikeness(right) + titleLikeness(left)

  if (scoreArtistRight > scoreArtistLeft + 2) return 'title-artist'
  if (scoreArtistLeft > scoreArtistRight + 2) return 'artist-title'

  if (spaced) return 'artist-title'
  if (cjkCount(left) > 0 && cjkCount(right) > 0) return 'title-artist'
  return 'artist-title'
}

/** 按无空格 - 拆段：歌名[-描述]-歌手 */
function parseDashParts(raw: string): { name: string; artists: string[] } {
  const parts = raw
    .split('-')
    .map((p) => p.trim())
    .filter(Boolean)
  if (!parts.length) return { name: '未命名', artists: [] }
  if (parts.length === 1) return { name: parts[0], artists: [] }

  if (parts.length === 2) {
    const [left, right] = parts
    if (decideOrder(left, right, false) === 'title-artist') {
      return { name: left, artists: splitArtistNames(right) }
    }
    return { name: right, artists: splitArtistNames(left) }
  }

  // ≥3：末段歌手，首段歌名（中间多为剧名/说明）
  return {
    name: parts[0],
    artists: splitArtistNames(parts[parts.length - 1]),
  }
}

/**
 * 从文件名解析歌名/歌手。
 * 支持仅歌名、歌手 - 歌名、歌名-歌手、歌名-歌手-数字ID、歌名-描述-歌手-ID、[mqms2] 等。
 */
export function parseAudioFilename(fileName: string): {
  name: string
  artists: string[]
} {
  let base = fileName.replace(/\.[^.]+$/i, '').trim()
  if (!base) return { name: '未命名', artists: [] }

  base = base.replace(/^\s*[\(\[【]?\d{1,3}[\)\]】]?[\.\-_、\s]+/, '').trim()
  base = stripPlatformTags(base)
  base = stripTrailingSongId(base)

  const spacedMatch = base.match(/^(.+?)\s+[-–—－]\s+(.+)$/u)
  if (spacedMatch) {
    const left = spacedMatch[1].trim()
    let right = stripTrailingSongId(stripPlatformTags(spacedMatch[2].trim()))

    // 「被人 - 《…》主题曲-薛之谦」
    if (right.includes('-')) {
      const nested = parseDashParts(right)
      if (nested.artists.length) {
        return { name: left, artists: nested.artists }
      }
    }

    if (decideOrder(left, right, true) === 'title-artist') {
      return { name: left, artists: splitArtistNames(right) }
    }
    return { name: right, artists: splitArtistNames(left) }
  }

  if (!/[-–—]/.test(base)) {
    return { name: base, artists: [] }
  }

  return parseDashParts(base.replace(/[–—]/g, '-'))
}

/** 互换歌名与歌手 */
export function swapNameAndArtists(input: {
  name: string
  artists: string[]
}): { name: string; artists: string[] } {
  const artistJoined = (input.artists || []).map((s) => s.trim()).filter(Boolean).join(' / ')
  const name = (input.name || '').trim()
  if (!artistJoined && !name) {
    return { name: input.name || '', artists: [...(input.artists || [])] }
  }
  return {
    name: artistJoined || name,
    artists: name ? [name] : [],
  }
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

  const fromTitle =
    tagTitle.includes('-') || tagTitle.includes('–') || tagTitle.includes('—')
      ? parseAudioFilename(`${tagTitle}.mp3`)
      : { name: tagTitle, artists: [] as string[] }

  let artists = !unknown(tagArtists) ? tagArtists : fromFile.artists
  if (unknown(artists) && fromTitle.artists.length) artists = fromTitle.artists

  let name = tagTitle || fromFile.name
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
