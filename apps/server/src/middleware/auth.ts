import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'
import { config } from '../config.js'
import { prisma } from '../db.js'
import { fail } from '../utils/response.js'
import type { Role } from '@wy-music/shared'

export interface AuthPayload {
  sub: string
  role: Role
}

export interface AuthedRequest extends Request {
  user?: {
    id: string
    role: Role
    account: string
    nickname: string
  }
}

export function signAccessToken(payload: AuthPayload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions)
}

export function signRefreshToken(payload: AuthPayload) {
  return jwt.sign(payload, config.jwtRefreshSecret, {
    expiresIn: config.jwtRefreshExpiresIn,
  } as jwt.SignOptions)
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, config.jwtSecret) as AuthPayload
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, config.jwtRefreshSecret) as AuthPayload
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return fail(res, 40101, '未登录', 401)
  }
  try {
    const payload = verifyAccessToken(header.slice(7))
    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user || user.status !== 1) {
      return fail(res, 40102, '账号不可用', 401)
    }
    req.user = {
      id: user.id,
      role: user.role as Role,
      account: user.account,
      nickname: user.nickname,
    }
    next()
  } catch {
    return fail(res, 40103, '登录已失效', 401)
  }
}

export async function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return next()
  }
  try {
    const payload = verifyAccessToken(header.slice(7))
    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (user && user.status === 1) {
      req.user = {
        id: user.id,
        role: user.role as Role,
        account: user.account,
        nickname: user.nickname,
      }
    }
  } catch {
    // ignore
  }
  next()
}

export async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  await requireAuth(req, res, async () => {
    if (req.user?.role !== 'admin') {
      return fail(res, 40301, '需要管理员权限', 403)
    }
    next()
  })
}
