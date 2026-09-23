<template>
  <div v-loading="loading" class="playlist-page">
    <template v-if="detail">
      <div class="header">
        <div class="cover" :style="coverStyle" />
        <div class="meta">
          <div class="title-row">
            <h1>{{ detail.name }}</h1>
            <button
              v-if="!detail.isSystem"
              class="icon-btn"
              type="button"
              title="重命名"
              @click="onRename"
            >
              <el-icon :size="16"><Edit /></el-icon>
            </button>
          </div>
          <div class="owner">
            <span class="avatar">{{ (detail.ownerNickname || '用').slice(0, 1) }}</span>
            <span class="owner-name">{{ detail.ownerNickname || '我' }}</span>
            <span class="date">{{ createdText }} 创建</span>
          </div>
          <div class="actions">
            <el-button type="danger" round :disabled="!detail.tracks?.length" @click="playAll">
              <el-icon><VideoPlay /></el-icon>
              播放全部
            </el-button>
            <el-button round disabled title="暂未开放">
              <el-icon><Download /></el-icon>
              下载
            </el-button>
            <el-dropdown v-if="!detail.isSystem" trigger="click" @command="onMoreCommand">
              <el-button round circle>
                <el-icon><MoreFilled /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="rename">重命名</el-dropdown-item>
                  <el-dropdown-item command="delete" divided>删除歌单</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </div>

      <div class="tabs">
        <button
          type="button"
          class="tab"
          :class="{ active: activeTab === 'songs' }"
          @click="activeTab = 'songs'"
        >
          歌曲 {{ detail.tracks?.length || 0 }}
        </button>
        <button
          type="button"
          class="tab"
          :class="{ active: activeTab === 'comments' }"
          @click="activeTab = 'comments'"
        >
          评论
        </button>
        <button
          type="button"
          class="tab"
          :class="{ active: activeTab === 'collectors' }"
          @click="activeTab = 'collectors'"
        >
          收藏者
        </button>
        <div class="tab-search">
          <el-icon class="tab-search-icon"><Search /></el-icon>
          <input v-model="keyword" type="search" placeholder="搜索" />
        </div>
      </div>

      <div v-show="activeTab === 'songs'" class="song-panel">
        <div class="table-head">
          <span class="col-idx">#</span>
          <span class="col-title">标题</span>
          <span class="col-album">专辑</span>
          <span class="col-like">喜欢</span>
          <span class="col-dur">时长</span>
        </div>

        <div
          v-for="(row, idx) in filteredTracks"
          :key="row.id"
          class="song-row"
          :class="{ playing: isPlaying(row), active: isCurrent(row) }"
          @dblclick="playOne(row)"
          @contextmenu.prevent="openMenu($event, row)"
        >
          <div class="col-idx">
            <span v-if="isPlaying(row)" class="eq">
              <i /><i /><i />
            </span>
            <button v-else class="idx-play" type="button" @click="playOne(row)">
              <span class="num">{{ String(idx + 1).padStart(2, '0') }}</span>
              <el-icon class="play-ico"><VideoPlay /></el-icon>
            </button>
          </div>

          <div class="col-title">
            <div class="thumb" :style="trackCover(row)" @click="playOne(row)" />
            <div class="title-meta">
              <div class="name-line">
                <span class="name" :title="row.name">{{ row.name }}</span>
                <div class="row-actions">
                  <button type="button" title="收藏到歌单" @click.stop="onCollect(row)">
                    <el-icon><FolderAdd /></el-icon>
                  </button>
                  <button type="button" title="更多" @click.stop="openMenu($event, row)">
                    <el-icon><MoreFilled /></el-icon>
                  </button>
                  <button
                    v-if="!detail.isSystem"
                    type="button"
                    title="从歌单移除"
                    @click.stop="removeTrack(row.id)"
                  >
                    <el-icon><Delete /></el-icon>
                  </button>
                </div>
              </div>
              <div class="artists">{{ row.artists?.join(' / ') || '未知歌手' }}</div>
            </div>
          </div>

          <div class="col-album" :title="row.album || ''">{{ row.album || '-' }}</div>

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

        <el-empty
          v-if="!filteredTracks.length"
          :description="emptySongsText"
        />
      </div>

      <div v-show="activeTab === 'comments'" class="placeholder">
        <el-empty description="评论功能暂未开放" :image-size="72" />
      </div>
      <div v-show="activeTab === 'collectors'" class="placeholder">
        <el-empty description="收藏者列表暂未开放" :image-size="72" />
      </div>
    </template>

    <el-empty v-else-if="!loading" description="歌单不存在或无权访问" />

    <!-- 更多菜单：不含购买单曲 -->
    <Teleport to="body">
      <div
        v-if="menu.visible"
        class="ctx-mask"
        @click="closeMenu"
        @contextmenu.prevent="closeMenu"
      >
        <ul class="ctx-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }" @click.stop>
          <li @click="runMenu('play')">播放</li>
          <li @click="runMenu('next')">下一首播放</li>
          <li @click="runMenu('comments')">查看评论</li>
          <li class="sep" />
          <li @click="runMenu('collect')">收藏到歌单</li>
          <li @click="runMenu('like')">{{ menu.track?.liked ? '取消喜欢' : '喜欢' }}</li>
          <li v-if="detail && !detail.isSystem" @click="runMenu('remove')">从歌单移除</li>
          <li @click="runMenu('copy')">复制链接</li>
        </ul>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { TrackDto } from '@wy-music/shared'
