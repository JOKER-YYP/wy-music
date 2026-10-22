import type { MusicSource, TrackDto, XmMusicSource } from '@wy-music/shared'
import { MUSIC_SOURCES, XM_MUSIC_SOURCES, isXmMusicSource } from '@wy-music/shared'
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

function xmSearch(source: XmMusicSource) {
  return (kw: string, num: number) => searchXm(source, kw, 1, num)
}

function xmDetail(source: XmMusicSource) {
  return (id: string) => detailXm(source, id)
}

const searchFns: Record<
  MusicSource,
  (keyword: string, num: number) => Promise<MusicSearchHit[]>
> = {
  migu: searchMigu,
  vkeys: (kw, num) => searchVkeys(kw, num, 1),
  tang: searchTang,
  kw: searchKw,
  netease: xmSearch('netease'),
  qq: xmSearch('qq'),
  kugou: xmSearch('kugou'),
  kuwo: xmSearch('kuwo'),
  baidu: xmSearch('baidu'),
  '1ting': xmSearch('1ting'),
  xm_migu: xmSearch('xm_migu'),
  lizhi: xmSearch('lizhi'),
  qingting: xmSearch('qingting'),
  ximalaya: xmSearch('ximalaya'),
  '5singyc': xmSearch('5singyc'),
  '5singfc': xmSearch('5singfc'),
  kg: xmSearch('kg'),
}

const detailFns: Record<MusicSource, (id: string) => Promise<MusicDetail>> = {
  migu: detailMigu,
  vkeys: detailVkeys,
  tang: detailTang,
  kw: detailKw,
  netease: xmDetail('netease'),
  qq: xmDetail('qq'),
  kugou: xmDetail('kugou'),
  kuwo: xmDetail('kuwo'),
  baidu: xmDetail('baidu'),
  '1ting': xmDetail('1ting'),
  xm_migu: xmDetail('xm_migu'),
  lizhi: xmDetail('lizhi'),
  qingting: xmDetail('qingting'),
  ximalaya: xmDetail('ximalaya'),
  '5singyc': xmDetail('5singyc'),
  '5singfc': xmDetail('5singfc'),
  kg: xmDetail('kg'),
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

export { toSearchTrackDto, searchXm, detailXm, XM_MUSIC_SOURCES }
export type { MusicDetail, MusicSearchHit }
