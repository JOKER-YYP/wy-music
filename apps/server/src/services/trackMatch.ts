import { parseArtists } from '../utils/mapper.js'
import type { ExternalSong } from './externalPlaylist.js'

export type LibraryTrackLite = {
  id: string
  name: string
  artists: string
}

export type MatchResult =
  | {
      status: 'matched'
      remote: ExternalSong
      trackId: string
      trackName: string
      trackArtists: string[]
    }
  | {
      status: 'missing'
      remote: ExternalSong
    }

function stripDecorations(s: string) {
  return s
    .replace(/（[^）]*）/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/【[^】]*】/g, ' ')
    .replace(/（feat\.?[^）]*）/gi, ' ')
    .replace(/\(feat\.?[^)]*\)/gi, ' ')
}

function normalizeText(s: string) {
  return stripDecorations(String(s || ''))
    .toLowerCase()
    .replace(/[·・•．.、，,/\-_/\\|~～'"`“”‘’]/g, '')
    .replace(/\s+/g, '')
    .trim()
}

function normalizeArtistList(artists: string[]) {
  return artists
    .flatMap((a) => String(a || '').split(/[/、,&]|和|feat\.?|ft\.?/i))
    .map((a) => normalizeText(a))
    .filter(Boolean)
}

function artistsOverlap(a: string[], b: string[]) {
  const aa = normalizeArtistList(a)
  const bb = normalizeArtistList(b)
  if (!aa.length || !bb.length) return false
  for (const x of aa) {
    for (const y of bb) {
      if (x === y || x.includes(y) || y.includes(x)) return true
    }
  }
  return false
}

type IndexedTrack = {
  id: string
  name: string
  artists: string[]
  normName: string
}

export function buildLibraryIndex(tracks: LibraryTrackLite[]): IndexedTrack[] {
  return tracks.map((t) => {
    const artists = parseArtists(t.artists)
    return {
      id: t.id,
      name: t.name,
      artists,
      normName: normalizeText(t.name),
    }
  })
}

export type MetaLookupHit = {
  trackId: string
  name: string
  artists: string[]
  hasLyric: boolean
}

/** 按歌名+歌手在曲库中查找（用于批量「缺文件/缺词」） */
export function lookupLibraryByMeta(
  query: { name: string; artists: string[] },
  library: Array<LibraryTrackLite & { lyricText?: string | null }>,
): MetaLookupHit | null {
  const norm = normalizeText(query.name)
  if (!norm) return null
  const index = buildLibraryIndex(library)
  const candidates = index.filter((t) => t.normName === norm)
  const queryHasArtist = normalizeArtistList(query.artists).length > 0

  let hit: IndexedTrack | undefined
  if (candidates.length) {
    if (queryHasArtist) {
      hit = candidates.find((t) => artistsOverlap(query.artists, t.artists))
    } else if (candidates.length === 1) {
      hit = candidates[0]
    }
  }
  if (!hit && queryHasArtist) {
    hit = index.find(
      (t) =>
        t.normName &&
        (t.normName.includes(norm) || norm.includes(t.normName)) &&
        artistsOverlap(query.artists, t.artists),
    )
  }
  if (!hit) return null
  const raw = library.find((t) => t.id === hit!.id)
  const lyric = String(raw?.lyricText || '').trim()
  const hasLyric = Boolean(lyric) && !(/暂无歌词|无效歌词/.test(lyric) && lyric.length < 40)
  return {
    trackId: hit.id,
    name: hit.name,
    artists: hit.artists,
    hasLyric,
  }
}

export function matchExternalSongs(
  remotes: ExternalSong[],
  library: LibraryTrackLite[],
): MatchResult[] {
  const index = buildLibraryIndex(library)
  const byName = new Map<string, IndexedTrack[]>()
  for (const t of index) {
    if (!t.normName) continue
    const list = byName.get(t.normName) || []
    list.push(t)
    byName.set(t.normName, list)
  }

  const used = new Set<string>()
  const results: MatchResult[] = []

  for (const remote of remotes) {
    const norm = normalizeText(remote.name)
    if (!norm) {
      results.push({ status: 'missing', remote })
      continue
    }

    const candidates = (byName.get(norm) || []).filter((t) => !used.has(t.id))
    let hit: IndexedTrack | undefined
    const remoteHasArtist = normalizeArtistList(remote.artists).length > 0

    // 有歌手信息时必须歌手有交集，避免同名乱匹配；无歌手时仅接受唯一歌名命中
    if (candidates.length) {
      if (remoteHasArtist) {
        hit = candidates.find((t) => artistsOverlap(remote.artists, t.artists))
      } else if (candidates.length === 1) {
        hit = candidates[0]
      }
    }

    if (!hit && remoteHasArtist) {
      // 兜底：歌名包含关系 + 歌手交集（仍要求歌手）
      hit = index.find(
        (t) =>
          !used.has(t.id) &&
          t.normName &&
          (t.normName.includes(norm) || norm.includes(t.normName)) &&
          artistsOverlap(remote.artists, t.artists),
      )
    }

    if (hit) {
      used.add(hit.id)
      results.push({
        status: 'matched',
        remote,
        trackId: hit.id,
        trackName: hit.name,
        trackArtists: hit.artists,
      })
    } else {
      results.push({ status: 'missing', remote })
    }
  }

  return results
}
