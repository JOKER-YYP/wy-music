<template>
  <div v-loading="loading" class="artists">
    <div class="filters">
      <div class="row">
        <span class="label">语种：</span>
        <button
          v-for="r in regions"
          :key="r"
          type="button"
          class="chip"
          :class="{ active: region === r }"
          @click="region = r"
        >
          {{ r }}
        </button>
      </div>
      <div class="row">
        <span class="label">分类：</span>
        <button
          v-for="t in types"
          :key="t"
          type="button"
          class="chip"
          :class="{ active: type === t }"
          @click="type = t"
        >
          {{ t }}
        </button>
      </div>
      <div class="letters">
        <button
          v-for="l in letters"
          :key="l"
          type="button"
          class="letter"
          :class="{ active: letter === l }"
          @click="onLetter(l)"
        >
          {{ l }}
        </button>
      </div>
    </div>

    <div class="grid">
      <div
        v-for="a in list"
        :key="a.name"
        class="card"
        @click="openArtist(a)"
      >
        <div class="avatar" :style="avatarStyle(a)">{{ a.name.slice(0, 1) }}</div>
        <div class="name">{{ a.name }}</div>
        <div class="count">单曲：{{ a.trackCount }}</div>
      </div>
    </div>
    <el-empty v-if="!list.length && !loading" description="暂无歌手数据，上传带歌手信息的歌曲后会出现" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { http, mediaUrl } from '../../services/http'

type ArtistItem = {
  name: string
  coverUrl?: string | null
  trackCount: number
  playCount: number
}

const regions = ['全部', '华语', '欧美', '日本', '韩国', '其他']
const types = ['全部', '男歌手', '女歌手', '乐队组合']
const letters = ['热门', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), '#']

const region = ref('全部')
const type = ref('全部')
const letter = ref('热门')
const loading = ref(false)
const list = ref<ArtistItem[]>([])
const router = useRouter()

function avatarStyle(a: ArtistItem) {
  const url = mediaUrl(a.coverUrl)
  if (url) return { backgroundImage: `url(${url})`, color: 'transparent' }
  return {}
}

async function load() {
  loading.value = true
  try {
    const { data } = await http.get('/api/discover/artists', {
      params: { letter: letter.value },
    })
    list.value = data.data?.list || []
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}

function onLetter(l: string) {
  letter.value = l
}

function openArtist(a: ArtistItem) {
  router.push(`/artist/${encodeURIComponent(a.name)}`)
}

onMounted(load)
watch(letter, load)
</script>

<style scoped lang="scss">
.filters {
  margin-bottom: 20px;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.label {
  font-size: 13px;
  color: #999;
  width: 48px;
}
.chip {
  border: none;
  background: #f5f5f5;
  color: #666;
  font-size: 13px;
  padding: 5px 14px;
  border-radius: 14px;
  cursor: pointer;
  &.active {
    background: #fdeeee;
    color: #ec4141;
    font-weight: 600;
  }
}
.letters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-top: 6px;
  padding-top: 10px;
  border-top: 1px solid #f0f0f0;
}
.letter {
  border: none;
  background: transparent;
  color: #666;
  font-size: 13px;
  cursor: pointer;
  padding: 2px 4px;
  &.active {
    color: #ec4141;
    font-weight: 700;
  }
}
.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 28px 20px;
}
.card {
  text-align: center;
  cursor: pointer;
  &:hover .avatar {
    transform: scale(1.04);
  }
}
.avatar {
  width: min(160px, 100%);
  aspect-ratio: 1;
  margin: 0 auto;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff8a80, #ec4141);
  background-size: cover;
  background-position: center;
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 42px;
  font-weight: 700;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  transition: transform 0.15s;
}
.name {
  margin-top: 12px;
  font-size: 15px;
  font-weight: 600;
  color: #333;
}
.count {
  margin-top: 4px;
  font-size: 12px;
  color: #aaa;
}
@media (max-width: 1000px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
