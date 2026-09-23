<template>
  <div v-loading="loading" class="plaza">
    <div class="cats">
      <button
        v-for="c in cats"
        :key="c"
        type="button"
        class="cat"
        :class="{ active: cat === c }"
        @click="cat = c"
      >
        {{ c }}
      </button>
    </div>

    <section class="block">
      <h3>精选歌单</h3>
      <div class="grid">
        <div
          v-for="p in filtered"
          :key="p.id"
          class="card"
          @click="openPlaylist(p)"
        >
          <div class="cover" :style="coverStyle(p)">
            <span class="badge">
              <el-icon :size="12"><Headset /></el-icon>
              {{ formatCount(p.trackCount || p.playCount || 0) }}
            </span>
          </div>
          <div class="title">{{ p.name }}</div>
          <div class="sub">{{ p.trackCount || 0 }} 首 · {{ p.ownerNickname || '用户' }}</div>
        </div>
      </div>
      <el-empty v-if="!filtered.length && !loading" description="暂无公开歌单，去创建并设为公开吧" />
    </section>

    <section v-if="hotTracks.length" class="block">
      <h3>每日新鲜推荐</h3>
      <div class="grid">
        <div
          v-for="t in hotTracks"
          :key="t.id"
          class="card"
          @click="playTrack(t)"
        >
          <div class="cover" :style="trackCover(t)">
            <span class="badge">
              <el-icon :size="12"><Headset /></el-icon>
              {{ formatCount(t.playCount) }}
            </span>
          </div>
          <div class="title">{{ t.name }}</div>
          <div class="sub">{{ t.artists?.join(' / ') }}</div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { TrackDto } from '@wy-music/shared'
import { http, mediaUrl } from '../../services/http'
import { usePlayerStore } from '../../stores/player'
import { useUserStore } from '../../stores/user'
import { useUiStore } from '../../stores/ui'

export type PlazaPlaylist = {
  id: string
  name: string
  coverUrl?: string | null
  trackCount?: number
  playCount?: number
  ownerNickname?: string
}

const props = defineProps<{ hotTracks?: TrackDto[] }>()
const router = useRouter()
const player = usePlayerStore()
const user = useUserStore()
const ui = useUiStore()

const cats = ['推荐', '华语', '流行', '摇滚', '民谣', '电子', '轻音乐']
const cat = ref('推荐')
const loading = ref(false)
const list = ref<PlazaPlaylist[]>([])

const filtered = computed(() => list.value)

const hotTracks = computed(() => (props.hotTracks || []).slice(0, 10))

function coverStyle(p: PlazaPlaylist) {
  const url = mediaUrl(p.coverUrl)
  if (url) return { backgroundImage: `url(${url})` }
  return { backgroundImage: 'linear-gradient(135deg,#ff8a80,#ec4141)' }
}
function trackCover(t: TrackDto) {
  const url = mediaUrl(t.coverUrl)
  if (url) return { backgroundImage: `url(${url})` }
  return { backgroundImage: 'linear-gradient(135deg,#54a0ff,#5f27cd)' }
}
function formatCount(n: number) {
  if (!n) return '0'
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return String(n)
}

function openPlaylist(p: PlazaPlaylist) {
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  router.push(`/playlist/${p.id}`)
}

function playTrack(t: TrackDto) {
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  player.playTrack(t, hotTracks.value)
}

onMounted(async () => {
  loading.value = true
  try {
    const { data } = await http.get('/api/discover/playlists')
    list.value = data.data?.list || []
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
})
</script>

<style scoped lang="scss">
.cats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 22px;
}
.cat {
  border: none;
  background: #f5f5f5;
  color: #666;
  font-size: 13px;
  padding: 6px 14px;
  border-radius: 16px;
  cursor: pointer;
  &.active {
    background: #fdeeee;
    color: #ec4141;
    font-weight: 600;
  }
}
.block {
  margin-bottom: 28px;
  h3 {
    margin: 0 0 14px;
    font-size: 20px;
    font-weight: 700;
  }
}
.grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 18px 14px;
}
.card {
  cursor: pointer;
  min-width: 0;
  &:hover .cover {
    transform: scale(1.02);
  }
}
.cover {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  background-size: cover;
  background-position: center;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
  transition: transform 0.15s;
}
.badge {
  position: absolute;
  top: 8px;
  left: 8px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
.title {
  margin-top: 8px;
  font-size: 13px;
  color: #333;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.sub {
  margin-top: 4px;
  font-size: 12px;
  color: #aaa;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 1000px) {
  .grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
