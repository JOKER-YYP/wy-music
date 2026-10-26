import * as XLSX from 'xlsx'
import type { TrackDto } from '@wy-music/shared'
import { MUSIC_SOURCE_LABEL } from '@wy-music/shared'
import { parallelExternalSearch } from './externalMusic'

export type BatchQueryRow = {
  index: number
  name: string
  artist: string
  keyword: string
}

export type BatchSearchHit = {
  /** 列表行唯一键（同曲不同查询可并存） */
  rowKey: string
  queryIndex: number
  queryKeyword: string
  queryName: string
  queryArtist: string
  track: TrackDto
  score: number
  /** 歌名与歌手均与清单一致（规范化后） */
  exactMatch: boolean
}

export type BatchQueryProgress = {
  total: number
  done: number
  current?: string
}

const HEADER_NAME = ['歌名', '歌曲名', '歌曲', 'title', 'name', 'song']
const HEADER_ARTIST = ['歌手', '艺人', '艺术家', 'artist', 'singer', 'authors']

function normHeader(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

function cellStr(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function findCol(headers: string[], aliases: string[]): number {
  const set = aliases.map((a) => a.toLowerCase().replace(/\s+/g, ''))
  for (let i = 0; i < headers.length; i++) {
    if (set.includes(headers[i])) return i
  }
  return -1
}

/** 生成并下载 Excel 导入模板 */
export function downloadBatchSearchTemplate() {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([
    ['歌名', '歌手'],
    ['海阔天空', 'Beyond'],
    ['晴天', '周杰伦'],
    ['不要说话', '陈奕迅'],
  ])
  ws['!cols'] = [{ wch: 24 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, ws, '搜歌清单')
  XLSX.writeFile(wb, '批量搜歌模板.xlsx')
}

/** 解析 Excel / CSV 为待搜索行 */
export async function parseBatchSearchFile(file: File): Promise<BatchQueryRow[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('Excel 中没有工作表')
  const sheet = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][]

  if (!rows.length) throw new Error('表格为空')

  const headerCells = (rows[0] || []).map(normHeader)
  let nameCol = findCol(headerCells, HEADER_NAME)
  let artistCol = findCol(headerCells, HEADER_ARTIST)
  let dataStart = 1

  // 无表头时：第 1 列歌名，第 2 列歌手
  if (nameCol < 0) {
    nameCol = 0
    artistCol = headerCells.length > 1 ? 1 : -1
    dataStart = 0
  }

  const out: BatchQueryRow[] = []
  const seen = new Set<string>()

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i] || []
    const name = cellStr(row[nameCol])
    if (!name) continue
    // 跳过误把表头当数据
    if (HEADER_NAME.includes(normHeader(name))) continue
    const artist = artistCol >= 0 ? cellStr(row[artistCol]) : ''
    const keyword = artist ? `${name} ${artist}` : name
    const dedupeKey = keyword.toLowerCase()
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    out.push({
      index: out.length,
      name,
      artist,
      keyword,
    })
  }

  if (!out.length) throw new Error('未解析到有效歌曲行（需要「歌名」列）')
  return out
}

/** 翻唱 / 非原版常见标记（命中则大幅降权） */
const COVER_NOISE_RE =
  /翻唱|cover|covers?|伴奏|消音|铃声|dj\b|remix|混音|抖音|快手|喊麦|改编版?|女声版|男声版|小孩|宝宝|钢琴版|古筝版|二胡版|小提琴版|吉他弹唱|弹唱|合奏版|卡点|增速|降调|夜芯|群星|未知歌手/i

function compactArtist(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[\/、,&＆|｜]/g, '/')
    .trim()
}

/**
 * 歌名规范化：忽略大小写与空白，统一全角括号；
 * 括号及括号内文字保留，必须一致才算完全匹配。
 */
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

/** 歌名完全一致（含括号及括号内文字） */
function isNameExact(queryName: string, trackName: string): boolean {
  const q = compactName(queryName)
  const t = compactName(trackName)
  if (!q || !t) return false
  return q === t
}

/**
 * 歌手完全一致：清单歌手与曲目歌手（或组合）规范化后相等。
 * 清单未填歌手时，不视为完全匹配。
 */
function isArtistExact(queryArtist: string, trackArtists: string[]): boolean {
  const q = compactArtist(queryArtist)
  if (!q) return false
  const arts = (trackArtists || []).map(compactArtist).filter(Boolean)
  if (!arts.length) return false
  const joined = arts.join('/')
  if (arts.some((a) => a === q) || joined === q) return true
  // 多歌手：拆分后集合一致（顺序无关）
  const qParts = [...new Set(q.split('/').filter(Boolean))].sort()
  const aParts = [...new Set(arts)].sort()
  if (qParts.length > 1 && qParts.length === aParts.length && qParts.every((p, i) => p === aParts[i])) {
    return true
  }
  return false
}

/** 歌名 + 歌手均为完全匹配 */
export function isExactMatch(track: TrackDto, name: string, artist: string): boolean {
  return isNameExact(name, track.name || '') && isArtistExact(artist, track.artists || [])
}

/** 搜索结果是否已带有效歌词（空 /「暂无歌词」不算） */
export function trackHasLyric(track: TrackDto): boolean {
  const t = String(track.lyricText || '').trim()
  if (!t) return false
  if (/暂无歌词|无效歌词/.test(t) && t.length < 40) return false
  return true
}

