<template>
  <div v-loading="loading" class="search-page">
    <h1 class="keyword">{{ keyword || '搜索' }}</h1>

    <div class="tabs">
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        class="tab"
        :class="{ active: tab === t.key }"
        @click="tab = t.key"
      >
        {{ t.label }}
      </button>
    </div>

    <template v-if="keyword">
      <section v-if="tab === 'all' || tab === 'artist'" class="block">
        <div v-if="artistSummary" class="artist-card" @click="goArtist(artistSummary.name)">
          <div class="artist-avatar" :style="artistCover" />
          <div class="artist-info">
            <div class="artist-label">歌手：{{ artistSummary.name }}</div>
            <div class="artist-stats">{{ artistSummary.count }} 首单曲</div>
          </div>
        </div>
        <el-empty v-else-if="tab === 'artist'" description="未找到相关歌手" :image-size="64" />
      </section>

      <section v-if="tab === 'all' || tab === 'song'" class="block">
        <div class="block-head">
          <h3>单曲</h3>
          <el-button
            type="danger"
            round
            size="small"
            :disabled="!tracks.length"
            @click="playAll"
          >
            <el-icon><VideoPlay /></el-icon>
            播放
          </el-button>
        </div>
        <div v-if="sourceTips.length" class="source-tips">
          <span
            v-for="s in sourceTips"
            :key="s.source"
            class="source-tip"
            :class="{ bad: !s.ok && !s.pending, pending: s.pending }"
          >
            <template v-if="s.pending">{{ s.label }} 加载中</template>
            <template v-else>
              {{ s.label }}{{ s.ok ? ` ${s.count}首` : ' 失败' }}
              <span v-if="!s.ok && s.error" class="source-err" :title="s.error">
                （{{ s.error }}）
              </span>
            </template>
          </span>
        </div>
        <SongGrid :tracks="tracks" :columns="2" hide-empty @refresh="reload" />
        <el-empty
          v-if="!tracks.length && !loading && !sourcesPending"
          description="未找到相关单曲"
          :image-size="64"
        />
        <div v-if="tracks.length || sourcesPending" class="load-more">
          <el-button
            v-if="hasMore || sourcesPending"
            round
            :loading="loadingMore || sourcesPending"
            :disabled="loading || loadingMore || sourcesPending"
            @click="loadMore"
          >
            {{ sourcesPending ? '正在加载更多源…' : '加载更多' }}
          </el-button>
          <span v-else class="load-more-end">没有更多了</span>
        </div>
      </section>

      <section v-if="tab === 'all' || tab === 'playlist'" class="block">
        <div class="block-head">
          <h3>歌单</h3>
        </div>
        <div v-if="matchedPlaylists.length" class="plist-row">
          <router-link
            v-for="p in matchedPlaylists"
            :key="p.id"
            :to="`/playlist/${p.id}`"
            class="plist-card"
          >
            <div class="plist-cover" :style="plistCover(p)" />
            <div class="plist-name">{{ p.name }}</div>
            <div class="plist-count">{{ p.trackCount || 0 }}首</div>
          </router-link>
        </div>
        <el-empty v-else description="未找到相关歌单" :image-size="64" />
      </section>
    </template>

    <el-empty v-else description="输入关键词搜索歌曲 / 歌手 / 专辑" :image-size="80" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { VideoPlay } from '@element-plus/icons-vue'
import type { MusicSource, PlaylistDto, TrackDto } from '@wy-music/shared'
import { MUSIC_SOURCES, MUSIC_SOURCE_LABEL } from '@wy-music/shared'
import { http, mediaUrl } from '../services/http'
import { parallelExternalSearch, type SourceSearchStat } from '../services/externalMusic'
import { usePlayerStore } from '../stores/player'
import { usePlaylistStore } from '../stores/playlist'
import { useUserStore } from '../stores/user'
import SongGrid from '../components/SongGrid.vue'

/** 与皮卡丘站默认一致：每源每次 20 首 */
const PAGE_SIZE = 20

const route = useRoute()
const router = useRouter()
const player = usePlayerStore()
const playlistStore = usePlaylistStore()
const user = useUserStore()

const tabs = [
  { key: 'all', label: '综合' },
  { key: 'song', label: '单曲' },
  { key: 'playlist', label: '歌单' },
  { key: 'artist', label: '歌手' },
] as const

