import type { LocalAudioItem } from '../types/local'
import type { QueueTrack } from '../stores/player'
import { ElMessage } from 'element-plus'
import { http } from './http'

export function isElectronApp() {
  return Boolean(window.wyAPI?.selectFolder && window.wyAPI?.uploadTrack)
}

/** 批量查询哪些 fileHash 已在公共曲库中（非 offline） */
export async function checkLibraryHashes(hashes: string[]): Promise<Set<string>> {
  const unique = [...new Set(hashes.map((h) => h.trim()).filter(Boolean))]
  if (!unique.length) return new Set()
  if (!localStorage.getItem('accessToken')) return new Set()

  const existing = new Set<string>()
  const CHUNK = 500
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK)
    const { data } = await http.post<{
      code: number
      data?: { hashes?: string[] }
    }>('/api/tracks/check-library', { hashes: chunk })
    for (const h of data?.data?.hashes || []) {
      if (h) existing.add(h)
    }
  }
  return existing
}

export async function uploadLocalItem(
  item: LocalAudioItem,
  extra?: { name?: string; artists?: string; album?: string; lyricText?: string },
) {
  if (!window.wyAPI?.uploadTrack) {
    throw new Error('桌面上传 API 不可用')
  }

  const accessToken = localStorage.getItem('accessToken') || ''
  if (!accessToken) {
    throw new Error('请先登录')
  }

  const result = await window.wyAPI.uploadTrack({
    filePath: item.path,
    accessToken,
    apiBase: 'http://127.0.0.1:3001',
    fields: {
      name: extra?.name || item.name,
      artists: extra?.artists || item.artists.join(','),
      album: extra?.album ?? item.album,
      lyricText: extra?.lyricText,
    },
  })

  if (!result.ok) {
    const msg = result.message || '上传失败'
    ElMessage.error(msg)
    throw new Error(msg)
  }

  return result
}

/** 网页端：用浏览器 File + FormData 直传 API */
export async function uploadBrowserFile(
  file: File,
  extra?: { name?: string; artists?: string; album?: string; lyricText?: string },
) {
  if (!localStorage.getItem('accessToken')) {
    const msg = '请先登录'
    ElMessage.error(msg)
    throw new Error(msg)
  }

  const fd = new FormData()
  fd.append('audio', file, file.name)
  if (extra?.name) fd.append('name', extra.name)
  if (extra?.artists) fd.append('artists', extra.artists)
  if (extra?.album !== undefined) fd.append('album', extra.album ?? '')
  if (extra?.lyricText !== undefined) fd.append('lyricText', extra.lyricText ?? '')

  const { data } = await http.post('/api/tracks/upload', fd, {
    timeout: 300000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  })
  return data
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export function formatDuration(ms: number) {
  const sec = Math.floor((ms || 0) / 1000)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function localItemToQueueTrack(item: LocalAudioItem): QueueTrack {
  return {
    id: `local:${item.id}`,
    name: item.name,
    artists: item.artists,
    album: item.album || null,
    durationMs: item.durationMs,
    coverUrl: null,
    lyricText: item.lyricText || null,
    status: 'published',
    rejectReason: null,
    uploaderId: '',
    playCount: 0,
    liked: false,
    fileSize: item.size,
    mimeType: 'audio/mpeg',
    createdAt: '',
    updatedAt: '',
    localPath: item.path || undefined,
  }
}

export function browserFileToQueueTrack(
  file: File,
  meta?: { name?: string; artists?: string[]; previewUrl?: string },
): QueueTrack {
  return {
    id: `webfile:${file.name}:${file.size}:${file.lastModified}`,
    name: meta?.name || file.name.replace(/\.[^.]+$/, ''),
    artists: meta?.artists?.length ? meta.artists : ['未知歌手'],
    album: null,
    durationMs: 0,
    coverUrl: null,
    lyricText: null,
    status: 'published',
    rejectReason: null,
    uploaderId: '',
    playCount: 0,
    liked: false,
    fileSize: file.size,
    mimeType: file.type || 'audio/mpeg',
    createdAt: '',
    updatedAt: '',
    previewFile: file,
    previewUrl: meta?.previewUrl,
  }
}
