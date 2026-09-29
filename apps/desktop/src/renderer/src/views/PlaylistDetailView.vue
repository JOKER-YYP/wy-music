<template>
  <div v-loading="loading" class="playlist-page">
    <template v-if="detail">
      <div v-show="!batchMode" class="header">
        <div class="cover" :style="coverStyle" />
        <div class="meta">
          <div class="title-row">
            <h1>{{ detail.name }}</h1>
            <button
              v-if="!detail.isSystem"
              class="icon-btn"
              type="button"
              title="编辑歌单信息"
              @click="goEdit"
            >
              <el-icon :size="16"><Edit /></el-icon>
            </button>
          </div>
          <div v-if="detail.description" class="desc">{{ detail.description }}</div>
          <div v-if="tagList.length" class="tag-list">
            <span v-for="t in tagList" :key="t" class="tag">{{ t }}</span>
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
            <el-dropdown trigger="click" @command="onMoreCommand">
              <el-button round circle>
                <el-icon><MoreFilled /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="share" disabled>分享...</el-dropdown-item>
                  <el-dropdown-item command="batch">批量操作</el-dropdown-item>
                  <el-dropdown-item command="addAll">添加全部至播放列表</el-dropdown-item>
                  <template v-if="!detail.isSystem">
                    <el-dropdown-item command="edit" divided>编辑歌单信息</el-dropdown-item>
                    <el-dropdown-item command="delete">删除歌单</el-dropdown-item>
                  </template>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </div>

      <div v-show="!batchMode" class="tabs">
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

      <div v-show="activeTab === 'songs' || batchMode" class="song-panel">
        <div v-if="batchMode" class="batch-title">{{ detail.name }}</div>
        <SongListTable
          v-model:batch-mode="batchMode"
          :tracks="filteredTracks"
          :allow-delete="false"
          :allow-remove="Boolean(detail && !detail.isSystem)"
          :playlist-id="detail.id"
          :empty-text="emptySongsText"
          @refresh="onTracksRefresh"
        />
      </div>

      <div v-show="!batchMode && activeTab === 'comments'" class="placeholder">
        <el-empty description="评论功能暂未开放" :image-size="72" />
      </div>
      <div v-show="!batchMode && activeTab === 'collectors'" class="placeholder">
        <el-empty description="收藏者列表暂未开放" :image-size="72" />
      </div>
    </template>

    <el-empty v-else-if="!loading" description="歌单不存在或无权访问" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Edit, MoreFilled, Search, VideoPlay } from '@element-plus/icons-vue'
import { mediaUrl } from '../services/http'
import { usePlayerStore } from '../stores/player'
import { usePlaylistStore, type PlaylistDetail } from '../stores/playlist'
import SongListTable from '../components/SongListTable.vue'

const route = useRoute()
const router = useRouter()
const player = usePlayerStore()
const playlistStore = usePlaylistStore()

const loading = ref(false)
const detail = ref<PlaylistDetail | null>(null)
const activeTab = ref<'songs' | 'comments' | 'collectors'>('songs')
const keyword = ref('')
const batchMode = ref(false)

const coverStyle = computed(() => {
  const url = mediaUrl(detail.value?.coverUrl || detail.value?.tracks?.[0]?.coverUrl)
  if (url) return { backgroundImage: `url(${url})` }
  return { backgroundImage: 'linear-gradient(135deg,#ec4141,#ff8a80)' }
})

const createdText = computed(() => {
  const raw = detail.value?.createdAt
  if (!raw) return ''
  return raw.slice(0, 10)
})

const tagList = computed(() => {
  const raw = detail.value?.tags
  if (!raw) return []
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
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

async function load(opts?: { keepBatch?: boolean }) {
  const id = String(route.params.id || '')
  if (!id) return
  loading.value = true
  activeTab.value = 'songs'
  keyword.value = ''
  if (!opts?.keepBatch) batchMode.value = false
  try {
    detail.value = await playlistStore.fetchDetail(id)
  } catch {
    detail.value = null
  } finally {
    loading.value = false
  }
}

async function onTracksRefresh() {
  await load({ keepBatch: batchMode.value })
  await playlistStore.fetchMine()
}

function playAll() {
  if (!detail.value?.tracks?.length) return
  player.setQueue(detail.value.tracks, 0)
}

function addAllToQueue() {
  const list = detail.value?.tracks || []
  if (!list.length) {
    ElMessage.info('歌单为空')
    return
  }
  const added = player.appendToQueue(list)
  ElMessage.success(added ? `已添加 ${added} 首到播放列表` : '全部歌曲已在播放列表中')
}

function goEdit() {
  if (!detail.value || detail.value.isSystem) return
  router.push(`/playlist/${detail.value.id}/edit`)
}

async function onDelete() {
  if (!detail.value || detail.value.isSystem) return
  await ElMessageBox.confirm(`确认删除歌单「${detail.value.name}」？`, '提示', { type: 'warning' })
  await playlistStore.remove(detail.value.id)
  ElMessage.success('已删除')
  router.push('/discover')
}

function onMoreCommand(cmd: string) {
  if (cmd === 'batch') {
    activeTab.value = 'songs'
    batchMode.value = true
  } else if (cmd === 'addAll') addAllToQueue()
  else if (cmd === 'edit') goEdit()
  else if (cmd === 'delete') void onDelete()
  else if (cmd === 'share') ElMessage.info('分享功能暂未开放')
}

onMounted(() => void load())
watch(
  () => route.params.id,
  () => {
    void load()
  },
)
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
.desc {
  margin-top: 10px;
  font-size: 13px;
  color: #666;
  line-height: 1.5;
  max-width: 520px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.tag {
  height: 22px;
  padding: 0 8px;
  border-radius: 11px;
  border: 1px solid #e8e8e8;
  background: #fafafa;
  color: #666;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
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
  gap: 4px;
  border-bottom: 1px solid #f0f0f0;
  margin: 18px 0 8px;
  position: relative;
}
.tab {
  border: none;
  background: transparent;
  padding: 10px 14px;
  font-size: 14px;
  color: #666;
  cursor: pointer;
  position: relative;
  &.active {
    color: #222;
    font-weight: 600;
    &::after {
      content: '';
      position: absolute;
      left: 14px;
      right: 14px;
      bottom: 0;
      height: 2px;
      background: #ec4141;
      border-radius: 1px;
    }
  }
}
.tab-search {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: 14px;
  background: #f5f5f5;
  .tab-search-icon {
    color: #bbb;
    font-size: 14px;
  }
  input {
    border: none;
    background: transparent;
    outline: none;
    width: 120px;
    font-size: 12px;
    color: #333;
  }
}
.batch-title {
  font-size: 20px;
  font-weight: 700;
  color: #222;
  margin: 4px 0 12px;
}
.song-panel {
  margin-top: 4px;
}
.placeholder {
  padding: 48px 0;
}
@media (max-width: 720px) {
  .header {
    flex-direction: column;
    gap: 16px;
  }
  .cover {
    width: 140px;
    height: 140px;
  }
  .title-row h1 {
    font-size: 26px;
  }
}
</style>
