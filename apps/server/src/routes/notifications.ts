import { Router } from 'express'
import { prisma } from '../db.js'
import { fail, ok } from '../utils/response.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import type { UserNotificationDto } from '@wy-music/shared'

const router = Router()

function toDto(n: {
  id: string
  type: string
  title: string
  body: string
  trackId: string | null
  trackName: string | null
  read: boolean
  createdAt: Date
}): UserNotificationDto {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    trackId: n.trackId,
    trackName: n.trackName,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  }
}

router.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const unreadOnly = String(req.query.unreadOnly || '') === 'true' || req.query.unreadOnly === '1'
  const type = String(req.query.type || '').trim()
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20))

  const where = {
    userId: req.user!.id,
    ...(unreadOnly ? { read: false } : {}),
    ...(type ? { type } : {}),
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

  if (readAll) {
    await prisma.userNotification.updateMany({
      where: { userId: req.user!.id, read: false },
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
