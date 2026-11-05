import { prisma } from '../db.js'
import { parseArtists, toTrackDto } from '../utils/mapper.js'

export type WeeklyArtistStat = {
  name: string
  playCount: number
  trackCount: number
}

export type WeeklyTrackStat = {
  track: ReturnType<typeof toTrackDto>
  playCount: number
}

export type WeeklyDayStat = {
  date: string
  playCount: number
}

export type WeeklyReport = {
  weekStart: string
  weekEnd: string
  rangeLabel: string
  playCount: number
  uniqueTracks: number
  listenMinutes: number
  newLikes: number
  topArtists: WeeklyArtistStat[]
  topTracks: WeeklyTrackStat[]
  daily: WeeklyDayStat[]
  summary: string
}

export type BecauseSection = {
  id: string
  reasonTrackId: string
  reasonTitle: string
  reasonArtists: string[]
  reasonCoverUrl?: string | null
  headline: string
  tracks: ReturnType<typeof toTrackDto>[]
}

/** 上海时区日历日 YYYY-MM-DD */
function shanghaiYmd(d = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(d)
}

/** 本周一 00:00（上海）对应的 UTC Date */
function weekRangeShanghai(now = new Date()) {
  const ymd = shanghaiYmd(now)
  const [y, m, d] = ymd.split('-').map(Number)
  // 用 UTC 正午避免 DST；再按上海 weekday 回推到周一
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 4, 0, 0)) // 约等于上海中午
  const wdFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    weekday: 'short',
  })
  const wd = wdFmt.format(noonUtc) // Mon Tue ...
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  }
  const offset = map[wd] ?? 0
  const mondayYmdDate = new Date(Date.UTC(y, m - 1, d))
  mondayYmdDate.setUTCDate(mondayYmdDate.getUTCDate() - offset)

  const weekStartYmd = mondayYmdDate.toISOString().slice(0, 10)
  const sunday = new Date(mondayYmdDate)
  sunday.setUTCDate(sunday.getUTCDate() + 6)
  const weekEndYmd = sunday.toISOString().slice(0, 10)

  // 查询窗口：周一 00:00 上海 ≈ UTC 前一天 16:00
  const startUtc = new Date(`${weekStartYmd}T00:00:00+08:00`)
  const endUtc = new Date(`${weekEndYmd}T23:59:59.999+08:00`)

  return {
    weekStart: weekStartYmd,
    weekEnd: weekEndYmd,
    startUtc,
    endUtc,
    rangeLabel: `${weekStartYmd.slice(5).replace('-', '.')}-${weekEndYmd.slice(5).replace('-', '.')}`,
  }
}

function dayKeyShanghai(d: Date): string {
  return shanghaiYmd(d)
}

function isWeakArtist(name: string) {
  const n = name.trim()
  return !n || n === '未知歌手'
}

/**
 * 听歌周报：基于 PlayEvent（无事件时回退 PlayHistory 本周刷新）
 */
