<template>
  <div v-loading="loading" class="profile-page">
    <header class="profile-head">
      <div class="avatar" :style="avatarStyle">{{ avatarLetter }}</div>
      <div class="info">
        <div class="name-row">
          <h1>{{ user.user?.nickname || '未登录' }}</h1>
          <button class="edit-btn" type="button" title="修改昵称" @click="onEditNickname">
            <el-icon :size="16"><Edit /></el-icon>
          </button>
          <span class="lv">LV.{{ level }}</span>
        </div>
        <div class="stats">
          <span>关注 <b>{{ following }}</b></span>
          <span>粉丝 <b>{{ followers }}</b></span>
        </div>
        <div v-if="user.user?.bio" class="bio">{{ user.user.bio }}</div>
        <div class="account">账号：{{ user.user?.account }}</div>
      </div>
    </header>

    <div class="main-tabs">
      <button
        v-for="t in mainTabs"
        :key="t.key"
        type="button"
        class="main-tab"
        :class="{ active: mainTab === t.key }"
        @click="mainTab = t.key"
      >
        {{ t.label }}
      </button>
    </div>

    <template v-if="mainTab === 'music'">
      <div class="sub-tabs">
        <button
          v-for="t in subTabs"
          :key="t.key"
          type="button"
          class="sub-tab"
          :class="{ active: subTab === t.key }"
          @click="subTab = t.key"
        >
          {{ t.label }}
        </button>
      </div>

      <div class="plist-grid">
        <!-- 听歌排行：仅近期展示 -->
        <div
          v-if="subTab === 'recent'"
          class="plist-card rank-card"
          @click="router.push('/recent')"
        >
          <div class="cover rank-cover">
            <div class="bars">
              <i /><i /><i /><i /><i />
            </div>
            <span class="play-badge">
              <el-icon :size="12"><Headset /></el-icon>
              {{ historyCount }}
            </span>
          </div>
          <div class="plist-name">我的听歌排行</div>
          <div class="plist-sub">累计听歌 {{ historyCount }} 首</div>
        </div>

        <div
          v-for="p in displayPlaylists"
          :key="p.id"
          class="plist-card"
          @click="router.push(`/playlist/${p.id}`)"
        >
          <div class="cover" :style="coverStyle(p)">
            <div v-if="p.isSystem" class="liked-mask">
              <el-icon :size="48" color="#fff"><StarFilled /></el-icon>
            </div>
            <span class="play-badge">
              <el-icon :size="12"><Headset /></el-icon>
              {{ p.trackCount || 0 }}
            </span>
          </div>
          <div class="plist-name" :title="p.name">{{ p.name }}</div>
          <div class="plist-sub">{{ p.trackCount || 0 }} 首</div>
        </div>

        <el-empty
          v-if="!displayPlaylists.length && subTab !== 'recent'"
          class="empty"
          :description="emptyTip"
          :image-size="72"
        />
      </div>
    </template>

    <div v-else class="placeholder">
      <el-empty :description="mainTab === 'note' ? '笔记功能暂未开放' : '播客功能暂未开放'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { PlaylistDto } from '@wy-music/shared'
import { useUserStore } from '../stores/user'
import { usePlaylistStore } from '../stores/playlist'
import { http, mediaUrl } from '../services/http'

const router = useRouter()
const user = useUserStore()
const playlistStore = usePlaylistStore()

const loading = ref(false)
const historyCount = ref(0)
const following = ref(0)
const followers = ref(0)

const mainTabs = [
  { key: 'music', label: '音乐' },
  { key: 'note', label: '笔记' },
  { key: 'podcast', label: '播客' },
] as const
const subTabs = [
  { key: 'recent', label: '近期' },
  { key: 'created', label: '创建' },
  { key: 'collect', label: '收藏' },
] as const

type MainTab = (typeof mainTabs)[number]['key']
type SubTab = (typeof subTabs)[number]['key']

const mainTab = ref<MainTab>('music')
const subTab = ref<SubTab>('recent')

const avatarLetter = computed(() => (user.user?.nickname || '用').slice(0, 1))
const avatarStyle = computed(() => {
  const url = mediaUrl(user.user?.avatarUrl)
  if (url) return { backgroundImage: `url(${url})`, color: 'transparent' }
  return {}
})

const level = computed(() => {
  const n = historyCount.value
  if (n >= 2000) return 8
  if (n >= 1000) return 6
  if (n >= 500) return 4
  if (n >= 100) return 2
  return 1
})

const likedPlaylist = computed(() => playlistStore.systemPlaylists[0] || null)

const displayPlaylists = computed(() => {
  if (subTab.value === 'created') return playlistStore.createdPlaylists
  if (subTab.value === 'collect') {
    return likedPlaylist.value ? [likedPlaylist.value] : []
  }
  // 近期：喜欢的音乐 + 创建的歌单
  const list: PlaylistDto[] = []
  if (likedPlaylist.value) list.push(likedPlaylist.value)
  list.push(...playlistStore.createdPlaylists)
  return list
})

