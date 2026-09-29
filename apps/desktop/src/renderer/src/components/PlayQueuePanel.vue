<template>
  <Teleport to="body">
    <Transition name="queue-slide">
      <div v-if="visible" class="queue-panel" role="dialog" aria-label="播放列表">
        <header class="head">
          <div class="head-left">
            <h3 class="title">播放列表</h3>
            <span class="count">{{ player.queue.length }}</span>
          </div>
          <div class="head-actions">
            <button type="button" class="act" :disabled="!canCollectAll" @click="collectAll">
              <el-icon :size="15"><FolderAdd /></el-icon>
              <span>收藏全部</span>
            </button>
            <button type="button" class="act" :disabled="!player.queue.length" @click="clearAll">
              <el-icon :size="15"><Delete /></el-icon>
              <span>清空</span>
            </button>
          </div>
        </header>

        <div v-if="!player.queue.length" class="empty">暂无歌曲</div>
        <div v-else class="list-wrap">
          <div ref="listRef" class="list" @scroll="onListScroll">
            <button
              v-for="(item, index) in player.queue"
              :key="item.id + '-' + index"
              type="button"
              class="row"
              :class="{ active: index === player.currentIndex }"
              :data-index="index"
              @click="player.playAt(index)"
            >
              <span class="cover" :style="coverStyle(item)">
                <span v-if="index === player.currentIndex && player.playing" class="cover-play">
                  <i class="iconfont icon-play" />
                </span>
              </span>
              <span class="meta">
                <span class="name" :title="item.name">{{ item.name }}</span>
                <span class="sub">
                  <span class="artists">{{ item.artists?.join(' / ') || '未知歌手' }}</span>
                </span>
              </span>
              <span class="duration">{{ formatDuration(item.durationMs) }}</span>
            </button>
          </div>
          <button
            v-show="showLocate"
            type="button"
            class="locate-btn"
            title="定位到当前播放"
            @click="locateCurrent"
          >
            <span class="locate-ico" aria-hidden="true" />
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, FolderAdd } from '@element-plus/icons-vue'
import { usePlayerStore, type QueueTrack } from '../stores/player'
import { useUiStore } from '../stores/ui'
import { useUserStore } from '../stores/user'
import { mediaUrl } from '../services/http'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [boolean] }>()

const player = usePlayerStore()
const ui = useUiStore()
const user = useUserStore()
const listRef = ref<HTMLElement | null>(null)
const showLocate = ref(false)
let scrollTimer: ReturnType<typeof setTimeout> | null = null

const canCollectAll = computed(() =>
  player.queue.some((t) => !t.localPath && !t.previewFile && !t.id.startsWith('local:') && !t.id.startsWith('webfile:')),
)

const hasCurrent = computed(
  () => player.currentIndex >= 0 && player.currentIndex < player.queue.length,
)

function isActiveInView() {
  const root = listRef.value
  if (!root || !hasCurrent.value) return true
  const active = root.querySelector(`.row[data-index="${player.currentIndex}"]`) as HTMLElement | null
  if (!active) return true
  const rr = root.getBoundingClientRect()
  const ar = active.getBoundingClientRect()
  // 至少一半行在可视区内才算「可见」
  const visibleTop = Math.max(ar.top, rr.top)
  const visibleBottom = Math.min(ar.bottom, rr.bottom)
  return visibleBottom - visibleTop >= ar.height * 0.5
}

function updateLocateVisible() {
  if (!props.visible || !hasCurrent.value) {
    showLocate.value = false
    return
  }
  showLocate.value = !isActiveInView()
}

function onListScroll() {
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(updateLocateVisible, 80)
}

function locateCurrent() {
  const root = listRef.value
  if (!root || !hasCurrent.value) return
  const active = root.querySelector(`.row[data-index="${player.currentIndex}"]`) as HTMLElement | null
  if (!active) return
  active.scrollIntoView({ block: 'center', behavior: 'smooth' })
  // 滚动结束后再隐藏按钮
  window.setTimeout(updateLocateVisible, 320)
}

