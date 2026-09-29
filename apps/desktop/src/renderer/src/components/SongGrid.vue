<template>
  <div ref="rootEl" class="song-grid" :style="gridStyle">
    <div
      v-for="track in displayTracks"
      :key="track.id"
      class="song-row"
      @dblclick="onPlay(track)"
      @contextmenu.prevent="openMenu($event, track)"
    >
      <button class="cover-btn" type="button" :style="coverStyle(track)" @click="onPlay(track)">
        <span class="cover-play">
          <span class="iconfont icon-play" aria-hidden="true" />
        </span>
      </button>

      <div class="meta">
        <div class="name-line">
          <span class="name" :title="track.name">{{ track.name }}</span>
        </div>
        <div class="sub">
          <span v-if="track.liked" class="heart" title="已喜欢">♥</span>
          <span v-if="qualityTag(track)" class="badge badge-sq">{{ qualityTag(track) }}</span>
          <span class="badge badge-origin">原唱</span>
          <span class="artists">{{ track.artists?.join(' / ') || '未知歌手' }}</span>
        </div>
      </div>

      <div class="hover-actions">
        <button type="button" title="下载" class="disabled-act" @click.stop>
          <el-icon><Download /></el-icon>
        </button>
        <button type="button" title="喜欢" @click.stop="onLike(track)">
          <el-icon :color="track.liked ? '#ec4141' : undefined">
            <StarFilled v-if="track.liked" />
            <Star v-else />
          </el-icon>
        </button>
        <button type="button" title="更多" @click.stop="openMenu($event, track)">
          <el-icon><MoreFilled /></el-icon>
        </button>
      </div>
    </div>

    <el-empty v-if="!displayTracks.length" description="暂无歌曲" :image-size="72" />
  </div>

  <Teleport to="body">
    <div
      v-if="menu.visible"
      class="ctx-mask"
      @click="closeMenu"
      @contextmenu.prevent="closeMenu"
    >
      <div class="ctx-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }" @click.stop>
        <button type="button" @click="menu.track && onPlay(menu.track)">播放</button>
        <button type="button" @click="menu.track && onNext(menu.track)">下一首播放</button>
        <button type="button" @click="menu.track && onLike(menu.track)">
          {{ menu.track?.liked ? '取消喜欢' : '喜欢' }}
        </button>
        <button type="button" class="danger" @click="menu.track && onDelete(menu.track)">删除</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, MoreFilled, Star, StarFilled } from '@element-plus/icons-vue'
import type { TrackDto } from '@wy-music/shared'
import { http, mediaUrl } from '../services/http'
import { usePlayerStore } from '../stores/player'
import { useUiStore } from '../stores/ui'
import { useUserStore } from '../stores/user'

const props = withDefaults(
  defineProps<{
    tracks: TrackDto[]
    /** 固定列数；adaptive 时忽略 */
    columns?: number
    /** 按容器宽度自动计算列数，并按行数截取展示数量 */
    adaptive?: boolean
    /** adaptive 时固定行数（网易云风格约 3~4 行） */
    rows?: number
    /** 单项最小宽度，决定能排几列 */
    minItemWidth?: number
    /** 一行最多几首 */
    maxColumns?: number
  }>(),
  {
    columns: 3,
    adaptive: false,
    rows: 3,
    minItemWidth: 280,
    maxColumns: 3
  }
)

const emit = defineEmits<{ refresh: [] }>()
const player = usePlayerStore()
const user = useUserStore()
const ui = useUiStore()

const rootEl = ref<HTMLElement | null>(null)
const measuredCols = ref(props.columns)
let ro: ResizeObserver | null = null

