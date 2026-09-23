import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { fail, ok } from '../utils/response.js'
import { optionalAuth, requireAuth, type AuthedRequest } from '../middleware/auth.js'

const router = Router()

function toCommentDto(
  c: {
    id: string
    trackId: string
    content: string
    parentId: string | null
    likeCount: number
    createdAt: Date
    user: { id: string; nickname: string; avatarUrl: string | null }
    _count?: { replies: number; likes?: number }
  },
  liked = false,
) {
  return {
    id: c.id,
    trackId: c.trackId,
    content: c.content,
    parentId: c.parentId,
    likeCount: c.likeCount,
    liked,
    replyCount: c._count?.replies ?? 0,
    createdAt: c.createdAt.toISOString(),
    user: {
      id: c.user.id,
      nickname: c.user.nickname,
      avatarUrl: c.user.avatarUrl,
    },
  }
}

/** GET /api/comments/track/:trackId */
router.get('/track/:trackId', optionalAuth, async (req: AuthedRequest, res) => {
  const trackId = req.params.trackId
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20))
  const parentId = req.query.parentId ? String(req.query.parentId) : null

  const track = await prisma.track.findUnique({ where: { id: trackId }, select: { id: true } })
  if (!track) return fail(res, 40401, '歌曲不存在', 404)

  const where = {
    trackId,
    parentId: parentId || null,
  }

  const [total, list] = await Promise.all([
    prisma.comment.count({ where }),
    prisma.comment.findMany({
      where,
      include: {
        user: { select: { id: true, nickname: true, avatarUrl: true } },
        _count: { select: { replies: true } },
      },
      orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  let likedSet = new Set<string>()
  if (req.user && list.length) {
    const likes = await prisma.commentLike.findMany({
      where: {
        userId: req.user.id,
        commentId: { in: list.map((c) => c.id) },
      },
      select: { commentId: true },
    })
    likedSet = new Set(likes.map((l) => l.commentId))
  }

  const rootTotal = parentId
    ? total
    : await prisma.comment.count({ where: { trackId, parentId: null } })

  return ok(res, {
    list: list.map((c) => toCommentDto(c, likedSet.has(c.id))),
    total: rootTotal,
    page,
    pageSize,
  })
})

/** GET /api/comments/track/:trackId/count */
router.get('/track/:trackId/count', async (req, res) => {
  const trackId = req.params.trackId
  const total = await prisma.comment.count({
    where: { trackId, parentId: null },
  })
  return ok(res, { total })
})

/** POST /api/comments/track/:trackId */
router.post('/track/:trackId', requireAuth, async (req: AuthedRequest, res) => {
  const trackId = req.params.trackId
  const parsed = z
    .object({
      content: z.string().trim().min(1).max(500),
      parentId: z.string().optional().nullable(),
    })
    .safeParse(req.body)
  if (!parsed.success) {
    return fail(res, 40001, '评论内容不能为空（最多 500 字）')
  }

  const track = await prisma.track.findUnique({ where: { id: trackId } })
  if (!track || track.status !== 'published') {
    return fail(res, 40401, '歌曲不存在', 404)
  }

  let parentId: string | null = parsed.data.parentId || null
  if (parentId) {
    const parent = await prisma.comment.findUnique({ where: { id: parentId } })
    if (!parent || parent.trackId !== trackId) {
      return fail(res, 40002, '回复的评论不存在')
    }
    // 只允许一层回复：挂到根评论下
    if (parent.parentId) parentId = parent.parentId
  }

  const comment = await prisma.comment.create({
    data: {
      trackId,
      userId: req.user!.id,
      content: parsed.data.content,
      parentId,
    },
    include: {
      user: { select: { id: true, nickname: true, avatarUrl: true } },
      _count: { select: { replies: true } },
    },
  })

  return ok(res, toCommentDto(comment, false), '发布成功')
})

/** POST /api/comments/:id/like */
router.post('/:id/like', requireAuth, async (req: AuthedRequest, res) => {
  const id = req.params.id
  const comment = await prisma.comment.findUnique({ where: { id } })
  if (!comment) return fail(res, 40401, '评论不存在', 404)

  const existing = await prisma.commentLike.findUnique({
    where: { userId_commentId: { userId: req.user!.id, commentId: id } },
  })

  if (existing) {
    await prisma.$transaction([
      prisma.commentLike.delete({
        where: { userId_commentId: { userId: req.user!.id, commentId: id } },
      }),
      prisma.comment.update({
        where: { id },
        data: { likeCount: { decrement: 1 } },
      }),
    ])
    const updated = await prisma.comment.findUnique({ where: { id } })
    return ok(res, { liked: false, likeCount: Math.max(0, updated?.likeCount ?? 0) })
  }

  await prisma.$transaction([
    prisma.commentLike.create({
      data: { userId: req.user!.id, commentId: id },
    }),
    prisma.comment.update({
      where: { id },
      data: { likeCount: { increment: 1 } },
    }),
  ])
  const updated = await prisma.comment.findUnique({ where: { id } })
  return ok(res, { liked: true, likeCount: updated?.likeCount ?? 0 })
})

/** DELETE /api/comments/:id */
router.delete('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const comment = await prisma.comment.findUnique({ where: { id: req.params.id } })
  if (!comment) return fail(res, 40401, '评论不存在', 404)
  if (comment.userId !== req.user!.id && req.user!.role !== 'admin') {
    return fail(res, 40301, '无权删除', 403)
  }
  await prisma.comment.delete({ where: { id: comment.id } })
  return ok(res, true, '已删除')
})

export default router
