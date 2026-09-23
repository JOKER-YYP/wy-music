<template>
  <div v-loading="loading" class="artist-page">
    <template v-if="detail">
      <div class="header">
        <div class="avatar" :style="avatarStyle">
          <span v-if="!avatarSrc" class="avatar-letter">{{ detail.name.slice(0, 1) }}</span>
        </div>
        <div class="meta">
          <h1>{{ detail.name }}</h1>
          <div class="sub">
            <span v-if="detail.alias">{{ detail.alias }}</span>
            <span v-else>单曲 {{ detail.trackCount }} · 专辑 {{ detail.albumCount }}</span>
          </div>
          <div class="actions">
            <el-button type="danger" round :disabled="!detail.tracks?.length" @click="playAll">
              <el-icon><VideoPlay /></el-icon>
              播放全部
            </el-button>
            <el-button round :type="followed ? 'default' : 'primary'" plain @click="toggleFollow">
              <el-icon v-if="followed"><Check /></el-icon>
              <el-icon v-else><Plus /></el-icon>
              {{ followed ? '已关注' : '关注' }}
            </el-button>
          </div>
        </div>
      </div>

      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="tab"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
          <span v-if="tab.count != null" class="badge">{{ tab.count }}</span>
        </button>
      </div>

      <!-- 歌曲 -->
      <div v-show="activeTab === 'songs'" class="song-panel">
        <h3 class="section-title">热门歌曲</h3>
        <div class="table-head">
          <span class="col-idx">#</span>
          <span class="col-title">标题</span>
          <span class="col-album">专辑</span>
          <span class="col-like">喜欢</span>
          <span class="col-dur">时长</span>
        </div>

        <div
          v-for="(row, idx) in detail.tracks"
          :key="row.id"
          class="song-row"
          :class="{ active: isCurrent(row), playing: isPlaying(row) }"
          @dblclick="playOne(idx)"
        >
          <div class="col-idx">
            <span v-if="isPlaying(row)" class="eq"><i /><i /><i /></span>
            <span v-else class="num" :class="{ top: idx < 3 }">{{ String(idx + 1).padStart(2, '0') }}</span>
          </div>

          <div class="col-title">
            <div class="thumb" :style="trackCover(row)" @click="playOne(idx)" />
            <div class="title-meta">
              <div class="name">{{ row.name }}</div>
              <div class="artists">{{ row.artists?.join(' / ') || detail.name }}</div>
            </div>
          </div>

          <div class="col-album">{{ row.album || '-' }}</div>

          <div class="col-like">
            <button class="like-btn" type="button" @click.stop="toggleLike(row)">
              <el-icon :size="16" :color="row.liked ? '#ec4141' : '#bbb'">
                <StarFilled v-if="row.liked" />
                <Star v-else />
              </el-icon>
            </button>
          </div>

          <div class="col-dur">{{ formatDuration(row.durationMs) }}</div>
        </div>

        <el-empty v-if="!detail.tracks?.length" description="暂无歌曲" />
      </div>

      <!-- 专辑 -->
      <div v-show="activeTab === 'albums'" class="album-panel">
        <div class="album-grid">
          <div v-for="alb in detail.albums" :key="alb.name" class="album-card">
            <div class="album-cover" :style="albumCover(alb)" />
            <div class="album-name" :title="alb.name">{{ alb.name }}</div>
            <div class="album-sub">{{ alb.trackCount }} 首</div>
          </div>
        </div>
        <el-empty v-if="!detail.albums?.length" description="暂无专辑" />
      </div>

      <!-- MV / 详情 / 相似 -->
      <div v-show="activeTab === 'mv'" class="placeholder">
        <el-empty description="暂无 MV" :image-size="72" />
      </div>
      <div v-show="activeTab === 'about'" class="about-panel">
        <h3>歌手介绍</h3>
        <p>{{ detail.description || '暂无介绍' }}</p>
        <div class="stats">
          <div><b>{{ detail.trackCount }}</b><span>单曲</span></div>
          <div><b>{{ detail.albumCount }}</b><span>专辑</span></div>
          <div><b>{{ formatCount(detail.playCount) }}</b><span>播放</span></div>
        </div>
      </div>
      <div v-show="activeTab === 'similar'" class="similar-panel">
        <div class="similar-grid">
          <div
            v-for="a in detail.similar"
            :key="a.name"
            class="similar-card"
            @click="goArtist(a.name)"
          >
            <div class="similar-avatar" :style="similarAvatar(a)">{{ a.name.slice(0, 1) }}</div>
            <div class="similar-name">{{ a.name }}</div>
          </div>
        </div>
        <el-empty v-if="!detail.similar?.length" description="暂无相似歌手" />
      </div>
    </template>
    <el-empty v-else-if="!loading" description="歌手不存在" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { TrackDto } from '@wy-music/shared'
