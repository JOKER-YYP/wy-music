import { Router } from 'express'
import { prisma } from '../db.js'
import { fail, ok } from '../utils/response.js'
import { toTrackDto } from '../utils/mapper.js'
import { toPublicUrl } from '../utils/storage.js'
import { optionalAuth, requireAuth, type AuthedRequest } from '../middleware/auth.js'

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

/** 搜索下拉：空态热搜/猜你喜欢/榜单；有关键词时返回联想 */
router.get('/search-suggest', optionalAuth, async (req: AuthedRequest, res) => {
  const q = String(req.query.q || req.query.keyword || '').trim()
  const include = { uploader: { select: { nickname: true } } } as const

  const tracks = await prisma.track.findMany({
    where: { status: 'published' },
    include,
    orderBy: { playCount: 'desc' },
    take: 120,
  })

  const hotKeywords: { text: string; badge?: string }[] = []
  const seenHot = new Set<string>()
  for (const t of tracks) {
    for (const text of [t.name, ...parseArtists(t.artists)].map((s) => s.trim()).filter(Boolean)) {
      const key = text.toLowerCase()
      if (seenHot.has(key) || text === '未知歌手') continue
      seenHot.add(key)
      hotKeywords.push({
        text,
        badge: hotKeywords.length < 3 ? '爆' : hotKeywords.length < 6 ? '热' : undefined,
      })
      if (hotKeywords.length >= 9) break
    }
    if (hotKeywords.length >= 9) break
  }

  if (q) {
    const ql = q.toLowerCase()
    const hotSet = new Set(hotKeywords.map((h) => h.text.toLowerCase()))
    const suggests: { text: string; tag?: '热搜' | '歌词' }[] = []
    const seen = new Set<string>()

    const push = (text: string, tag?: '热搜' | '歌词') => {
      const key = text.toLowerCase()
      if (!text || seen.has(key)) return
      seen.add(key)
      suggests.push({ text, tag })
    }

    // 以关键词开头的优先
    const scored: { text: string; tag?: '热搜' | '歌词'; score: number }[] = []
    for (const t of tracks) {
      const artists = parseArtists(t.artists)
      const candidates = [
        { text: t.name, lyric: Boolean(t.lyricText) },
        ...artists.map((a) => ({ text: a, lyric: false })),
        ...(t.album ? [{ text: t.album, lyric: false }] : []),
        ...artists.map((a) => ({ text: `${a} ${t.name}`, lyric: Boolean(t.lyricText) })),
      ]
      for (const c of candidates) {
        const text = c.text.trim()
        if (!text || text === '未知歌手' || text === '未知专辑') continue
        const tl = text.toLowerCase()
        if (!tl.includes(ql)) continue
        let score = tl.startsWith(ql) ? 100 : 50
        score += Math.min(20, Math.log10((t.playCount || 0) + 1) * 4)
        const tag: '热搜' | '歌词' | undefined = hotSet.has(tl)
          ? '热搜'
          : c.lyric && tl.includes(ql)
            ? '歌词'
            : undefined
        scored.push({ text, tag, score })
      }
    }
    scored.sort((a, b) => b.score - a.score)
    for (const s of scored) {
      push(s.text, s.tag)
      if (suggests.length >= 12) break
    }

    // 补几条「关键词 + 后缀」联想，贴近网易云体验
    if (suggests.length < 8) {
      for (const suffix of ['', ' 歌曲', ' 专辑', ' 歌单']) {
        const text = `${q}${suffix}`.trim()
        push(text, hotSet.has(q.toLowerCase()) ? '热搜' : undefined)
        if (suggests.length >= 10) break
      }
    }

    return ok(res, { mode: 'suggest' as const, suggests, hot: hotKeywords })
  }

  // 猜你喜欢：登录用户从喜欢/最近播放取歌手；否则用热门歌手
  const guess: string[] = []
  const guessSeen = new Set<string>()
  const addGuess = (name: string) => {
    const n = name.trim()
    if (!n || n === '未知歌手' || guessSeen.has(n.toLowerCase())) return
    guessSeen.add(n.toLowerCase())
    guess.push(n)
  }

  if (req.user?.id) {
    const [likes, history] = await Promise.all([
      prisma.like.findMany({
        where: { userId: req.user.id },
        include: { track: true },
        take: 30,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.playHistory.findMany({
        where: { userId: req.user.id },
        include: { track: true },
        take: 40,
        orderBy: { playedAt: 'desc' },
      }),
    ])
    for (const row of [...likes, ...history]) {
      for (const a of parseArtists(row.track.artists)) addGuess(a)
      if (guess.length >= 10) break
    }
  }
  if (guess.length < 8) {
    for (const h of hotKeywords) {
      addGuess(h.text)
      if (guess.length >= 10) break
    }
  }

  const chartTracks = tracks.slice(0, 9).map((t, i) => ({
    rank: i + 1,
    text: t.name,
    artists: parseArtists(t.artists),
    trackId: t.id,
  }))

  return ok(res, {
    mode: 'panel' as const,
    hot: hotKeywords,
    guess,
    chart: {
      id: 'hot',
      name: '热歌榜',
      items: chartTracks,
    },
  })
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

/** 上海时区下的「推荐日」：每天 6:00 刷新 */
function recommendDateParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]))
  let year = Number(parts.year)
  let month = Number(parts.month)
  let day = Number(parts.day)
  const hour = Number(parts.hour)
  if (hour < 6) {
    const d = new Date(Date.UTC(year, month - 1, day))
    d.setUTCDate(d.getUTCDate() - 1)
    year = d.getUTCFullYear()
    month = d.getUTCMonth() + 1
    day = d.getUTCDate()
  }
  const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return { year, month, day, dateKey }
}

