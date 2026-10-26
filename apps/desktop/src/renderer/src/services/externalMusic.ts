/**
 * 外部多源搜索 / 详情
 * - 皮卡丘站：http://qjjlb.quanjian.com.cn/musicdl/
 * - xm95522 / maicong：http://www.xm95522.com/mp3/
 */
import type { MusicSource, TrackDto, XmMusicSource } from '@wy-music/shared'
import {
  isExternalTrackId,
  isXmMusicSource,
  makeExternalTrackId,
  MUSIC_SOURCES,
  parseExternalTrackId,
  XM_API_TYPE,
} from '@wy-music/shared'
import { http } from './http'

const XM_API = 'http://www.xm95522.com/mp3/'
const XM_NATIVE_PAGE_SIZE = 10

export type SourceSearchStat = {
  source: MusicSource
  ok: boolean
  count: number
  hasMore: boolean
  error?: string
  /** 该源仍在请求中 */
  pending?: boolean
}

export type SourceSearchChunk = {
  source: MusicSource
  ok: boolean
  list: TrackDto[]
  hasMore: boolean
  error?: string
}

type ExtHit = {
  source: MusicSource
  externalId: string
  name: string
  artists: string[]
  album?: string | null
  coverUrl?: string | null
  payTag?: string | null
  /** 搜索接口若直接带回歌词则写入（如 xm 的 lrc） */
  lyricText?: string | null
  /** migu 详情需要带回搜索时的 num */
  requestNum?: number
  keyword?: string
}

export type MusicDetailResult = {
  musicUrl: string
  coverUrl?: string | null
  lyricText?: string | null
  name?: string
  artists?: string[]
  album?: string | null
  link?: string | null
}

function toTrack(hit: ExtHit): TrackDto {
  const now = new Date().toISOString()
  return {
    id: makeExternalTrackId(hit.source, hit.externalId),
    name: hit.name,
    artists: hit.artists.length ? hit.artists : ['未知歌手'],
    album: hit.album ?? null,
    durationMs: 0,
    coverUrl: hit.coverUrl || null,
    lyricText: hit.lyricText || null,
    status: 'published',
    uploaderId: '',
    playCount: 0,
    liked: false,
    fileSize: 0,
    mimeType: 'audio/mpeg',
    createdAt: now,
    updatedAt: now,
    source: hit.source,
    externalId: hit.externalId,
    payTag: hit.payTag || null,
  }
}

function errMsg(e: unknown): string {
  if (e instanceof Error) {
    const m = e.message || ''
    if (/fetch failed|Failed to fetch|ECONNRESET|ERR_CONNECTION/i.test(m)) {
      return '网络连接失败（握手被重置或无法访问）'
    }
    if (/certificate|CERT_|SSL/i.test(m)) return '证书错误'
    if (/超时|timeout|aborted/i.test(m)) return '请求超时'
    return m
  }
  return String(e)
}

/** 优先走 Electron 主进程（可忽略过期证书），否则用页面 fetch */
async function fetchJson<T = unknown>(url: string): Promise<T> {
  if (typeof window !== 'undefined' && window.wyAPI?.fetchJson) {
    try {
      return (await window.wyAPI.fetchJson(url)) as T
    } catch (e) {
      // 主进程失败再试页面直连（部分源在 Chromium 下反而可用）
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const text = await res.text()
        if (!text.trim()) throw new Error('外部接口返回为空')
        return JSON.parse(text) as T
      } catch {
        throw new Error(errMsg(e))
      }
    }
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  if (!text.trim()) throw new Error('外部接口返回为空')
  return JSON.parse(text) as T
}

type XmSong = {
  type?: string
  link?: string
  songid?: string | number
  title?: string
  author?: string
  lrc?: string
  url?: string
  pic?: string
}

type XmResponse = {
  code?: number
  data?: XmSong[] | XmSong
  error?: string
}

