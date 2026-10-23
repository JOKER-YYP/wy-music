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

function scoreTrack(track: TrackDto, name: string, artist: string): number {
  const tn = (track.name || '').trim().toLowerCase()
  const n = name.trim().toLowerCase()
  let s = 0
  if (!tn || !n) return 0
  if (tn === n) s += 100
  else if (tn.includes(n) || n.includes(tn)) s += 55
  else {
    // 简单字符重叠
    const shorter = tn.length <= n.length ? tn : n
    const longer = tn.length > n.length ? tn : n
    if (shorter.length >= 2 && longer.includes(shorter)) s += 30
  }
  if (artist) {
    const a = artist.toLowerCase()
    const arts = (track.artists || []).join(' ').toLowerCase()
    if (arts === a) s += 50
    else if (arts.includes(a) || a.includes(arts)) s += 35
  }
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

        for (const item of picked) {
          hits.push({
            rowKey: `${q.index}:${item.track.id}`,
            queryIndex: q.index,
            queryKeyword: q.keyword,
            queryName: q.name,
            queryArtist: q.artist,
            track: item.track,
            score: item.score,
          })
        }
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
