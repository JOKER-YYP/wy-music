<template>
  <div v-loading="loading" class="radar-page">
    <template v-if="data">
      <header class="hero">
        <div class="hero-text">
          <div class="eyebrow">私人雷达</div>
          <h1>听歌报告 · 因为你听了</h1>
          <p class="lead">{{ data.weekly.summary }}</p>
          <div class="hero-actions">
            <el-button type="danger" round :disabled="!allRadarTracks.length" @click="playAllRadar">
              播放雷达精选
            </el-button>
            <el-button round @click="goDaily">每日推荐</el-button>
          </div>
        </div>
        <div class="week-card">
          <div class="week-label">本周 {{ data.weekly.rangeLabel }}</div>
          <div class="stat-grid">
            <div class="stat">
              <div class="stat-num">{{ data.weekly.playCount }}</div>
              <div class="stat-name">播放次数</div>
            </div>
            <div class="stat">
              <div class="stat-num">{{ data.weekly.uniqueTracks }}</div>
              <div class="stat-name">不同歌曲</div>
            </div>
            <div class="stat">
              <div class="stat-num">{{ data.weekly.listenMinutes }}</div>
              <div class="stat-name">约分钟</div>
            </div>
            <div class="stat">
              <div class="stat-num">{{ data.weekly.newLikes }}</div>
              <div class="stat-name">新喜欢</div>
            </div>
          </div>
          <div class="day-bars" aria-hidden="true">
            <div v-for="d in data.weekly.daily" :key="d.date" class="day-col">
              <div class="bar-wrap">
                <div class="bar" :style="{ height: dayBarPct(d.playCount) }" />
              </div>
              <span class="day-label">{{ weekdayShort(d.date) }}</span>
            </div>
          </div>
        </div>
      </header>

      <section v-if="data.weekly.topArtists.length" class="block">
        <h2 class="block-title">本周常听歌手</h2>
        <div class="artist-chips">
          <button
            v-for="a in data.weekly.topArtists"
            :key="a.name"
            type="button"
            class="artist-chip"
            @click="goArtist(a.name)"
          >
            <span class="chip-name">{{ a.name }}</span>
            <span class="chip-meta">{{ a.playCount }} 次 · {{ a.trackCount }} 首</span>
          </button>
        </div>
      </section>

      <section v-if="data.weekly.topTracks.length" class="block">
        <div class="block-head">
          <h2 class="block-title">本周最常听</h2>
          <el-button
            text
            type="danger"
            :disabled="!data.weekly.topTracks.length"
            @click="playWeeklyTop"
          >
            播放全部
          </el-button>
        </div>
        <div class="track-list">
          <button
            v-for="(row, idx) in data.weekly.topTracks"
            :key="row.track.id"
            type="button"
            class="track-row"
            :class="{ active: isCurrent(row.track) }"
            @dblclick="playWeeklyAt(idx)"
            @click="playWeeklyAt(idx)"
          >
            <span class="rank">{{ String(idx + 1).padStart(2, '0') }}</span>
            <div class="cover" :style="coverStyle(row.track.coverUrl)" />
            <div class="meta">
              <div class="name">{{ row.track.name }}</div>
              <div class="artists">{{ row.track.artists?.join(' / ') || '未知歌手' }}</div>
            </div>
            <span class="plays">{{ row.playCount }} 次</span>
          </button>
        </div>
      </section>

      <section v-if="data.sections.length" class="block because-block">
        <h2 class="block-title">因为你听了</h2>
        <p class="block-desc">根据最近播放与喜欢，为你找来相近口味的歌</p>
        <div v-for="sec in data.sections" :key="sec.id" class="because-sec">
          <div class="because-head">
            <div class="reason-cover" :style="coverStyle(sec.reasonCoverUrl)" />
            <div class="reason-meta">
              <div class="headline">{{ sec.headline }}</div>
              <div class="sub">
                {{ sec.reasonArtists?.join(' / ') || '未知歌手' }} · 推荐 {{ sec.tracks.length }} 首
              </div>
            </div>
            <el-button
              type="danger"
              round
              size="small"
              :disabled="!sec.tracks.length"
              @click="playSection(sec)"
            >
              播放
            </el-button>
          </div>
          <div class="because-tracks">
            <button
              v-for="(t, i) in sec.tracks"
              :key="t.id"
              type="button"
              class="mini-track"
              :class="{ active: isCurrent(t) }"
              @click="playSectionAt(sec, i)"
            >
              <div class="mini-cover" :style="coverStyle(t.coverUrl)" />
              <div class="mini-meta">
                <div class="name">{{ t.name }}</div>
                <div class="artists">{{ t.artists?.join(' / ') || '未知歌手' }}</div>
              </div>
            </button>
          </div>
        </div>
      </section>

      <el-empty
        v-if="!data.weekly.playCount && !data.sections.length"
        description="多听几首歌后，这里会生成你的周报与推荐"
      />
    </template>
    <el-empty v-else-if="!loading" description="加载失败，请稍后重试" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { PersonalRadarDto, TrackDto } from '@wy-music/shared'
