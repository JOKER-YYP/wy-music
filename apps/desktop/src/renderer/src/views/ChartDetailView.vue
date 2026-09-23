<template>
  <div v-loading="loading" class="chart-detail">
    <template v-if="detail">
      <div class="header">
        <div class="cover" :style="coverStyle" />
        <div class="meta">
          <h1>{{ detail.name }}</h1>
          <p class="desc">{{ detail.description }}</p>
          <div class="sub">
            <span>网易云音乐</span>
            <span class="dot">·</span>
            <span>更新于 {{ detail.updatedAt || detail.updateTip }}</span>
          </div>
          <div class="actions">
            <el-button type="danger" round :disabled="!detail.tracks?.length" @click="playAll">
              <el-icon><VideoPlay /></el-icon>
              播放全部
            </el-button>
          </div>
        </div>
      </div>

      <div class="tabs">
        <button type="button" class="tab active">歌曲 {{ detail.tracks?.length || 0 }}</button>
        <button type="button" class="tab" disabled>评论</button>
        <button type="button" class="tab" disabled>收藏者</button>
        <div class="search">
          <el-icon><Search /></el-icon>
          <input v-model="keyword" placeholder="搜索" />
        </div>
      </div>

      <div class="table-head">
        <span class="col-rank">#</span>
        <span class="col-title">标题</span>
        <span class="col-album">专辑</span>
        <span class="col-like">喜欢</span>
        <span class="col-dur">时长</span>
      </div>

      <div
        v-for="(row, idx) in filtered"
        :key="row.id"
        class="song-row"
        :class="{ active: isCurrent(row) }"
        @dblclick="playOne(idx)"
      >
        <div class="col-rank">
          <span class="num" :class="{ top: idx < 3 }">{{ String(idx + 1).padStart(2, '0') }}</span>
        </div>
        <div class="col-title">
          <div class="thumb" :style="trackCover(row)" @click="playOne(idx)" />
          <div class="title-meta">
            <div class="name">{{ row.name }}</div>
            <div class="artists">{{ row.artists?.join(' / ') || '未知歌手' }}</div>
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

      <el-empty v-if="!filtered.length" description="榜单暂无歌曲" />
    </template>
    <el-empty v-else-if="!loading" description="榜单不存在" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { TrackDto } from '@wy-music/shared'
import { http, mediaUrl } from '../services/http'
import { usePlayerStore } from '../stores/player'
import { useUserStore } from '../stores/user'
import { useUiStore } from '../stores/ui'
import { formatDuration } from '../services/localUpload'

type ChartTrack = TrackDto & { rank?: number }
type ChartDetail = {
  id: string
  name: string
  description?: string
  updateTip?: string
  updatedAt?: string
  coverUrl?: string | null
  tracks: ChartTrack[]
}

const route = useRoute()
const player = usePlayerStore()
const user = useUserStore()
const ui = useUiStore()

const loading = ref(false)
const detail = ref<ChartDetail | null>(null)
const keyword = ref('')

const coverStyle = computed(() => {
  // 优先第一首歌封面
  const first = detail.value?.tracks?.[0]?.coverUrl || detail.value?.coverUrl
  const url = mediaUrl(first)
  if (url) return { backgroundImage: `url(${url})` }
  return { backgroundImage: 'linear-gradient(135deg,#7b5cff,#3d2b8c)' }
})

const filtered = computed(() => {
  const list = detail.value?.tracks || []
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return list
  return list.filter(
    (t) =>
      t.name.toLowerCase().includes(kw) ||
      (t.artists || []).some((a) => a.toLowerCase().includes(kw)) ||
      (t.album || '').toLowerCase().includes(kw),
  )
})

function trackCover(row: TrackDto) {
  const url = mediaUrl(row.coverUrl)
  return url
    ? { backgroundImage: `url(${url})` }
    : { backgroundImage: 'linear-gradient(135deg,#ec4141,#ff8a80)' }
}

function isCurrent(row: TrackDto) {
  return player.currentTrack?.id === row.id
}

async function load() {
  const id = String(route.params.id || '')
  if (!id) return
  loading.value = true
  try {
    const { data } = await http.get(`/api/discover/charts/${id}`)
    detail.value = data.data
  } catch {
    detail.value = null
  } finally {
    loading.value = false
  }
}

function playAll() {
  if (!detail.value?.tracks?.length) return
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  player.setQueue(detail.value.tracks, 0)
}

function playOne(idx: number) {
  if (!detail.value?.tracks?.length) return
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  // filtered index vs full list
  const track = filtered.value[idx]
  if (!track) return
  const fullIdx = detail.value.tracks.findIndex((t) => t.id === track.id)
  player.setQueue(detail.value.tracks, fullIdx >= 0 ? fullIdx : 0)
}

async function toggleLike(row: TrackDto) {
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  const { data } = await http.post(`/api/likes/${row.id}`)
  row.liked = data.data.liked
}

onMounted(load)
watch(() => route.params.id, load)
</script>

<style scoped lang="scss">
.chart-detail {
  min-height: 400px;
  padding-bottom: 16px;
}
.header {
  display: flex;
  gap: 28px;
  margin-bottom: 8px;
}
.cover {
  width: 200px;
  height: 200px;
  border-radius: 8px;
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.12);
}
.meta {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  h1 {
    margin: 0;
    font-size: 32px;
    font-weight: 700;
  }
}
.desc {
  margin: 12px 0 0;
  font-size: 13px;
  color: #888;
  line-height: 1.5;
  max-width: 480px;
}
.sub {
  margin-top: 10px;
  font-size: 12px;
  color: #aaa;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dot {
  opacity: 0.6;
}
.actions {
  margin-top: 20px;
}
.tabs {
  display: flex;
  align-items: center;
  gap: 24px;
  border-bottom: 1px solid #eee;
  margin-top: 18px;
  position: relative;
}
.tab {
  border: none;
  background: transparent;
  padding: 12px 2px 14px;
  font-size: 14px;
  color: #666;
  cursor: pointer;
  &.active {
    color: #ec4141;
    font-weight: 600;
    box-shadow: inset 0 -2px 0 #ec4141;
  }
  &:disabled {
    cursor: default;
    opacity: 0.45;
  }
}
.search {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border-radius: 15px;
  background: #f5f5f5;
  color: #999;
  input {
    border: none;
    outline: none;
    background: transparent;
    width: 100px;
    font-size: 12px;
  }
}
.table-head,
.song-row {
  display: grid;
  grid-template-columns: 56px minmax(220px, 1.8fr) minmax(120px, 1fr) 56px 64px;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
}
.table-head {
  height: 40px;
  color: #999;
  font-size: 12px;
  border-bottom: 1px solid #f0f0f0;
  margin-top: 4px;
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
.col-rank {
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
@media (max-width: 900px) {
  .header {
    flex-direction: column;
  }
  .table-head,
  .song-row {
    grid-template-columns: 48px 1fr 48px 56px;
  }
  .col-album {
    display: none;
  }
}
</style>
