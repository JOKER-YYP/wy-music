import type { MusicSource, TrackDto } from '@wy-music/shared'
import { makeExternalTrackId } from '@wy-music/shared'

export type MusicSearchHit = {
  source: MusicSource
  externalId: string
  name: string
  artists: string[]
  album?: string | null
  coverUrl?: string | null
  payTag?: string | null
  durationMs?: number
}

export type MusicDetail = {
  source: MusicSource
  externalId: string
  name?: string
  artists?: string[]
  album?: string | null
  musicUrl: string
  coverUrl?: string | null
  lyricText?: string | null
  link?: string | null
  quality?: string | null
}

export function toSearchTrackDto(hit: MusicSearchHit): TrackDto {
  const now = new Date().toISOString()
  return {
    id: makeExternalTrackId(hit.source, hit.externalId),
    name: hit.name,
    artists: hit.artists.length ? hit.artists : ['未知歌手'],
    album: hit.album ?? null,
    durationMs: hit.durationMs || 0,
    coverUrl: hit.coverUrl || null,
    lyricText: null,
    status: 'published',
    uploaderId: '',
    playCount: 0,
    liked: false,
    fileSize: 0,
    mimeType: 'audio/mpeg',
    createdAt: now,
    updatedAt: now,
    source: hit.source,
    externalId: hit.externalId,
    payTag: hit.payTag || null,
  }
}
