/**
 * 下歌吧 so.liumingye.cn —— 服务端仅支持搜索；详情/导入需桌面端网盘登录
 */
import type { MusicSource } from '@wy-music/shared'
import type { MusicDetail, MusicSearchHit } from './types.js'

const API = 'https://so.liumingye.cn'

type LiumingyeTag = Extract<
  MusicSource,
  'liumingye' | 'liumingye_quark' | 'liumingye_baidu'
>

export async function searchLiumingye(
  keyword: string,
  num = 20,
  source: LiumingyeTag = 'liumingye_quark',
): Promise<MusicSearchHit[]> {
  const kw = String(keyword || '').trim()
  if (!kw) return []
  const url = `${API}/api/music/search?q=${encodeURIComponent(kw)}&page=1`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
  })
  if (!res.ok) throw new Error(`下歌吧搜索失败 HTTP ${res.status}`)
  const json = (await res.json()) as {
    data?: {
      id?: string
      title?: string
      artist?: string
      album?: string
      cover?: string
      quality?: string[]
    }[]
  }
  const rows = Array.isArray(json?.data) ? json.data : []
  return rows
    .filter((it) => it.id && it.title)
    .slice(0, Math.max(1, Math.min(50, num)))
    .map((it) => {
      const qualities = Array.isArray(it.quality) ? it.quality.map(String) : []
      return {
        source,
        externalId: String(it.id),
        name: String(it.title),
        artists: [String(it.artist || '').trim() || '未知歌手'],
        album: it.album || null,
        coverUrl: it.cover || null,
        payTag: qualities.length ? qualities.join(' / ') : null,
      }
    })
}

export async function detailLiumingye(_id: string): Promise<MusicDetail> {
  throw new Error('下歌吧音频需在桌面端下载（依赖夸克/百度网盘登录），服务端无法拉取直链')
}
