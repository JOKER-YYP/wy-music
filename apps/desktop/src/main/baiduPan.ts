/**
 * 百度网盘：登录会话 + 分享链接解析直链（对齐夸克方案 C）
 * 流程：登录 Cookie → 校验提取码 → 文件列表 → sharedownload / 转存后取 dlink
 */
import { BrowserWindow, net, session, type DownloadItem } from 'electron'
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'fs'
import http from 'http'
import https from 'https'
import { dirname } from 'path'
import { pipeline } from 'stream/promises'
import type { IncomingMessage } from 'http'

const BAIDU_PARTITION = 'persist:wy-baidu'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const APP_ID = '250528'

type BaiduJson = {
  errno?: number
  err_msg?: string
  show_msg?: string
  message?: string
  randsk?: string
  [k: string]: any
}

function baiduSession() {
  return session.fromPartition(BAIDU_PARTITION)
}

async function getBaiduCookieHeader(): Promise<string> {
  const ses = baiduSession()
  const map = new Map<string, string>()
  for (const url of ['https://pan.baidu.com/', 'https://pcs.baidu.com/']) {
    try {
      for (const c of await ses.cookies.get({ url })) {
        if (c.name) map.set(c.name, c.value)
      }
    } catch {
      /* ignore */
    }
  }
  try {
    for (const c of await ses.cookies.get({})) {
      if (/baidu\.com/i.test(String(c.domain || '')) && c.name) {
        map.set(c.name, c.value)
      }
    }
  } catch {
    /* ignore */
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

function baiduRequest(
  url: string,
  opts?: {
    method?: string
    form?: Record<string, string>
    headers?: Record<string, string>
    /** 拉分享页 HTML 时用浏览器导航头，避免拿到非页面响应 */
    html?: boolean
  },
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  const method = opts?.method || 'GET'
  const formBody = opts?.form
    ? new URLSearchParams(opts.form).toString()
    : ''
  return new Promise((resolve, reject) => {
    // 必须 follow：manual 未调用 followRedirect 会直接报 Redirect was cancelled
    const req = net.request({
      method,
      url,
      session: baiduSession(),
      useSessionCookies: true,
      redirect: 'follow',
    })
    req.setHeader('User-Agent', UA)
    req.setHeader('Accept-Language', 'zh-CN,zh;q=0.9')
    if (opts?.html) {
      req.setHeader(
        'Accept',
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      )
      req.setHeader('Referer', 'https://pan.baidu.com/')
    } else {
      req.setHeader('Accept', 'application/json, text/plain, */*')
      req.setHeader('Origin', 'https://pan.baidu.com')
      req.setHeader('Referer', 'https://pan.baidu.com/disk/main')
    }
    if (opts?.headers) {
      for (const [k, v] of Object.entries(opts.headers)) req.setHeader(k, v)
    }
    void getBaiduCookieHeader().then((cookie) => {
      if (cookie) {
        try {
          req.setHeader('Cookie', cookie)
        } catch {
          /* ignore */
        }
      }
      if (formBody) {
        req.setHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8')
      }
      req.on('response', (res: IncomingMessage) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers as Record<string, string | string[] | undefined>,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        })
        res.on('error', reject)
      })
      req.on('error', reject)
      if (formBody) req.write(formBody)
      req.end()
    })
  })
}

async function baiduFetchJson(
  url: string,
  opts?: {
    method?: string
    form?: Record<string, string>
    headers?: Record<string, string>
  },
): Promise<BaiduJson> {
  const res = await baiduRequest(url, opts)
  try {
    return JSON.parse(res.body) as BaiduJson
  } catch {
    throw new Error(`百度接口非 JSON（HTTP ${res.status}）`)
  }
}

function isBaiduLoginCookie(c: { name: string; value: string }) {
  const n = c.name.toUpperCase()
  return (n === 'BDUSS' || n === 'BDUSS_BFESS') && String(c.value || '').trim().length > 10
}

async function hasBaiduLoginCookie(): Promise<boolean> {
  const all = await baiduSession().cookies.get({})
  return all.some((c) => /baidu\.com/i.test(String(c.domain || '')) && isBaiduLoginCookie(c))
}

/** 用需登录接口校验 */
async function verifyBaiduLoginApi(): Promise<boolean> {
  if (!(await hasBaiduLoginCookie())) return false
  try {
    const j = await baiduFetchJson(
      `https://pan.baidu.com/api/loginStatus?clienttype=0&app_id=${APP_ID}&web=1`,
    )
    if (j.errno === 0 && (j.login_info || j.logininfo || j.uk || j.uid)) return true
    // 兼容字段
    if (j.errno === 0 && j.login_info?.uk) return true
  } catch {
    /* ignore */
  }
  try {
    const j = await baiduFetchJson(
      `https://pan.baidu.com/api/user/getinfo?clienttype=0&app_id=${APP_ID}&web=1`,
    )
    if (j.errno === 0) return true
  } catch {
    /* ignore */
  }
  return false
}

export async function hasBaiduLogin(): Promise<boolean> {
  return verifyBaiduLoginApi()
}

let loginWin: BrowserWindow | null = null
let loginWaiters: Array<(ok: boolean) => void> = []

