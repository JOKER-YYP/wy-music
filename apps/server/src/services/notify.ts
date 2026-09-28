import { prisma } from '../db.js'
import { parseArtists } from '../utils/mapper.js'
import type { NotificationChannel } from '@wy-music/shared'

export type CreateNotifyInput = {
  userId: string
  channel: NotificationChannel | string
  type: string
  title: string
  body: string
  trackId?: string | null
  trackName?: string | null
  actorId?: string | null
  actorNickname?: string | null
  actorAvatarUrl?: string | null
  refId?: string | null
}

export async function createNotification(input: CreateNotifyInput) {
  if (!input.userId) return null
  return prisma.userNotification.create({
    data: {
      userId: input.userId,
      channel: input.channel || 'notice',
      type: input.type,
      title: input.title,
      body: input.body,
      trackId: input.trackId ?? null,
      trackName: input.trackName ?? null,
      actorId: input.actorId ?? null,
      actorNickname: input.actorNickname ?? null,
      actorAvatarUrl: input.actorAvatarUrl ?? null,
      refId: input.refId ?? null,
      read: false,
    },
  })
}

export async function createNotifications(inputs: CreateNotifyInput[]) {
  const rows = inputs.filter((i) => i.userId)
  if (!rows.length) return { count: 0 }
  const result = await prisma.userNotification.createMany({
    data: rows.map((input) => ({
      userId: input.userId,
      channel: input.channel || 'notice',
      type: input.type,
      title: input.title,
      body: input.body,
      trackId: input.trackId ?? null,
      trackName: input.trackName ?? null,
      actorId: input.actorId ?? null,
      actorNickname: input.actorNickname ?? null,
      actorAvatarUrl: input.actorAvatarUrl ?? null,
      refId: input.refId ?? null,
      read: false,
    })),
  })
  return { count: result.count }
}

/** 注册欢迎私信 */
export async function sendWelcomeDm(userId: string) {
  return createNotification({
    userId,
    channel: 'dm',
    type: 'system_dm',
    title: 'WY助手',
    body: '欢迎来到 WY Music！关注喜欢的歌手，他们有新歌时会第一时间通知你。',
    actorNickname: 'WY助手',
  })
}

/** 关注歌手有新歌上架时通知粉丝 */
export async function notifyArtistNewTrack(track: {
  id: string
  name: string
  artists: string
  uploaderId: string
}) {
  const artists = parseArtists(track.artists).filter((a) => a && a !== '未知歌手')
  if (!artists.length) return { notified: 0 }

  const follows = await prisma.artistFollow.findMany({
    where: { artistName: { in: artists } },
    select: { userId: true, artistName: true },
  })

  const targets = follows.filter((f) => f.userId !== track.uploaderId)
  if (!targets.length) return { notified: 0 }

  // 同一用户多歌手命中只通知一次
  const byUser = new Map<string, string>()
  for (const f of targets) {
    if (!byUser.has(f.userId)) byUser.set(f.userId, f.artistName)
  }

  await createNotifications(
    [...byUser.entries()].map(([userId, artistName]) => ({
      userId,
      channel: 'notice',
      type: 'artist_new_track',
      title: artistName,
      body: `发布了新歌《${track.name}》`,
      trackId: track.id,
      trackName: track.name,
      actorNickname: artistName,
    })),
  )

  return { notified: byUser.size }
}

/** 从评论文本解析 @昵称 */
export function parseMentions(content: string): string[] {
  const names = new Set<string>()
  const re = /@([^\s@]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    const name = m[1]?.trim()
    if (name) names.add(name)
  }
  return [...names]
}

export async function notifyCommentEvents(input: {
  actor: { id: string; nickname: string; avatarUrl?: string | null }
  track: { id: string; name: string; uploaderId: string }
  commentId: string
  content: string
  replyToUserId?: string | null
}) {
  const { actor, track, commentId, content, replyToUserId } = input
  const snippet = content.length > 40 ? `${content.slice(0, 40)}…` : content

  // 回复评论
  if (replyToUserId && replyToUserId !== actor.id) {
    await createNotification({
      userId: replyToUserId,
      channel: 'comment',
      type: 'comment_reply',
      title: actor.nickname,
      body: `回复了你的评论：${snippet}`,
      trackId: track.id,
      trackName: track.name,
      actorId: actor.id,
      actorNickname: actor.nickname,
      actorAvatarUrl: actor.avatarUrl,
      refId: commentId,
    })
  }

  // 根评论通知歌曲上传者（非自己）
  if (!replyToUserId && track.uploaderId && track.uploaderId !== actor.id) {
    await createNotification({
      userId: track.uploaderId,
      channel: 'comment',
      type: 'comment_on_track',
      title: actor.nickname,
      body: `评论了《${track.name}》：${snippet}`,
      trackId: track.id,
      trackName: track.name,
      actorId: actor.id,
      actorNickname: actor.nickname,
      actorAvatarUrl: actor.avatarUrl,
      refId: commentId,
    })
  }

  // @提及
  const mentionNames = parseMentions(content)
  if (mentionNames.length) {
    const users = await prisma.user.findMany({
      where: { nickname: { in: mentionNames } },
      select: { id: true, nickname: true },
    })
    const notified = new Set<string>([actor.id])
    if (replyToUserId) notified.add(replyToUserId)

    await createNotifications(
      users
        .filter((u) => !notified.has(u.id))
        .map((u) => ({
          userId: u.id,
          channel: 'mention' as const,
          type: 'mention',
          title: actor.nickname,
          body: `在《${track.name}》中提到了你：${snippet}`,
          trackId: track.id,
          trackName: track.name,
          actorId: actor.id,
          actorNickname: actor.nickname,
          actorAvatarUrl: actor.avatarUrl,
          refId: commentId,
        })),
    )
  }
}