import { http, mediaUrl } from '../services/http'
import { usePlayerStore } from '../stores/player'
import { useUserStore } from '../stores/user'
import { useUiStore } from '../stores/ui'

const router = useRouter()
const player = usePlayerStore()
const user = useUserStore()
const ui = useUiStore()

const loading = ref(false)
const data = ref<PersonalRadarDto | null>(null)

const allRadarTracks = computed(() => {
  if (!data.value) return [] as TrackDto[]
  const list: TrackDto[] = []
  const seen = new Set<string>()
  for (const sec of data.value.sections) {
    for (const t of sec.tracks) {
      if (seen.has(t.id)) continue
      seen.add(t.id)
      list.push(t)
    }
  }
  return list
})

const maxDayPlays = computed(() => {
  const days = data.value?.weekly.daily || []
  return Math.max(1, ...days.map((d) => d.playCount))
})

function dayBarPct(n: number) {
  const pct = Math.round((n / maxDayPlays.value) * 100)
  return `${Math.max(n > 0 ? 8 : 0, pct)}%`
}

function weekdayShort(ymd: string) {
  const d = new Date(`${ymd}T12:00:00+08:00`)
  const map = ['日', '一', '二', '三', '四', '五', '六']
  return map[d.getDay()] || ''
}

function coverStyle(url?: string | null) {
  const u = mediaUrl(url)
  return u
    ? { backgroundImage: `url(${u})` }
    : { backgroundImage: 'var(--wy-cover-gradient)' }
}

function isCurrent(row: TrackDto) {
  return player.currentTrack?.id === row.id
}

async function load() {
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  loading.value = true
  try {
    const { data: res } = await http.get('/api/discover/radar')
    data.value = res.data as PersonalRadarDto
  } catch {
    data.value = null
  } finally {
    loading.value = false
  }
}

function playWeeklyTop() {
  const tracks = data.value?.weekly.topTracks.map((x) => x.track) || []
  if (!tracks.length) return
  player.setQueue(tracks, 0)
}

function playWeeklyAt(idx: number) {
  const tracks = data.value?.weekly.topTracks.map((x) => x.track) || []
  if (!tracks[idx]) return
  player.setQueue(tracks, idx)
}

function playSection(sec: PersonalRadarDto['sections'][number]) {
  if (!sec.tracks.length) return
  player.setQueue(sec.tracks, 0)
}

function playSectionAt(sec: PersonalRadarDto['sections'][number], idx: number) {
  if (!sec.tracks[idx]) return
  player.setQueue(sec.tracks, idx)
}

function playAllRadar() {
  if (!allRadarTracks.value.length) return
  player.setQueue(allRadarTracks.value, 0)
}

function goDaily() {
  router.push('/recommend/daily')
}

