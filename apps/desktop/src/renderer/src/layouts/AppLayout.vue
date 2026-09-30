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
        <button
          class="icon-btn msg-btn"
          type="button"
          title="消息"
          @click="toggleMessagePanel"
        >
          <el-icon :size="18"><Message /></el-icon>
          <span v-if="unreadTotal > 0" class="msg-badge">
            {{ unreadTotal > 99 ? '99+' : unreadTotal }}
          </span>
        </button>
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

        <div class="win-controls" aria-label="窗口控制">
          <button type="button" class="win-btn" title="最小化" @click="minimizeWindow">
            <span class="win-icon win-min" />
          </button>
          <button
            type="button"
            class="win-btn"
            :title="isMaximized ? '还原' : '最大化'"
            @click="maximizeWindow"
          >
            <span class="win-icon" :class="isMaximized ? 'win-restore' : 'win-max'" />
          </button>
          <button type="button" class="win-btn win-close" title="关闭" @click="closeWindow">
            <span class="win-icon win-x" />
          </button>
        </div>
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

        <div class="nav-title mine-head">
          <span>我的</span>
          <button class="edit-btn" type="button" title="编辑我的模块" @click="openMyModulesEdit">
            <el-icon :size="14"><EditPen /></el-icon>
          </button>
        </div>
        <div class="nav-group">
          <router-link
            v-for="item in myModules.sidebarModules"
            :key="item.id"
            :to="item.to"
            class="nav-item"
            :class="{ active: isActive(item.to) }"
            @click="onNavClick(item, $event)"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </router-link>
          <button
            v-if="myModules.foldedModules.length"
            type="button"
            class="fold-toggle"
            @click="myModules.toggleFoldedExpanded()"
          >
            <span>{{ myModules.foldedExpanded ? '收起' : '展开' }}</span>
            <el-icon :size="12">
              <ArrowUp v-if="myModules.foldedExpanded" />
              <ArrowDown v-else />
            </el-icon>
          </button>
        </div>

        <div class="nav-title playlist-head">
          <span>创建的歌单 {{ playlistStore.createdPlaylists.length || '' }}</span>
          <el-dropdown trigger="click" @command="onPlaylistMenu">
            <button class="add-btn" type="button" title="歌单操作">
              <el-icon :size="14"><Plus /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="create">创建歌单</el-dropdown-item>
                <el-dropdown-item command="import">歌单导入</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
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
    <ImportPlaylistModal :visible="importPlaylistOpen" @close="importPlaylistOpen = false" />
    <CreatePlaylistModal
      v-model:visible="createPlaylistOpen"
      :loading="createPlaylistLoading"
      @confirm="onConfirmCreatePlaylist"
    />
    <CommentsPanel />
    <MessagePanel
      :visible="messageOpen"
      @close="messageOpen = false"
      @changed="refreshUnreadCount"
    />
    <EditMyModulesModal />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CircleClose,
  EditPen,
  Headset,
  Message,
  Microphone,
  Plus,
  Search,
  Setting,
  Upload,
} from '@element-plus/icons-vue'
import type { PlaylistDto } from '@wy-music/shared'
import { useUserStore } from '../stores/user'
import { useUiStore } from '../stores/ui'
import { usePlaylistStore } from '../stores/playlist'
import { useMyModulesStore } from '../stores/myModules'
import { http, mediaUrl } from '../services/http'
import PlayerBar from '../components/PlayerBar.vue'
import PlayerIpcBridge from '../components/PlayerIpcBridge.vue'
import LoginModal from '../components/LoginModal.vue'
import NowPlayingPanel from '../components/NowPlayingPanel.vue'
import CollectPlaylistModal from '../components/CollectPlaylistModal.vue'
import ImportPlaylistModal from '../components/ImportPlaylistModal.vue'
import CreatePlaylistModal from '../components/CreatePlaylistModal.vue'
import CommentsPanel from '../components/CommentsPanel.vue'
import SearchDropdown from '../components/SearchDropdown.vue'
import MessagePanel from '../components/MessagePanel.vue'
import EditMyModulesModal from '../components/EditMyModulesModal.vue'
import logoUrl from '../assets/logo.png'

const route = useRoute()
const router = useRouter()
const user = useUserStore()
const ui = useUiStore()
const playlistStore = usePlaylistStore()
const myModules = useMyModulesStore()
const keyword = ref('')
const searchOpen = ref(false)
const searchAnchorRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const searchDropdownRef = ref<{ pushHistory: (kw: string) => void } | null>(null)
const searchPanelStyle = ref<Record<string, string>>({})
const messageOpen = ref(false)
const unreadTotal = ref(0)
const isMaximized = ref(false)
const importPlaylistOpen = ref(false)
const createPlaylistOpen = ref(false)
const createPlaylistLoading = ref(false)
let unsubMaximized: (() => void) | null = null

async function refreshMaximized() {
  if (!window.wyAPI?.isWindowMaximized) return
  isMaximized.value = await window.wyAPI.isWindowMaximized()
}

function minimizeWindow() {
  void window.wyAPI?.minimizeWindow?.()
}

function maximizeWindow() {
  void window.wyAPI?.maximizeWindow?.().then((maximized) => {
    if (typeof maximized === 'boolean') isMaximized.value = maximized
  })
}

function closeWindow() {
  void window.wyAPI?.closeWindow?.()
}

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

function openMyModulesEdit() {
  myModules.openEdit()
}

const avatarText = computed(() => {
  const n = user.user?.nickname || '未'
  return n.slice(0, 1)
})

