import bcrypt from 'bcryptjs'
import { PrismaClient } from '../src/generated/prisma/index.js'

const prisma = new PrismaClient()

async function main() {
  const adminAccount = 'admin'
  const existing = await prisma.user.findUnique({ where: { account: adminAccount } })
  if (existing) {
    console.log('管理员已存在: admin / admin123')
    return
  }
  const passwordHash = await bcrypt.hash('admin123', 10)
  const admin = await prisma.user.create({
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
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