function settleLoginWaiters(ok: boolean) {
  const waiters = loginWaiters
  loginWaiters = []
  for (const w of waiters) w(ok)
}

function broadcastBaiduLogin(ok: boolean) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      try {
        win.webContents.send('baidu:loginChanged', ok)
      } catch {
        /* ignore */
      }
    }
  }
}

export function openBaiduLoginWindow(parent?: BrowserWindow | null): Promise<boolean> {
  return new Promise((resolve) => {
    loginWaiters.push(resolve)
    if (loginWin && !loginWin.isDestroyed()) {
      loginWin.focus()
      return
    }
    const win = new BrowserWindow({
      width: 1000,
      height: 720,
      parent: parent && !parent.isDestroyed() ? parent : undefined,
      modal: false,
      title: '登录百度网盘（可用扫码）',
      webPreferences: {
        partition: BAIDU_PARTITION,
        nodeIntegration: false,
        contextIsolation: true,
      },
    })
    loginWin = win
    let settled = false
    let pollTimer: ReturnType<typeof setInterval> | null = null
    const finish = async () => {
      if (settled) return
      settled = true
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = null
      const ok = await hasBaiduLogin()
      if (loginWin === win) loginWin = null
      broadcastBaiduLogin(ok)
      settleLoginWaiters(ok)
    }
    win.webContents.once('did-finish-load', () => {
      if (settled) return
      pollTimer = setInterval(() => {
        void (async () => {
          if (settled) return
          if (!(await hasBaiduLoginCookie())) return
          if (!(await verifyBaiduLoginApi())) return
          if (!win.isDestroyed()) win.close()
        })()
      }, 1500)
    })
    win.on('closed', () => {
      void finish()
    })
    void win.loadURL('https://pan.baidu.com/')
  })
}

export async function ensureBaiduLogin(parent?: BrowserWindow | null): Promise<boolean> {
  if (await verifyBaiduLoginApi()) return true
  return openBaiduLoginWindow(parent)
}

export async function logoutBaidu(): Promise<boolean> {
  if (loginWin && !loginWin.isDestroyed()) {
    try {
      loginWin.close()
    } catch {
      /* ignore */
    }
    loginWin = null
  }
  const ses = baiduSession()
  const all = await ses.cookies.get({})
  const baiduCookies = all.filter((c) => /baidu\.com/i.test(String(c.domain || '')))
  await Promise.all(
    baiduCookies.map(async (c) => {
      const domain = String(c.domain || '').replace(/^\./, '')
      const path = c.path || '/'
      const url = `https://${domain}${path.startsWith('/') ? path : `/${path}`}`
      try {
        await ses.cookies.remove(url, c.name)
      } catch {
        /* ignore */
      }
    }),
  )
  try {
    await ses.clearStorageData({
      storages: ['cookies', 'localstorage', 'indexdb', 'shadercache', 'serviceworkers'],
    })
  } catch {
    /* ignore */
  }
  broadcastBaiduLogin(false)
  return !(await hasBaiduLoginCookie())
}

