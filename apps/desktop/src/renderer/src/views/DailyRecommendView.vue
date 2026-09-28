<template>
  <div v-loading="loading" class="daily">
    <template v-if="detail">
      <div class="header">
        <div class="date-card">
          <div class="date-day">{{ detail.day }}</div>
          <div class="date-month">/ {{ detail.month }}</div>
        </div>
        <div class="meta">
          <div class="title-row">
            <h1>每日推荐</h1>
            <span class="tip-badge">个性推荐</span>
          </div>
          <p class="desc">{{ detail.description }}</p>
          <div class="sub">{{ detail.updateTip }}</div>
          <div class="actions">
            <el-button type="danger" round :disabled="!detail.tracks?.length" @click="playAll">
              <el-icon><VideoPlay /></el-icon>
              播放全部
            </el-button>
          </div>
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
        v-for="(row, idx) in detail.tracks"
        :key="row.id"
        class="song-row"
        :class="{ active: isCurrent(row) }"
        @dblclick="playOne(idx)"
      >
        <div class="col-rank">
          <span class="num">{{ String(idx + 1).padStart(2, '0') }}</span>
        </div>
        <div class="col-title">
          <div class="thumb" :style="trackCover(row)" @click="playOne(idx)" />
          <div class="title-meta">
            <div class="name">{{ row.name }}</div>
            <div class="artists">{{ row.artists?.join(' / ') || '未知歌手' }}</div>
          </div>
        </div>
        <div class="col-album">{{ row.album || '未知专辑' }}</div>
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

      <el-empty v-if="!detail.tracks?.length" description="暂无推荐，先去听几首歌吧" />
    </template>
    <el-empty v-else-if="!loading" description="加载失败，请稍后重试" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { TrackDto } from '@wy-music/shared'
import { Star, StarFilled, VideoPlay } from '@element-plus/icons-vue'
import { http, mediaUrl } from '../services/http'
import { usePlayerStore } from '../stores/player'
import { useUserStore } from '../stores/user'
import { useUiStore } from '../stores/ui'
import { formatDuration } from '../services/localUpload'

type DailyDetail = {
  date: string
  day: number
  month: number
  year: number
  updateTip: string
  description: string
  tracks: TrackDto[]
}

const player = usePlayerStore()
const user = useUserStore()
const ui = useUiStore()

const loading = ref(false)
const detail = ref<DailyDetail | null>(null)

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
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  loading.value = true
  try {
    const { data } = await http.get('/api/discover/daily')
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
  player.setQueue(detail.value.tracks, idx)
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
</script>

<style scoped lang="scss">
.daily {
  min-height: 400px;
  padding-bottom: 16px;
}
.header {
  display: flex;
  gap: 28px;
  margin-bottom: 20px;
  align-items: stretch;
}
.date-card {
  width: 200px;
  height: 200px;
  border-radius: 10px;
  flex-shrink: 0;
  background: linear-gradient(160deg, #ff6b6b 0%, #ec4141 55%, #c72c2c 100%);
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 28px rgba(236, 65, 65, 0.28);
  user-select: none;
}
.date-day {
  font-size: 72px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -2px;
}
.date-month {
  margin-top: 6px;
  font-size: 22px;
  font-weight: 600;
  opacity: 0.92;
}
.meta {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}
.title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  h1 {
    margin: 0;
    font-size: 32px;
    font-weight: 700;
  }
}
.tip-badge {
  font-size: 11px;
  color: #ec4141;
  background: rgba(236, 65, 65, 0.1);
  border: 1px solid rgba(236, 65, 65, 0.35);
  border-radius: 999px;
  padding: 2px 8px;
  line-height: 1.4;
}
.desc {
  margin: 14px 0 0;
  font-size: 13px;
  color: #888;
  line-height: 1.5;
  max-width: 520px;
}
.sub {
  margin-top: 8px;
  font-size: 12px;
  color: #aaa;
}
.actions {
  margin-top: 22px;
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
  color: #666;
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
  padding: 4px;
  display: grid;
  place-items: center;
}
.col-dur {
  font-size: 13px;
  color: #999;
  text-align: right;
}
</style>