import { http, mediaUrl } from '../services/http'
import { usePlayerStore } from '../stores/player'
import { useUserStore } from '../stores/user'
import { useUiStore } from '../stores/ui'
import { formatDuration } from '../services/localUpload'

type AlbumItem = {
  name: string
  coverUrl?: string | null
  trackCount: number
  playCount?: number
}

type SimilarItem = {
  name: string
  coverUrl?: string | null
  trackCount?: number
}

type ArtistDetail = {
  name: string
  alias?: string
  coverUrl?: string | null
  trackCount: number
  albumCount: number
  playCount: number
  description?: string
  tracks: TrackDto[]
  albums: AlbumItem[]
  similar: SimilarItem[]
}

type TabKey = 'songs' | 'albums' | 'mv' | 'about' | 'similar'

const route = useRoute()
const router = useRouter()
const player = usePlayerStore()
const user = useUserStore()
const ui = useUiStore()

const loading = ref(false)
const detail = ref<ArtistDetail | null>(null)
const activeTab = ref<TabKey>('songs')
const followed = ref(false)

const tabs = computed(() => [
  { key: 'songs' as const, label: '歌曲', count: detail.value?.trackCount },
  { key: 'albums' as const, label: '专辑', count: detail.value?.albumCount },
  { key: 'mv' as const, label: 'MV', count: 0 },
  { key: 'about' as const, label: '歌手详情', count: null },
  { key: 'similar' as const, label: '相似歌手', count: null },
])

const avatarSrc = computed(() => mediaUrl(detail.value?.coverUrl))
const avatarStyle = computed(() => {
  if (!avatarSrc.value) return {}
  return { backgroundImage: `url(${avatarSrc.value})` }
})

function trackCover(row: TrackDto) {
  const url = mediaUrl(row.coverUrl)
  return url
    ? { backgroundImage: `url(${url})` }
    : { backgroundImage: 'linear-gradient(135deg,#ec4141,#ff8a80)' }
}

function albumCover(alb: AlbumItem) {
  const url = mediaUrl(alb.coverUrl)
  return url
    ? { backgroundImage: `url(${url})` }
    : { backgroundImage: 'linear-gradient(135deg,#7b5cff,#3d2b8c)' }
}

function similarAvatar(a: SimilarItem) {
  const url = mediaUrl(a.coverUrl)
  if (url) return { backgroundImage: `url(${url})`, color: 'transparent' }
  return {}
}

function formatCount(n: number) {
  if (!n) return '0'
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return String(n)
}

function isCurrent(row: TrackDto) {
  return player.currentTrack?.id === row.id
}

function isPlaying(row: TrackDto) {
  return isCurrent(row) && player.playing
}

function ensureLogin() {
  if (user.accessToken) return true
  ui.openLogin('login')
  return false
}

async function load() {
  const name = decodeURIComponent(String(route.params.name || '')).trim()
  if (!name) return
  loading.value = true
  activeTab.value = 'songs'
  try {
    const { data } = await http.get(`/api/discover/artists/${encodeURIComponent(name)}`)
    detail.value = data.data
    const key = `artist_follow_${name}`
    followed.value = localStorage.getItem(key) === '1'
  } catch {
    detail.value = null
  } finally {
    loading.value = false
  }
}

function playAll() {
  if (!detail.value?.tracks?.length || !ensureLogin()) return
  player.setQueue(detail.value.tracks, 0)
}

function playOne(idx: number) {
  if (!detail.value?.tracks?.length || !ensureLogin()) return
  player.setQueue(detail.value.tracks, idx)
}

async function toggleLike(row: TrackDto) {
  if (!ensureLogin()) return
  const { data } = await http.post(`/api/likes/${row.id}`)
  row.liked = data.data.liked
}

function toggleFollow() {
  if (!detail.value) return
  if (!ensureLogin()) return
  followed.value = !followed.value
  localStorage.setItem(`artist_follow_${detail.value.name}`, followed.value ? '1' : '0')
}

function goArtist(name: string) {
  router.push(`/artist/${encodeURIComponent(name)}`)
}

onMounted(load)
watch(() => route.params.name, load)
</script>

