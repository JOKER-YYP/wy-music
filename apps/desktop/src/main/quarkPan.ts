/**
 * 夸克网盘：登录会话 + 分享链接转存后取直链（方案 C）
 * 分享页可匿名拿 stoken/列表；下载直链需登录 Cookie。
 */
import { BrowserWindow, net, session } from 'electron'
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'fs'
import { dirname } from 'path'
import { pipeline } from 'stream/promises'
import type { IncomingMessage } from 'http'

const QUARK_PARTITION = 'persist:wy-quark'
const API = 'https://drive-pc.quark.cn/1/clouddrive'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

type QuarkJson = {
  status?: number
  code?: number
  message?: string
  data?: any
  metadata?: any
}

function quarkSession() {
  return session.fromPartition(QUARK_PARTITION)
}

function commonParams() {
  return 'pr=ucpro&fr=pc'
}

/** 手动拼 Cookie：Electron session.fetch 有时不会自动带跨子域登录态 */
async function getQuarkCookieHeader(): Promise<string> {
  const ses = quarkSession()
  const urls = [
    'https://pan.quark.cn/',
    'https://drive-pc.quark.cn/',
    'https://drive.quark.cn/',
    'https://u.quark.cn/',
  ]
  const map = new Map<string, string>()
  for (const url of urls) {
    try {
      const list = await ses.cookies.get({ url })
      for (const c of list) {
        if (c.name) map.set(c.name, c.value)
      }
    } catch {
      /* ignore */
    }
  }
  // 再扫一遍分区内所有 quark cookie，防止 url 匹配遗漏
  try {
    const all = await ses.cookies.get({})
    for (const c of all) {
      if (/quark\.cn/i.test(String(c.domain || '')) && c.name) {
        map.set(c.name, c.value)
      }
    }
  } catch {
    /* ignore */
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

/**
 * 用 net.request + useSessionCookies，确保带上分区登录 Cookie
 * （session.fetch 常把 Cookie 当禁运头丢掉，导致仍是 guest）
 */
function quarkFetchJson(
  url: string,
  opts?: { method?: string; body?: unknown },
): Promise<QuarkJson> {
  const method = opts?.method || 'GET'
  const bodyStr = opts?.body != null ? JSON.stringify(opts.body) : ''
  return new Promise((resolve, reject) => {
    const req = net.request({
      method,
      url,
      session: quarkSession(),
      useSessionCookies: true,
    })
    req.setHeader('User-Agent', UA)
    req.setHeader('Accept', 'application/json, text/plain, */*')
    req.setHeader('Accept-Language', 'zh-CN,zh;q=0.9')
    req.setHeader('Origin', 'https://pan.quark.cn')
    req.setHeader('Referer', 'https://pan.quark.cn/')
    if (bodyStr) {
      req.setHeader('Content-Type', 'application/json;charset=UTF-8')
    }
    // 再显式补一遍 Cookie（部分环境 useSessionCookies 不够）
    void getQuarkCookieHeader().then((cookie) => {
      if (cookie) {
        try {
          req.setHeader('Cookie', cookie)
        } catch {
          /* Cookie 可能被禁设，依赖 useSessionCookies */
        }
      }
      req.on('response', (res: IncomingMessage) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          try {
            resolve(JSON.parse(text) as QuarkJson)
          } catch {
            reject(new Error(`夸克接口非 JSON（HTTP ${res.statusCode || 0}）`))
          }
        })
        res.on('error', reject)
      })
      req.on('error', reject)
      if (bodyStr) req.write(bodyStr)
      req.end()
    })
  })
}

/**
 * 夸克真实登录态 cookie（勿把 __cuid / 匿名 session 算进去，否则一开页就误判已登录）
 * 参考 quark-auto-save 等工具：以 __puus 为主
 */
function isLoginCookie(c: { name: string; value: string }): boolean {
  const n = c.name.toLowerCase()
  if (n !== '__puus' && n !== 'puus') return false
  return String(c.value || '').trim().length > 8
}

