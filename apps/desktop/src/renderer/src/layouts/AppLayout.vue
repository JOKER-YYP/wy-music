<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <img class="brand-logo" :src="logoUrl" alt="WY Music" />
        <span class="brand-name">WY Music</span>
      </div>

      <nav class="nav">
        <div class="nav-group">
          <router-link
            v-for="item in primaryNav"
            :key="item.to"
            :to="item.to"
            class="nav-item"
            :class="{ active: isActive(item.to) }"
            @click="onNavClick(item, $event)"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </router-link>
        </div>

        <div class="nav-title">我的音乐</div>
        <div class="nav-group">
          <router-link
            v-for="item in myNav"
            :key="item.to"
            :to="item.to"
            class="nav-item"
            :class="{ active: isActive(item.to) }"
            @click="onNavClick(item, $event)"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </router-link>
        </div>

        <div class="nav-title playlist-head">
          <span>创建的歌单 {{ playlistStore.createdPlaylists.length || '' }}</span>
          <button class="add-btn" type="button" title="新建歌单" @click="onCreatePlaylist">
            <el-icon :size="14"><Plus /></el-icon>
          </button>
        </div>
        <div class="nav-group">
          <router-link
            v-for="p in playlistStore.createdPlaylists"
            :key="p.id"
            :to="`/playlist/${p.id}`"
            class="nav-item playlist-item"
            :class="{ active: isActive(`/playlist/${p.id}`) }"
            @click="onNavClick({ to: `/playlist/${p.id}`, auth: true }, $event)"
          >
            <img
              v-if="plistCoverSrc(p)"
              class="plist-cover"
              :src="plistCoverSrc(p)"
              alt=""
            />
            <span v-else class="plist-cover plist-cover--empty" />
            <span class="plist-name">{{ p.name }}</span>
          </router-link>
          <div v-if="user.accessToken && !playlistStore.createdPlaylists.length" class="empty-tip">
            点击 + 创建歌单
          </div>
        </div>

        <div class="nav-group" style="margin-top: 8px">
          <router-link
            to="/mine"
            class="nav-item"
            :class="{ active: isActive('/mine') }"
            @click="onNavClick({ to: '/mine', auth: true }, $event)"
          >
            <el-icon><FolderOpened /></el-icon>
            <span>我的上传</span>
          </router-link>
        </div>
      </nav>
    </aside>

    <main class="main">
      <header class="topbar">
        <div class="search-wrap">
          <el-icon class="search-icon"><Search /></el-icon>
          <input
            v-model="keyword"
            class="search-input"
            placeholder="搜索歌曲 / 歌手 / 专辑"
            @keyup.enter="goSearch"
          />
        </div>
        <div class="top-actions">
          <button class="user-chip" type="button" @click="onUserClick">
            <span class="avatar">{{ avatarText }}</span>
            <span class="uname">{{ user.user?.nickname || '未登录' }}</span>
          </button>
          <button class="icon-btn" type="button" title="设置" @click="goSettings">
            <el-icon><Setting /></el-icon>
          </button>
          <button v-if="user.accessToken" class="text-btn" type="button" @click="onLogout">
            退出
          </button>
        </div>
      </header>
      <div class="content">
        <router-view />
      </div>
    </main>

    <PlayerBar />
    <PlayerIpcBridge />
    <LoginModal />
    <NowPlayingPanel />
    <CollectPlaylistModal />
    <CommentsPanel />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Clock,
  FolderOpened,
  Headset,
  Plus,
  Search,
  Setting,
  Star,
  Upload,
} from '@element-plus/icons-vue'
import type { PlaylistDto } from '@wy-music/shared'
import { useUserStore } from '../stores/user'
import { useUiStore } from '../stores/ui'
import { usePlaylistStore } from '../stores/playlist'
import { mediaUrl } from '../services/http'
import PlayerBar from '../components/PlayerBar.vue'
import PlayerIpcBridge from '../components/PlayerIpcBridge.vue'
import LoginModal from '../components/LoginModal.vue'
import NowPlayingPanel from '../components/NowPlayingPanel.vue'
import CollectPlaylistModal from '../components/CollectPlaylistModal.vue'
import CommentsPanel from '../components/CommentsPanel.vue'
import logoUrl from '../assets/logo.png'

const route = useRoute()
const router = useRouter()
const user = useUserStore()
const ui = useUiStore()
const playlistStore = usePlaylistStore()
const keyword = ref('')

const primaryNav = [
  { to: '/discover', label: '精选', icon: Headset, auth: false },
  { to: '/library', label: '曲库', icon: Headset, auth: false },
  { to: '/upload', label: '上传', icon: Upload, auth: true },
]

