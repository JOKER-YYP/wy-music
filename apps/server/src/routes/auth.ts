import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../db.js'
import { fail, ok } from '../utils/response.js'
import { toUserPublic } from '../utils/mapper.js'
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
  const nickname = req.body.nickname ? String(req.body.nickname).slice(0, 32) : undefined
  const bio = req.body.bio !== undefined ? String(req.body.bio).slice(0, 200) : undefined
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      ...(nickname ? { nickname } : {}),
      ...(bio !== undefined ? { bio } : {}),
    },
  })
  return ok(res, toUserPublic(user))
})

export default router
