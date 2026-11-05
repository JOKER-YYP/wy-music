import type { QueueTrack } from '../stores/player'

const SESSION_KEY = 'wy-player-session'
const REMEMBER_KEY = 'wy-remember-playback'

export type PlayerSessionSnapshot = {
  v: 1
  queue: QueueTrack[]
  nextPlayQueue: QueueTrack[]
  currentIndex: number
  currentTime: number
  mode: 'order' | 'loop' | 'single' | 'shuffle'
  updatedAt: number
}

/** 默认开启进度记忆 */
export function isRememberPlaybackEnabled() {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== '0'
  } catch {
    return true
  }
}

export function setRememberPlaybackEnabled(on: boolean) {
  try {
    localStorage.setItem(REMEMBER_KEY, on ? '1' : '0')
    if (!on) localStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

/** 去掉无法跨会话恢复的字段（File / blob URL 等） */
export function serializeQueueTrack(track: QueueTrack): QueueTrack | null {
  if (!track?.id) return null
  if (track.previewFile) return null
  if (track.id.startsWith('webfile:') && !track.localPath) return null

  const previewUrl =
    track.previewUrl && /^https?:\/\//i.test(track.previewUrl) ? track.previewUrl : undefined

  return {
    id: track.id,
    name: track.name,
    artists: Array.isArray(track.artists) ? track.artists : [],
    album: track.album ?? null,
    durationMs: Number(track.durationMs) || 0,
    coverUrl: track.coverUrl ?? null,
    lyricText: track.lyricText ?? null,
    status: track.status || 'published',
    uploaderId: track.uploaderId || '',
    playCount: track.playCount || 0,
    liked: Boolean(track.liked),
    fileSize: track.fileSize || 0,
    mimeType: track.mimeType || 'audio/mpeg',
    createdAt: track.createdAt || '',
    updatedAt: track.updatedAt || '',
    source: track.source,
    externalId: track.externalId,
    payTag: track.payTag,
    localPath: track.localPath,
    previewUrl,
  }
}

export function sanitizeQueue(list: QueueTrack[] | undefined | null): QueueTrack[] {
  if (!Array.isArray(list)) return []
  const out: QueueTrack[] = []
  const seen = new Set<string>()
  for (const t of list) {
    const s = serializeQueueTrack(t)
    if (!s || seen.has(s.id)) continue
    seen.add(s.id)
    out.push(s)
  }
  return out
}

export function loadPlayerSession(): PlayerSessionSnapshot | null {
  if (!isRememberPlaybackEnabled()) return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PlayerSessionSnapshot
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.queue)) return null
    const queue = sanitizeQueue(parsed.queue)
    if (!queue.length) return null
    let currentIndex = Number(parsed.currentIndex)
    if (!Number.isFinite(currentIndex) || currentIndex < 0 || currentIndex >= queue.length) {
      currentIndex = 0
    }
    const mode = parsed.mode
    const okMode =
      mode === 'order' || mode === 'loop' || mode === 'single' || mode === 'shuffle' ? mode : 'order'
    return {
      v: 1,
      queue,
      nextPlayQueue: sanitizeQueue(parsed.nextPlayQueue),
      currentIndex,
      currentTime: Math.max(0, Number(parsed.currentTime) || 0),
      mode: okMode,
      updatedAt: Number(parsed.updatedAt) || Date.now(),
    }
  } catch {
    return null
  }
}

export function savePlayerSession(snap: Omit<PlayerSessionSnapshot, 'v' | 'updatedAt'>) {
  if (!isRememberPlaybackEnabled()) return
  try {
    const queue = sanitizeQueue(snap.queue)
    if (!queue.length) {
      localStorage.removeItem(SESSION_KEY)
      return
    }
    let currentIndex = snap.currentIndex
    if (currentIndex < 0 || currentIndex >= queue.length) currentIndex = 0
    const payload: PlayerSessionSnapshot = {
      v: 1,
      queue,
      nextPlayQueue: sanitizeQueue(snap.nextPlayQueue),
      currentIndex,
      currentTime: Math.max(0, Number(snap.currentTime) || 0),
      mode: snap.mode,
      updatedAt: Date.now(),
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}

export function clearPlayerSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}