import { http, mediaUrl, streamUrl } from '../services/http'
import { usePlayerStore } from '../stores/player'
import { usePlaylistStore, type PlaylistDetail } from '../stores/playlist'
import { useUiStore } from '../stores/ui'
import { useUserStore } from '../stores/user'
import { formatDuration } from '../services/localUpload'

const route = useRoute()
const router = useRouter()
const player = usePlayerStore()
const playlistStore = usePlaylistStore()
const ui = useUiStore()
const user = useUserStore()

const loading = ref(false)
const detail = ref<PlaylistDetail | null>(null)
const activeTab = ref<'songs' | 'comments' | 'collectors'>('songs')
const keyword = ref('')

const menu = reactive({
  visible: false,
  x: 0,
  y: 0,
  track: null as TrackDto | null,
})

const coverStyle = computed(() => {
  // 优先展示歌单第一首歌封面
  const first = detail.value?.tracks?.[0]?.coverUrl || detail.value?.coverUrl
  const url = mediaUrl(first)
  if (url) return { backgroundImage: `url(${url})` }
  return { backgroundImage: 'linear-gradient(135deg,#ec4141,#ff8a80)' }
})

const createdText = computed(() => {
  const raw = detail.value?.createdAt
  if (!raw) return ''
  return raw.slice(0, 10)
})

