import { Router } from 'express'
import { prisma } from '../db.js'
import { fail, ok } from '../utils/response.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { toPublicUrl } from '../utils/storage.js'
import type { UserNotificationDto } from '@wy-music/shared'

const router = Router()

const CHANNELS = new Set(['dm', 'comment', 'mention', 'notice'])

function toDto(n: {
  id: string
  channel: string
  type: string
  title: string
  body: string
  trackId: string | null
  trackName: string | null
  actorId: string | null
  actorNickname: string | null
  actorAvatarUrl: string | null
  refId: string | null
  read: boolean
  createdAt: Date
}): UserNotificationDto {
  return {
    id: n.id,
    channel: n.channel || 'notice',
    type: n.type,
    title: n.title,
    body: n.body,
    trackId: n.trackId,
    trackName: n.trackName,
    actorId: n.actorId,
    actorNickname: n.actorNickname,
    actorAvatarUrl: toPublicUrl(n.actorAvatarUrl),
    refId: n.refId,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  }
}

/** 未读角标汇总 */
router.get('/unread-count', requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id
  const rows = await prisma.userNotification.groupBy({
    by: ['channel'],
    where: { userId, read: false },
    _count: { _all: true },
  })
  const byChannel: Record<string, number> = {
    dm: 0,
    comment: 0,
    mention: 0,
    notice: 0,
  }
  let total = 0
  for (const row of rows) {
    const ch = row.channel || 'notice'
    const count = row._count._all
    byChannel[ch] = (byChannel[ch] || 0) + count
    total += count
  }
  return ok(res, { total, byChannel })
})

router.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const unreadOnly = String(req.query.unreadOnly || '') === 'true' || req.query.unreadOnly === '1'
  const type = String(req.query.type || '').trim()
  const channel = String(req.query.channel || '').trim()
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20))

  const where = {
    userId: req.user!.id,
    ...(unreadOnly ? { read: false } : {}),
    ...(type ? { type } : {}),
    ...(channel && CHANNELS.has(channel) ? { channel } : {}),
  }

  const [total, list] = await Promise.all([
    prisma.userNotification.count({ where }),
    prisma.userNotification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return ok(res, {
    list: list.map(toDto),
    total,
    page,
    pageSize,
  })
})

router.post('/read', requireAuth, async (req: AuthedRequest, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : []
  const readAll = Boolean(req.body.readAll)
  const channel = String(req.body.channel || '').trim()

  if (readAll) {
    await prisma.userNotification.updateMany({
      where: {
        userId: req.user!.id,
        read: false,
        ...(channel && CHANNELS.has(channel) ? { channel } : {}),
      },
      data: { read: true },
    })
    return ok(res, true)
  }

  if (!ids.length) {
    return fail(res, 40001, '请指定要标记已读的通知')
  }

  await prisma.userNotification.updateMany({
    where: { userId: req.user!.id, id: { in: ids } },
    data: { read: true },
  })
  return ok(res, true)
})

export default router
