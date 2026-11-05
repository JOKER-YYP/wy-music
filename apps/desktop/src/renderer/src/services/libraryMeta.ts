import type { TrackDto } from '@wy-music/shared'
import { parseExternalTrackId } from '@wy-music/shared'
import { resolveExternalDetail } from './externalMusic'
import { http } from './http'
import { trackHasLyric, type BatchSearchHit } from './batchSearchImport'

export type LibraryMetaLookup = {
  name: string
  artists: string[]
  trackId: string | null
  hasLyric: boolean
  inLibrary: boolean
}

export async function lookupLibraryMeta(
  items: Array<{ name: string; artists: string[] }>,
): Promise<LibraryMetaLookup[]> {
  if (!items.length) return []
  const { data } = await http.post<{
    code: number
    data?: { results?: LibraryMetaLookup[] }
  }>('/api/tracks/lookup-meta', { items })
  return data?.data?.results || []
}

export function hitLookupKey(hit: BatchSearchHit): { name: string; artists: string[] } {
  const name = (hit.queryName || hit.track.name || '').trim()
  const fromQuery = String(hit.queryArtist || '')
    .split(/[,，/、]/)
    .map((s) => s.trim())
    .filter(Boolean)
  const artists = fromQuery.length ? fromQuery : (hit.track.artists || []).filter(Boolean)
  return { name, artists }
}

/** 批量查询选中结果在曲库中的状态（按清单歌名+歌手） */
export async function lookupHitsInLibrary(
  hits: BatchSearchHit[],
): Promise<Map<string, LibraryMetaLookup>> {
  const items = hits.map(hitLookupKey).filter((it) => it.name)
  const results = await lookupLibraryMeta(items)
  const map = new Map<string, LibraryMetaLookup>()
  for (let i = 0; i < hits.length; i++) {
    const r = results[i]
    if (r) map.set(hits[i].rowKey, r)
  }
  return map
}

async function resolveHitLyricText(hit: BatchSearchHit): Promise<string> {
  if (trackHasLyric(hit.track)) return String(hit.track.lyricText || '').trim()
  const track = hit.track
  const parsed =
    parseExternalTrackId(track.id) ||
    (track.source && track.source !== 'local' && track.externalId
      ? { source: track.source, externalId: track.externalId }
      : null)
  if (!parsed) return ''
  try {
    const detail = await resolveExternalDetail(parsed.source as any, parsed.externalId)
    const lyric = String(detail.lyricText || '').trim()
    if (lyric && !(/暂无歌词|无效歌词/.test(lyric) && lyric.length < 40)) return lyric
  } catch {
    /* ignore */
  }
  return ''
}

export async function patchLibraryLyric(trackId: string, lyricText: string): Promise<TrackDto> {
  const { data } = await http.post<{ code: number; message?: string; data?: TrackDto }>(
    `/api/tracks/${trackId}/fill-lyric`,
    { lyricText },
  )
  if (!data?.data) throw new Error(data?.message || '写入歌词失败')
  return data.data
}

export type FillMissingLyricResult = {
  ok: number
  fail: number
  skip: number
  failures: Array<{ trackId: string; name: string; artists: string; error: string }>
}

/** 对已入库但缺词的选中结果，用搜索命中补写歌词 */
export async function fillMissingLyricsForHits(
  hits: BatchSearchHit[],
  onProgress?: (done: number, total: number, name: string) => void,
  signal?: { cancelled: boolean },
): Promise<FillMissingLyricResult> {
  const lookup = await lookupHitsInLibrary(hits)
  const targets: Array<{ hit: BatchSearchHit; libraryTrackId: string }> = []
  const seenLib = new Set<string>()
  let skip = 0

  for (const hit of hits) {
    const meta = lookup.get(hit.rowKey)
    if (!meta?.inLibrary || !meta.trackId) {
      skip += 1
      continue
    }
    if (meta.hasLyric) {
      skip += 1
      continue
    }
    if (seenLib.has(meta.trackId)) {
      skip += 1
      continue
    }
    seenLib.add(meta.trackId)
    targets.push({ hit, libraryTrackId: meta.trackId })
  }

  let ok = 0
  const failures: FillMissingLyricResult['failures'] = []
  const total = targets.length

  for (let i = 0; i < targets.length; i++) {
    if (signal?.cancelled) break
    const { hit, libraryTrackId } = targets[i]
    onProgress?.(i, total, hit.track.name)
    try {
      const lyric = await resolveHitLyricText(hit)
      if (!lyric) throw new Error('候选无可用歌词')
      await patchLibraryLyric(libraryTrackId, lyric)
      ok += 1
    } catch (e: any) {
      failures.push({
        trackId: hit.track.id,
        name: hit.track.name || hit.queryName,
        artists: (hit.track.artists || []).join(' / ') || hit.queryArtist || '—',
        error: String(e?.message || e || '补词失败').slice(0, 200),
      })
    }
  }
  onProgress?.(total, total, '')
  return { ok, fail: failures.length, skip, failures }
}

/** 只保留曲库中尚不存在的命中（只补缺文件） */
export async function filterHitsMissingFile(
  hits: BatchSearchHit[],
): Promise<{ keep: BatchSearchHit[]; skipped: number }> {
  const lookup = await lookupHitsInLibrary(hits)
  const keep: BatchSearchHit[] = []
  let skipped = 0
  for (const hit of hits) {
    const meta = lookup.get(hit.rowKey)
    if (meta?.inLibrary) {
      skipped += 1
      continue
    }
    keep.push(hit)
  }
  return { keep, skipped }
}
