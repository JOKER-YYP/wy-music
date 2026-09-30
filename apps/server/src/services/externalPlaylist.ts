import type { IncomingMessage } from 'node:http'
import https from 'node:https'
import http from 'node:http'

export type ExternalPlatform = 'netease' | 'qq'

export type ExternalSong = {
  name: string
  artists: string[]
  album?: string | null
  externalId?: string
}

export type ExternalPlaylist = {
  platform: ExternalPlatform
  sourceUrl: string
  externalId: string
  name: string
  description: string | null
  coverUrl: string | null
  songs: ExternalSong[]
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

function requestText(
  url: string,
  opts: { headers?: Record<string, string>; maxRedirects?: number } = {},
): Promise<{ url: string; body: string; status: number }> {
  const maxRedirects = opts.maxRedirects ?? 5
  return new Promise((resolve, reject) => {
    const go = (current: string, left: number) => {
      const lib = current.startsWith('https') ? https : http
      const req = lib.get(
        current,
        {
          headers: {
            'User-Agent': UA,
            Accept: 'application/json,text/plain,*/*',
            ...(opts.headers || {}),
          },
        },
        (res: IncomingMessage) => {
          const status = res.statusCode || 0
          const loc = res.headers.location
          if (status >= 300 && status < 400 && loc && left > 0) {
            const next = new URL(loc, current).toString()
            res.resume()
            go(next, left - 1)
            return
          }
          const chunks: Buffer[] = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () => {
            resolve({
              url: current,
              body: Buffer.concat(chunks).toString('utf8'),
              status,
            })
          })
        },
      )
      req.on('error', reject)
      req.setTimeout(20000, () => {
        req.destroy(new Error('请求超时'))
      })
    }
    go(url, maxRedirects)
  })
}

