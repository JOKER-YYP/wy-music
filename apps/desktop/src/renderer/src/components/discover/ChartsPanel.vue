<template>
  <div v-loading="loading" class="charts">
    <section class="block">
      <h3>榜单推荐</h3>
      <div class="reco-row">
        <div
          v-for="c in recommend"
          :key="c.id"
          class="reco-card"
          :style="recoStyle(c)"
          @click="goDetail(c.id)"
        >
          <div class="reco-name">{{ c.name }}</div>
          <div class="reco-tip">查看榜单</div>
        </div>
      </div>
    </section>

    <section class="block">
      <h3>官方榜</h3>
      <div class="official-grid">
        <div v-for="chart in official" :key="chart.id" class="official-card">
          <div class="official-head" @click="goDetail(chart.id)">
            <div class="official-cover" :style="chartCover(chart)" />
            <div class="official-meta">
              <div class="official-name">{{ chart.name }}</div>
              <div class="official-tip">{{ chart.updateTip }} · {{ chart.tracks?.length || 0 }} 首</div>
              <el-button type="danger" round size="small" @click.stop="playList(chart.tracks)">
                播放
              </el-button>
            </div>
          </div>
          <ol class="top3">
            <li
              v-for="(t, i) in (chart.tracks || []).slice(0, 3)"
              :key="t.id"
              @click="playAt(chart.tracks, i)"
            >
              <span class="rank" :class="{ top: i < 3 }">{{ i + 1 }}</span>
              <span class="song">{{ t.name }}</span>
              <span class="artist">{{ t.artists?.join(' / ') }}</span>
            </li>
            <li v-if="!(chart.tracks || []).length" class="empty-li">暂无歌曲</li>
          </ol>
          <button class="more-btn" type="button" @click="goDetail(chart.id)">查看完整榜单</button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { TrackDto } from '@wy-music/shared'
import { http, mediaUrl } from '../../services/http'
import { usePlayerStore } from '../../stores/player'
import { useUserStore } from '../../stores/user'
import { useUiStore } from '../../stores/ui'

type ChartItem = {
  id: string
  name: string
  updateTip?: string
  coverUrl?: string | null
  color?: string
  tracks: TrackDto[]
}

const loading = ref(false)
const official = ref<ChartItem[]>([])
const recommend = ref<ChartItem[]>([])
const router = useRouter()
const player = usePlayerStore()
const user = useUserStore()
const ui = useUiStore()

function coverStyle(url?: string | null) {
  const u = mediaUrl(url)
  if (u) return { backgroundImage: `url(${u})` }
  return { backgroundImage: 'linear-gradient(135deg,#ec4141,#ff8a80)' }
}

function chartCover(chart: ChartItem) {
  const firstWithCover = (chart.tracks || []).find((t) => t.coverUrl)?.coverUrl
  return coverStyle(firstWithCover || chart.coverUrl)
}

function recoStyle(c: ChartItem) {
  const firstWithCover = (c.tracks || []).find((t) => t.coverUrl)?.coverUrl
  const u = mediaUrl(firstWithCover || c.coverUrl)
  if (u) {
    return {
      backgroundImage: `linear-gradient(120deg, rgba(0,0,0,0.35), rgba(0,0,0,0.15)), url(${u})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  return { background: c.color || 'linear-gradient(135deg,#ec4141,#ff8a80)' }
}

function goDetail(id: string) {
  router.push(`/chart/${id}`)
}

function ensureLogin() {
  if (user.accessToken) return true
  ui.openLogin('login')
  return false
}

function playList(tracks?: TrackDto[]) {
  if (!tracks?.length || !ensureLogin()) return
  player.setQueue(tracks, 0)
}

function playAt(tracks: TrackDto[], idx: number) {
  if (!ensureLogin()) return
  player.setQueue(tracks, idx)
}

onMounted(async () => {
  loading.value = true
  try {
    const { data } = await http.get('/api/discover/charts')
    official.value = data.data?.official || []
    recommend.value = data.data?.recommend || []
  } catch {
    official.value = []
    recommend.value = []
  } finally {
    loading.value = false
  }
})
</script>

<style scoped lang="scss">
.block {
  margin-bottom: 28px;
  h3 {
    margin: 0 0 14px;
    font-size: 20px;
    font-weight: 700;
  }
}
.reco-row {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
}
.reco-card {
  height: 88px;
  border-radius: 10px;
  padding: 14px 12px;
  color: #fff;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
  transition: transform 0.15s;
  &:hover {
    transform: translateY(-2px);
  }
}
.reco-name {
  font-size: 15px;
  font-weight: 700;
}
.reco-tip {
  margin-top: 4px;
  font-size: 11px;
  opacity: 0.85;
}
.official-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}
.official-card {
  background: #fafafa;
  border-radius: 12px;
  padding: 14px;
  border: 1px solid #f0f0f0;
}
.official-head {
  display: flex;
  gap: 14px;
  cursor: pointer;
  margin-bottom: 12px;
}
.official-cover {
  width: 88px;
  height: 88px;
  border-radius: 8px;
  background-size: cover;
  background-position: center;
  background-color: #f0f0f0;
  flex-shrink: 0;
}
.official-meta {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}
.official-name {
  font-size: 16px;
  font-weight: 700;
}
.official-tip {
  font-size: 12px;
  color: #999;
}
.top3,
.full-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.top3 li,
.full-list li {
  display: grid;
  grid-template-columns: 28px 1fr 100px;
  gap: 8px;
  align-items: center;
  height: 36px;
  font-size: 13px;
  cursor: pointer;
  border-radius: 6px;
  padding: 0 4px;
  &:hover {
    background: #f0f0f0;
  }
}
.rank {
  color: #bbb;
  font-weight: 600;
  &.top {
    color: #ec4141;
  }
}
.song {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #333;
}
.artist {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #999;
  font-size: 12px;
  text-align: right;
}
.empty-li {
  color: #ccc;
  cursor: default !important;
}
.more-btn {
  margin-top: 8px;
  border: none;
  background: transparent;
  color: #999;
  font-size: 12px;
  cursor: pointer;
  &:hover {
    color: #ec4141;
  }
}
@media (max-width: 1000px) {
  .reco-row {
    grid-template-columns: repeat(3, 1fr);
  }
  .official-grid {
    grid-template-columns: 1fr;
  }
}
</style>
