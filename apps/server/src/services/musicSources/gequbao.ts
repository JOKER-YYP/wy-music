/**
 * 歌曲宝 gequbao.com
 * 搜索：GET /s/{kw} HTML
 * 详情：解析 window.appData.mp3_extra_urls（Base64 网盘分享链）
 * 试听：POST /member/common-play-url（酷我 CDN，约 128k；网盘失败时回退）
 * 高码率入库仍走桌面端夸克/百度会话。
 */
import { Buffer } from 'node:buffer'
import type { IncomingMessage } from 'node:http'
import http from 'node:http'
import https from 'node:https'
import type { MusicDetail, MusicSearchHit } from './types.js'

const BASE = 'https://www.gequbao.com'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

function requestText(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<{ status: number; body: string }> {
  const timeoutMs = opts.timeoutMs ?? 20_000
  return new Promise((resolve, reject) => {
    const go = (current: string, left: number) => {
      let parsed: URL
      try {
        parsed = new URL(current)
      } catch (e) {
        reject(e)
        return
      }
      const lib = parsed.protocol === 'https:' ? https : http
      const req = lib.get(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || undefined,
          path: parsed.pathname + parsed.search,
          family: 4,
          headers: {
            'User-Agent': UA,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            Referer: `${BASE}/`,
            ...(opts.headers || {}),
          },
        },
        (res: IncomingMessage) => {
          const status = res.statusCode || 0
          const loc = res.headers.location
          if (status >= 300 && status < 400 && loc && left > 0) {
            res.resume()
            go(new URL(loc, current).toString(), left - 1)
            return
          }
          const chunks: Buffer[] = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () => {
            resolve({ status, body: Buffer.concat(chunks).toString('utf8') })
          })
        },
      )
      req.on('error', reject)
      req.setTimeout(timeoutMs, () => req.destroy(new Error('歌曲宝请求超时')))
    }
    go(url, 5)
  })
}

function requestFormPost(
  url: string,
  form: Record<string, string>,
  opts: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<{ status: number; body: string }> {
  const timeoutMs = opts.timeoutMs ?? 15_000
  const body = new URLSearchParams(form).toString()
  return new Promise((resolve, reject) => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch (e) {
      reject(e)
      return
    }
    const lib = parsed.protocol === 'https:' ? https : http
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        family: 4,
        headers: {
          'User-Agent': UA,
          Accept: 'application/json,text/plain,*/*',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
          'X-Requested-With': 'XMLHttpRequest',
          Origin: BASE,
          Referer: `${BASE}/`,
          ...(opts.headers || {}),
        },
      },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') })
        })
      },
    )
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => req.destroy(new Error('歌曲宝请求超时')))
    req.write(body)
    req.end()
  })
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function absUrl(u: string | null | undefined): string | null {
  const s = String(u || '')
    .trim()
    .replace(/\\\//g, '/')
  if (!s) return null
  if (s.startsWith('https://')) return s
  if (s.startsWith('http://')) return `https://${s.slice('http://'.length)}`
  if (s.startsWith('//')) return `https:${s}`
  if (s.startsWith('/')) return `${BASE}${s}`
  return s
}

function parseDurationMs(text: string): number | undefined {
  const m = String(text || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return undefined
  return (Number(m[1]) * 60 + Number(m[2])) * 1000
}

function decodeShareLink(raw: string, pwd?: string | null): string | null {
  const s = String(raw || '').trim()
  if (!s) return null
  let url = ''
  if (/^https?:\/\//i.test(s)) {
    url = s
  } else {
    try {
      const pad = '='.repeat((4 - (s.length % 4)) % 4)
      url = Buffer.from(s + pad, 'base64').toString('utf8').trim()
    } catch {
      return null
    }
  }
  if (!/^https?:\/\//i.test(url)) return null
  const code = String(pwd || '').trim()
  if (code && /pan\.baidu\.com/i.test(url) && !/[?&#]pwd=/i.test(url)) {
    url += (url.includes('?') ? '&' : '?') + `pwd=${encodeURIComponent(code)}`
  }
  if (code && /pan\.quark\.cn/i.test(url) && !/[?&#]pwd=/i.test(url)) {
    url += (url.includes('?') ? '&' : '?') + `pwd=${encodeURIComponent(code)}`
  }
  return url
}

function parseSearchHtml(html: string): MusicSearchHit[] {
  const hits: MusicSearchHit[] = []
  const seen = new Set<string>()
  const re = /href="\/music\/(\d+)"[^>]*title="([^"]+)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const id = m[1]
    if (seen.has(id)) continue
    seen.add(id)
    const title = decodeHtml(m[2] || '').replace(/\s+/g, ' ').trim()
    let name = title || id
    let artists = ['未知歌手']
    const sep = title.indexOf(' - ')
    if (sep > 0) {
      name = title.slice(0, sep).trim() || title
      artists = [title.slice(sep + 3).trim() || '未知歌手']
    }
    hits.push({
      source: 'gequbao',
      externalId: id,
      name,
      artists,
      payTag: '网盘',
    })
  }
  return hits
}

type AppData = {
  mp3_id?: number | string
  play_id?: string
  mp3_title?: string
  mp3_author?: string
  mp3_cover?: string
  mp3_duration?: string
  mp3_extra_urls?: {
    share_link?: string
    pwd?: string | null
    type?: string
  }[]
  extra_recommend_wap_url?: string
}

/** 还原 JSON.parse('...') 内层转义：\u0022 → "；\\u6674 → \u6674（再交 JSON 解中文） */
function unescapeAppDataPayload(raw: string): string {
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '\\' || i + 1 >= raw.length) {
      out += raw[i]
      continue
    }
    const n = raw[i + 1]
    if (n === 'u' && /^[0-9a-fA-F]{4}/.test(raw.slice(i + 2, i + 6))) {
      out += String.fromCharCode(parseInt(raw.slice(i + 2, i + 6), 16))
      i += 5
      continue
    }
    if (n === '\\' || n === '/' || n === "'" || n === '"' || n === 'n' || n === 't' || n === 'r') {
      if (n === 'n') out += '\n'
      else if (n === 't') out += '\t'
      else if (n === 'r') out += '\r'
      else out += n
      i += 1
      continue
    }
    out += raw[i]
  }
  return out
}

