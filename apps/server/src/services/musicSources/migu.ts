import type { MusicDetail, MusicSearchHit } from './types.js'
import { pickStr, requestJson, requestText } from './http.js'

type MiguItem = {
  title?: string
  singer?: string
  n?: number | string
  music_url?: string
  cover?: string
  lrc_url?: string
  link?: string
}

/**
 * migu — 对齐皮卡丘站
 * 搜索：GET .../migu?gm=&n=&num=&type=json → code===200 && data[]
 * 详情：同上带 n + 原 num → 根对象 music_url/cover/lrc_url
 */
export async function searchMigu(
  keyword: string,
  num = 20,
  _page = 1,
): Promise<MusicSearchHit[]> {
  const limit = Math.max(1, Math.min(50, num))
  const url =
    `https://api.xcvts.cn/api/music/migu?gm=${encodeURIComponent(keyword)}` +
    `&n=&num=${limit}&type=json`
  const json = await requestJson<{ code?: number; data?: MiguItem[]; message?: string; msg?: string }>(
    url,
    { timeoutMs: 20000, retries: 1 },
  )
  if (Number(json.code) !== 200 || !Array.isArray(json.data)) {
    throw new Error(pickStr(json.message, json.msg) || `migu 搜索失败 code=${json.code}`)
  }
  const hits: MusicSearchHit[] = []
  for (const item of json.data) {
    const n = pickStr(item.n)
    const name = pickStr(item.title)
    if (!n || !name) continue
    hits.push({
      source: 'migu',
      externalId: `${keyword}|${n}|${limit}`,
      name,
      artists: [pickStr(item.singer) || '未知歌手'],
    })
  }
  return hits
}

function parseMiguId(externalId: string): { gm: string; n: string; num: string } {
  const parts = externalId.split('|')
  if (parts.length >= 3) return { gm: parts[0], n: parts[1], num: parts[2] }
  if (parts.length === 2) return { gm: parts[0], n: parts[1], num: '20' }
  return { gm: '', n: externalId, num: '20' }
}

export async function detailMigu(externalId: string): Promise<MusicDetail> {
  const { gm, n, num } = parseMiguId(externalId)
  const url =
    `https://api.xcvts.cn/api/music/migu?gm=${encodeURIComponent(gm)}` +
    `&n=${encodeURIComponent(n)}&num=${encodeURIComponent(num)}&type=json`
  const json = await requestJson<{
    code?: number
    title?: string
    singer?: string
    cover?: string
    music_url?: string
    lrc_url?: string
    link?: string
    data?: MiguItem[] | MiguItem
    message?: string
    msg?: string
  }>(url, { timeoutMs: 20000, retries: 1 })
  if (Number(json.code) !== 200) {
    throw new Error(pickStr(json.message, json.msg) || `migu 详情失败 code=${json.code}`)
  }

  // 皮卡丘站：字段在根对象；兼容 data
  const nested = Array.isArray(json.data)
    ? json.data[0]
    : json.data && typeof json.data === 'object'
      ? json.data
      : undefined
  const musicUrl = pickStr(json.music_url, nested?.music_url)
  if (!musicUrl) throw new Error('migu 未返回播放地址')

  let lyricText: string | null = null
  const lrcUrl = pickStr(json.lrc_url, nested?.lrc_url)
  if (lrcUrl) {
    try {
      const { body, status } = await requestText(lrcUrl)
      if (status < 400 && body.trim()) lyricText = body
    } catch {
      /* ignore */
    }
  }

  return {
    source: 'migu',
    externalId,
    name: pickStr(json.title, nested?.title) || undefined,
    artists: pickStr(json.singer, nested?.singer)
      ? [pickStr(json.singer, nested?.singer)]
      : undefined,
    musicUrl,
    coverUrl: pickStr(json.cover, nested?.cover) || null,
    lyricText,
    link: pickStr(json.link, nested?.link) || null,
  }
}
