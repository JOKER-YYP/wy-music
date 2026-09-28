<template>
  <div class="layout">
    <header class="topbar">
      <div class="topbar-left">
        <div class="brand" @click="router.push('/discover')">
          <img class="brand-logo" :src="logoUrl" alt="WY Music" />
          <span class="brand-name">WY Music</span>
        </div>
        <div class="hist-nav">
          <button type="button" class="hist-btn" title="后退" @click="router.back()">
            <el-icon :size="14"><ArrowLeft /></el-icon>
          </button>
          <button type="button" class="hist-btn" title="前进" @click="router.forward()">
            <el-icon :size="14"><ArrowRight /></el-icon>
          </button>
        </div>
        <div ref="searchAnchorRef" class="search-anchor">
          <div class="search-wrap" :class="{ focused: searchOpen }">
            <el-icon class="search-icon"><Search /></el-icon>
            <input
              ref="searchInputRef"
              v-model="keyword"
              class="search-input"
              placeholder="搜索"
              @focus="openSearchPanel"
              @input="onSearchInput"
              @keydown.down.prevent="noop"
              @keyup.enter="goSearch"
              @keydown.esc="closeSearchPanel"
            />
            <button
              v-if="keyword"
              type="button"
              class="clear-btn"
              title="清空"
              @mousedown.prevent
              @click="clearKeyword"
            >
              <el-icon :size="14"><CircleClose /></el-icon>
            </button>
            <span v-else class="mic-slot" aria-hidden="true">
              <el-icon :size="14"><Microphone /></el-icon>
            </span>
          </div>
          <Teleport to="body">
            <SearchDropdown
              v-if="searchOpen"
              ref="searchDropdownRef"
              :visible="searchOpen"
              :keyword="keyword"
              :anchor-style="searchPanelStyle"
              @search="onSuggestSearch"
            />
          </Teleport>
        </div>
      </div>

      <div class="topbar-right">
        <button class="user-chip" type="button" @click="onUserClick">
          <img v-if="avatarSrc" class="avatar avatar-img" :src="avatarSrc" alt="" />
          <span v-else class="avatar">{{ avatarText }}</span>
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

    <aside class="sidebar">
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
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CircleClose,
  Clock,
  FolderOpened,
  Headset,
  Microphone,
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
import { http, mediaUrl } from '../services/http'
import PlayerBar from '../components/PlayerBar.vue'
import PlayerIpcBridge from '../components/PlayerIpcBridge.vue'
import LoginModal from '../components/LoginModal.vue'
import NowPlayingPanel from '../components/NowPlayingPanel.vue'
import CollectPlaylistModal from '../components/CollectPlaylistModal.vue'
import CommentsPanel from '../components/CommentsPanel.vue'
import SearchDropdown from '../components/SearchDropdown.vue'
import logoUrl from '../assets/logo.png'

const route = useRoute()
const router = useRouter()
const user = useUserStore()
const ui = useUiStore()
const playlistStore = usePlaylistStore()
const keyword = ref('')
const searchOpen = ref(false)
const searchAnchorRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const searchDropdownRef = ref<{ pushHistory: (kw: string) => void } | null>(null)
const searchPanelStyle = ref<Record<string, string>>({})

function updateSearchPanelPos() {
  const el = searchAnchorRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  searchPanelStyle.value = {
    position: 'fixed',
    top: `${Math.round(rect.bottom + 8)}px`,
    left: `${Math.round(rect.left)}px`,
    width: '520px',
    maxWidth: 'min(520px, calc(100vw - 24px))',
    zIndex: '2000',
  }
}

const primaryNav = [
  { to: '/discover', label: '精选', icon: Headset, auth: false },
  { to: '/library', label: '曲库', icon: Headset, auth: false },
  { to: '/upload', label: '上传', icon: Upload, auth: true },
]

const myNav = [
  { to: '/recommend/daily', label: '每日推荐', icon: Calendar, auth: true },
  { to: '/liked', label: '我喜欢的音乐', icon: Star, auth: true },
  { to: '/recent', label: '最近播放', icon: Clock, auth: true },
]

const avatarText = computed(() => {
  const n = user.user?.nickname || '未'
  return n.slice(0, 1)
})

const avatarSrc = computed(() => mediaUrl(user.user?.avatarUrl) || '')

onMounted(() => {
  user.restore()
  if (!user.accessToken) {
    ui.openLogin('login')
  } else {
    void playlistStore.fetchMine()
    void checkTrackRemovedNotices()
  }
  document.addEventListener('mousedown', onDocPointerDown)
  window.addEventListener('resize', updateSearchPanelPos)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocPointerDown)
  window.removeEventListener('resize', updateSearchPanelPos)
})

watch(
  () => user.accessToken,
  (token) => {
    if (token) {
      void playlistStore.fetchMine()
      void checkTrackRemovedNotices()
    } else {
      playlistStore.list = []
    }
  },
)

