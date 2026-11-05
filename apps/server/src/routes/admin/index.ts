import { Router } from 'express'
import bcrypt from 'bcryptjs'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { prisma } from '../../db.js'
import { fail, ok } from '../../utils/response.js'
import { toTrackDto, toUserPublic } from '../../utils/mapper.js'
import { toPublicUrl } from '../../utils/storage.js'
import { config } from '../../config.js'
import {
  requireAdmin,
  signAccessToken,
  signRefreshToken,
  type AuthedRequest,
} from '../../middleware/auth.js'
import { deleteTrackFully, offlineTrackById } from '../../services/trackLifecycle.js'
import { getAppSettings, saveAppSettings } from '../../services/systemSettings.js'

const router = Router()

const bannerUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(config.storageRoot, 'banners')
      fs.mkdirSync(dir, { recursive: true })
      cb(null, dir)
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg'
      cb(null, `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`)
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('仅支持图片文件'))
      return
    }
    cb(null, true)
  },
})

function bannerImagePublic(raw: string | null | undefined) {
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/media/')) return raw
  return toPublicUrl(raw) || raw
}

function toBannerDto(b: {
  id: string
  title: string
  imageUrl: string
  linkUrl: string | null
  sort: number
  enabled: boolean
}) {
  return {
    id: b.id,
    title: b.title,
    imageUrl: bannerImagePublic(b.imageUrl),
    linkUrl: b.linkUrl,
    sort: b.sort,
    enabled: b.enabled,
  }
}

router.post('/auth/login', async (req, res) => {
  const account = String(req.body.account || '')
  const password = String(req.body.password || '')
  const user = await prisma.user.findUnique({ where: { account } })
  if (!user || user.role !== 'admin') {
    return fail(res, 40101, '管理员账号或密码错误', 401)
  }
  if (user.status !== 1) {
    return fail(res, 40301, '账号已禁用', 403)
  }
  const match = await bcrypt.compare(password, user.passwordHash)
  if (!match) {
    return fail(res, 40101, '管理员账号或密码错误', 401)
  }
  const payload = { sub: user.id, role: 'admin' as const }
  return ok(res, {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    user: toUserPublic(user),
  })
})

router.use(requireAdmin)

