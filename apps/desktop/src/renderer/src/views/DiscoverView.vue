<template>
  <div class="home">
    <div class="subnav">
      <button
        v-for="t in tabs"
        :key="t"
        type="button"
        class="subnav-item"
        :class="{ active: t === activeTab }"
        @click="activeTab = t"
      >
        {{ t }}
      </button>
    </div>

    <!-- 精选 -->
    <template v-if="activeTab === '精选'">
      <section class="banners">
        <div
          v-for="(b, i) in banners"
          :key="i"
          class="banner"
          :style="{ background: b.bg }"
        >
          <div class="banner-title">{{ b.title }}</div>
          <div class="banner-sub">{{ b.sub }}</div>
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <h3>推荐歌单</h3>
          <span class="more" @click="activeTab = '歌单'">更多</span>
        </div>
        <div class="playlist-row">
          <div
            v-for="item in playlists"
            :key="item.id"
            class="playlist-card"
            @click="playTrack(item)"
          >
            <div class="cover" :style="coverStyle(item)">
              <span class="play-count">▷ {{ formatCount(item.playCount) }}</span>
              <button class="play-fab" type="button" @click.stop="playTrack(item)">
                <el-icon><VideoPlay /></el-icon>
              </button>
            </div>
            <div class="plist-name">{{ item.name }}</div>
          </div>
          <el-empty
            v-if="!playlists.length && !loading"
            description="暂无歌曲，去上传吧"
            :image-size="80"
          />
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <h3>最新音乐</h3>
        </div>
        <div class="latest-grid">
          <div
            v-for="(item, idx) in latest"
            :key="item.id"
            class="latest-item"
            @dblclick="playFromLatest(idx)"
          >
            <div class="latest-cover" :style="coverStyle(item)" />
            <div class="latest-meta">
              <div class="latest-name">{{ item.name }}</div>
              <div class="latest-artist">{{ item.artists?.join(' / ') }}</div>
            </div>
            <button class="latest-play" type="button" @click="playFromLatest(idx)">
              <el-icon><VideoPlay /></el-icon>
            </button>
          </div>
        </div>
      </section>

      <section v-if="hot.length" class="section">
        <div class="section-head">
          <h3>热门歌曲</h3>
          <span class="more" @click="activeTab = '排行榜'">排行榜</span>
        </div>
        <div class="latest-grid">
          <div
            v-for="(item, idx) in hot"
            :key="item.id"
            class="latest-item"
            @dblclick="playFromHot(idx)"
          >
            <div class="latest-cover" :style="coverStyle(item)" />
            <div class="latest-meta">
              <div class="latest-name">{{ item.name }}</div>
              <div class="latest-artist">{{ item.artists?.join(' / ') }}</div>
            </div>
            <button class="latest-play" type="button" @click="playFromHot(idx)">
              <el-icon><VideoPlay /></el-icon>
            </button>
          </div>
        </div>
      </section>
    </template>

    <PlaylistPlazaPanel v-else-if="activeTab === '歌单'" :hot-tracks="hot" />
    <ChartsPanel v-else-if="activeTab === '排行榜'" />
    <ArtistsPanel v-else-if="activeTab === '歌手'" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { TrackDto } from '@wy-music/shared'
import { http, mediaUrl } from '../services/http'
import { usePlayerStore } from '../stores/player'
import { useUiStore } from '../stores/ui'
import { useUserStore } from '../stores/user'
import PlaylistPlazaPanel from '../components/discover/PlaylistPlazaPanel.vue'
import ChartsPanel from '../components/discover/ChartsPanel.vue'
import ArtistsPanel from '../components/discover/ArtistsPanel.vue'

const tabs = ['精选', '歌单', '排行榜', '歌手']
const activeTab = ref('精选')
const loading = ref(false)
const latest = ref<TrackDto[]>([])
const hot = ref<TrackDto[]>([])
const player = usePlayerStore()
const user = useUserStore()
const ui = useUiStore()

const banners = [
  { title: '今日推荐', sub: '根据你的口味生成', bg: 'linear-gradient(135deg,#ff6b6b,#ee5a24)' },
  { title: '新歌速递', sub: '发现刚上传的好声音', bg: 'linear-gradient(135deg,#54a0ff,#2e86de)' },
  { title: '热门精选', sub: '大家正在听', bg: 'linear-gradient(135deg,#5f27cd,#341f97)' },
]