const avatarSrc = computed(() => mediaUrl(user.user?.avatarUrl) || '')

onMounted(() => {
  myModules.restore()
  user.restore()
  void refreshMaximized()
  unsubMaximized = window.wyAPI?.onWindowMaximized?.((v) => {
    isMaximized.value = v
  }) || null
  if (!user.accessToken) {
    ui.openLogin('login')
  } else {
    void playlistStore.fetchMine()
    void checkTrackRemovedNotices()
    void refreshUnreadCount()
  }
  document.addEventListener('mousedown', onDocPointerDown)
  window.addEventListener('resize', updateSearchPanelPos)
})

onBeforeUnmount(() => {
  unsubMaximized?.()
  unsubMaximized = null
  document.removeEventListener('mousedown', onDocPointerDown)
  window.removeEventListener('resize', updateSearchPanelPos)
})

watch(
  () => user.accessToken,
  (token) => {
    if (token) {
      void playlistStore.fetchMine()
      void checkTrackRemovedNotices()
      void refreshUnreadCount()
    } else {
      playlistStore.list = []
      unreadTotal.value = 0
      messageOpen.value = false
    }
  },
)

async function refreshUnreadCount() {
  if (!user.accessToken) {
    unreadTotal.value = 0
    return
  }
  try {
    const { data } = await http.get('/api/notifications/unread-count')
    unreadTotal.value = Number(data.data?.total || 0)
  } catch {
    // ignore
  }
}

function toggleMessagePanel() {
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  messageOpen.value = !messageOpen.value
}

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
    void refreshUnreadCount()
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
  createPlaylistOpen.value = true
}

async function onConfirmCreatePlaylist(payload: { name: string; isPublic: boolean }) {
  createPlaylistLoading.value = true
  try {
    const created = await playlistStore.create(payload.name, { isPublic: payload.isPublic })
    createPlaylistOpen.value = false
    ElMessage.success(payload.isPublic ? '公开歌单已创建' : '歌单已创建')
    router.push(`/playlist/${created.id}`)
  } catch {
    // http interceptor handles toast
  } finally {
    createPlaylistLoading.value = false
  }
}

function onImportPlaylist() {
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  importPlaylistOpen.value = true
}

function onPlaylistMenu(command: string | number) {
  if (command === 'create') onCreatePlaylist()
  else if (command === 'import') onImportPlaylist()
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
  padding: 0 0 0 14px;
  gap: 16px;
  position: relative;
  z-index: 30;
  color: #fff;
  -webkit-app-region: drag;
  app-region: drag;
  user-select: none;
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
  gap: 2px;
  flex-shrink: 0;
  height: 54px;
  padding-right: 4px;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
.topbar-left .brand,
.topbar-left .hist-nav,
.topbar-left .search-anchor {
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
.win-controls {
  display: flex;
  align-items: stretch;
  height: 54px;
  margin-left: 8px;
}
.win-btn {
  width: 46px;
  height: 100%;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.92);
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 0;
  transition: background 0.12s;
  &:hover {
    background: rgba(255, 255, 255, 0.14);
  }
  &.win-close:hover {
    background: #e81123;
  }
}
.win-icon {
  display: block;
  position: relative;
  box-sizing: border-box;
}
.win-min {
  width: 10px;
  height: 1px;
  background: currentColor;
}
.win-max {
  width: 10px;
  height: 10px;
  border: 1px solid currentColor;
}
.win-restore {
  width: 9px;
  height: 9px;
  border: 1px solid currentColor;
  &::after {
    content: '';
    position: absolute;
    top: -3px;
    right: -3px;
    width: 9px;
    height: 9px;
    border: 1px solid currentColor;
    background: #ec4141;
  }
}
.win-x {
  width: 10px;
  height: 10px;
  &::before,
  &::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 12px;
    height: 1px;
    background: currentColor;
  }
  &::before {
    transform: translate(-50%, -50%) rotate(45deg);
  }
  &::after {
    transform: translate(-50%, -50%) rotate(-45deg);
  }
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
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0 8px 0 2px;
  border-radius: 14px;
  color: #fff;
  line-height: 1;
  &:hover {
    background: rgba(0, 0, 0, 0.12);
  }
}
.avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
  line-height: 1;
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
  line-height: 1;
}
.icon-btn,
.text-btn {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.88);
  cursor: pointer;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  border-radius: 6px;
  &:hover {
    background: rgba(0, 0, 0, 0.12);
    color: #fff;
  }
}
.icon-btn {
  width: 28px;
  padding: 0;
  :deep(.el-icon) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    line-height: 1;
  }
  :deep(svg) {
    display: block;
  }
}
.msg-btn {
  position: relative;
}
.msg-badge {
  position: absolute;
  top: -2px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: #fff;
  color: #ec4141;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  box-shadow: 0 0 0 1px rgba(236, 65, 65, 0.2);
}
.text-btn {
  font-size: 12px;
  padding: 0 8px;
  white-space: nowrap;
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
.mine-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.edit-btn {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #aaa;
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  &:hover {
    color: #666;
    background: rgba(0, 0, 0, 0.05);
  }
}
.fold-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin: 4px 8px 0;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #999;
  font-size: 12px;
  cursor: pointer;
  &:hover {
    background: rgba(0, 0, 0, 0.04);
    color: #666;
  }
}
.playlist-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  :deep(.el-dropdown) {
    display: inline-flex;
    line-height: 1;
  }
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
