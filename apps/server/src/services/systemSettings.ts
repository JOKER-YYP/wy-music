import { prisma } from '../db.js'
import { config } from '../config.js'

export type AppSettings = {
  uploadNeedReview: boolean
  uploadMaxSizeMb: number
  registerEnabled: boolean
  siteName: string
  siteAnnouncement: string
  /** 只读：当前媒体根目录 */
  storageRoot: string
}

const DEFAULTS: Omit<AppSettings, 'storageRoot'> = {
  uploadNeedReview: config.uploadNeedReview,
  uploadMaxSizeMb: config.uploadMaxSizeMb,
  registerEnabled: true,
  siteName: 'WY Music',
  siteAnnouncement: '',
}

function parseBool(raw: string | undefined, fallback: boolean) {
  if (raw == null) return fallback
  return raw === 'true' || raw === '1'
}

function parsePositiveInt(raw: string | undefined, fallback: number) {
  if (raw == null || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.floor(n)
}

export async function getAppSettings(): Promise<AppSettings> {
  const rows = await prisma.systemConfig.findMany()
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return {
    uploadNeedReview: parseBool(map.uploadNeedReview, DEFAULTS.uploadNeedReview),
    uploadMaxSizeMb: parsePositiveInt(map.uploadMaxSizeMb, DEFAULTS.uploadMaxSizeMb),
    registerEnabled: parseBool(map.registerEnabled, DEFAULTS.registerEnabled),
    siteName: (map.siteName || DEFAULTS.siteName).trim() || DEFAULTS.siteName,
    siteAnnouncement: map.siteAnnouncement ?? DEFAULTS.siteAnnouncement,
    storageRoot: config.storageRoot,
  }
}

export async function saveAppSettings(
  patch: Partial<{
    uploadNeedReview: boolean
    uploadMaxSizeMb: number
    registerEnabled: boolean
    siteName: string
    siteAnnouncement: string
  }>,
): Promise<AppSettings> {
  const entries: Array<{ key: string; value: string }> = []
  if (patch.uploadNeedReview !== undefined) {
    entries.push({ key: 'uploadNeedReview', value: String(Boolean(patch.uploadNeedReview)) })
  }
  if (patch.uploadMaxSizeMb !== undefined) {
    const n = Math.floor(Number(patch.uploadMaxSizeMb))
    if (!Number.isFinite(n) || n <= 0 || n > 2048) {
      throw new Error('上传大小限制须在 1–2048 MB')
    }
    entries.push({ key: 'uploadMaxSizeMb', value: String(n) })
  }
  if (patch.registerEnabled !== undefined) {
    entries.push({ key: 'registerEnabled', value: String(Boolean(patch.registerEnabled)) })
  }
  if (patch.siteName !== undefined) {
    const name = String(patch.siteName || '').trim().slice(0, 40)
    if (!name) throw new Error('站点名称不能为空')
    entries.push({ key: 'siteName', value: name })
  }
  if (patch.siteAnnouncement !== undefined) {
    entries.push({
      key: 'siteAnnouncement',
      value: String(patch.siteAnnouncement || '').slice(0, 500),
    })
  }

  for (const row of entries) {
    await prisma.systemConfig.upsert({
      where: { key: row.key },
      create: row,
      update: { value: row.value },
    })
  }
  return getAppSettings()
}

export async function isUploadNeedReview() {
  return (await getAppSettings()).uploadNeedReview
}

export async function getUploadMaxSizeMb() {
  return (await getAppSettings()).uploadMaxSizeMb
}

export async function isRegisterEnabled() {
  return (await getAppSettings()).registerEnabled
}
