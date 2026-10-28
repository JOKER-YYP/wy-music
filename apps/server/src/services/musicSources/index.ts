import type { MusicSource, TrackDto, XmMusicSource } from '@wy-music/shared'
import { MUSIC_SOURCES, XM_MUSIC_SOURCES, isLiumingyeSource, isXmMusicSource } from '@wy-music/shared'
import { detailMigu, searchMigu } from './migu.js'
import { detailVkeys, searchVkeys } from './vkeys.js'
import { detailTang, searchTang } from './tang.js'
import { detailKw, searchKw } from './kw.js'
import { detailXm, searchXm } from './xm.js'
import { detailLiumingye, searchLiumingye } from './liumingye.js'
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

const searchFns: Partial<
  Record<MusicSource, (keyword: string, num: number) => Promise<MusicSearchHit[]>>
> = {
  migu: searchMigu,
  vkeys: (kw, num) => searchVkeys(kw, num, 1),
  tang: searchTang,
  kw: searchKw,
  liumingye: (kw, num) => searchLiumingye(kw, num, 'liumingye'),
  liumingye_quark: (kw, num) => searchLiumingye(kw, num, 'liumingye_quark'),
  liumingye_baidu: (kw, num) => searchLiumingye(kw, num, 'liumingye_baidu'),
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

const detailFns: Partial<Record<MusicSource, (id: string) => Promise<MusicDetail>>> = {
  migu: detailMigu,
  vkeys: detailVkeys,
  tang: detailTang,
  kw: detailKw,
  liumingye: detailLiumingye,
  liumingye_quark: detailLiumingye,
  liumingye_baidu: detailLiumingye,
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

type LiumingyePanSource = 'liumingye_quark' | 'liumingye_baidu'

function isLiumingyePanSource(source: MusicSource): source is LiumingyePanSource {
  return source === 'liumingye_quark' || source === 'liumingye_baidu'
}

/** 多源并行搜索；单源失败不影响其它源。下歌吧夸克/百度只搜一次再分别打标。 */
export async function parallelMusicSearch(
  keyword: string,
  num = 20,
): Promise<ParallelSearchResult> {
  const q = keyword.trim()
  if (!q) return { list: [], sources: [] }

  const panSources = MUSIC_SOURCES.filter(isLiumingyePanSource)
  const otherSources = MUSIC_SOURCES.filter((s) => !isLiumingyePanSource(s))

  const sources: SourceSearchStat[] = []
  const list: TrackDto[] = []

  const runOther = Promise.allSettled(
    otherSources.map(async (source) => {
      const fn = searchFns[source]
      if (!fn) throw new Error(`未知音乐源: ${source}`)
      const hits = await fn(q, num)
      return { source, hits }
    }),
  )

  const runPan = (async () => {
    const firstPan = panSources[0]
    if (!firstPan) return null
    try {
      const hits = await searchLiumingye(q, num, firstPan)
      return { ok: true as const, hits }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e || 'unknown')
      return { ok: false as const, error: msg }
    }
  })()

  const [otherSettled, panResult] = await Promise.all([runOther, runPan])

  otherSettled.forEach((r, i) => {
    const source = otherSources[i]
    if (r.status === 'fulfilled') {
      sources.push({ source, ok: true, count: r.value.hits.length })
      for (const hit of r.value.hits) list.push(toSearchTrackDto(hit))
    } else {
      const msg =
        r.reason instanceof Error ? r.reason.message : String(r.reason || 'unknown')
      sources.push({ source, ok: false, count: 0, error: msg })
    }
  })

  if (panResult) {
    if (panResult.ok) {
      for (const pan of panSources) {
        const tagged = panResult.hits.map((h) => ({ ...h, source: pan }))
        sources.push({ source: pan, ok: true, count: tagged.length })
        for (const hit of tagged) list.push(toSearchTrackDto(hit))
      }
    } else {
      for (const pan of panSources) {
        sources.push({ source: pan, ok: false, count: 0, error: panResult.error })
      }
    }
  }

  // 按 MUSIC_SOURCES 顺序输出统计
  const ordered = MUSIC_SOURCES.map(
    (s) =>
      sources.find((x) => x.source === s) || {
        source: s,
        ok: false,
        count: 0,
        error: '未知错误',
      },
  )

  return { list, sources: ordered }
}

export async function resolveMusicDetail(
  source: MusicSource,
  externalId: string,
): Promise<MusicDetail> {
  const id = String(externalId || '').trim()
  if (!id) throw new Error('缺少外部曲目 id')
  if (isXmMusicSource(source)) return detailXm(source, id)
  if (isLiumingyeSource(source)) return detailLiumingye(id)
  const fn = detailFns[source]
  if (!fn) throw new Error(`未知音乐源: ${source}`)
  return fn(id)
}

export { toSearchTrackDto, searchXm, detailXm, XM_MUSIC_SOURCES }
export type { MusicDetail, MusicSearchHit }