export function parseBaiduShareUrl(shareUrl: string): {
  /** 打开分享页用：带前导 1，如 1xxxx */
  surl: string
  /** verify 接口用：去掉前导 1 */
  surlKey: string
  pwd: string
} {
  const raw = String(shareUrl || '').trim()
  let surl = ''
  const m1 = raw.match(/[?&#]surl=([A-Za-z0-9_-]+)/i)
  if (m1) surl = m1[1].startsWith('1') ? m1[1] : `1${m1[1]}`
  if (!surl) {
    const m2 = raw.match(/pan\.baidu\.com\/s\/(1[A-Za-z0-9_-]+)/i)
    if (m2) surl = m2[1]
  }
  if (!surl) {
    const m3 = raw.match(/pan\.baidu\.com\/share\/init\?surl=([A-Za-z0-9_-]+)/i)
    if (m3) surl = m3[1].startsWith('1') ? m3[1] : `1${m3[1]}`
  }
  if (!surl) throw new Error('不是有效的百度分享链接')

  let pwd = ''
  const pwdQ = raw.match(/[?&#]pwd=([^&#\s]+)/i)
  if (pwdQ) pwd = decodeURIComponent(pwdQ[1]).trim()
  else {
    const pwdHash = raw.match(/#(?:pwd=)?([a-zA-Z0-9]{4})(?:$|&)/)
    if (pwdHash) pwd = pwdHash[1]
    else {
      // 兼容文案：「提取码：bcmu」夹在链接旁
      const pwdText = raw.match(/提取码[：:\s]*([a-zA-Z0-9]{4})/i)
      if (pwdText) pwd = pwdText[1]
    }
  }
  const surlKey = surl.startsWith('1') ? surl.slice(1) : surl
  return { surl, surlKey, pwd }
}

async function setBdclndCookie(randsk: string) {
  const ses = baiduSession()
  // verify 返回的 randsk 已是 Cookie 字面量（含 %2B 等），不要 decode/再 encode
  const value = String(randsk || '').trim()
  if (!value) return
  // 不显式写 domain，交给 url 推导，避免 Electron 写入后匹配失败
  await ses.cookies.set({
    url: 'https://pan.baidu.com/',
    name: 'BDCLND',
    value,
    path: '/',
  })
}

async function verifyShare(surl: string, surlKey: string, pwd: string): Promise<string> {
  if (pwd) {
    const j = await baiduFetchJson(
      `https://pan.baidu.com/share/verify?channel=chunlei&clienttype=0&web=1&app_id=${APP_ID}&surl=${encodeURIComponent(surlKey)}`,
      {
        method: 'POST',
        form: { pwd: pwd.trim(), vcode: '', vcode_str: '' },
        headers: {
          Referer: `https://pan.baidu.com/share/init?surl=${encodeURIComponent(surlKey)}`,
        },
      },
    )
    if (j.errno !== 0 || !j.randsk) {
      const hint =
        j.errno === -12 || j.errno === 13003
          ? '提取码错误'
          : j.errno === 105
            ? '分享参数无效'
            : j.show_msg || j.err_msg || '百度分享提取码校验失败'
      throw new Error(`${hint}${j.errno != null ? `（errno=${j.errno}）` : ''}`)
    }
    await setBdclndCookie(String(j.randsk))
    return String(j.randsk)
  }
  // 无提取码：打开分享页拿 BDCLND
  const page = await baiduRequest(`https://pan.baidu.com/s/${encodeURIComponent(surl)}`)
  const setCookie = page.headers['set-cookie']
  const cookieStr = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie || '')
  const m = cookieStr.match(/BDCLND=([^;]+)/i)
  if (m) {
    await setBdclndCookie(m[1])
    return m[1]
  }
  // 已登录且公开分享也可能没有 BDCLND，继续用空 sekey
  return ''
}

type ShareFile = {
  fs_id: number | string
  server_filename: string
  isdir: number
  size: number
  path: string
}

type YunData = {
  shareid: number | string
  /** 分享者 uk（页面里常在 share_uk；uk 字段是当前登录用户，未登录时为 0） */
  uk: number | string
  bdstoken?: string
  sign?: string
  timestamp?: number | string
  file_list?: { list?: ShareFile[] } | ShareFile[]
}

function extractJsonObjectAfter(html: string, marker: string): string | null {
  const i = html.indexOf(marker)
  if (i < 0) return null
  const start = html.indexOf('{', i + marker.length)
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let p = start; p < html.length; p++) {
    const ch = html[p]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return html.slice(start, p + 1)
    }
  }
  return null
}

function pickShareUk(data: Record<string, any>): string | null {
  const v = data.share_uk ?? data.shareuk ?? data.uk
  if (v == null || v === '' || v === 0 || v === '0') return null
  return String(v)
}

function yunFromLocals(data: Record<string, any>): YunData | null {
  const shareid = data.shareid ?? data.share_id
  const uk = pickShareUk(data)
  if (shareid == null || !uk) return null
  return {
    shareid,
    uk,
    bdstoken: data.bdstoken ? String(data.bdstoken) : undefined,
    sign: data.sign ? String(data.sign) : undefined,
    timestamp: data.timestamp,
    file_list: data.file_list,
  }
}

function yunFromHtmlRegex(html: string): YunData | null {
  const shareid =
    html.match(/"shareid"\s*:\s*"?(\d+)"?/)?.[1] ||
    html.match(/shareid\s*:\s*"(\d+)"/)?.[1] ||
    html.match(/shareid\s*=\s*"(\d+)"/)?.[1]
  const uk =
    html.match(/"share_uk"\s*:\s*"?(\d+)"?/)?.[1] ||
    html.match(/share_uk\s*:\s*"(\d+)"/)?.[1] ||
    html.match(/share_uk\s*=\s*"(\d+)"/)?.[1]
  if (!shareid || !uk || uk === '0') return null
  return { shareid, uk }
}

async function getYunData(surl: string, surlKey: string): Promise<YunData> {
  const urls = [
    `https://pan.baidu.com/s/${surl}`,
    `https://pan.baidu.com/share/init?surl=${encodeURIComponent(surlKey)}`,
  ]
  let lastTitle = ''
  let lastLen = 0
  for (const url of urls) {
    const page = await baiduRequest(url, {
      html: true,
      headers: { Referer: `https://pan.baidu.com/share/init?surl=${encodeURIComponent(surlKey)}` },
    })
    const html = page.body || ''
    lastLen = html.length
    lastTitle = (html.match(/<title>([^<]+)/i)?.[1] || '').trim()

    const raw =
      extractJsonObjectAfter(html, 'locals.mset(') ||
      extractJsonObjectAfter(html, 'yunData.setData(')
    if (raw) {
      try {
        const parsed = yunFromLocals(JSON.parse(raw) as Record<string, any>)
        if (parsed) return parsed
      } catch {
        /* 继续其它策略 */
      }
    }
    const fromRe = yunFromHtmlRegex(html)
    if (fromRe) return fromRe
  }

  if (/请输入提取码/.test(lastTitle)) {
    throw new Error('百度提取码未生效，请重新登录后再试')
  }
  throw new Error(
    `读取百度分享页失败（可能链接失效或需提取码）${lastTitle ? `：${lastTitle}` : ''}${lastLen ? ` len=${lastLen}` : ''}`,
  )
}

async function listShareFiles(
  shareid: string | number,
  uk: string | number,
  dir?: string,
): Promise<ShareFile[]> {
  const root = dir ? 0 : 1
  const dirQ = dir ? `&dir=${encodeURIComponent(dir)}` : ''
  const url =
    `https://pan.baidu.com/share/list?app_id=${APP_ID}&channel=chunlei&clienttype=0&desc=0` +
    `&num=100&order=name&page=1&root=${root}&shareid=${encodeURIComponent(String(shareid))}` +
    `&showempty=0&uk=${encodeURIComponent(String(uk))}${dirQ}&web=1`
  const j = await baiduFetchJson(url)
  if (j.errno !== 0) throw new Error(j.show_msg || j.err_msg || '读取百度分享文件列表失败')
  return Array.isArray(j.list) ? (j.list as ShareFile[]) : []
}

function pickAudioFile(files: ShareFile[]): ShareFile {
  const audio = files.filter(
    (f) => Number(f.isdir) !== 1 && /\.(mp3|flac|wav|m4a|aac)$/i.test(String(f.server_filename || '')),
  )
  const pool = audio.length ? audio : files.filter((f) => Number(f.isdir) !== 1)
  if (!pool.length) throw new Error('百度分享内没有可下载的音频文件')
  // 网页端 Chrome 下载上限约 50MB，优先 MP3 且尽量不超过上限
  const LIMIT = 50 * 1024 * 1024
  const score = (f: ShareFile) => {
    const n = String(f.server_filename || '').toLowerCase()
    const size = Number(f.size || 0)
    let s = 0
    if (n.endsWith('.mp3')) s += 40
    else if (n.endsWith('.flac')) s += 20
    else if (n.endsWith('.m4a') || n.endsWith('.wav')) s += 10
    if (size > 0 && size <= LIMIT) s += 30
    else if (size > LIMIT) s -= 20
    return s
  }
  pool.sort((a, b) => score(b) - score(a) || Number(a.size || 0) - Number(b.size || 0))
  return pool[0]
}

async function getBaiduLogid(): Promise<string> {
  try {
    const all = await baiduSession().cookies.get({ url: 'https://pan.baidu.com/' })
    const baiduid = all.find((c) => c.name === 'BAIDUID')?.value
    if (baiduid) return Buffer.from(baiduid).toString('base64')
  } catch {
    /* ignore */
  }
  return Buffer.from(`wy-${Date.now()}`).toString('base64')
}

async function getBdstoken(): Promise<string> {
  const j = await baiduFetchJson(
    `https://pan.baidu.com/api/gettemplatevariable?clienttype=0&app_id=${APP_ID}&web=1` +
      `&fields=${encodeURIComponent('["bdstoken","token","uk","isdocuser","servertime"]')}`,
  )
  const token = j.result?.bdstoken || j.bdstoken
  if (!token) throw new Error('获取百度 bdstoken 失败（请重新登录）')
  return String(token)
}

async function getShareSign(
  /** 网页 tplconfig 的 surl：带前导 1，如 18dX-... */
  surl: string,
  bdstoken: string,
): Promise<{ sign: string; timestamp: string }> {
  const logid = await getBaiduLogid()
  const j = await baiduFetchJson(
    `https://pan.baidu.com/share/tplconfig?surl=${encodeURIComponent(surl)}` +
      `&fields=sign,timestamp,jsToken&view_mode=1&channel=chunlei&web=1&app_id=${APP_ID}` +
      `&bdstoken=${encodeURIComponent(bdstoken)}&logid=${encodeURIComponent(logid)}&clienttype=0`,
    {
      headers: {
        Referer: `https://pan.baidu.com/s/${surl}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
    },
  )
  if (j.errno !== 0 || !j.data?.sign) {
    throw new Error(j.show_msg || `获取百度分享签名失败 errno=${j.errno}`)
  }
  return { sign: String(j.data.sign), timestamp: String(j.data.timestamp || '') }
}

/** 对齐网页端点击「下载」：/api/sharedownload */
async function sharedownload(opts: {
  fsId: string | number
  shareId: string | number
  uk: string | number
  randsk: string
  sign: string
  timestamp: string
  bdstoken: string
  /** 带前导 1 的短链，用于 Referer */
  surl: string
}): Promise<string> {
  const logid = await getBaiduLogid()
  let sekey = String(opts.randsk || '')
  try {
    sekey = decodeURIComponent(sekey)
  } catch {
    /* keep raw */
  }
  const url =
    `https://pan.baidu.com/api/sharedownload?sign=${encodeURIComponent(opts.sign)}` +
    `&timestamp=${encodeURIComponent(opts.timestamp)}&channel=chunlei&web=1&app_id=${APP_ID}` +
    `&bdstoken=${encodeURIComponent(opts.bdstoken)}&logid=${encodeURIComponent(logid)}&clienttype=0`
  const j = await baiduFetchJson(url, {
    method: 'POST',
    headers: {
      Referer: `https://pan.baidu.com/s/${opts.surl}`,
      Origin: 'https://pan.baidu.com',
      'X-Requested-With': 'XMLHttpRequest',
    },
    form: {
      encrypt: '0',
      type: 'dlink',
      product: 'share',
      uk: String(opts.uk),
      primaryid: String(opts.shareId),
      // 网页端是字符串数组：["1104..."]
      fid_list: JSON.stringify([String(opts.fsId)]),
      extra: JSON.stringify({ sekey }),
      vip: '0',
    },
  })
  if (j.errno !== 0 || !Array.isArray(j.list) || !j.list[0]?.dlink) {
    throw new Error(j.show_msg || j.err_msg || `百度分享直链失败 errno=${j.errno}`)
  }
  return String(j.list[0].dlink)
}

type TransferResult = { fsId?: string; path?: string }

async function ensureBaiduDir(dirPath: string, bdstoken: string) {
  await baiduFetchJson(
    `https://pan.baidu.com/api/create?a=commit&channel=chunlei&web=1&app_id=${APP_ID}` +
      `&clienttype=0&bdstoken=${encodeURIComponent(bdstoken)}`,
    {
      method: 'POST',
      form: {
        path: dirPath,
        isdir: '1',
        block_list: '[]',
      },
    },
  )
}

function parseTransferResult(j: BaiduJson, toPath: string, fileName?: string): TransferResult {
  const extraItem = j.extra?.list?.[0]
  const infoItem = Array.isArray(j.info) ? j.info[0] : null
  const fsId = String(
    extraItem?.to_fs_id ||
      extraItem?.fs_id ||
      infoItem?.to_fs_id ||
      infoItem?.fs_id ||
      j.fsid_list?.[0] ||
      '',
  ).trim()
  let path = String(extraItem?.to || extraItem?.path || infoItem?.path || '').trim()
  if (path && !path.startsWith('/')) path = `${toPath.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
  if (!path && fileName) path = `${toPath.replace(/\/$/, '')}/${fileName}`
  return {
    fsId: fsId && fsId !== '0' ? fsId : undefined,
    path: path || undefined,
  }
}

async function transferShare(
  opts: {
    shareId: string | number
    uk: string | number
    fsId: string | number
    bdstoken: string
    fileName?: string
    path?: string
  },
  retried = false,
): Promise<TransferResult> {
  const toPath = opts.path || '/WY Music'
  const url =
    `https://pan.baidu.com/share/transfer?shareid=${encodeURIComponent(String(opts.shareId))}` +
    `&from=${encodeURIComponent(String(opts.uk))}&bdstoken=${encodeURIComponent(opts.bdstoken)}` +
    `&channel=chunlei&web=1&app_id=${APP_ID}&clienttype=0&ondup=newcopy`
  const j = await baiduFetchJson(url, {
    method: 'POST',
    form: {
      fsidlist: `[${opts.fsId}]`,
      path: toPath,
    },
  })
  // 2=目录不存在；-9/12=已存在等，仍可能带路径信息
  if (j.errno === 2 && !retried) {
    await ensureBaiduDir(toPath, opts.bdstoken)
    return transferShare(opts, true)
  }
  if (j.errno !== 0 && j.errno !== -9 && j.errno !== 12) {
    throw new Error(j.show_msg || j.err_msg || `百度转存失败 errno=${j.errno}`)
  }
  const parsed = parseTransferResult(j, toPath, opts.fileName)
  if (parsed.fsId || parsed.path) return parsed
  // 已存在但没返回 id：按目录+文件名回查
  if (opts.fileName) {
    const hit = await findOwnedFileByName(toPath, opts.fileName)
    if (hit) return hit
  }
  throw new Error(j.show_msg || j.err_msg || `百度转存未返回文件信息 errno=${j.errno}`)
}

async function findOwnedFileByName(dirPath: string, fileName: string): Promise<TransferResult | null> {
  const j = await baiduFetchJson(
    `https://pan.baidu.com/api/list?dir=${encodeURIComponent(dirPath)}` +
      `&order=time&desc=1&showempty=0&web=1&page=1&num=100&channel=chunlei&app_id=${APP_ID}&clienttype=0`,
  )
  if (j.errno !== 0 || !Array.isArray(j.list)) return null
  const name = fileName.toLowerCase()
  const hit = (j.list as any[]).find(
    (f) => String(f.server_filename || f.filename || '').toLowerCase() === name,
  )
  if (!hit) return null
  return {
    fsId: hit.fs_id != null ? String(hit.fs_id) : undefined,
    path: hit.path ? String(hit.path) : `${dirPath.replace(/\/$/, '')}/${fileName}`,
  }
}

function pickDlinkFromMeta(j: BaiduJson): string | null {
  const rows = (Array.isArray(j.list) ? j.list : Array.isArray(j.info) ? j.info : []) as any[]
  const dlink = rows[0]?.dlink
  return dlink ? String(dlink) : null
}

function normalizePcsUrl(raw: string): string {
  const s = String(raw || '').trim()
  if (!s) return s
  if (s.startsWith('http://')) return `https://${s.slice('http://'.length)}`
  if (s.startsWith('//')) return `https:${s}`
  return s
}

async function getOwnedDownloadLink(file: TransferResult): Promise<string> {
  const errors: string[] = []

  // 优先 locatedownload：返回的多 CDN 地址通常可直接下，不依赖 LogStatistic 解 302
  if (file.path) {
    try {
      const j = await baiduFetchJson(
        `https://pcs.baidu.com/rest/2.0/pcs/file?method=locatedownload&app_id=${APP_ID}` +
          `&path=${encodeURIComponent(file.path)}`,
        {
          headers: {
            'User-Agent': 'netdisk;android-android;',
            Referer: 'https://pan.baidu.com/disk/home',
          },
        },
      )
      const raw =
        j.urls?.[0]?.url ||
        j.urls?.[0] ||
        (typeof j.dlink === 'string' ? j.dlink : null)
      if (raw) return normalizePcsUrl(String(raw))
      errors.push(`locate errno=${j.error_code || j.errno}`)
    } catch (e) {
      errors.push(`locate ${e instanceof Error ? e.message : 'fail'}`)
    }
  }

  if (file.fsId) {
    try {
      const j = await baiduFetchJson(
        `https://pan.baidu.com/api/download?clienttype=0&app_id=${APP_ID}&web=1&channel=chunlei`,
        {
          method: 'POST',
          form: {
            fidlist: `[${file.fsId}]`,
            type: 'dlink',
          },
        },
      )
      const dlink =
        pickDlinkFromMeta(j) ||
        (Array.isArray(j.dlink) ? j.dlink[0]?.dlink || j.dlink[0] : null)
      if (j.errno === 0 && dlink) return normalizePcsUrl(String(dlink))
      errors.push(`api-download errno=${j.errno}`)
    } catch (e) {
      errors.push(`api-download ${e instanceof Error ? e.message : 'fail'}`)
    }
  }

  if (file.path) {
    try {
      const j = await baiduFetchJson(
        `https://pan.baidu.com/api/filemetas?dlink=1&blocks=0&web=1&app_id=${APP_ID}&channel=chunlei&clienttype=0`,
        {
          method: 'POST',
          form: { target: JSON.stringify([file.path]) },
        },
      )
      const dlink = pickDlinkFromMeta(j)
      if (j.errno === 0 && dlink) return normalizePcsUrl(dlink)
      errors.push(`path-meta errno=${j.errno}`)
    } catch (e) {
      errors.push(`path-meta ${e instanceof Error ? e.message : 'fail'}`)
    }
  }

  if (file.fsId) {
    try {
      const j = await baiduFetchJson(
        `https://pan.baidu.com/api/filemetas?dlink=1&fsids=${encodeURIComponent(`[${file.fsId}]`)}` +
          `&channel=chunlei&web=1&app_id=${APP_ID}&clienttype=0`,
      )
      const dlink = pickDlinkFromMeta(j)
      if (j.errno === 0 && dlink) return normalizePcsUrl(dlink)
      errors.push(`fsid-meta errno=${j.errno}`)
    } catch (e) {
      errors.push(`fsid-meta ${e instanceof Error ? e.message : 'fail'}`)
    }
  }

  throw new Error(`获取百度网盘下载地址失败（${errors.join('; ') || '无可用接口'}）`)
}

/**
 * 分享链接 → 可下载直链
 */
export async function resolveBaiduShareDownload(
  shareUrl: string,
  parent?: BrowserWindow | null,
): Promise<{ url: string; fileName: string }> {
  const loggedIn = await ensureBaiduLogin(parent)
  if (!loggedIn) throw new Error('未完成百度网盘登录，已取消下载')
  if (!(await verifyBaiduLoginApi())) throw new Error('百度登录校验失败，请重新扫码登录')

  const { surl, surlKey, pwd } = parseBaiduShareUrl(shareUrl)
  const randsk = await verifyShare(surl, surlKey, pwd)
  const yun = await getYunData(surl, surlKey)
  const shareid = yun.shareid
  const uk = yun.uk
  if (shareid == null || uk == null || String(uk) === '0') {
    throw new Error('百度分享信息不完整（缺少 shareid/share_uk）')
  }

  let files: ShareFile[] = []
  const rawList = Array.isArray(yun.file_list)
    ? yun.file_list
    : Array.isArray(yun.file_list?.list)
      ? yun.file_list!.list!
      : []
  if (rawList.length) files = rawList as ShareFile[]
  else files = await listShareFiles(shareid, uk)

  if (!files.some((f) => Number(f.isdir) !== 1)) {
    const dir = files.find((f) => Number(f.isdir) === 1)
    if (dir?.path) files = await listShareFiles(shareid, uk, String(dir.path))
  }
  const file = pickAudioFile(files)
  const fileName = String(file.server_filename || 'audio.mp3')
  const bdstoken = yun.bdstoken ? String(yun.bdstoken) : await getBdstoken()

  // 与网页一致：优先 sharedownload（分享直链 rt=sh），转存仅作兜底
  // 注意：tplconfig 的 surl 要带前导 1（与浏览器一致）；verify 才去前导 1
  try {
    const { sign, timestamp } = await getShareSign(surl, bdstoken)
    const dlink = await sharedownload({
      fsId: file.fs_id,
      shareId: shareid,
      uk,
      randsk,
      sign,
      timestamp,
      bdstoken,
      surl,
    })
    return { url: dlink, fileName }
  } catch (shareErr) {
    try {
      const saved = await transferShare({
        shareId: shareid,
        uk,
        fsId: file.fs_id,
        bdstoken,
        fileName,
      })
      const dlink = await getOwnedDownloadLink(saved)
      return { url: dlink, fileName }
    } catch (transferErr) {
      const a = shareErr instanceof Error ? shareErr.message : String(shareErr)
      const b = transferErr instanceof Error ? transferErr.message : String(transferErr)
      throw new Error(`分享直链：${a}；转存：${b}`)
    }
  }
}

async function getBaiduBdussValue(): Promise<string> {
  const all = await baiduSession().cookies.get({})
  const hit = all.find((c) => {
    const n = String(c.name || '').toUpperCase()
    return (n === 'BDUSS' || n === 'BDUSS_BFESS') && String(c.value || '').length > 10
  })
  return hit ? String(hit.value) : ''
}

/**
 * 下载分享 dlink。
 * net.request 跨站常丢 SameSite Cookie → 403；优先隐藏窗口顶层导航触发 will-download。
 */
export async function downloadWithBaiduSession(
  url: string,
  destPath: string,
  maxBytes = 200 * 1024 * 1024,
): Promise<void> {
  mkdirSync(dirname(destPath), { recursive: true })
  try {
    if (existsSync(destPath)) unlinkSync(destPath)
  } catch {
    /* ignore */
  }

  const errors: string[] = []
  const cookie = await getBaiduCookieHeader()

  try {
    await downloadViaHiddenWindow(url, destPath, maxBytes)
    return
  } catch (e) {
    errors.push(`win ${e instanceof Error ? e.message : 'fail'}`)
  }

  // 显式带全量 Cookie，绕过 SameSite 限制
  for (const ua of [UA, 'LogStatistic', 'pan.baidu.com'] as const) {
    try {
      await downloadViaElectronNet(url, destPath, maxBytes, ua, 'https://pan.baidu.com/', cookie)
      return
    } catch (e) {
      errors.push(`${ua.slice(0, 12)} ${e instanceof Error ? e.message : 'fail'}`)
      try {
        if (existsSync(destPath)) unlinkSync(destPath)
      } catch {
        /* ignore */
      }
    }
  }

  if (cookie) {
    try {
      const realUrl = await resolveBaiduRealDownloadUrlNode(url, cookie)
      await downloadBaiduUrlNode(
        realUrl,
        destPath,
        { 'User-Agent': UA, Accept: '*/*' },
        maxBytes,
        5,
        false,
      )
      return
    } catch (e) {
      errors.push(`node ${e instanceof Error ? e.message : 'fail'}`)
    }
  }

  throw new Error(`百度下载失败（${errors.join('；')}）`)
}

function downloadViaHiddenWindow(
  url: string,
  destPath: string,
  maxBytes: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      width: 400,
      height: 300,
      webPreferences: {
        partition: BAIDU_PARTITION,
        nodeIntegration: false,
        contextIsolation: true,
      },
    })
    const ses = win.webContents.session
    let settled = false
    const timer = setTimeout(() => finish(new Error('百度窗口下载超时')), 120_000)

    const finish = (err?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        ses.removeListener('will-download', onWillDownload)
      } catch {
        /* ignore */
      }
      try {
        if (!win.isDestroyed()) win.destroy()
      } catch {
        /* ignore */
      }
      if (err) {
        try {
          if (existsSync(destPath)) unlinkSync(destPath)
        } catch {
          /* ignore */
        }
        reject(err)
      } else resolve()
    }

    const onWillDownload = (_e: Electron.Event, item: DownloadItem) => {
      try {
        item.setSavePath(destPath)
      } catch (e) {
        finish(e instanceof Error ? e : new Error(String(e)))
        return
      }
      item.on('updated', () => {
        if (item.getReceivedBytes() > maxBytes) {
          try {
            item.cancel()
          } catch {
            /* ignore */
          }
          finish(new Error(`文件过大，超过 ${Math.round(maxBytes / 1024 / 1024)}MB`))
        }
      })
      item.once('done', (_ev, state) => {
        if (state === 'completed') finish()
        else finish(new Error(`百度下载失败：${state}`))
      })
    }

    ses.on('will-download', onWillDownload)
    try {
      win.webContents.downloadURL(url)
    } catch (e) {
      finish(e instanceof Error ? e : new Error(String(e)))
    }
  })
}