const filteredTracks = computed(() => {
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

const emptySongsText = computed(() => {
  if (!detail.value?.tracks?.length) return '歌单还是空的，去曲库添加歌曲吧'
  if (keyword.value.trim()) return '未找到相关歌曲'
  return '暂无歌曲'
})

function trackCover(row: TrackDto) {
  const url = mediaUrl(row.coverUrl)
  return url
    ? { backgroundImage: `url(${url})` }
    : { backgroundImage: 'linear-gradient(135deg,#ff8a80,#ec4141)' }
}

function isCurrent(row: TrackDto) {
  return player.currentTrack?.id === row.id
}

function isPlaying(row: TrackDto) {
  return isCurrent(row) && player.playing
}

async function load() {
  const id = String(route.params.id || '')
  if (!id) return
  loading.value = true
  activeTab.value = 'songs'
  keyword.value = ''
  try {
    detail.value = await playlistStore.fetchDetail(id)
  } catch {
    detail.value = null
  } finally {
    loading.value = false
  }
}

function playAll() {
  if (!detail.value?.tracks?.length) return
  player.setQueue(detail.value.tracks, 0)
}

function playOne(row: TrackDto) {
  if (!detail.value?.tracks) return
  player.playTrack(row, detail.value.tracks)
}

async function toggleLike(row: TrackDto) {
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  const { data } = await http.post(`/api/likes/${row.id}`)
  row.liked = data.data.liked
}

function onCollect(row: TrackDto) {
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  ui.openCollect(row)
}

async function removeTrack(trackId: string) {
  if (!detail.value) return
  await http.delete(`/api/playlists/${detail.value.id}/tracks/${trackId}`)
  ElMessage.success('已移除')
  await load()
  await playlistStore.fetchMine()
}

async function onRename() {
  if (!detail.value || detail.value.isSystem) return
  try {
    const { value } = await ElMessageBox.prompt('请输入新的歌单名称', '重命名', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: detail.value.name,
      inputPattern: /\S+/,
      inputErrorMessage: '名称不能为空',
    })
    await http.put(`/api/playlists/${detail.value.id}`, { name: value.trim() })
    ElMessage.success('已重命名')
    await load()
    await playlistStore.fetchMine()
  } catch {
    // cancel
  }
}

async function onDelete() {
  if (!detail.value || detail.value.isSystem) return
  await ElMessageBox.confirm(`确认删除歌单「${detail.value.name}」？`, '提示', { type: 'warning' })
  await playlistStore.remove(detail.value.id)
  ElMessage.success('已删除')
  router.push('/discover')
}

function onMoreCommand(cmd: string) {
  if (cmd === 'rename') void onRename()
  if (cmd === 'delete') void onDelete()
}

function openMenu(e: MouseEvent, track: TrackDto) {
  menu.track = track
  const pad = 8
  menu.x = Math.min(e.clientX, window.innerWidth - 180 - pad)
  menu.y = Math.min(e.clientY, window.innerHeight - 260 - pad)
  menu.visible = true
}

function closeMenu() {
  menu.visible = false
  menu.track = null
}

async function runMenu(action: string) {
  const track = menu.track
  closeMenu()
  if (!track) return
  if (action === 'play') playOne(track)
  else if (action === 'next') {
    player.playNext(track)
    ElMessage.success('已添加到下一首播放')
  } else if (action === 'comments') {
    ui.openPageComments(track)
    router.push(`/comment/${track.id}`)
  } else if (action === 'collect') onCollect(track)
  else if (action === 'like') await toggleLike(track)
  else if (action === 'remove') await removeTrack(track.id)
  else if (action === 'copy') {
    try {
      await navigator.clipboard.writeText(streamUrl(track.id))
      ElMessage.success('链接已复制')
    } catch {
      ElMessage.info(streamUrl(track.id))
    }
  }
}

onMounted(load)
watch(() => route.params.id, load)
</script>

<style scoped lang="scss">
.playlist-page {
  min-height: 400px;
  padding-bottom: 12px;
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
  padding-top: 8px;
}
.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  h1 {
    margin: 0;
    font-size: 36px;
    font-weight: 700;
    color: #222;
    line-height: 1.2;
  }
}
.icon-btn {
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
.owner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  font-size: 13px;
  color: #666;
}
.avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #ec4141;
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 600;
}
.owner-name {
  color: #333;
}
.date {
  color: #aaa;
  margin-left: 4px;
}
.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 22px;
}
.tabs {
  display: flex;
  align-items: center;
  gap: 28px;
  border-bottom: 1px solid #eee;
  margin: 18px 0 0;
}
.tab {
  border: none;
  background: transparent;
  padding: 12px 2px 14px;
  font-size: 14px;
  color: #666;
  cursor: pointer;
  position: relative;
  &.active {
    color: #ec4141;
    font-weight: 600;
    &::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 2px;
      background: #ec4141;
    }
  }
}
.tab-search {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: 15px;
  background: #f5f5f5;
  border: 1px solid #ececec;
  color: #bbb;
  input {
    border: none;
    outline: none;
    background: transparent;
    width: 88px;
    font-size: 12px;
    color: #333;
    &::placeholder {
      color: #bbb;
    }
  }
}
.tab-search-icon {
  font-size: 14px;
}
.song-panel {
  margin-top: 4px;
}
.table-head,
.song-row {
  display: grid;
  grid-template-columns: 56px minmax(220px, 1.6fr) minmax(120px, 1fr) 56px 64px;
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
  cursor: default;
  transition: background 0.12s;
  &:hover {
    background: #f5f5f5;
    .idx-play .num {
      display: none;
    }
    .idx-play .play-ico {
      display: inline-flex;
    }
    .row-actions {
      opacity: 1;
      pointer-events: auto;
    }
  }
  &.active {
    .name {
      color: #ec4141;
    }
    .artists {
      color: #f08080;
    }
  }
  &.playing {
    background: #fafafa;
  }
}
.col-idx {
  display: grid;
  place-items: center;
  color: #bbb;
  font-size: 13px;
}
.idx-play {
  border: none;
  background: transparent;
  width: 28px;
  height: 28px;
  color: #bbb;
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 0;
  .play-ico {
    display: none;
    color: #666;
  }
}
.eq {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
  i {
    display: block;
    width: 3px;
    background: #ec4141;
    border-radius: 1px;
    animation: eq 0.8s ease-in-out infinite;
    &:nth-child(1) {
      height: 6px;
      animation-delay: 0s;
    }
    &:nth-child(2) {
      height: 12px;
      animation-delay: 0.15s;
    }
    &:nth-child(3) {
      height: 8px;
      animation-delay: 0.3s;
    }
  }
}
@keyframes eq {
  0%,
  100% {
    transform: scaleY(0.5);
  }
  50% {
    transform: scaleY(1);
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
  flex: 1;
}
.name-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.name {
  font-size: 14px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
  flex-shrink: 0;
  transition: opacity 0.12s;
  button {
    width: 26px;
    height: 26px;
    border: none;
    background: transparent;
    border-radius: 50%;
    color: #888;
    cursor: pointer;
    display: grid;
    place-items: center;
    &:hover {
      background: rgba(0, 0, 0, 0.06);
      color: #ec4141;
    }
  }
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
.placeholder {
  padding: 48px 0;
}
.ctx-mask {
  position: fixed;
  inset: 0;
  z-index: 2200;
}
.ctx-menu {
  position: fixed;
  margin: 0;
  padding: 6px 0;
  list-style: none;
  min-width: 160px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.16);
  border: 1px solid #eee;
  li {
    padding: 9px 18px;
    font-size: 13px;
    color: #333;
    cursor: pointer;
    &:hover:not(.sep) {
      background: #f5f5f5;
    }
    &.sep {
      height: 1px;
      padding: 0;
      margin: 6px 0;
      background: #eee;
      cursor: default;
    }
  }
}
@media (max-width: 900px) {
  .header {
    flex-direction: column;
  }
  .cover {
    width: 160px;
    height: 160px;
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