export async function buildWeeklyReport(userId: string): Promise<WeeklyReport> {
  const { weekStart, weekEnd, startUtc, endUtc, rangeLabel } = weekRangeShanghai()

  const [events, likes] = await Promise.all([
    prisma.playEvent.findMany({
      where: { userId, playedAt: { gte: startUtc, lte: endUtc } },
      include: {
        track: { include: { uploader: { select: { nickname: true } } } },
      },
      orderBy: { playedAt: 'desc' },
      take: 2000,
    }),
    prisma.like.findMany({
      where: { userId, createdAt: { gte: startUtc, lte: endUtc } },
      select: { trackId: true },
    }),
  ])

  // 冷启动：尚无事件时，用本周更新过的最近播放兜底（次数记 1）
  let rows = events
  if (!rows.length) {
    const hist = await prisma.playHistory.findMany({
      where: { userId, playedAt: { gte: startUtc, lte: endUtc } },
      include: {
        track: { include: { uploader: { select: { nickname: true } } } },
      },
      orderBy: { playedAt: 'desc' },
      take: 200,
    })
    rows = hist.map((h) => ({
      id: h.id,
      userId: h.userId,
      trackId: h.trackId,
      playedAt: h.playedAt,
      durationMs: h.track.durationMs || 0,
      track: h.track,
    })) as typeof events
  }

  const trackPlay = new Map<string, { count: number; track: (typeof rows)[0]['track'] }>()
  const artistPlay = new Map<string, { playCount: number; tracks: Set<string> }>()
  const dailyMap = new Map<string, number>()

  // 预填本周 7 天
  {
    const cursor = new Date(`${weekStart}T12:00:00+08:00`)
    for (let i = 0; i < 7; i++) {
      dailyMap.set(shanghaiYmd(cursor), 0)
      cursor.setDate(cursor.getDate() + 1)
    }
  }

  let listenMs = 0
  for (const ev of rows) {
    if (!ev.track || ev.track.status !== 'published') continue
    const cur = trackPlay.get(ev.trackId) || { count: 0, track: ev.track }
    cur.count += 1
    trackPlay.set(ev.trackId, cur)

    for (const a of parseArtists(ev.track.artists)) {
      if (isWeakArtist(a)) continue
      const ac = artistPlay.get(a) || { playCount: 0, tracks: new Set<string>() }
      ac.playCount += 1
      ac.tracks.add(ev.trackId)
      artistPlay.set(a, ac)
    }

    const dk = dayKeyShanghai(ev.playedAt)
    dailyMap.set(dk, (dailyMap.get(dk) || 0) + 1)

    // 估算：按曲目时长的 60% 封顶，避免一次点播就记满长
    const dur = ev.durationMs || ev.track.durationMs || 0
    listenMs += Math.min(dur, Math.max(30_000, Math.floor(dur * 0.6)))
  }

  const topTracks: WeeklyTrackStat[] = [...trackPlay.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([, v]) => ({
      track: toTrackDto(v.track),
      playCount: v.count,
    }))

  const topArtists: WeeklyArtistStat[] = [...artistPlay.entries()]
    .sort((a, b) => b[1].playCount - a[1].playCount)
    .slice(0, 8)
    .map(([name, v]) => ({
      name,
      playCount: v.playCount,
      trackCount: v.tracks.size,
    }))

  const daily: WeeklyDayStat[] = [...dailyMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, playCount]) => ({ date, playCount }))

  const playCount = rows.length
  const uniqueTracks = trackPlay.size
  const listenMinutes = Math.max(0, Math.round(listenMs / 60_000))
  const newLikes = likes.length

  let summary = '本周还没有听歌记录，去发现页逛逛吧'
  if (playCount > 0) {
    const top = topArtists[0]?.name
    summary = top
      ? `本周听了 ${playCount} 次、${uniqueTracks} 首歌，约 ${listenMinutes} 分钟；最爱歌手是 ${top}`
      : `本周听了 ${playCount} 次、${uniqueTracks} 首歌，约 ${listenMinutes} 分钟`
    if (newLikes > 0) summary += `，新喜欢 ${newLikes} 首`
  }

  return {
    weekStart,
    weekEnd,
    rangeLabel,
    playCount,
    uniqueTracks,
    listenMinutes,
    newLikes,
    topArtists,
    topTracks,
    daily,
    summary,
  }
}

/**
 * 私人雷达：「因为你听了 …」分块推荐
 */