const emptyTip = computed(() => {
  if (subTab.value === 'created') return '还没有创建歌单，去左侧点 + 新建吧'
  if (subTab.value === 'collect') return '暂无收藏歌单'
  return '暂无内容'
})

function coverStyle(p: PlaylistDto) {
  const url = mediaUrl(p.coverUrl)
  if (url) return { backgroundImage: `url(${url})` }
  if (p.isSystem) return { backgroundImage: 'linear-gradient(145deg,#2a2a2a,#111)' }
  return { backgroundImage: 'linear-gradient(135deg,#ff8a80,#ec4141)' }
}

async function load() {
  if (!user.accessToken) return
  loading.value = true
  try {
    await Promise.all([user.fetchMe(), playlistStore.fetchMine()])
    const { data } = await http.get('/api/history')
    historyCount.value = (data.data || []).length
  } finally {
    loading.value = false
  }
}

async function onEditNickname() {
  if (!user.user) return
  try {
    const { value } = await ElMessageBox.prompt('修改昵称', '编辑资料', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: user.user.nickname,
      inputPattern: /\S+/,
      inputErrorMessage: '昵称不能为空',
    })
    const { data } = await http.put('/api/auth/me', { nickname: value.trim() })
    user.user = data.data
    localStorage.setItem('user', JSON.stringify(data.data))
    ElMessage.success('已更新')
  } catch {
    // cancel
  }
}

onMounted(load)
</script>

<style scoped lang="scss">
.profile-page {
  min-height: 420px;
  padding-bottom: 20px;
}
.profile-head {
  display: flex;
  gap: 28px;
  align-items: center;
  margin-bottom: 8px;
}
.avatar {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff8a80, #ec4141);
  background-size: cover;
  background-position: center;
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 48px;
  font-weight: 700;
  flex-shrink: 0;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.12);
}
.info {
  min-width: 0;
}
.name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    color: #222;
  }
}
.edit-btn {
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  &:hover {
    background: #f2f2f2;
    color: #666;
  }
}
.lv {
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(90deg, #ff9a44, #ec4141);
  border-radius: 10px;
  padding: 2px 8px;
  line-height: 1.4;
}
.stats {
  margin-top: 12px;
  display: flex;
  gap: 20px;
  font-size: 13px;
  color: #888;
  b {
    color: #333;
    font-weight: 600;
    margin-left: 4px;
  }
}
.bio {
  margin-top: 8px;
  font-size: 13px;
  color: #666;
}
.account {
  margin-top: 8px;
  font-size: 12px;
  color: #aaa;
}
.main-tabs {
  display: flex;
  gap: 28px;
  border-bottom: 1px solid #eee;
  margin-top: 24px;
}
.main-tab {
  border: none;
  background: transparent;
  padding: 12px 2px 14px;
  font-size: 16px;
  color: #666;
  cursor: pointer;
  position: relative;
  &.active {
    color: #ec4141;
    font-weight: 700;
    &::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 3px;
      background: #ec4141;
      border-radius: 2px;
    }
  }
}
.sub-tabs {
  display: flex;
  gap: 22px;
  margin: 16px 0 18px;
}
.sub-tab {
  border: none;
  background: transparent;
  font-size: 13px;
  color: #999;
  cursor: pointer;
  padding: 0;
  &.active {
    color: #333;
    font-weight: 600;
  }
}
.plist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 22px 18px;
}
.plist-card {
  cursor: pointer;
  min-width: 0;
  &:hover .cover {
    transform: scale(1.02);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.14);
  }
}
.cover {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  background-size: cover;
  background-position: center;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}
.liked-mask {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.35);
}
.rank-cover {
  background: linear-gradient(145deg, #ff8fb8 0%, #7ec8ff 100%);
  display: grid;
  place-items: center;
}
.bars {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 54px;
  i {
    width: 10px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.92);
    &:nth-child(1) {
      height: 28%;
    }
    &:nth-child(2) {
      height: 58%;
    }
    &:nth-child(3) {
      height: 88%;
    }
    &:nth-child(4) {
      height: 48%;
    }
    &:nth-child(5) {
      height: 68%;
    }
  }
}
.play-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
}
.plist-name {
  margin-top: 10px;
  font-size: 13px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.35;
}
.plist-sub {
  margin-top: 4px;
  font-size: 12px;
  color: #aaa;
}
.empty {
  grid-column: 1 / -1;
}
.placeholder {
  padding: 60px 0;
}
@media (max-width: 900px) {
  .profile-head {
    flex-direction: column;
    align-items: flex-start;
  }
  .avatar {
    width: 96px;
    height: 96px;
    font-size: 36px;
  }
}
</style>
