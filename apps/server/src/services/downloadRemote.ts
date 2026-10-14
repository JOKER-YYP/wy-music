import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'
import type { IncomingMessage } from 'node:http'
import { config } from '../config.js'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

export function guessAudioExt(url: string, contentType?: string): string {
  const ct = (contentType || '').toLowerCase()
  if (ct.includes('flac')) return '.flac'
  if (ct.includes('wav')) return '.wav'
  if (ct.includes('aac')) return '.aac'
  if (ct.includes('mp4') || ct.includes('m4a')) return '.m4a'
  if (ct.includes('mpeg') || ct.includes('mp3')) return '.mp3'
  const clean = url.split('?')[0].toLowerCase()
  const m = clean.match(/\.(mp3|flac|wav|m4a|aac)(?:$|\/)/)
  if (m) return `.${m[1]}`
  return '.mp3'
}

export function guessImageExt(url: string, contentType?: string): string {
  const ct = (contentType || '').toLowerCase()
  if (ct.includes('png')) return '.png'
  if (ct.includes('webp')) return '.webp'
  if (ct.includes('gif')) return '.gif'
  const clean = url.split('?')[0].toLowerCase()
  if (clean.endsWith('.png')) return '.png'
  if (clean.endsWith('.webp')) return '.webp'
  return '.jpg'
}

export async function downloadToFile(
  url: string,
  destAbs: string,
  opts: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<{ bytes: number; contentType: string }> {
  const maxBytes = opts.maxBytes ?? config.uploadMaxSizeMb * 1024 * 1024
  const timeoutMs = opts.timeoutMs ?? 120_000
  const maxRedirects = 5

  return new Promise((resolve, reject) => {
    const go = (current: string, left: number) => {
      let parsed: URL
      try {
        parsed = new URL(current)
      } catch (e) {
        reject(e)
        return
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        reject(new Error('仅支持 http/https 下载'))
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
          rejectUnauthorized: false,
          headers: {
            'User-Agent': UA,
            Accept: '*/*',
            Referer: `${parsed.protocol}//${parsed.host}/`,
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
          if (status >= 400) {
            res.resume()
            reject(new Error(`下载失败 HTTP ${status}`))
            return
          }
          const contentType = String(res.headers['content-type'] || '')
          fs.mkdirSync(path.dirname(destAbs), { recursive: true })
          const ws = fs.createWriteStream(destAbs)
          let bytes = 0
          let settled = false
          const fail = (err: Error) => {
            if (settled) return
            settled = true
            res.destroy()
            ws.destroy()
            try {
              if (fs.existsSync(destAbs)) fs.unlinkSync(destAbs)
            } catch {
              /* ignore */
            }
            reject(err)
          }
          res.on('data', (chunk: Buffer) => {
            bytes += chunk.length
            if (bytes > maxBytes) {
              fail(new Error(`文件过大，超过 ${config.uploadMaxSizeMb}MB`))
            }
          })
          res.pipe(ws)
          ws.on('finish', () => {
            if (settled) return
            settled = true
            if (bytes <= 0) {
              try {
                fs.unlinkSync(destAbs)
              } catch {
                /* ignore */
              }
              reject(new Error('下载内容为空'))
              return
            }
            resolve({ bytes, contentType })
          })
          ws.on('error', fail)
          res.on('error', fail)
        },
      )
      req.on('error', reject)
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error('下载超时'))
      })
    }
    go(url, maxRedirects)
  })
}
