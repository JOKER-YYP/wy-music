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

    if (candidates.length === 1) {
      hit = candidates[0]
    } else if (candidates.length > 1) {
      hit =
        candidates.find((t) => artistsOverlap(remote.artists, t.artists)) ||
        candidates[0]
    } else {
      // 兜底：歌名包含关系 + 歌手交集
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
