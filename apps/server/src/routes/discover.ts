import { Router } from 'express'
import { prisma } from '../db.js'
import { fail, ok } from '../utils/response.js'
import { toTrackDto } from '../utils/mapper.js'
import { toPublicUrl } from '../utils/storage.js'
import { optionalAuth } from '../middleware/auth.js'

const router = Router()

function parseArtists(raw: string): string[] {
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.map(String) : [String(raw)]
  } catch {
    return raw ? [raw] : []
  }
}

router.get('/', optionalAuth, async (_req, res) => {
  const [banners, latest, hot] = await Promise.all([
    prisma.banner.findMany({
      where: { enabled: true },
      orderBy: { sort: 'asc' },
      take: 10,
    }),
    prisma.track.findMany({
      where: { status: 'published' },
      include: { uploader: { select: { nickname: true } } },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
    prisma.track.findMany({
      where: { status: 'published' },
      include: { uploader: { select: { nickname: true } } },
      orderBy: { playCount: 'desc' },
      take: 12,
    }),
  ])
  return ok(res, {
    banners,
    latest: latest.map((t) => toTrackDto(t)),
    hot: hot.map((t) => toTrackDto(t)),
  })
})

/** 歌单广场：公开歌单 + 系统推荐 */
router.get('/playlists', optionalAuth, async (_req, res) => {
  const list = await prisma.playlist.findMany({
    where: {
      isSystem: false,
    },
    include: {
      owner: { select: { nickname: true } },
      _count: { select: { tracks: true } },
      tracks: {
        orderBy: { position: 'asc' },
        take: 1,
        include: { track: { select: { coverUrl: true, playCount: true } } },
      },
    },
    orderBy: [{ isPublic: 'desc' }, { createdAt: 'desc' }],
    take: 60,
  })

  const cards = list
    .filter((p) => p._count.tracks > 0 || !p.isSystem)
    .map((p) => ({
      id: p.id,
      name: p.name,
      coverUrl: toPublicUrl(p.tracks[0]?.track?.coverUrl || p.coverUrl),
      trackCount: p._count.tracks,
      playCount: p.tracks.reduce((s, t) => s + (t.track.playCount || 0), 0),
      ownerNickname: p.owner.nickname,
      isSystem: p.isSystem,
    }))

  return ok(res, { list: cards })
})

/** 排行榜 */
router.get('/charts', optionalAuth, async (_req, res) => {
  const include = { uploader: { select: { nickname: true } } } as const
  const [hot, newer, soar] = await Promise.all([
    prisma.track.findMany({
      where: { status: 'published' },
      include,
      orderBy: { playCount: 'desc' },
      take: 50,
    }),
    prisma.track.findMany({
      where: { status: 'published' },
      include,
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.track.findMany({
      where: { status: 'published' },
      include,
      orderBy: [{ playCount: 'desc' }, { updatedAt: 'desc' }],
      take: 50,
    }),
  ])

  // 飙升 / 新歌 / 热歌 / 原创
  const charts = [
    {
      id: 'soar',
      name: '飙升榜',
      description: '云音乐中最近一周热度上升最快的歌曲榜单',
      updateTip: '每日更新',
      coverUrl: toPublicUrl(soar[0]?.coverUrl),
      tracks: soar.slice(0, 100).map((t, i) => ({ ...toTrackDto(t), rank: i + 1 })),
    },
    {
      id: 'new',
      name: '新歌榜',
      description: '云音乐近期新发歌曲热度榜单',
      updateTip: '每日更新',
      coverUrl: toPublicUrl(newer[0]?.coverUrl),
      tracks: newer.slice(0, 100).map((t, i) => ({ ...toTrackDto(t), rank: i + 1 })),
    },
    {
      id: 'hot',
      name: '热歌榜',
      description: '云音乐热度最高的歌曲排行',
      updateTip: '每日更新',
      coverUrl: toPublicUrl(hot[0]?.coverUrl),
      tracks: hot.slice(0, 100).map((t, i) => ({ ...toTrackDto(t), rank: i + 1 })),
    },
    {
      id: 'original',
      name: '原创榜',
      description: '云音乐原创歌曲热度榜单',
      updateTip: '每周更新',
      coverUrl: toPublicUrl(hot[0]?.coverUrl),
      tracks: hot.slice(0, 100).map((t, i) => ({ ...toTrackDto(t), rank: i + 1 })),
    },
  ]

  const recommend = [
    { id: 'rap', name: '华语说唱榜', color: 'linear-gradient(135deg,#e74c3c,#c0392b)' },
    { id: 'folk', name: '民谣榜', color: 'linear-gradient(135deg,#f1c40f,#e67e22)' },
    { id: 'guofeng', name: '国风榜', color: 'linear-gradient(135deg,#e67e22,#d35400)' },
    { id: 'rock', name: '摇滚榜', color: 'linear-gradient(135deg,#e91e63,#9c27b0)' },
    { id: 'west', name: '欧美热歌榜', color: 'linear-gradient(135deg,#9b59b6,#8e44ad)' },
    { id: 'korea', name: '韩语榜', color: 'linear-gradient(135deg,#5d4e8c,#2c2c54)' },
  ].map((c, idx) => {
    const tracks = hot.slice(idx * 2, idx * 2 + 20).map((t, i) => ({ ...toTrackDto(t), rank: i + 1 }))
    const fallback = hot.slice(0, 20).map((t, i) => ({ ...toTrackDto(t), rank: i + 1 }))
    const list = tracks.length ? tracks : fallback
    return {
      ...c,
      description: `${c.name}热门歌曲`,
      updateTip: '每日更新',
      coverUrl: list[0]?.coverUrl || null,
      tracks: list,
    }
  })

  return ok(res, { official: charts, recommend })
})

/** 单个榜单详情 */
router.get('/charts/:id', optionalAuth, async (req, res) => {
  const raw = req.params.id
  const id = Array.isArray(raw) ? raw[0] : raw
  const { data } = await (async () => {
    // 复用列表逻辑
    const include = { uploader: { select: { nickname: true } } } as const
    const [hot, newer, soar] = await Promise.all([
      prisma.track.findMany({
        where: { status: 'published' },
        include,
        orderBy: { playCount: 'desc' },
        take: 100,
      }),
      prisma.track.findMany({
        where: { status: 'published' },
        include,
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.track.findMany({
        where: { status: 'published' },
        include,
        orderBy: [{ playCount: 'desc' }, { updatedAt: 'desc' }],
        take: 100,
      }),
    ])
    const map: Record<
      string,
      { id: string; name: string; description: string; updateTip: string; tracks: ReturnType<typeof toTrackDto>[] }
    > = {
      soar: {
        id: 'soar',
        name: '飙升榜',
        description: '云音乐中最近一周热度上升最快的歌曲榜单',
        updateTip: '每日更新',
        tracks: soar.map((t) => toTrackDto(t)),
      },
      new: {
        id: 'new',
        name: '新歌榜',
        description: '云音乐近期新发歌曲热度榜单',
        updateTip: '每日更新',
        tracks: newer.map((t) => toTrackDto(t)),
      },
      hot: {
        id: 'hot',
        name: '热歌榜',
        description: '云音乐热度最高的歌曲排行',
        updateTip: '每日更新',
        tracks: hot.map((t) => toTrackDto(t)),
      },
      original: {
        id: 'original',
        name: '原创榜',
        description: '云音乐原创歌曲热度榜单',
        updateTip: '每周更新',
        tracks: hot.map((t) => toTrackDto(t)),
      },
      rap: {
        id: 'rap',
        name: '华语说唱榜',
        description: '华语说唱热门歌曲',
        updateTip: '每日更新',
        tracks: hot.map((t) => toTrackDto(t)),
      },
      folk: {
        id: 'folk',
        name: '民谣榜',
        description: '民谣热门歌曲',
        updateTip: '每日更新',
        tracks: hot.map((t) => toTrackDto(t)),
      },
      guofeng: {
        id: 'guofeng',
        name: '国风榜',
        description: '国风热门歌曲',
        updateTip: '每日更新',
        tracks: hot.map((t) => toTrackDto(t)),
      },
      rock: {
        id: 'rock',
        name: '摇滚榜',
        description: '摇滚热门歌曲',
        updateTip: '每日更新',
        tracks: hot.map((t) => toTrackDto(t)),
      },
      west: {
        id: 'west',
        name: '欧美热歌榜',
        description: '欧美热门歌曲',
        updateTip: '每日更新',
        tracks: hot.map((t) => toTrackDto(t)),
      },
      korea: {
        id: 'korea',
        name: '韩语榜',
        description: '韩语热门歌曲',
        updateTip: '每日更新',
        tracks: hot.map((t) => toTrackDto(t)),
      },
    }
    return { data: map[id] || null }
  })()

  if (!data) return fail(res, 40401, '榜单不存在', 404)

  const tracks = data.tracks.map((t, i) => ({ ...t, rank: i + 1 }))
  return ok(res, {
    ...data,
    coverUrl: tracks[0]?.coverUrl || null,
    tracks,
    updatedAt: new Date().toISOString().slice(0, 10),
  })
})

/** 歌手列表（从曲库聚合） */
router.get('/artists', optionalAuth, async (req, res) => {
  const letter = String(req.query.letter || '热门').trim()
  const keyword = String(req.query.keyword || '').trim().toLowerCase()

  const tracks = await prisma.track.findMany({
    where: { status: 'published' },
    select: { artists: true, coverUrl: true, playCount: true, id: true },
    take: 2000,
  })

  type ArtistAgg = {
    name: string
    coverUrl: string | null
    trackCount: number
    playCount: number
  }
  const map = new Map<string, ArtistAgg>()

  for (const t of tracks) {
    for (const name of parseArtists(t.artists)) {
      const key = name.trim()
      if (!key || key === '未知歌手') continue
      const cur = map.get(key) || {
        name: key,
        coverUrl: null,
        trackCount: 0,
        playCount: 0,
      }
      cur.trackCount += 1
      cur.playCount += t.playCount || 0
      if (!cur.coverUrl && t.coverUrl) cur.coverUrl = toPublicUrl(t.coverUrl)
      map.set(key, cur)
    }
  }

  let list = [...map.values()]

  if (keyword) {
    list = list.filter((a) => a.name.toLowerCase().includes(keyword))
  }

  if (letter && letter !== '热门' && letter !== '#') {
    const L = letter.toUpperCase()
    list = list.filter((a) => {
      const first = a.name[0]?.toUpperCase() || ''
      // 简单：英文字母开头；中文归入热门/其他
      return first === L
    })
  } else if (letter === '#') {
    list = list.filter((a) => !/^[A-Za-z]/.test(a.name))
  }

  list.sort((a, b) => b.playCount - a.playCount || b.trackCount - a.trackCount)

  return ok(res, {
    list: list.slice(0, 100).map((a) => ({
      name: a.name,
      coverUrl: a.coverUrl,
      trackCount: a.trackCount,
      playCount: a.playCount,
    })),
    total: list.length,
  })
})

/** 歌手详情 */
router.get('/artists/:name', optionalAuth, async (req, res) => {
  const rawParam = req.params.name
  const raw = (Array.isArray(rawParam) ? rawParam[0] : rawParam) ?? ''
  const name = decodeURIComponent(String(raw)).trim()
  if (!name) return fail(res, 40001, '缺少歌手名')

  const all = await prisma.track.findMany({
    where: { status: 'published' },
    include: { uploader: { select: { nickname: true } } },
    orderBy: [{ playCount: 'desc' }, { updatedAt: 'desc' }],
    take: 2000,
  })

  const tracks = all
    .filter((t) => parseArtists(t.artists).some((a) => a === name || a.includes(name)))
    .map((t) => toTrackDto(t))

  if (!tracks.length) return fail(res, 40401, '歌手不存在或暂无歌曲', 404)

  // 专辑聚合
  const albumMap = new Map<
    string,
    { name: string; coverUrl: string | null; trackCount: number; playCount: number }
  >()
  for (const t of tracks) {
    const albumName = (t.album || '未知专辑').trim() || '未知专辑'
    const cur = albumMap.get(albumName) || {
      name: albumName,
      coverUrl: null,
      trackCount: 0,
      playCount: 0,
    }
    cur.trackCount += 1
    cur.playCount += t.playCount || 0
    if (!cur.coverUrl && t.coverUrl) cur.coverUrl = t.coverUrl
    albumMap.set(albumName, cur)
  }
  const albums = [...albumMap.values()].sort(
    (a, b) => b.playCount - a.playCount || b.trackCount - a.trackCount,
  )

  // 相似歌手：其它热门歌手
  const artistAgg = new Map<
    string,
    { name: string; coverUrl: string | null; trackCount: number; playCount: number }
  >()
  for (const t of all) {
    for (const a of parseArtists(t.artists)) {
      const key = a.trim()
      if (!key || key === name || key === '未知歌手') continue
      const cur = artistAgg.get(key) || {
        name: key,
        coverUrl: null,
        trackCount: 0,
        playCount: 0,
      }
      cur.trackCount += 1
      cur.playCount += t.playCount || 0
      if (!cur.coverUrl && t.coverUrl) cur.coverUrl = toPublicUrl(t.coverUrl)
      artistAgg.set(key, cur)
    }
  }
  const similar = [...artistAgg.values()]
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, 12)

  const coverUrl = tracks.find((t) => t.coverUrl)?.coverUrl || null
  const playCount = tracks.reduce((s, t) => s + (t.playCount || 0), 0)

  return ok(res, {
    name,
    alias: '',
    coverUrl,
    trackCount: tracks.length,
    albumCount: albums.length,
    playCount,
    description: `${name}的热门歌曲与专辑`,
    tracks: tracks.slice(0, 100),
    albums,
    similar,
  })
})

/** 按歌手名查歌曲（兼容旧接口） */
router.get('/artists/:name/tracks', optionalAuth, async (req, res) => {
  const rawParam = req.params.name
  const raw = (Array.isArray(rawParam) ? rawParam[0] : rawParam) ?? ''
  const name = decodeURIComponent(String(raw)).trim()
  if (!name) return ok(res, { list: [] })

  const tracks = await prisma.track.findMany({
    where: { status: 'published' },
    include: { uploader: { select: { nickname: true } } },
    orderBy: { playCount: 'desc' },
    take: 200,
  })

  const list = tracks
    .filter((t) => parseArtists(t.artists).some((a) => a === name || a.includes(name)))
    .slice(0, 50)
    .map((t) => toTrackDto(t))

  return ok(res, { list, name })
})

export default router
