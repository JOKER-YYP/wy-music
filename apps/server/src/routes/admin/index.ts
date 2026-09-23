import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '../../db.js'
import { fail, ok } from '../../utils/response.js'
import { toTrackDto, toUserPublic } from '../../utils/mapper.js'
import {
  requireAdmin,
  signAccessToken,
  signRefreshToken,
  type AuthedRequest,
} from '../../middleware/auth.js'

const router = Router()

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
  const [userCount, trackCount, publishedCount, pendingCount, todayUploadCount, todayPlayCount] =
    await Promise.all([
      prisma.user.count(),
      prisma.track.count(),
      prisma.track.count({ where: { status: 'published' } }),
      prisma.track.count({ where: { status: 'pending' } }),
      prisma.track.count({ where: { createdAt: { gte: start } } }),
      prisma.playHistory.count({ where: { playedAt: { gte: start } } }),
    ])
  return ok(res, {
    userCount,
    trackCount,
    publishedCount,
    pendingCount,
    todayUploadCount,
    todayPlayCount,
  })
})

router.get('/users', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20))
  const keyword = String(req.query.keyword || '').trim()
  const where = keyword
    ? {
        OR: [{ account: { contains: keyword } }, { nickname: { contains: keyword } }],
      }
    : {}
  const [total, list] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])
  return ok(res, {
    list: list.map(toUserPublic).map((u, i) => ({ ...u, status: list[i].status })),
    total,
    page,
    pageSize,
  })
})

router.patch('/users/:id/status', async (req, res) => {
  const status = Number(req.body.status)
  if (![0, 1].includes(status)) {
    return fail(res, 40001, 'status 只能为 0 或 1')
  }
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { status },
  })
  return ok(res, { ...toUserPublic(user), status: user.status })
})

router.get('/tracks', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20))
  const status = String(req.query.status || '').trim()
  const keyword = String(req.query.keyword || '').trim()
  const where = {
    ...(status ? { status } : {}),
    ...(keyword
      ? {
          OR: [{ name: { contains: keyword } }, { artists: { contains: keyword } }],
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
    list: list.map((t) => toTrackDto(t)),
    total,
    page,
    pageSize,
  })
})

router.post('/tracks/:id/approve', async (req, res) => {
  const track = await prisma.track.update({
    where: { id: req.params.id },
    data: { status: 'published', rejectReason: null },
    include: { uploader: { select: { nickname: true } } },
  })
  return ok(res, toTrackDto(track))
})

router.post('/tracks/:id/reject', async (req, res) => {
  const reason = String(req.body.reason || '不符合规范')
  const track = await prisma.track.update({
    where: { id: req.params.id },
    data: { status: 'rejected', rejectReason: reason },
    include: { uploader: { select: { nickname: true } } },
  })
  return ok(res, toTrackDto(track))
})

router.post('/tracks/:id/offline', async (req, res) => {
  const track = await prisma.track.update({
    where: { id: req.params.id },
    data: { status: 'offline' },
    include: { uploader: { select: { nickname: true } } },
  })
  return ok(res, toTrackDto(track))
})

router.delete('/tracks/:id', async (req: AuthedRequest, res) => {
  await prisma.track.delete({ where: { id: req.params.id } })
  return ok(res, true)
})

export default router