async function hasQuarkLoginCookie(): Promise<boolean> {
  const ses = quarkSession()
  const all = await ses.cookies.get({})
  return all.some((c) => /quark\.cn/i.test(String(c.domain || '')) && isLoginCookie(c))
}

/** 用需登录接口校验（比单纯看 cookie 可靠） */
async function verifyQuarkLoginApi(): Promise<boolean> {
  if (!(await hasQuarkLoginCookie())) return false
  try {
    const qs =
      `${commonParams()}&pdir_fid=0&_page=1&_size=1` +
      `&_sort=${encodeURIComponent('file_type:asc,updated_at:desc')}`
    const j = await quarkFetchJson(`${API}/file/sort?${qs}`)
    if (j.status === 200 || j.code === 0) return true
    const msg = String(j.message || '')
    if (/login|guest|登录/i.test(msg)) return false
  } catch {
    /* ignore */
  }
  return false
}

/** 是否已登录夸克（cookie + 接口） */
export async function hasQuarkLogin(): Promise<boolean> {
  return verifyQuarkLoginApi()
}

let loginWin: BrowserWindow | null = null
let loginWaiters: Array<(ok: boolean) => void> = []

function settleLoginWaiters(ok: boolean) {
  const waiters = loginWaiters
  loginWaiters = []
  for (const w of waiters) w(ok)
}

