import type { MusicSource, TrackDto } from '@wy-music/shared'
import { MUSIC_SOURCES, isXmMusicSource } from '@wy-music/shared'
import { detailMigu, searchMigu } from './migu.js'
import { detailVkeys, searchVkeys } from './vkeys.js'
import { detailTang, searchTang } from './tang.js'
import { detailKw, searchKw } from './kw.js'
import { detailXm, searchXm } from './xm.js'
import { toSearchTrackDto, type MusicDetail, type MusicSearchHit } from './types.js'

export type SourceSearchStat = {
  source: MusicSource
  ok: boolean
  count: number
  error?: string
}

export type ParallelSearchResult = {
  list: TrackDto[]
  sources: SourceSearchStat[]
}

const searchFns: Record<
  MusicSource,
  (keyword: string, num: number) => Promise<MusicSearchHit[]>
> = {
  migu: searchMigu,
  vkeys: (kw, num) => searchVkeys(kw, num, 1),
  tang: searchTang,
  kw: searchKw,
  netease: (kw, num) => searchXm('netease', kw, 1, num),
  qq: (kw, num) => searchXm('qq', kw, 1, num),
  kugou: (kw, num) => searchXm('kugou', kw, 1, num),
  kuwo: (kw, num) => searchXm('kuwo', kw, 1, num),
}

const detailFns: Record<MusicSource, (id: string) => Promise<MusicDetail>> = {
  migu: detailMigu,
  vkeys: detailVkeys,
  tang: detailTang,
  kw: detailKw,
  netease: (id) => detailXm('netease', id),
  qq: (id) => detailXm('qq', id),
  kugou: (id) => detailXm('kugou', id),
  kuwo: (id) => detailXm('kuwo', id),
}

/** 多源并行搜索；单源失败不影响其它源 */
export async function parallelMusicSearch(
  keyword: string,
  num = 20,
): Promise<ParallelSearchResult> {
  const q = keyword.trim()
  if (!q) return { list: [], sources: [] }

  const settled = await Promise.allSettled(
    MUSIC_SOURCES.map(async (source) => {
      const hits = await searchFns[source](q, num)
      return { source, hits }
    }),
  )

  const sources: SourceSearchStat[] = []
  const list: TrackDto[] = []

  settled.forEach((r, i) => {
    const source = MUSIC_SOURCES[i]
    if (r.status === 'fulfilled') {
      sources.push({ source, ok: true, count: r.value.hits.length })
      for (const hit of r.value.hits) {
        list.push(toSearchTrackDto(hit))
      }
    } else {
      const msg =
        r.reason instanceof Error ? r.reason.message : String(r.reason || 'unknown')
      sources.push({ source, ok: false, count: 0, error: msg })
    }
  })

  return { list, sources }
}

export async function resolveMusicDetail(
  source: MusicSource,
  externalId: string,
): Promise<MusicDetail> {
  const id = String(externalId || '').trim()
  if (!id) throw new Error('缺少外部曲目 id')
  if (isXmMusicSource(source)) return detailXm(source, id)
  const fn = detailFns[source]
  if (!fn) throw new Error(`未知音乐源: ${source}`)
  return fn(id)
}

export { toSearchTrackDto, searchXm, detailXm }
export type { MusicDetail, MusicSearchHit }
