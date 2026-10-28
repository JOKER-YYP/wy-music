<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="ctx-mask"
      @click="emit('close')"
      @contextmenu.prevent="emit('close')"
    >
      <ul
        class="ctx-menu"
        :style="{ left: x + 'px', top: y + 'px' }"
        @click.stop
      >
        <li @click="emitAction('play')">
          <span class="iconfont icon-play ctx-ico" aria-hidden="true" />
          <span>播放</span>
        </li>
        <li @click="emitAction('next')">
          <span class="iconfont icon-next ctx-ico" aria-hidden="true" />
          <span>下一首播放</span>
        </li>
        <li @click="emitAction('comments')">
          <el-icon><ChatDotRound /></el-icon>
          <span>查看评论</span>
        </li>
        <li class="sep" />
        <li @click="emitAction('collect')">
          <el-icon><FolderAdd /></el-icon>
          <span>收藏</span>
        </li>
        <li @click="emitAction('like')">
          <el-icon>
            <StarFilled v-if="track?.liked" />
            <Star v-else />
          </el-icon>
          <span>{{ track?.liked ? '取消喜欢' : '喜欢' }}</span>
        </li>
        <li @click="emitAction('download')">
          <el-icon><Download /></el-icon>
          <span>{{ isExternal ? '下载…' : '下载到本地' }}</span>
        </li>
        <li @click="emitAction('copy')">
          <el-icon><Link /></el-icon>
          <span>复制链接</span>
        </li>
        <li v-if="allowRemove || allowDelete" class="sep" />
        <li v-if="allowRemove" class="danger" @click="emitAction('remove')">
          <el-icon><Remove /></el-icon>
          <span>从歌单中删除</span>
        </li>
        <li v-if="allowDelete" class="danger" @click="emitAction('delete')">
          <el-icon><Delete /></el-icon>
          <span>删除</span>
        </li>
      </ul>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {
  ChatDotRound,
  Delete,
  Download,
  FolderAdd,
  Link,
  Remove,
  Star,
  StarFilled,
} from '@element-plus/icons-vue'
import { computed } from 'vue'
import type { TrackDto } from '@wy-music/shared'
import { isExternalTrack } from '../services/trackDownload'

const props = defineProps<{
  visible: boolean
  x: number
  y: number
  track: TrackDto | null
  allowDelete?: boolean
  allowRemove?: boolean
}>()

const emit = defineEmits<{
  close: []
  action: [action: string]
}>()

const isExternal = computed(() => (props.track ? isExternalTrack(props.track) : false))

function emitAction(action: string) {
  emit('action', action)
}
</script>

<style scoped lang="scss">
.ctx-mask {
  position: fixed;
  inset: 0;
  z-index: 2200;
}
.ctx-menu {
  position: fixed;
  margin: 0;
  padding: 6px;
  list-style: none;
  min-width: 176px;
  background: var(--wy-surface);
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.16);
  border: 1px solid #eee;
  li {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 36px;
    padding: 0 12px;
    border-radius: 6px;
    font-size: 13px;
    color: var(--wy-text);
    cursor: pointer;
    .el-icon,
    .ctx-ico {
      font-size: 16px;
      color: var(--wy-text-secondary);
      width: 16px;
      text-align: center;
    }
    &:hover:not(.sep):not(.disabled) {
      background: var(--wy-surface-muted);
    }
    &.sep {
      height: 1px;
      padding: 0;
      margin: 6px 4px;
      background: #eee;
      cursor: default;
    }
    &.disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    &.danger {
      color: var(--wy-brand);
      .el-icon {
        color: var(--wy-brand);
      }
    }
  }
}
</style>