function parseAppData(html: string): AppData | null {
  const m = html.match(/window\.appData\s*=\s*JSON\.parse\('((?:\\'|[^'])*)'\);/)
  if (!m) return null
  try {
    return JSON.parse(unescapeAppDataPayload(m[1])) as AppData
  } catch {
    return null
  }
}

function parseLyricFromHtml(html: string): string | null {
  const m = html.match(/id="content-lrc"[^>]*>([\s\S]*?)<\/div>/i)
  if (!m) return null
  let text = m[1]
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
  text = decodeHtml(text).replace(/\r\n/g, '\n').trim()
  if (!text || !/\[\d{1,2}:\d{2}/.test(text)) return null
  return text
}

export type GequbaoPanDetail = {
  source: 'gequbao'
  externalId: string
  name?: string
  artists?: string[]
  coverUrl?: string | null
  lyricText?: string | null
  durationMs?: number
  link?: string
  /** 试听直链（common-play-url，通常约 128k） */
  playUrl?: string | null
  downloads: { url: string; quality: string }[]
}

async function resolvePlayUrl(
  playId: string | undefined,
  musicId: string,
): Promise<string | null> {
  const id = String(playId || '').trim()
  if (!id) return null
  try {
    const { status, body } = await requestFormPost(
      `${BASE}/member/common-play-url`,
      { id, purpose: 'play' },
      { headers: { Referer: `${BASE}/music/${musicId}` }, timeoutMs: 12_000 },
    )
    if (status >= 400) return null
    const json = JSON.parse(body) as { code?: number; data?: { url?: string } }
    const url = String(json?.data?.url || '').trim()
    if (Number(json.code) === 1 && /^https?:\/\//i.test(url)) return url
  } catch {
    /* ignore */
  }
  return null
}

export async function searchGequbao(keyword: string, num = 20): Promise<MusicSearchHit[]> {
  const kw = keyword.trim()
  if (!kw) return []
  const { status, body } = await requestText(`${BASE}/s/${encodeURIComponent(kw)}`)
  if (status >= 400) throw new Error(`歌曲宝搜索失败 HTTP ${status}`)
  const hits = parseSearchHtml(body)
  return hits.slice(0, Math.max(1, Math.min(50, num)))
}

export async function getGequbaoPanDetail(externalId: string): Promise<GequbaoPanDetail> {
  const id = String(externalId || '').trim()
  if (!id) throw new Error('缺少歌曲宝曲目 id')
  const { status, body } = await requestText(`${BASE}/music/${encodeURIComponent(id)}`)
  if (status >= 400) throw new Error(`歌曲宝详情失败 HTTP ${status}`)

  const app = parseAppData(body)
  const downloads: { url: string; quality: string }[] = []
  const seen = new Set<string>()

  const push = (raw: string | undefined, pwd: string | null | undefined, type: string) => {
    const url = decodeShareLink(raw || '', pwd)
    if (!url || seen.has(url)) return
    if (!/pan\.(quark\.cn|baidu\.com)/i.test(url)) return
    seen.add(url)
    downloads.push({ url, quality: type || (/quark/i.test(url) ? '夸克' : '百度') })
  }

  for (const item of app?.mp3_extra_urls || []) {
    push(item.share_link, item.pwd, String(item.type || ''))
  }
  if (app?.extra_recommend_wap_url) {
    push(app.extra_recommend_wap_url, null, '夸克')
  }
  // 兜底：页面 /dp/{base64}
  for (const b64 of body.matchAll(/href="\/dp\/([^"]+)"/gi)) {
    push(b64[1], null, '网盘')
  }

  const playUrl = await resolvePlayUrl(app?.play_id, id)
  if (!downloads.length && !playUrl) {
    throw new Error('歌曲宝未返回夸克/百度分享链接或试听地址')
  }

  const name = String(app?.mp3_title || '').trim() || undefined
  const author = String(app?.mp3_author || '').trim()
  return {
    source: 'gequbao',
    externalId: id,
    name,
    artists: author ? [author] : undefined,
    coverUrl: absUrl(app?.mp3_cover),
    lyricText: parseLyricFromHtml(body),
    durationMs: parseDurationMs(String(app?.mp3_duration || '')),
    link: `${BASE}/music/${id}`,
    playUrl,
    downloads,
  }
}

export async function detailGequbao(_id: string): Promise<MusicDetail> {
  throw new Error('歌曲宝音频需在桌面端下载（依赖夸克/百度网盘登录），服务端无法拉取直链')
}