router.get('/dashboard', async (_req, res) => {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const weekAgo = new Date(start)
  weekAgo.setDate(weekAgo.getDate() - 6)

  const parseArtists = (raw: string): string[] => {
    try {
      const arr = JSON.parse(raw)
      return Array.isArray(arr) ? arr.map(String) : [String(raw)]
    } catch {
      return raw ? [raw] : []
    }
  }

  const toRank = (
    rows: Array<{
      id: string
      name: string
      artists: string
      coverUrl: string | null
      value: number
    }>,
  ) =>
    rows.map((t) => ({
      id: t.id,
      name: t.name,
      artists: parseArtists(t.artists),
      coverUrl: toPublicUrl(t.coverUrl),
      value: t.value,
    }))

  const [
    userCount,
    trackCount,
    publishedCount,
    pendingCount,
    todayUploadCount,
    todayPlayCount,
    commentCount,
    publicPlaylistCount,
    likeCount,
    playlistCollectCount,
    storageAgg,
    playAgg,
    downloadSumRows,
    recentTracks,
    recentPlays,
    statusGroups,
    topPlayTracks,
    topDownloadTracks,
    likeGroups,
    collectGroups,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.track.count(),
    prisma.track.count({ where: { status: 'published' } }),
    prisma.track.count({ where: { status: 'pending' } }),
    prisma.track.count({ where: { createdAt: { gte: start } } }),
    prisma.playHistory.count({ where: { playedAt: { gte: start } } }),
    prisma.comment.count(),
    prisma.playlist.count({ where: { isPublic: true, isSystem: false } }),
    prisma.like.count(),
    prisma.playlistTrack.count(),
    prisma.track.aggregate({ _sum: { fileSize: true } }),
    prisma.track.aggregate({ _sum: { playCount: true } }),
    prisma.$queryRaw<Array<{ total: number | bigint }>>`
      SELECT COALESCE(SUM(downloadCount), 0) AS total FROM Track
    `,
    prisma.track.findMany({
      where: { createdAt: { gte: weekAgo } },
      select: { createdAt: true },
    }),
    prisma.playHistory.findMany({
      where: { playedAt: { gte: weekAgo } },
      select: { playedAt: true },
    }),
    prisma.track.groupBy({ by: ['status'], _count: { status: true } }),
    prisma.track.findMany({
      where: { status: 'published' },
      orderBy: { playCount: 'desc' },
      take: 10,
      select: { id: true, name: true, artists: true, coverUrl: true, playCount: true },
    }),
    prisma.$queryRaw<
      Array<{
        id: string
        name: string
        artists: string
        coverUrl: string | null
        downloadCount: number | bigint
      }>
    >`
      SELECT id, name, artists, coverUrl, downloadCount
      FROM Track
      WHERE status = 'published'
      ORDER BY downloadCount DESC
      LIMIT 10
    `,
    prisma.like.groupBy({
      by: ['trackId'],
      _count: { trackId: true },
      orderBy: { _count: { trackId: 'desc' } },
      take: 10,
    }),
    prisma.playlistTrack.groupBy({
      by: ['trackId'],
      _count: { trackId: true },
      orderBy: { _count: { trackId: 'desc' } },
      take: 10,
    }),
  ])

  const likeIds = likeGroups.map((g) => g.trackId)
  const collectIds = collectGroups.map((g) => g.trackId)
  const rankTrackIds = [...new Set([...likeIds, ...collectIds])]
  const rankTracks = rankTrackIds.length
    ? await prisma.track.findMany({
        where: { id: { in: rankTrackIds } },
        select: { id: true, name: true, artists: true, coverUrl: true },
      })
    : []
  const rankMap = new Map(rankTracks.map((t) => [t.id, t]))

  const dayKey = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const trends: Array<{ date: string; uploadCount: number; playCount: number }> = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekAgo)
    d.setDate(weekAgo.getDate() + i)
    const key = dayKey(d)
    trends.push({
      date: key,
      uploadCount: recentTracks.filter((t) => dayKey(t.createdAt) === key).length,
      playCount: recentPlays.filter((p) => dayKey(p.playedAt) === key).length,
    })
  }

  return ok(res, {
    userCount,
    trackCount,
    publishedCount,
    pendingCount,
    todayUploadCount,
    todayPlayCount,
    commentCount,
    publicPlaylistCount,
    likeCount,
    playlistCollectCount,
    totalPlayCount: playAgg._sum.playCount || 0,
    totalDownloadCount: Number(downloadSumRows[0]?.total || 0),
    storageBytes: storageAgg._sum.fileSize || 0,
    trends,
    statusDistribution: statusGroups.map((g) => ({
      status: g.status,
      count: g._count.status,
    })),
    topPlays: toRank(
      topPlayTracks.map((t) => ({
        id: t.id,
        name: t.name,
        artists: t.artists,
        coverUrl: t.coverUrl,
        value: t.playCount,
      })),
    ),
    topDownloads: toRank(
      topDownloadTracks.map((t) => ({
        id: t.id,
        name: t.name,
        artists: t.artists,
        coverUrl: t.coverUrl,
        value: Number(t.downloadCount || 0),
      })),
    ),
    topLikes: likeGroups
      .map((g) => {
        const t = rankMap.get(g.trackId)
        if (!t) return null
        return {
          id: t.id,
          name: t.name,
          artists: parseArtists(t.artists),
          coverUrl: toPublicUrl(t.coverUrl),
          value: g._count.trackId,
        }
      })
      .filter(Boolean),
    topCollected: collectGroups
      .map((g) => {
        const t = rankMap.get(g.trackId)
        if (!t) return null
        return {
          id: t.id,
          name: t.name,
          artists: parseArtists(t.artists),
          coverUrl: toPublicUrl(t.coverUrl),
          value: g._count.trackId,
        }
      })
      .filter(Boolean),
  })
})

