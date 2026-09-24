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

export interface UserNotificationDto {
  id: string
  type: string
  title: string
  body: string
  trackId?: string | null
  trackName?: string | null
  read: boolean
  createdAt: string
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

/** 括号内剧名/推广说明，不是真实歌名：如 (电影《左耳》推广曲) */
function isParenDescription(s: string): boolean {
  const t = (s || '').trim()
  if (!t) return false

  const wrapped = /^[(\uFF08（].+[)\uFF09）]$/u.test(t)
  const inner = wrapped ? t.slice(1, -1).trim() : t
  const descRe =
    /电影|电视剧|网络剧|综艺|动画|推广曲|宣传曲|主题曲|片头曲|片尾曲|插曲|原声|配乐|片头|片尾|同名曲|推广/
  if (wrapped && (descRe.test(inner) || /[《》]/.test(inner))) return true
  if (!wrapped && /^(电影|电视剧|网络剧).{0,24}(主题曲|片头曲|片尾曲|插曲|推广曲|宣传曲)$/u.test(t)) {
    return true
  }
  // 无外层括号但整段像「电影《左耳》推广曲」
  if (!wrapped && descRe.test(t) && /[《》]/.test(t) && cjkCount(t) <= 16 && !/-/.test(t)) {
    return true
  }
  return false
}

/** 去掉末尾剧名说明：美好的昨天-(电影《左耳》推广曲) → 美好的昨天 */
function stripTrailingDescriptions(s: string): string {
  let out = s.trim()
  for (let i = 0; i < 3; i++) {
    const next = out
      .replace(/(?:[-–—－_\s]*)[(\uFF08（][^)\uFF09）]*[)\uFF09）]\s*$/u, '')
      .trim()
    if (next === out) break
    out = next
  }
  return out || s.trim()
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
  if (isParenDescription(s)) return -100
  if (looksLikeArtistIdToken(s)) score += 80
  if (/^[A-Za-z][A-Za-z0-9_\s.]*$/.test(s) && s.length <= 28) score += 30
  const cjk = cjkCount(s)
  if (cjk >= 1 && cjk <= 4 && s.length <= 8 && !/[《》]/.test(s)) score += 20
  if (/^[A-Za-z0-9]+([\u4e00-\u9fff]+)?$/u.test(s) && s.length <= 16) score += 15
  if (/\b(feat\.?|ft\.?)\b/i.test(s)) score -= 15
  if (/[《》]|主题曲|片尾曲|插曲|片头曲|推广曲/.test(s)) score -= 40
  return score
}