watch(
  () => [props.visible, player.currentIndex, player.queue.length] as const,
  async ([vis]) => {
    if (!vis) {
      showLocate.value = false
      return
    }
    await nextTick()
    updateLocateVisible()
  },
)

onBeforeUnmount(() => {
  if (scrollTimer) clearTimeout(scrollTimer)
})

function coverStyle(t: QueueTrack) {
  const u = mediaUrl(t.coverUrl)
  return u
    ? { backgroundImage: `url(${u})` }
    : { backgroundImage: 'linear-gradient(135deg,#f3c4c4,#ec4141)' }
}

function formatDuration(ms?: number) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function collectAll() {
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  const tracks = player.queue.filter(
    (t) => !t.localPath && !t.previewFile && !t.id.startsWith('local:') && !t.id.startsWith('webfile:'),
  )
  if (!tracks.length) {
    ElMessage.warning('当前列表没有可收藏的歌曲')
    return
  }
  ui.openCollectMany(tracks)
}

async function clearAll() {
  if (!player.queue.length) return
  try {
    await ElMessageBox.confirm('确定清空播放列表？', '清空', {
      type: 'warning',
      confirmButtonText: '清空',
      cancelButtonText: '取消',
    })
    player.clearQueue()
    emit('update:visible', false)
  } catch {
    // cancel
  }
}
</script>

<style scoped lang="scss">
.queue-panel {
  position: fixed;
  top: 54px;
  right: 0;
  bottom: var(--wy-player-h);
  width: min(420px, 100vw);
  z-index: 40;
  background: #fff;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.1);
  border-left: 1px solid #eee;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px 14px;
}

.head-left {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #333;
}

.count {
  font-size: 12px;
  color: #999;
  transform: translateY(-4px);
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.act {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #666;
  font-size: 12px;
  cursor: pointer;
  &:hover:not(:disabled) {
    color: #333;
    background: #f5f5f5;
  }
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}

.empty {
  flex: 1;
  display: grid;
  place-items: center;
  color: #bbb;
  font-size: 13px;
}

.list-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 8px 12px;
}

.locate-btn {
  position: absolute;
  right: 18px;
  bottom: 18px;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.16);
  cursor: pointer;
  display: grid;
  place-items: center;
  z-index: 2;
  padding: 0;
  &:hover {
    background: #fafafa;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  }
}

.locate-ico {
  position: relative;
  width: 14px;
  height: 14px;
  border: 2px solid #666;
  border-radius: 50%;
  box-sizing: border-box;
  &::before,
  &::after {
    content: '';
    position: absolute;
    background: #666;
  }
  /* 上下准星 */
  &::before {
    left: 50%;
    top: -5px;
    width: 2px;
    height: 20px;
    transform: translateX(-50%);
  }
  /* 左右准星 */
  &::after {
    top: 50%;
    left: -5px;
    width: 20px;
    height: 2px;
    transform: translateY(-50%);
  }
}

.row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  &:hover {
    background: #f5f5f5;
  }
  &.active {
    background: #f5f5f5;
    .name,
    .artists,
    .duration {
      color: #ec4141;
    }
  }
}

.cover {
  position: relative;
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  border-radius: 4px;
  background-size: cover;
  background-position: center;
  overflow: hidden;
}

.cover-play {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  .iconfont {
    font-size: 18px;
    color: #fff;
    transform: translateX(1px);
  }
}

.meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.name {
  font-size: 14px;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.sub {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.artists {
  font-size: 12px;
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.duration {
  flex-shrink: 0;
  font-size: 12px;
  color: #bbb;
  font-variant-numeric: tabular-nums;
  padding-left: 8px;
}

.queue-slide-enter-active,
.queue-slide-leave-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}
.queue-slide-enter-from,
.queue-slide-leave-to {
  transform: translateX(100%);
  opacity: 0.6;
}
</style>