type TabKey = (typeof tabs)[number]['key']

const tab = ref<TabKey>('all')
const loading = ref(false)
const loadingMore = ref(false)
const hasMore = ref(false)
const page = ref(1)
const tracks = ref<TrackDto[]>([])
const sourceStats = ref<SourceSearchStat[]>([])
let seq = 0

const keyword = computed(() => String(route.query.keyword || '').trim())

const sourceTips = computed(() =>
  sourceStats.value.map((s) => ({
    ...s,
    label: MUSIC_SOURCE_LABEL[s.source as MusicSource] || s.source,
    error: s.error ? s.error.slice(0, 40) : undefined,
  })),
)

const sourcesPending = computed(() => sourceStats.value.some((s) => s.pending))

const artistSummary = computed(() => {
  if (!keyword.value || !tracks.value.length) return null
  const kw = keyword.value.toLowerCase()
  const matched = tracks.value.filter((t) =>
    (t.artists || []).some((a) => a.toLowerCase().includes(kw)),
  )
  if (!matched.length) return null
  const name =
    matched[0].artists?.find((a) => a.toLowerCase().includes(kw)) ||
    matched[0].artists?.[0] ||
    keyword.value
  return {
    name,
    count: matched.length,
    coverUrl: matched[0].coverUrl,
  }
})

const artistCover = computed(() => {
  const url = mediaUrl(artistSummary.value?.coverUrl)
  return url
    ? { backgroundImage: `url(${url})` }
    : { backgroundImage: 'linear-gradient(135deg,var(--wy-brand),#ff8a80)' }
})

const matchedPlaylists = computed(() => {
  if (!keyword.value) return []
  const kw = keyword.value.toLowerCase()
  return playlistStore.createdPlaylists.filter((p) => p.name.toLowerCase().includes(kw))
})

function plistCover(p: PlaylistDto) {
  const url = mediaUrl(p.coverUrl)
  if (url) return { backgroundImage: `url(${url})` }
  return { backgroundImage: 'linear-gradient(135deg,#ff8a80,var(--wy-brand))' }
}

function mergeTracks(prev: TrackDto[], next: TrackDto[]) {
  const seen = new Set(prev.map((t) => t.id))
  const out = [...prev]
  for (const t of next) {
    if (!t?.id || seen.has(t.id)) continue
    seen.add(t.id)
    out.push(t)
  }
  return out
}

async function fetchLocal(nextPage: number) {
  try {
    const { data } = await http.get('/api/tracks', {
      params: { page: nextPage, pageSize: PAGE_SIZE, keyword: keyword.value },
    })
    const list = ((data.data.list || []) as TrackDto[]).map((t) => ({
      ...t,
      source: 'local' as const,
    }))
    const total = Number(data.data.total || 0)
    return {
      list,
      hasMore: nextPage * PAGE_SIZE < total,
    }
  } catch {
    return { list: [] as TrackDto[], hasMore: false }
  }
}

function initPendingSourceStats(): SourceSearchStat[] {
  return MUSIC_SOURCES.map((source) => ({
    source,
    ok: true,
    count: 0,
    hasMore: false,
    pending: true,
  }))
}

function patchSourceStat(stat: SourceSearchStat) {
  const idx = sourceStats.value.findIndex((s) => s.source === stat.source)
  if (idx >= 0) {
    const next = sourceStats.value.slice()
    next[idx] = stat
    sourceStats.value = next
  } else {
    sourceStats.value = [...sourceStats.value, stat]
  }
}