function broadcastQuarkLogin(ok: boolean) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      try {
        win.webContents.send('quark:loginChanged', ok)
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * 打开夸克登录窗（页面自带扫码）；登录成功后自动关闭并继续。
 * 多次调用会复用同一窗口。
 */
export function openQuarkLoginWindow(parent?: BrowserWindow | null): Promise<boolean> {
  return new Promise((resolve) => {
    loginWaiters.push(resolve)

    if (loginWin && !loginWin.isDestroyed()) {
      loginWin.focus()
      return
    }

    const win = new BrowserWindow({
      width: 920,
      height: 680,
      parent: parent && !parent.isDestroyed() ? parent : undefined,
      modal: false,
      title: '登录夸克网盘（可用 App 扫码）',
      webPreferences: {
        partition: QUARK_PARTITION,
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
      const ok = await hasQuarkLogin()
      if (loginWin === win) loginWin = null
      broadcastQuarkLogin(ok)
      settleLoginWaiters(ok)
    }

    // 等页面加载后再轮询：先出现 __puus，再用接口确认，避免游客态误关窗
    win.webContents.once('did-finish-load', () => {
      if (settled) return
      pollTimer = setInterval(() => {
        void (async () => {
          if (settled) return
          if (!(await hasQuarkLoginCookie())) return
          if (!(await verifyQuarkLoginApi())) return
          if (!win.isDestroyed()) win.close()
        })()
      }, 1500)
    })

    win.on('closed', () => {
      void finish()
    })
    void win.loadURL('https://pan.quark.cn/')
  })
}

/** 未登录则弹窗；已登录直接返回 true */
export async function ensureQuarkLogin(parent?: BrowserWindow | null): Promise<boolean> {
  if (await verifyQuarkLoginApi()) return true
  return openQuarkLoginWindow(parent)
}

/** 清除夸克分区 Cookie，退出登录 */
export async function logoutQuark(): Promise<boolean> {
  if (loginWin && !loginWin.isDestroyed()) {
    try {
      loginWin.close()
    } catch {
      /* ignore */
    }
    loginWin = null
  }
  const ses = quarkSession()
  const all = await ses.cookies.get({})
  const quarkCookies = all.filter((c) => /quark\.cn/i.test(String(c.domain || '')))
  await Promise.all(
    quarkCookies.map(async (c) => {
      const domain = String(c.domain || '').replace(/^\./, '')
      const path = c.path || '/'
      const url = `https://${domain}${path.startsWith('/') ? path : `/${path}`}`
      try {
        await ses.cookies.remove(url, c.name)
      } catch {
        /* ignore single cookie failure */
      }
    }),
  )
  // 再清一次存储，避免 localStorage 里残留登录态
  try {
    await ses.clearStorageData({
      storages: ['cookies', 'localstorage', 'indexdb', 'shadercache', 'serviceworkers'],
    })
  } catch {
    /* ignore */
  }
  broadcastQuarkLogin(false)
  return !(await hasQuarkLogin())
}

export function parseQuarkShareUrl(shareUrl: string): { pwdId: string; passcode: string } {
  const raw = String(shareUrl || '').trim()
  const m = raw.match(/pan\.quark\.cn\/s\/([a-zA-Z0-9]+)/i)
  if (!m) throw new Error('不是有效的夸克分享链接')
  const pwd = raw.match(/[?&]pwd=([^&]+)/i)
  return { pwdId: m[1], passcode: pwd ? decodeURIComponent(pwd[1]) : '' }
}

async function getStoken(pwdId: string, passcode: string): Promise<string> {
  const j = await quarkFetchJson(`${API}/share/sharepage/token?${commonParams()}`, {
    method: 'POST',
    body: { pwd_id: pwdId, passcode },
  })
  if ((j.status !== 200 && j.code !== 0) || !j.data?.stoken) {
    throw new Error(j.message || '获取夸克分享令牌失败（链接失效或需提取码）')
  }
  return String(j.data.stoken)
}

type ShareFile = {
  fid: string
  file_name: string
  dir: boolean
  size: number
  share_fid_token: string
  pdir_fid: string
}

async function listShareFiles(pwdId: string, stoken: string, pdirFid = '0'): Promise<ShareFile[]> {
  const files: ShareFile[] = []
  let page = 1
  for (;;) {
    const qs = new URLSearchParams({
      pr: 'ucpro',
      fr: 'pc',
      pwd_id: pwdId,
      stoken,
      pdir_fid: pdirFid,
      force: '0',
      _page: String(page),
      _size: '50',
      _sort: 'file_type:asc,updated_at:desc',
    })
    const j = await quarkFetchJson(`${API}/share/sharepage/detail?${qs}`)
    if ((j.status !== 200 && j.code !== 0) || !j.data) {
      throw new Error(j.message || '读取夸克分享文件列表失败')
    }
    const list = (j.data.list || []) as any[]
    for (const f of list) {
      files.push({
        fid: String(f.fid || ''),
        file_name: String(f.file_name || ''),
        dir: Boolean(f.dir),
        size: Number(f.size || 0),
        share_fid_token: String(f.share_fid_token || ''),
        pdir_fid: String(f.pdir_fid || '0'),
      })
    }
    const total = Number(j.metadata?._total || files.length)
    if (page * 50 >= total || !list.length) break
    page += 1
  }
  return files
}

function pickAudioFile(files: ShareFile[]): ShareFile {
  const audio = files.filter((f) => !f.dir && /\.(mp3|flac|wav|m4a|aac)$/i.test(f.file_name))
  const pool = audio.length ? audio : files.filter((f) => !f.dir)
  if (!pool.length) throw new Error('夸克分享内没有可下载的音频文件')
  const score = (name: string) => {
    const n = name.toLowerCase()
    if (n.endsWith('.mp3')) return 3
    if (n.endsWith('.flac')) return 2
    if (n.endsWith('.wav') || n.endsWith('.m4a')) return 1
    return 0
  }
  pool.sort((a, b) => score(b.file_name) - score(a.file_name) || b.size - a.size)
  return pool[0]
}

function isGuestLoginError(message?: string) {
  return /require login|guest|未登录|请先登录/i.test(String(message || ''))
}

async function saveShareFile(opts: {
  pwdId: string
  stoken: string
  file: ShareFile
}): Promise<string> {
  const j = await quarkFetchJson(`${API}/share/sharepage/save?${commonParams()}`, {
    method: 'POST',
    body: {
      fid_list: [opts.file.fid],
      fid_token_list: [opts.file.share_fid_token],
      to_pdir_fid: '0',
      pwd_id: opts.pwdId,
      stoken: opts.stoken,
      pdir_fid: '0',
      scene: 'link',
    },
  })
  if (j.status !== 200 && j.code !== 0) {
    if (isGuestLoginError(j.message)) {
      throw new Error('夸克登录态无效（接口仍为游客），请退出后重新扫码登录')
    }
    throw new Error(j.message || '转存到夸克网盘失败（请确认已登录）')
  }
  const taskId = j.data?.task_id || j.data?.taskId
  if (taskId) {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 400))
      const tj = await quarkFetchJson(
        `${API}/task?${commonParams()}&task_id=${encodeURIComponent(String(taskId))}&retry_index=${i}`,
      )
      if (tj.status === 200 || tj.code === 0) {
        const status = tj.data?.status
        if (status === 2 || status === '2' || tj.data?.finish) {
          const saved =
            tj.data?.save_as?.save_as_top_fids?.[0] ||
            tj.data?.save_as?.fid ||
            tj.data?.fid ||
            opts.file.fid
          return String(saved)
        }
        if (status === 3 || status === '3') {
          throw new Error(tj.message || '夸克转存任务失败')
        }
      }
    }
  }
  return j.data?.save_as?.save_as_top_fids?.[0] || j.data?.fid || opts.file.fid
}