function goArtist(name: string) {
  router.push(`/artist/${encodeURIComponent(name)}`)
}

onMounted(load)
</script>

<style scoped lang="scss">
.radar-page {
  padding: 4px 2px 32px;
  min-height: 100%;
}
.hero {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 20px;
  align-items: stretch;
  margin-bottom: 28px;
}
@media (max-width: 960px) {
  .hero {
    grid-template-columns: 1fr;
  }
}
.eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--wy-brand);
  font-weight: 600;
  margin-bottom: 8px;
}
.hero-text h1 {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
}
.lead {
  margin: 12px 0 0;
  color: var(--wy-text-secondary);
  font-size: 14px;
  line-height: 1.55;
  max-width: 42em;
}
.hero-actions {
  margin-top: 18px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.week-card {
  border-radius: 16px;
  padding: 16px 18px 14px;
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--wy-brand) 18%, var(--wy-surface)),
    var(--wy-surface)
  );
  border: 1px solid var(--wy-border);
  box-shadow: var(--wy-shadow-sm);
}
.week-label {
  font-size: 12px;
  color: var(--wy-text-muted);
  margin-bottom: 12px;
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.stat-num {
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--wy-text);
}
.stat-name {
  margin-top: 2px;
  font-size: 11px;
  color: var(--wy-text-muted);
}
.day-bars {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
  align-items: end;
  height: 72px;
}
.day-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  height: 100%;
}
.bar-wrap {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.bar {
  width: 70%;
  max-width: 18px;
  border-radius: 6px 6px 2px 2px;
  background: var(--wy-brand);
  min-height: 0;
  transition: height 0.25s ease;
}
.day-label {
  font-size: 11px;
  color: var(--wy-text-muted);
}
.block {
  margin-top: 28px;
}
.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.block-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}
.block-desc {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--wy-text-muted);
}
.artist-chips {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.artist-chip {
  border: 1px solid var(--wy-border);
  background: var(--wy-surface-muted);
  border-radius: 12px;
  padding: 10px 14px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
  &:hover {
    border-color: color-mix(in srgb, var(--wy-brand) 40%, var(--wy-border));
    background: var(--wy-brand-soft);
  }
}
.chip-name {
  display: block;
  font-weight: 600;
  font-size: 14px;
  color: var(--wy-text);
}
.chip-meta {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--wy-text-muted);
}
.track-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.track-row {
  display: grid;
  grid-template-columns: 36px 48px 1fr auto;
  gap: 12px;
  align-items: center;
  width: 100%;
  border: none;
  background: transparent;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  color: inherit;
  &:hover,
  &.active {
    background: var(--wy-surface-muted);
  }
}
.rank {
  font-variant-numeric: tabular-nums;
  color: var(--wy-text-muted);
  font-size: 13px;
  font-weight: 600;
}
.cover,
.reason-cover,
.mini-cover {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
}
.meta .name,
.mini-meta .name {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta .artists,
.mini-meta .artists,
.sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--wy-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.plays {
  font-size: 12px;
  color: var(--wy-text-secondary);
  font-variant-numeric: tabular-nums;
}
.because-sec {
  margin-top: 18px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid var(--wy-border);
  background: var(--wy-surface);
}
.because-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.reason-meta {
  flex: 1;
  min-width: 0;
}
.headline {
  font-size: 15px;
  font-weight: 700;
}
.because-tracks {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}
.mini-track {
  display: flex;
  align-items: center;
  gap: 10px;
  border: none;
  background: var(--wy-surface-muted);
  border-radius: 10px;
  padding: 8px;
  cursor: pointer;
  text-align: left;
  color: inherit;
  min-width: 0;
  &:hover,
  &.active {
    background: color-mix(in srgb, var(--wy-brand) 12%, var(--wy-surface-muted));
  }
}
.mini-cover {
  width: 40px;
  height: 40px;
}
.mini-meta {
  min-width: 0;
  flex: 1;
}
</style>
