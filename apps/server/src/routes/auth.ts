import { Router } from 'express'
import bcrypt from 'bcryptjs'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../db.js'
import { fail, ok } from '../utils/response.js'
import { toUserPublic } from '../utils/mapper.js'
import { config } from '../config.js'
import { audioAbsolutePath } from '../utils/storage.js'
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  requireAuth,
  type AuthedRequest,
} from '../middleware/auth.js'

const router = Router()

const registerSchema = z.object({
  account: z.string().min(3).max(32),
  password: z.string().min(6).max(64),
  nickname: z.string().min(1).max(32).optional(),
})

const loginSchema = z.object({
  account: z.string().min(1),
  password: z.string().min(1),
})

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(config.storageRoot, 'avatars')
      fs.mkdirSync(dir, { recursive: true })
      cb(null, dir)
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg'
      cb(null, `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`)
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype)) {
      cb(new Error('仅支持 jpg / png / gif / webp 图片'))
      return
    }
    cb(null, true)
  },
})

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    return fail(res, 40001, '参数错误：账号至少3位，密码至少6位')
  }
  const { account, password, nickname } = parsed.data
  const exists = await prisma.user.findUnique({ where: { account } })
  if (exists) {
    return fail(res, 40002, '账号已存在')
  }
  const passwordHash = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: {
      account,
      passwordHash,
      nickname: nickname || account,
      role: 'user',
    },
  })
  await prisma.playlist.create({
    data: {
      name: '我喜欢的音乐',
      isSystem: true,
      isPublic: false,
      ownerId: user.id,
    },
  })
  const payload = { sub: user.id, role: 'user' as const }
  return ok(res, {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    user: toUserPublic(user),
  })
})

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    return fail(res, 40001, '参数错误')
  }
  const { account, password } = parsed.data
  const user = await prisma.user.findUnique({ where: { account } })
  if (!user) {
    return fail(res, 40003, '账号或密码错误', 401)
  }
  if (user.status !== 1) {
    return fail(res, 40004, '账号已被禁用', 403)
  }
  const match = await bcrypt.compare(password, user.passwordHash)
  if (!match) {
    return fail(res, 40003, '账号或密码错误', 401)
  }
  const payload = { sub: user.id, role: user.role as 'user' | 'admin' }
  return ok(res, {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    user: toUserPublic(user),
  })
})

router.post('/refresh', async (req, res) => {
  const token = String(req.body.refreshToken || '')
  if (!token) {
    return fail(res, 40001, '缺少 refreshToken')
  }
  try {
    const payload = verifyRefreshToken(token)
    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user || user.status !== 1) {
      return fail(res, 40102, '账号不可用', 401)
    }
    const next = { sub: user.id, role: user.role as 'user' | 'admin' }
    return ok(res, {
      accessToken: signAccessToken(next),
      refreshToken: signRefreshToken(next),
      user: toUserPublic(user),
    })
  } catch {
    return fail(res, 40103, 'refreshToken 无效', 401)
  }
})

router.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
  if (!user) {
    return fail(res, 40401, '用户不存在', 404)
  }
  return ok(res, toUserPublic(user))
})

router.put('/me', requireAuth, async (req: AuthedRequest, res) => {
  const data: Record<string, unknown> = {}

  if (req.body.nickname !== undefined) {
    const nickname = String(req.body.nickname || '').trim().slice(0, 32)
    if (!nickname) return fail(res, 40001, '昵称不能为空')
    data.nickname = nickname
  }
  if (req.body.bio !== undefined) {
    data.bio = String(req.body.bio || '').slice(0, 300) || null
  }
  if (req.body.gender !== undefined) {
    const gender = String(req.body.gender || 'unknown')
    if (!['unknown', 'male', 'female'].includes(gender)) {
      return fail(res, 40001, '性别无效')
    }
    data.gender = gender === 'unknown' ? null : gender
  }
  if (req.body.birthday !== undefined) {
    const birthday = String(req.body.birthday || '').trim()
    if (!birthday) {
      data.birthday = null
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
      return fail(res, 40001, '生日格式应为 YYYY-MM-DD')
    } else {
      data.birthday = birthday
    }
  }
  if (req.body.province !== undefined) {
    data.province = String(req.body.province || '').trim().slice(0, 32) || null
  }
  if (req.body.city !== undefined) {
    data.city = String(req.body.city || '').trim().slice(0, 32) || null
  }

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data,
  })
  return ok(res, toUserPublic(user))
})

router.post('/me/avatar', requireAuth, (req: AuthedRequest, res) => {
  avatarUpload.single('avatar')(req, res, async (err) => {
    if (err) {
      return fail(res, 40001, err instanceof Error ? err.message : '上传失败')
    }
    if (!req.file) {
      return fail(res, 40001, '请选择头像图片')
    }
    const relative = path.relative(config.storageRoot, req.file.path).replace(/\\/g, '/')
    try {
      const prev = await prisma.user.findUnique({ where: { id: req.user!.id } })
      const user = await prisma.user.update({
        where: { id: req.user!.id },
        data: { avatarUrl: relative },
      })
      if (prev?.avatarUrl && prev.avatarUrl !== relative) {
        try {
          const oldAbs = audioAbsolutePath(prev.avatarUrl)
          if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs)
        } catch {
          // ignore
        }
      }
      return ok(res, toUserPublic(user), '头像已更新')
    } catch (e) {
      try {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
      } catch {
        // ignore
      }
      return fail(res, 50001, e instanceof Error ? e.message : '保存失败', 500)
    }
  })
})

export default router