async function checkTrackRemovedNotices() {
  if (!user.accessToken) return
  try {
    const { data } = await http.get('/api/notifications', {
      params: { unreadOnly: true, type: 'track_removed', pageSize: 50 },
    })
    const list = (data.data?.list || []) as Array<{
      id: string
      trackName?: string | null
      body: string
    }>
    if (!list.length) return

    const names = [
      ...new Set(list.map((n) => n.trackName).filter(Boolean) as string[]),
    ]
    const detail =
      names.length > 0
        ? names.map((n) => `《${n}》`).join('、')
        : list.map((n) => n.body).join('\n')

    await ElMessageBox.alert(
      `以下歌曲已被下架，已从你的收藏/歌单中移除：\n\n${detail}`,
      '歌曲下架通知',
      { confirmButtonText: '知道了', type: 'warning' },
    )
    await http.post('/api/notifications/read', { ids: list.map((n) => n.id) })
  } catch (e) {
    console.warn('[notifications]', e)
  }
}

function isActive(path: string) {
  return route.path === path || route.path.startsWith(path + '/')
}

function plistCoverSrc(p: PlaylistDto) {
  return mediaUrl(p.coverUrl) || ''
}

function openSearchPanel() {
  updateSearchPanelPos()
  searchOpen.value = true
}

function closeSearchPanel() {
  searchOpen.value = false
}

function onSearchInput() {
  if (!searchOpen.value) {
    updateSearchPanelPos()
    searchOpen.value = true
  }
}

function clearKeyword() {
  keyword.value = ''
  searchInputRef.value?.focus()
  updateSearchPanelPos()
  searchOpen.value = true
}

function noop() {}

function onDocPointerDown(e: MouseEvent) {
  const el = searchAnchorRef.value
  const panel = document.querySelector('.search-dropdown')
  const target = e.target as Node
  if (el?.contains(target) || panel?.contains(target)) return
  closeSearchPanel()
}

function goSearch() {
  const q = keyword.value.trim()
  if (q) {
    searchDropdownRef.value?.pushHistory(q)
    // 面板未挂载时也写入本地历史
    try {
      const key = 'wy-search-history'
      const raw = localStorage.getItem(key)
      const arr = raw ? (JSON.parse(raw) as string[]) : []
      const next = [q, ...(Array.isArray(arr) ? arr.filter((h) => h !== q) : [])].slice(0, 20)
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // ignore
    }
  }
  closeSearchPanel()
  router.push({ path: '/search', query: q ? { keyword: q } : {} })
}

function onSuggestSearch(q: string) {
  keyword.value = q
  closeSearchPanel()
  router.push({ path: '/search', query: { keyword: q } })
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
  grid-template-rows: 54px 1fr var(--wy-player-h);
  height: 100%;
  max-height: 100%;
  overflow: hidden;
  background: #fff;
}
.topbar {
  grid-column: 1 / -1;
  grid-row: 1;
  height: 54px;
  background: #ec4141;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px 0 14px;
  gap: 16px;
  position: relative;
  z-index: 30;
  color: #fff;
}
.topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}
.topbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  flex-shrink: 0;
  user-select: none;
}
.brand-logo {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
  display: block;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.25);
}
.brand-name {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.2px;
  white-space: nowrap;
}
.hist-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.hist-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.12);
  color: rgba(255, 255, 255, 0.85);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  &:hover {
    background: rgba(0, 0, 0, 0.2);
    color: #fff;
  }
}
.search-anchor {
  position: relative;
  width: 240px;
  flex-shrink: 0;
}
.search-wrap {
  height: 30px;
  border-radius: 15px;
  background: rgba(0, 0, 0, 0.16);
  display: flex;
  align-items: center;
  padding: 0 8px 0 12px;
  gap: 6px;
  transition: background 0.15s ease, box-shadow 0.15s ease;
  &.focused {
    background: rgba(0, 0, 0, 0.22);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.28);
  }
}
.search-icon {
  color: rgba(255, 255, 255, 0.75);
  flex-shrink: 0;
}
.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 12px;
  color: #fff;
  min-width: 0;
  &::placeholder {
    color: rgba(255, 255, 255, 0.55);
  }
}
.clear-btn,
.mic-slot {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  padding: 0;
}
.clear-btn {
  cursor: pointer;
  &:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
  }
}
.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 3px 8px 3px 3px;
  border-radius: 16px;
  color: #fff;
  &:hover {
    background: rgba(0, 0, 0, 0.12);
  }
}
.avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.35);
}
.avatar-img {
  object-fit: cover;
  padding: 0;
  background: #fff;
}
.uname {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.95);
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.icon-btn,
.text-btn {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.88);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  &:hover {
    background: rgba(0, 0, 0, 0.12);
    color: #fff;
  }
}
.text-btn {
  font-size: 12px;
  padding: 6px 8px;
}
.sidebar {
  grid-column: 1;
  grid-row: 2;
  background: #f5f5f7;
  border-right: 1px solid #ececec;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.nav {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 10px 10px 16px;
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
  grid-column: 2;
  grid-row: 2;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #fff;
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
