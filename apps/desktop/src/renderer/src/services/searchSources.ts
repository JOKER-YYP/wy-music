import type { MusicSource } from '@wy-music/shared'
import { MUSIC_SOURCES } from '@wy-music/shared'

const STORAGE_KEY = 'wy-search-sources'

/** 规范化：只保留合法源，空则回退全部 */
export function normalizeSearchSources(input?: readonly string[] | null): MusicSource[] {
  if (!input?.length) return [...MUSIC_SOURCES]
  const set = new Set(input)
  const list = MUSIC_SOURCES.filter((s) => set.has(s))
  return list.length ? list : [...MUSIC_SOURCES]
}

export function loadSearchSources(): MusicSource[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [...MUSIC_SOURCES]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...MUSIC_SOURCES]
    return normalizeSearchSources(parsed.map(String))
  } catch {
    return [...MUSIC_SOURCES]
  }
}

export function saveSearchSources(sources: MusicSource[]) {
  const next = normalizeSearchSources(sources)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
}

export function isAllSearchSources(sources: MusicSource[]) {
  return sources.length === MUSIC_SOURCES.length && MUSIC_SOURCES.every((s) => sources.includes(s))
}
