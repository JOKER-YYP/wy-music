import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { fail, ok } from '../utils/response.js'
import { toTrackDto } from '../utils/mapper.js'
import { toPublicUrl } from '../utils/storage.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'

const router = Router()

function toPlaylistDto(
  p: {
    id: string
    name: string
    coverUrl: string | null
    description: string | null
    isSystem: boolean
    isPublic: boolean
    ownerId: string
    createdAt: Date
    _count?: { tracks: number }
    tracks?: { track: { coverUrl: string | null } }[]
  },
) {
  const coverFromTrack = p.tracks?.[0]?.track?.coverUrl
  return {
    id: p.id,
    name: p.name,
    // 优先用歌单内第一首歌封面（转成可访问的公开 URL）
    coverUrl: toPublicUrl(coverFromTrack || p.coverUrl),
    description: p.description,
    isSystem: p.isSystem,
    isPublic: p.isPublic,
    ownerId: p.ownerId,
    trackCount: p._count?.tracks ?? 0,
    createdAt: p.createdAt.toISOString(),
  }
}

router.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const list = await prisma.playlist.findMany({
    where: { ownerId: req.user!.id },
    include: {
      _count: { select: { tracks: true } },
      tracks: {
        orderBy: { position: 'asc' },
        take: 1,
        include: { track: { select: { coverUrl: true } } },
      },
    },
    orderBy: [{ isSystem: 'desc' }, { createdAt: 'desc' }],
  })
  return ok(res, list.map(toPlaylistDto))
})

router.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      name: z.string().min(1).max(40),
      description: z.string().max(200).optional(),
      isPublic: z.boolean().optional(),
    })
    .safeParse(req.body)
  if (!parsed.success) {
    return fail(res, 40001, '歌单名称不能为空')
  }
  const playlist = await prisma.playlist.create({
    data: {
      name: parsed.data.name.trim(),
      description: parsed.data.description || null,
      isPublic: parsed.data.isPublic ?? false,
      isSystem: false,
      ownerId: req.user!.id,
    },
    include: {
      _count: { select: { tracks: true } },
    },
  })
  return ok(res, toPlaylistDto(playlist), '创建成功')
})

router.get('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const playlist = await prisma.playlist.findUnique({
    where: { id: req.params.id },
    include: {
      _count: { select: { tracks: true } },
      tracks: {
        orderBy: { position: 'asc' },
        include: {
          track: { include: { uploader: { select: { nickname: true } } } },
        },
      },
      owner: { select: { id: true, nickname: true, avatarUrl: true } },
    },
  })
  if (!playlist) {
    return fail(res, 40401, '歌单不存在', 404)
  }
  if (playlist.ownerId !== req.user!.id && !playlist.isPublic && req.user!.role !== 'admin') {
    return fail(res, 40301, '无权查看该歌单', 403)
  }

  let likedSet = new Set<string>()
  const trackIds = playlist.tracks.map((t) => t.trackId)
  if (trackIds.length) {
    const likes = await prisma.like.findMany({
      where: { userId: req.user!.id, trackId: { in: trackIds } },
      select: { trackId: true },
    })
    likedSet = new Set(likes.map((l) => l.trackId))
  }

  return ok(res, {
    ...toPlaylistDto(playlist),
    ownerNickname: playlist.owner.nickname,
    ownerAvatar: playlist.owner.avatarUrl,
    tracks: playlist.tracks
      .filter((t) => t.track.status === 'published' || playlist.ownerId === req.user!.id)
      .map((t) => toTrackDto(t.track, likedSet.has(t.trackId))),
  })
})

router.put('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const playlist = await prisma.playlist.findUnique({ where: { id: req.params.id } })
  if (!playlist) return fail(res, 40401, '歌单不存在', 404)
  if (playlist.ownerId !== req.user!.id) return fail(res, 40301, '无权修改', 403)
  if (playlist.isSystem) return fail(res, 40002, '系统歌单不可重命名')

  const name = String(req.body.name || '').trim()
  if (!name) return fail(res, 40001, '名称不能为空')

  const updated = await prisma.playlist.update({
    where: { id: playlist.id },
    data: {
      name,
      description:
        req.body.description !== undefined ? String(req.body.description || '') || null : undefined,
    },
    include: {
      _count: { select: { tracks: true } },
      tracks: {
        orderBy: { position: 'asc' },
        take: 1,
        include: { track: { select: { coverUrl: true } } },
      },
    },
  })
  return ok(res, toPlaylistDto(updated))
})

router.delete('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const playlist = await prisma.playlist.findUnique({ where: { id: req.params.id } })
  if (!playlist) return fail(res, 40401, '歌单不存在', 404)
  if (playlist.ownerId !== req.user!.id) return fail(res, 40301, '无权删除', 403)
  if (playlist.isSystem) return fail(res, 40002, '系统歌单不可删除')
  await prisma.playlist.delete({ where: { id: playlist.id } })
  return ok(res, true, '已删除')
})

router.post('/:id/tracks', requireAuth, async (req: AuthedRequest, res) => {
  const playlist = await prisma.playlist.findUnique({ where: { id: req.params.id } })
  if (!playlist) return fail(res, 40401, '歌单不存在', 404)
  if (playlist.ownerId !== req.user!.id) return fail(res, 40301, '无权操作', 403)

  const trackId = String(req.body.trackId || '')
  if (!trackId) return fail(res, 40001, '缺少 trackId')

  const track = await prisma.track.findUnique({ where: { id: trackId } })
  if (!track || track.status !== 'published') return fail(res, 40402, '歌曲不存在', 404)

  const exists = await prisma.playlistTrack.findUnique({
    where: { playlistId_trackId: { playlistId: playlist.id, trackId } },
  })
  if (exists) return ok(res, true, '已在歌单中')

  const maxPos = await prisma.playlistTrack.aggregate({
    where: { playlistId: playlist.id },
    _max: { position: true },
  })
  await prisma.playlistTrack.create({
    data: {
      playlistId: playlist.id,
      trackId,
      position: (maxPos._max.position ?? -1) + 1,
    },
  })

  // 若歌单尚无封面，用这首歌封面写入
  if (!playlist.coverUrl && track.coverUrl) {
    await prisma.playlist.update({
      where: { id: playlist.id },
      data: { coverUrl: track.coverUrl },
    })
  }

  return ok(res, true, '已添加')
})

router.delete('/:id/tracks/:trackId', requireAuth, async (req: AuthedRequest, res) => {
  const playlist = await prisma.playlist.findUnique({ where: { id: req.params.id } })
  if (!playlist) return fail(res, 40401, '歌单不存在', 404)
  if (playlist.ownerId !== req.user!.id) return fail(res, 40301, '无权操作', 403)

  await prisma.playlistTrack.deleteMany({
    where: { playlistId: playlist.id, trackId: req.params.trackId },
  })
  return ok(res, true, '已移除')
})

export default router
