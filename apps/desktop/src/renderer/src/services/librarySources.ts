import type { LocalAudioItem } from '../types/local'
import type { QueueTrack } from '../stores/player'
import { localItemToQueueTrack } from './localUpload'

const STORAGE_KEY = 'wy-library-sources'

export type LibrarySourcesPrefs = {
  /** 是否读取服务端默认本地曲库（Prisma + STORAGE_ROOT） */
  includeServerLibrary: boolean
  /** 额外扫描的本机文件夹（绝对路径） */
  folders: string[]
}

export const DEFAULT_LIBRARY_SOURCES: LibrarySourcesPrefs = {
  includeServerLibrary: true,
  folders: [],
}

function normalizePath(p: string) {
  return p.trim().replace(/[/\\]+$/, '')
}

function pathKey(p: string) {
  return normalizePath(p).replace(/\\/g, '/').toLowerCase()
}

/** 至少保留一个来源：默认可仅本地数据库；关掉数据库时必须有文件夹 */
export function normalizeLibrarySources(
  input?: Partial<LibrarySourcesPrefs> | null,
): LibrarySourcesPrefs {
  const folders: string[] = []
  const seen = new Set<string>()
  for (const raw of input?.folders || []) {
    const p = normalizePath(String(raw || ''))
    if (!p) continue
    const key = pathKey(p)
    if (seen.has(key)) continue
    seen.add(key)
    folders.push(p)
  }

  let includeServerLibrary =
    input?.includeServerLibrary === undefined
      ? true
      : Boolean(input.includeServerLibrary)

  if (!includeServerLibrary && folders.length === 0) {
    includeServerLibrary = true
  }

  return { includeServerLibrary, folders }
}

export function loadLibrarySources(): LibrarySourcesPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_LIBRARY_SOURCES }
    const parsed = JSON.parse(raw) as Partial<LibrarySourcesPrefs>
    return normalizeLibrarySources(parsed)
  } catch {
    return { ...DEFAULT_LIBRARY_SOURCES }
  }
}

export function saveLibrarySources(
  prefs: Partial<LibrarySourcesPrefs>,
): LibrarySourcesPrefs {
  const current = loadLibrarySources()
  const next = normalizeLibrarySources({
    includeServerLibrary:
      prefs.includeServerLibrary !== undefined
        ? prefs.includeServerLibrary
        : current.includeServerLibrary,
    folders: prefs.folders !== undefined ? prefs.folders : current.folders,
  })
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
}

export function canDisableServerLibrary(folders: string[]) {
  return folders.some((f) => Boolean(normalizePath(f)))
}

export function isLocalFolderTrack(track: {
  id: string
  localPath?: string | null
}): boolean {
  return String(track.id).startsWith('local:') || Boolean(track.localPath)
}

/** 是否需要客户端合并（含额外文件夹，或关闭了默认库） */
export function needsClientLibraryMerge(prefs: LibrarySourcesPrefs) {
  return !prefs.includeServerLibrary || prefs.folders.length > 0
}

export function librarySourcesSummary(prefs: LibrarySourcesPrefs): string {
  const parts: string[] = []
  if (prefs.includeServerLibrary) parts.push('本地数据库')
  if (prefs.folders.length) parts.push(`${prefs.folders.length} 个文件夹`)
  return parts.join(' + ') || '本地数据库'
}

export function localItemsToLibraryTracks(items: LocalAudioItem[]): QueueTrack[] {
  return items.map(localItemToQueueTrack)
}
