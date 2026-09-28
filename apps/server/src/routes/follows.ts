import { Router } from 'express'
import { prisma } from '../db.js'
import { fail, ok } from '../utils/response.js'
import { requireAuth, optionalAuth, type AuthedRequest } from '../middleware/auth.js'

const router = Router()

function normalizeArtistName(raw: string) {
  return String(raw || '').trim()
}

/** 我关注的歌手列表 */
router.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const list = await prisma.artistFollow.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
  })
  return ok(res, {
    list: list.map((f) => ({
      artistName: f.artistName,
      createdAt: f.createdAt.toISOString(),
    })),
  })
})

/** 是否已关注 */
router.get('/status', optionalAuth, async (req: AuthedRequest, res) => {
  const name = normalizeArtistName(String(req.query.name || ''))
  if (!name) return ok(res, { followed: false })
  if (!req.user) return ok(res, { followed: false })
  const row = await prisma.artistFollow.findUnique({
    where: {
      userId_artistName: { userId: req.user.id, artistName: name },
    },
  })
  return ok(res, { followed: Boolean(row) })
})

/** 关注 */
router.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const name = normalizeArtistName(String(req.body.name || req.body.artistName || ''))
  if (!name || name === '未知歌手') {
    return fail(res, 40001, '歌手名无效')
  }
  await prisma.artistFollow.upsert({
    where: {
      userId_artistName: { userId: req.user!.id, artistName: name },
    },
    create: { userId: req.user!.id, artistName: name },
    update: {},
  })
  return ok(res, { followed: true, artistName: name }, '已关注')
})

/** 取消关注 */
router.delete('/:name', requireAuth, async (req: AuthedRequest, res) => {
  const raw = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name
  const name = normalizeArtistName(decodeURIComponent(String(raw || '')))
  if (!name) return fail(res, 40001, '歌手名无效')
  await prisma.artistFollow.deleteMany({
    where: { userId: req.user!.id, artistName: name },
  })
  return ok(res, { followed: false, artistName: name }, '已取消关注')
})

export default router