export async function buildBecauseYouListened(
  userId: string,
  opts?: { sections?: number; perSection?: number },
): Promise<{ sections: BecauseSection[]; generatedAt: string }> {
  const SECTION_N = Math.min(6, Math.max(1, opts?.sections ?? 4))
  const PER = Math.min(12, Math.max(4, opts?.perSection ?? 8))

  const [history, likes, published] = await Promise.all([
    prisma.playHistory.findMany({
      where: { userId },
      include: { track: true },
      orderBy: { playedAt: 'desc' },
      take: 80,
    }),
    prisma.like.findMany({
      where: { userId },
      include: { track: true },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
    prisma.track.findMany({
      where: { status: 'published' },
      include: { uploader: { select: { nickname: true } } },
      orderBy: { playCount: 'desc' },
      take: 500,
    }),
  ])

  // 种子：最近听过 + 喜欢（优先有明确歌手的）
  type Seed = { track: (typeof history)[0]['track']; weight: number; source: 'history' | 'like' }
  const seedMap = new Map<string, Seed>()
  let hi = 0
  for (const h of history) {
    if (h.track.status !== 'published') continue
    const arts = parseArtists(h.track.artists).filter((a) => !isWeakArtist(a))
    if (!arts.length) continue
    const w = Math.max(1, 10 - hi * 0.15)
    const prev = seedMap.get(h.trackId)
    if (!prev || prev.weight < w) {
      seedMap.set(h.trackId, { track: h.track, weight: w, source: 'history' })
    }
    hi += 1
    if (hi >= 40) break
  }
  for (const like of likes) {
    if (like.track.status !== 'published') continue
    const arts = parseArtists(like.track.artists).filter((a) => !isWeakArtist(a))
    if (!arts.length) continue
    const w = 12
    const prev = seedMap.get(like.trackId)
    if (!prev || prev.weight < w) {
      seedMap.set(like.trackId, { track: like.track, weight: w, source: 'like' })
    }
  }

  const seeds = [...seedMap.values()].sort((a, b) => b.weight - a.weight)
  if (!seeds.length) {
    return { sections: [], generatedAt: new Date().toISOString() }
  }

  // 按主歌手聚类，每歌手取代表性种子曲
  const byArtist = new Map<string, Seed>()
  for (const s of seeds) {
    const main = parseArtists(s.track.artists).find((a) => !isWeakArtist(a))
    if (!main) continue
    const prev = byArtist.get(main)
    if (!prev || prev.weight < s.weight) byArtist.set(main, s)
  }

  const artistSeeds = [...byArtist.entries()]
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, SECTION_N)

  const globalUsed = new Set<string>(seeds.map((s) => s.track.id))
  const likedIds = new Set(likes.map((l) => l.trackId))
  const sections: BecauseSection[] = []

  for (const [artist, seed] of artistSeeds) {
    const candidates = published
      .filter((t) => {
        if (globalUsed.has(t.id)) return false
        const arts = parseArtists(t.artists)
        return arts.some((a) => a === artist || a.includes(artist) || artist.includes(a))
      })
      .map((t) => {
        let score = Math.log10((t.playCount || 0) + 1)
        if (!isWeakAlbum(seed.track.album) && t.album === seed.track.album) score += 4
        if (likedIds.has(t.id)) score -= 2 // 已喜欢的略降权，留给新发现
        return { t, score }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, PER)

    if (!candidates.length) continue

    const tracks = candidates.map((c) => {
      globalUsed.add(c.t.id)
      const dto = toTrackDto(c.t)
      return { ...dto, liked: likedIds.has(c.t.id) }
    })

    const reasonArtists = parseArtists(seed.track.artists)
    sections.push({
      id: `because-${seed.track.id}`,
      reasonTrackId: seed.track.id,
      reasonTitle: seed.track.name,
      reasonArtists,
      reasonCoverUrl: seed.track.coverUrl,
      headline:
        seed.source === 'like'
          ? `因为你喜欢了《${seed.track.name}》`
          : `因为你听了《${seed.track.name}》`,
      tracks,
    })
  }

  return { sections, generatedAt: new Date().toISOString() }
}

function isWeakAlbum(name: string | null | undefined) {
  const n = (name || '').trim()
  return !n || n === '未知专辑'
}
