import { Router } from 'express'
import { prisma } from '../db.js'
import { fail, ok } from '../utils/response.js'
import { toTrackDto } from '../utils/mapper.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'

const router = Router()

router.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const list = await prisma.playHistory.findMany({
    where: { userId: req.user!.id },
    include: {
      track: { include: { uploader: { select: { nickname: true } } } },
    },
    orderBy: { playedAt: 'desc' },
    take: 200,
  })

  // 同一首歌只保留最近一次播放
  const seen = new Set<string>()
  const unique = []
  for (const h of list) {
    if (seen.has(h.trackId)) continue
    seen.add(h.trackId)
    unique.push({
      ...toTrackDto(h.track),
      playedAt: h.playedAt.toISOString(),
    })
    if (unique.length >= 100) break
  }

  return ok(res, unique)
})

router.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const trackId = String(req.body.trackId || '')
  if (!trackId) {
    return fail(res, 40001, '缺少 trackId')
  }
  const track = await prisma.track.findUnique({ where: { id: trackId } })
  if (!track) {
    return fail(res, 40401, '歌曲不存在', 404)
  }

  const userId = req.user!.id
  // 同一用户同一首歌只保留一条记录，刷新 playedAt
  await prisma.$transaction([
    prisma.playHistory.deleteMany({ where: { userId, trackId } }),
    prisma.playHistory.create({
      data: { userId, trackId },
    }),
    prisma.track.update({
      where: { id: trackId },
      data: { playCount: { increment: 1 } },
    }),
  ])
  return ok(res, true)
})

router.delete('/', requireAuth, async (req: AuthedRequest, res) => {
  await prisma.playHistory.deleteMany({ where: { userId: req.user!.id } })
  return ok(res, true)
})

export default router
