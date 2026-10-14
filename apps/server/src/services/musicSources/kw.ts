import type { MusicDetail, MusicSearchHit } from './types.js'
import { pickStr, requestJson } from './http.js'

type KwSearchItem = {
  rid?: number | string
  name?: string
  artist?: string
  album?: string
  pic?: string
}

type KwDetailData = {
  url?: string
  lyric?: string
  pic?: string
  name?: string
  artist?: string
  album?: string
}

/**
 * kw/酷我 — 对齐皮卡丘站
 * 搜索：kw-api.cenguigui.cn/?name=&page=&limit= → code===200 && data[]
 * 详情：?id=&type=song&level=zp&format=json → code===200 && data.url
 */
export async function searchKw(
  keyword: string,
  num = 20,
  page = 1,
): Promise<MusicSearchHit[]> {
  const url =
    `https://kw-api.cenguigui.cn/?name=${encodeURIComponent(keyword)}` +
    `&page=${Math.max(1, page)}&limit=${Math.max(1, Math.min(50, num))}`
  const json = await requestJson<{
    code?: number
    data?: KwSearchItem[]
    message?: string
    msg?: string
  }>(url, { insecure: true, timeoutMs: 20000, retries: 1 })

  if (Number(json.code) !== 200 || !Array.isArray(json.data)) {
    throw new Error(pickStr(json.message, json.msg) || `kw 搜索失败 code=${json.code}`)
  }

  const hits: MusicSearchHit[] = []
  for (const item of json.data) {
    const rid = pickStr(item.rid)
    const name = pickStr(item.name)
    if (!rid || !name) continue
    hits.push({
      source: 'kw',
      externalId: rid,
      name,
      artists: [pickStr(item.artist) || '未知歌手'],
      album: pickStr(item.album) || null,
      coverUrl: pickStr(item.pic) || null,
    })
  }
  return hits
}

export async function detailKw(rid: string): Promise<MusicDetail> {
  const url =
    `https://kw-api.cenguigui.cn/?id=${encodeURIComponent(rid)}` +
    `&type=song&level=zp&format=json`
  const json = await requestJson<{ code?: number; data?: KwDetailData }>(url, {
    insecure: true,
    timeoutMs: 20000,
    retries: 1,
  })
  if (!json || Number(json.code) !== 200 || !json.data) {
    throw new Error('kw 详情失败')
  }
  const d = json.data
  const musicUrl = pickStr(d.url)
  if (!musicUrl) throw new Error('kw 未返回播放地址')

  return {
    source: 'kw',
    externalId: rid,
    name: pickStr(d.name) || undefined,
    artists: pickStr(d.artist) ? [pickStr(d.artist)] : undefined,
    album: pickStr(d.album) || null,
    musicUrl,
    coverUrl: pickStr(d.pic) || null,
    lyricText: pickStr(d.lyric) || null,
  }
}