function titleLikeness(s: string): number {
  let score = 0
  // 整段都是「(电影《…》推广曲)」这类说明，绝不能当歌名
  if (isParenDescription(s)) return -80
  if (looksLikeArtistIdToken(s)) score -= 60
  const cjk = cjkCount(s)
  if (cjk >= 2) score += 8 + cjk
  if (cjk >= 4) score += 12
  // 歌名后带副标题加分；纯括号说明已在上方剔除
  if (/主题曲|片尾曲|插曲|片头曲|\(Live\)|\(合唱|\(正式|\(纯歌/i.test(s)) score += 25
  if (/[《》]/.test(s) && !/^[(\uFF08（]/.test(s.trim())) score += 15
  if (/\([^)]+\)|（[^）]+）/.test(s) && !isParenDescription(s)) score += 8
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
  if (parts.length === 1) {
    return { name: stripTrailingDescriptions(parts[0]), artists: [] }
  }

  if (parts.length === 2) {
    const [left, right] = parts
    // 歌名-(电影《…》推广曲) ：右侧是说明，不是歌手
    if (isParenDescription(right) && !isParenDescription(left)) {
      return { name: stripTrailingDescriptions(left), artists: [] }
    }
    if (isParenDescription(left) && !isParenDescription(right)) {
      return { name: stripTrailingDescriptions(right), artists: [] }
    }
    if (decideOrder(left, right, false) === 'title-artist') {
      return { name: stripTrailingDescriptions(left), artists: splitArtistNames(right) }
    }
    return { name: stripTrailingDescriptions(right), artists: splitArtistNames(left) }
  }

  // ≥3：末段歌手，首个非说明段为歌名（中间多为剧名/说明）
  const artistPart = parts[parts.length - 1]
  if (isParenDescription(artistPart)) {
    const namePart = parts.find((p) => !isParenDescription(p)) || parts[0]
    return { name: stripTrailingDescriptions(namePart), artists: [] }
  }
  const namePart = parts.slice(0, -1).find((p) => !isParenDescription(p)) || parts[0]
  return {
    name: stripTrailingDescriptions(namePart),
    artists: splitArtistNames(artistPart),
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

    if (isParenDescription(right) && !isParenDescription(left)) {
      return { name: stripTrailingDescriptions(left), artists: [] }
    }
    if (isParenDescription(left) && !isParenDescription(right)) {
      return { name: stripTrailingDescriptions(right), artists: [] }
    }

    // 「被人 - 《…》主题曲-薛之谦」
    if (right.includes('-')) {
      const nested = parseDashParts(right)
      if (nested.artists.length) {
        return { name: stripTrailingDescriptions(left), artists: nested.artists }
      }
      if (nested.name && !isParenDescription(nested.name)) {
        return { name: stripTrailingDescriptions(left), artists: nested.artists }
      }
    }

    if (decideOrder(left, right, true) === 'title-artist') {
      return { name: stripTrailingDescriptions(left), artists: splitArtistNames(right) }
    }
    return { name: stripTrailingDescriptions(right), artists: splitArtistNames(left) }
  }

  if (!/[-–—]/.test(base)) {
    return { name: stripTrailingDescriptions(base), artists: [] }
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

/**
 * 修复 ID3 标签「GBK/GB18030 被当成 Latin-1」乱码（如 »Æ»è）；
 * 全是 ? 的视为无效，返回空串以便回退到文件名。
 */
export function repairTagText(input?: string | null): string {
  const raw = (input || '').trim()
  if (!raw) return ''
  if (/^\?+$/.test(raw)) return ''

  const cjk = (raw.match(/[\u4e00-\u9fff]/g) || []).length
  const latin1 = (raw.match(/[\u00c0-\u00ff]/g) || []).length

  if (latin1 === 0) return raw
  if (cjk >= 2 && cjk >= latin1) return raw

  try {
    const bytes = Uint8Array.from(raw, (ch) => ch.charCodeAt(0) & 0xff)
    for (const enc of ['gb18030', 'gbk'] as const) {
      try {
        const decoded = new TextDecoder(enc).decode(bytes).trim()
        if (!decoded) continue
        const dcjk = (decoded.match(/[\u4e00-\u9fff]/g) || []).length
        const dlatin = (decoded.match(/[\u00c0-\u00ff]/g) || []).length
        if (dcjk >= 1 && dcjk > cjk && dlatin <= latin1) return decoded
        if (dcjk >= 2 && dlatin < latin1) return decoded
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  if (cjk === 0 && latin1 >= 2) return ''
  return raw
}

/** 合并元数据与文件名解析；优先用标签，缺失/乱码/剧名说明时用文件名补齐 */
export function resolveTrackMeta(input: {
  fileName: string
  title?: string | null
  artists?: string[] | null
  album?: string | null
}): { name: string; artists: string[]; album: string } {
  const fromFile = parseAudioFilename(input.fileName)
  const tagTitle = repairTagText(input.title)
  const tagArtists = (input.artists || []).map((s) => repairTagText(s)).filter(Boolean)
  const tagAlbum = repairTagText(input.album)

  const unknown = (a: string[]) =>
    !a.length || a.every((x) => !x || x === '未知歌手' || x.toLowerCase() === 'unknown')

  const fromTitle =
    tagTitle.includes('-') || tagTitle.includes('–') || tagTitle.includes('—')
      ? parseAudioFilename(`${tagTitle}.mp3`)
      : { name: tagTitle, artists: [] as string[] }

  let artists = !unknown(tagArtists) ? tagArtists : fromFile.artists
  if (unknown(artists) && fromTitle.artists.length) artists = fromTitle.artists

  let name = ''
  // 标签整段是「(电影《…》推广曲)」时不可用，回退文件名
  if (tagTitle && !isParenDescription(tagTitle)) {
    if (fromTitle.name && !isParenDescription(fromTitle.name)) {
      name = fromTitle.name
    } else {
      name = stripTrailingDescriptions(tagTitle) || tagTitle
    }
  } else {
    name = fromFile.name
  }

  if (isParenDescription(name) && fromFile.name && !isParenDescription(fromFile.name)) {
    name = fromFile.name
  }

  // 仍像说明时，尝试用专辑名（部分网易云导出把歌名写在 album）
  if (
    isParenDescription(name) &&
    tagAlbum &&
    !isParenDescription(tagAlbum) &&
    cjkCount(tagAlbum) >= 2
  ) {
    name = tagAlbum
  }

  name = stripTrailingDescriptions(name) || name

  // 文件名能拆出「歌名-说明-歌手」时，优先采用文件名歌名（比错误 ID3 更准）
  if (
    fromFile.name &&
    !isParenDescription(fromFile.name) &&
    fromFile.artists.length &&
    (isParenDescription(tagTitle) || isParenDescription(fromTitle.name) || !tagTitle)
  ) {
    name = fromFile.name
  }

  return {
    name: name || fromFile.name || '未命名',
    artists,
    album: tagAlbum,
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
