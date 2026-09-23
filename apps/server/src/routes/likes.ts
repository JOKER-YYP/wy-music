import { Router } from 'express'
import { prisma } from '../db.js'
import { fail, ok } from '../utils/response.js'
import { toTrackDto } from '../utils/mapper.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'

const router = Router()

router.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const likes = await prisma.like.findMany({
    where: { userId: req.user!.id },
    include: {
      track: { include: { uploader: { select: { nickname: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return ok(
    res,
    likes
      .filter((l) => l.track.status === 'published')
      .map((l) => toTrackDto(l.track, true)),
  )
})

router.post('/:trackId', requireAuth, async (req: AuthedRequest, res) => {
  const trackId = req.params.trackId
  const track = await prisma.track.findUnique({ where: { id: trackId } })
  if (!track || track.status !== 'published') {
    return fail(res, 40401, '歌曲不存在', 404)
  }
  const existing = await prisma.like.findUnique({
    where: { userId_trackId: { userId: req.user!.id, trackId } },
  })
  if (existing) {
    await prisma.like.delete({
      where: { userId_trackId: { userId: req.user!.id, trackId } },
    })
    return ok(res, { liked: false })
  }
  await prisma.like.create({
    data: { userId: req.user!.id, trackId },
  })
  return ok(res, { liked: true })
})

export default router
