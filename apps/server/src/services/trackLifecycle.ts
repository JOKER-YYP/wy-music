import fs from 'node:fs'
import { prisma } from '../db.js'
import { audioAbsolutePath } from '../utils/storage.js'
import { parseArtists } from '../utils/mapper.js'

/** 收藏或歌单中引用该曲的用户 */
export async function collectAffectedUserIds(trackId: string): Promise<string[]> {
  const [likes, playlistRefs] = await Promise.all([
    prisma.like.findMany({ where: { trackId }, select: { userId: true } }),
    prisma.playlistTrack.findMany({
      where: { trackId },
      select: { playlist: { select: { ownerId: true } } },
    }),
  ])
  const ids = new Set<string>()
  for (const l of likes) ids.add(l.userId)
  for (const r of playlistRefs) ids.add(r.playlist.ownerId)
  return [...ids]
}

/** 给受影响用户写入「歌曲已下架」未读通知（须在硬删前调用） */
export async function notifyTrackRemoved(input: {
  trackId: string
  trackName: string
  artists?: string[]
  kind: 'deleted' | 'offline'
}) {
  const userIds = await collectAffectedUserIds(input.trackId)
  if (!userIds.length) return { notified: 0 }

  const artistText = (input.artists || []).filter(Boolean).join(' / ')
  const label = artistText ? `《${input.trackName}》 - ${artistText}` : `《${input.trackName}》`
  const title = '歌曲已被下架'
  const body =
    input.kind === 'deleted'
      ? `${label} 已被下架删除，已从你的收藏/歌单中移除。`
      : `${label} 已被下架，将不再出现在公共曲库与你的收藏/歌单展示中。`

  await prisma.userNotification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: 'track_removed',
      title,
      body,
      trackId: input.kind === 'deleted' ? null : input.trackId,
      trackName: input.trackName,
      read: false,
    })),
  })

  return { notified: userIds.length }
}

export async function offlineTrackById(trackId: string) {
  const track = await prisma.track.findUnique({ where: { id: trackId } })
  if (!track) return null

  await notifyTrackRemoved({
    trackId: track.id,
    trackName: track.name,
    artists: parseArtists(track.artists),
    kind: 'offline',
  })

  // 下架后清掉收藏与歌单引用，避免幽灵条目
  await prisma.$transaction([
    prisma.like.deleteMany({ where: { trackId } }),
    prisma.playlistTrack.deleteMany({ where: { trackId } }),
    prisma.track.update({
      where: { id: trackId },
      data: { status: 'offline' },
    }),
  ])

  return prisma.track.findUnique({
    where: { id: trackId },
    include: { uploader: { select: { nickname: true } } },
  })
}

export async function deleteTrackFully(trackId: string) {
  const track = await prisma.track.findUnique({ where: { id: trackId } })
  if (!track) return false

  await notifyTrackRemoved({
    trackId: track.id,
    trackName: track.name,
    artists: parseArtists(track.artists),
    kind: 'deleted',
  })

  await prisma.track.delete({ where: { id: trackId } })

  try {
    const abs = audioAbsolutePath(track.audioPath)
    if (fs.existsSync(abs)) fs.unlinkSync(abs)
    if (track.coverUrl) {
      const coverAbs = audioAbsolutePath(track.coverUrl)
      if (fs.existsSync(coverAbs)) fs.unlinkSync(coverAbs)
    }
  } catch {
    // ignore file cleanup errors
  }

  return true
}
