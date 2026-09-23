<template>
  <Teleport to="body">
    <Transition name="collect-fade">
      <div v-if="ui.collectModalVisible" class="collect-mask" @click.self="ui.closeCollect()">
        <div class="collect-dialog" role="dialog" aria-label="收藏到歌单">
          <header class="collect-head">
            <h3>收藏到歌单</h3>
            <button class="close-btn" type="button" @click="ui.closeCollect()">
              <el-icon :size="18"><Close /></el-icon>
            </button>
          </header>

          <div class="sort-row">
            <button
              type="button"
              class="sort-btn"
              :class="{ active: sort === 'default' }"
              @click="sort = 'default'"
            >
              默认排序
            </button>
            <button
              type="button"
              class="sort-btn"
              :class="{ active: sort === 'frequent' }"
              @click="sort = 'frequent'"
            >
              常用优先
            </button>
          </div>

          <div class="collect-list" v-loading="loading">
            <button class="collect-item create" type="button" @click="onCreate">
              <span class="create-icon">
                <el-icon :size="22"><Plus /></el-icon>
              </span>
              <span class="item-meta">
                <span class="item-name">创建新歌单</span>
              </span>
            </button>

            <button
              v-for="p in displayList"
              :key="p.id"
              class="collect-item"
              type="button"
              @click="onSelect(p)"
            >
              <span class="item-cover" :style="coverStyle(p)" />
              <span class="item-meta">
                <span class="item-name">{{ p.name }}</span>
                <span class="item-count">{{ p.trackCount ?? 0 }}首</span>
              </span>
            </button>

            <div v-if="!displayList.length && !loading" class="empty">暂无歌单，先创建一个吧</div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { PlaylistDto } from '@wy-music/shared'
import { useUiStore } from '../stores/ui'
import { useUserStore } from '../stores/user'
import { usePlaylistStore } from '../stores/playlist'
import { mediaUrl } from '../services/http'

const ui = useUiStore()
const user = useUserStore()
const playlistStore = usePlaylistStore()

const loading = ref(false)
const sort = ref<'default' | 'frequent'>('default')

const displayList = computed(() => {
  const list = [...playlistStore.createdPlaylists]
  if (sort.value === 'frequent') {
    return list.sort((a, b) => (b.trackCount || 0) - (a.trackCount || 0))
  }
  return list
})

watch(
  () => ui.collectModalVisible,
  async (v) => {
    if (!v) return
    if (!user.accessToken) {
      ui.closeCollect()
      ui.openLogin('login')
      return
    }
    loading.value = true
    try {
      await playlistStore.fetchMine()
    } finally {
      loading.value = false
    }
  },
)

function coverStyle(p: PlaylistDto) {
  const url = mediaUrl(p.coverUrl)
  if (url) return { backgroundImage: `url(${url})` }
  return { backgroundImage: 'linear-gradient(135deg,#ff8a80,#ec4141)' }
}

async function onCreate() {
  try {
    const { value } = await ElMessageBox.prompt('请输入歌单名称', '创建新歌单', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '名称不能为空',
      inputPlaceholder: '例如：我的收藏',
    })
    const created = await playlistStore.create(value.trim())
    const track = ui.collectTrack
    if (track && !track.id.startsWith('local:') && !track.id.startsWith('webfile:')) {
      await playlistStore.addTrack(created.id, track.id)
      ElMessage.success(`已创建并加入「${created.name}」`)
    } else {
      ElMessage.success('歌单已创建')
    }
    ui.closeCollect()
  } catch {
    // cancel
  }
}

async function onSelect(p: PlaylistDto) {
  const track = ui.collectTrack
  if (!track) return
  if (track.id.startsWith('local:') || track.id.startsWith('webfile:')) {
    ElMessage.warning('请先上传后再收藏')
    return
  }
  await playlistStore.addTrack(p.id, track.id)
  ElMessage.success(`已收藏到「${p.name}」`)
  ui.closeCollect()
}
</script>

<style scoped lang="scss">
.collect-mask {
  position: fixed;
  inset: 0;
  z-index: 2100;
  background: rgba(0, 0, 0, 0.35);
  display: grid;
  place-items: center;
  padding: 24px;
}
.collect-dialog {
  width: min(420px, 100%);
  max-height: min(560px, 82vh);
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.collect-head {
  position: relative;
  padding: 18px 20px 8px;
  text-align: center;
  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #333;
  }
}
.close-btn {
  position: absolute;
  right: 12px;
  top: 12px;
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  &:hover {
    background: #f5f5f5;
    color: #666;
  }
}
.sort-row {
  display: flex;
  justify-content: center;
  gap: 20px;
  padding: 4px 16px 10px;
}
.sort-btn {
  border: none;
  background: transparent;
  color: #999;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 0;
  &.active {
    color: #333;
    font-weight: 600;
  }
}
.collect-list {
  flex: 1;
  overflow: auto;
  padding: 4px 8px 16px;
  min-height: 200px;
}
.collect-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  &:hover {
    background: #f5f5f5;
  }
}
.create-icon {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  background: #f0f0f0;
  color: #666;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.item-cover {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
}
.item-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.item-name {
  font-size: 14px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-count {
  font-size: 12px;
  color: #999;
}
.empty {
  text-align: center;
  color: #bbb;
  font-size: 13px;
  padding: 40px 0;
}
.collect-fade-enter-active,
.collect-fade-leave-active {
  transition: opacity 0.2s ease;
}
.collect-fade-enter-from,
.collect-fade-leave-to {
  opacity: 0;
}
</style>