async function fetchPage(nextPage: number, append: boolean) {
  if (!keyword.value) {
    tracks.value = []
    hasMore.value = false
    sourceStats.value = []
    return
  }
  const token = ++seq
  if (append) {
    loadingMore.value = true
    // 加载更多时把各源重新标为 pending，便于提示
    sourceStats.value = initPendingSourceStats()
  } else {
    loading.value = true
    tracks.value = []
    sourceStats.value = initPendingSourceStats()
  }

  let localHasMore = false

  const clearFullPageLoading = () => {
    if (token !== seq) return
    // 任一源/本地先到即可去掉全页遮罩，后续结果渐进追加
    if (loading.value) loading.value = false
  }

  try {
    const cumulativeLimit = nextPage * PAGE_SIZE

    const localP = fetchLocal(nextPage).then((local) => {
      if (token !== seq) return
      localHasMore = local.hasMore
      if (append) {
        tracks.value = mergeTracks(tracks.value, local.list)
      } else {
        // 本地与已先到的外部结果合并（外部可能比本地更快返回）
        const externalArrived = tracks.value.filter((t) => t.source && t.source !== 'local')
        tracks.value = mergeTracks(local.list, externalArrived)
      }
      hasMore.value = localHasMore || sourceStats.value.some((s) => s.hasMore || s.pending)
      clearFullPageLoading()
    })

    const externalP = parallelExternalSearch({
      keyword: keyword.value,
      pageSize: PAGE_SIZE,
      page: nextPage,
      cumulativeLimit,
      onSource: (chunk) => {
        if (token !== seq) return
        patchSourceStat({
          source: chunk.source,
          ok: chunk.ok,
          count: chunk.list.length,
          hasMore: chunk.hasMore,
          error: chunk.error,
          pending: false,
        })
        if (chunk.ok && chunk.list.length) {
          tracks.value = mergeTracks(tracks.value, chunk.list)
        }
        hasMore.value =
          localHasMore || sourceStats.value.some((s) => s.hasMore || Boolean(s.pending))
        clearFullPageLoading()
      },
    })

    const [, external] = await Promise.all([localP, externalP])
    if (token !== seq) return

    page.value = nextPage
    // 最终以有序 sources 覆盖（与 MUSIC_SOURCES 一致）
    sourceStats.value = external.sources
    hasMore.value = localHasMore || external.hasMore
    if (!append && user.accessToken) await playlistStore.fetchMine()
  } catch {
    if (token === seq && !append) {
      hasMore.value = false
    }
  } finally {
    if (token === seq) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

function reload() {
  page.value = 1
  void fetchPage(1, false)
}

function loadMore() {
  if (loading.value || loadingMore.value || !hasMore.value || !keyword.value) return
  void fetchPage(page.value + 1, true)
}

function playAll() {
  if (!tracks.value.length) return
  player.setQueue(tracks.value, 0)
}

function goArtist(name: string) {
  router.push(`/artist/${encodeURIComponent(name)}`)
}

watch(
  keyword,
  () => {
    tracks.value = []
    page.value = 1
    hasMore.value = false
    sourceStats.value = []
    void fetchPage(1, false)
  },
  { immediate: true },
)
</script>

<style scoped lang="scss">
.search-page {
  min-height: 360px;
}
.keyword {
  margin: 0 0 12px;
  font-size: 28px;
  font-weight: 700;
  color: #222;
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 20px;
  border-bottom: 1px solid #eee;
  margin-bottom: 20px;
}
.tab {
  border: none;
  background: transparent;
  padding: 10px 2px 12px;
  font-size: 14px;
  color: var(--wy-text-secondary);
  cursor: pointer;
  position: relative;
  &.active {
    color: var(--wy-brand);
    font-weight: 600;
    &::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 2px;
      background: var(--wy-brand);
      border-radius: 1px;
    }
  }
}
.block {
  margin-bottom: 28px;
}
.block-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  h3 {
    margin: 0;
    font-size: 18px;
  }
}
.artist-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px;
  border-radius: 10px;
  background: var(--wy-surface-muted);
  margin-bottom: 20px;
  max-width: 420px;
  cursor: pointer;
  transition: background 0.15s;
  &:hover {
    background: var(--wy-border);
  }
}
.artist-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
}
.artist-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--wy-text);
}
.artist-stats {
  margin-top: 6px;
  font-size: 12px;
  color: var(--wy-text-muted);
}
.plist-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 16px;
}
.plist-card {
  color: inherit;
  text-decoration: none;
}
.plist-cover {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  background-size: cover;
  background-position: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.plist-name {
  margin-top: 8px;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.plist-count {
  font-size: 12px;
  color: var(--wy-text-muted);
}
.load-more {
  display: flex;
  justify-content: center;
  padding: 20px 0 8px;
}
.load-more-end {
  font-size: 12px;
  color: var(--wy-text-muted);
}
.source-tips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--wy-text-muted);
}
.source-tip {
  &.bad {
    color: var(--wy-brand-hover);
  }
  &.pending {
    color: var(--wy-text-muted);
  }
}
.source-err {
  color: #b07a7a;
}
</style>
