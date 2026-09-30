import { Router } from 'express'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../db.js'
import { fail, ok } from '../utils/response.js'
import { toTrackDto } from '../utils/mapper.js'
import { audioAbsolutePath, toPublicUrl } from '../utils/storage.js'
import { config } from '../config.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'

const router = Router()

const coverUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(config.storageRoot, 'playlist-covers')
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

function toPlaylistDto(p: {
  id: string
  name: string
  coverUrl: string | null
  description: string | null
  tags?: string | null
  isSystem: boolean
  isPublic: boolean
  ownerId: string
  createdAt: Date
  _count?: { tracks: number }
  tracks?: { track: { coverUrl: string | null } }[]
}) {
  const coverFromTrack = p.tracks?.[0]?.track?.coverUrl
  return {
    id: p.id,
    name: p.name,
    // 自定义封面优先，否则用歌单内第一首歌封面
    coverUrl: toPublicUrl(p.coverUrl || coverFromTrack),
    description: p.description,
    tags: p.tags ?? null,
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

router.post('/import/preview', requireAuth, async (req: AuthedRequest, res) => {
  const { fetchExternalPlaylist } = await import('../services/externalPlaylist.js')
  const { matchExternalSongs } = await import('../services/trackMatch.js')

  const rawUrls = Array.isArray(req.body?.urls) ? (req.body.urls as unknown[]) : []
  const urls = Array.from(
    new Set(
      rawUrls
        .filter((u): u is string => typeof u === 'string')
        .map((u) => u.trim())
        .filter(Boolean),
    ),
  ).slice(0, 10)

  if (!urls.length) return fail(res, 40001, '请至少粘贴一个歌单链接')

  const library = await prisma.track.findMany({
    where: { status: 'published' },
    select: { id: true, name: true, artists: true },
  })

  const sources: Array<Record<string, unknown>> = []
  for (const url of urls) {
    try {
      const remote = await fetchExternalPlaylist(url)
      const matchedRows = matchExternalSongs(remote.songs, library)
      const matched = matchedRows.flatMap((r) =>
        r.status === 'matched'
          ? [
              {
                name: r.remote.name,
                artists: r.remote.artists,
                trackId: r.trackId,
                trackName: r.trackName,
                trackArtists: r.trackArtists,
              },
            ]
          : [],
      )
      const missing = matchedRows.flatMap((r) =>
        r.status === 'missing'
          ? [
              {
                name: r.remote.name,
                artists: r.remote.artists,
              },
            ]
          : [],
      )

      sources.push({
        ok: true,
        url,
        platform: remote.platform,
        name: remote.name,
        description: remote.description,
        coverUrl: remote.coverUrl,
        total: remote.songs.length,
        matchedCount: matched.length,
        missingCount: missing.length,
        matched,
        missing,
      })
    } catch (e) {
      sources.push({
        ok: false,
        url,
        platform: null,
        name: null,
        error: e instanceof Error ? e.message : '解析失败',
        total: 0,
        matchedCount: 0,
        missingCount: 0,
        matched: [],
        missing: [],
      })
    }
  }

  return ok(res, { sources })
})

router.post('/import/confirm', requireAuth, async (req: AuthedRequest, res) => {
  const items = Array.isArray(req.body?.items) ? (req.body.items as unknown[]) : []
  if (!items.length) return fail(res, 40001, '没有可导入的歌单')

  const created: Array<ReturnType<typeof toPlaylistDto> & { added: number }> = []
  for (const rawItem of items.slice(0, 10)) {
    const raw = (rawItem && typeof rawItem === 'object' ? rawItem : {}) as Record<
      string,
      unknown
    >
    const name = String(raw.name || '').trim().slice(0, 40)
    if (!name) continue
    const description = String(raw.description || '').trim().slice(0, 1000) || null
    const isPublic = raw.isPublic === true
    const rawIds = Array.isArray(raw.trackIds) ? (raw.trackIds as unknown[]) : []
    const trackIds = Array.from(
      new Set(
        rawIds
          .filter((id): id is string => typeof id === 'string')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    )

    const playlist = await prisma.playlist.create({
      data: {
        name,
        description,
        isPublic,
        isSystem: false,
        ownerId: req.user!.id,
      },
    })

    let added = 0
    if (trackIds.length) {
      const tracks = await prisma.track.findMany({
        where: { id: { in: trackIds }, status: 'published' },
        select: { id: true, coverUrl: true },
      })
      const order = new Map(trackIds.map((id, i) => [id, i]))
      tracks.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))

      if (tracks.length) {
        await prisma.playlistTrack.createMany({
          data: tracks.map((t, i) => ({
            playlistId: playlist.id,
            trackId: t.id,
            position: i,
          })),
        })
        added = tracks.length
        const cover = tracks.find((t) => t.coverUrl)?.coverUrl
        if (cover) {
          await prisma.playlist.update({
            where: { id: playlist.id },
            data: { coverUrl: cover },
          })
        }
      }
    }

    const full = await prisma.playlist.findUnique({
      where: { id: playlist.id },
      include: {
        _count: { select: { tracks: true } },
        tracks: {
          orderBy: { position: 'asc' },
          take: 1,
          include: { track: { select: { coverUrl: true } } },
        },
      },
    })
    created.push({
      ...toPlaylistDto(full!),
      added,
    })
  }

  if (!created.length) return fail(res, 40001, '没有成功创建的歌单')
  return ok(res, { playlists: created }, `已导入 ${created.length} 个歌单`)
})

router.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      name: z.string().min(1).max(40),
      description: z.string().max(1000).optional(),
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
  if (playlist.isSystem) return fail(res, 40002, '系统歌单不可编辑')

  const parsed = z
    .object({
      name: z.string().min(1).max(40),
      description: z.string().max(1000).optional().nullable(),
      tags: z.string().max(200).optional().nullable(),
      isPublic: z.boolean().optional(),
    })
    .safeParse(req.body)
  if (!parsed.success) {
    return fail(res, 40001, '名称不能为空或参数无效')
  }

  const updated = await prisma.playlist.update({
    where: { id: playlist.id },
    data: {
      name: parsed.data.name.trim(),
      description:
        parsed.data.description !== undefined
          ? String(parsed.data.description || '').trim() || null
          : undefined,
      tags:
        parsed.data.tags !== undefined
          ? String(parsed.data.tags || '').trim() || null
          : undefined,
      isPublic: parsed.data.isPublic,
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
  return ok(res, toPlaylistDto(updated), '已保存')
})

router.post('/:id/cover', requireAuth, (req: AuthedRequest, res) => {
  coverUpload.single('cover')(req, res, async (err) => {
    if (err) {
      return fail(res, 40001, err instanceof Error ? err.message : '上传失败')
    }
    if (!req.file) {
      return fail(res, 40001, '请选择封面图片')
    }
    const relative = path.relative(config.storageRoot, req.file.path).replace(/\\/g, '/')
    try {
      const playlist = await prisma.playlist.findUnique({ where: { id: req.params.id } })
      if (!playlist) {
        try {
          if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
        } catch {
          /* ignore */
        }
        return fail(res, 40401, '歌单不存在', 404)
      }
      if (playlist.ownerId !== req.user!.id) {
        try {
          if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
        } catch {
          /* ignore */
        }
        return fail(res, 40301, '无权修改', 403)
      }
      if (playlist.isSystem) {
        try {
          if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
        } catch {
          /* ignore */
        }
        return fail(res, 40002, '系统歌单不可编辑', 400)
      }

      const updated = await prisma.playlist.update({
        where: { id: playlist.id },
        data: { coverUrl: relative },
        include: {
          _count: { select: { tracks: true } },
          tracks: {
            orderBy: { position: 'asc' },
            take: 1,
            include: { track: { select: { coverUrl: true } } },
          },
        },
      })

      if (playlist.coverUrl && playlist.coverUrl !== relative && playlist.coverUrl.startsWith('playlist-covers/')) {
        try {
          const oldAbs = audioAbsolutePath(playlist.coverUrl)
          if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs)
        } catch {
          /* ignore */
        }
      }

      return ok(res, toPlaylistDto(updated), '封面已更新')
    } catch (e) {
      try {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
      } catch {
        /* ignore */
      }
      return fail(res, 50001, e instanceof Error ? e.message : '保存失败', 500)
    }
  })
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
