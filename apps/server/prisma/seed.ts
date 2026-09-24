import bcrypt from 'bcryptjs'
import { PrismaClient } from '../src/generated/prisma/index.js'

const prisma = new PrismaClient()

/** 仓库内置示例曲（apps/server/storage/samples） */
const SAMPLE_TRACKS = [
  {
    name: '幻听',
    artists: ['许嵩'],
    album: '梦游计',
    audioPath: 'samples/audio/huanting.mp3',
    coverUrl: 'samples/covers/huanting.jpg',
    durationMs: 273241,
    fileSize: 4482835,
    mimeType: 'audio/mpeg',
    fileHash: 'cd035095a8e0f58814f9cb086d8d92e61f97a0f6e58d8b82e295df76cc7eefe8',
  },
  {
    name: '灰色头像',
    artists: ['许嵩'],
    album: '寻雾启示',
    audioPath: 'samples/audio/huise-touxiang.mp3',
    coverUrl: 'samples/covers/huise-touxiang.jpg',
    durationMs: 288052,
    fileSize: 4691810,
    mimeType: 'audio/mpeg',
    fileHash: '96916b936d80f28c3a438b5012df1611a725c3a3bd7fa244cbbd4b06543e4ba2',
  },
  {
    name: '明智之举',
    artists: ['许嵩'],
    album: '寻宝游戏',
    audioPath: 'samples/audio/mingzhi-zhiju.mp3',
    coverUrl: 'samples/covers/mingzhi-zhiju.jpg',
    durationMs: 267180,
    fileSize: 4534180,
    mimeType: 'audio/mpeg',
    fileHash: '35c7220a74088532c37200589679ca83fb2f79c9f7c7caa6f2571b1c2091dc05',
  },
] as const

async function ensureAdmin() {
  const adminAccount = 'admin'
  let admin = await prisma.user.findUnique({ where: { account: adminAccount } })
  if (!admin) {
    const passwordHash = await bcrypt.hash('admin123', 10)
    admin = await prisma.user.create({
      data: {
        account: adminAccount,
        passwordHash,
        nickname: '管理员',
        role: 'admin',
      },
    })
    await prisma.playlist.create({
      data: {
        name: '我喜欢的音乐',
        isSystem: true,
        ownerId: admin.id,
      },
    })
    console.log('已创建管理员账号: admin / admin123')
  } else {
    console.log('管理员已存在: admin / admin123')
  }
  return admin
}

async function ensureSampleTracks(uploaderId: string) {
  let created = 0
  for (const s of SAMPLE_TRACKS) {
    const exists = await prisma.track.findFirst({ where: { fileHash: s.fileHash } })
    if (exists) continue
    await prisma.track.create({
      data: {
        name: s.name,
        artists: JSON.stringify(s.artists),
        album: s.album,
        durationMs: s.durationMs,
        coverUrl: s.coverUrl,
        audioPath: s.audioPath,
        lyricText: null,
        fileHash: s.fileHash,
        fileSize: s.fileSize,
        mimeType: s.mimeType,
        status: 'published',
        uploaderId,
      },
    })
    created += 1
  }
  console.log(
    created
      ? `已写入 ${created} 首示例歌曲`
      : `示例歌曲已存在（共 ${SAMPLE_TRACKS.length} 首）`,
  )
}

async function main() {
  const admin = await ensureAdmin()
  await ensureSampleTracks(admin.id)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