function artistMatchScore(queryArtist: string, trackArtists: string[]): number {
  const q = compactArtist(queryArtist)
  if (!q) return 0
  const arts = (trackArtists || []).map(compactArtist).filter(Boolean)
  const joined = arts.join('/')
  if (!joined) return -25

  if (arts.some((a) => a === q) || joined === q) return 140
  // 周杰伦 / Jay Chou 等包含关系
  if (arts.some((a) => a.includes(q) || q.includes(a)) || joined.includes(q)) return 95
  // 多歌手清单：拆开比
  const qParts = q.split('/').filter(Boolean)
  if (qParts.length > 1 && qParts.every((p) => arts.some((a) => a.includes(p) || p.includes(a)))) {
    return 110
  }
  // 填了原唱歌手但对不上 → 大概率翻唱，强降权
  return -55
}

/**
 * 匹配打分：优先歌名准确 + 原唱歌手一致，压制翻唱/伴奏/DJ 等
 */
function scoreTrack(track: TrackDto, name: string, artist: string): number {
  const rawTitle = (track.name || '').trim()
  const tn = rawTitle.toLowerCase()
  const n = name.trim().toLowerCase()
  const arts = track.artists || []
  const artsText = arts.join(' ')
  let s = 0
  if (!tn || !n) return 0

  // 歌名
  if (tn === n) s += 120
  else if (tn.startsWith(n) && /^[\s(\[（【-]/.test(tn.slice(n.length) || ' ')) s += 95
  else if (tn.includes(n) || n.includes(tn)) s += 55
  else {
    const shorter = tn.length <= n.length ? tn : n
    const longer = tn.length > n.length ? tn : n
    if (shorter.length >= 2 && longer.includes(shorter)) s += 28
    else return -10
  }

  // 原唱歌手（Excel 填了歌手时权重最高）
  if (artist.trim()) {
    s += artistMatchScore(artist, arts)
  }

  // 非原版噪音
  const blob = `${rawTitle} ${artsText}`
  if (COVER_NOISE_RE.test(blob)) s -= 90
  if (/翻唱/i.test(blob)) s -= 40
  // 歌名被加很长后缀，通常不是干净原版
  if (tn.length > n.length + 12 && tn.includes(n)) s -= 15

  return s
}

function sourceLabel(track: TrackDto): string {
  const src = track.source
  if (!src || src === 'local') return ''
  return MUSIC_SOURCE_LABEL[src] || String(src)
}

export { sourceLabel }

/** 每个源保留的匹配条数（保证全源都出现在结果里） */
const DEFAULT_PER_SOURCE = 3
const SEARCH_CONCURRENCY = 2

/**
 * 按清单逐条多源搜索，合并为结果列表。
 * 每个有结果的源各保留匹配度最高的若干首，避免只留下总分最高的几个源。
 */
export async function runBatchExternalSearch(
  queries: BatchQueryRow[],
  opts?: {
    /** @deprecated 请用 perSource；若传入则作为每个源条数 */
    perQuery?: number
    /** 每个源保留条数，默认 2 */
    perSource?: number
    pageSize?: number
    onProgress?: (p: BatchQueryProgress) => void
    /** 每完成一条清单查询回调一批结果（便于渐进渲染，避免最后一次性塞上万行） */
    onHits?: (chunk: BatchSearchHit[]) => void
    signal?: { cancelled: boolean }
  },
): Promise<BatchSearchHit[]> {
  const perSource = Math.max(
    1,
    Math.min(10, opts?.perSource ?? opts?.perQuery ?? DEFAULT_PER_SOURCE),
  )
  const pageSize = Math.max(perSource, Math.min(30, opts?.pageSize ?? 20))
  const hits: BatchSearchHit[] = []
  let done = 0

  const queue = [...queries]

  async function worker() {
    while (queue.length) {
      if (opts?.signal?.cancelled) return
      const q = queue.shift()
      if (!q) return
      opts?.onProgress?.({
        total: queries.length,
        done,
        current: q.keyword,
      })
      try {
        const res = await parallelExternalSearch({
          keyword: q.keyword,
          page: 1,
          pageSize,
          cumulativeLimit: pageSize,
          timeoutMs: 15_000,
        })

        // 按源分组，各源取匹配度最高的 perSource 首
        const bySource = new Map<string, { track: TrackDto; score: number }[]>()
        for (const track of res.list) {
          const src = String(track.source || 'unknown')
          const score = scoreTrack(track, q.name, q.artist)
          const arr = bySource.get(src) || []
          arr.push({ track, score })
          bySource.set(src, arr)
        }

        const picked: { track: TrackDto; score: number }[] = []
        for (const arr of bySource.values()) {
          arr.sort((a, b) => b.score - a.score)
          picked.push(...arr.slice(0, perSource))
        }
        // 展示时：匹配分高的在前，同分按源稳定排序
        picked.sort((a, b) => b.score - a.score)

        const chunk: BatchSearchHit[] = picked.map((item) => ({
          rowKey: `${q.index}:${item.track.id}`,
          queryIndex: q.index,
          queryKeyword: q.keyword,
          queryName: q.name,
          queryArtist: q.artist,
          track: item.track,
          score: item.score,
          exactMatch: isExactMatch(item.track, q.name, q.artist),
        }))
        hits.push(...chunk)
        if (chunk.length) opts?.onHits?.(chunk)
      } catch {
        // 单条失败不中断整批
      } finally {
        done += 1
        opts?.onProgress?.({
          total: queries.length,
          done,
          current: q.keyword,
        })
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(SEARCH_CONCURRENCY, Math.max(1, queries.length)) },
    () => worker(),
  )
  await Promise.all(workers)
  return hits
}
