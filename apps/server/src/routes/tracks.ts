import fs from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { parseFile } from 'music-metadata'
import { AUDIO_EXT_WHITELIST, resolveTrackMeta } from '@wy-music/shared'
import { prisma } from '../db.js'
import { config } from '../config.js'
import { fail, ok } from '../utils/response.js'
import { toTrackDto } from '../utils/mapper.js'
import { hashFile, audioAbsolutePath } from '../utils/storage.js'
import {
  requireAuth,
  optionalAuth,
  type AuthedRequest,
} from '../middleware/auth.js'

const router = Router()

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const now = new Date()
    const dir = path.join(
      config.storageRoot,
      'audio',
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0'),
    )
    fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp3'
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: config.uploadMaxSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (!AUDIO_EXT_WHITELIST.includes(ext as (typeof AUDIO_EXT_WHITELIST)[number])) {
      cb(new Error(`不支持的音频格式: ${ext}`))
      return
    }
    cb(null, true)
  },
})

router.get('/', optionalAuth, async (req: AuthedRequest, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20))
  const keyword = String(req.query.keyword || '').trim()
  const where = {
    status: 'published',
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

  let likedSet = new Set<string>()
  if (req.user) {
    const likes = await prisma.like.findMany({
      where: { userId: req.user.id, trackId: { in: list.map((t) => t.id) } },
      select: { trackId: true },
    })
    likedSet = new Set(likes.map((l) => l.trackId))
  }

  return ok(res, {
    list: list.map((t) => toTrackDto(t, likedSet.has(t.id))),
    total,
    page,
    pageSize,
  })
})

