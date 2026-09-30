import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

/** 与 packages/shared 的 UPLOAD_MAX_SIZE_MB 保持一致；此处不直接 import，避免未 build shared 时服务起不来 */
const DEFAULT_UPLOAD_MAX_SIZE_MB = 500

function resolveUploadMaxMb() {
  const raw = process.env.UPLOAD_MAX_SIZE_MB
  if (raw == null || String(raw).trim() === '') return DEFAULT_UPLOAD_MAX_SIZE_MB
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_UPLOAD_MAX_SIZE_MB
  return Math.floor(n)
}

export const config = {
  port: Number(process.env.PORT || 3001),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  storageRoot: path.resolve(rootDir, process.env.STORAGE_ROOT || './storage'),
  uploadNeedReview: process.env.UPLOAD_NEED_REVIEW === 'true',
  uploadMaxSizeMb: resolveUploadMaxMb(),
  corsOrigin: (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim()),
}