function recomputeCols() {
  if (!props.adaptive) {
    measuredCols.value = Math.min(props.columns, props.maxColumns)
    return
  }
  const w = rootEl.value?.clientWidth || 0
  if (w <= 0) return
  const gap = 20
  const minW = props.minItemWidth
  const maxCols = Math.max(1, props.maxColumns)
  const cols = Math.max(1, Math.min(maxCols, Math.floor((w + gap) / (minW + gap))))
  measuredCols.value = cols
}

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${measuredCols.value}, minmax(0, 1fr))`
}))

const displayTracks = computed(() => {
  if (!props.adaptive) return props.tracks
  const limit = measuredCols.value * props.rows
  return props.tracks.slice(0, limit)
})

onMounted(async () => {
  await nextTick()
  recomputeCols()
  if (typeof ResizeObserver !== 'undefined' && rootEl.value) {
    ro = new ResizeObserver(() => recomputeCols())
    ro.observe(rootEl.value)
  }
  window.addEventListener('resize', recomputeCols)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  window.removeEventListener('resize', recomputeCols)
})

watch(
  () =>
    [props.adaptive, props.columns, props.minItemWidth, props.rows, props.maxColumns] as const,
  () => nextTick(recomputeCols)
)

const menu = reactive<{
  visible: boolean
  x: number
  y: number
  track: TrackDto | null
}>({
  visible: false,
  x: 0,
  y: 0,
  track: null
})

function coverStyle(t: TrackDto) {
  const u = mediaUrl(t.coverUrl)
  return u
    ? { backgroundImage: `url(${u})` }
    : { background: 'linear-gradient(135deg,#f3c4c4,#ec4141)' }
}

function qualityTag(t: TrackDto): string | null {
  // 无码率字段时按体积粗略判断
  const size = Number(t.fileSize || 0)
  const dur = Number(t.durationMs || 0)
  if (size > 0 && dur > 0) {
    const kbps = (size * 8) / (dur / 1000) / 1000
    if (kbps >= 900) return 'Hi-Res'
    if (kbps >= 300) return 'SQ'
    if (kbps >= 180) return 'HQ'
  }
  return null
}

function onPlay(t: TrackDto) {
  closeMenu()
  const list = displayTracks.value.length ? displayTracks.value : props.tracks
  player.playTrack(t, list)
}

function onNext(t: TrackDto) {
  closeMenu()
  player.playNext(t)
  ElMessage.success('已添加到下一首播放')
}

async function onLike(t: TrackDto) {
  closeMenu()
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  try {
    const { data } = await http.post(`/api/likes/${t.id}`)
    t.liked = data.data.liked
    ElMessage.success(t.liked ? '已添加到我喜欢' : '已取消喜欢')
  } catch {
    /* http 拦截器已提示 */
  }
}

async function onDelete(t: TrackDto) {
  closeMenu()
  try {
    await ElMessageBox.confirm(`确定删除「${t.name}」？此操作不可恢复。`, '删除歌曲', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    await http.delete(`/api/tracks/${t.id}`)
    ElMessage.success('已删除')
    emit('refresh')
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return
  }
}

function openMenu(e: MouseEvent, t: TrackDto) {
  menu.track = t
  menu.x = Math.min(e.clientX, window.innerWidth - 180)
  menu.y = Math.min(e.clientY, window.innerHeight - 180)
  menu.visible = true
}

function closeMenu() {
  menu.visible = false
  menu.track = null
}
</script>

<style scoped>
.song-grid {
  display: grid;
  gap: 4px 20px;
  width: 100%;
}

.song-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: default;
  transition: background 0.15s;
}

.song-row:hover {
  background: #f5f5f5;
}

.cover-btn {
  position: relative;
  flex: 0 0 52px;
  width: 52px;
  height: 52px;
  border: none;
  border-radius: 6px;
  padding: 0;
  background-size: cover;
  background-position: center;
  cursor: pointer;
  overflow: hidden;
}

.cover-play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 22px;
  opacity: 0;
  transition: opacity 0.15s;
}

.song-row:hover .cover-play {
  opacity: 1;
}

.meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.name-line {
  min-width: 0;
}

.name {
  display: block;
  font-size: 14px;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sub {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  color: #999;
}

.heart {
  color: #ec4141;
  font-size: 12px;
  line-height: 1;
  flex-shrink: 0;
}

.badge {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 2px;
  font-weight: 600;
}

.badge-sq {
  color: #c8a45c;
  border: 1px solid rgba(200, 164, 92, 0.55);
  background: rgba(200, 164, 92, 0.08);
}

.badge-origin {
  color: #ec4141;
  border: 1px solid rgba(236, 65, 65, 0.45);
  background: rgba(236, 65, 65, 0.06);
}

.artists {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hover-actions {
  display: none;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.song-row:hover .hover-actions {
  display: flex;
}

.hover-actions button {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #666;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.hover-actions button:hover {
  background: #ebebeb;
  color: #333;
}

.disabled-act {
  opacity: 0.35;
  cursor: not-allowed !important;
}

.ctx-mask {
  position: fixed;
  inset: 0;
  z-index: 9999;
}

.ctx-menu {
  position: fixed;
  min-width: 148px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.16);
  padding: 6px;
  display: flex;
  flex-direction: column;
}

.ctx-menu button {
  border: none;
  background: transparent;
  text-align: left;
  padding: 9px 12px;
  border-radius: 6px;
  font-size: 13px;
  color: #333;
  cursor: pointer;
}

.ctx-menu button:hover {
  background: #f5f5f5;
}

.ctx-menu button.danger {
  color: #ec4141;
}
</style>