async function requestJson<T = unknown>(
  url: string,
  headers?: Record<string, string>,
): Promise<T> {
  const { body, status } = await requestText(url, { headers })
  if (status >= 400) {
    throw new Error(`外部接口返回 ${status}`)
  }
  const text = body.trim()
  // JSONP
  if (/^\w+\s*\(/.test(text)) {
    const start = text.indexOf('(')
    const end = text.lastIndexOf(')')
    return JSON.parse(text.slice(start + 1, end)) as T
  }
  return JSON.parse(text) as T
}

export function detectPlatform(rawUrl: string): ExternalPlatform | null {
  const u = rawUrl.trim().toLowerCase()
  if (!u) return null
  if (
    u.includes('music.163.com') ||
    u.includes('163cn.tv') ||
    u.includes('y.music.163.com') ||
    u.includes('music.126.net')
  ) {
    return 'netease'
  }
  if (u.includes('y.qq.com') || u.includes('i.y.qq.com') || u.includes('c.y.qq.com')) {
    return 'qq'
  }
  return null
}

function extractNeteasePlaylistId(inputUrl: string, finalUrl?: string): string | null {
  const candidates = [inputUrl, finalUrl || ''].filter(Boolean)
  for (const raw of candidates) {
    try {
      const url = new URL(raw)
      const id = url.searchParams.get('id')
      if (id && /^\d+$/.test(id)) return id
      const m = url.pathname.match(/playlist\/(\d+)/i)
      if (m) return m[1]
    } catch {
      // ignore
    }
    const m2 = raw.match(/[?&#]id=(\d+)/i) || raw.match(/playlist[/=](\d+)/i)
    if (m2) return m2[1]
  }
  return null
}

function extractQqPlaylistId(inputUrl: string, finalUrl?: string): string | null {
  const candidates = [inputUrl, finalUrl || ''].filter(Boolean)
  for (const raw of candidates) {
    try {
      const url = new URL(raw)
      for (const key of ['id', 'disstid', 'dissid']) {
        const v = url.searchParams.get(key)
        if (v && /^\d+$/.test(v)) return v
      }
      const m = url.pathname.match(/(?:playlist|taoge)\/(\d+)/i)
      if (m) return m[1]
    } catch {
      // ignore
    }
    const m2 =
      raw.match(/[?&#](?:id|disstid|dissid)=(\d+)/i) ||
      raw.match(/(?:playlist|taoge)\/(\d+)/i)
    if (m2) return m2[1]
  }
  return null
}

type NeteaseArtist = { name?: string }
type NeteaseSong = {
  id?: number
  name?: string
  artists?: NeteaseArtist[]
  ar?: NeteaseArtist[]
  album?: { name?: string } | null
  al?: { name?: string } | null
}

async function fetchNeteaseSongs(ids: number[]): Promise<ExternalSong[]> {
  if (!ids.length) return []
  const songs: ExternalSong[] = []
  const CHUNK = 100
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const c = JSON.stringify(chunk.map((id) => ({ id })))
    const url = `https://music.163.com/api/v3/song/detail?c=${encodeURIComponent(c)}`
    const data = await requestJson<{ songs?: NeteaseSong[] }>(url, {
      Referer: 'https://music.163.com/',
    })
    for (const t of data.songs || []) {
      const artists = (t.ar || t.artists || [])
        .map((a) => String(a.name || '').trim())
        .filter(Boolean)
      const name = String(t.name || '').trim()
      if (!name) continue
      songs.push({
        name,
        artists: artists.length ? artists : ['未知歌手'],
        album: t.al?.name || t.album?.name || null,
        externalId: t.id != null ? String(t.id) : undefined,
      })
    }
  }
  return songs
}

async function fetchNeteasePlaylist(sourceUrl: string): Promise<ExternalPlaylist> {
  let id = extractNeteasePlaylistId(sourceUrl)
  if (!id) {
    const resolved = await requestText(sourceUrl, {
      headers: { Referer: 'https://music.163.com/' },
      maxRedirects: 8,
    })
    id = extractNeteasePlaylistId(sourceUrl, resolved.url)
  }
  if (!id) throw new Error('无法从链接中解析网易云歌单 ID')

  const detailUrl = `https://music.163.com/api/v6/playlist/detail?id=${id}&n=1000`
  const data = await requestJson<{
    code?: number
    playlist?: {
      id?: number
      name?: string
      description?: string | null
      coverImgUrl?: string | null
      trackIds?: { id: number }[]
      tracks?: NeteaseSong[]
    }
  }>(detailUrl, { Referer: 'https://music.163.com/' })

  const pl = data.playlist
  if (!pl?.name) throw new Error('网易云歌单不存在或无法访问')

  const trackIds = (pl.trackIds || []).map((t) => t.id).filter(Boolean)
  let songs: ExternalSong[] = []
  if (trackIds.length) {
    songs = await fetchNeteaseSongs(trackIds)
  } else if (pl.tracks?.length) {
    songs = (pl.tracks || []).map((t) => {
      const artists = (t.ar || t.artists || [])
        .map((a) => String(a.name || '').trim())
        .filter(Boolean)
      return {
        name: String(t.name || '').trim() || '未知歌曲',
        artists: artists.length ? artists : ['未知歌手'],
        album: t.al?.name || t.album?.name || null,
        externalId: t.id != null ? String(t.id) : undefined,
      }
    })
  }

  return {
    platform: 'netease',
    sourceUrl,
    externalId: String(pl.id || id),
    name: String(pl.name).trim() || `网易云歌单 ${id}`,
    description: pl.description ? String(pl.description).slice(0, 1000) : null,
    coverUrl: pl.coverImgUrl || null,
    songs,
  }
}

type QqSinger = { name?: string; title?: string }
type QqSong = {
  songname?: string
  name?: string
  title?: string
  singer?: QqSinger[]
  albumname?: string
  songid?: number | string
  id?: number | string
}

async function fetchQqPlaylist(sourceUrl: string): Promise<ExternalPlaylist> {
  let id = extractQqPlaylistId(sourceUrl)
  if (!id) {
    const resolved = await requestText(sourceUrl, {
      headers: { Referer: 'https://y.qq.com/' },
      maxRedirects: 8,
    })
    id = extractQqPlaylistId(sourceUrl, resolved.url)
  }
  if (!id) throw new Error('无法从链接中解析 QQ 音乐歌单 ID')

  const api =
    `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg` +
    `?type=1&json=1&utf8=1&onlysong=0&new_format=1&disstid=${id}&format=json`
  const data = await requestJson<{
    code?: number
    cdlist?: Array<{
      disstid?: string
      dissname?: string
      desc?: string
      logo?: string
      songlist?: QqSong[]
    }>
  }>(api, { Referer: 'https://y.qq.com/' })

  const cd = data.cdlist?.[0]
  if (!cd) throw new Error('QQ 音乐歌单不存在或无法访问')

  const songs: ExternalSong[] = []
  for (const s of cd.songlist || []) {
    const name = String(s.songname || s.name || s.title || '').trim()
    if (!name) continue
    const artists = (s.singer || [])
      .map((a) => String(a.name || a.title || '').trim())
      .filter(Boolean)
    songs.push({
      name,
      artists: artists.length ? artists : ['未知歌手'],
      album: s.albumname || null,
      externalId: s.songid != null ? String(s.songid) : s.id != null ? String(s.id) : undefined,
    })
  }

  return {
    platform: 'qq',
    sourceUrl,
    externalId: String(cd.disstid || id),
    name: String(cd.dissname || '').trim() || `QQ 音乐歌单 ${id}`,
    description: cd.desc ? String(cd.desc).slice(0, 1000) : null,
    coverUrl: cd.logo || null,
    songs,
  }
}

export async function fetchExternalPlaylist(rawUrl: string): Promise<ExternalPlaylist> {
  const url = rawUrl.trim()
  if (!url) throw new Error('链接不能为空')
  const platform = detectPlatform(url)
  if (!platform) {
    throw new Error('暂仅支持网易云音乐、QQ 音乐的歌单分享链接')
  }
  if (platform === 'netease') return fetchNeteasePlaylist(url)
  return fetchQqPlaylist(url)
}
