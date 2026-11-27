/**
 * aac.cx — HTML 搜索 + 人机验证 cookie + 酷我 CDN 直链
 * 优先 plug/down.php（flac/320 Location）；失败则走 play.php 加密链解密（站点同款 AES）。
 * 不走网盘/口令；桌面端经服务端代理，避免渲染进程 CORS。
 */
import { createDecipheriv, createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import http from 'node:http'
import https from 'node:https'
import type { MusicDetail, MusicSearchHit } from './types.js'

const BASE = 'https://www.aac.cx'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const SESSION_TTL_MS = 25 * 60 * 1000
/** play.php url 字段：SHA256(key) → AES-256-ECB（与站点 playen.js decodeUrl 一致） */
const PLAY_URL_KEY = 'SklaBTy1aTSEEtMjAyNg'

const cookieJar = new Map<string, string>()
let sessionReadyAt = 0
let sessionPromise: Promise<void> | null = null

function cookieHeader(): string {
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

function ingestSetCookie(res: IncomingMessage) {
  const raw = res.headers['set-cookie']
  if (!raw) return
  for (const line of Array.isArray(raw) ? raw : [raw]) {
    const part = String(line).split(';')[0] || ''
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    cookieJar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim())
  }
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

function parseDurationMs(text: string): number | undefined {
  const m = text.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return undefined
  return (Number(m[1]) * 60 + Number(m[2])) * 1000
}

type AacRes = {
  status: number
  headers: IncomingMessage['headers']
  body: string
  url: string
}

function aacRequest(
  url: string,
  opts: {
    method?: string
    body?: string
    headers?: Record<string, string>
    /** follow = 跟随跳转并读 body；manual = 不跟随，用于拿 Location */
    redirect?: 'follow' | 'manual'
    timeoutMs?: number
    maxRedirects?: number
  } = {},
): Promise<AacRes> {
  const redirect = opts.redirect || 'follow'
  const timeoutMs = opts.timeoutMs ?? 20_000
  const maxRedirects = opts.maxRedirects ?? 5
  let method = opts.method || 'GET'
  let body = opts.body

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
      const headers: Record<string, string> = {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: `${BASE}/`,
        ...(cookieJar.size ? { Cookie: cookieHeader() } : {}),
        ...(opts.headers || {}),
      }
      if (body != null) {
        headers['Content-Length'] = String(Buffer.byteLength(body))
      } else {
        delete headers['Content-Type']
        delete headers['Content-Length']
      }

      const req = lib.request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || undefined,
          path: parsed.pathname + parsed.search,
          method,
          family: 4,
          headers,
        },
        (res: IncomingMessage) => {
          ingestSetCookie(res)
          const status = res.statusCode || 0
          const loc = res.headers.location
          if (status >= 300 && status < 400 && loc) {
            if (redirect === 'manual') {
              res.resume()
              resolve({ status, headers: res.headers, body: '', url: current })
              return
            }
            if (left > 0) {
              const next = new URL(loc, current).toString()
              res.resume()
              method = 'GET'
              body = undefined
              go(next, left - 1)
              return
            }
          }
          const chunks: Buffer[] = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () => {
            resolve({
              status,
              headers: res.headers,
              body: Buffer.concat(chunks).toString('utf8'),
              url: current,
            })
          })
        },
      )
      req.on('error', reject)
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error('aac.cx 请求超时'))
      })
      if (body != null) req.write(body)
      req.end()
    }
    go(url, maxRedirects)
  })
}

