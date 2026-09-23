import type { Track, User } from '../generated/prisma/index.js'
import type { TrackDto, UserPublic } from '@wy-music/shared'
import { toPublicUrl } from './storage.js'

export function toUserPublic(user: User): UserPublic {
  return {
    id: user.id,
    account: user.account,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    role: user.role as UserPublic['role'],
    createdAt: user.createdAt.toISOString(),
  }
}

export function parseArtists(artists: string): string[] {
  try {
    const parsed = JSON.parse(artists)
    return Array.isArray(parsed) ? parsed.map(String) : [String(artists)]
  } catch {
    return [artists]
  }
}

export function toTrackDto(
  track: Track & { uploader?: Pick<User, 'nickname'> },
  liked?: boolean,
): TrackDto {
  return {
    id: track.id,
    name: track.name,
    artists: parseArtists(track.artists),
    album: track.album,
    durationMs: track.durationMs,
    coverUrl: toPublicUrl(track.coverUrl),
    lyricText: track.lyricText,
    status: track.status as TrackDto['status'],
    rejectReason: track.rejectReason,
    uploaderId: track.uploaderId,
    uploaderNickname: track.uploader?.nickname,
    playCount: track.playCount,
    liked: liked ?? false,
    fileSize: track.fileSize,
    mimeType: track.mimeType,
    createdAt: track.createdAt.toISOString(),
    updatedAt: track.updatedAt.toISOString(),
  }
}