router.get('/users', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20))
  const keyword = String(req.query.keyword || '').trim()
  const statusRaw = String(req.query.status || '').trim()
  const statusFilter =
    statusRaw === '0' || statusRaw === '1' ? Number(statusRaw) : undefined
  const where = {
    ...(statusFilter !== undefined ? { status: statusFilter } : {}),
    ...(keyword
      ? {
          OR: [{ account: { contains: keyword } }, { nickname: { contains: keyword } }],
        }
      : {}),
  }
  const [total, list] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { tracks: true, playlists: true } },
      },
    }),
  ])
  return ok(res, {
    list: list.map((u) => ({
      ...toUserPublic(u),
      status: u.status,
      trackCount: u._count.tracks,
      playlistCount: u._count.playlists,
    })),
    total,
    page,
    pageSize,
  })
})

router.get('/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      _count: { select: { tracks: true, playlists: true, likes: true, comments: true } },
    },
  })
  if (!user) return fail(res, 40401, '用户不存在', 404)
  return ok(res, {
    ...toUserPublic(user),
    status: user.status,
    trackCount: user._count.tracks,
    playlistCount: user._count.playlists,
    likeCount: user._count.likes,
    commentCount: user._count.comments,
  })
})

router.patch('/users/:id/status', async (req, res) => {
  const status = Number(req.body.status)
  if (![0, 1].includes(status)) {
    return fail(res, 40001, 'status 只能为 0 或 1')
  }
  const target = await prisma.user.findUnique({ where: { id: req.params.id } })
  if (!target) return fail(res, 40401, '用户不存在', 404)
  if (target.role === 'admin' && status === 0) {
    return fail(res, 40002, '不能禁用管理员账号')
  }
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { status },
  })
  return ok(res, { ...toUserPublic(user), status: user.status })
})

router.post('/users/:id/reset-password', async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } })
  if (!target) return fail(res, 40401, '用户不存在', 404)
  if (target.role === 'admin') {
    return fail(res, 40002, '请勿通过此接口重置管理员密码')
  }
  let password = String(req.body.password || '').trim()
  if (!password) {
    password = `Wy${Math.random().toString(36).slice(2, 8)}!`
  }
  if (password.length < 6) return fail(res, 40001, '密码至少 6 位')
  const passwordHash = await bcrypt.hash(password, 10)
  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash },
  })
  return ok(res, { temporaryPassword: password }, '密码已重置')
})

