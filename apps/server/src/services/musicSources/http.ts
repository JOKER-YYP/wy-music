import type { IncomingMessage } from 'node:http'
import https from 'node:https'
import http from 'node:http'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

export function requestText(
  url: string,
  opts: { headers?: Record<string, string>; maxRedirects?: number; timeoutMs?: number } = {},
): Promise<{ url: string; body: string; status: number }> {
  const maxRedirects = opts.maxRedirects ?? 5
  const timeoutMs = opts.timeoutMs ?? 15000
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
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error('请求超时'))
      })
    }
    go(url, maxRedirects)
  })
}

export async function requestJson<T = unknown>(
  url: string,
  headers?: Record<string, string>,
): Promise<T> {
  const { body, status } = await requestText(url, { headers })
  if (status >= 400) {
    throw new Error(`外部接口返回 ${status}`)
  }
  const trimmed = body.trim()
  if (!trimmed) throw new Error('外部接口返回为空')
  try {
    return JSON.parse(trimmed) as T
  } catch {
    throw new Error(`外部接口非 JSON：${trimmed.slice(0, 80)}`)
  }
}

/** application/x-www-form-urlencoded POST（xm95522 等） */
export function requestFormPost(
  url: string,
  form: Record<string, string | number>,
  opts: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<{ body: string; status: number }> {
  const timeoutMs = opts.timeoutMs ?? 30_000
  const body = new URLSearchParams(
    Object.fromEntries(Object.entries(form).map(([k, v]) => [k, String(v)])),
  ).toString()

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
          Referer: url,
          ...(opts.headers || {}),
        },
      },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        })
      },
    )
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('请求超时'))
    })
    req.write(body)
    req.end()
  })
}

export async function requestFormJson<T = unknown>(
  url: string,
  form: Record<string, string | number>,
  opts?: { headers?: Record<string, string>; timeoutMs?: number },
): Promise<T> {
  const { body, status } = await requestFormPost(url, form, opts)
  if (status >= 400) throw new Error(`外部接口返回 ${status}`)
  const trimmed = body.trim()
  if (!trimmed) throw new Error('外部接口返回为空')
  try {
    return JSON.parse(trimmed) as T
  } catch {
    throw new Error(`外部接口非 JSON：${trimmed.slice(0, 80)}`)
  }
}

export function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (Array.isArray(o.data)) return o.data
    if (Array.isArray(o.list)) return o.list
    if (Array.isArray(o.result)) return o.result
  }
  return []
}

export function pickStr(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return ''
}