function downloadViaElectronNet(
  url: string,
  destPath: string,
  maxBytes: number,
  userAgent: string,
  referer: string | undefined,
  cookieHeader: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = net.request({
      method: 'GET',
      url,
      session: baiduSession(),
      useSessionCookies: true,
      redirect: 'follow',
    })
    req.setHeader('User-Agent', userAgent)
    req.setHeader('Accept', '*/*')
    if (referer) req.setHeader('Referer', referer)
    if (cookieHeader) {
      try {
        req.setHeader('Cookie', cookieHeader)
      } catch {
        /* ignore */
      }
    }
    req.on('response', (res: IncomingMessage) => {
      const status = res.statusCode || 0
      if (status >= 400) {
        res.resume()
        reject(new Error(`HTTP ${status}`))
        return
      }
      const ws = createWriteStream(destPath)
      let bytes = 0
      let settled = false
      const fail = (err: Error) => {
        if (settled) return
        settled = true
        res.destroy()
        ws.destroy()
        try {
          if (existsSync(destPath)) unlinkSync(destPath)
        } catch {
          /* ignore */
        }
        reject(err)
      }
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length
        if (bytes > maxBytes) {
          fail(new Error(`文件过大，超过 ${Math.round(maxBytes / 1024 / 1024)}MB`))
        }
      })
      void pipeline(res, ws)
        .then(() => {
          if (settled) return
          settled = true
          if (bytes <= 0) {
            try {
              unlinkSync(destPath)
            } catch {
              /* ignore */
            }
            reject(new Error('下载内容为空'))
            return
          }
          resolve()
        })
        .catch(fail)
    })
    req.on('error', reject)
    req.end()
  })
}