function dailyHash(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function isWeakArtist(name: string) {
  const n = name.trim()
  return !n || n === '未知歌手'
}

function isWeakAlbum(name: string | null | undefined) {
  const n = (name || '').trim()
  return !n || n === '未知专辑'
}

/**
 * 每日推荐：根据喜欢 / 歌单 / 最近播放提取歌手·专辑口味，匹配 20 首
 * 同日（6:00 前算前一天）对同一用户结果稳定
 */
router.get('/daily', requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id
  const { year, month, day, dateKey } = recommendDateParts()
  const LIMIT = 20

  const [likes, history, playlistTracks, published] = await Promise.all([
    prisma.like.findMany({
      where: { userId },
      include: { track: true },
      orderBy: { createdAt: 'desc' },
      take: 80,
    }),
    prisma.playHistory.findMany({
      where: { userId },
      include: { track: true },
      orderBy: { playedAt: 'desc' },
      take: 120,
    }),
    prisma.playlistTrack.findMany({
      where: { playlist: { ownerId: userId } },
      include: { track: true },
      orderBy: { position: 'asc' },
      take: 200,
    }),
    prisma.track.findMany({
      where: { status: 'published' },
      include: { uploader: { select: { nickname: true } } },
      orderBy: { playCount: 'desc' },
      take: 400,
    }),
  ])

  const artistScore = new Map<string, number>()
  const albumScore = new Map<string, number>()
  const seedIds = new Set<string>()

  const bumpArtist = (name: string, w: number) => {
    if (isWeakArtist(name)) return
    artistScore.set(name, (artistScore.get(name) || 0) + w)
  }
  const bumpAlbum = (name: string | null | undefined, w: number) => {
    if (isWeakAlbum(name)) return
    const key = String(name).trim()
    albumScore.set(key, (albumScore.get(key) || 0) + w)
  }
  const absorb = (
    track: { id: string; artists: string; album: string | null; status: string },
    weight: number,
  ) => {
    if (track.status !== 'published') return
    seedIds.add(track.id)
    for (const a of parseArtists(track.artists)) bumpArtist(a, weight)
    bumpAlbum(track.album, weight * 0.6)
  }

  // 喜欢权重最高，其次最近播放（越近越高），歌单曲目次之
  for (const like of likes) absorb(like.track, 5)
  const seenHist = new Set<string>()
  let histIdx = 0
  for (const h of history) {
    if (seenHist.has(h.trackId)) continue
    seenHist.add(h.trackId)
    const recency = Math.max(1.2, 4 - histIdx * 0.08)
    absorb(h.track, recency)
    histIdx += 1
    if (histIdx >= 60) break
  }
  for (const pt of playlistTracks) absorb(pt.track, 2.2)

  type Scored = { track: (typeof published)[number]; score: number; tie: number }
  const scored: Scored[] = []

  for (const t of published) {
    if (seedIds.has(t.id)) continue
    let score = 0
    for (const a of parseArtists(t.artists)) {
      if (isWeakArtist(a)) continue
      score += (artistScore.get(a) || 0) * 10
    }
    if (!isWeakAlbum(t.album)) {
      score += (albumScore.get(String(t.album).trim()) || 0) * 5
    }
    // 轻微热度，避免完全冷门；日推扰动保证同日稳定、跨日变化
    score += Math.log10((t.playCount || 0) + 1) * 0.8
    if (score <= 0) continue
    scored.push({
      track: t,
      score,
      tie: dailyHash(`${userId}|${dateKey}|${t.id}`),
    })
  }

  scored.sort((a, b) => b.score - a.score || a.tie - b.tie)

  let picked = scored.slice(0, LIMIT).map((s) => s.track)

  // 口味信号不足或候选不够：用热门/新歌按日推种子填充
  if (picked.length < LIMIT) {
    const used = new Set(picked.map((t) => t.id))
    const fillers = [...published]
      .filter((t) => !used.has(t.id) && !seedIds.has(t.id))
      .sort(
        (a, b) =>
          dailyHash(`${userId}|${dateKey}|fill|${a.id}`) -
          dailyHash(`${userId}|${dateKey}|fill|${b.id}`),
      )
    for (const t of fillers) {
      picked.push(t)
      if (picked.length >= LIMIT) break
    }
  }

  // 极端冷库：仍不够则允许包含种子曲
  if (picked.length < LIMIT) {
    const used = new Set(picked.map((t) => t.id))
    for (const t of published) {
      if (used.has(t.id)) continue
      picked.push(t)
      if (picked.length >= LIMIT) break
    }
  }

  picked = picked.slice(0, LIMIT)

  const likedSet = new Set(
    (
      await prisma.like.findMany({
        where: { userId, trackId: { in: picked.map((t) => t.id) } },
        select: { trackId: true },
      })
    ).map((l) => l.trackId),
  )

  const topArtists = [...artistScore.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name)

  return ok(res, {
    date: dateKey,
    day,
    month,
    year,
    updateTip: '每天 6:00 更新',
    description: topArtists.length
      ? `根据你常听的「${topArtists.join('、')}」等口味生成`
      : '根据你的音乐口味生成，每天 6:00 更新',
    tracks: picked.map((t) => toTrackDto(t, likedSet.has(t.id))),
  })
})

export default router