const playlists = computed(() => latest.value.slice(0, 6))

function coverStyle(item: TrackDto) {
  const url = mediaUrl(item.coverUrl)
  if (url) return { backgroundImage: `url(${url})` }
  const hues = [0, 30, 200, 260, 320, 140]
  const h = hues[(item.name?.length || 0) % hues.length]
  return { backgroundImage: `linear-gradient(135deg, hsl(${h} 70% 55%), hsl(${h + 40} 65% 40%))` }
}

function formatCount(n: number) {
  if (!n) return '0'
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return String(n)
}

function ensureLogin() {
  if (user.accessToken) return true
  ui.openLogin('login')
  return false
}

function playTrack(item: TrackDto) {
  if (!ensureLogin()) return
  player.playTrack(item, latest.value.length ? latest.value : [item])
}

function playFromLatest(idx: number) {
  if (!ensureLogin()) return
  player.setQueue(latest.value, idx)
}

function playFromHot(idx: number) {
  if (!ensureLogin()) return
  player.setQueue(hot.value, idx)
}

onMounted(async () => {
  loading.value = true
  try {
    const { data } = await http.get('/api/discover')
    latest.value = data.data.latest || []
    hot.value = data.data.hot || []
  } catch {
    latest.value = []
    hot.value = []
  } finally {
    loading.value = false
  }
})
</script>

<style scoped lang="scss">
.home {
  max-width: 1100px;
}
.subnav {
  display: flex;
  gap: 22px;
  margin-bottom: 18px;
  border-bottom: 1px solid #f0f0f0;
}
.subnav-item {
  border: none;
  background: none;
  padding: 10px 2px 12px;
  font-size: 15px;
  color: #666;
  cursor: pointer;
  position: relative;
  &.active {
    color: #333;
    font-weight: 700;
    font-size: 17px;
    &::after {
      content: '';
      position: absolute;
      left: 50%;
      bottom: 0;
      width: 22px;
      height: 3px;
      border-radius: 2px;
      background: #ec4141;
      transform: translateX(-50%);
    }
  }
}
.banners {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 28px;
}
.banner {
  height: 140px;
  border-radius: 10px;
  padding: 22px 20px;
  color: #fff;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
}
.banner-title {
  font-size: 22px;
  font-weight: 700;
}
.banner-sub {
  margin-top: 6px;
  font-size: 13px;
  opacity: 0.9;
}
.section {
  margin-bottom: 28px;
}
.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 14px;
  h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
  }
  .more {
    font-size: 13px;
    color: #999;
    cursor: pointer;
    &:hover {
      color: #ec4141;
    }
  }
}
.playlist-row {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 14px;
}
.playlist-card {
  cursor: pointer;
  min-width: 0;
}
.cover {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  background-size: cover;
  background-position: center;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.play-count {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 12px;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
}
.play-fab {
  position: absolute;
  right: 8px;
  bottom: 8px;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: rgba(236, 65, 65, 0.92);
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}
.playlist-card:hover .play-fab {
  opacity: 1;
}
.plist-name {
  margin-top: 8px;
  font-size: 13px;
  color: #333;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.latest-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px 28px;
}
.latest-item {
  display: grid;
  grid-template-columns: 56px 1fr 32px;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  &:hover {
    background: #f7f7f7;
    .latest-play {
      opacity: 1;
    }
  }
}
.latest-cover {
  width: 56px;
  height: 56px;
  border-radius: 6px;
  background-size: cover;
  background-position: center;
}
.latest-name {
  font-size: 14px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.latest-artist {
  margin-top: 4px;
  font-size: 12px;
  color: #999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.latest-play {
  border: none;
  background: transparent;
  color: #ec4141;
  cursor: pointer;
  opacity: 0;
  display: grid;
  place-items: center;
}
@media (max-width: 1100px) {
  .playlist-row {
    grid-template-columns: repeat(4, 1fr);
  }
  .banners {
    grid-template-columns: 1fr;
  }
  .latest-grid {
    grid-template-columns: 1fr;
  }
}
</style>