/** 用分区会话请求 dlink，捕获 302 Location（Cookie 由 Chromium 自动带） */
function resolveBaiduRealUrlViaElectron(dlink: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = net.request({
      method: 'GET',
      url: dlink,
      session: baiduSession(),
      useSessionCookies: true,
      redirect: 'manual',
    })
    req.setHeader('User-Agent', 'LogStatistic')
    req.setHeader('Accept', '*/*')
    let settled = false
    const done = (err?: Error, url?: string) => {
      if (settled) return
      settled = true
      try {
        req.abort()
      } catch {
        /* ignore */
      }
      if (err) reject(err)
      else resolve(String(url || dlink))
    }
    req.on('redirect', (_status, _method, redirectUrl) => {
      if (redirectUrl) done(undefined, String(redirectUrl))
      else done(new Error('百度 302 无 Location'))
    })
    req.on('response', (res: IncomingMessage) => {
      const status = res.statusCode || 0
      res.resume()
      if (status >= 200 && status < 300) done(undefined, dlink)
      else done(new Error(`百度解析直链失败 HTTP ${status}`))
    })
    req.on('error', (err) => {
      // abort 后可能触发；已 settle 则忽略
      if (!settled) done(err)
    })
    req.end()
  })
}

/** Node 兜底：dlink → 真实 CDN；cookieOrBduss 可为完整 Cookie 头或仅 BDUSS 值 */
function resolveBaiduRealDownloadUrlNode(dlink: string, cookieOrBduss: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let parsed: URL
    try {
      parsed = new URL(dlink)
    } catch {
      reject(new Error('百度下载地址无效'))
      return
    }
    const cookie = cookieOrBduss.includes('=')
      ? cookieOrBduss
      : `BDUSS=${cookieOrBduss}`
    const lib = parsed.protocol === 'http:' ? http : https
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'http:' ? 80 : 443),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': UA,
          Accept: '*/*',
          Referer: 'https://pan.baidu.com/',
          Cookie: cookie,
        },
        timeout: 30_000,
      },
      (res) => {
        const status = res.statusCode || 0
        const loc = res.headers.location
        res.resume()
        if (status >= 300 && status < 400 && loc) {
          resolve(new URL(String(loc), dlink).toString())
          return
        }
        if (status >= 200 && status < 300) {
          resolve(dlink)
          return
        }
        reject(new Error(`百度解析直链失败 HTTP ${status}`))
      },
    )
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('百度解析直链超时'))
    })
    req.on('error', reject)
    req.end()
  })
}

