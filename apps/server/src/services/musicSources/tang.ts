import type { MusicDetail, MusicSearchHit } from './types.js'
import { pickStr, requestJson } from './http.js'

type TangSearchItem = {
  song_title?: string
  song_name?: string
  singer_name?: string
  song_mid?: string
  pay?: string
  vip?: string
  album_name?: string
  album_pic?: string
}

type TangDetail = TangSearchItem & {
  song_play_url_sq?: string
  song_play_url_pq?: string
  song_play_url_hq?: string
  song_play_url_standard?: string
  song_play_url_fq?: string
  song_play_url?: string
  song_play_url_accom?: string
  song_lyric?: string
  lyric?: string
  singer_pic?: string
  album_title?: string
}

const BASE = 'https://tang.api.s01s.cn/music_open_api.php'

/**
 * tang/QQ — 对齐皮卡丘站
 * 搜索：?msg=&type=json → 数组或 {data:[]}；song_mid
 * 详情：?msg=原关键词&type=json&mid=song_mid
 */
function pickBestPlayUrl(d: TangDetail): { url: string; quality: string } | null {
  const candidates: [string, string][] = [
    [pickStr(d.song_play_url_sq), 'lossless'],
    [pickStr(d.song_play_url_pq), 'lossless'],
    [pickStr(d.song_play_url_accom), 'hq'],
    [pickStr(d.song_play_url_hq), 'hq'],
    [pickStr(d.song_play_url_standard), 'standard'],
    [pickStr(d.song_play_url_fq), 'fq'],
    [pickStr(d.song_play_url), 'default'],
  ]
  for (const [url, quality] of candidates) {
    if (url) return { url, quality }
  }
  return null
}

export async function searchTang(
  keyword: string,
  num = 20,
  _page = 1,
): Promise<MusicSearchHit[]> {
  const url = `${BASE}?msg=${encodeURIComponent(keyword)}&type=json`
  const json = await requestJson<unknown>(url, { timeoutMs: 20000, retries: 1 })
  const data = Array.isArray(json)
    ? json
    : Array.isArray((json as { data?: unknown })?.data)
      ? ((json as { data: unknown[] }).data)
      : []
  const limit = Math.max(1, Math.min(50, num))
  const hits: MusicSearchHit[] = []
  for (const raw of data.slice(0, limit)) {
    const item = raw as TangSearchItem
    const mid = pickStr(item.song_mid)
    const name = pickStr(item.song_title, item.song_name)
    if (!mid || !name) continue
    hits.push({
      source: 'tang',
      externalId: `${keyword}|${mid}`,
      name,
      artists: [pickStr(item.singer_name) || '未知歌手'],
      album: pickStr(item.album_name) || null,
      coverUrl: pickStr(item.album_pic) || null,
      payTag: pickStr(item.pay, item.vip) || null,
    })
  }
  return hits
}

export async function detailTang(externalId: string): Promise<MusicDetail> {
  const idx = externalId.indexOf('|')
  const msg = idx >= 0 ? externalId.slice(0, idx) : externalId
  const mid = idx >= 0 ? externalId.slice(idx + 1) : externalId
  const url =
    `${BASE}?msg=${encodeURIComponent(msg)}&type=json&mid=${encodeURIComponent(mid)}`
  const d = await requestJson<TangDetail>(url, { timeoutMs: 20000, retries: 1 })
  if (!d || typeof d !== 'object' || !d.song_mid) throw new Error('tang 详情无效')

  const best = pickBestPlayUrl(d)
  if (!best) throw new Error('tang 未返回播放地址')

  return {
    source: 'tang',
    externalId,
    name: pickStr(d.song_title, d.song_name) || undefined,
    artists: pickStr(d.singer_name) ? [pickStr(d.singer_name)] : undefined,
    album: pickStr(d.album_name, d.album_title) || null,
    musicUrl: best.url,
    coverUrl: pickStr(d.album_pic, d.singer_pic) || null,
    lyricText: pickStr(d.song_lyric, d.lyric) || null,
    quality: best.quality,
  }
}
