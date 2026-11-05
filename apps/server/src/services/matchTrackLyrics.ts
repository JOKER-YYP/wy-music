import type { MusicSource, TrackDto } from '@wy-music/shared'
import {
  MUSIC_SOURCE_LABEL,
  isLiumingyeSource,
  parseExternalTrackId,
} from '@wy-music/shared'
import { prisma } from '../db.js'
import { parseArtists } from '../utils/mapper.js'
import {
  parallelMusicSearch,
  resolveMusicDetail,
  type MusicDetail,
} from './musicSources/index.js'

export type LyricMatchOk = {
  trackId: string
  name: string
  artists: string[]
  source: MusicSource
  sourceLabel: string
  lyricChars: number
}

export type LyricMatchFail = {
  trackId: string
  name: string
  artists: string[]
  /** search_empty | no_candidate | detail_empty | detail_error | write_error */
  stage: 'search' | 'match' | 'download' | 'write'
  reason: string
}

export type LyricMatchReport = {
  scanned: number
  matched: LyricMatchOk[]
  failed: LyricMatchFail[]
  remaining: number
}

const COVER_NOISE_RE =
  /翻唱|cover|covers?|伴奏|消音|铃声|dj\b|remix|混音|抖音|快手|喊麦|改编版?|女声版|男声版|小孩|宝宝|钢琴版|古筝版|二胡版|小提琴版|吉他弹唱|弹唱|合奏版|卡点|增速|降调|夜芯|群星|未知歌手/i

/** 详情可取词的源优先；liumingye 无服务端详情，跳过 */
const SOURCE_PRIORITY: Partial<Record<MusicSource, number>> = {
  vkeys: 40,
  migu: 38,
  tang: 36,
  kw: 34,
  netease: 32,
  qq: 30,
  kugou: 28,
  kuwo: 28,
  xm_migu: 26,
}

function compactArtist(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[\/、,&＆|｜]/g, '/')
    .trim()
}

function compactName(s: string): string {
  return s
    .toLowerCase()
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/【/g, '[')
    .replace(/】/g, ']')
    .replace(/\s+/g, '')
    .trim()
}

function artistMatchScore(queryArtist: string, trackArtists: string[]): number {
  const q = compactArtist(queryArtist)
  if (!q) return 0
  const arts = (trackArtists || []).map(compactArtist).filter(Boolean)
  const joined = arts.join('/')
  if (!joined) return -25
  if (arts.some((a) => a === q) || joined === q) return 140
  if (arts.some((a) => a.includes(q) || q.includes(a)) || joined.includes(q)) return 95
  const qParts = q.split('/').filter(Boolean)
  if (qParts.length > 1 && qParts.every((p) => arts.some((a) => a.includes(p) || p.includes(a)))) {
    return 110
  }
  return -55
}

function scoreCandidate(hit: TrackDto, name: string, artists: string[]): number {
  const rawTitle = (hit.name || '').trim()
  const tn = rawTitle.toLowerCase()
  const n = name.trim().toLowerCase()
  const arts = hit.artists || []
  const artsText = arts.join(' ')
  let s = 0
  if (!tn || !n) return -999

  if (tn === n) s += 120
  else if (tn.startsWith(n) && /^[\s(\[（【-]/.test(tn.slice(n.length) || ' ')) s += 95
  else if (tn.includes(n) || n.includes(tn)) s += 55
  else {
    const shorter = tn.length <= n.length ? tn : n
    const longer = tn.length > n.length ? tn : n
    if (shorter.length >= 2 && longer.includes(shorter)) s += 28
    else return -10
  }

  const queryArtist = artists.join('/')
  if (queryArtist.trim()) s += artistMatchScore(queryArtist, arts)

  const blob = `${rawTitle} ${artsText}`
  if (COVER_NOISE_RE.test(blob)) s -= 90
  if (/翻唱/i.test(blob)) s -= 40
  if (tn.length > n.length + 12 && tn.includes(n)) s -= 15

  const src = hit.source
  if (src && src !== 'local') s += SOURCE_PRIORITY[src as MusicSource] || 0

  return s
}

export function isUsableLyric(text: unknown): boolean {
  const t = String(text || '').trim()
  if (!t) return false
  if (t.length < 8) return false
  if (/暂无歌词|无效歌词|无歌词|lyric\s*not\s*found/i.test(t) && t.length < 48) return false
  return true
}

function canFetchLyric(source: unknown): source is MusicSource {
  if (!source || source === 'local') return false
  if (isLiumingyeSource(String(source))) return false
  return true
}

function resolveExternalId(hit: TrackDto): string {
  if (hit.externalId && String(hit.externalId).trim()) return String(hit.externalId).trim()
  const parsed = parseExternalTrackId(hit.id)
  if (parsed?.externalId) return parsed.externalId
  return ''
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await worker(items[i], i)
    }
  })
  await Promise.all(runners)
  return results
}

type TrackRow = {
  id: string
  name: string
  artists: string
  lyricText: string | null
}