function downloadBaiduUrlNode(
  url: string,
  destPath: string,
  headers: Record<string, string>,
  maxBytes: number,
  redirectLeft = 5,
  /** 跟随跳转时是否继续带 Cookie（真实 CDN 通常不需要，乱带可能 400） */
  keepCookieOnRedirect = false,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      reject(new Error('百度下载地址无效'))
      return
    }
    const lib = parsed.protocol === 'http:' ? http : https
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'http:' ? 80 : 443),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers,
        timeout: 60_000,
      },
      (res) => {
        const status = res.statusCode || 0
        const loc = res.headers.location
        if (status >= 300 && status < 400 && loc && redirectLeft > 0) {
          res.resume()
          const next = new URL(String(loc), url).toString()
          const nextHeaders = { ...headers }
          if (!keepCookieOnRedirect) delete nextHeaders.Cookie
          downloadBaiduUrlNode(next, destPath, nextHeaders, maxBytes, redirectLeft - 1, keepCookieOnRedirect)
            .then(resolve)
            .catch(reject)
          return
        }
        if (status >= 400) {
          res.resume()
          reject(new Error(`百度下载失败 HTTP ${status}`))
          return
        }
        const ws = createWriteStream(destPath)
        let bytes = 0
        let settled = false
        const fail = (err: Error) => {
          if (settled) return
          settled = true
          res.destroy()
          ws.destroy()
          try {
            if (existsSync(destPath)) unlinkSync(destPath)
          } catch {
            /* ignore */
          }
          reject(err)
        }
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length
          if (bytes > maxBytes) {
            fail(new Error(`文件过大，超过 ${Math.round(maxBytes / 1024 / 1024)}MB`))
          }
        })
        void pipeline(res, ws)
          .then(() => {
            if (settled) return
            settled = true
            if (bytes <= 0) {
              try {
                unlinkSync(destPath)
              } catch {
                /* ignore */
              }
              reject(new Error('下载内容为空'))
              return
            }
            resolve()
          })
          .catch(fail)
      },
    )
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('百度下载超时'))
    })
    req.on('error', reject)
    req.end()
  })
}
