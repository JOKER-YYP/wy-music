/**
 * xm95522 / maicong 音乐搜索器聚合接口
 * http://www.xm95522.com/mp3/
 */
import type { XmMusicSource } from '@wy-music/shared'
import { isXmMusicSource, XM_API_TYPE } from '@wy-music/shared'
import { pickStr, requestFormJson } from './http.js'
import type { MusicDetail, MusicSearchHit } from './types.js'

function xmType(source: XmMusicSource): string {
  return XM_API_TYPE[source] || source
}

const XM_API = 'http://www.xm95522.com/mp3/'
/** 该站固定约 10 条/页 */
export const XM_NATIVE_PAGE_SIZE = 10

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

function normalizeLyric(lrc?: string | null): string | null {
  const t = String(lrc || '').trim()
  if (!t) return null
  if (/暂无歌词|无效歌词/.test(t) && t.length < 40) return null
  return t
}

function toHits(source: XmMusicSource, rows: XmSong[]): MusicSearchHit[] {
  const hits: MusicSearchHit[] = []
  for (const row of rows) {
    const songid = row.songid
    if (songid == null || songid === '') continue
    const name = pickStr(row.title)
    if (!name || name === '暂无') continue
    hits.push({
      source,
      externalId: String(songid),
      name,
      artists: [pickStr(row.author) || '未知歌手'],
      coverUrl: pickStr(row.pic) || null,
    })
  }
  return hits
}

async function xmPost(form: {
  input: string
  filter: 'name' | 'id' | 'url'
  type: string
  page?: number
}): Promise<XmSong[]> {
  const json = await requestFormJson<XmResponse>(
    XM_API,
    {
      input: form.input,
      filter: form.filter,
      type: form.type,
      page: form.page ?? 1,
    },
    { timeoutMs: 30_000 },
  )
  const code = json.code == null ? 200 : Number(json.code)
  if (code === 404 || (!json.data && code !== 200)) {
    // 无结果：按空列表处理，避免并行搜索整源标红
    return []
  }
  if (code !== 200) {
    throw new Error(pickStr(json.error) || `xm 搜索失败 code=${code}`)
  }
  if (!json.data) return []
  return Array.isArray(json.data) ? json.data : [json.data]
}

/** 按逻辑页拉取；pageSize>10 时自动拼多页 */
export async function searchXm(
  source: XmMusicSource,
  keyword: string,
  page = 1,
  pageSize = 20,
): Promise<MusicSearchHit[]> {
  if (!isXmMusicSource(source)) throw new Error(`非 xm 源: ${source}`)
  const q = keyword.trim()
  if (!q) return []

  const pagesNeeded = Math.max(1, Math.ceil(pageSize / XM_NATIVE_PAGE_SIZE))
  const start = (Math.max(1, page) - 1) * pagesNeeded + 1
  const pageNos = Array.from({ length: pagesNeeded }, (_, i) => start + i)

  // 全民K歌不支持按名称搜索（站方说明），直接空结果
  if (source === 'kg') return []

  const apiType = xmType(source)
  const batches = await Promise.all(
    pageNos.map((p) =>
      xmPost({ input: q, filter: 'name', type: apiType, page: p }).catch((e) => {
        if (pageNos.length === 1) throw e
        return [] as XmSong[]
      }),
    ),
  )

  const rows = batches.flat()
  return toHits(source, rows).slice(0, pageSize)
}

export async function detailXm(source: XmMusicSource, externalId: string): Promise<MusicDetail> {
  if (!isXmMusicSource(source)) throw new Error(`非 xm 源: ${source}`)
  const id = String(externalId || '').trim()
  if (!id) throw new Error('缺少外部曲目 id')

  const rows = await xmPost({ input: id, filter: 'id', type: xmType(source), page: 1 })
  const row = rows[0]
  if (!row) throw new Error(`${source} 详情为空`)
  const musicUrl = pickStr(row.url)
  if (!musicUrl) throw new Error(`${source} 未返回播放地址`)

  return {
    source,
    externalId: id,
    name: pickStr(row.title) || undefined,
    artists: pickStr(row.author) ? [pickStr(row.author)] : undefined,
    musicUrl,
    coverUrl: pickStr(row.pic) || null,
    lyricText: normalizeLyric(row.lrc),
    link: pickStr(row.link) || null,
  }
}