const myNav = [
  { to: '/liked', label: '我喜欢的音乐', icon: Star, auth: true },
  { to: '/recent', label: '最近播放', icon: Clock, auth: true },
]

const avatarText = computed(() => {
  const n = user.user?.nickname || '未'
  return n.slice(0, 1)
})

onMounted(() => {
  user.restore()
  if (!user.accessToken) {
    ui.openLogin('login')
  } else {
    void playlistStore.fetchMine()
  }
})

watch(
  () => user.accessToken,
  (token) => {
    if (token) void playlistStore.fetchMine()
    else playlistStore.list = []
  },
)

function isActive(path: string) {
  return route.path === path || route.path.startsWith(path + '/')
}

function plistCoverSrc(p: PlaylistDto) {
  return mediaUrl(p.coverUrl) || ''
}

function goSearch() {
  const q = keyword.value.trim()
  router.push({ path: '/search', query: q ? { keyword: q } : {} })
}

watch(
  () => route.query.keyword,
  (kw) => {
    if (route.path === '/search' && typeof kw === 'string') {
      keyword.value = kw
    }
  },
)

function goSettings() {
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  router.push('/settings')
}

function onUserClick() {
  if (user.accessToken) {
    router.push('/profile')
    return
  }
  ui.openLogin('login')
}

function onNavClick(item: { to: string; auth?: boolean }, e: Event) {
  if (item.auth && !user.accessToken) {
    e.preventDefault()
    sessionStorage.setItem('loginRedirect', item.to)
    ui.openLogin('login')
  }
}

async function onCreatePlaylist() {
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  try {
    const { value } = await ElMessageBox.prompt('请输入歌单名称', '新建歌单', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '名称不能为空',
      inputPlaceholder: '例如：我的收藏',
    })
    const created = await playlistStore.create(value.trim())
    ElMessage.success('歌单已创建')
    router.push(`/playlist/${created.id}`)
  } catch {
    // cancel
  }
}

function onLogout() {
  user.logout()
  playlistStore.list = []
  ui.openLogin('login')
  router.push('/discover')
}
</script>

<style scoped lang="scss">
.layout {
  display: grid;
  grid-template-columns: 210px 1fr;
  grid-template-rows: 1fr var(--wy-player-h);
  height: 100%;
  max-height: 100%;
  overflow: hidden;
  background: #fff;
}
.sidebar {
  grid-row: 1 / 2;
  background: #f5f5f7;
  border-right: 1px solid #ececec;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.brand {
  height: 58px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 18px;
}
.brand-logo {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
  display: block;
}
.brand-name {
  font-size: 16px;
  font-weight: 700;
  color: #333;
}
.nav {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 4px 10px 16px;
  overscroll-behavior: contain;
}
.nav-title {
  margin: 14px 10px 6px;
  font-size: 12px;
  color: #999;
}
.playlist-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.add-btn {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid #ccc;
  background: #fff;
  color: #666;
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  &:hover {
    border-color: #ec4141;
    color: #ec4141;
  }
}
.nav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 38px;
  padding: 0 12px;
  border-radius: 8px;
  color: #333;
  font-size: 14px;
  transition: background 0.15s;
  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
  &.active {
    background: #ec4141;
    color: #fff;
    font-weight: 600;
  }
}
.playlist-item {
  height: 42px;
}
.plist-cover {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  object-fit: cover;
  background: linear-gradient(135deg, #ff8a80, #ec4141);
  flex-shrink: 0;
  display: block;
}
.plist-cover--empty {
  background: linear-gradient(135deg, #ff8a80, #ec4141);
}
.plist-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empty-tip {
  padding: 6px 12px;
  font-size: 12px;
  color: #bbb;
}
.main {
  grid-row: 1 / 2;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #fff;
}
.topbar {
  height: 58px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px 0 20px;
  gap: 16px;
}
.search-wrap {
  flex: 1;
  max-width: 420px;
  height: 34px;
  border-radius: 17px;
  background: #f2f2f3;
  display: flex;
  align-items: center;
  padding: 0 14px;
  gap: 8px;
}
.search-icon {
  color: #999;
}
.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: #333;
  min-width: 0;
  &::placeholder {
    color: #aaa;
  }
}
.top-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 16px;
  &:hover {
    background: #f5f5f5;
  }
}
.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff8a80, #ec4141);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
}
.uname {
  font-size: 13px;
  color: #555;
  max-width: 88px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.icon-btn,
.text-btn {
  border: none;
  background: transparent;
  color: #666;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  &:hover {
    background: #f5f5f5;
    color: #333;
  }
}
.text-btn {
  font-size: 13px;
  padding: 6px 8px;
}
.content {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 8px 28px 28px;
  overscroll-behavior: contain;
}
</style>
