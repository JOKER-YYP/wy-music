import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { config } from '../config.js'

export function ensureStorageDirs() {
  const dirs = [
    config.storageRoot,
    path.join(config.storageRoot, 'audio'),
    path.join(config.storageRoot, 'covers'),
  ]
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function hashFile(filePath: string) {
  const buf = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(buf).digest('hex')
}

export function audioAbsolutePath(relativePath: string) {
  const abs = path.resolve(config.storageRoot, relativePath)
  if (!abs.startsWith(path.resolve(config.storageRoot))) {
    throw new Error('Invalid storage path')
  }
  return abs
}

export function toPublicUrl(relativePath: string | null | undefined) {
  if (!relativePath) return null
  return `/media/${relativePath.replace(/\\/g, '/')}`
}