function normalizeXmLyric(lrc?: string | null): string | null {
  const t = String(lrc || '').trim()
  if (!t) return null
  if (/暂无歌词|无效歌词/.test(t) && t.length < 40) return null
  return t
}

async function fetchFormJson<T = unknown>(
  url: string,
  form: Record<string, string | number>,
): Promise<T> {
  if (typeof window !== 'undefined' && window.wyAPI?.fetchFormJson) {
    try {
      return (await window.wyAPI.fetchFormJson(url, form)) as T
    } catch (e) {
      // 主进程失败再试页面
      try {
        return await fetchFormJsonBrowser<T>(url, form)
      } catch {
        throw new Error(errMsg(e))
      }
    }
  }
  return fetchFormJsonBrowser<T>(url, form)
}

async function fetchFormJsonBrowser<T>(
  url: string,
  form: Record<string, string | number>,
): Promise<T> {
  const body = new URLSearchParams(
    Object.fromEntries(Object.entries(form).map(([k, v]) => [k, String(v)])),
  )
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json,text/plain,*/*',
    },
    body,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  if (!text.trim()) throw new Error('外部接口返回为空')
  const trimmed = text.trim()
  if (trimmed.startsWith('<')) {
    throw new Error('外部接口返回异常（非 JSON，上游可能故障）')
  }
  return JSON.parse(trimmed) as T
}

async function xmPost(form: {
  input: string
  filter: 'name' | 'id' | 'url'
  type: string
  page?: number
}): Promise<XmSong[]> {
  const json = await fetchFormJson<XmResponse>(XM_API, {
    input: form.input,
    filter: form.filter,
    type: form.type,
    page: form.page ?? 1,
  })
  const code = json.code == null ? 200 : Number(json.code)
  if (code === 404 || (!json.data && code !== 200)) return []
  if (code !== 200) {
    throw new Error(String(json.error || `xm 搜索失败 code=${code}`))
  }
  if (!json.data) return []
  return Array.isArray(json.data) ? json.data : [json.data]
}

async function searchXm(
  source: XmMusicSource,
  keyword: string,
  page: number,
  pageSize: number,
): Promise<ExtHit[]> {
  // 全民K歌不支持按名称搜索
  if (source === 'kg') return []

  const apiType = XM_API_TYPE[source] || source
  const pagesNeeded = Math.max(1, Math.ceil(pageSize / XM_NATIVE_PAGE_SIZE))
  const start = (Math.max(1, page) - 1) * pagesNeeded + 1
  const pageNos = Array.from({ length: pagesNeeded }, (_, i) => start + i)
  const batches = await Promise.all(
    pageNos.map((p) =>
      xmPost({ input: keyword, filter: 'name', type: apiType, page: p }).catch((e) => {
        if (pageNos.length === 1) throw e
        return [] as XmSong[]
      }),
    ),
  )
  const hits: ExtHit[] = []
  for (const row of batches.flat()) {
    if (row.songid == null || row.songid === '') continue
    const name = String(row.title || '').trim()
    if (!name || name === '暂无') continue
    hits.push({
      source,
      externalId: String(row.songid),
      name,
      artists: [String(row.author || '').trim() || '未知歌手'],
      coverUrl: row.pic || null,
      lyricText: normalizeXmLyric(row.lrc),
    })
  }
  return hits.slice(0, pageSize)
}

async function detailXm(source: XmMusicSource, externalId: string): Promise<MusicDetailResult> {
  const apiType = XM_API_TYPE[source] || source
  const rows = await xmPost({ input: externalId, filter: 'id', type: apiType, page: 1 })
  const row = rows[0]
  if (!row) throw new Error(`${source} 详情为空`)
  const musicUrl = String(row.url || '').trim()
  if (!musicUrl) throw new Error(`${source} 未返回播放地址`)
  return {
    musicUrl,
    coverUrl: row.pic || null,
    lyricText: normalizeXmLyric(row.lrc),
    name: row.title || undefined,
    artists: row.author ? [String(row.author)] : undefined,
    link: row.link || null,
  }
}

/** 咪咕：api.xcvts.cn —— 用 num 拉列表；详情带 n + 原 num */
async function searchMigu(kw: string, limit: number): Promise<ExtHit[]> {
  const url =
    `https://api.xcvts.cn/api/music/migu?gm=${encodeURIComponent(kw)}` +
    `&n=&num=${encodeURIComponent(String(limit))}&type=json`
  const json = await fetchJson<{
    code?: number
    data?: unknown
    message?: string
    msg?: string
  }>(url)
  if (json.code !== 200) {
    throw new Error(
      String(json.message || json.msg || `咪咕搜索失败 code=${json.code}`),
    )
  }
  if (!Array.isArray(json.data)) throw new Error('咪咕返回格式异常')
  const hits: ExtHit[] = []
  for (const it of json.data as { n?: number | string; title?: string; singer?: string }[]) {
    const n = it.n
    if (n == null || !it.title) continue
    hits.push({
      source: 'migu',
      externalId: `${kw}|${n}|${limit}`,
      name: String(it.title),
      artists: [it.singer || '未知歌手'],
      requestNum: limit,
      keyword: kw,
    })
  }
  return hits
}

/** 网易云：api.vkeys.cn —— page + num；code===200 && data[] */
async function searchVkeys(kw: string, page: number, num: number): Promise<ExtHit[]> {
  const url =
    `https://api.vkeys.cn/v2/music/netease?word=${encodeURIComponent(kw)}` +
    `&page=${encodeURIComponent(String(page))}&num=${encodeURIComponent(String(num))}`
  const json = await fetchJson<{
    code?: number
    data?: {
      id?: number | string
      song?: string
      singer?: string
      album?: string
      cover?: string
    }[]
    message?: string
    msg?: string
  }>(url)
  if (json.code !== 200) {
    throw new Error(String(json.message || json.msg || `网易云搜索失败 code=${json.code}`))
  }
  if (!Array.isArray(json.data)) throw new Error('网易云返回格式异常')
  return json.data
    .filter((it) => it.id != null && it.song)
    .map((it) => ({
      source: 'vkeys' as const,
      externalId: String(it.id),
      name: String(it.song),
      artists: [it.singer || '未知歌手'],
      album: it.album || null,
      coverUrl: it.cover || null,
    }))
}

/** QQ：tang.api.s01s.cn —— 直接数组或 {data:[]}，按 limit 截断 */
async function searchTang(kw: string, limit: number): Promise<ExtHit[]> {
  const url =
    `https://tang.api.s01s.cn/music_open_api.php` +
    `?msg=${encodeURIComponent(kw)}&type=json`
  const json = await fetchJson<unknown>(url)
  const data = Array.isArray(json)
    ? json
    : Array.isArray((json as { data?: unknown })?.data)
      ? (json as { data: unknown[] }).data
      : []
  if (!data.length) throw new Error('QQ 搜索无结果')
  return data.slice(0, limit).flatMap((raw) => {
    const it = raw as {
      song_mid?: string
      song_title?: string
      song_name?: string
      singer_name?: string
      pay?: string
    }
    const mid = it.song_mid
    const name = it.song_title || it.song_name
    if (!mid || !name) return []
    return [
      {
        source: 'tang' as const,
        externalId: `${kw}|${mid}`,
        name,
        artists: [it.singer_name || '未知歌手'],
        payTag: it.pay || null,
        keyword: kw,
      },
    ]
  })
}

/** 酷我：kw-api.cenguigui.cn —— code===200 && data[] */
async function searchKw(kw: string, page: number, limit: number): Promise<ExtHit[]> {
  const url =
    `https://kw-api.cenguigui.cn/?name=${encodeURIComponent(kw)}` +
    `&page=${encodeURIComponent(String(page))}&limit=${encodeURIComponent(String(limit))}`
  const json = await fetchJson<{
    code?: number
    data?: {
      rid?: number | string
      name?: string
      artist?: string
      album?: string
      pic?: string
    }[]
    message?: string
    msg?: string
  }>(url)
  if (json.code !== 200) {
    throw new Error(String(json.message || json.msg || `酷我搜索失败 code=${json.code}`))
  }
  if (!Array.isArray(json.data)) throw new Error('酷我返回格式异常（服务可能已停用）')
  return json.data
    .filter((it) => it.rid != null && it.name)
    .map((it) => ({
      source: 'kw' as const,
      externalId: String(it.rid),
      name: String(it.name),
      artists: [it.artist || '未知歌手'],
      album: it.album || null,
      coverUrl: it.pic || null,
    }))
}

export type ParallelSearchResult = {
  list: TrackDto[]
  sources: SourceSearchStat[]
  hasMore: boolean
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (ms <= 0) return promise
  let timer: ReturnType<typeof setTimeout> | undefined
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 请求超时`)), ms)
    promise.then(
      (v) => {
        if (timer) clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        if (timer) clearTimeout(timer)
        reject(e)
      },
    )
  })
}

function sliceHitsForPage(
  source: MusicSource,
  hits: ExtHit[],
  page: number,
  pageSize: number,
  cumulative: number,
): { pageHits: ExtHit[]; hasMore: boolean } {
  if ((source === 'migu' || source === 'tang') && page > 1) {
    const start = (page - 1) * pageSize
    return {
      pageHits: hits.slice(start, start + pageSize),
      hasMore: hits.length >= cumulative,
    }
  }
  const hasMore =
    source === 'migu' || source === 'tang'
      ? hits.length >= cumulative
      : hits.length >= pageSize ||
        (isXmMusicSource(source) && hits.length >= Math.min(pageSize, XM_NATIVE_PAGE_SIZE))
  return { pageHits: hits, hasMore }
}

/**
 * 多源并行搜索；各源互不阻塞。
 * - 传入 onSource 时：谁先完成谁先回调，便于渐进渲染
 * - 单源超时（默认 15s）后记为失败，不影响其它源
 */
export async function parallelExternalSearch(opts: {
  keyword: string
  /** 每源本次数（migu/qq 为累计 limit；vkeys/kw 为每页条数） */
  pageSize?: number
  /** vkeys / kw 页码；migu/qq 忽略 */
  page?: number
  /** migu / tang 使用的累计 limit（加载更多时递增） */
  cumulativeLimit?: number
  /** 单源超时毫秒，默认 15000 */
  timeoutMs?: number
  /** 单个源完成后的回调（先到先回调） */
  onSource?: (chunk: SourceSearchChunk) => void
}): Promise<ParallelSearchResult> {
  const kw = opts.keyword.trim()
  if (!kw) return { list: [], sources: [], hasMore: false }

  const pageSize = Math.max(1, Math.min(50, opts.pageSize || 20))
  const page = Math.max(1, opts.page || 1)
  const cumulative = Math.max(pageSize, opts.cumulativeLimit || pageSize)
  const timeoutMs = opts.timeoutMs ?? 15_000

  const tasks: Record<MusicSource, Promise<ExtHit[]>> = {
    migu: searchMigu(kw, cumulative),
    vkeys: searchVkeys(kw, page, pageSize),
    tang: searchTang(kw, cumulative),
    kw: searchKw(kw, page, pageSize),
    netease: searchXm('netease', kw, page, pageSize),
    qq: searchXm('qq', kw, page, pageSize),
    kugou: searchXm('kugou', kw, page, pageSize),
    kuwo: searchXm('kuwo', kw, page, pageSize),
    baidu: searchXm('baidu', kw, page, pageSize),
    '1ting': searchXm('1ting', kw, page, pageSize),
    xm_migu: searchXm('xm_migu', kw, page, pageSize),
    lizhi: searchXm('lizhi', kw, page, pageSize),
    qingting: searchXm('qingting', kw, page, pageSize),
    ximalaya: searchXm('ximalaya', kw, page, pageSize),
    '5singyc': searchXm('5singyc', kw, page, pageSize),
    '5singfc': searchXm('5singfc', kw, page, pageSize),
    kg: searchXm('kg', kw, page, pageSize),
  }

  const sources: SourceSearchStat[] = []
  const list: TrackDto[] = []

  await Promise.all(
    MUSIC_SOURCES.map(async (source) => {
      try {
        const raw = await withTimeout(tasks[source], timeoutMs, source)
        const { pageHits, hasMore } = sliceHitsForPage(source, raw, page, pageSize, cumulative)
        const tracks = pageHits.map(toTrack)
        sources.push({ source, ok: true, count: tracks.length, hasMore, pending: false })
        for (const t of tracks) list.push(t)
        opts.onSource?.({ source, ok: true, list: tracks, hasMore })
      } catch (e) {
        const error = errMsg(e)
        sources.push({ source, ok: false, count: 0, hasMore: false, error, pending: false })
        opts.onSource?.({ source, ok: false, list: [], hasMore: false, error })
      }
    }),
  )

  // 保持与 MUSIC_SOURCES 顺序一致，便于 UI 展示
  const ordered = MUSIC_SOURCES.map(
    (s) => sources.find((x) => x.source === s) || {
      source: s,
      ok: false,
      count: 0,
      hasMore: false,
      error: '未知错误',
      pending: false,
    },
  )

  return { list, sources: ordered, hasMore: ordered.some((s) => s.hasMore) }
}

function pickBestTangUrl(d: Record<string, unknown>): string {
  const keys = [
    'song_play_url_sq',
    'song_play_url_pq',
    'song_play_url_hq',
    'song_play_url_standard',
    'song_play_url_fq',
    'song_play_url',
  ]
  for (const k of keys) {
    const v = d[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/** 点播详情 —— 对齐皮卡丘站 ensureTrackDetails / xm95522 id 解析 */
export async function resolveExternalDetail(
  source: MusicSource,
  externalId: string,
): Promise<MusicDetailResult> {
  if (isXmMusicSource(source)) {
    return detailXm(source, externalId)
  }

  if (source === 'migu') {
    const [gm, n, num] = externalId.split('|')
    const url =
      `https://api.xcvts.cn/api/music/migu?gm=${encodeURIComponent(gm || '')}` +
      `&n=${encodeURIComponent(n || '1')}&num=${encodeURIComponent(num || '20')}&type=json`
    const j = await fetchJson<{
      code?: number
      title?: string
      singer?: string
      cover?: string
      music_url?: string
      lrc_url?: string
      link?: string
      data?: unknown
    }>(url)
    if (j.code !== 200) throw new Error('migu 详情失败')
    // 皮卡丘站：详情字段在根对象；兼容 data 数组
    const item = Array.isArray(j.data)
      ? (j.data[0] as Record<string, unknown> | undefined)
      : undefined
    const musicUrl = String(j.music_url || item?.music_url || '')
    if (!musicUrl) throw new Error('migu 未返回播放地址')
    let lyricText: string | null = null
    const lrcUrl = String(j.lrc_url || item?.lrc_url || '')
    if (lrcUrl) {
      try {
        const r = await fetch(lrcUrl)
        if (r.ok) lyricText = await r.text()
      } catch {
        /* ignore */
      }
    }
    return {
      musicUrl,
      coverUrl: (j.cover || item?.cover || null) as string | null,
      lyricText,
      name: String(j.title || item?.title || '') || undefined,
      artists: j.singer || item?.singer ? [String(j.singer || item?.singer)] : undefined,
      link: (j.link || item?.link || null) as string | null,
    }
  }

  if (source === 'vkeys') {
    const meting = `https://api.qijieya.cn/meting/?type=song&id=${encodeURIComponent(externalId)}`
    const j = await fetchJson<{ url?: string; pic?: string; name?: string; artist?: string }[]>(
      meting,
    )
    if (!Array.isArray(j) || !j.length) throw new Error('vkeys meting 详情为空')
    const d = j[0] || {}
    if (!d.url) throw new Error('vkeys 未返回播放地址')
    let lyricText: string | null = null
    try {
      const lyricApi = `https://api.vkeys.cn/v2/music/netease/lyric?id=${encodeURIComponent(externalId)}`
      const lj = await fetchJson<{ code?: number; data?: { lrc?: string } }>(lyricApi)
      if (lj?.code === 200 && lj.data?.lrc) lyricText = lj.data.lrc
    } catch {
      /* ignore */
    }
    return {
      musicUrl: d.url,
      coverUrl: d.pic || null,
      lyricText,
      name: d.name,
      artists: d.artist ? [d.artist] : undefined,
    }
  }

  if (source === 'tang') {
    const idx = externalId.indexOf('|')
    const msg = idx >= 0 ? externalId.slice(0, idx) : externalId
    const mid = idx >= 0 ? externalId.slice(idx + 1) : externalId
    const url =
      `https://tang.api.s01s.cn/music_open_api.php` +
      `?msg=${encodeURIComponent(msg)}&type=json&mid=${encodeURIComponent(mid)}`
    const d = await fetchJson<Record<string, unknown>>(url)
    if (!d || typeof d !== 'object' || !d.song_mid) throw new Error('tang 详情无效')
    const musicUrl = pickBestTangUrl(d)
    if (!musicUrl) throw new Error('tang 未返回播放地址')
    return {
      musicUrl,
      coverUrl: (d.album_pic || d.singer_pic || null) as string | null,
      lyricText: (d.song_lyric || d.lyric || null) as string | null,
      name: String(d.song_title || d.song_name || '') || undefined,
      artists: d.singer_name ? [String(d.singer_name)] : undefined,
      album: (d.album_name || d.album_title || null) as string | null,
    }
  }

  // kw
  const api =
    `https://kw-api.cenguigui.cn/?id=${encodeURIComponent(externalId)}` +
    `&type=song&level=zp&format=json`
  const j = await fetchJson<{
    code?: number
    data?: {
      name?: string
      artist?: string
      album?: string
      pic?: string
      url?: string
      lyric?: string
    }
  }>(api)
  if (!j || j.code !== 200 || !j.data) throw new Error('kw 详情失败')
  const d = j.data
  if (!d.url) throw new Error('kw 未返回播放地址')
  return {
    musicUrl: d.url,
    coverUrl: d.pic || null,
    lyricText: d.lyric || null,
    name: d.name,
    artists: d.artist ? [d.artist] : undefined,
    album: d.album || null,
  }
}

/** 下载外部曲目到本地曲库（服务端拉取音频/封面/歌词） */
export async function importExternalToLibrary(track: TrackDto): Promise<TrackDto> {
  if (!isExternalTrackId(track.id) && !(track.source && track.source !== 'local')) {
    throw new Error('不是外部搜索结果')
  }
  const parsed =
    parseExternalTrackId(track.id) ||
    (track.source && track.source !== 'local' && track.externalId
      ? { source: track.source, externalId: track.externalId }
      : null)
  if (!parsed) throw new Error('无法识别外部曲目')

  const { data } = await http.post<{ code: number; message?: string; data?: TrackDto }>(
    '/api/tracks/import-external',
    {
      source: parsed.source,
      externalId: parsed.externalId,
      // 兜底元数据；音频/封面/歌词由服务端按源解析并下载
      name: track.name,
      artists: track.artists,
      album: track.album ?? '',
      coverUrl: track.coverUrl || null,
      lyricText: track.lyricText || '',
    },
    { timeout: 300000 },
  )
  if (!data?.data) throw new Error(data?.message || '导入失败')
  return data.data
}