async function matchOneTrack(track: TrackRow): Promise<
  | { ok: true; result: LyricMatchOk }
  | { ok: false; result: LyricMatchFail }
> {
  const artists = parseArtists(track.artists)
  const name = track.name || ''
  const keyword = [name, ...artists].filter(Boolean).join(' ').trim() || name

  let hits: TrackDto[] = []
  try {
    const searched = await parallelMusicSearch(keyword, 18)
    hits = searched.list || []
  } catch (e) {
    return {
      ok: false,
      result: {
        trackId: track.id,
        name,
        artists,
        stage: 'search',
        reason: e instanceof Error ? e.message : '外部搜索失败',
      },
    }
  }

  if (!hits.length) {
    return {
      ok: false,
      result: {
        trackId: track.id,
        name,
        artists,
        stage: 'search',
        reason: '外部搜索无结果',
      },
    }
  }

  const ranked = hits
    .map((h) => ({ hit: h, score: scoreCandidate(h, name, artists) }))
    .filter((x) => x.score >= 40 && canFetchLyric(x.hit.source))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  if (!ranked.length) {
    return {
      ok: false,
      result: {
        trackId: track.id,
        name,
        artists,
        stage: 'match',
        reason: '无足够相似的候选（或候选源不支持取词）',
      },
    }
  }

  let lastDetailError = ''
  for (const { hit } of ranked) {
    const source = hit.source as MusicSource
    const externalId = resolveExternalId(hit)
    if (!externalId) {
      lastDetailError = '候选缺少外部 id'
      continue
    }
    let detail: MusicDetail
    try {
      detail = await resolveMusicDetail(source, externalId)
    } catch (e) {
      lastDetailError = e instanceof Error ? e.message : '详情请求失败'
      continue
    }
    if (!isUsableLyric(detail.lyricText)) {
      lastDetailError = '详情无有效歌词'
      continue
    }
    const lyricText = String(detail.lyricText).trim()
    try {
      // 仅当仍无词时写入，避免并发覆盖
      const updated = await prisma.track.updateMany({
        where: {
          id: track.id,
          OR: [{ lyricText: null }, { lyricText: '' }],
        },
        data: { lyricText },
      })
      if (!updated.count) {
        // 已有词（可能其它任务刚写入）视为成功跳过
        return {
          ok: true,
          result: {
            trackId: track.id,
            name,
            artists,
            source,
            sourceLabel: MUSIC_SOURCE_LABEL[source] || source,
            lyricChars: lyricText.length,
          },
        }
      }
      return {
        ok: true,
        result: {
          trackId: track.id,
          name,
          artists,
          source,
          sourceLabel: MUSIC_SOURCE_LABEL[source] || source,
          lyricChars: lyricText.length,
        },
      }
    } catch (e) {
      return {
        ok: false,
        result: {
          trackId: track.id,
          name,
          artists,
          stage: 'write',
          reason: e instanceof Error ? e.message : '写入歌词失败',
        },
      }
    }
  }

  return {
    ok: false,
    result: {
      trackId: track.id,
      name,
      artists,
      stage: 'download',
      reason: lastDetailError || '候选均无可用歌词',
    },
  }
}

export async function countTracksMissingLyrics(ids?: string[]): Promise<number> {
  const where = missingLyricWhere(ids)
  const rows = await prisma.track.findMany({
    where,
    select: { id: true, lyricText: true },
  })
  return rows.filter((r) => !isUsableLyric(r.lyricText)).length
}

function missingLyricWhere(ids?: string[]) {
  const idFilter =
    ids && ids.length
      ? { id: { in: [...new Set(ids.map(String).filter(Boolean))].slice(0, 500) } }
      : {}
  return {
    ...idFilter,
    OR: [{ lyricText: null }, { lyricText: '' }],
  }
}

/**
 * 批量为缺词曲目匹配外部歌词。
 * @param ids 指定曲目；为空则扫全库缺词
 * @param limit 本批最多处理条数
 */
export async function matchMissingTrackLyrics(opts?: {
  ids?: string[]
  limit?: number
  concurrency?: number
}): Promise<LyricMatchReport> {
  const limit = Math.min(80, Math.max(1, opts?.limit ?? 20))
  const concurrency = Math.min(4, Math.max(1, opts?.concurrency ?? 2))

  const candidates = await prisma.track.findMany({
    where: missingLyricWhere(opts?.ids),
    select: { id: true, name: true, artists: true, lyricText: true },
    orderBy: { createdAt: 'desc' },
    take: Math.min(500, limit * 3),
  })

  const missing = candidates.filter((t) => !isUsableLyric(t.lyricText)).slice(0, limit)

  const matched: LyricMatchOk[] = []
  const failed: LyricMatchFail[] = []

  const outcomes = await mapPool(missing, concurrency, (track) => matchOneTrack(track))
  for (const out of outcomes) {
    if (out.ok) matched.push(out.result)
    else failed.push(out.result)
  }

  const remaining = await countTracksMissingLyrics(opts?.ids)

  return {
    scanned: missing.length,
    matched,
    failed,
    remaining,
  }
}