router.get('/mine', requireAuth, async (req: AuthedRequest, res) => {
  const list = await prisma.track.findMany({
    where: { uploaderId: req.user!.id },
    include: { uploader: { select: { nickname: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return ok(res, list.map((t) => toTrackDto(t)))
})

router.get('/:id', optionalAuth, async (req: AuthedRequest, res) => {
  const track = await prisma.track.findUnique({
    where: { id: req.params.id },
    include: { uploader: { select: { nickname: true } } },
  })
  if (!track) {
    return fail(res, 40401, '歌曲不存在', 404)
  }
  const isOwner = req.user?.id === track.uploaderId
  const isAdmin = req.user?.role === 'admin'
  if (track.status !== 'published' && !isOwner && !isAdmin) {
    return fail(res, 40401, '歌曲不存在', 404)
  }
  let liked = false
  if (req.user) {
    const like = await prisma.like.findUnique({
      where: { userId_trackId: { userId: req.user.id, trackId: track.id } },
    })
    liked = Boolean(like)
  }
  return ok(res, toTrackDto(track, liked))
})

router.get('/:id/stream', optionalAuth, async (req: AuthedRequest, res) => {
  // 支持 <audio src> 通过 query token 鉴权
  if (!req.user && typeof req.query.token === 'string' && req.query.token) {
    try {
      const { verifyAccessToken } = await import('../middleware/auth.js')
      const payload = verifyAccessToken(req.query.token)
      const user = await prisma.user.findUnique({ where: { id: payload.sub } })
      if (user && user.status === 1) {
        req.user = {
          id: user.id,
          role: user.role as 'user' | 'admin',
          account: user.account,
          nickname: user.nickname,
        }
      }
    } catch {
      // ignore
    }
  }
  if (!req.user) {
    return fail(res, 40101, '请先登录后播放', 401)
  }
  const track = await prisma.track.findUnique({ where: { id: req.params.id } })
  if (!track) {
    return fail(res, 40401, '歌曲不存在', 404)
  }
  const canPlay =
    track.status === 'published' ||
    track.uploaderId === req.user.id ||
    req.user.role === 'admin'
  if (!canPlay) {
    return fail(res, 40302, '歌曲暂不可播放', 403)
  }

  let abs: string
  try {
    abs = audioAbsolutePath(track.audioPath)
  } catch {
    return fail(res, 50001, '文件路径非法', 500)
  }
  if (!fs.existsSync(abs)) {
    return fail(res, 40402, '音频文件丢失', 404)
  }

  const stat = fs.statSync(abs)
  const range = req.headers.range
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Content-Type', track.mimeType || 'audio/mpeg')

  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range)
    if (match) {
      const start = Number(match[1])
      const end = match[2] ? Number(match[2]) : stat.size - 1
      res.status(206)
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
      res.setHeader('Content-Length', end - start + 1)
      fs.createReadStream(abs, { start, end }).pipe(res)
      return
    }
  }

  res.setHeader('Content-Length', stat.size)
  fs.createReadStream(abs).pipe(res)
})

router.get('/:id/lyric', optionalAuth, async (req, res) => {
  const track = await prisma.track.findUnique({ where: { id: req.params.id } })
  if (!track || track.status !== 'published') {
    return fail(res, 40401, '歌曲不存在', 404)
  }
  return ok(res, { lyricText: track.lyricText || '' })
})

router.post(
  '/upload',
  requireAuth,
  (req, res, next) => {
    upload.single('audio')(req, res, (err) => {
      if (err) {
        return fail(res, 40010, err.message || '上传失败')
      }
      next()
    })
  },
  async (req: AuthedRequest, res) => {
    if (!req.file) {
      return fail(res, 40011, '请选择音频文件')
    }

    const absPath = req.file.path
    const relativeAudio = path.relative(config.storageRoot, absPath).replace(/\\/g, '/')
    const fileHash = hashFile(absPath)

    let durationMs = 0
    let coverRelative: string | null = null
    let metaName = ''
    let metaArtists: string[] = []
    let metaAlbum = ''

    try {
      const meta = await parseFile(absPath)
      durationMs = Math.round((meta.format.duration || 0) * 1000)
      metaName = meta.common.title || ''
      metaArtists = meta.common.artists || (meta.common.artist ? [meta.common.artist] : [])
      metaAlbum = meta.common.album || ''
      if (meta.common.picture?.[0]) {
        const pic = meta.common.picture[0]
        const ext = pic.format?.includes('png') ? '.png' : '.jpg'
        const coverDir = path.join(config.storageRoot, 'covers')
        fs.mkdirSync(coverDir, { recursive: true })
        const coverName = `${Date.now()}${ext}`
        const coverAbs = path.join(coverDir, coverName)
        fs.writeFileSync(coverAbs, pic.data)
        coverRelative = `covers/${coverName}`
      }
    } catch {
      // 元数据解析失败不阻断上传
    }

    const fromFile = resolveTrackMeta({
      fileName: req.file.originalname,
      title: metaName,
      artists: metaArtists,
      album: metaAlbum,
    })

    const name = String(req.body.name || fromFile.name || path.parse(req.file.originalname).name)
    const artistsRaw = req.body.artists
    let artists: string[]
    if (artistsRaw && String(artistsRaw).trim()) {
      artists = String(artistsRaw)
        .split(/[,，/]/)
        .map((s) => s.trim())
        .filter(Boolean)
    } else if (fromFile.artists.length) {
      artists = fromFile.artists
    } else {
      artists = ['未知歌手']
    }
    const album = String(req.body.album || fromFile.album || '') || null
    // lyricText：表单有该字段就写入（允许空字符串清空）
    const hasLyricField = Object.prototype.hasOwnProperty.call(req.body, 'lyricText')
    const lyricText = hasLyricField ? String(req.body.lyricText || '') || null : undefined

    const dup = await prisma.track.findFirst({
      where: { fileHash, status: { not: 'offline' } },
      include: { uploader: { select: { nickname: true } } },
    })

    // 重复文件：有权限则用本次表单信息覆盖元数据，而不是直接跳过
    if (dup) {
      // 音频内容相同，删掉本次新写入的重复文件
      try {
        if (fs.existsSync(absPath)) fs.unlinkSync(absPath)
      } catch {
        // ignore
      }

      const canUpdate = dup.uploaderId === req.user!.id || req.user!.role === 'admin'
      if (!canUpdate) {
        // 别人的重复文件：清理本次抽出的封面
        if (coverRelative) {
          try {
            const coverAbs = audioAbsolutePath(coverRelative)
            if (fs.existsSync(coverAbs)) fs.unlinkSync(coverAbs)
          } catch {
            // ignore
          }
        }
        return fail(res, 40012, '疑似重复歌曲，已存在相同文件')
      }

      const nextArtists = JSON.stringify(artists)
      const data: Record<string, unknown> = {
        name,
        artists: nextArtists,
        album,
      }
      if (hasLyricField) data.lyricText = lyricText
      if (durationMs > 0) data.durationMs = durationMs
      if (coverRelative) {
        // 新封面替换旧封面
        if (dup.coverUrl && dup.coverUrl !== coverRelative) {
          try {
            const oldCover = audioAbsolutePath(dup.coverUrl)
            if (fs.existsSync(oldCover)) fs.unlinkSync(oldCover)
          } catch {
            // ignore
          }
        }
        data.coverUrl = coverRelative
      }

      const changed =
        dup.name !== name ||
        dup.artists !== nextArtists ||
        (dup.album || null) !== album ||
        (hasLyricField && (dup.lyricText || null) !== (lyricText ?? null)) ||
        Boolean(coverRelative && coverRelative !== dup.coverUrl) ||
        (durationMs > 0 && dup.durationMs !== durationMs)

      if (!changed) {
        if (coverRelative && coverRelative !== dup.coverUrl) {
          try {
            const coverAbs = audioAbsolutePath(coverRelative)
            if (fs.existsSync(coverAbs)) fs.unlinkSync(coverAbs)
          } catch {
            // ignore
          }
        }
        return ok(res, toTrackDto(dup), '歌曲已存在，信息无变化')
      }

      const updated = await prisma.track.update({
        where: { id: dup.id },
        data,
        include: { uploader: { select: { nickname: true } } },
      })
      return ok(res, toTrackDto(updated), '歌曲已存在，已更新信息')
    }

    const status = config.uploadNeedReview ? 'pending' : 'published'

    // 部分浏览器对 .MP3 给出空 MIME，统一兜底
    const ext = path.extname(req.file.originalname).toLowerCase()
    let mimeType = req.file.mimetype || 'audio/mpeg'
    if (!mimeType.startsWith('audio/')) {
      if (ext === '.wav') mimeType = 'audio/wav'
      else if (ext === '.flac') mimeType = 'audio/flac'
      else if (ext === '.m4a') mimeType = 'audio/mp4'
      else if (ext === '.aac') mimeType = 'audio/aac'
      else mimeType = 'audio/mpeg'
    }

    const track = await prisma.track.create({
      data: {
        name,
        artists: JSON.stringify(artists),
        album,
        durationMs,
        coverUrl: coverRelative,
        audioPath: relativeAudio,
        lyricText: lyricText ?? null,
        fileHash,
        fileSize: req.file.size,
        mimeType,
        status,
        uploaderId: req.user!.id,
      },
      include: { uploader: { select: { nickname: true } } },
    })

    return ok(res, toTrackDto(track), '上传成功')
  },
)

router.put('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const track = await prisma.track.findUnique({ where: { id: req.params.id } })
  if (!track) {
    return fail(res, 40401, '歌曲不存在', 404)
  }
  if (track.uploaderId !== req.user!.id && req.user!.role !== 'admin') {
    return fail(res, 40301, '无权修改', 403)
  }
  const data: Record<string, unknown> = {}
  if (req.body.name) data.name = String(req.body.name)
  if (req.body.artists) {
    const artists = String(req.body.artists)
      .split(/[,，/]/)
      .map((s) => s.trim())
      .filter(Boolean)
    data.artists = JSON.stringify(artists)
  }
  if (req.body.album !== undefined) data.album = String(req.body.album || '') || null
  if (req.body.lyricText !== undefined) data.lyricText = String(req.body.lyricText || '') || null

  const updated = await prisma.track.update({
    where: { id: track.id },
    data,
    include: { uploader: { select: { nickname: true } } },
  })
  return ok(res, toTrackDto(updated))
})

router.delete('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const track = await prisma.track.findUnique({ where: { id: req.params.id } })
  if (!track) {
    return fail(res, 40401, '歌曲不存在', 404)
  }
  if (track.uploaderId !== req.user!.id && req.user!.role !== 'admin') {
    return fail(res, 40301, '无权删除', 403)
  }
  const { deleteTrackFully } = await import('../services/trackLifecycle.js')
  await deleteTrackFully(track.id)
  return ok(res, true, '已删除')
})

export default router