async function getDownloadUrl(fid: string): Promise<string> {
  const j = await quarkFetchJson(`${API}/file/download?${commonParams()}&sys=win32`, {
    method: 'POST',
    body: { fids: [fid] },
  })
  if ((j.status !== 200 && j.code !== 0) || !Array.isArray(j.data) || !j.data[0]?.download_url) {
    throw new Error(j.message || '获取夸克下载直链失败（需已登录且转存成功）')
  }
  return String(j.data[0].download_url)
}

/**
 * 分享链接 → 本地可直链下载的 URL
 * 流程：确保登录（可弹窗扫码）→ stoken → 选音频 → 转存 → download_url
 */
export async function resolveQuarkShareDownload(
  shareUrl: string,
  parent?: BrowserWindow | null,
): Promise<{
  url: string
  fileName: string
}> {
  const runOnce = async () => {
    const loggedIn = await ensureQuarkLogin(parent)
    if (!loggedIn) {
      throw new Error('未完成夸克网盘登录，已取消下载')
    }
    if (!(await verifyQuarkLoginApi())) {
      throw new Error('夸克登录校验失败，请重新扫码登录')
    }
    const { pwdId, passcode } = parseQuarkShareUrl(shareUrl)
    const stoken = await getStoken(pwdId, passcode)
    let pool = await listShareFiles(pwdId, stoken)
    if (!pool.some((f) => !f.dir)) {
      const dir = pool.find((f) => f.dir)
      if (dir) pool = await listShareFiles(pwdId, stoken, dir.fid)
    }
    const file = pickAudioFile(pool)
    const savedFid = await saveShareFile({ pwdId, stoken, file })
    const url = await getDownloadUrl(savedFid)
    return { url, fileName: file.file_name }
  }

  try {
    return await runOnce()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // 游客态：清 cookie 后强制再登一次再试
    if (!isGuestLoginError(msg) && !/登录校验失败|登录态无效/.test(msg)) throw e
    await logoutQuark().catch(() => false)
    const ok = await openQuarkLoginWindow(parent)
    if (!ok) throw new Error('未完成夸克网盘登录，已取消下载')
    return await runOnce()
  }
}

/** 带夸克登录 Cookie 下载直链到本地（CDN 常需会话） */
export async function downloadWithQuarkSession(
  url: string,
  destPath: string,
  maxBytes = 200 * 1024 * 1024,
): Promise<void> {
  mkdirSync(dirname(destPath), { recursive: true })
  const cookie = await getQuarkCookieHeader()
  await new Promise<void>((resolve, reject) => {
    const req = net.request({
      method: 'GET',
      url,
      session: quarkSession(),
      useSessionCookies: true,
      redirect: 'follow',
    })
    req.setHeader('User-Agent', UA)
    req.setHeader('Accept', '*/*')
    req.setHeader('Referer', 'https://pan.quark.cn/')
    if (cookie) {
      try {
        req.setHeader('Cookie', cookie)
      } catch {
        /* ignore */
      }
    }
    req.on('response', (res: IncomingMessage) => {
      const status = res.statusCode || 0
      if (status >= 400) {
        res.resume()
        reject(new Error(`夸克下载失败 HTTP ${status}`))
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