<style scoped lang="scss">
.artist-page {
  min-height: 420px;
  padding-bottom: 24px;
}
.header {
  display: flex;
  gap: 28px;
  align-items: center;
  margin-bottom: 8px;
}
.avatar {
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff8a80, #ec4141);
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.12);
  display: grid;
  place-items: center;
  color: #fff;
}
.avatar-letter {
  font-size: 64px;
  font-weight: 700;
}
.meta {
  min-width: 0;
  h1 {
    margin: 0;
    font-size: 36px;
    font-weight: 700;
    line-height: 1.2;
  }
}
.sub {
  margin-top: 10px;
  font-size: 13px;
  color: #999;
}
.actions {
  margin-top: 22px;
  display: flex;
  gap: 12px;
}
.tabs {
  display: flex;
  align-items: center;
  gap: 28px;
  border-bottom: 1px solid #eee;
  margin-top: 20px;
}
.tab {
  border: none;
  background: transparent;
  padding: 14px 2px;
  font-size: 15px;
  color: #666;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  &.active {
    color: #ec4141;
    font-weight: 600;
    box-shadow: inset 0 -2px 0 #ec4141;
  }
}
.badge {
  font-size: 12px;
  color: #aaa;
  font-weight: 400;
}
.section-title {
  margin: 18px 0 8px;
  font-size: 16px;
  font-weight: 700;
}
.table-head,
.song-row {
  display: grid;
  grid-template-columns: 48px minmax(220px, 1.8fr) minmax(120px, 1fr) 56px 64px;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
}
.table-head {
  height: 36px;
  color: #999;
  font-size: 12px;
  border-bottom: 1px solid #f0f0f0;
}
.song-row {
  height: 64px;
  border-radius: 6px;
  &:hover {
    background: #f5f5f5;
  }
  &.active .name {
    color: #ec4141;
  }
}
.col-idx {
  display: grid;
  place-items: center;
}
.num {
  color: #bbb;
  font-size: 14px;
  font-weight: 600;
  &.top {
    color: #ec4141;
  }
}
.eq {
  display: flex;
  gap: 2px;
  align-items: flex-end;
  height: 14px;
  i {
    width: 3px;
    background: #ec4141;
    border-radius: 1px;
    animation: eq 0.8s ease-in-out infinite;
    &:nth-child(1) {
      height: 6px;
    }
    &:nth-child(2) {
      height: 12px;
      animation-delay: 0.15s;
    }
    &:nth-child(3) {
      height: 8px;
      animation-delay: 0.3s;
    }
  }
}
@keyframes eq {
  0%,
  100% {
    transform: scaleY(0.5);
  }
  50% {
    transform: scaleY(1);
  }
}
.col-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.thumb {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
  cursor: pointer;
}
.title-meta {
  min-width: 0;
}
.name {
  font-size: 14px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.artists {
  margin-top: 4px;
  font-size: 12px;
  color: #999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.col-album {
  font-size: 13px;
  color: #888;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.col-like {
  display: grid;
  place-items: center;
}
.like-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  &:hover {
    background: rgba(236, 65, 65, 0.08);
  }
}
.col-dur {
  font-size: 13px;
  color: #999;
  text-align: right;
}
.album-grid,
.similar-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 20px 16px;
  margin-top: 16px;
}
.album-card {
  min-width: 0;
}
.album-cover {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  background-size: cover;
  background-position: center;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}
.album-name {
  margin-top: 10px;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.album-sub {
  margin-top: 4px;
  font-size: 12px;
  color: #aaa;
}
.similar-card {
  text-align: center;
  cursor: pointer;
  &:hover .similar-avatar {
    transform: scale(1.04);
  }
}
.similar-avatar {
  width: min(120px, 100%);
  aspect-ratio: 1;
  margin: 0 auto;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff8a80, #ec4141);
  background-size: cover;
  background-position: center;
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 36px;
  font-weight: 700;
  transition: transform 0.15s;
}
.similar-name {
  margin-top: 10px;
  font-size: 14px;
}
.about-panel {
  padding: 20px 4px;
  h3 {
    margin: 0 0 12px;
    font-size: 16px;
  }
  p {
    margin: 0;
    color: #666;
    line-height: 1.7;
    font-size: 14px;
  }
}
.stats {
  display: flex;
  gap: 32px;
  margin-top: 24px;
  div {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  b {
    font-size: 22px;
    color: #333;
  }
  span {
    font-size: 12px;
    color: #999;
  }
}
.placeholder {
  padding: 40px 0;
}
@media (max-width: 900px) {
  .header {
    flex-direction: column;
    align-items: flex-start;
  }
  .avatar {
    width: 120px;
    height: 120px;
  }
  .album-grid,
  .similar-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .table-head,
  .song-row {
    grid-template-columns: 40px 1fr 48px 56px;
  }
  .col-album {
    display: none;
  }
}
</style>