router.get('/tracks', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
  const status = String(req.query.status || '').trim()
  const keyword = String(req.query.keyword || '').trim()
  const uploader = String(req.query.uploader || '').trim()
  const where = {
    ...(status ? { status } : {}),
    ...(uploader
      ? {
          uploader: {
            OR: [{ nickname: { contains: uploader } }, { account: { contains: uploader } }],
          },
        }
      : {}),
    ...(keyword
      ? {
          OR: [
            { name: { contains: keyword } },
            { artists: { contains: keyword } },
            { album: { contains: keyword } },
          ],
        }
      : {}),
  }
  const [total, list] = await Promise.all([
    prisma.track.count({ where }),
    prisma.track.findMany({
      where,
      include: { uploader: { select: { nickname: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])
  return ok(res, {
    list: list.map((t) => ({
      ...toTrackDto(t),
      fileHash: t.fileHash,
    })),
    total,
    page,
    pageSize,
  })
})

/** 按 fileHash 查出重复曲目组 */
router.get('/tracks/duplicates', async (_req, res) => {
  const grouped = await prisma.track.groupBy({
    by: ['fileHash'],
    _count: { fileHash: true },
    having: { fileHash: { _count: { gt: 1 } } },
  })
  const hashes = grouped.map((g) => g.fileHash).filter(Boolean)
  if (!hashes.length) return ok(res, { groups: [], totalGroups: 0 })

  const tracks = await prisma.track.findMany({
    where: { fileHash: { in: hashes } },
    include: { uploader: { select: { nickname: true } } },
    orderBy: { createdAt: 'asc' },
  })
  const byHash = new Map<string, ReturnType<typeof toTrackDto>[]>()
  for (const t of tracks) {
    const list = byHash.get(t.fileHash) || []
    list.push(toTrackDto(t))
    byHash.set(t.fileHash, list)
  }
  const groups = [...byHash.entries()].map(([fileHash, items]) => ({
    fileHash,
    count: items.length,
    tracks: items,
  }))
  return ok(res, { groups, totalGroups: groups.length })
})

router.post('/tracks/batch', async (req, res) => {
  const action = String(req.body.action || '')
  const ids = Array.isArray(req.body.ids)
    ? [...new Set((req.body.ids as unknown[]).map(String).filter(Boolean))]
    : []
  if (!ids.length) return fail(res, 40001, '请选择歌曲')
  if (!['approve', 'reject', 'offline', 'delete'].includes(action)) {
    return fail(res, 40001, '不支持的批量操作')
  }
  const reason = String(req.body.reason || '不符合规范')
  let okCount = 0
  for (const id of ids.slice(0, 100)) {
    try {
      if (action === 'approve') {
        await prisma.track.update({
          where: { id },
          data: { status: 'published', rejectReason: null },
        })
      } else if (action === 'reject') {
        await prisma.track.update({
          where: { id },
          data: { status: 'rejected', rejectReason: reason },
        })
      } else if (action === 'offline') {
        await offlineTrackById(id)
      } else if (action === 'delete') {
        await deleteTrackFully(id)
      }
      okCount += 1
    } catch {
      /* skip single failure */
    }
  }
  return ok(res, { ok: okCount, total: ids.length }, `已处理 ${okCount}/${ids.length}`)
})

/** 缺歌词曲目数量（可选 ids 限定范围） */
router.get('/tracks/missing-lyrics-count', async (req, res) => {
  const ids = String(req.query.ids || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const { countTracksMissingLyrics } = await import('../../services/matchTrackLyrics.js')
  const missing = await countTracksMissingLyrics(ids.length ? ids : undefined)
  return ok(res, { missing })
})

/**
 * 一键为缺词曲目匹配外部歌词。
 * body: { ids?: string[], limit?: number, concurrency?: number }
 * 建议每批 limit≤20；前端可循环调用直到 remaining=0。
 */
router.post('/tracks/match-lyrics', async (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? [...new Set((req.body.ids as unknown[]).map(String).filter(Boolean))]
    : undefined
  const limit = Number(req.body?.limit)
  const concurrency = Number(req.body?.concurrency)
  const { matchMissingTrackLyrics } = await import('../../services/matchTrackLyrics.js')
  try {
    const report = await matchMissingTrackLyrics({
      ids: ids?.length ? ids : undefined,
      limit: Number.isFinite(limit) ? limit : 15,
      concurrency: Number.isFinite(concurrency) ? concurrency : 2,
    })
    const msg = `本批扫描 ${report.scanned} 首：成功 ${report.matched.length}，失败 ${report.failed.length}，仍缺词 ${report.remaining}`
    return ok(res, report, msg)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '匹配歌词失败'
    return fail(res, 50001, msg, 500)
  }
})

router.get('/tracks/:id', async (req, res) => {
  const track = await prisma.track.findUnique({
    where: { id: req.params.id },
    include: { uploader: { select: { nickname: true } } },
  })
  if (!track) return fail(res, 40401, '歌曲不存在', 404)
  return ok(res, toTrackDto(track))
})

router.put('/tracks/:id', async (req, res) => {
  const track = await prisma.track.findUnique({ where: { id: req.params.id } })
  if (!track) return fail(res, 40401, '歌曲不存在', 404)

  const nextStatus =
    req.body.status !== undefined ? String(req.body.status) : undefined
  if (
    nextStatus &&
    !['pending', 'published', 'rejected', 'offline'].includes(nextStatus)
  ) {
    return fail(res, 40001, '状态无效')
  }

  // 改为下架：走统一下架（通知 + 清理收藏/歌单）
  if (nextStatus === 'offline' && track.status !== 'offline') {
    const offlined = await offlineTrackById(track.id)
    if (!offlined) return fail(res, 40401, '歌曲不存在', 404)
  }

  const data: Record<string, unknown> = {}
  if (req.body.name !== undefined) {
    const name = String(req.body.name || '').trim()
    if (!name) return fail(res, 40001, '歌名不能为空')
    data.name = name
  }
  if (req.body.artists !== undefined) {
    const artists = String(req.body.artists || '')
      .split(/[,，/、]/)
      .map((s) => s.trim())
      .filter(Boolean)
    data.artists = JSON.stringify(artists.length ? artists : ['未知歌手'])
  }
  if (req.body.album !== undefined) {
    data.album = String(req.body.album || '').trim() || '未知专辑'
  }
  if (req.body.lyricText !== undefined) data.lyricText = String(req.body.lyricText || '') || null
  if (req.body.durationMs !== undefined) {
    const ms = Number(req.body.durationMs)
    if (!Number.isFinite(ms) || ms < 0) return fail(res, 40001, '时长无效')
    data.durationMs = Math.round(ms)
  }
  if (nextStatus && nextStatus !== 'offline') {
    data.status = nextStatus
  }
  if (req.body.rejectReason !== undefined) {
    data.rejectReason = String(req.body.rejectReason || '') || null
  }
  if (data.status === 'published' || nextStatus === 'published') {
    data.rejectReason = null
    data.status = 'published'
  }

  const updated = await prisma.track.update({
    where: { id: track.id },
    data,
    include: { uploader: { select: { nickname: true } } },
  })
  return ok(res, toTrackDto(updated))
})

router.post('/tracks/:id/approve', async (req, res) => {
  const prev = await prisma.track.findUnique({ where: { id: req.params.id } })
  const track = await prisma.track.update({
    where: { id: req.params.id },
    data: { status: 'published', rejectReason: null },
    include: { uploader: { select: { nickname: true } } },
  })
  if (prev && prev.status !== 'published') {
    try {
      const { notifyArtistNewTrack, createNotification } = await import('../../services/notify.js')
      await notifyArtistNewTrack(track)
      await createNotification({
        userId: track.uploaderId,
        channel: 'notice',
        type: 'track_approved',
        title: '系统通知',
        body: `你上传的《${track.name}》已通过审核并发布。`,
        trackId: track.id,
        trackName: track.name,
        actorNickname: '系统通知',
      })
    } catch (e) {
      console.warn('[approve notify]', e)
    }
  }
  return ok(res, toTrackDto(track))
})

router.post('/tracks/:id/reject', async (req, res) => {
  const reason = String(req.body.reason || '不符合规范')
  const track = await prisma.track.update({
    where: { id: req.params.id },
    data: { status: 'rejected', rejectReason: reason },
    include: { uploader: { select: { nickname: true } } },
  })
  try {
    const { createNotification } = await import('../../services/notify.js')
    await createNotification({
      userId: track.uploaderId,
      channel: 'notice',
      type: 'track_rejected',
      title: '系统通知',
      body: `你上传的《${track.name}》未通过审核：${reason}`,
      trackId: track.id,
      trackName: track.name,
      actorNickname: '系统通知',
    })
  } catch (e) {
    console.warn('[reject notify]', e)
  }
  return ok(res, toTrackDto(track))
})

router.post('/tracks/:id/offline', async (req, res) => {
  const track = await offlineTrackById(req.params.id)
  if (!track) return fail(res, 40401, '歌曲不存在', 404)
  return ok(res, toTrackDto(track), '已下架并通知相关用户')
})

router.delete('/tracks/:id', async (req: AuthedRequest, res) => {
  const okDelete = await deleteTrackFully(req.params.id)
  if (!okDelete) return fail(res, 40401, '歌曲不存在', 404)
  return ok(res, true, '已删除并通知相关用户')
})

// ——— Banner ———
router.get('/banners', async (_req, res) => {
  const list = await prisma.banner.findMany({ orderBy: [{ sort: 'asc' }, { id: 'asc' }] })
  return ok(res, list.map(toBannerDto))
})

router.post('/banners', async (req, res) => {
  const title = String(req.body.title || '').trim()
  const imageUrl = String(req.body.imageUrl || '').trim()
  if (!title) return fail(res, 40001, '标题不能为空')
  if (!imageUrl) return fail(res, 40001, '请提供图片地址')
  const sort = Number(req.body.sort)
  const created = await prisma.banner.create({
    data: {
      title,
      imageUrl: imageUrl.replace(/^\/media\//, ''),
      linkUrl: String(req.body.linkUrl || '').trim() || null,
      sort: Number.isFinite(sort) ? Math.floor(sort) : 0,
      enabled: req.body.enabled === undefined ? true : Boolean(req.body.enabled),
    },
  })
  return ok(res, toBannerDto(created), '已创建')
})

router.put('/banners/:id', async (req, res) => {
  const exists = await prisma.banner.findUnique({ where: { id: req.params.id } })
  if (!exists) return fail(res, 40401, 'Banner 不存在', 404)
  const data: Record<string, unknown> = {}
  if (req.body.title !== undefined) {
    const title = String(req.body.title || '').trim()
    if (!title) return fail(res, 40001, '标题不能为空')
    data.title = title
  }
  if (req.body.imageUrl !== undefined) {
    const imageUrl = String(req.body.imageUrl || '').trim()
    if (!imageUrl) return fail(res, 40001, '请提供图片地址')
    data.imageUrl = imageUrl.replace(/^\/media\//, '')
  }
  if (req.body.linkUrl !== undefined) {
    data.linkUrl = String(req.body.linkUrl || '').trim() || null
  }
  if (req.body.sort !== undefined) {
    const sort = Number(req.body.sort)
    data.sort = Number.isFinite(sort) ? Math.floor(sort) : 0
  }
  if (req.body.enabled !== undefined) data.enabled = Boolean(req.body.enabled)
  const updated = await prisma.banner.update({ where: { id: exists.id }, data })
  return ok(res, toBannerDto(updated), '已保存')
})

router.delete('/banners/:id', async (req, res) => {
  const exists = await prisma.banner.findUnique({ where: { id: req.params.id } })
  if (!exists) return fail(res, 40401, 'Banner 不存在', 404)
  await prisma.banner.delete({ where: { id: exists.id } })
  return ok(res, true, '已删除')
})

router.post('/banners/upload', (req, res) => {
  bannerUpload.single('image')(req, res, async (err) => {
    if (err) return fail(res, 40001, err instanceof Error ? err.message : '上传失败')
    if (!req.file) return fail(res, 40001, '请选择图片')
    const relative = path.relative(config.storageRoot, req.file.path).replace(/\\/g, '/')
    return ok(res, { imageUrl: toPublicUrl(relative), relativePath: relative })
  })
})

// ——— Settings ———
router.get('/settings', async (_req, res) => {
  return ok(res, await getAppSettings())
})

router.put('/settings', async (req, res) => {
  try {
    const saved = await saveAppSettings({
      uploadNeedReview:
        req.body.uploadNeedReview !== undefined
          ? Boolean(req.body.uploadNeedReview)
          : undefined,
      uploadMaxSizeMb:
        req.body.uploadMaxSizeMb !== undefined
          ? Number(req.body.uploadMaxSizeMb)
          : undefined,
      registerEnabled:
        req.body.registerEnabled !== undefined
          ? Boolean(req.body.registerEnabled)
          : undefined,
      siteName: req.body.siteName !== undefined ? String(req.body.siteName) : undefined,
      siteAnnouncement:
        req.body.siteAnnouncement !== undefined
          ? String(req.body.siteAnnouncement)
          : undefined,
    })
    return ok(res, saved, '设置已保存')
  } catch (e) {
    return fail(res, 40001, e instanceof Error ? e.message : '保存失败')
  }
})

// ——— Comments ———
router.get('/comments', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20))
  const keyword = String(req.query.keyword || '').trim()
  const where = keyword
    ? {
        OR: [
          { content: { contains: keyword } },
          { user: { nickname: { contains: keyword } } },
          { track: { name: { contains: keyword } } },
        ],
      }
    : {}
  const [total, list] = await Promise.all([
    prisma.comment.count({ where }),
    prisma.comment.findMany({
      where,
      include: {
        user: { select: { id: true, nickname: true, account: true } },
        track: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])
  return ok(res, {
    list: list.map((c) => ({
      id: c.id,
      content: c.content,
      parentId: c.parentId,
      likeCount: c.likeCount,
      createdAt: c.createdAt.toISOString(),
      user: c.user,
      track: c.track,
    })),
    total,
    page,
    pageSize,
  })
})

router.delete('/comments/:id', async (req, res) => {
  const exists = await prisma.comment.findUnique({ where: { id: req.params.id } })
  if (!exists) return fail(res, 40401, '评论不存在', 404)
  await prisma.comment.delete({ where: { id: exists.id } })
  return ok(res, true, '已删除评论')
})

// ——— Playlists ———
router.get('/playlists', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20))
  const keyword = String(req.query.keyword || '').trim()
  const onlyPublic = String(req.query.public || '') === '1'
  const onlyFeatured = String(req.query.featured || '') === '1'
  const where = {
    isSystem: false,
    ...(onlyPublic ? { isPublic: true } : {}),
    ...(onlyFeatured ? { featured: true } : {}),
    ...(keyword
      ? {
          OR: [
            { name: { contains: keyword } },
            { owner: { nickname: { contains: keyword } } },
          ],
        }
      : {}),
  }
  const [total, list] = await Promise.all([
    prisma.playlist.count({ where }),
    prisma.playlist.findMany({
      where,
      include: {
        owner: { select: { id: true, nickname: true, account: true } },
        _count: { select: { tracks: true } },
      },
      orderBy: [{ featured: 'desc' }, { recommendSort: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])
  return ok(res, {
    list: list.map((p) => ({
      id: p.id,
      name: p.name,
      coverUrl: toPublicUrl(p.coverUrl),
      description: p.description,
      tags: p.tags,
      isPublic: p.isPublic,
      featured: p.featured,
      recommendSort: p.recommendSort,
      isSystem: p.isSystem,
      ownerId: p.ownerId,
      ownerNickname: p.owner.nickname,
      ownerAccount: p.owner.account,
      trackCount: p._count.tracks,
      createdAt: p.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  })
})

router.patch('/playlists/:id', async (req, res) => {
  const id = Array.isArray(req.params.id) ? String(req.params.id[0] || '') : String(req.params.id || '')
  const playlist = await prisma.playlist.findUnique({ where: { id } })
  if (!playlist) return fail(res, 40401, '歌单不存在', 404)
  if (playlist.isSystem) return fail(res, 40002, '系统歌单不可修改')
  const data: Record<string, unknown> = {}
  if (req.body.isPublic !== undefined) data.isPublic = Boolean(req.body.isPublic)
  if (req.body.name !== undefined) {
    const name = String(req.body.name || '').trim()
    if (!name) return fail(res, 40001, '名称不能为空')
    data.name = name.slice(0, 40)
  }
  if (req.body.featured !== undefined) data.featured = Boolean(req.body.featured)
  if (req.body.recommendSort !== undefined) {
    const n = Number(req.body.recommendSort)
    if (!Number.isFinite(n)) return fail(res, 40001, '排序值无效')
    data.recommendSort = Math.max(0, Math.min(9999, Math.round(n)))
  }

  // 推荐位必须公开；取消公开则同步取消推荐
  const nextPublic =
    data.isPublic !== undefined ? Boolean(data.isPublic) : playlist.isPublic
  const nextFeatured =
    data.featured !== undefined ? Boolean(data.featured) : playlist.featured
  if (nextFeatured && !nextPublic) {
    if (data.featured === true && data.isPublic === undefined) {
      data.isPublic = true
    } else if (data.isPublic === false) {
      data.featured = false
    }
  }

  const updated = await prisma.playlist.update({ where: { id: playlist.id }, data })
  return ok(
    res,
    {
      id: updated.id,
      name: updated.name,
      isPublic: updated.isPublic,
      featured: updated.featured,
      recommendSort: updated.recommendSort,
    },
    '已更新',
  )
})

router.delete('/playlists/:id', async (req, res) => {
  const playlist = await prisma.playlist.findUnique({ where: { id: req.params.id } })
  if (!playlist) return fail(res, 40401, '歌单不存在', 404)
  if (playlist.isSystem) return fail(res, 40002, '系统歌单不可删除')
  await prisma.playlist.delete({ where: { id: playlist.id } })
  return ok(res, true, '已删除歌单')
})

export default router
