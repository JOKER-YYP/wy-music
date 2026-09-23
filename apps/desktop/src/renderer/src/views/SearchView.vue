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
        <SongGrid :tracks="tracks" :columns="2" @refresh="load" />
        <el-empty v-if="!tracks.length && !loading" description="未找到相关单曲" :image-size="64" />
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
import type { PlaylistDto, TrackDto } from '@wy-music/shared'
import { http, mediaUrl } from '../services/http'
import { usePlayerStore } from '../stores/player'
import { usePlaylistStore } from '../stores/playlist'
import { useUserStore } from '../stores/user'
import SongGrid from '../components/SongGrid.vue'

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
const tracks = ref<TrackDto[]>([])

const keyword = computed(() => String(route.query.keyword || '').trim())

const artistSummary = computed(() => {
  if (!keyword.value || !tracks.value.length) return null
  const kw = keyword.value.toLowerCase()
  const matched = tracks.value.filter((t) =>
    (t.artists || []).some((a) => a.toLowerCase().includes(kw)),
  )
  if (!matched.length) return null
  const name =
    matched[0].artists?.find((a) => a.toLowerCase().includes(kw)) || matched[0].artists?.[0] || keyword.value
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
    : { backgroundImage: 'linear-gradient(135deg,#ec4141,#ff8a80)' }
})

const matchedPlaylists = computed(() => {
  if (!keyword.value) return []
  const kw = keyword.value.toLowerCase()
  return playlistStore.createdPlaylists.filter((p) => p.name.toLowerCase().includes(kw))
})

function plistCover(p: PlaylistDto) {
  const url = mediaUrl(p.coverUrl)
  if (url) return { backgroundImage: `url(${url})` }
  return { backgroundImage: 'linear-gradient(135deg,#ff8a80,#ec4141)' }
}

async function load() {
  if (!keyword.value) {
    tracks.value = []
    return
  }
  loading.value = true
  try {
    const { data } = await http.get('/api/tracks', {
      params: { page: 1, pageSize: 40, keyword: keyword.value },
    })
    tracks.value = data.data.list || []
    if (user.accessToken) await playlistStore.fetchMine()
  } finally {
    loading.value = false
  }
}

function playAll() {
  if (!tracks.value.length) return
  player.setQueue(tracks.value, 0)
}

function goArtist(name: string) {
  router.push(`/artist/${encodeURIComponent(name)}`)
}

watch(keyword, load, { immediate: true })
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
  color: #666;
  cursor: pointer;
  position: relative;
  &.active {
    color: #ec4141;
    font-weight: 600;
    &::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 2px;
      background: #ec4141;
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
  background: #fafafa;
  margin-bottom: 20px;
  max-width: 420px;
  cursor: pointer;
  transition: background 0.15s;
  &:hover {
    background: #f0f0f0;
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
  color: #333;
}
.artist-stats {
  margin-top: 6px;
  font-size: 12px;
  color: #999;
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
  color: #999;
}
</style>