function looksLikeVerifyPage(html: string): boolean {
  return /name=["']csrf_token["']/i.test(html) && /human_check/i.test(html)
}

async function ensureSession(force = false): Promise<void> {
  if (!force && Date.now() - sessionReadyAt < SESSION_TTL_MS && cookieJar.size > 0) {
    return
  }
  if (sessionPromise) return sessionPromise

  sessionPromise = (async () => {
    try {
      if (force) cookieJar.clear()
      const home = await aacRequest(`${BASE}/`)
      const csrf = home.body.match(/name=["']csrf_token["']\s+value=["']([^"']+)["']/i)?.[1]
      if (csrf) {
        await aacRequest(`${BASE}/`, {
          method: 'POST',
          body: new URLSearchParams({ csrf_token: csrf, human_check: 'on' }).toString(),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      }
      sessionReadyAt = Date.now()
    } finally {
      sessionPromise = null
    }
  })()

  return sessionPromise
}

async function aacGetHtml(pathOrUrl: string, retried = false): Promise<string> {
  await ensureSession()
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${BASE}${pathOrUrl}`
  const res = await aacRequest(url)
  if (looksLikeVerifyPage(res.body) && !retried) {
    await ensureSession(true)
    return aacGetHtml(pathOrUrl, true)
  }
  if (res.status >= 400) throw new Error(`aac.cx 返回 ${res.status}`)
  return res.body
}

function absUrl(u: string | null | undefined): string | null {
  const s = (u || '').trim()
  if (!s) return null
  if (s.startsWith('https://')) return s
  if (s.startsWith('http://')) return `https://${s.slice('http://'.length)}`
  if (s.startsWith('//')) return `https:${s}`
  if (s.startsWith('/')) return `${BASE}${s}`
  return s
}

function parseSearchHtml(html: string): MusicSearchHit[] {
  const hits: MusicSearchHit[] = []
  const seen = new Set<string>()

  // 封面块：/mp3/id.html + title + img；时长在同块 playtime
  const blockRe =
    /href="\/mp3\/([A-Za-z0-9]+)\.html"[^>]*title="([^"]*)"[^>]*>[\s\S]{0,600}?<img[^>]+src="([^"]+)"/gi
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(html))) {
    const id = m[1]
    if (seen.has(id)) continue
    seen.add(id)
    const title = decodeHtml(m[2] || '').replace(/\s+/g, ' ').trim()
    let artists = ['未知歌手']
    let name = title || id
    const sep = title.indexOf(' - ')
    if (sep > 0) {
      artists = [title.slice(0, sep).trim() || '未知歌手']
      name = title.slice(sep + 3).trim() || title
    }
    const near = html.slice(m.index, m.index + 900)
    const pt = near.match(/playtime[^>]*>\s*([\d:]+)/i)
    hits.push({
      source: 'aac_cx',
      externalId: id,
      name,
      artists,
      coverUrl: absUrl(m[3]),
      durationMs: pt?.[1] ? parseDurationMs(pt[1]) : undefined,
    })
  }

  // 兜底：仅有 href+title
  if (!hits.length) {
    const simpleRe = /href="\/mp3\/([A-Za-z0-9]+)\.html"[^>]*title="([^"]*)"/gi
    while ((m = simpleRe.exec(html))) {
      const id = m[1]
      if (seen.has(id)) continue
      seen.add(id)
      const title = decodeHtml(m[2] || '').replace(/\s+/g, ' ').trim()
      let artists = ['未知歌手']
      let name = title || id
      const sep = title.indexOf(' - ')
      if (sep > 0) {
        artists = [title.slice(0, sep).trim() || '未知歌手']
        name = title.slice(sep + 3).trim() || title
      }
      hits.push({ source: 'aac_cx', externalId: id, name, artists })
    }
  }

  return hits
}

function parseSongMeta(html: string): {
  name?: string
  artists?: string[]
  coverUrl?: string | null
} {
  const h1 =
    html.match(/class=["']djname["'][^>]*>\s*<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const h1Text = h1 ? decodeHtml(h1[1].replace(/<[^>]+>/g, '')).trim() : ''
  let name: string | undefined
  let artists: string[] | undefined
  if (h1Text) {
    const sep = h1Text.indexOf(' - ')
    if (sep > 0) {
      artists = [h1Text.slice(0, sep).trim() || '未知歌手']
      name = h1Text.slice(sep + 3).trim() || h1Text
    } else {
      name = h1Text
    }
  }
  const artist =
    html.match(/class=["']play_singer["'][\s\S]{0,800}?href="\/singer\/[^"]*"[^>]*>([^<]+)</i) ||
    html.match(/href="\/singer\/[^"]*"[^>]*title="([^"]+)"/i)
  if (artist?.[1]?.trim()) artists = [decodeHtml(artist[1].trim())]
  const cover =
    html.match(/class=["']play_singer["'][\s\S]{0,500}?<img[^>]+src=["']([^"']+)["']/i) ||
    html.match(/id=["']mcover["'][\s\S]{0,400}?src=["']([^"']+)["']/i) ||
    html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i)
  return { name, artists, coverUrl: absUrl(cover?.[1]) }
}

function decodePlayUrl(hex: string): string {
  const raw = String(hex || '').trim()
  if (!/^[0-9a-fA-F]+$/.test(raw) || raw.length < 32 || raw.length % 2 !== 0) return ''
  try {
    const key = createHash('sha256').update(PLAY_URL_KEY).digest()
    const decipher = createDecipheriv('aes-256-ecb', key, null)
    decipher.setAutoPadding(true)
    const out = Buffer.concat([decipher.update(Buffer.from(raw, 'hex')), decipher.final()]).toString(
      'utf8',
    )
    const url = out.trim()
    if (!/^https?:\/\//i.test(url)) return ''
    return url
  } catch {
    return ''
  }
}

type PlayMeta = {
  musicUrl?: string
  coverUrl?: string | null
  lkid?: string
}

/** 站内试听接口：返回加密 url，解密后为酷我 CDN（部分曲无 flac 直链时仍可用） */
async function resolveViaPlayPhp(id: string, retried = false): Promise<PlayMeta> {
  await ensureSession()
  const res = await aacRequest(`${BASE}/js/play.php`, {
    method: 'POST',
    body: new URLSearchParams({ id, type: 'music' }).toString(),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: BASE,
      Referer: `${BASE}/mp3/${id}.html`,
    },
    timeoutMs: 15_000,
  })
  if (looksLikeVerifyPage(res.body) && !retried) {
    await ensureSession(true)
    return resolveViaPlayPhp(id, true)
  }
  let json: { msg?: number; url?: string; pic?: string; lkid?: number | string; error?: string }
  try {
    json = JSON.parse(res.body) as typeof json
  } catch {
    throw new Error('aac.cx 播放接口返回异常')
  }
  if (Number(json.msg) !== 1 || !json.url) {
    throw new Error(String(json.error || '').trim() || 'aac.cx 未返回播放地址')
  }
  const musicUrl = decodePlayUrl(String(json.url))
  if (!musicUrl) throw new Error('aac.cx 播放地址解密失败')
  return {
    musicUrl,
    coverUrl: absUrl(json.pic),
    lkid: json.lkid != null ? String(json.lkid) : undefined,
  }
}

/** 只拿 Location，不下载音频 body */
async function resolveDownloadLocation(
  id: string,
  quality: 'flac' | '320',
  retried = false,
): Promise<{ url: string | null; quotaExhausted?: boolean }> {
  await ensureSession()
  const url = `${BASE}/plug/down.php?ac=music&id=${encodeURIComponent(id)}&k=${quality}`
  const res = await aacRequest(url, { redirect: 'manual', timeoutMs: 15_000 })
  if (looksLikeVerifyPage(res.body) && !retried) {
    await ensureSession(true)
    return resolveDownloadLocation(id, quality, true)
  }
  const loc = res.headers.location
  if (res.status >= 300 && res.status < 400 && loc) {
    return { url: new URL(String(loc), BASE).toString() }
  }
  if (/下载次数已用完|次数用完/i.test(res.body)) {
    return { url: null, quotaExhausted: true }
  }
  return { url: null }
}

async function fetchLyricText(id: string): Promise<string | null> {
  try {
    await ensureSession()
    const url = `${BASE}/plug/down.php?ac=music&id=${encodeURIComponent(id)}&lk=lrc`
    const res = await aacRequest(url, { timeoutMs: 12_000, maxRedirects: 3 })
    let text = res.body.trim()
    if (!text || looksLikeVerifyPage(text) || text.startsWith('<')) return null
    // 去掉站内欢迎行
    text = text.replace(/^\[00:00\.00\]欢迎来访[^\n]*\r?\n?/u, '').trim()
    if (!/\[\d{1,2}:\d{2}/.test(text)) return null
    return text
  } catch {
    return null
  }
}

export async function searchAacCx(keyword: string, num = 20): Promise<MusicSearchHit[]> {
  const kw = keyword.trim()
  if (!kw) return []
  const path = `/so/${encodeURIComponent(kw)}.html`
  const html = await aacGetHtml(path)
  if (/未找到|没有找到|暂无结果/i.test(html) && !/\/mp3\/[A-Za-z0-9]+\.html/.test(html)) {
    return []
  }
  const hits = parseSearchHtml(html)
  return hits.slice(0, Math.max(1, Math.min(50, num)))
}

export async function detailAacCx(externalId: string): Promise<MusicDetail> {
  const id = String(externalId || '').trim()
  if (!id) throw new Error('缺少 aac.cx 曲目 id')

  let meta: { name?: string; artists?: string[]; coverUrl?: string | null } = {}
  try {
    const html = await aacGetHtml(`/mp3/${encodeURIComponent(id)}.html`)
    meta = parseSongMeta(html)
  } catch {
    /* 详情页失败仍可尝试直链 */
  }

  let musicUrl: string | null = null
  let quality: string | null = null

  const flac = await resolveDownloadLocation(id, 'flac')
  if (flac.url) {
    musicUrl = flac.url
    quality = 'flac'
  } else {
    const mp3 = await resolveDownloadLocation(id, '320')
    if (mp3.url) {
      musicUrl = mp3.url
      quality = '320'
    }
  }

  // 部分曲目无 flac/320 配额或仅提供试听链：回退 play.php
  if (!musicUrl) {
    const play = await resolveViaPlayPhp(id)
    musicUrl = play.musicUrl || null
    if (!meta.coverUrl && play.coverUrl) meta.coverUrl = play.coverUrl
    quality = musicUrl && /\.flac(\?|$)/i.test(musicUrl) ? 'flac' : '128'
  }

  if (!musicUrl) throw new Error('aac.cx 未返回播放地址')

  // FLAC 参数有时仍跳到 aac/m4a
  const lower = musicUrl.toLowerCase()
  if (quality === 'flac' && !/\.flac(\?|$)/i.test(lower)) {
    if (/\.(mp3|m4a|aac)(\?|$)/i.test(lower)) quality = /m4a|aac/.test(lower) ? '128' : '320'
    else quality = null
  }

  const lyricText = await fetchLyricText(id)

  return {
    source: 'aac_cx',
    externalId: id,
    name: meta.name,
    artists: meta.artists,
    musicUrl,
    coverUrl: meta.coverUrl || null,
    lyricText,
    link: `${BASE}/mp3/${id}.html`,
    quality,
  }
}
