import type { MusicDetail, MusicSearchHit } from './types.js'
import { pickStr, requestJson } from './http.js'

type VkeysSearchItem = {
  id?: number | string
  song?: string
  singer?: string
  album?: string
  cover?: string
}

type MetingSong = {
  url?: string
  pic?: string
  name?: string
  artist?: string
}

/**
 * vkeys/网易云 — 对齐皮卡丘站
 * 搜索：api.vkeys.cn/v2/music/netease?word=&page=&num= → code===200 && data[]
 * 音频：api.qijieya.cn/meting/?type=song&id=
 * 歌词：api.vkeys.cn/v2/music/netease/lyric?id= → data.lrc
 */
export async function searchVkeys(
  keyword: string,
  num = 20,
  page = 1,
): Promise<MusicSearchHit[]> {
  const url =
    `https://api.vkeys.cn/v2/music/netease?word=${encodeURIComponent(keyword)}` +
    `&page=${Math.max(1, page)}&num=${Math.max(1, Math.min(50, num))}`
  const json = await requestJson<{
    code?: number
    data?: VkeysSearchItem[]
    message?: string
    msg?: string
  }>(url, { timeoutMs: 20000, retries: 2 })

  if (Number(json.code) !== 200 || !Array.isArray(json.data)) {
    throw new Error(pickStr(json.message, json.msg) || `vkeys 搜索失败 code=${json.code}`)
  }

  const hits: MusicSearchHit[] = []
  for (const item of json.data) {
    const id = pickStr(item.id)
    const name = pickStr(item.song)
    if (!id || !name) continue
    hits.push({
      source: 'vkeys',
      externalId: id,
      name,
      artists: [pickStr(item.singer) || '未知歌手'],
      album: pickStr(item.album) || null,
      coverUrl: pickStr(item.cover) || null,
    })
  }
  return hits
}

export async function detailVkeys(songId: string): Promise<MusicDetail> {
  const metingApi = `https://api.qijieya.cn/meting/?type=song&id=${encodeURIComponent(songId)}`
  const j = await requestJson<MetingSong[]>(metingApi, { timeoutMs: 20000, retries: 1 })
  if (!Array.isArray(j) || !j.length) throw new Error('vkeys meting 详情为空')
  const d = j[0] || {}
  const musicUrl = pickStr(d.url)
  if (!musicUrl) throw new Error('vkeys 未返回播放地址')

  let lyricText: string | null = null
  try {
    const lyricApi = `https://api.vkeys.cn/v2/music/netease/lyric?id=${encodeURIComponent(songId)}`
    const lj = await requestJson<{ code?: number; data?: { lrc?: string } }>(lyricApi, {
      timeoutMs: 15000,
      retries: 1,
    })
    if (lj?.code === 200 && lj.data?.lrc) lyricText = lj.data.lrc
  } catch {
    /* ignore */
  }

  return {
    source: 'vkeys',
    externalId: songId,
    name: pickStr(d.name) || undefined,
    artists: pickStr(d.artist) ? [pickStr(d.artist)] : undefined,
    musicUrl,
    coverUrl: pickStr(d.pic) || null,
    lyricText,
  }
}
